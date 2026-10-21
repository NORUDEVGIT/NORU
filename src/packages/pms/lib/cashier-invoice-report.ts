/**
 * Cashier Invoice Report — issued document register.
 *
 * Source of truth is frozen issued documents, not live folio balances.
 * Default INV rows exclude coverage_scope = legacy_folio.
 * Related CRE/DEB are rolled onto the invoice row as Credit / Debit columns
 * (amounts + fiscal status), not as separate nested rows.
 * Detail rows are frozen invoice item lines with the same Credit / Debit columns.
 * Orphan CRE/DEB (no parent in set) and CRE/DEB-only filters remain their own rows.
 * Sales receipts, refunds, and write-offs are not document rows here.
 */
import {
  DEFAULT_REPORT_PAGE_SIZE,
  REPORT_PAGE_SIZES,
  type ReportPageSize,
} from "./reports-shell.ts";
import { fiscalInvoiceListStatus } from "./fiscal/fiscal-invoice-list-status.ts";
import { frozenFiscalMode } from "./fiscal/fiscal-document-mode.ts";

export const CASHIER_INVOICE_REPORT_CODE = "cashier-invoice";
export const CASHIER_INVOICE_SUMMARY_SAFETY_LIMIT = 5000;
export const CASHIER_INVOICE_DETAIL_SAFETY_LIMIT = 10000;

export const CASHIER_INVOICE_TOO_LARGE_MESSAGE =
  "The report is too large to export at once. Narrow the filters and try again.";

export const CASHIER_INVOICE_LOAD_FAILED = "The Cashier Invoice Report could not be loaded.";

export const CASHIER_DOCUMENT_TYPES = ["INV", "CRE", "DEB", "ALL"] as const;
export type CashierDocumentTypeFilter = (typeof CASHIER_DOCUMENT_TYPES)[number];
export type CashierDocumentType = "INV" | "CRE" | "DEB";

export const CASHIER_REPORT_GRAINS = ["summary", "detail"] as const;
export type CashierReportGrain = (typeof CASHIER_REPORT_GRAINS)[number];

export type CashierPartyType = "Guest" | "Company" | "Group";

export type CashierInvoiceReportFilters = {
  from: string;
  to: string;
  grain?: CashierReportGrain | undefined;
  documentType?: CashierDocumentTypeFilter | undefined;
  query?: string | undefined;
  issuerId?: string | undefined;
  page?: number | undefined;
  pageSize?: ReportPageSize | undefined;
  export?: boolean | undefined;
};

export type CashierInvoiceSourceDoc = {
  id: string;
  restaurantId: string;
  documentType: CashierDocumentType;
  documentNumber: string;
  issuedAt: string;
  partyType: CashierPartyType;
  partyName: string;
  currency: string;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  grandTotal: number;
  issuerMembershipId: string | null;
  issuerName: string | null;
  /** Guest invoice coverage. Account invoices are always modern. */
  coverageScope: "charge_groups" | "legacy_folio" | null;
  paymentMethods: readonly string[];
  fiscalStatuses: readonly string[];
  fiscalRequestSnapshot: unknown;
  externalDocumentNumber: string | null;
  externalRrn: string | null;
  /** For CRE/DEB: guest or account invoice id this note adjusts. */
  parentInvoiceId: string | null;
  /**
   * Parent INV loaded only so Detail can nest in-range CRE/DEB.
   * Excluded from Summary and from KPI totals.
   */
  detailAnchorOnly?: boolean | undefined;
  lines: readonly CashierInvoiceSourceLine[];
};

export type CashierInvoiceSourceLine = {
  id: string;
  sequence: number;
  item: string;
  quantity: number | null;
  unitAmount: number | null;
  preTaxAmount: number;
  taxAmount: number;
  taxCode: string | null;
  serviceCharge: number;
  lineTotal: number;
};

export type CashierNoteRollup = {
  creditTotal: number;
  debitTotal: number;
  creditFiscalStatus: string | null;
  debitFiscalStatus: string | null;
  creditDocuments: string | null;
  debitDocuments: string | null;
};

