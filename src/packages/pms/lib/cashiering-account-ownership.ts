/**
 * Account charge ownership for Source Folios and Charges.
 * A profile or reservation link is not ownership. Payments are not allocated
 * onto source folios. Direct account charges do not use the guest tax engine;
 * this reader only displays rows that were already posted.
 */

export type OwnershipLedgerRow = {
  id: string;
  accountId: string | null;
  folioId: string | null;
  type: string;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  originalTransactionId: string | null;
  postedByMembershipId: string | null;
  quantity: number | null;
  unitAmount: number | null;
};

export type InvoiceCoverageHit = {
  sourceGroupId: string;
  componentTransactionId: string;
  invoiceId: string;
  invoiceNumber: string;
};

export type AccountNoteHit = {
  sourceGroupId: string;
  noteType: "credit" | "debit";
  amount: number;
};

export type ChargeCoverage = "uninvoiced" | "in_draft" | "partial" | "invoiced";

export type ChargeComponentKind = "parent" | "tax" | "service_charge";

export type AccountChargeComponent = {
  id: string;
  kind: ChargeComponentKind;
  description: string;
  postedAmount: number;
  returnedAmount: number;
  correctedAmount: number;
  remainingAmount: number;
};

export type AccountChargeGroup = {
  chargeGroupId: string;
  sourceKind: "transferred" | "direct";
  sourceFolioId: string | null;
  postedAt: string;
  lastActivityAt: string;
  description: string;
  category: string;
  quantity: number | null;
  unitAmount: number | null;
  parentAmount: number;
  taxAmount: number;
  serviceAmount: number;
  /** Posted account-owned gross before returns and corrections. */
  grossAmount: number;
  transferredInAmount: number;
  returnedAmount: number;
  correctedAmount: number;
  /** Ledger amount still owned. Unallocated payments are not subtracted. */
  remainingAmount: number;
  coverage: ChargeCoverage;
  invoiceId: string | null;
  invoiceNumber: string | null;
  creditAmount: number;
  debitAmount: number;
  actorMembershipId: string | null;
  /** Direct charge parent. Correction and return writers only accept a charge id. */
  correctionSourceId: string | null;
  components: AccountChargeComponent[];
};

export type ChargeCapabilities = {
  canView: boolean;
  canCorrect: boolean;
  canReturnToGuest: boolean;
  canViewInvoice: boolean;
  canViewSourceFolio: boolean;
};

export type SourceFolioScope = "current" | "history";

export type SourceFolioRollup = {
  sourceFolioId: string;
  transferredInGross: number;
  returnedToGuestGross: number;
  accountOwnedRemaining: number;
  chargeGroupCount: number;
  invoicedGroupCount: number;
  uninvoicedGroupCount: number;
  coverage: "uninvoiced" | "partial" | "invoiced";
  lastTransferAt: string | null;
  lastActivityAt: string | null;
};

export type SourceFolioContext = {
  folioNumber: string;
  guestId: string | null;
  guestName: string | null;
  reservationId: string | null;
  reservationNumber: string | null;
  roomNumber: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  folioStatus: "open" | "closed";
  stayStatus: string | null;
};

export type SourceFolioRow = SourceFolioRollup & SourceFolioContext;

export type SourceFolioQuery = {
  search?: string;
  stay?: "all" | "in_house" | "checked_out" | "folio_open" | "folio_closed";
  coverage?: "all" | "invoiced" | "partial" | "uninvoiced";
  scope?: SourceFolioScope;
  sort?: "recent" | "guest" | "arrival" | "departure" | "owned";
  page?: number;
  pageSize?: number;
};

export type ChargeQuery = {
  search?: string;
  source?: "all" | "transferred" | "direct";
  coverage?: "all" | "uninvoiced" | "invoiced" | "partial";
  sourceFolioId?: string | null;
  from?: string | null;
  to?: string | null;
  sort?: "newest" | "oldest" | "amount" | "remaining";
  page?: number;
  pageSize?: number;
};

export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

