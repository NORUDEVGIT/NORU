/**
 * Fiscal Registration Report — provider fiscal outbox register.
 *
 * Source of truth is fiscal_registrations, not internal issued invoices.
 * One Summary row = one fiscal INV, with Sales Receipt / CRE / DEB rolled
 * into columns via related_registration_id. Mode is frozen request_snapshot.Mode.
 */
import {
  DEFAULT_REPORT_PAGE_SIZE,
  REPORT_PAGE_SIZES,
  type ReportPageSize,
} from "./reports-shell.ts";
import { frozenFiscalMode, type FiscalDocumentMode } from "./fiscal/fiscal-document-mode.ts";

export const FISCAL_REGISTRATION_REPORT_CODE = "fiscal-registration";
export const FISCAL_REGISTRATION_SAFETY_LIMIT = 5000;

export const FISCAL_REGISTRATION_TOO_LARGE_MESSAGE =
  "The report is too large to export at once. Narrow the filters and try again.";

export const FISCAL_REGISTRATION_LOAD_FAILED =
  "The Fiscal Registration Report could not be loaded.";

export const FISCAL_REPORT_DOCUMENT_TYPES = ["INV", "CRE", "DEB", "SR", "ALL"] as const;
export type FiscalReportDocumentTypeFilter = (typeof FISCAL_REPORT_DOCUMENT_TYPES)[number];
export type FiscalReportDocumentType = "INV" | "CRE" | "DEB" | "SALES_RECEIPT";

export const FISCAL_REPORT_MODES = ["CASH", "CREDIT", "ALL"] as const;
export type FiscalReportModeFilter = (typeof FISCAL_REPORT_MODES)[number];

export const FISCAL_REPORT_STATUSES = [
  "ALL",
  "NOT_REGISTERED",
  "BLOCKED",
  "PENDING",
  "REGISTERED",
  "FAILED",
  "CANCEL_PENDING",
  "CANCELLED",
] as const;
export type FiscalReportStatusFilter = (typeof FISCAL_REPORT_STATUSES)[number];

export type FiscalRegistrationReportFilters = {
  from: string;
  to: string;
  documentType?: FiscalReportDocumentTypeFilter | undefined;
  mode?: FiscalReportModeFilter | undefined;
  status?: FiscalReportStatusFilter | undefined;
  query?: string | undefined;
  page?: number | undefined;
  pageSize?: ReportPageSize | undefined;
  export?: boolean | undefined;
};

export type FiscalRegistrationSource = {
  id: string;
  restaurantId: string;
  documentType: FiscalReportDocumentType;
  sourceType: string;
  sourceId: string;
  relatedRegistrationId: string | null;
  status: string;
  trnxId: string;
  externalDocumentNumber: string | null;
  externalIrn: string | null;
  externalRrn: string | null;
  registeredAt: string | null;
  createdAt: string;
  requestSnapshot: unknown;
  clientSnapshot: unknown;
  partyName: string;
  internalDocumentNumber: string | null;
  currency: string;
  invoiceTotal: number;
  /** Parent INV registration loaded only to attach in-range CRE/DEB/SR. */
  detailAnchorOnly?: boolean | undefined;
};

export type FiscalRegistrationSummaryRow = {
  id: string;
  documentType: FiscalReportDocumentType;
  fiscalDocumentNumber: string;
  eventAt: string;
  partyName: string;
  mode: FiscalDocumentMode | null;
  fiscalStatus: string;
  invoiceTotal: number;
  currency: string;
  salesReceiptNumber: string | null;
  salesReceiptStatus: string | null;
  salesReceiptTotal: number | null;
  creditTotal: number | null;
  debitTotal: number | null;
  netTotal: number | null;
  creditFiscalStatus: string | null;
  debitFiscalStatus: string | null;
  creditDocuments: string | null;
  debitDocuments: string | null;
  externalIrn: string | null;
  externalRrn: string | null;
  internalDocumentNumber: string | null;
};