/** Invoice grand total adjusted by related credit/debit note amounts. */
export function cashierNetTotal(
  grandTotal: number,
  creditTotal: number | null | undefined,
  debitTotal: number | null | undefined,
): number {
  return roundMoney(grandTotal + (creditTotal ?? 0) + (debitTotal ?? 0));
}

export type CashierInvoiceSummaryRow = {
  id: string;
  documentNumber: string;
  issuedAt: string;
  documentType: CashierDocumentType;
  partyType: CashierPartyType;
  partyName: string;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  grandTotal: number;
  currency: string;
  issuedBy: string;
  paymentMethod: string;
  fiscalStatus: string;
  fiscalMode: string | null;
  externalDocumentNumber: string | null;
  externalRrn: string | null;
  creditTotal: number | null;
  debitTotal: number | null;
  /** Grand total + credit + debit for INV rows; null for standalone note rows. */
  netTotal: number | null;
  creditFiscalStatus: string | null;
  debitFiscalStatus: string | null;
  creditDocuments: string | null;
  debitDocuments: string | null;
};

export type CashierInvoiceDetailRow = {
  id: string;
  documentId: string;
  documentNumber: string;
  issuedAt: string;
  documentType: CashierDocumentType;
  partyType: CashierPartyType;
  partyName: string;
  item: string;
  quantity: number | null;
  unitAmount: number | null;
  preTaxAmount: number;
  taxAmount: number;
  taxCode: string | null;
  serviceCharge: number;
  lineTotal: number;
  currency: string;
  issuedBy: string;
  paymentMethod: string;
  fiscalStatus: string;
  fiscalMode: string | null;
  externalDocumentNumber: string | null;
  creditTotal: number | null;
  debitTotal: number | null;
  netTotal: number | null;
  creditFiscalStatus: string | null;
  debitFiscalStatus: string | null;
  creditDocuments: string | null;
  debitDocuments: string | null;
};

export type CashierCurrencyTotals = {
  currency: string;
  documentCount: number;
  invoiceCount: number;
  creditCount: number;
  debitCount: number;
  invoiceTotal: number;
  creditTotal: number;
  debitTotal: number;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  grandTotal: number;
};

export type CashierInvoiceReportResult = {
  grain: CashierReportGrain;
  rows: CashierInvoiceSummaryRow[] | CashierInvoiceDetailRow[];
  page: number;
  pageSize: number;
  total: number;
  totals: CashierCurrencyTotals[];
  legacyExcludedCount: number;
  context: {
    from: string;
    to: string;
    businessDate: string;
    timezone: string;
    documentType: CashierDocumentTypeFilter;
  };
  issuers: Array<{ id: string; name: string }>;
};

export class CashierInvoiceReportError extends Error {
  readonly code = "LOAD_FAILED" as const;

  constructor(message = CASHIER_INVOICE_LOAD_FAILED) {
    super(message);
    this.name = "CashierInvoiceReportError";
  }
}

export function cashierDocumentType(value: string | undefined): CashierDocumentTypeFilter {
  if (value === "CRE" || value === "DEB" || value === "ALL") return value;
  return "INV";
}

export function cashierReportGrain(value: string | undefined): CashierReportGrain {
  return value === "detail" ? "detail" : "summary";
}

/** Payment methods for presentation. Deposits are excluded. */
export function cashierPaymentMethodLabel(methods: readonly string[]): string {
  const cleaned = [
    ...new Set(
      methods
        .map((method) => method.trim())
        .filter((method) => method.length > 0 && method.toLowerCase() !== "deposit"),
    ),
  ];
  if (cleaned.length === 0) return "Unpaid";
  if (cleaned.length === 1) return cleaned[0] ?? "Unpaid";
  return "Mixed";
}

export function cashierFiscalStatusLabel(statuses: readonly string[]): string {
  const mapped = fiscalInvoiceListStatus(statuses);
  if (statuses.some((status) => status === "CANCELLED") && mapped === "not_registered") {
    return "Cancelled";
  }
  if (mapped === "registered") return "Registered";
  if (mapped === "error") return "Error";
  if (mapped === "queued") return "Queued";
  return "Not registered";
}

export function cashierFiscalModeLabel(snapshot: unknown): string | null {
  return frozenFiscalMode(snapshot);
}