type Bucket = {
  chargeGroupId: string;
  sourceKind: "transferred" | "direct";
  sourceFolioId: string | null;
  description: string;
  category: string;
  quantity: number | null;
  unitAmount: number | null;
  postedAt: string;
  lastActivityAt: string;
  actorMembershipId: string | null;
  correctionSourceId: string | null;
  components: AccountChargeComponent[];
};

export function roundOwnershipMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isChildCategory(category: string): boolean {
  return category === "tax" || category === "service_charge";
}

function kindFor(category: string): ChargeComponentKind {
  if (category === "tax") return "tax";
  if (category === "service_charge") return "service_charge";
  return "parent";
}

function later(a: string, b: string): string {
  return a > b ? a : b;
}

function earlier(a: string, b: string): string {
  return a < b ? a : b;
}

function movedAmount(
  rows: readonly OwnershipLedgerRow[],
  accountId: string,
  sourceId: string,
  types: ReadonlyArray<string>,
): { total: number; lastAt: string | null } {
  let total = 0;
  let lastAt: string | null = null;
  for (const row of rows) {
    if (row.accountId !== accountId || row.originalTransactionId !== sourceId) continue;
    if (!types.includes(row.type)) continue;
    if (row.type === "adjustment" && row.amount >= 0) continue;
    total += Math.abs(row.amount);
    lastAt = lastAt ? later(lastAt, row.postedAt) : row.postedAt;
  }
  return { total: roundOwnershipMoney(total), lastAt };
}

function coverageFor(
  components: readonly AccountChargeComponent[],
  coveredIds: ReadonlySet<string>,
  inDraft: boolean,
): ChargeCoverage {
  const active = components.filter(
    (component) => component.remainingAmount > 0.009 || coveredIds.has(component.id),
  );
  if (active.length === 0) return "uninvoiced";
  const covered = active.filter((component) => coveredIds.has(component.id)).length;
  if (covered === 0) return inDraft ? "in_draft" : "uninvoiced";
  if (covered === active.length) return "invoiced";
  return "partial";
}

function groupKey(origin: OwnershipLedgerRow | undefined): string | null {
  if (!origin || origin.type !== "charge") return null;
  if (isChildCategory(origin.category)) return origin.originalTransactionId;
  return origin.id;
}

