/**
 * Fiscal Registration Excel / delivery helpers. Reuses write-excel-file via workbook writer.
 * Audit filters stay compact — no party names, amounts, or fiscal payloads.
 */
import {
  FISCAL_REGISTRATION_REPORT_CODE,
  FISCAL_REGISTRATION_TOO_LARGE_MESSAGE,
  type FiscalRegistrationReportResult,
  type FiscalReportDocumentTypeFilter,
  type FiscalReportModeFilter,
  type FiscalReportStatusFilter,
} from "./fiscal-registration-report.ts";
import type { PoliceAccessDb, PoliceSheetCell } from "./police-stay-export.ts";
import {
  POLICE_AUDIT_BLOCKED_MESSAGE,
  claimPoliceDelivery,
  releasePoliceDelivery,
  releasePoliceDeliveryLock,
  releasePoliceWorkbook,
} from "./police-stay-export.ts";

export {
  POLICE_AUDIT_BLOCKED_MESSAGE as FISCAL_AUDIT_BLOCKED_MESSAGE,
  claimPoliceDelivery as claimFiscalDelivery,
  releasePoliceDelivery as releaseFiscalDelivery,
  releasePoliceDeliveryLock as releaseFiscalDeliveryLock,
  releasePoliceWorkbook as releaseFiscalWorkbook,
};

export const FISCAL_EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const FISCAL_EXCEL_PREPARE_MESSAGE = "Unable to prepare the report for Excel export.";
export const FISCAL_EXCEL_AUDIT_MESSAGE = "Unable to record the report export.";
export const FISCAL_PRINT_PREPARE_MESSAGE = "Unable to prepare the full report for printing.";
export const FISCAL_EXCEL_TOO_LARGE_MESSAGE = FISCAL_REGISTRATION_TOO_LARGE_MESSAGE;

export const FISCAL_EXCEL_COLUMNS = [
  "Fiscal Document No.",
  "Registered / Created",
  "Document Type",
  "Party",
  "Mode",
  "Fiscal Status",
  "Invoice Total",
  "Sales Receipt",
  "Sales Receipt No.",
  "Sales Receipt Status",
  "Credit",
  "Debit",
  "Net Total",
  "Credit Fiscal Status",
  "Debit Fiscal Status",
  "Credit Documents",
  "Debit Documents",
  "Currency",
  "IRN",
  "RRN",
  "Internal Document No.",
] as const;

export function fiscalExcelFileName(input: { from: string; to: string }): string {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(input.from) ? input.from : "undated";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(input.to) ? input.to : from;
  const range = from === to ? from : `${from}-to-${to}`;
  return `fiscal-registration-report-${range}.xlsx`;
}

export function fiscalAccessSnapshot(filters: {
  from: string;
  to: string;
  documentType?: string | undefined;
  mode?: string | undefined;
  status?: string | undefined;
  query?: string | undefined;
}): Record<string, string> {
  const snapshot: Record<string, string> = {
    from: filters.from,
    to: filters.to,
    documentType:
      filters.documentType === "CRE" ||
      filters.documentType === "DEB" ||
      filters.documentType === "ALL"
        ? filters.documentType
        : "INV",
    mode:
      filters.mode === "CASH" || filters.mode === "CREDIT" || filters.mode === "ALL"
        ? filters.mode
        : "ALL",
    status: (filters.status ?? "ALL").toUpperCase(),
  };
  const query = filters.query?.trim();
  if (query) snapshot.query = query.slice(0, 120);
  return snapshot;
}

export async function recordFiscalReportAccess(
  db: PoliceAccessDb,
  input: {
    restaurantId: string;
    membershipId: string;
    userId: string | null;
    action: "print" | "excel_export";
    filters: {
      from: string;
      to: string;
      documentType?: string | undefined;
      mode?: string | undefined;
      status?: string | undefined;
      query?: string | undefined;
    };
    rowCount: number;
  },
): Promise<void> {
  if (!Number.isInteger(input.rowCount) || input.rowCount < 0) {
    throw new Error(POLICE_AUDIT_BLOCKED_MESSAGE);
  }
  const payload = {
    restaurant_id: input.restaurantId,
    report_code: FISCAL_REGISTRATION_REPORT_CODE,
    action: input.action,
    membership_id: input.membershipId,
    actor_user_id: input.userId,
    filters_snapshot: fiscalAccessSnapshot(input.filters),
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

export function fiscalWorkbookRows(
  result: FiscalRegistrationReportResult,
  propertyName: string,
  generatedAt: string,
): PoliceSheetCell[][] {
  const rows: PoliceSheetCell[][] = [
    [text(propertyName, true)],
    [text("Fiscal Registration Report", true)],
    [text("Date Range"), text(`${result.context.from} → ${result.context.to}`)],
    [text("Document Type"), text(result.context.documentType)],
    [text("Mode"), text(result.context.mode)],
    [text("Status"), text(result.context.status)],
    [text("Generated At"), text(generatedAt)],
  ];
  for (const total of result.totals) {
    rows.push([
      text(`Totals (${total.currency})`),
      text(
        `INV ${total.invoiceCount}/${money(total.invoiceTotal)} · CRE ${total.creditCount}/${money(total.creditTotal)} · DEB ${total.debitCount}/${money(total.debitTotal)} · SR ${total.salesReceiptCount}/${money(total.salesReceiptTotal)} · Registered ${total.registeredCount}`,
      ),
    ]);
  }
  rows.push([text("")]);
  rows.push(FISCAL_EXCEL_COLUMNS.map((column) => text(column, true)));
  for (const row of result.rows) {
    rows.push([
      text(row.fiscalDocumentNumber),
      text(row.eventAt.slice(0, 19).replace("T", " ")),
      text(row.documentType),
      text(row.partyName),
      text(row.mode ?? ""),
      text(row.fiscalStatus),
      number(row.invoiceTotal),
      numberOrBlank(row.salesReceiptTotal),
      text(row.salesReceiptNumber ?? ""),
      text(row.salesReceiptStatus ?? ""),
      numberOrBlank(row.creditTotal),
      numberOrBlank(row.debitTotal),
      numberOrBlank(row.netTotal),
      text(row.creditFiscalStatus ?? ""),
      text(row.debitFiscalStatus ?? ""),
      text(row.creditDocuments ?? ""),
      text(row.debitDocuments ?? ""),
      text(row.currency),
      text(row.externalIrn ?? ""),
      text(row.externalRrn ?? ""),
      text(row.internalDocumentNumber ?? ""),
    ]);
  }
  return rows;
}

export function fiscalDeliveryProblem(error: unknown): "too-large" | "audit" | "prepare" {
  const message = error instanceof Error ? error.message : "";
  if (message === FISCAL_REGISTRATION_TOO_LARGE_MESSAGE || /too large/i.test(message)) {
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

export type { FiscalReportDocumentTypeFilter, FiscalReportModeFilter, FiscalReportStatusFilter };