export function isModernInvoiceDoc(doc: CashierInvoiceSourceDoc): boolean {
  if (doc.documentType !== "INV") return true;
  return doc.coverageScope !== "legacy_folio";
}

export function assembleCashierInvoiceReport(input: {
  restaurantId: string;
  from: string;
  to: string;
  businessDate: string;
  timezone: string;
  documents: readonly CashierInvoiceSourceDoc[];
  filters?: CashierInvoiceReportFilters;
}): CashierInvoiceReportResult {
  const grain = cashierReportGrain(input.filters?.grain);
  const documentType = cashierDocumentType(input.filters?.documentType);
  const query = (input.filters?.query ?? "").trim().toLowerCase();
  const issuerId = (input.filters?.issuerId ?? "").trim();
  const exportAll = input.filters?.export === true;

  const inProperty = input.documents.filter((doc) => doc.restaurantId === input.restaurantId);
  const legacyExcludedCount = inProperty.filter(
    (doc) => doc.documentType === "INV" && doc.coverageScope === "legacy_folio",
  ).length;

  const modern = inProperty.filter(isModernInvoiceDoc);
  const notesByParent = groupNotesByParent(modern);
  const built =
    grain === "detail"
      ? buildDetailRows({ modern, notesByParent, documentType, query, issuerId })
      : buildSummaryRows({ modern, notesByParent, documentType, query, issuerId });
  const rows = built.rows;
  const safety =
    grain === "detail" ? CASHIER_INVOICE_DETAIL_SAFETY_LIMIT : CASHIER_INVOICE_SUMMARY_SAFETY_LIMIT;
  if (rows.length > safety) {
    throw new CashierInvoiceReportError(CASHIER_INVOICE_TOO_LARGE_MESSAGE);
  }

  const pageSize = normalizePageSize(input.filters?.pageSize);
  const page = normalizePage(input.filters?.page);
  const pageRows = exportAll ? rows : rows.slice((page - 1) * pageSize, page * pageSize);

  return {
    grain,
    rows: pageRows,
    page: exportAll ? 1 : page,
    pageSize: exportAll ? rows.length || pageSize : pageSize,
    total: rows.length,
    totals: buildTotals(built.totalsDocs),
    legacyExcludedCount,
    context: {
      from: input.from,
      to: input.to,
      businessDate: input.businessDate,
      timezone: input.timezone,
      documentType,
    },
    issuers: issuerOptions(modern),
  };
}

function groupNotesByParent(
  modern: readonly CashierInvoiceSourceDoc[],
): Map<string, CashierInvoiceSourceDoc[]> {
  const invoices = new Set(modern.filter((doc) => doc.documentType === "INV").map((doc) => doc.id));
  const map = new Map<string, CashierInvoiceSourceDoc[]>();
  for (const note of modern) {
    if (note.documentType !== "CRE" && note.documentType !== "DEB") continue;
    const parentId = note.parentInvoiceId?.trim() || "";
    if (!parentId || !invoices.has(parentId)) continue;
    const list = map.get(parentId) ?? [];
    list.push(note);
    map.set(parentId, list);
  }
  for (const list of map.values()) {
    list.sort(compareDocuments);
  }
  return map;
}

function rollupNotes(notes: readonly CashierInvoiceSourceDoc[]): CashierNoteRollup {
  const credits = notes.filter((note) => note.documentType === "CRE");
  const debits = notes.filter((note) => note.documentType === "DEB");
  return {
    creditTotal: roundMoney(credits.reduce((sum, note) => sum + note.grandTotal, 0)),
    debitTotal: roundMoney(debits.reduce((sum, note) => sum + note.grandTotal, 0)),
    creditFiscalStatus: rollupFiscal(credits),
    debitFiscalStatus: rollupFiscal(debits),
    creditDocuments: documentList(credits),
    debitDocuments: documentList(debits),
  };
}

function rollupFiscal(notes: readonly CashierInvoiceSourceDoc[]): string | null {
  if (notes.length === 0) return null;
  const labels = [...new Set(notes.map((note) => cashierFiscalStatusLabel(note.fiscalStatuses)))];
  if (labels.length === 1) return labels[0] ?? null;
  return "Mixed";
}