export function buildAccountChargeGroups(input: {
  accountId: string;
  rows: readonly OwnershipLedgerRow[];
  coverage?: readonly InvoiceCoverageHit[];
  draftGroupIds?: readonly string[];
  notes?: readonly AccountNoteHit[];
}): AccountChargeGroup[] {
  const byId = new Map(input.rows.map((row) => [row.id, row]));
  const drafts = new Set(input.draftGroupIds ?? []);
  const coveredByComponent = new Map<string, InvoiceCoverageHit>();
  for (const hit of input.coverage ?? []) {
    if (!coveredByComponent.has(hit.componentTransactionId)) {
      coveredByComponent.set(hit.componentTransactionId, hit);
    }
  }
  const buckets = new Map<string, Bucket>();

  function touch(bucket: Bucket, postedAt: string) {
    bucket.postedAt = earlier(bucket.postedAt, postedAt);
    bucket.lastActivityAt = later(bucket.lastActivityAt, postedAt);
  }

  function addComponent(
    bucket: Bucket,
    component: AccountChargeComponent,
    postedAt: string,
    actor: string | null,
  ) {
    const existing = bucket.components.find((item) => item.id === component.id);
    if (existing) {
      existing.postedAmount = roundOwnershipMoney(existing.postedAmount + component.postedAmount);
      existing.returnedAmount = roundOwnershipMoney(
        existing.returnedAmount + component.returnedAmount,
      );
      existing.correctedAmount = roundOwnershipMoney(
        existing.correctedAmount + component.correctedAmount,
      );
      existing.remainingAmount = roundOwnershipMoney(
        existing.remainingAmount + component.remainingAmount,
      );
    } else {
      bucket.components.push(component);
    }
    touch(bucket, postedAt);
    if (!bucket.actorMembershipId && actor) bucket.actorMembershipId = actor;
  }

  for (const row of input.rows) {
    if (row.accountId !== input.accountId || row.type !== "charge") continue;
    if (isChildCategory(row.category)) continue;
    buckets.set(row.id, {
      chargeGroupId: row.id,
      sourceKind: "direct",
      sourceFolioId: null,
      description: row.description,
      category: row.category,
      quantity: row.quantity,
      unitAmount: row.unitAmount,
      postedAt: row.postedAt,
      lastActivityAt: row.postedAt,
      actorMembershipId: row.postedByMembershipId,
      correctionSourceId: row.id,
      components: [],
    });
  }

  for (const row of input.rows) {
    if (row.accountId !== input.accountId || row.type !== "charge") continue;
    if (!isChildCategory(row.category) || !row.originalTransactionId) continue;
    const bucket = buckets.get(row.originalTransactionId);
    if (!bucket) continue;
    const returned = movedAmount(input.rows, input.accountId, row.id, ["transfer_out"]);
    const corrected = movedAmount(input.rows, input.accountId, row.id, ["discount", "adjustment"]);
    const remaining = roundOwnershipMoney(
      Math.max(row.amount - returned.total - corrected.total, 0),
    );
    addComponent(
      bucket,
      {
        id: row.id,
        kind: kindFor(row.category),
        description: row.description,
        postedAmount: roundOwnershipMoney(row.amount),
        returnedAmount: returned.total,
        correctedAmount: corrected.total,
        remainingAmount: remaining,
      },
      row.postedAt,
      row.postedByMembershipId,
    );
    if (returned.lastAt) touch(bucket, returned.lastAt);
    if (corrected.lastAt) touch(bucket, corrected.lastAt);
  }

  for (const row of input.rows) {
    if (
      row.accountId !== input.accountId ||
      row.type !== "charge" ||
      isChildCategory(row.category)
    ) {
      continue;
    }
    const bucket = buckets.get(row.id);
    if (!bucket) continue;
    const returned = movedAmount(input.rows, input.accountId, row.id, ["transfer_out"]);
    const corrected = movedAmount(input.rows, input.accountId, row.id, ["discount", "adjustment"]);
    const remaining = roundOwnershipMoney(
      Math.max(row.amount - returned.total - corrected.total, 0),
    );
    addComponent(
      bucket,
      {
        id: row.id,
        kind: "parent",
        description: row.description,
        postedAmount: roundOwnershipMoney(row.amount),
        returnedAmount: returned.total,
        correctedAmount: corrected.total,
        remainingAmount: remaining,
      },
      row.postedAt,
      row.postedByMembershipId,
    );
    if (returned.lastAt) touch(bucket, returned.lastAt);
    if (corrected.lastAt) touch(bucket, corrected.lastAt);
    const parent = bucket.components.find((component) => component.kind === "parent");
    if (parent && parent.remainingAmount + 0.009 < parent.postedAmount) {
      bucket.quantity = null;
      bucket.unitAmount = null;
    }
  }

  for (const row of input.rows) {
    if (row.accountId !== input.accountId || row.type !== "transfer_in") continue;
    const origin = row.originalTransactionId ? byId.get(row.originalTransactionId) : undefined;
    const key = groupKey(origin);
    if (!key || !origin) continue;
    const parent = byId.get(key);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        chargeGroupId: key,
        sourceKind: "transferred",
        sourceFolioId: parent?.folioId ?? origin.folioId,
        description: parent?.description ?? origin.description,
        category: parent?.category ?? origin.category,
        quantity: parent?.quantity ?? null,
        unitAmount: parent?.unitAmount ?? null,
        postedAt: row.postedAt,
        lastActivityAt: row.postedAt,
        actorMembershipId: row.postedByMembershipId,
        correctionSourceId: null,
        components: [],
      };
      buckets.set(key, bucket);
    }
    const returned = movedAmount(input.rows, input.accountId, row.id, ["transfer_out"]);
    const corrected = movedAmount(input.rows, input.accountId, row.id, ["discount", "adjustment"]);
    const remaining = roundOwnershipMoney(Math.max(row.amount - returned.total, 0));
    addComponent(
      bucket,
      {
        id: row.id,
        kind: kindFor(origin.category),
        description: origin.description || row.description,
        postedAmount: roundOwnershipMoney(row.amount),
        returnedAmount: returned.total,
        correctedAmount: corrected.total,
        remainingAmount: remaining,
      },
      row.postedAt,
      row.postedByMembershipId,
    );
    if (returned.lastAt) touch(bucket, returned.lastAt);
  }

  const notesByGroup = new Map<string, { credit: number; debit: number }>();
  for (const note of input.notes ?? []) {
    const current = notesByGroup.get(note.sourceGroupId) ?? { credit: 0, debit: 0 };
    if (note.noteType === "debit") current.debit += note.amount;
    else current.credit += note.amount;
    notesByGroup.set(note.sourceGroupId, current);
  }

  return [...buckets.values()]
    .map((bucket) => {
      const parentAmount = roundOwnershipMoney(
        bucket.components
          .filter((component) => component.kind === "parent")
          .reduce((sum, component) => sum + component.postedAmount, 0),
      );
      const taxAmount = roundOwnershipMoney(
        bucket.components
          .filter((component) => component.kind === "tax")
          .reduce((sum, component) => sum + component.postedAmount, 0),
      );
      const serviceAmount = roundOwnershipMoney(
        bucket.components
          .filter((component) => component.kind === "service_charge")
          .reduce((sum, component) => sum + component.postedAmount, 0),
      );
      const grossAmount = roundOwnershipMoney(parentAmount + taxAmount + serviceAmount);
      const returnedAmount = roundOwnershipMoney(
        bucket.components.reduce((sum, component) => sum + component.returnedAmount, 0),
      );
      const correctedAmount = roundOwnershipMoney(
        bucket.components.reduce((sum, component) => sum + component.correctedAmount, 0),
      );
      const remainingAmount = roundOwnershipMoney(
        bucket.components.reduce((sum, component) => sum + component.remainingAmount, 0),
      );
      const coveredIds = new Set(
        bucket.components
          .filter((component) => coveredByComponent.has(component.id))
          .map((component) => component.id),
      );
      const invoice = bucket.components
        .map((component) => coveredByComponent.get(component.id))
        .find((hit) => hit);
      const note = notesByGroup.get(bucket.chargeGroupId) ?? { credit: 0, debit: 0 };
      const parent = bucket.components.find((component) => component.kind === "parent");
      if (
        bucket.sourceKind === "transferred" &&
        parent &&
        parent.remainingAmount + 0.009 < parent.postedAmount
      ) {
        bucket.quantity = null;
        bucket.unitAmount = null;
      }
      return {
        chargeGroupId: bucket.chargeGroupId,
        sourceKind: bucket.sourceKind,
        sourceFolioId: bucket.sourceFolioId,
        postedAt: bucket.postedAt,
        lastActivityAt: bucket.lastActivityAt,
        description: bucket.description,
        category: bucket.category,
        quantity: bucket.quantity,
        unitAmount: bucket.unitAmount,
        parentAmount,
        taxAmount,
        serviceAmount,
        grossAmount,
        transferredInAmount: bucket.sourceKind === "transferred" ? grossAmount : 0,
        returnedAmount,
        correctedAmount,
        remainingAmount,
        coverage: coverageFor(bucket.components, coveredIds, drafts.has(bucket.chargeGroupId)),
        invoiceId: invoice?.invoiceId ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
        creditAmount: roundOwnershipMoney(note.credit),
        debitAmount: roundOwnershipMoney(note.debit),
        actorMembershipId: bucket.actorMembershipId,
        correctionSourceId: bucket.correctionSourceId,
        components: bucket.components,
      } satisfies AccountChargeGroup;
    })
    .sort((a, b) => (a.postedAt < b.postedAt ? 1 : a.postedAt > b.postedAt ? -1 : 0));
}