export type FiscalCurrencyTotals = {
  currency: string;
  invoiceCount: number;
  creditCount: number;
  debitCount: number;
  salesReceiptCount: number;
  invoiceTotal: number;
  creditTotal: number;
  debitTotal: number;
  salesReceiptTotal: number;
  registeredCount: number;
  failedCount: number;
  pendingCount: number;
};

export type FiscalRegistrationReportResult = {
  rows: FiscalRegistrationSummaryRow[];
  page: number;
  pageSize: number;
  total: number;
  totals: FiscalCurrencyTotals[];
  context: {
    from: string;
    to: string;
    businessDate: string;
    timezone: string;
    documentType: FiscalReportDocumentTypeFilter;
    mode: FiscalReportModeFilter;
    status: FiscalReportStatusFilter;
  };
};

export class FiscalRegistrationReportError extends Error {
  readonly code = "LOAD_FAILED" as const;

  constructor(message = FISCAL_REGISTRATION_LOAD_FAILED) {
    super(message);
    this.name = "FiscalRegistrationReportError";
  }
}

export function fiscalReportDocumentType(
  value: string | undefined,
): FiscalReportDocumentTypeFilter {
  if (value === "CRE" || value === "DEB" || value === "SR" || value === "ALL") return value;
  return "INV";
}

export function fiscalReportMode(value: string | undefined): FiscalReportModeFilter {
  if (value === "CASH" || value === "CREDIT" || value === "ALL") return value;
  return "ALL";
}

export function fiscalReportStatus(value: string | undefined): FiscalReportStatusFilter {
  const token = (value ?? "").trim().toUpperCase();
  if ((FISCAL_REPORT_STATUSES as readonly string[]).includes(token)) {
    return token as FiscalReportStatusFilter;
  }
  return "ALL";
}

export function fiscalStatusLabel(status: string): string {
  const token = status.trim().toUpperCase();
  if (token === "REGISTERED") return "Registered";
  if (token === "FAILED") return "Failed";
  if (token === "PENDING") return "Pending";
  if (token === "BLOCKED") return "Blocked";
  if (token === "CANCELLED") return "Cancelled";
  if (token === "CANCEL_PENDING") return "Cancel pending";
  if (token === "NOT_REGISTERED") return "Not registered";
  return token || "—";
}

export function fiscalDocumentNumber(doc: FiscalRegistrationSource): string {
  const external = (doc.externalDocumentNumber ?? "").trim();
  if (external) return external;
  const trnx = (doc.trnxId ?? "").trim();
  if (trnx) return trnx;
  return "—";
}

export function fiscalEventAt(doc: FiscalRegistrationSource): string {
  return (doc.registeredAt || doc.createdAt || "").trim();
}

export function fiscalNetTotal(
  invoiceTotal: number,
  creditTotal: number | null | undefined,
  debitTotal: number | null | undefined,
): number {
  return roundMoney(invoiceTotal + (creditTotal ?? 0) + (debitTotal ?? 0));
}

