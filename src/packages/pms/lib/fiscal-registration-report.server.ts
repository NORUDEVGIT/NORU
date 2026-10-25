/**
 * Server loader for the Fiscal Registration Report.
 * Uses a trusted client after requireCashieringAccess (business_date column grant).
 */
import { resolvePropertyBusinessDate } from "@/packages/pms/lib/reservation-workspace/business-date";
import { propertyDayBounds } from "@/packages/pms/lib/cashiering-control";
import {
  assembleFiscalRegistrationReport,
  FiscalRegistrationReportError,
  fiscalPayloadCurrency,
  fiscalPayloadParty,
  fiscalPayloadTotal,
  type FiscalRegistrationReportFilters,
  type FiscalRegistrationReportResult,
  type FiscalRegistrationSource,
  type FiscalReportDocumentType,
} from "@/packages/pms/lib/fiscal-registration-report";

export type FiscalRegistrationDb = {
  from: (table: string) => {
    select: (columns: string) => FiscalRegistrationQuery;
  };
};

export type FiscalRegistrationQuery = {
  eq: (column: string, value: string) => FiscalRegistrationQuery;
  in: (column: string, values: string[]) => FiscalRegistrationQuery;
  gte: (column: string, value: string) => FiscalRegistrationQuery;
  lt: (column: string, value: string) => FiscalRegistrationQuery;
  is: (column: string, value: null) => FiscalRegistrationQuery;
  order: (column: string, options?: { ascending?: boolean }) => FiscalRegistrationQuery;
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
const FISCAL_SELECT =
  "id, restaurant_id, source_type, source_id, fiscal_document_type, status, trnx_id, related_registration_id, external_document_number, external_irn, external_rrn, registered_at, created_at, request_snapshot, client_snapshot";

const ALLOWED_DOC_TYPES = new Set(["INV", "CRE", "DEB", "SALES_RECEIPT"]);
const ALLOWED_SOURCE_TYPES = new Set([
  "guest_invoice",
  "account_invoice",
  "credit_note",
  "debit_note",
  "guest_allocation",
  "account_allocation",
]);

export async function loadFiscalRegistrationReport(
  db: FiscalRegistrationDb,
  restaurantId: string,
  filters: FiscalRegistrationReportFilters,
): Promise<FiscalRegistrationReportResult> {
  const from = assertDate(filters.from, "From date");
  const to = assertDate(filters.to, "To date");
  if (from > to) {
    throw new FiscalRegistrationReportError("The from date must be on or before the to date.");
  }

  const property = await loadProperty(db, restaurantId);
  const rangeStart = propertyDayBounds(from, property.timezone).startIso;
  const rangeEnd = propertyDayBounds(to, property.timezone).endIso;

  const ranged = await listRangedRegistrations(db, restaurantId, rangeStart, rangeEnd);
  const byId = new Map(ranged.map((doc) => [doc.id, doc]));

  const missingParentIds = unique(
    ranged
      .filter(
        (doc) =>
          doc.documentType === "CRE" ||
          doc.documentType === "DEB" ||
          doc.documentType === "SALES_RECEIPT",
      )
      .map((doc) => doc.relatedRegistrationId)
      .filter((id): id is string => Boolean(id && !byId.has(id))),
  );
  if (missingParentIds.length > 0) {
    const anchors = await loadRegistrationsById(db, restaurantId, missingParentIds);
    for (const anchor of anchors) {
      if (anchor.documentType !== "INV") continue;
      byId.set(anchor.id, { ...anchor, detailAnchorOnly: true });
    }
  }

  const invoiceIds = [...byId.values()]
    .filter((doc) => doc.documentType === "INV")
    .map((doc) => doc.id);
  if (invoiceIds.length > 0) {
    const children = await loadChildrenByParent(db, restaurantId, invoiceIds);
    for (const child of children) {
      if (!byId.has(child.id)) byId.set(child.id, child);
    }
  }

  const docs = [...byId.values()];
  const enriched = await enrichDocuments(db, restaurantId, docs);

  return assembleFiscalRegistrationReport({
    restaurantId,
    from,
    to,
    businessDate: property.businessDate,
    timezone: property.timezone,
    rangeStartIso: rangeStart,
    rangeEndIso: rangeEnd,
    documents: enriched,
    filters: { ...filters, from, to },
  });
}

async function loadProperty(
  db: FiscalRegistrationDb,
  restaurantId: string,
): Promise<{ businessDate: string; timezone: string }> {
  const result = await db
    .from("restaurants")
    .select("timezone, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error || !result.data) throw new FiscalRegistrationReportError();
  const timezone = text(result.data.timezone);
  if (!timezone) throw new FiscalRegistrationReportError();
  const persisted = text(result.data.business_date);
  return {
    timezone,
    businessDate: resolvePropertyBusinessDate(persisted ? persisted.slice(0, 10) : null, timezone),
  };
}

async function listRangedRegistrations(
  db: FiscalRegistrationDb,
  restaurantId: string,
  startIso: string,
  endIso: string,
): Promise<FiscalRegistrationSource[]> {
  const [byRegistered, byCreated] = await Promise.all([
    db
      .from("fiscal_registrations")
      .select(FISCAL_SELECT)
      .eq("restaurant_id", restaurantId)
      .gte("registered_at", startIso)
      .lt("registered_at", endIso)
      .order("registered_at", { ascending: false }),
    db
      .from("fiscal_registrations")
      .select(FISCAL_SELECT)
      .eq("restaurant_id", restaurantId)
      .is("registered_at", null)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false }),
  ]);
  if (byRegistered.error || byCreated.error) throw new FiscalRegistrationReportError();
  const rows = [...(byRegistered.data ?? []), ...(byCreated.data ?? [])];
  const mapped = rows.flatMap((row) => mapRegistrationRow(row, restaurantId));
  return uniqueById(mapped);
}