/**
 * Default Source Folios are current ownership: remaining ledger value from that folio.
 * Fully returned folios stay out of the default list and appear only in history.
 */
export function rollupSourceFolios(
  groups: readonly AccountChargeGroup[],
  scope: SourceFolioScope = "current",
): SourceFolioRollup[] {
  const byFolio = new Map<string, AccountChargeGroup[]>();
  for (const group of groups) {
    if (group.sourceKind !== "transferred" || !group.sourceFolioId) continue;
    const current = byFolio.get(group.sourceFolioId) ?? [];
    current.push(group);
    byFolio.set(group.sourceFolioId, current);
  }
  const rows: SourceFolioRollup[] = [];
  for (const [sourceFolioId, folioGroups] of byFolio) {
    const visible =
      scope === "history"
        ? folioGroups
        : folioGroups.filter((group) => group.remainingAmount > 0.009);
    if (visible.length === 0) continue;
    const invoicedGroupCount = visible.filter((group) => group.coverage === "invoiced").length;
    const uninvoicedGroupCount = visible.filter(
      (group) => group.coverage === "uninvoiced" || group.coverage === "in_draft",
    ).length;
    const coverage: SourceFolioRollup["coverage"] =
      invoicedGroupCount === visible.length
        ? "invoiced"
        : invoicedGroupCount === 0 && uninvoicedGroupCount === visible.length
          ? "uninvoiced"
          : "partial";
    rows.push({
      sourceFolioId,
      transferredInGross: roundOwnershipMoney(
        visible.reduce((sum, group) => sum + group.transferredInAmount, 0),
      ),
      returnedToGuestGross: roundOwnershipMoney(
        visible.reduce((sum, group) => sum + group.returnedAmount, 0),
      ),
      accountOwnedRemaining: roundOwnershipMoney(
        visible.reduce((sum, group) => sum + group.remainingAmount, 0),
      ),
      chargeGroupCount: visible.length,
      invoicedGroupCount,
      uninvoicedGroupCount,
      coverage,
      lastTransferAt: visible.reduce<string | null>(
        (latest, group) => (latest ? later(latest, group.postedAt) : group.postedAt),
        null,
      ),
      lastActivityAt: visible.reduce<string | null>(
        (latest, group) => (latest ? later(latest, group.lastActivityAt) : group.lastActivityAt),
        null,
      ),
    });
  }
  return rows.sort((a, b) =>
    (a.lastActivityAt ?? "") < (b.lastActivityAt ?? "")
      ? 1
      : (a.lastActivityAt ?? "") > (b.lastActivityAt ?? "")
        ? -1
        : 0,
  );
}

