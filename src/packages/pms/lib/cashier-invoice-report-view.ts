/**
 * Cashier Invoice presentation helpers. Rows still come from getCashierInvoiceReport.
 */
import {
  CASHIER_INVOICE_TOO_LARGE_MESSAGE,
  cashierDocumentType,
  cashierReportGrain,
  type CashierCurrencyTotals,
  type CashierDocumentTypeFilter,
  type CashierInvoiceDetailRow,
  type CashierInvoiceSummaryRow,
  type CashierReportGrain,
} from "./cashier-invoice-report.ts";
import {
  DEFAULT_REPORT_PAGE_SIZE,
  reportsSearch,
  type ReportPageSize,
  type ReportsRouteSearch,
} from "./reports-shell.ts";
import { formatDateTimeInZone } from "../../../shared/lib/property-time.ts";

export const CASHIER_EMPTY_TITLE = "No issued documents";
export const CASHIER_EMPTY_BODY = "No issued documents match the selected filters.";

export const CASHIER_SUMMARY_COLUMNS = [
  "Document No.",
  "Issued",
  "Type",
  "Guest / Company / Group",
  "Subtotal",
  "Tax",
  "Service",
  "Grand Total",
  "Credit",
  "Debit",
  "Net Total",
  "Currency",
  "Issued By",
  "Fiscal Status",
] as const;

export const CASHIER_DETAIL_COLUMNS = [
  "Document No.",
  "Issued",
  "Party",
  "Item",
  "Qty",
  "Unit",
  "Pre-Tax",
  "Tax",
  "Service",
  "Line Total",
  "Credit",
  "Debit",
  "Net Total",
  "Currency",
  "Fiscal Status",
] as const;

export const CASHIER_PRINT_SUMMARY_COLUMNS = [
  "Document No.",
  "Issued Date",
  "Type",
  "Guest / Company / Group",
  "Subtotal",
  "Tax",
  "Service Charge",
  "Grand Total",
  "Credit",
  "Debit",
  "Net Total",
  "Currency",
  "Issued By",
  "Fiscal Status",
] as const;

export function cashierFilterSearch(input: {
  from: string;
  to: string;
  grain?: CashierReportGrain | undefined;
  documentType?: CashierDocumentTypeFilter | undefined;
  query?: string | undefined;
  issuer?: string | undefined;
  page?: number | undefined;
  pageSize?: ReportPageSize | undefined;
}): ReportsRouteSearch {
  return reportsSearch(
    {
      kind: "row",
      report: "cashier-invoice",
      page: input.page ?? 1,
      pageSize: input.pageSize ?? DEFAULT_REPORT_PAGE_SIZE,
    },
    {
      from: input.from,
      to: input.to,
      documentType: input.documentType ?? "INV",
      ...(input.grain === "detail" ? { grain: "detail" } : {}),
      ...(input.query ? { query: input.query } : {}),
      ...(input.issuer ? { issuer: input.issuer } : {}),
      ...(input.page ? { page: input.page } : {}),
      ...(input.pageSize ? { pageSize: input.pageSize } : {}),
    },
  );
}

export function cashierClearedSearch(businessDate: string): ReportsRouteSearch {
  return cashierFilterSearch({
    from: businessDate,
    to: businessDate,
    grain: "summary",
    documentType: "INV",
    page: 1,
    pageSize: DEFAULT_REPORT_PAGE_SIZE,
  });
}

export function cashierReportRequest(input: {
  restaurantId: string;
  from: string;
  to: string;
  grain: CashierReportGrain;
  documentType: CashierDocumentTypeFilter;
  query?: string | undefined;
  issuerId?: string | undefined;
  page: number;
  pageSize: ReportPageSize;
  exportAll: boolean;
  action?: "print" | "excel_export" | undefined;
}) {
  return {
    restaurantId: input.restaurantId,
    from: input.from,
    to: input.to,
    grain: input.grain,
    documentType: input.documentType,
    page: input.page,
    pageSize: input.pageSize,
    ...(input.query ? { query: input.query } : {}),
    ...(input.issuerId ? { issuerId: input.issuerId } : {}),
    ...(input.exportAll ? { export: true as const, action: input.action ?? "print" } : {}),
  };
}

export function cashierReportFailure(error: unknown): "access" | "too-large" | "load" {
  const message = error instanceof Error ? error.message : "";
  if (/don['’]t have access|do not have permission/i.test(message)) return "access";
  if (message === CASHIER_INVOICE_TOO_LARGE_MESSAGE || /too large/i.test(message)) {
    return "too-large";
  }
  return "load";
}

export function cashierGeneratedLabel(nowIso: string, timezone: string): string {
  return formatDateTimeInZone(nowIso, timezone);
}

export function cashierMoney(value: number): string {
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function cashierIssuedLabel(issuedAt: string, timezone: string): string {
  return formatDateTimeInZone(issuedAt, timezone);
}

export function cashierDocumentTypeLabel(value: CashierDocumentTypeFilter): string {
  if (value === "CRE") return "Credit Notes";
  if (value === "DEB") return "Debit Notes";
  if (value === "ALL") return "All";
  return "Invoices";
}

export function cashierTotalsCaption(
  totals: readonly CashierCurrencyTotals[],
  documentType: CashierDocumentTypeFilter,
): string[] {
  return totals.map((total) => {
    const prefix = totals.length > 1 ? `${total.currency}: ` : "";
    if (documentType === "CRE") {
      return `${prefix}${total.creditCount} credit note(s) · ${cashierMoney(total.creditTotal)}`;
    }
    if (documentType === "DEB") {
      return `${prefix}${total.debitCount} debit note(s) · ${cashierMoney(total.debitTotal)}`;
    }
    if (documentType === "ALL") {
      const net = total.invoiceTotal + total.creditTotal + total.debitTotal;
      return `${prefix}INV ${cashierMoney(total.invoiceTotal)} · CRE ${cashierMoney(total.creditTotal)} · DEB ${cashierMoney(total.debitTotal)} · Net Documents ${cashierMoney(net)}`;
    }
    return `${prefix}${total.documentCount} document(s) · Subtotal ${cashierMoney(total.subtotal)} · Tax ${cashierMoney(total.tax)} · Service ${cashierMoney(total.serviceCharge)} · Grand Total ${cashierMoney(total.grandTotal)}`;
  });
}

export function isCashierSummaryRow(
  row: CashierInvoiceSummaryRow | CashierInvoiceDetailRow,
): row is CashierInvoiceSummaryRow {
  return "grandTotal" in row;
}

export function isCashierDetailRow(
  row: CashierInvoiceSummaryRow | CashierInvoiceDetailRow,
): row is CashierInvoiceDetailRow {
  return "lineTotal" in row;
}
