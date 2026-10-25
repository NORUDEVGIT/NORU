/**
 * Server loader for the Cashier Invoice Report.
 * Uses a trusted client after requireCashieringAccess (business_date column grant).
 */
import { resolvePropertyBusinessDate } from "@/packages/pms/lib/reservation-workspace/business-date";
import { propertyDayBounds } from "@/packages/pms/lib/cashiering-control";
import { mapFolioInvoiceSnapshot } from "@/packages/pms/lib/cashiering-invoices.server";
import { mapAccountInvoiceSnapshot } from "@/packages/pms/lib/cashiering-account-invoices";
import { mapCreditSnapshot } from "@/packages/pms/lib/cashiering-credit-notes";
import { mapDebitSnapshot } from "@/packages/pms/lib/cashiering-debit-notes";
import {
  assembleCashierInvoiceReport,
  CashierInvoiceReportError,
  type CashierInvoiceReportFilters,
  type CashierInvoiceReportResult,
  type CashierInvoiceSourceDoc,
  type CashierInvoiceSourceLine,
  type CashierPartyType,
} from "@/packages/pms/lib/cashier-invoice-report";

export type CashierInvoiceDb = {
  from: (table: string) => {
    select: (columns: string) => CashierInvoiceQuery;
  };
};

export type CashierInvoiceQuery = {
  eq: (column: string, value: string) => CashierInvoiceQuery;
  in: (column: string, values: string[]) => CashierInvoiceQuery;
  gte: (column: string, value: string) => CashierInvoiceQuery;
  lt: (column: string, value: string) => CashierInvoiceQuery;
  order: (column: string, options?: { ascending?: boolean }) => CashierInvoiceQuery;
  maybeSingle: () => PromiseLike<{
    data: Record<string, unknown> | null;
    error: { message?: string } | null;
  }>;
  then: PromiseLike<{
    data: Record<string, unknown>[] | null;
    error: { message?: string } | null;
  }>["then"];
};

const ID_CHUNK = 200;

export async function loadCashierInvoiceReport(
  db: CashierInvoiceDb,
  restaurantId: string,
  filters: CashierInvoiceReportFilters,
): Promise<CashierInvoiceReportResult> {
  const from = assertDate(filters.from, "From date");
  const to = assertDate(filters.to, "To date");
  if (from > to)
    throw new CashierInvoiceReportError("The from date must be on or before the to date.");

  const property = await loadProperty(db, restaurantId);
  const rangeStart = propertyDayBounds(from, property.timezone).startIso;
  const rangeEnd = propertyDayBounds(to, property.timezone).endIso;

  const [guestInvoices, accountInvoices, notes] = await Promise.all([
    listGuestInvoices(db, restaurantId, rangeStart, rangeEnd),
    listAccountInvoices(db, restaurantId, rangeStart, rangeEnd),
    listNotes(db, restaurantId, rangeStart, rangeEnd),
  ]);

  let docs = [...guestInvoices, ...accountInvoices, ...notes];
  // Load parent INV when an in-range CRE/DEB needs Credit/Debit columns on that invoice.
  {
    const presentIds = new Set(
      docs.filter((doc) => doc.documentType === "INV").map((doc) => doc.id),
    );
    const missingParentIds = unique(
      notes
        .map((note) => note.parentInvoiceId)
        .filter((id): id is string => Boolean(id && !presentIds.has(id))),
    );
    if (missingParentIds.length > 0) {
      const anchors = await loadParentInvoicesById(db, restaurantId, missingParentIds);
      docs = [...docs, ...anchors.map((doc) => ({ ...doc, detailAnchorOnly: true }))];
    }
  }

  const guestIds = docs
    .filter((doc) => doc.documentType === "INV" && doc.partyType === "Guest")
    .map((doc) => doc.id);
  const accountIds = docs
    .filter((doc) => doc.documentType === "INV" && doc.partyType !== "Guest")
    .map((doc) => doc.id);
  const noteIds = docs
    .filter((doc) => doc.documentType === "CRE" || doc.documentType === "DEB")
    .map((doc) => doc.id);

  const [issuerNames, guestPayments, accountPayments, fiscalRows, guestLines, accountLines] =
    await Promise.all([
      loadIssuerNames(
        db,
        restaurantId,
        docs.map((doc) => doc.issuerMembershipId).filter((id): id is string => Boolean(id)),
      ),
      loadGuestPaymentMethods(db, restaurantId, guestIds),
      loadAccountPaymentMethods(db, restaurantId, accountIds),
      loadFiscalRows(db, restaurantId, guestIds, accountIds, noteIds),
      loadGuestLines(db, restaurantId, guestIds),
      loadAccountLines(db, restaurantId, accountIds),
    ]);

  const enriched = docs.map((doc) => {
    const fiscal = pickFiscal(doc, fiscalRows);
    const paymentMethods =
      doc.documentType === "INV"
        ? doc.partyType === "Guest"
          ? (guestPayments.get(doc.id) ?? [])
          : (accountPayments.get(doc.id) ?? [])
        : [];
    const lines =
      doc.documentType === "INV"
        ? doc.partyType === "Guest"
          ? (guestLines.get(doc.id) ?? doc.lines)
          : (accountLines.get(doc.id) ?? doc.lines)
        : doc.lines;
    return {
      ...doc,
      issuerName:
        doc.issuerName ??
        (doc.issuerMembershipId ? (issuerNames.get(doc.issuerMembershipId) ?? null) : null),
      paymentMethods,
      fiscalStatuses: fiscal?.statuses ?? [],
      fiscalRequestSnapshot: fiscal?.requestSnapshot ?? null,
      externalDocumentNumber: fiscal?.externalDocumentNumber ?? null,
      externalRrn: fiscal?.externalRrn ?? null,
      lines,
    } satisfies CashierInvoiceSourceDoc;
  });

  return assembleCashierInvoiceReport({
    restaurantId,
    from,
    to,
    businessDate: property.businessDate,
    timezone: property.timezone,
    documents: enriched,
    filters: { ...filters, from, to },
  });
}