export function currentSourceFolioIds(groups: readonly AccountChargeGroup[]): string[] {
  return rollupSourceFolios(groups, "current").map((row) => row.sourceFolioId);
}

export function chargeCapabilities(input: {
  role: string;
  accountStatus: "open" | "closed";
  group: Pick<
    AccountChargeGroup,
    | "sourceKind"
    | "remainingAmount"
    | "coverage"
    | "invoiceId"
    | "sourceFolioId"
    | "correctionSourceId"
  >;
}): ChargeCapabilities {
  const manage = input.role === "owner" || input.role === "manager";
  const open = input.accountStatus === "open";
  const blocked = input.group.coverage === "invoiced" || input.group.coverage === "partial";
  const mutable =
    manage &&
    open &&
    !blocked &&
    input.group.remainingAmount > 0.009 &&
    input.group.sourceKind === "direct";
  return {
    canView: true,
    canCorrect: mutable && Boolean(input.group.correctionSourceId),
    canReturnToGuest: mutable && Boolean(input.group.correctionSourceId),
    canViewInvoice: Boolean(input.group.invoiceId),
    canViewSourceFolio: Boolean(input.group.sourceFolioId),
  };
}

function pageSizeOf(value: number | undefined): number {
  if (value === 25 || value === 50) return value;
  return 10;
}

function pageOf(value: number | undefined, pageCount: number): number {
  const page = value && value > 0 ? Math.floor(value) : 1;
  return Math.min(page, pageCount);
}

function paginate<T>(
  rows: readonly T[],
  page: number | undefined,
  size: number | undefined,
): Paged<T> {
  const pageSize = pageSizeOf(size);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = pageOf(page, pageCount);
  const start = (current - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total: rows.length, page: current, pageSize };
}

function includes(value: string | null | undefined, term: string): boolean {
  return (value ?? "").toLowerCase().includes(term);
}

