/**
 * Fiscal Registration presentation helpers. Rows still come from getFiscalRegistrationReport.
 */
import {
  FISCAL_REGISTRATION_TOO_LARGE_MESSAGE,
  fiscalReportDocumentType,
  fiscalReportMode,
  fiscalReportStatus,
  type FiscalCurrencyTotals,
  type FiscalReportDocumentTypeFilter,
  type FiscalReportModeFilter,
  type FiscalReportStatusFilter,
} from "./fiscal-registration-report.ts";
import {
  DEFAULT_REPORT_PAGE_SIZE,
  reportsSearch,
  type ReportPageSize,
  type ReportsRouteSearch,
} from "./reports-shell.ts";
import { formatDateTimeInZone } from "../../../shared/lib/property-time.ts";

export const FISCAL_EMPTY_TITLE = "No fiscal registrations";
export const FISCAL_EMPTY_BODY = "No fiscal registrations match the selected filters.";

export const FISCAL_SUMMARY_COLUMNS = [
  "Fiscal Document No.",
  "Registered",
  "Party",
  "Mode",
  "Fiscal Status",
  "Invoice Total",
  "Sales Receipt",
  "Credit",
  "Debit",
  "Net Total",
  "Currency",
] as const;

export const FISCAL_PRINT_COLUMNS = [
  "Fiscal Document No.",
  "Registered / Created",
  "Type",
  "Party",
  "Mode",
  "Fiscal Status",
  "Invoice Total",
  "Sales Receipt",
  "Credit",
  "Debit",
  "Net Total",
  "Currency",
  "IRN",
  "RRN",
  "Internal No.",
] as const;

export function fiscalFilterSearch(input: {
  from: string;
  to: string;
  documentType?: FiscalReportDocumentTypeFilter | undefined;
  mode?: FiscalReportModeFilter | undefined;
  status?: FiscalReportStatusFilter | undefined;
  query?: string | undefined;
  page?: number | undefined;
  pageSize?: ReportPageSize | undefined;
}): ReportsRouteSearch {
  return reportsSearch(
    {
      kind: "row",
      report: "fiscal-registration",
      page: input.page ?? 1,
      pageSize: input.pageSize ?? DEFAULT_REPORT_PAGE_SIZE,
    },
    {
      from: input.from,
      to: input.to,
      documentType: input.documentType ?? "INV",
      ...(input.mode && input.mode !== "ALL" ? { mode: input.mode } : {}),
      ...(input.status && input.status !== "ALL" ? { status: input.status } : {}),
      ...(input.query ? { query: input.query } : {}),
      ...(input.page ? { page: input.page } : {}),
      ...(input.pageSize ? { pageSize: input.pageSize } : {}),
    },
  );
}

export function fiscalClearedSearch(businessDate: string): ReportsRouteSearch {
  return fiscalFilterSearch({
    from: businessDate,
    to: businessDate,
    documentType: "INV",
    mode: "ALL",
    status: "ALL",
    page: 1,
    pageSize: DEFAULT_REPORT_PAGE_SIZE,
  });
}

export function fiscalReportRequest(input: {
  restaurantId: string;
  from: string;
  to: string;
  documentType: FiscalReportDocumentTypeFilter;
  mode: FiscalReportModeFilter;
  status: FiscalReportStatusFilter;
  query?: string | undefined;
  page: number;
  pageSize: ReportPageSize;
  exportAll: boolean;
  action?: "print" | "excel_export" | undefined;
}) {
  return {
    restaurantId: input.restaurantId,
    from: input.from,
    to: input.to,
    documentType: input.documentType,
    mode: input.mode,
    status: input.status,
    page: input.page,
    pageSize: input.pageSize,
    ...(input.query ? { query: input.query } : {}),
    ...(input.exportAll ? { export: true as const, action: input.action ?? "print" } : {}),
  };
}

export function fiscalReportFailure(error: unknown): "access" | "too-large" | "load" {
  const message = error instanceof Error ? error.message : "";
  if (/don['’]t have access|do not have permission/i.test(message)) return "access";
  if (message === FISCAL_REGISTRATION_TOO_LARGE_MESSAGE || /too large/i.test(message)) {
    return "too-large";
  }
  return "load";
}

export function fiscalGeneratedLabel(nowIso: string, timezone: string): string {
  return formatDateTimeInZone(nowIso, timezone);
}

export function fiscalMoney(value: number): string {
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fiscalEventLabel(eventAt: string, timezone: string): string {
  return formatDateTimeInZone(eventAt, timezone);
}

export function fiscalDocumentTypeLabel(value: FiscalReportDocumentTypeFilter): string {
  if (value === "CRE") return "Credit Notes";
  if (value === "DEB") return "Debit Notes";
  if (value === "SR") return "Sales Receipts";
  if (value === "ALL") return "All";
  return "Invoices";
}

export function fiscalModeLabel(value: FiscalReportModeFilter): string {
  if (value === "CASH") return "Cash";
  if (value === "CREDIT") return "Credit";
  return "All modes";
}

export function fiscalStatusFilterLabel(value: FiscalReportStatusFilter): string {
  if (value === "ALL") return "All statuses";
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function fiscalTotalsCaption(
  totals: readonly FiscalCurrencyTotals[],
  documentType: FiscalReportDocumentTypeFilter,
): string[] {
  return totals.map((total) => {
    const prefix = totals.length > 1 ? `${total.currency}: ` : "";
    if (documentType === "CRE") {
      return `${prefix}${total.creditCount} credit note(s) · ${fiscalMoney(total.creditTotal)}`;
    }
    if (documentType === "DEB") {
      return `${prefix}${total.debitCount} debit note(s) · ${fiscalMoney(total.debitTotal)}`;
    }
    if (documentType === "SR") {
      return `${prefix}${total.salesReceiptCount} sales receipt(s) · ${fiscalMoney(total.salesReceiptTotal)}`;
    }
    const net = total.invoiceTotal + total.creditTotal + total.debitTotal;
    return `${prefix}INV ${fiscalMoney(total.invoiceTotal)} · CRE ${fiscalMoney(total.creditTotal)} · DEB ${fiscalMoney(total.debitTotal)} · Net ${fiscalMoney(net)} · SR ${fiscalMoney(total.salesReceiptTotal)} · Registered ${total.registeredCount}`;
  });
}

export { fiscalReportDocumentType, fiscalReportMode, fiscalReportStatus };