async function loadProperty(
  db: CashierInvoiceDb,
  restaurantId: string,
): Promise<{ businessDate: string; timezone: string }> {
  const result = await db
    .from("restaurants")
    .select("timezone, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error || !result.data) throw new CashierInvoiceReportError();
  const timezone = text(result.data.timezone);
  if (!timezone) throw new CashierInvoiceReportError();
  const persisted = text(result.data.business_date);
  return {
    timezone,
    businessDate: resolvePropertyBusinessDate(persisted ? persisted.slice(0, 10) : null, timezone),
  };
}

async function listGuestInvoices(
  db: CashierInvoiceDb,
  restaurantId: string,
  startIso: string,
  endIso: string,
): Promise<CashierInvoiceSourceDoc[]> {
  const result = await db
    .from("guest_folio_invoices")
    .select(
      "id, restaurant_id, issued_number, issued_at, issued_by_membership_id, snapshot, coverage_scope",
    )
    .eq("restaurant_id", restaurantId)
    .gte("issued_at", startIso)
    .lt("issued_at", endIso)
    .order("issued_at", { ascending: false });
  if (result.error) throw new CashierInvoiceReportError();
  return (result.data ?? []).flatMap((row) => mapGuestInvoiceRow(row, restaurantId));
}

async function listAccountInvoices(
  db: CashierInvoiceDb,
  restaurantId: string,
  startIso: string,
  endIso: string,
): Promise<CashierInvoiceSourceDoc[]> {
  const result = await db
    .from("financial_account_invoices")
    .select("id, restaurant_id, issued_number, issued_at, issued_by_membership_id, snapshot")
    .eq("restaurant_id", restaurantId)
    .gte("issued_at", startIso)
    .lt("issued_at", endIso)
    .order("issued_at", { ascending: false });
  if (result.error) throw new CashierInvoiceReportError();
  return (result.data ?? []).flatMap((row) => mapAccountInvoiceRow(row, restaurantId));
}

/** Parent invoices for Detail nesting when the note is in-range but the INV is not. */
async function loadParentInvoicesById(
  db: CashierInvoiceDb,
  restaurantId: string,
  invoiceIds: string[],
): Promise<CashierInvoiceSourceDoc[]> {
  if (invoiceIds.length === 0) return [];
  const [guestRows, accountRows] = await Promise.all([
    selectIn(
      db,
      "guest_folio_invoices",
      "id, restaurant_id, issued_number, issued_at, issued_by_membership_id, snapshot, coverage_scope",
      "id",
      invoiceIds,
      restaurantId,
    ),
    selectIn(
      db,
      "financial_account_invoices",
      "id, restaurant_id, issued_number, issued_at, issued_by_membership_id, snapshot",
      "id",
      invoiceIds,
      restaurantId,
    ),
  ]);
  const guestDocs = guestRows.flatMap((row) => mapGuestInvoiceRow(row, restaurantId));
  const accountDocs = accountRows.flatMap((row) => mapAccountInvoiceRow(row, restaurantId));
  return [...guestDocs, ...accountDocs];
}

function mapGuestInvoiceRow(
  row: Record<string, unknown>,
  restaurantId: string,
): CashierInvoiceSourceDoc[] {
  if (text(row.restaurant_id) !== restaurantId) return [];
  try {
    const snapshot = mapFolioInvoiceSnapshot(row.snapshot);
    const totals = snapshot.totals;
    if (totals.subtotal == null || totals.serviceCharge == null || totals.invoiceTotal == null) {
      return [
        {
          id: text(row.id),
          restaurantId,
          documentType: "INV",
          documentNumber: text(row.issued_number) || snapshot.document.issuedNumber,
          issuedAt: text(row.issued_at),
          partyType: "Guest",
          partyName: snapshot.folio.guestName,
          currency: snapshot.folio.currency || snapshot.property.currencyCode || "—",
          subtotal: 0,
          tax: 0,
          serviceCharge: 0,
          grandTotal: 0,
          issuerMembershipId: text(row.issued_by_membership_id) || null,
          issuerName: null,
          coverageScope: "legacy_folio",
          paymentMethods: [],
          fiscalStatuses: [],
          fiscalRequestSnapshot: null,
          externalDocumentNumber: null,
          externalRrn: null,
          parentInvoiceId: null,
          lines: [],
        },
      ];
    }
    return [
      {
        id: text(row.id),
        restaurantId,
        documentType: "INV",
        documentNumber: text(row.issued_number) || snapshot.document.issuedNumber,
        issuedAt: text(row.issued_at),
        partyType: "Guest",
        partyName: snapshot.folio.guestName,
        currency: snapshot.folio.currency || snapshot.property.currencyCode || "—",
        subtotal: Number(totals.subtotal),
        tax: Number(totals.tax ?? 0),
        serviceCharge: Number(totals.serviceCharge),
        grandTotal: Number(totals.invoiceTotal),
        issuerMembershipId: text(row.issued_by_membership_id) || null,
        issuerName: null,
        coverageScope:
          text(row.coverage_scope) === "legacy_folio" ? "legacy_folio" : "charge_groups",
        paymentMethods: [],
        fiscalStatuses: [],
        fiscalRequestSnapshot: null,
        externalDocumentNumber: null,
        externalRrn: null,
        parentInvoiceId: null,
        lines: snapshot.lines.map((line, index) => snapshotLineToSource(line, index)),
      },
    ];
  } catch {
    throw new CashierInvoiceReportError();
  }
}

function mapAccountInvoiceRow(
  row: Record<string, unknown>,
  restaurantId: string,
): CashierInvoiceSourceDoc[] {
  if (text(row.restaurant_id) !== restaurantId) return [];
  const snapshot = mapAccountInvoiceSnapshot(row.snapshot);
  const kind = snapshot.account.accountKind === "group" ? "Group" : "Company";
  return [
    {
      id: text(row.id),
      restaurantId,
      documentType: "INV",
      documentNumber: text(row.issued_number) || snapshot.document.issuedNumber,
      issuedAt: text(row.issued_at),
      partyType: kind as CashierPartyType,
      partyName: snapshot.billTo.name || snapshot.account.accountNumber,
      currency: snapshot.account.currency || snapshot.property.currencyCode || "—",
      subtotal: Number(snapshot.totals.subtotal ?? 0),
      tax: Number(snapshot.totals.tax ?? 0),
      serviceCharge: Number(snapshot.totals.serviceCharge ?? 0),
      grandTotal: Number(snapshot.totals.invoiceTotal ?? 0),
      issuerMembershipId: text(row.issued_by_membership_id) || null,
      issuerName: snapshot.document.issuedByName,
      coverageScope: "charge_groups",
      paymentMethods: [],
      fiscalStatuses: [],
      fiscalRequestSnapshot: null,
      externalDocumentNumber: null,
      externalRrn: null,
      parentInvoiceId: null,
      lines: snapshot.lines.map((line, index) => ({
        id: line.id || `line-${index}`,
        sequence: index + 1,
        item: line.description || "—",
        quantity: 1,
        unitAmount: Number(line.amount ?? 0),
        preTaxAmount: Number(line.amount ?? 0),
        taxAmount: 0,
        taxCode: null,
        serviceCharge: 0,
        lineTotal: Number(line.amount ?? 0),
      })),
    },
  ];
}

async function listNotes(
  db: CashierInvoiceDb,
  restaurantId: string,
  startIso: string,
  endIso: string,
): Promise<CashierInvoiceSourceDoc[]> {
  const result = await db
    .from("invoice_credit_notes")
    .select(
      "id, restaurant_id, note_type, note_number, issued_at, issued_by_membership_id, currency, subtotal_delta, tax_delta, service_charge_delta, total_delta, snapshot, guest_invoice_id, account_invoice_id",
    )
    .eq("restaurant_id", restaurantId)
    .gte("issued_at", startIso)
    .lt("issued_at", endIso)
    .order("issued_at", { ascending: false });
  if (result.error) throw new CashierInvoiceReportError();
  return (result.data ?? []).flatMap((row) => {
    if (text(row.restaurant_id) !== restaurantId) return [];
    const noteType = text(row.note_type) === "debit" ? "DEB" : "CRE";
    const snapshot =
      noteType === "DEB" ? mapDebitSnapshot(row.snapshot) : mapCreditSnapshot(row.snapshot);
    const partyType: CashierPartyType = text(row.account_invoice_id) ? "Company" : "Guest";
    const parentInvoiceId = text(row.guest_invoice_id) || text(row.account_invoice_id) || null;
    return [
      {
        id: text(row.id),
        restaurantId,
        documentType: noteType,
        documentNumber: text(row.note_number) || snapshot.noteNumber || "—",
        issuedAt: text(row.issued_at),
        partyType,
        partyName: snapshot.billToName?.trim() || "—",
        currency: text(row.currency) || snapshot.currency || "—",
        subtotal: Number(row.subtotal_delta ?? 0),
        tax: Number(row.tax_delta ?? 0),
        serviceCharge: Number(row.service_charge_delta ?? 0),
        grandTotal: Number(row.total_delta ?? 0),
        issuerMembershipId: text(row.issued_by_membership_id) || null,
        issuerName: snapshot.issuedByName ?? null,
        coverageScope: null,
        paymentMethods: [],
        fiscalStatuses: [],
        fiscalRequestSnapshot: null,
        externalDocumentNumber: null,
        externalRrn: null,
        parentInvoiceId,
        lines: [
          {
            id: text(row.id),
            sequence: 1,
            item: noteType === "DEB" ? "Debit note" : "Credit note",
            quantity: 1,
            unitAmount: Number(row.total_delta ?? 0),
            preTaxAmount: Number(row.subtotal_delta ?? 0),
            taxAmount: Number(row.tax_delta ?? 0),
            taxCode: null,
            serviceCharge: Number(row.service_charge_delta ?? 0),
            lineTotal: Number(row.total_delta ?? 0),
          },
        ],
      },
    ];
  });
}

function snapshotLineToSource(
  line: {
    id: string;
    description: string;
    amount: number;
    quantity?: number | null;
    unitAmount?: number | null;
    taxSnapshot?: Record<string, unknown> | null;
    chargeSnapshot?: Record<string, unknown> | null;
  },
  index: number,
): CashierInvoiceSourceLine {
  const charge = line.chargeSnapshot ?? {};
  const taxAmount = numberOr(charge.taxTotal, numberOr(line.taxSnapshot?.amount, 0));
  const serviceCharge = numberOr(charge.serviceChargeTotal, 0);
  const preTaxAmount = Number(line.amount ?? 0);
  const taxCode =
    typeof line.taxSnapshot?.code === "string"
      ? line.taxSnapshot.code
      : typeof line.taxSnapshot?.name === "string"
        ? line.taxSnapshot.name
        : null;
  return {
    id: line.id || `line-${index}`,
    sequence: index + 1,
    item: line.description || "—",
    quantity: line.quantity ?? null,
    unitAmount: line.unitAmount ?? null,
    preTaxAmount,
    taxAmount,
    taxCode,
    serviceCharge,
    lineTotal: roundMoney(preTaxAmount + taxAmount + serviceCharge),
  };
}

async function loadIssuerNames(
  db: CashierInvoiceDb,
  restaurantId: string,
  membershipIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = unique(membershipIds);
  if (ids.length === 0) return names;
  const members = await selectIn(
    db,
    "restaurant_users",
    "id, restaurant_id, user_id",
    "id",
    ids,
    restaurantId,
  );
  const userIds = unique(members.map((row) => text(row.user_id)).filter(Boolean));
  if (userIds.length === 0) return names;
  const profiles = await selectInNoRestaurant(
    db,
    "profiles",
    "id, first_name, last_name",
    "id",
    userIds,
  );
  const byUser = new Map<string, string>();
  for (const profile of profiles) {
    const name = [text(profile.first_name), text(profile.last_name)]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (name) byUser.set(text(profile.id), name);
  }
  for (const member of members) {
    if (text(member.restaurant_id) !== restaurantId) continue;
    const name = byUser.get(text(member.user_id));
    if (name) names.set(text(member.id), name);
  }
  return names;
}

async function loadGuestPaymentMethods(
  db: CashierInvoiceDb,
  restaurantId: string,
  invoiceIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (invoiceIds.length === 0) return map;
  const allocations = await selectIn(
    db,
    "guest_payment_invoice_allocations",
    "id, restaurant_id, invoice_id, payment_transaction_id, amount, reverses_allocation_id",
    "invoice_id",
    invoiceIds,
    restaurantId,
  );
  const reversed = new Set(
    allocations.map((row) => text(row.reverses_allocation_id)).filter((id) => id.length > 0),
  );
  const active = allocations.filter(
    (row) =>
      text(row.restaurant_id) === restaurantId &&
      !text(row.reverses_allocation_id) &&
      !reversed.has(text(row.id)) &&
      Number(row.amount ?? 0) > 0.009,
  );
  const paymentIds = unique(active.map((row) => text(row.payment_transaction_id)).filter(Boolean));
  const payments = await selectIn(
    db,
    "folio_transactions",
    "id, restaurant_id, payment_method, transaction_type",
    "id",
    paymentIds,
    restaurantId,
  );
  const methodByPayment = new Map<string, string>();
  for (const payment of payments) {
    if (text(payment.restaurant_id) !== restaurantId) continue;
    if (text(payment.transaction_type) !== "payment") continue;
    const method = text(payment.payment_method);
    if (method) methodByPayment.set(text(payment.id), method);
  }
  for (const allocation of active) {
    const method = methodByPayment.get(text(allocation.payment_transaction_id));
    if (!method) continue;
    const list = map.get(text(allocation.invoice_id)) ?? [];
    list.push(method);
    map.set(text(allocation.invoice_id), list);
  }
  return map;
}

async function loadAccountPaymentMethods(
  db: CashierInvoiceDb,
  restaurantId: string,
  invoiceIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (invoiceIds.length === 0) return map;
  const allocations = await selectIn(
    db,
    "financial_account_payment_allocations",
    "id, restaurant_id, invoice_id, payment_transaction_id, amount, reverses_allocation_id",
    "invoice_id",
    invoiceIds,
    restaurantId,
  );
  const reversed = new Set(
    allocations.map((row) => text(row.reverses_allocation_id)).filter((id) => id.length > 0),
  );
  const active = allocations.filter(
    (row) =>
      text(row.restaurant_id) === restaurantId &&
      !text(row.reverses_allocation_id) &&
      !reversed.has(text(row.id)) &&
      Number(row.amount ?? 0) > 0.009,
  );
  const paymentIds = unique(active.map((row) => text(row.payment_transaction_id)).filter(Boolean));
  const payments = await selectIn(
    db,
    "folio_transactions",
    "id, restaurant_id, payment_method, transaction_type",
    "id",
    paymentIds,
    restaurantId,
  );
  const methodByPayment = new Map<string, string>();
  for (const payment of payments) {
    if (text(payment.restaurant_id) !== restaurantId) continue;
    const method = text(payment.payment_method);
    if (method) methodByPayment.set(text(payment.id), method);
  }
  for (const allocation of active) {
    const method = methodByPayment.get(text(allocation.payment_transaction_id));
    if (!method) continue;
    const list = map.get(text(allocation.invoice_id)) ?? [];
    list.push(method);
    map.set(text(allocation.invoice_id), list);
  }
  return map;
}

type FiscalBundle = {
  statuses: string[];
  requestSnapshot: unknown;
  externalDocumentNumber: string | null;
  externalRrn: string | null;
};

async function loadFiscalRows(
  db: CashierInvoiceDb,
  restaurantId: string,
  guestIds: string[],
  accountIds: string[],
  noteIds: string[],
): Promise<Map<string, FiscalBundle>> {
  const map = new Map<string, FiscalBundle>();
  const sourceIds = unique([...guestIds, ...accountIds, ...noteIds]);
  if (sourceIds.length === 0) return map;
  const rows = await selectIn(
    db,
    "fiscal_registrations",
    "id, restaurant_id, source_type, source_id, fiscal_document_type, status, request_snapshot, external_document_number, external_rrn, created_at",
    "source_id",
    sourceIds,
    restaurantId,
  );
  const allowed = new Set(["guest_invoice", "account_invoice", "credit_note", "debit_note"]);
  const allowedDocs = new Set(["INV", "CRE", "DEB"]);
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    if (text(row.restaurant_id) !== restaurantId) continue;
    if (!allowed.has(text(row.source_type))) continue;
    if (!allowedDocs.has(text(row.fiscal_document_type))) continue;
    if (text(row.fiscal_document_type) === "SALES_RECEIPT") continue;
    const list = grouped.get(text(row.source_id)) ?? [];
    list.push(row);
    grouped.set(text(row.source_id), list);
  }
  for (const [sourceId, list] of grouped) {
    const ordered = [...list].sort((left, right) =>
      text(right.created_at).localeCompare(text(left.created_at)),
    );
    const statuses = ordered.map((row) => text(row.status)).filter(Boolean);
    const preferred =
      ordered.find((row) => text(row.status) === "REGISTERED") ??
      ordered.find((row) => text(row.status) !== "CANCELLED") ??
      ordered[0];
    map.set(sourceId, {
      statuses,
      requestSnapshot: preferred?.request_snapshot ?? null,
      externalDocumentNumber: text(preferred?.external_document_number) || null,
      externalRrn: text(preferred?.external_rrn) || null,
    });
  }
  return map;
}