export function assembleFiscalRegistrationReport(input: {
  restaurantId: string;
  from: string;
  to: string;
  businessDate: string;
  timezone: string;
  rangeStartIso: string;
  rangeEndIso: string;
  documents: readonly FiscalRegistrationSource[];
  filters?: FiscalRegistrationReportFilters;
}): FiscalRegistrationReportResult {
  const documentType = fiscalReportDocumentType(input.filters?.documentType);
  const mode = fiscalReportMode(input.filters?.mode);
  const status = fiscalReportStatus(input.filters?.status);
  const query = (input.filters?.query ?? "").trim().toLowerCase();
  const exportAll = input.filters?.export === true;

  const inProperty = input.documents.filter((doc) => doc.restaurantId === input.restaurantId);
  const inRange = inProperty.filter((doc) => {
    if (doc.detailAnchorOnly) return true;
    const at = fiscalEventAt(doc);
    return at >= input.rangeStartIso && at < input.rangeEndIso;
  });

  const invoices = inRange.filter((doc) => doc.documentType === "INV");
  const notesInRange = inRange.filter(
    (doc) => doc.documentType === "CRE" || doc.documentType === "DEB",
  );
  const receiptsInRange = inRange.filter((doc) => doc.documentType === "SALES_RECEIPT");
  // Linked children may sit outside the date window; still roll them onto INV rows.
  const byParent = new Map<string, FiscalRegistrationSource[]>();
  for (const child of inProperty) {
    if (
      child.documentType !== "CRE" &&
      child.documentType !== "DEB" &&
      child.documentType !== "SALES_RECEIPT"
    ) {
      continue;
    }
    const parentId = (child.relatedRegistrationId ?? "").trim();
    if (!parentId) continue;
    const list = byParent.get(parentId) ?? [];
    list.push(child);
    byParent.set(parentId, list);
  }

  if (documentType === "CRE" || documentType === "DEB" || documentType === "SR") {
    const typed = (documentType === "SR" ? receiptsInRange : notesInRange)
      .filter((doc) => !doc.detailAnchorOnly)
      .filter((doc) =>
        documentType === "SR"
          ? doc.documentType === "SALES_RECEIPT"
          : doc.documentType === documentType,
      )
      .filter((doc) => matchesMode(doc, mode))
      .filter((doc) => matchesStatus(doc, status))
      .filter((doc) => matchesQuery(doc, query))
      .sort(compareDocs);
    return finish({
      rows: typed.map((doc) =>
        doc.documentType === "SALES_RECEIPT" ? toSalesReceiptRow(doc) : toNoteRow(doc),
      ),
      totalsDocs: typed,
      input,
      documentType,
      mode,
      status,
      exportAll,
      filters: input.filters,
    });
  }

  const selectedInvoices = invoices
    .filter((invoice) => {
      const children = byParent.get(invoice.id) ?? [];
      if (invoice.detailAnchorOnly) {
        return children.some(
          (child) =>
            (child.documentType === "CRE" ||
              child.documentType === "DEB" ||
              child.documentType === "SALES_RECEIPT") &&
            !child.detailAnchorOnly &&
            inRange.some((row) => row.id === child.id) &&
            matchesQuery(child, query),
        );
      }
      if (!matchesMode(invoice, mode)) return false;
      if (!matchesStatus(invoice, status)) return false;
      if (!query) return true;
      if (matchesQuery(invoice, query)) return true;
      return children.some((child) => matchesQuery(child, query));
    })
    .sort(compareDocs);

  const rows: FiscalRegistrationSummaryRow[] = [];
  const totalsDocs: FiscalRegistrationSource[] = [];
  const nestedIds = new Set<string>();

  for (const invoice of selectedInvoices) {
    const children = byParent.get(invoice.id) ?? [];
    if (!invoice.detailAnchorOnly) totalsDocs.push(invoice);
    for (const child of children) {
      if (!child.detailAnchorOnly) {
        nestedIds.add(child.id);
        totalsDocs.push(child);
      }
    }
    rows.push(toInvoiceRow(invoice, children));
  }

  if (documentType === "ALL") {
    const orphans = [...notesInRange, ...receiptsInRange]
      .filter((doc) => !doc.detailAnchorOnly && !nestedIds.has(doc.id))
      .filter((doc) => {
        const parentId = (doc.relatedRegistrationId ?? "").trim();
        return !parentId || !selectedInvoices.some((inv) => inv.id === parentId);
      })
      .filter((doc) => matchesMode(doc, mode))
      .filter((doc) => matchesStatus(doc, status))
      .filter((doc) => matchesQuery(doc, query))
      .sort(compareDocs);
    for (const orphan of orphans) {
      totalsDocs.push(orphan);
      rows.push(
        orphan.documentType === "SALES_RECEIPT" ? toSalesReceiptRow(orphan) : toNoteRow(orphan),
      );
    }
  }

  return finish({
    rows,
    totalsDocs: uniqueDocs(totalsDocs),
    input,
    documentType,
    mode,
    status,
    exportAll,
    filters: input.filters,
  });
}