function documentList(notes: readonly CashierInvoiceSourceDoc[]): string | null {
  if (notes.length === 0) return null;
  return notes.map((note) => note.documentNumber).join(", ");
}

function emptyRollup(): CashierNoteRollup {
  return {
    creditTotal: 0,
    debitTotal: 0,
    creditFiscalStatus: null,
    debitFiscalStatus: null,
    creditDocuments: null,
    debitDocuments: null,
  };
}

function buildSummaryRows(input: {
  modern: readonly CashierInvoiceSourceDoc[];
  notesByParent: Map<string, CashierInvoiceSourceDoc[]>;
  documentType: CashierDocumentTypeFilter;
  query: string;
  issuerId: string;
}): { rows: CashierInvoiceSummaryRow[]; totalsDocs: CashierInvoiceSourceDoc[] } {
  const invoices = input.modern.filter((doc) => doc.documentType === "INV");
  const notes = input.modern.filter(
    (doc) => (doc.documentType === "CRE" || doc.documentType === "DEB") && !doc.detailAnchorOnly,
  );

  if (input.documentType === "CRE" || input.documentType === "DEB") {
    const typed = notes
      .filter((note) => note.documentType === input.documentType)
      .filter((note) => matchesQuery(note, input.query))
      .filter((note) => matchesIssuer(note, input.issuerId))
      .sort(compareDocuments);
    return {
      rows: typed.map((note) => toSummaryRow(note, emptyRollup())),
      totalsDocs: typed,
    };
  }

  const selectedInvoices = invoices
    .filter((invoice) => {
      const children = input.notesByParent.get(invoice.id) ?? [];
      if (invoice.detailAnchorOnly && children.length === 0) return false;
      if (invoice.detailAnchorOnly) {
        return children.some(
          (note) => matchesQuery(note, input.query) && matchesIssuer(note, input.issuerId),
        );
      }
      return invoiceMatches(invoice, children, input);
    })
    .sort(compareDocuments);
  const selectedIds = new Set(selectedInvoices.map((doc) => doc.id));
  const rows: CashierInvoiceSummaryRow[] = [];
  const totalsDocs: CashierInvoiceSourceDoc[] = [];

  for (const invoice of selectedInvoices) {
    const related = input.notesByParent.get(invoice.id) ?? [];
    if (!invoice.detailAnchorOnly) totalsDocs.push(invoice);
    totalsDocs.push(...related.filter((note) => !note.detailAnchorOnly));
    rows.push(toSummaryRow(invoice, rollupNotes(related)));
  }

  if (input.documentType === "ALL") {
    const orphans = notes
      .filter((note) => {
        const parentId = note.parentInvoiceId?.trim() || "";
        return !parentId || !selectedIds.has(parentId);
      })
      .filter((note) => matchesQuery(note, input.query))
      .filter((note) => matchesIssuer(note, input.issuerId))
      .sort(compareDocuments);
    for (const note of orphans) {
      totalsDocs.push(note);
      rows.push(toSummaryRow(note, emptyRollup()));
    }
  }

  return { rows, totalsDocs: uniqueDocs(totalsDocs) };
}

/**
 * Detail: frozen invoice item lines only. Credit / Debit columns come from
 * related notes on that invoice — not separate CRE/DEB line rows.
 */
function buildDetailRows(input: {
  modern: readonly CashierInvoiceSourceDoc[];
  notesByParent: Map<string, CashierInvoiceSourceDoc[]>;
  documentType: CashierDocumentTypeFilter;
  query: string;
  issuerId: string;
}): { rows: CashierInvoiceDetailRow[]; totalsDocs: CashierInvoiceSourceDoc[] } {
  const invoices = input.modern.filter((doc) => doc.documentType === "INV");
  const notes = input.modern.filter(
    (doc) => doc.documentType === "CRE" || doc.documentType === "DEB",
  );

  if (input.documentType === "CRE" || input.documentType === "DEB") {
    const typed = notes
      .filter((note) => note.documentType === input.documentType)
      .filter((note) => matchesQuery(note, input.query))
      .filter((note) => matchesIssuer(note, input.issuerId))
      .sort(compareDocuments);
    return {
      rows: typed.flatMap((note) => linesForDoc(note, emptyRollup())),
      totalsDocs: typed,
    };
  }

  const selectedInvoices = invoices
    .filter((invoice) => invoiceMatches(invoice, input.notesByParent.get(invoice.id) ?? [], input))
    .sort(compareDocuments);
  const rows: CashierInvoiceDetailRow[] = [];
  const totalsDocs: CashierInvoiceSourceDoc[] = [];

  for (const invoice of selectedInvoices) {
    const related = input.notesByParent.get(invoice.id) ?? [];
    if (!invoice.detailAnchorOnly) totalsDocs.push(invoice);
    totalsDocs.push(...related.filter((note) => !note.detailAnchorOnly));
    rows.push(...linesForDoc(invoice, rollupNotes(related)));
  }

  return { rows, totalsDocs: uniqueDocs(totalsDocs) };
}

