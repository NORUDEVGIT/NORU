/**
 * Financial-account history and statement.
 *
 * History is the business timeline, including document events that do not
 * move the ledger. The statement is only balance-affecting ledger movement.
 * Dates are property-local calendar boundaries, not Night Audit business dates
 * and not UTC date prefixes.
 */

import { propertyCalendarDate, propertyDayBounds } from "./cashiering-control.ts";

export type AccountLedgerRow = {
  id: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  postedByMembershipId?: string | null;
  actorName?: string | null;
  paymentMethod?: string | null;
  originalTransactionId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  transferId?: string | null;
  shiftId?: string | null;
  currency?: string | null;
};

export type LedgerEventType =
  | "charge"
  | "transfer_in"
  | "transfer_out"
  | "payment"
  | "deposit"
  | "refund"
  | "discount"
  | "write_off"
  | "correction"
  | "credit_note"
  | "adjustment";

export type AccountLedgerGroup = {
  eventId: string;
  eventType: LedgerEventType;
  occurredAt: string;
  title: string;
  description: string;
  amount: number;
  actorId: string | null;
  actorName: string | null;
  paymentMethod: string | null;
  shiftId: string | null;
  originalTransactionId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  transferId: string | null;
  category: string;
  componentIds: string[];
  breakdown: Array<{ label: string; amount: number }>;
  currencyMismatch: boolean;
};

export type AccountHistoryEventType =
  | LedgerEventType
  | "account_opened"
  | "account_closed"
  | "invoice_issued"
  | "credit_note_issued"
  | "debit_note_issued"
  | "payment_allocated"
  | "allocation_reversed";

/** Informational settlement events. They are not statement lines. */
export type AccountHistoryAllocation = {
  id: string;
  amount: number;
  occurredAt: string;
  actorMembershipId: string | null;
  paymentTransactionId: string;
  paymentMethod: string | null;
  invoiceId: string;
  invoiceNumber: string;
  reason: string | null;
};

export type AccountHistoryFilter =
  | "all"
  | "charges"
  | "transfers"
  | "payments"
  | "refunds"
  | "write_offs"
  | "corrections"
  | "documents"
  | "account";

export type AccountHistoryDocument = {
  id: string;
  documentType: "invoice" | "credit_note" | "debit_note";
  number: string;
  amount: number;
  issuedAt: string;
  issuedByMembershipId: string | null;
};

export type AccountHistoryClose = {
  id: string;
  occurredAt: string;
  actorMembershipId: string | null;
};

export type AccountHistoryActor = {
  name: string | null;
  role?: string | null;
};

export type AccountHistoryFolio = {
  id: string;
  number: string;
  guestName: string | null;
};

export type AccountHistoryEvent = {
  eventId: string;
  eventType: AccountHistoryEventType;
  occurredAt: string;
  title: string;
  description: string;
  amount: number | null;
  affectsBalance: boolean;
  actor: { id: string | null; name: string; role: string | null };
  folio: AccountHistoryFolio | null;
  document: { type: "invoice" | "credit_note" | "debit_note"; id: string; number: string } | null;
  payment: {
    method: string | null;
    cashierShiftId: string | null;
    originalEventId: string | null;
  } | null;
  relatedTransactionIds: string[];
  breakdown: Array<{ label: string; amount: number }>;
  currencyMismatch: boolean;
};

export type AccountHistoryQuery = {
  from?: string | null;
  to?: string | null;
  eventType?: AccountHistoryFilter;
  actorId?: string | null;
  sourceFolioId?: string | null;
  documentNumber?: string | null;
  paymentMethod?: string | null;
  search?: string | null;
  sort?: "newest" | "oldest";
  page?: number;
  pageSize?: number;
  timezone: string;
};