function finish(args: {
  rows: FiscalRegistrationSummaryRow[];
  totalsDocs: FiscalRegistrationSource[];
  input: {
    from: string;
    to: string;
    businessDate: string;
    timezone: string;
  };
  documentType: FiscalReportDocumentTypeFilter;
  mode: FiscalReportModeFilter;
  status: FiscalReportStatusFilter;
  exportAll: boolean;
  filters?: FiscalRegistrationReportFilters | undefined;
}): FiscalRegistrationReportResult {
  if (args.rows.length > FISCAL_REGISTRATION_SAFETY_LIMIT) {
    throw new FiscalRegistrationReportError(FISCAL_REGISTRATION_TOO_LARGE_MESSAGE);
  }
  const pageSize = normalizePageSize(args.filters?.pageSize);
  const page = normalizePage(args.filters?.page);
  const pageRows = args.exportAll
    ? args.rows
    : args.rows.slice((page - 1) * pageSize, page * pageSize);
  return {
    rows: pageRows,
    page: args.exportAll ? 1 : page,
    pageSize: args.exportAll ? args.rows.length || pageSize : pageSize,
    total: args.rows.length,
    totals: buildTotals(args.totalsDocs),
    context: {
      from: args.input.from,
      to: args.input.to,
      businessDate: args.input.businessDate,
      timezone: args.input.timezone,
      documentType: args.documentType,
      mode: args.mode,
      status: args.status,
    },
  };
}

function uniqueDocs(docs: readonly FiscalRegistrationSource[]): FiscalRegistrationSource[] {
  const seen = new Set<string>();
  const out: FiscalRegistrationSource[] = [];
  for (const doc of docs) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    out.push(doc);
  }
  return out;
}

function toInvoiceRow(
  invoice: FiscalRegistrationSource,
  children: readonly FiscalRegistrationSource[],
): FiscalRegistrationSummaryRow {
  const credits = children.filter((doc) => doc.documentType === "CRE");
  const debits = children.filter((doc) => doc.documentType === "DEB");
  const receipts = children.filter((doc) => doc.documentType === "SALES_RECEIPT").sort(compareDocs);
  const creditTotal = roundMoney(credits.reduce((sum, doc) => sum - Math.abs(doc.invoiceTotal), 0));
  const debitTotal = roundMoney(debits.reduce((sum, doc) => sum + Math.abs(doc.invoiceTotal), 0));
  const mode = frozenFiscalMode(invoice.requestSnapshot);
  const salesReceiptTotal =
    mode === "CASH" || receipts.length === 0
      ? null
      : roundMoney(receipts.reduce((sum, doc) => sum + Math.abs(doc.invoiceTotal), 0));
  return {
    id: invoice.id,
    documentType: "INV",
    fiscalDocumentNumber: fiscalDocumentNumber(invoice),
    eventAt: fiscalEventAt(invoice),
    partyName: invoice.partyName || "—",
    mode,
    fiscalStatus: fiscalStatusLabel(invoice.status),
    invoiceTotal: invoice.invoiceTotal,
    currency: invoice.currency || "—",
    salesReceiptNumber: mode === "CASH" ? null : documentList(receipts),
    salesReceiptStatus: mode === "CASH" ? null : rollupStatus(receipts),
    salesReceiptTotal,
    creditTotal,
    debitTotal,
    netTotal: fiscalNetTotal(invoice.invoiceTotal, creditTotal, debitTotal),
    creditFiscalStatus: rollupStatus(credits),
    debitFiscalStatus: rollupStatus(debits),
    creditDocuments: documentList(credits),
    debitDocuments: documentList(debits),
    externalIrn: invoice.externalIrn,
    externalRrn: invoice.externalRrn,
    internalDocumentNumber: invoice.internalDocumentNumber,
  };
}

