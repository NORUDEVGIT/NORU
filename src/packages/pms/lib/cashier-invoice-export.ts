/**
 * Cashier Invoice Excel / delivery helpers. Reuses write-excel-file via workbook writer.
 * Audit filters stay compact — no party names, amounts, or fiscal payloads.
 */
import {
  CASHIER_INVOICE_REPORT_CODE,
  CASHIER_INVOICE_TOO_LARGE_MESSAGE,
  type CashierDocumentTypeFilter,
  type CashierInvoiceDetailRow,
  type CashierInvoiceReportResult,
  type CashierInvoiceSummaryRow,
  type CashierReportGrain,
} from "./cashier-invoice-report.ts";
import type { PoliceAccessDb, PoliceSheetCell } from "./police-stay-export.ts";
import {
  POLICE_AUDIT_BLOCKED_MESSAGE,
  claimPoliceDelivery,
  releasePoliceDelivery,
  releasePoliceDeliveryLock,
  releasePoliceWorkbook,
} from "./police-stay-export.ts";

export {
  POLICE_AUDIT_BLOCKED_MESSAGE as CASHIER_AUDIT_BLOCKED_MESSAGE,
  claimPoliceDelivery as claimCashierDelivery,
  releasePoliceDelivery as releaseCashierDelivery,
  releasePoliceDeliveryLock as releaseCashierDeliveryLock,
  releasePoliceWorkbook as releaseCashierWorkbook,
};

export const CASHIER_EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const CASHIER_EXCEL_PREPARE_MESSAGE = "Unable to prepare the report for Excel export.";
export const CASHIER_EXCEL_AUDIT_MESSAGE = "Unable to record the report export.";
export const CASHIER_PRINT_PREPARE_MESSAGE = "Unable to prepare the full report for printing.";
export const CASHIER_EXCEL_TOO_LARGE_MESSAGE = CASHIER_INVOICE_TOO_LARGE_MESSAGE;

export const CASHIER_SUMMARY_EXCEL_COLUMNS = [
  "Document Number",
  "Issued Date",
  "Document Type",
  "Party Type",
  "Guest / Company / Group",
  "Subtotal",
  "Tax",
  "Service Charge",
  "Grand Total",
  "Credit",
  "Debit",
  "Net Total",
  "Credit Fiscal Status",
  "Debit Fiscal Status",
  "Credit Documents",
  "Debit Documents",
  "Currency",
  "Issued By",
  "Payment Method",
  "Fiscal Status",
  "Fiscal Mode",
  "External Fiscal Document Number",
  "RRN",
] as const;

export const CASHIER_DETAIL_EXCEL_COLUMNS = [
  "Document Number",
  "Issued Date",
  "Document Type",
  "Guest / Company / Group",
  "Item",
  "Quantity",
  "Unit Amount",
  "Pre-Tax Amount",
  "Tax Amount",
  "Tax Code",
  "Service Charge",
  "Line Total",
  "Credit",
  "Debit",
  "Net Total",
  "Credit Fiscal Status",
  "Debit Fiscal Status",
  "Currency",
  "Payment Method",
  "Issued By",
  "Fiscal Status",
  "Fiscal Mode",
  "External Fiscal Document Number",
] as const;

export function cashierExcelFileName(input: {
  from: string;
  to: string;
  grain: CashierReportGrain;
}): string {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(input.from) ? input.from : "undated";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(input.to) ? input.to : from;
  const range = from === to ? from : `${from}-to-${to}`;
  const detail = input.grain === "detail" ? "detail-" : "";
  return `cashier-invoice-${detail}report-${range}.xlsx`;
}

export function cashierAccessSnapshot(filters: {
  from: string;
  to: string;
  grain?: string | undefined;
  documentType?: string | undefined;
  query?: string | undefined;
  issuerId?: string | undefined;
}): Record<string, string> {
  const snapshot: Record<string, string> = {
    from: filters.from,
    to: filters.to,
    grain: filters.grain === "detail" ? "detail" : "summary",
    documentType:
      filters.documentType === "CRE" ||
      filters.documentType === "DEB" ||
      filters.documentType === "ALL"
        ? filters.documentType
        : "INV",
  };
  const query = filters.query?.trim();
  const issuerId = filters.issuerId?.trim();
  if (query) snapshot.query = query.slice(0, 120);
  if (issuerId) snapshot.issuerId = issuerId;
  return snapshot;
}