function pickFiscal(
  doc: CashierInvoiceSourceDoc,
  fiscalRows: Map<string, FiscalBundle>,
): FiscalBundle | undefined {
  return fiscalRows.get(doc.id);
}

async function loadGuestLines(
  db: CashierInvoiceDb,
  restaurantId: string,
  invoiceIds: string[],
): Promise<Map<string, CashierInvoiceSourceLine[]>> {
  const map = new Map<string, CashierInvoiceSourceLine[]>();
  if (invoiceIds.length === 0) return map;
  const rows = await selectIn(
    db,
    "guest_folio_invoice_lines",
    "id, restaurant_id, invoice_id, source_transaction_id, component_kind, amount, snapshot",
    "invoice_id",
    invoiceIds,
    restaurantId,
  );
  const byInvoice = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    if (text(row.restaurant_id) !== restaurantId) continue;
    const list = byInvoice.get(text(row.invoice_id)) ?? [];
    list.push(row);
    byInvoice.set(text(row.invoice_id), list);
  }
  for (const [invoiceId, list] of byInvoice) {
    const parents = list.filter((row) => text(row.component_kind) === "parent");
    const children = list.filter((row) => text(row.component_kind) !== "parent");
    map.set(
      invoiceId,
      parents.map((parent, index) => {
        const sourceId = text(parent.source_transaction_id);
        const taxRows = children.filter(
          (row) =>
            text(row.source_transaction_id) === sourceId && text(row.component_kind) === "tax",
        );
        const serviceRows = children.filter(
          (row) =>
            text(row.source_transaction_id) === sourceId &&
            text(row.component_kind) === "service_charge",
        );
        const snapshot =
          parent.snapshot && typeof parent.snapshot === "object"
            ? (parent.snapshot as Record<string, unknown>)
            : {};
        const taxAmount = taxRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
        const serviceCharge = serviceRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
        const preTaxAmount = Number(parent.amount ?? 0);
        const taxSnapshot =
          taxRows[0]?.snapshot && typeof taxRows[0].snapshot === "object"
            ? (taxRows[0].snapshot as Record<string, unknown>)
            : null;
        return {
          id: text(parent.id),
          sequence: index + 1,
          item: text(snapshot.description) || "—",
          quantity: numberOrNull(snapshot.quantity),
          unitAmount: numberOrNull(snapshot.unitAmount),
          preTaxAmount,
          taxAmount: roundMoney(taxAmount),
          taxCode:
            typeof taxSnapshot?.code === "string"
              ? taxSnapshot.code
              : typeof taxSnapshot?.name === "string"
                ? taxSnapshot.name
                : null,
          serviceCharge: roundMoney(serviceCharge),
          lineTotal: roundMoney(preTaxAmount + taxAmount + serviceCharge),
        };
      }),
    );
  }
  return map;
}