function toNoteRow(doc: FiscalRegistrationSource): FiscalRegistrationSummaryRow {
  const signed =
    doc.documentType === "CRE" ? -Math.abs(doc.invoiceTotal) : Math.abs(doc.invoiceTotal);
  return {
    id: doc.id,
    documentType: doc.documentType,
    fiscalDocumentNumber: fiscalDocumentNumber(doc),
    eventAt: fiscalEventAt(doc),
    partyName: doc.partyName || "—",
    mode: frozenFiscalMode(doc.requestSnapshot),
    fiscalStatus: fiscalStatusLabel(doc.status),
    invoiceTotal: signed,
    currency: doc.currency || "—",
    salesReceiptNumber: null,
    salesReceiptStatus: null,
    salesReceiptTotal: null,
    creditTotal: null,
    debitTotal: null,
    netTotal: null,
    creditFiscalStatus: null,
    debitFiscalStatus: null,
    creditDocuments: null,
    debitDocuments: null,
    externalIrn: doc.externalIrn,
    externalRrn: doc.externalRrn,
    internalDocumentNumber: doc.internalDocumentNumber,
  };
}

function toSalesReceiptRow(doc: FiscalRegistrationSource): FiscalRegistrationSummaryRow {
  return {
    id: doc.id,
    documentType: "SALES_RECEIPT",
    fiscalDocumentNumber: fiscalDocumentNumber(doc),
    eventAt: fiscalEventAt(doc),
    partyName: doc.partyName || "—",
    mode: frozenFiscalMode(doc.requestSnapshot),
    fiscalStatus: fiscalStatusLabel(doc.status),
    invoiceTotal: Math.abs(doc.invoiceTotal),
    currency: doc.currency || "—",
    salesReceiptNumber: fiscalDocumentNumber(doc),
    salesReceiptStatus: fiscalStatusLabel(doc.status),
    salesReceiptTotal: Math.abs(doc.invoiceTotal),
    creditTotal: null,
    debitTotal: null,
    netTotal: null,
    creditFiscalStatus: null,
    debitFiscalStatus: null,
    creditDocuments: null,
    debitDocuments: null,
    externalIrn: doc.externalIrn,
    externalRrn: doc.externalRrn,
    internalDocumentNumber: doc.internalDocumentNumber,
  };
}

function rollupStatus(docs: readonly FiscalRegistrationSource[]): string | null {
  if (docs.length === 0) return null;
  const labels = [...new Set(docs.map((doc) => fiscalStatusLabel(doc.status)))];
  if (labels.length === 1) return labels[0] ?? null;
  return "Mixed";
}

function documentList(docs: readonly FiscalRegistrationSource[]): string | null {
  if (docs.length === 0) return null;
  return docs.map((doc) => fiscalDocumentNumber(doc)).join(", ");
}

function matchesMode(doc: FiscalRegistrationSource, mode: FiscalReportModeFilter): boolean {
  if (mode === "ALL") return true;
  // Sales receipts are only issued against a CREDIT invoice, and their payload has no Mode.
  if (doc.documentType === "SALES_RECEIPT") return mode === "CREDIT";
  return frozenFiscalMode(doc.requestSnapshot) === mode;
}

function matchesStatus(doc: FiscalRegistrationSource, status: FiscalReportStatusFilter): boolean {
  if (status === "ALL") return true;
  return doc.status.trim().toUpperCase() === status;
}