async function loadRegistrationsById(
  db: FiscalRegistrationDb,
  restaurantId: string,
  ids: string[],
): Promise<FiscalRegistrationSource[]> {
  const rows = await selectIn(db, "fiscal_registrations", FISCAL_SELECT, "id", ids, restaurantId);
  return rows.flatMap((row) => mapRegistrationRow(row, restaurantId));
}

async function loadChildrenByParent(
  db: FiscalRegistrationDb,
  restaurantId: string,
  parentIds: string[],
): Promise<FiscalRegistrationSource[]> {
  const rows = await selectIn(
    db,
    "fiscal_registrations",
    FISCAL_SELECT,
    "related_registration_id",
    parentIds,
    restaurantId,
  );
  return rows.flatMap((row) => mapRegistrationRow(row, restaurantId));
}

function mapRegistrationRow(
  row: Record<string, unknown>,
  restaurantId: string,
): FiscalRegistrationSource[] {
  if (text(row.restaurant_id) !== restaurantId) return [];
  const documentType = text(row.fiscal_document_type);
  if (!ALLOWED_DOC_TYPES.has(documentType)) return [];
  const sourceType = text(row.source_type);
  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) return [];
  if (
    documentType === "INV" &&
    sourceType !== "guest_invoice" &&
    sourceType !== "account_invoice"
  ) {
    return [];
  }
  if (
    (documentType === "CRE" || documentType === "DEB") &&
    sourceType !== "credit_note" &&
    sourceType !== "debit_note"
  ) {
    return [];
  }
  if (
    documentType === "SALES_RECEIPT" &&
    sourceType !== "guest_allocation" &&
    sourceType !== "account_allocation"
  ) {
    return [];
  }

  const requestSnapshot = row.request_snapshot ?? null;
  const clientSnapshot = row.client_snapshot ?? null;
  return [
    {
      id: text(row.id),
      restaurantId,
      documentType: documentType as FiscalReportDocumentType,
      sourceType,
      sourceId: text(row.source_id),
      relatedRegistrationId: text(row.related_registration_id) || null,
      status: text(row.status).toUpperCase() || "NOT_REGISTERED",
      trnxId: text(row.trnx_id),
      externalDocumentNumber: text(row.external_document_number) || null,
      externalIrn: text(row.external_irn) || null,
      externalRrn: text(row.external_rrn) || null,
      registeredAt: text(row.registered_at) || null,
      createdAt: text(row.created_at),
      requestSnapshot,
      clientSnapshot,
      partyName: fiscalPayloadParty(requestSnapshot, clientSnapshot),
      internalDocumentNumber: null,
      currency: fiscalPayloadCurrency(requestSnapshot),
      invoiceTotal: fiscalPayloadTotal(requestSnapshot),
    },
  ];
}