export type AccountStatementLine = {
  eventId: string;
  eventType: LedgerEventType;
  occurredAt: string;
  title: string;
  description: string;
  source: string | null;
  folioId: string | null;
  documentId: string | null;
  documentType: "credit_note" | "debit_note" | "invoice" | null;
  transactionId: string | null;
  increase: number | null;
  decrease: number | null;
  amount: number;
  runningBalance: number;
};

export type AccountStatement = {
  fromDate: string;
  toDate: string;
  timezone: string;
  openingBalance: number;
  closingBalance: number;
  increases: number;
  decreases: number;
  netMovement: number;
  totals: {
    charges: number;
    transfersIn: number;
    transfersOut: number;
    payments: number;
    deposits: number;
    refunds: number;
    discounts: number;
    writeOffs: number;
    otherAdjustments: number;
  };
  lines: AccountStatementLine[];
  reconciled: boolean;
  activityAfterClose: boolean;
  currencyMismatch: boolean;
  invalidRange: boolean;
};

const CORRECTION_REFERENCES = new Set([
  "charge_discount",
  "charge_reversal",
  "charge_quantity",
  "charge_adjustment",
]);

export function roundHistoryMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isTaxChild(row: AccountLedgerRow): boolean {
  return (
    row.type === "charge" &&
    (row.category === "tax" || row.category === "service_charge") &&
    Boolean(row.originalTransactionId)
  );
}

function earliest(rows: readonly AccountLedgerRow[]): string {
  return rows.map((row) => row.postedAt).sort()[0] ?? "";
}

function sumAmount(rows: readonly AccountLedgerRow[]): number {
  return roundHistoryMoney(rows.reduce((total, row) => total + row.amount, 0));
}

function firstActor(rows: readonly AccountLedgerRow[]): { id: string | null; name: string | null } {
  const row = rows.find((item) => item.postedByMembershipId || item.actorName);
  return {
    id: row?.postedByMembershipId ?? null,
    name: row?.actorName ?? null,
  };
}

function mismatch(rows: readonly AccountLedgerRow[], currency: string | null | undefined): boolean {
  if (!currency) return false;
  return rows.some((row) => row.currency && row.currency.toUpperCase() !== currency.toUpperCase());
}

function breakdownLabel(row: AccountLedgerRow): string {
  if (row.category === "tax") return "Tax";
  if (row.category === "service_charge") return "Service";
  if (row.type === "charge" && !isTaxChild(row)) return "Base";
  return row.description || row.category || row.type;
}

function correctionTitle(referenceType: string | null): {
  eventType: LedgerEventType;
  title: string;
} {
  if (referenceType === "charge_discount")
    return { eventType: "discount", title: "Discount applied" };
  if (referenceType === "charge_reversal") {
    return { eventType: "correction", title: "Reverse remaining charge" };
  }
  return { eventType: "correction", title: "Charge correction" };
}

function groupOf(
  eventId: string,
  eventType: LedgerEventType,
  title: string,
  rows: AccountLedgerRow[],
  currency: string | null | undefined,
  description?: string,
): AccountLedgerGroup {
  const actor = firstActor(rows);
  const primary = [...rows].sort((a, b) => (a.postedAt < b.postedAt ? -1 : 1))[0];
  return {
    eventId,
    eventType,
    occurredAt: earliest(rows),
    title,
    description: description ?? primary?.description ?? title,
    amount: sumAmount(rows),
    actorId: actor.id,
    actorName: actor.name,
    paymentMethod: rows.find((row) => row.paymentMethod)?.paymentMethod ?? null,
    shiftId: rows.find((row) => row.shiftId)?.shiftId ?? null,
    originalTransactionId: primary?.originalTransactionId ?? null,
    referenceType: primary?.referenceType ?? null,
    referenceId: primary?.referenceId ?? null,
    transferId: primary?.transferId ?? null,
    category: primary?.category ?? "",
    componentIds: rows.map((row) => row.id),
    breakdown: rows.map((row) => ({
      label: breakdownLabel(row),
      amount: roundHistoryMoney(row.amount),
    })),
    currencyMismatch: mismatch(rows, currency),
  };
}