function invoiceMatches(
  invoice: CashierInvoiceSourceDoc,
  children: readonly CashierInvoiceSourceDoc[],
  input: { query: string; issuerId: string },
): boolean {
  if (!input.query && !input.issuerId) return !invoice.detailAnchorOnly || children.length > 0;
  if (!input.query) {
    return (
      matchesIssuer(invoice, input.issuerId) ||
      children.some((note) => matchesIssuer(note, input.issuerId))
    );
  }
  if (!input.issuerId) {
    return (
      matchesQuery(invoice, input.query) || children.some((note) => matchesQuery(note, input.query))
    );
  }
  return (
    (matchesQuery(invoice, input.query) && matchesIssuer(invoice, input.issuerId)) ||
    children.some((note) => matchesQuery(note, input.query) && matchesIssuer(note, input.issuerId))
  );
}

function matchesIssuer(doc: CashierInvoiceSourceDoc, issuerId: string): boolean {
  if (!issuerId) return true;
  return (doc.issuerMembershipId ?? "") === issuerId;
}

function linesForDoc(
  doc: CashierInvoiceSourceDoc,
  rollup: CashierNoteRollup,
): CashierInvoiceDetailRow[] {
  return [...doc.lines]
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    .map((line) => toDetailRow(doc, line, rollup));
}

function uniqueDocs(docs: readonly CashierInvoiceSourceDoc[]): CashierInvoiceSourceDoc[] {
  const seen = new Set<string>();
  const out: CashierInvoiceSourceDoc[] = [];
  for (const doc of docs) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    out.push(doc);
  }
  return out;
}