async function enrichDocuments(
  db: FiscalRegistrationDb,
  restaurantId: string,
  docs: FiscalRegistrationSource[],
): Promise<FiscalRegistrationSource[]> {
  const guestInvoiceIds = unique(
    docs.filter((doc) => doc.sourceType === "guest_invoice").map((doc) => doc.sourceId),
  );
  const accountInvoiceIds = unique(
    docs.filter((doc) => doc.sourceType === "account_invoice").map((doc) => doc.sourceId),
  );
  const noteIds = unique(
    docs
      .filter((doc) => doc.sourceType === "credit_note" || doc.sourceType === "debit_note")
      .map((doc) => doc.sourceId),
  );

  const [guestNumbers, accountNumbers, noteNumbers, guestNames, accountNames] = await Promise.all([
    loadIssuedNumbers(db, "guest_folio_invoices", restaurantId, guestInvoiceIds),
    loadIssuedNumbers(db, "financial_account_invoices", restaurantId, accountInvoiceIds),
    loadNoteNumbers(db, restaurantId, noteIds),
    loadGuestPartyNames(db, restaurantId, guestInvoiceIds),
    loadAccountPartyNames(db, restaurantId, accountInvoiceIds),
  ]);

  return docs.map((doc) => {
    let internalDocumentNumber = doc.internalDocumentNumber;
    let partyName = doc.partyName;
    if (doc.sourceType === "guest_invoice") {
      internalDocumentNumber = guestNumbers.get(doc.sourceId) ?? null;
      if (!partyName || partyName === "—") {
        partyName = guestNames.get(doc.sourceId) ?? partyName;
      }
    } else if (doc.sourceType === "account_invoice") {
      internalDocumentNumber = accountNumbers.get(doc.sourceId) ?? null;
      if (!partyName || partyName === "—") {
        partyName = accountNames.get(doc.sourceId) ?? partyName;
      }
    } else if (doc.sourceType === "credit_note" || doc.sourceType === "debit_note") {
      internalDocumentNumber = noteNumbers.get(doc.sourceId) ?? null;
    }
    return {
      ...doc,
      internalDocumentNumber,
      partyName: partyName || "—",
    };
  });
}

async function loadIssuedNumbers(
  db: FiscalRegistrationDb,
  table: "guest_folio_invoices" | "financial_account_invoices",
  restaurantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await selectIn(
    db,
    table,
    "id, restaurant_id, issued_number",
    "id",
    ids,
    restaurantId,
  );
  for (const row of rows) {
    const number = text(row.issued_number);
    if (number) map.set(text(row.id), number);
  }
  return map;
}

async function loadNoteNumbers(
  db: FiscalRegistrationDb,
  restaurantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await selectIn(
    db,
    "invoice_credit_notes",
    "id, restaurant_id, note_number",
    "id",
    ids,
    restaurantId,
  );
  for (const row of rows) {
    const number = text(row.note_number);
    if (number) map.set(text(row.id), number);
  }
  return map;
}

async function loadGuestPartyNames(
  db: FiscalRegistrationDb,
  restaurantId: string,
  invoiceIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (invoiceIds.length === 0) return map;
  const rows = await selectIn(
    db,
    "guest_folio_invoices",
    "id, restaurant_id, snapshot",
    "id",
    invoiceIds,
    restaurantId,
  );
  for (const row of rows) {
    const snapshot =
      row.snapshot && typeof row.snapshot === "object"
        ? (row.snapshot as { folio?: { guestName?: unknown } })
        : null;
    const name =
      typeof snapshot?.folio?.guestName === "string" ? snapshot.folio.guestName.trim() : "";
    if (name) map.set(text(row.id), name);
  }
  return map;
}

async function loadAccountPartyNames(
  db: FiscalRegistrationDb,
  restaurantId: string,
  invoiceIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (invoiceIds.length === 0) return map;
  const rows = await selectIn(
    db,
    "financial_account_invoices",
    "id, restaurant_id, snapshot",
    "id",
    invoiceIds,
    restaurantId,
  );
  for (const row of rows) {
    const snapshot =
      row.snapshot && typeof row.snapshot === "object"
        ? (row.snapshot as {
            billTo?: { name?: unknown };
            account?: { accountNumber?: unknown };
          })
        : null;
    const billTo = typeof snapshot?.billTo?.name === "string" ? snapshot.billTo.name.trim() : "";
    const account =
      typeof snapshot?.account?.accountNumber === "string"
        ? snapshot.account.accountNumber.trim()
        : "";
    const name = billTo || account;
    if (name) map.set(text(row.id), name);
  }
  return map;
}

async function selectIn(
  db: FiscalRegistrationDb,
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
    if (result.error) throw new FiscalRegistrationReportError();
    for (const row of result.data ?? []) {
      if (text(row.restaurant_id) === restaurantId) rows.push(row);
    }
  }
  return rows;
}

function assertDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new FiscalRegistrationReportError(`${label} must be a valid date.`);
  }
  return value;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueById(docs: FiscalRegistrationSource[]): FiscalRegistrationSource[] {
  const seen = new Set<string>();
  const out: FiscalRegistrationSource[] = [];
  for (const doc of docs) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    out.push(doc);
  }
  return out;
}