/** One business row per charge group, transfer, payment, refund, write-off, or correction. */
export function groupAccountLedger(
  rows: readonly AccountLedgerRow[],
  currency?: string | null,
): AccountLedgerGroup[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const consumed = new Set<string>();
  const groups: AccountLedgerGroup[] = [];

  for (const row of rows) {
    if (consumed.has(row.id) || row.type !== "charge" || isTaxChild(row)) continue;
    const children = rows.filter(
      (child) => isTaxChild(child) && child.originalTransactionId === row.id && byId.has(child.id),
    );
    const members = [row, ...children];
    for (const member of members) consumed.add(member.id);
    groups.push(groupOf(`tx:${row.id}`, "charge", "Charge", members, currency, row.description));
  }

  for (const row of rows) {
    if (consumed.has(row.id) || row.type !== "charge") continue;
    consumed.add(row.id);
    groups.push(groupOf(`tx:${row.id}`, "charge", "Charge", [row], currency, row.description));
  }

  const transfers = new Map<string, AccountLedgerRow[]>();
  for (const row of rows) {
    if (consumed.has(row.id)) continue;
    if (row.type !== "transfer_in" && row.type !== "transfer_out") continue;
    const key = row.transferId ? `${row.type}:${row.transferId}` : `tx:${row.id}`;
    const bucket = transfers.get(key) ?? [];
    bucket.push(row);
    transfers.set(key, bucket);
    consumed.add(row.id);
  }
  for (const [key, members] of transfers) {
    const inbound = members[0]?.type === "transfer_in";
    groups.push(
      groupOf(
        key.startsWith("tx:") ? key : `transfer:${key}`,
        inbound ? "transfer_in" : "transfer_out",
        inbound ? "Charge transferred from Guest Folio" : "Charge returned to Guest Folio",
        members,
        currency,
        members.find((row) => row.description.trim())?.description,
      ),
    );
  }

  const credits = new Map<string, AccountLedgerRow[]>();
  for (const row of rows) {
    if (consumed.has(row.id) || row.referenceType !== "invoice_credit_note" || !row.referenceId)
      continue;
    const bucket = credits.get(row.referenceId) ?? [];
    bucket.push(row);
    credits.set(row.referenceId, bucket);
    consumed.add(row.id);
  }
  for (const [referenceId, members] of credits) {
    groups.push(
      groupOf(
        `credit-ledger:${referenceId}`,
        "credit_note",
        "Credit note",
        members,
        currency,
        members[0]?.description,
      ),
    );
  }

  const corrections = new Map<string, AccountLedgerRow[]>();
  for (const row of rows) {
    if (
      consumed.has(row.id) ||
      !row.referenceId ||
      !CORRECTION_REFERENCES.has(row.referenceType ?? "")
    ) {
      continue;
    }
    const bucket = corrections.get(row.referenceId) ?? [];
    bucket.push(row);
    corrections.set(row.referenceId, bucket);
    consumed.add(row.id);
  }
  for (const [referenceId, members] of corrections) {
    const labeled = correctionTitle(members[0]?.referenceType ?? null);
    groups.push(
      groupOf(
        `correction:${referenceId}`,
        labeled.eventType,
        labeled.title,
        members,
        currency,
        members.find((row) => row.description.trim())?.description,
      ),
    );
  }

  for (const row of rows) {
    if (consumed.has(row.id)) continue;
    consumed.add(row.id);
    if (
      row.referenceType === "settlement_write_off" ||
      (row.type === "adjustment" && /write-off/i.test(row.description))
    ) {
      groups.push(
        groupOf(`tx:${row.id}`, "write_off", "Write-off", [row], currency, row.description),
      );
      continue;
    }
    if (row.type === "discount") {
      groups.push(
        groupOf(`tx:${row.id}`, "discount", "Discount applied", [row], currency, row.description),
      );
      continue;
    }
    if (row.type === "payment") {
      groups.push(
        groupOf(`tx:${row.id}`, "payment", "Payment received", [row], currency, row.description),
      );
      continue;
    }
    if (row.type === "deposit") {
      groups.push(groupOf(`tx:${row.id}`, "deposit", "Deposit", [row], currency, row.description));
      continue;
    }
    if (row.type === "refund") {
      groups.push(groupOf(`tx:${row.id}`, "refund", "Refund", [row], currency, row.description));
      continue;
    }
    groups.push(
      groupOf(`tx:${row.id}`, "adjustment", "Adjustment", [row], currency, row.description),
    );
  }

  return groups.sort(compareGroups);
}