export function querySourceFolios(
  rows: readonly SourceFolioRow[],
  query: SourceFolioQuery = {},
): Paged<SourceFolioRow> {
  const term = (query.search ?? "").trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (query.stay === "in_house" && row.stayStatus !== "checked_in") return false;
    if (query.stay === "checked_out" && row.stayStatus !== "checked_out") return false;
    if (query.stay === "folio_open" && row.folioStatus !== "open") return false;
    if (query.stay === "folio_closed" && row.folioStatus !== "closed") return false;
    if (query.coverage && query.coverage !== "all" && row.coverage !== query.coverage) return false;
    if (!term) return true;
    return (
      includes(row.folioNumber, term) ||
      includes(row.guestName, term) ||
      includes(row.reservationNumber, term) ||
      includes(row.roomNumber, term)
    );
  });
  const sort = query.sort ?? "recent";
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "guest") return (a.guestName ?? "").localeCompare(b.guestName ?? "");
    if (sort === "arrival") return (a.arrivalDate ?? "").localeCompare(b.arrivalDate ?? "");
    if (sort === "departure") return (a.departureDate ?? "").localeCompare(b.departureDate ?? "");
    if (sort === "owned") return b.accountOwnedRemaining - a.accountOwnedRemaining;
    return (a.lastActivityAt ?? "") < (b.lastActivityAt ?? "") ? 1 : -1;
  });
  return paginate(sorted, query.page, query.pageSize);
}

export type ChargeListRow = AccountChargeGroup & {
  guestName: string | null;
  folioNumber: string | null;
  actorName: string | null;
};

export function queryChargeGroups(
  rows: readonly ChargeListRow[],
  query: ChargeQuery = {},
): Paged<ChargeListRow> {
  const term = (query.search ?? "").trim().toLowerCase();
  const from = query.from?.trim() || null;
  const to = query.to?.trim() || null;
  const filtered = rows.filter((row) => {
    if (query.source === "transferred" && row.sourceKind !== "transferred") return false;
    if (query.source === "direct" && row.sourceKind !== "direct") return false;
    if (query.coverage === "invoiced" && row.coverage !== "invoiced") return false;
    if (query.coverage === "partial" && row.coverage !== "partial") return false;
    if (
      query.coverage === "uninvoiced" &&
      row.coverage !== "uninvoiced" &&
      row.coverage !== "in_draft"
    ) {
      return false;
    }
    if (query.sourceFolioId && row.sourceFolioId !== query.sourceFolioId) return false;
    const day = row.postedAt.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (!term) return true;
    return (
      includes(row.description, term) ||
      includes(row.guestName, term) ||
      includes(row.folioNumber, term)
    );
  });
  const sort = query.sort ?? "newest";
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "oldest") return a.postedAt < b.postedAt ? -1 : 1;
    if (sort === "amount") return b.grossAmount - a.grossAmount;
    if (sort === "remaining") return b.remainingAmount - a.remainingAmount;
    return a.postedAt < b.postedAt ? 1 : -1;
  });
  return paginate(sorted, query.page, query.pageSize);
}

export function visibleChargeGroups(
  groups: readonly AccountChargeGroup[],
  scope: SourceFolioScope = "current",
): AccountChargeGroup[] {
  if (scope === "history") return [...groups];
  return groups.filter(
    (group) =>
      group.remainingAmount > 0.009 ||
      group.coverage === "invoiced" ||
      group.coverage === "partial",
  );
}

export function ownershipSummary(groups: readonly AccountChargeGroup[]): {
  currentOwned: number;
  transferredIn: number;
  returned: number;
  invoicedGroups: number;
  uninvoicedGroups: number;
} {
  const visible = visibleChargeGroups(groups, "current");
  return {
    currentOwned: roundOwnershipMoney(
      visible.reduce((sum, group) => sum + group.remainingAmount, 0),
    ),
    transferredIn: roundOwnershipMoney(
      visible.reduce((sum, group) => sum + group.transferredInAmount, 0),
    ),
    returned: roundOwnershipMoney(visible.reduce((sum, group) => sum + group.returnedAmount, 0)),
    invoicedGroups: visible.filter((group) => group.coverage === "invoiced").length,
    uninvoicedGroups: visible.filter(
      (group) => group.coverage === "uninvoiced" || group.coverage === "in_draft",
    ).length,
  };
}