async function loadAccountLines(
  db: CashierInvoiceDb,
  restaurantId: string,
  invoiceIds: string[],
): Promise<Map<string, CashierInvoiceSourceLine[]>> {
  const map = new Map<string, CashierInvoiceSourceLine[]>();
  if (invoiceIds.length === 0) return map;
  const rows = await selectIn(
    db,
    "financial_account_invoice_lines",
    "id, restaurant_id, invoice_id, source_group_id, component_kind, amount, snapshot",
    "invoice_id",
    invoiceIds,
    restaurantId,
  );
  const byInvoice = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    if (text(row.restaurant_id) !== restaurantId) continue;
    const list = byInvoice.get(text(row.invoice_id)) ?? [];
    list.push(row);
    byInvoice.set(text(row.invoice_id), list);
  }
  for (const [invoiceId, list] of byInvoice) {
    const parents = list.filter((row) => text(row.component_kind) === "parent");
    const children = list.filter((row) => text(row.component_kind) !== "parent");
    map.set(
      invoiceId,
      parents.map((parent, index) => {
        const sourceId = text(parent.source_group_id);
        const taxAmount = children
          .filter(
            (row) => text(row.source_group_id) === sourceId && text(row.component_kind) === "tax",
          )
          .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
        const serviceCharge = children
          .filter(
            (row) =>
              text(row.source_group_id) === sourceId &&
              text(row.component_kind) === "service_charge",
          )
          .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
        const snapshot =
          parent.snapshot && typeof parent.snapshot === "object"
            ? (parent.snapshot as Record<string, unknown>)
            : {};
        const preTaxAmount = Number(parent.amount ?? 0);
        return {
          id: text(parent.id),
          sequence: index + 1,
          item: text(snapshot.description) || "—",
          quantity: 1,
          unitAmount: preTaxAmount,
          preTaxAmount,
          taxAmount: roundMoney(taxAmount),
          taxCode: null,
          serviceCharge: roundMoney(serviceCharge),
          lineTotal: roundMoney(preTaxAmount + taxAmount + serviceCharge),
        };
      }),
    );
  }
  return map;
}

async function selectIn(
  db: CashierInvoiceDb,
  table: string,
  columns: string,
  column: string,
  ids: string[],
  restaurantId: string,
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const result = await db
      .from(table)
      .select(columns)
      .eq("restaurant_id", restaurantId)
      .in(column, ids.slice(index, index + ID_CHUNK));
    if (result.error) throw new CashierInvoiceReportError();
    for (const row of result.data ?? []) {
      if (text(row.restaurant_id) === restaurantId) rows.push(row);
    }
  }
  return rows;
}

async function selectInNoRestaurant(
  db: CashierInvoiceDb,
  table: string,
  columns: string,
  column: string,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const result = await db
      .from(table)
      .select(columns)
      .in(column, ids.slice(index, index + ID_CHUNK));
    if (result.error) throw new CashierInvoiceReportError();
    rows.push(...(result.data ?? []));
  }
  return rows;
}

function assertDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new CashierInvoiceReportError(`${label} must be a valid date.`);
  }
  return value;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