function compareGroups(a: AccountLedgerGroup, b: AccountLedgerGroup): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
  return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
}

function actorDisplay(
  id: string | null,
  fallbackName: string | null,
  actors: Record<string, AccountHistoryActor>,
): AccountHistoryEvent["actor"] {
  if (!id) {
    return { id: null, name: fallbackName?.trim() || "System", role: null };
  }
  const known = actors[id];
  return {
    id,
    name: known?.name?.trim() || fallbackName?.trim() || "Unknown user",
    role: known?.role ?? null,
  };
}

function documentTitle(type: AccountHistoryDocument["documentType"]): string {
  if (type === "invoice") return "Invoice issued";
  if (type === "debit_note") return "Debit note issued";
  return "Credit note issued";
}

function documentEventType(type: AccountHistoryDocument["documentType"]): AccountHistoryEventType {
  if (type === "invoice") return "invoice_issued";
  if (type === "debit_note") return "debit_note_issued";
  return "credit_note_issued";
}

export function buildAccountHistory(input: {
  accountId: string;
  currency: string;
  openedAt: string;
  closedAt: string | null;
  createdByMembershipId: string | null;
  rows: readonly AccountLedgerRow[];
  documents: readonly AccountHistoryDocument[];
  closes: readonly AccountHistoryClose[];
  allocations?: readonly AccountHistoryAllocation[];
  actors?: Record<string, AccountHistoryActor>;
  folios?: Record<string, AccountHistoryFolio>;
  folioByTransfer?: Record<string, string>;
}): AccountHistoryEvent[] {
  const actors = input.actors ?? {};
  const folios = input.folios ?? {};
  const folioByTransfer = input.folioByTransfer ?? {};
  const creditDocuments = new Set(
    input.documents
      .filter((document) => document.documentType === "credit_note")
      .map((document) => document.id),
  );
  const events: AccountHistoryEvent[] = [];

  events.push({
    eventId: `account-open:${input.accountId}`,
    eventType: "account_opened",
    occurredAt: input.openedAt,
    title: "Account opened",
    description: "Financial account opened",
    amount: null,
    affectsBalance: false,
    actor: actorDisplay(input.createdByMembershipId, null, actors),
    folio: null,
    document: null,
    payment: null,
    relatedTransactionIds: [],
    breakdown: [],
    currencyMismatch: false,
  });

  for (const group of groupAccountLedger(input.rows, input.currency)) {
    if (
      group.eventType === "credit_note" &&
      group.referenceId &&
      creditDocuments.has(group.referenceId)
    ) {
      continue;
    }
    const folioId = group.transferId ? (folioByTransfer[group.transferId] ?? null) : null;
    const folio = folioId ? (folios[folioId] ?? null) : null;
    const originalEventId =
      group.eventType === "refund" && group.originalTransactionId
        ? `tx:${group.originalTransactionId}`
        : null;
    events.push({
      eventId: group.eventId,
      eventType: group.eventType,
      occurredAt: group.occurredAt,
      title: group.title,
      description: group.description,
      amount: group.amount,
      affectsBalance: true,
      actor: actorDisplay(group.actorId, group.actorName, actors),
      folio,
      document: null,
      payment:
        group.eventType === "payment" ||
        group.eventType === "refund" ||
        group.eventType === "deposit"
          ? {
              method: group.paymentMethod,
              cashierShiftId: group.shiftId,
              originalEventId,
            }
          : null,
      relatedTransactionIds: group.componentIds,
      breakdown: group.breakdown,
      currencyMismatch: group.currencyMismatch,
    });
  }

  for (const document of input.documents) {
    events.push({
      eventId:
        document.documentType === "invoice"
          ? `invoice:${document.id}`
          : document.documentType === "debit_note"
            ? `debit-note:${document.id}`
            : `credit-note:${document.id}`,
      eventType: documentEventType(document.documentType),
      occurredAt: document.issuedAt,
      title: documentTitle(document.documentType),
      description: document.number,
      amount: roundHistoryMoney(document.amount),
      affectsBalance: false,
      actor: actorDisplay(document.issuedByMembershipId, null, actors),
      folio: null,
      document: { type: document.documentType, id: document.id, number: document.number },
      payment: null,
      relatedTransactionIds: [],
      breakdown: [],
      currencyMismatch: false,
    });
  }

  for (const allocation of input.allocations ?? []) {
    const reversal = allocation.amount < -0.009;
    const magnitude = roundHistoryMoney(Math.abs(allocation.amount));
    const invoiceNumber = allocation.invoiceNumber || "invoice";
    events.push({
      eventId: reversal ? `allocation-reverse:${allocation.id}` : `allocation:${allocation.id}`,
      eventType: reversal ? "allocation_reversed" : "payment_allocated",
      occurredAt: allocation.occurredAt,
      title: reversal
        ? `Payment allocation reversed for ${invoiceNumber}`
        : `Payment allocated to ${invoiceNumber}`,
      description: reversal
        ? `${allocation.reason?.trim() || "Allocation reversed"}. This does not change the account balance.`
        : `Allocated to ${invoiceNumber}. This does not change the account balance.`,
      amount: magnitude,
      affectsBalance: false,
      actor: actorDisplay(allocation.actorMembershipId, null, actors),
      folio: null,
      document: { type: "invoice", id: allocation.invoiceId, number: invoiceNumber },
      payment: {
        method: allocation.paymentMethod,
        cashierShiftId: null,
        originalEventId: `tx:${allocation.paymentTransactionId}`,
      },
      relatedTransactionIds: [allocation.paymentTransactionId],
      breakdown: [],
      currencyMismatch: false,
    });
  }

  const close =
    [...input.closes].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1))[0] ??
    (input.closedAt
      ? { id: input.accountId, occurredAt: input.closedAt, actorMembershipId: null }
      : null);
  if (close) {
    events.push({
      eventId: `account-close:${close.id}`,
      eventType: "account_closed",
      occurredAt: close.occurredAt,
      title: "Account closed",
      description: "Financial account closed",
      amount: null,
      affectsBalance: false,
      actor: actorDisplay(close.actorMembershipId, null, actors),
      folio: null,
      document: null,
      payment: null,
      relatedTransactionIds: [],
      breakdown: [],
      currencyMismatch: false,
    });
  }

  return events.sort(compareEvents);
}