function matchesQuery(doc: CashierInvoiceSourceDoc, query: string): boolean {
  if (!query) return true;
  const haystack = [
    doc.documentNumber,
    doc.partyName,
    doc.externalDocumentNumber ?? "",
    doc.externalRrn ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function compareDocuments(left: CashierInvoiceSourceDoc, right: CashierInvoiceSourceDoc): number {
  const byDate = right.issuedAt.localeCompare(left.issuedAt);
  if (byDate !== 0) return byDate;
  const byNumber = left.documentNumber.localeCompare(right.documentNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (byNumber !== 0) return byNumber;
  return left.id.localeCompare(right.id);
}

function toSummaryRow(
  doc: CashierInvoiceSourceDoc,
  rollup: CashierNoteRollup,
): CashierInvoiceSummaryRow {
  const isInvoice = doc.documentType === "INV";
  return {
    id: doc.id,
    documentNumber: doc.documentNumber,
    issuedAt: doc.issuedAt,
    documentType: doc.documentType,
    partyType: doc.partyType,
    partyName: doc.partyName || "—",
    subtotal: doc.subtotal,
    tax: doc.tax,
    serviceCharge: doc.serviceCharge,
    grandTotal: doc.grandTotal,
    currency: doc.currency,
    issuedBy: doc.issuerName?.trim() || "—",
    paymentMethod: cashierPaymentMethodLabel(doc.paymentMethods),
    fiscalStatus: cashierFiscalStatusLabel(doc.fiscalStatuses),
    fiscalMode: cashierFiscalModeLabel(doc.fiscalRequestSnapshot),
    externalDocumentNumber: doc.externalDocumentNumber,
    externalRrn: doc.externalRrn,
    creditTotal: isInvoice ? rollup.creditTotal : null,
    debitTotal: isInvoice ? rollup.debitTotal : null,
    netTotal: isInvoice
      ? cashierNetTotal(doc.grandTotal, rollup.creditTotal, rollup.debitTotal)
      : null,
    creditFiscalStatus: isInvoice ? rollup.creditFiscalStatus : null,
    debitFiscalStatus: isInvoice ? rollup.debitFiscalStatus : null,
    creditDocuments: isInvoice ? rollup.creditDocuments : null,
    debitDocuments: isInvoice ? rollup.debitDocuments : null,
  };
}

function toDetailRow(
  doc: CashierInvoiceSourceDoc,
  line: CashierInvoiceSourceLine,
  rollup: CashierNoteRollup,
): CashierInvoiceDetailRow {
  const isInvoice = doc.documentType === "INV";
  return {
    id: `${doc.id}:${line.id}`,
    documentId: doc.id,
    documentNumber: doc.documentNumber,
    issuedAt: doc.issuedAt,
    documentType: doc.documentType,
    partyType: doc.partyType,
    partyName: doc.partyName || "—",
    item: line.item || "—",
    quantity: line.quantity,
    unitAmount: line.unitAmount,
    preTaxAmount: line.preTaxAmount,
    taxAmount: line.taxAmount,
    taxCode: line.taxCode,
    serviceCharge: line.serviceCharge,
    lineTotal: line.lineTotal,
    currency: doc.currency,
    issuedBy: doc.issuerName?.trim() || "—",
    paymentMethod: cashierPaymentMethodLabel(doc.paymentMethods),
    fiscalStatus: cashierFiscalStatusLabel(doc.fiscalStatuses),
    fiscalMode: cashierFiscalModeLabel(doc.fiscalRequestSnapshot),
    externalDocumentNumber: doc.externalDocumentNumber,
    creditTotal: isInvoice ? rollup.creditTotal : null,
    debitTotal: isInvoice ? rollup.debitTotal : null,
    netTotal: isInvoice
      ? cashierNetTotal(doc.grandTotal, rollup.creditTotal, rollup.debitTotal)
      : null,
    creditFiscalStatus: isInvoice ? rollup.creditFiscalStatus : null,
    debitFiscalStatus: isInvoice ? rollup.debitFiscalStatus : null,
    creditDocuments: isInvoice ? rollup.creditDocuments : null,
    debitDocuments: isInvoice ? rollup.debitDocuments : null,
  };
}

function buildTotals(docs: readonly CashierInvoiceSourceDoc[]): CashierCurrencyTotals[] {
  const byCurrency = new Map<string, CashierCurrencyTotals>();
  for (const doc of docs) {
    const currency = doc.currency || "—";
    const current = byCurrency.get(currency) ?? {
      currency,
      documentCount: 0,
      invoiceCount: 0,
      creditCount: 0,
      debitCount: 0,
      invoiceTotal: 0,
      creditTotal: 0,
      debitTotal: 0,
      subtotal: 0,
      tax: 0,
      serviceCharge: 0,
      grandTotal: 0,
    };
    current.documentCount += 1;
    if (doc.documentType === "INV") {
      current.invoiceCount += 1;
      current.invoiceTotal = roundMoney(current.invoiceTotal + doc.grandTotal);
      current.subtotal = roundMoney(current.subtotal + doc.subtotal);
      current.tax = roundMoney(current.tax + doc.tax);
      current.serviceCharge = roundMoney(current.serviceCharge + doc.serviceCharge);
      current.grandTotal = roundMoney(current.grandTotal + doc.grandTotal);
    } else if (doc.documentType === "CRE") {
      current.creditCount += 1;
      current.creditTotal = roundMoney(current.creditTotal + doc.grandTotal);
    } else {
      current.debitCount += 1;
      current.debitTotal = roundMoney(current.debitTotal + doc.grandTotal);
    }
    byCurrency.set(currency, current);
  }
  return [...byCurrency.values()].sort((left, right) =>
    left.currency.localeCompare(right.currency),
  );
}

function issuerOptions(
  docs: readonly CashierInvoiceSourceDoc[],
): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const doc of docs) {
    if (!doc.issuerMembershipId) continue;
    map.set(doc.issuerMembershipId, doc.issuerName?.trim() || "Staff");
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
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