export async function recordCashierReportAccess(
  db: PoliceAccessDb,
  input: {
    restaurantId: string;
    membershipId: string;
    userId: string | null;
    action: "print" | "excel_export";
    filters: {
      from: string;
      to: string;
      grain?: string | undefined;
      documentType?: string | undefined;
      query?: string | undefined;
      issuerId?: string | undefined;
    };
    rowCount: number;
  },
): Promise<void> {
  if (!Number.isInteger(input.rowCount) || input.rowCount < 0) {
    throw new Error(POLICE_AUDIT_BLOCKED_MESSAGE);
  }
  const payload = {
    restaurant_id: input.restaurantId,
    report_code: CASHIER_INVOICE_REPORT_CODE,
    action: input.action,
    membership_id: input.membershipId,
    actor_user_id: input.userId,
    filters_snapshot: cashierAccessSnapshot(input.filters),
    row_count: input.rowCount,
  };
  try {
    const result = await db.from("pms_report_access_events").insert(payload);
    if (result.error) throw new Error(POLICE_AUDIT_BLOCKED_MESSAGE);
  } catch (error) {
    if (error instanceof Error && error.message === POLICE_AUDIT_BLOCKED_MESSAGE) throw error;
    throw new Error(POLICE_AUDIT_BLOCKED_MESSAGE);
  }
}

export function cashierWorkbookRows(
  result: CashierInvoiceReportResult,
  propertyName: string,
  generatedAt: string,
): PoliceSheetCell[][] {
  const rows: PoliceSheetCell[][] = [
    [text(propertyName, true)],
    [text("Cashier Invoice Report", true)],
    [text("Date Range"), text(`${result.context.from} → ${result.context.to}`)],
    [text("Document Type"), text(result.context.documentType)],
    [text("View"), text(result.grain === "detail" ? "Detail" : "Summary")],
    [text("Generated At"), text(generatedAt)],
  ];
  for (const total of result.totals) {
    rows.push([
      text(`Totals (${total.currency})`),
      text(
        `INV ${total.invoiceCount}/${money(total.invoiceTotal)} · CRE ${total.creditCount}/${money(total.creditTotal)} · DEB ${total.debitCount}/${money(total.debitTotal)}`,
      ),
    ]);
  }
  if (result.legacyExcludedCount > 0) {
    rows.push([
      text(`${result.legacyExcludedCount} legacy folio invoice(s) excluded from this register.`),
    ]);
  }
  rows.push([text("")]);
  if (result.grain === "detail") {
    rows.push(CASHIER_DETAIL_EXCEL_COLUMNS.map((column) => text(column, true)));
    for (const row of result.rows as CashierInvoiceDetailRow[]) {
      rows.push([
        text(row.documentNumber),
        text(row.issuedAt.slice(0, 19).replace("T", " ")),
        text(row.documentType),
        text(row.partyName),
        text(row.item),
        numberOrBlank(row.quantity),
        numberOrBlank(row.unitAmount),
        number(row.preTaxAmount),
        number(row.taxAmount),
        text(row.taxCode ?? ""),
        number(row.serviceCharge),
        number(row.lineTotal),
        numberOrBlank(row.creditTotal),
        numberOrBlank(row.debitTotal),
        numberOrBlank(row.netTotal),
        text(row.creditFiscalStatus ?? ""),
        text(row.debitFiscalStatus ?? ""),
        text(row.currency),
        text(row.paymentMethod),
        text(row.issuedBy),
        text(row.fiscalStatus),
        text(row.fiscalMode ?? ""),
        text(row.externalDocumentNumber ?? ""),
      ]);
    }
  } else {
    rows.push(CASHIER_SUMMARY_EXCEL_COLUMNS.map((column) => text(column, true)));
    for (const row of result.rows as CashierInvoiceSummaryRow[]) {
      rows.push([
        text(row.documentNumber),
        text(row.issuedAt.slice(0, 19).replace("T", " ")),
        text(row.documentType),
        text(row.partyType),
        text(row.partyName),
        number(row.subtotal),
        number(row.tax),
        number(row.serviceCharge),
        number(row.grandTotal),
        numberOrBlank(row.creditTotal),
        numberOrBlank(row.debitTotal),
        numberOrBlank(row.netTotal),
        text(row.creditFiscalStatus ?? ""),
        text(row.debitFiscalStatus ?? ""),
        text(row.creditDocuments ?? ""),
        text(row.debitDocuments ?? ""),
        text(row.currency),
        text(row.issuedBy),
        text(row.paymentMethod),
        text(row.fiscalStatus),
        text(row.fiscalMode ?? ""),
        text(row.externalDocumentNumber ?? ""),
        text(row.externalRrn ?? ""),
      ]);
    }
  }
  return rows;
}

export function cashierDeliveryProblem(error: unknown): "too-large" | "audit" | "prepare" {
  const message = error instanceof Error ? error.message : "";
  if (message === CASHIER_INVOICE_TOO_LARGE_MESSAGE || /too large/i.test(message)) {
    return "too-large";
  }
  if (/record report access|record the report export/i.test(message)) return "audit";
  return "prepare";
}

function text(value: string, bold = false): PoliceSheetCell {
  return bold ? { kind: "text", value, bold: true } : { kind: "text", value };
}

function number(value: number, bold = false): PoliceSheetCell {
  return bold ? { kind: "number", value, bold: true } : { kind: "number", value };
}

function numberOrBlank(value: number | null): PoliceSheetCell {
  return value == null ? text("") : number(value);
}

function money(value: number): string {
  return value.toFixed(2);
}

export type { CashierDocumentTypeFilter };