function compareEvents(a: AccountHistoryEvent, b: AccountHistoryEvent): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
  return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
}

function pageSizeOf(value: number | undefined): number {
  if (value === 25 || value === 50) return value;
  return 10;
}

function matchesFilter(
  event: AccountHistoryEvent,
  filter: AccountHistoryFilter | undefined,
): boolean {
  if (!filter || filter === "all") return true;
  if (filter === "charges") return event.eventType === "charge";
  if (filter === "transfers")
    return event.eventType === "transfer_in" || event.eventType === "transfer_out";
  if (filter === "payments") {
    return (
      event.eventType === "payment" ||
      event.eventType === "payment_allocated" ||
      event.eventType === "allocation_reversed"
    );
  }
  if (filter === "refunds") return event.eventType === "refund";
  if (filter === "write_offs") return event.eventType === "write_off";
  if (filter === "corrections")
    return event.eventType === "correction" || event.eventType === "discount";
  if (filter === "documents") {
    return (
      event.eventType === "invoice_issued" ||
      event.eventType === "credit_note_issued" ||
      event.eventType === "debit_note_issued"
    );
  }
  return event.eventType === "account_opened" || event.eventType === "account_closed";
}

export function queryAccountHistory(
  events: readonly AccountHistoryEvent[],
  query: AccountHistoryQuery,
): { rows: AccountHistoryEvent[]; total: number; page: number; pageSize: number } {
  const term = (query.search ?? "").trim().toLowerCase();
  const documentNumber = (query.documentNumber ?? "").trim().toLowerCase();
  const filtered = events.filter((event) => {
    if (!matchesFilter(event, query.eventType)) return false;
    if (query.actorId && event.actor.id !== query.actorId) return false;
    if (query.sourceFolioId && event.folio?.id !== query.sourceFolioId) return false;
    if (
      query.paymentMethod &&
      query.paymentMethod !== "all" &&
      event.payment?.method !== query.paymentMethod
    ) {
      return false;
    }
    const day = propertyCalendarDate(event.occurredAt, query.timezone);
    if (query.from && day < query.from) return false;
    if (query.to && day > query.to) return false;
    if (documentNumber && !(event.document?.number ?? "").toLowerCase().includes(documentNumber))
      return false;
    if (!term) return true;
    const haystack = [
      event.title,
      event.description,
      event.actor.name,
      event.folio?.number,
      event.folio?.guestName,
      event.document?.number,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
  const sorted = [...filtered].sort((a, b) => {
    const order = compareEvents(a, b);
    return query.sort === "oldest" ? order : -order;
  });
  const pageSize = pageSizeOf(query.pageSize);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(query.page && query.page > 0 ? Math.floor(query.page) : 1, pageCount);
  const start = (page - 1) * pageSize;
  return { rows: sorted.slice(start, start + pageSize), total: sorted.length, page, pageSize };
}

function sourceLabel(
  group: AccountLedgerGroup,
  folio: AccountHistoryFolio | null,
  documentNumber: string | null,
): string | null {
  if (folio) return folio.guestName ? `${folio.number} · ${folio.guestName}` : folio.number;
  return documentNumber;
}

export function buildAccountStatement(input: {
  currency: string;
  timezone: string;
  fromDate: string;
  toDate: string;
  closedAt?: string | null;
  rows: readonly AccountLedgerRow[];
  folios?: Record<string, AccountHistoryFolio>;
  folioByTransfer?: Record<string, string>;
  documentNumbers?: Record<string, string>;
}): AccountStatement {
  const emptyTotals = {
    charges: 0,
    transfersIn: 0,
    transfersOut: 0,
    payments: 0,
    deposits: 0,
    refunds: 0,
    discounts: 0,
    writeOffs: 0,
    otherAdjustments: 0,
  };
  if (input.fromDate > input.toDate) {
    return {
      fromDate: input.fromDate,
      toDate: input.toDate,
      timezone: input.timezone,
      openingBalance: 0,
      closingBalance: 0,
      increases: 0,
      decreases: 0,
      netMovement: 0,
      totals: emptyTotals,
      lines: [],
      reconciled: false,
      activityAfterClose: false,
      currencyMismatch: false,
      invalidRange: true,
    };
  }
  const start = propertyDayBounds(input.fromDate, input.timezone).startIso;
  const end = propertyDayBounds(input.toDate, input.timezone).endIso;
  const before = input.rows.filter((row) => row.postedAt < start);
  const period = input.rows.filter((row) => row.postedAt >= start && row.postedAt < end);
  const openingBalance = sumAmount(before);
  const groups = groupAccountLedger(period, input.currency);
  const totals = { ...emptyTotals };
  let increases = 0;
  let decreases = 0;
  for (const group of groups) {
    if (group.amount > 0) increases += group.amount;
    if (group.amount < 0) decreases += Math.abs(group.amount);
    if (group.eventType === "charge") totals.charges += group.amount;
    else if (group.eventType === "transfer_in") totals.transfersIn += group.amount;
    else if (group.eventType === "transfer_out") totals.transfersOut += group.amount;
    else if (group.eventType === "payment") totals.payments += group.amount;
    else if (group.eventType === "deposit") totals.deposits += group.amount;
    else if (group.eventType === "refund") totals.refunds += group.amount;
    else if (group.eventType === "discount") totals.discounts += group.amount;
    else if (group.eventType === "write_off") totals.writeOffs += group.amount;
    else totals.otherAdjustments += group.amount;
  }
  increases = roundHistoryMoney(increases);
  decreases = roundHistoryMoney(decreases);
  const netMovement = roundHistoryMoney(increases - decreases);
  let running = openingBalance;
  const lines: AccountStatementLine[] = groups.map((group) => {
    running = roundHistoryMoney(running + group.amount);
    const folioId = group.transferId ? (input.folioByTransfer?.[group.transferId] ?? null) : null;
    const folio = folioId ? (input.folios?.[folioId] ?? null) : null;
    const documentNumber =
      group.eventType === "credit_note" && group.referenceId
        ? (input.documentNumbers?.[group.referenceId] ?? null)
        : null;
    return {
      eventId: group.eventId,
      eventType: group.eventType,
      occurredAt: group.occurredAt,
      title: group.title,
      description: group.description,
      source: sourceLabel(group, folio, documentNumber),
      folioId,
      documentId: group.eventType === "credit_note" ? group.referenceId : null,
      documentType: group.eventType === "credit_note" ? "credit_note" : null,
      transactionId: group.componentIds[0] ?? null,
      increase: group.amount > 0.009 ? group.amount : null,
      decrease: group.amount < -0.009 ? roundHistoryMoney(Math.abs(group.amount)) : null,
      amount: group.amount,
      runningBalance: running,
    };
  });
  const closingBalance = roundHistoryMoney(openingBalance + netMovement);
  const rawMovement = sumAmount(period);
  const reconciled =
    Math.abs(netMovement - rawMovement) < 0.01 &&
    (lines.length === 0 ||
      Math.abs(lines[lines.length - 1]!.runningBalance - closingBalance) < 0.01);
  const activityAfterClose = Boolean(
    input.closedAt && input.rows.some((row) => row.postedAt > input.closedAt!),
  );
  return {
    fromDate: input.fromDate,
    toDate: input.toDate,
    timezone: input.timezone,
    openingBalance,
    closingBalance,
    increases,
    decreases,
    netMovement,
    totals: {
      charges: roundHistoryMoney(totals.charges),
      transfersIn: roundHistoryMoney(totals.transfersIn),
      transfersOut: roundHistoryMoney(totals.transfersOut),
      payments: roundHistoryMoney(totals.payments),
      deposits: roundHistoryMoney(totals.deposits),
      refunds: roundHistoryMoney(totals.refunds),
      discounts: roundHistoryMoney(totals.discounts),
      writeOffs: roundHistoryMoney(totals.writeOffs),
      otherAdjustments: roundHistoryMoney(totals.otherAdjustments),
    },
    lines,
    reconciled,
    activityAfterClose,
    currencyMismatch: groups.some((group) => group.currencyMismatch),
    invalidRange: false,
  };
}

export function historyHasBalanceActivity(events: readonly AccountHistoryEvent[]): boolean {
  return events.some((event) => event.affectsBalance);
}