function matchesQuery(doc: FiscalRegistrationSource, query: string): boolean {
  if (!query) return true;
  const haystack = [
    fiscalDocumentNumber(doc),
    doc.partyName,
    doc.externalIrn ?? "",
    doc.externalRrn ?? "",
    doc.internalDocumentNumber ?? "",
    doc.trnxId,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function compareDocs(left: FiscalRegistrationSource, right: FiscalRegistrationSource): number {
  const byDate = fiscalEventAt(right).localeCompare(fiscalEventAt(left));
  if (byDate !== 0) return byDate;
  return fiscalDocumentNumber(left).localeCompare(fiscalDocumentNumber(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function buildTotals(docs: readonly FiscalRegistrationSource[]): FiscalCurrencyTotals[] {
  const byCurrency = new Map<string, FiscalCurrencyTotals>();
  for (const doc of docs) {
    if (doc.detailAnchorOnly) continue;
    const currency = doc.currency || "—";
    const current = byCurrency.get(currency) ?? {
      currency,
      invoiceCount: 0,
      creditCount: 0,
      debitCount: 0,
      salesReceiptCount: 0,
      invoiceTotal: 0,
      creditTotal: 0,
      debitTotal: 0,
      salesReceiptTotal: 0,
      registeredCount: 0,
      failedCount: 0,
      pendingCount: 0,
    };
    if (doc.status === "REGISTERED") current.registeredCount += 1;
    if (doc.status === "FAILED" || doc.status === "BLOCKED") current.failedCount += 1;
    if (doc.status === "PENDING" || doc.status === "NOT_REGISTERED") current.pendingCount += 1;
    if (doc.documentType === "INV") {
      current.invoiceCount += 1;
      current.invoiceTotal = roundMoney(current.invoiceTotal + doc.invoiceTotal);
    } else if (doc.documentType === "CRE") {
      current.creditCount += 1;
      current.creditTotal = roundMoney(current.creditTotal - Math.abs(doc.invoiceTotal));
    } else if (doc.documentType === "DEB") {
      current.debitCount += 1;
      current.debitTotal = roundMoney(current.debitTotal + Math.abs(doc.invoiceTotal));
    } else if (doc.documentType === "SALES_RECEIPT") {
      current.salesReceiptCount += 1;
      current.salesReceiptTotal = roundMoney(
        current.salesReceiptTotal + Math.abs(doc.invoiceTotal),
      );
    }
    byCurrency.set(currency, current);
  }
  return [...byCurrency.values()].sort((left, right) =>
    left.currency.localeCompare(right.currency),
  );
}

function normalizePage(page: number | undefined): number {
  if (!page || !Number.isInteger(page) || page < 1) return 1;
  return page;
}

function normalizePageSize(pageSize: number | undefined): ReportPageSize {
  if (pageSize && (REPORT_PAGE_SIZES as readonly number[]).includes(pageSize)) {
    return pageSize as ReportPageSize;
  }
  return DEFAULT_REPORT_PAGE_SIZE;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Amount from a frozen fiscal request payload. INV/CRE/DEB carry
 * info.ValueDetails.TotalValue; Sales Receipts carry InvoicePaidAmount instead.
 */
export function fiscalPayloadTotal(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return 0;
  const payload = snapshot as {
    info?: { ValueDetails?: { TotalValue?: unknown } };
    InvoicePaidAmount?: unknown;
  };
  const total = payload.info?.ValueDetails?.TotalValue ?? payload.InvoicePaidAmount;
  if (total == null || total === "") return 0;
  const parsed = typeof total === "number" ? total : Number(total);
  return Number.isFinite(parsed) ? roundMoney(Math.abs(parsed)) : 0;
}

export function fiscalPayloadParty(snapshot: unknown, clientSnapshot: unknown): string {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const buyer = (snapshot as { info?: { BuyerDetails?: { LegalName?: unknown } } }).info
      ?.BuyerDetails;
    const legal = typeof buyer?.LegalName === "string" ? buyer.LegalName.trim() : "";
    if (legal) return legal;
  }
  if (typeof clientSnapshot === "string" && clientSnapshot.trim()) return clientSnapshot.trim();
  if (clientSnapshot && typeof clientSnapshot === "object" && !Array.isArray(clientSnapshot)) {
    const record = clientSnapshot as Record<string, unknown>;
    for (const key of ["name", "client", "legalName", "LegalName"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
    }
  }
  return "—";
}

export function fiscalPayloadCurrency(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return "ETB";
  const currency = (snapshot as { info?: { ValueDetails?: { InvoiceCurrency?: unknown } } }).info
    ?.ValueDetails?.InvoiceCurrency;
  return typeof currency === "string" && currency.trim() ? currency.trim() : "ETB";
}
