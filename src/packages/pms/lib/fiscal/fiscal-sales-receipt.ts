/**
 * Phase 5 sales-receipt payload builder.
 *
 * A fiscal sales receipt registers one active guest payment allocation against
 * one already-registered guest invoice. It does not post a payment. The request
 * is frozen when the registration row is created. Transaction type and, for
 * B2B, BuyerDetails are copied from the original INV snapshot.
 *
 * invoice_total_amount is the original INV ValueDetails.TotalValue.
 * InvoicePaidAmount is this allocation only. RemainingAmount is that fiscal
 * total minus active allocations up to and including this one, in created_at
 * then id order.
 *
 * PARTIAL matches a captured provider request. FULL, with remaining 0, is the
 * zero-outstanding counterpart and still needs a live provider check.
 * The live provider requires a top-level info object. A B2C receipt sends an
 * empty object. A B2B receipt sends the original INV BuyerDetails only.
 * Receipt cancellation is not built here.
 */
import { propertyCalendarDate } from "../cashiering-control.ts";
import { fiscalMoney } from "./fiscal-guest-invoice.ts";
import { copyOriginalBuyerDetails } from "./fiscal-original-invoice.ts";

export const FISCAL_P5_SOURCE = "guest_allocation" as const;
export const FISCAL_P5_DOCUMENT = "SALES_RECEIPT" as const;
export const SALES_RECEIPT_REVERSAL_WARNING =
  "Fiscal Sales Receipt exists; external receipt cancellation is not yet implemented.";

export function salesReceiptTrnxId(allocationId: string): string {
  return `gsr-${allocationId}`;
}

export function p5HandlerEnabled(documentType: string, sourceType: string): boolean {
  return documentType === FISCAL_P5_DOCUMENT && sourceType === FISCAL_P5_SOURCE;
}

export type SalesReceiptCoverage = "PARTIAL" | "FULL";

export type SalesReceiptPreview = {
  invoiceNumber: string | null;
  fiscalDocumentNumber: string;
  invoiceIrn: string;
  transactionType: "B2C" | "B2B";
  invoiceTotal: number;
  paid: number;
  remaining: number;
  coverage: SalesReceiptCoverage;
  receiptDate: string;
};

export type FiscalSalesReceiptPayload = {
  client: string;
  trnx_id: string;
  device_id: string;
  InvoiceIRN: string;
  ReceiptDate: string;
  source_date: string;
  tax_payer_tin: string;
  PaymentCoverage: SalesReceiptCoverage;
  RemainingAmount: number;
  TransactionType: "B2C" | "B2B";
  InvoicePaidAmount: number;
  invoice_document_no: string;
  invoice_total_amount: number;
  info: Record<string, never> | { BuyerDetails: Record<string, unknown> };
};

export type SalesReceiptPrior = {
  amount: number;
  fiscalRegistered: boolean;
};

export type SalesReceiptFiscalInput = {
  amount: number;
  createdAt: string;
  reversed: boolean;
  reversalRow: boolean;
  paymentKind: "payment" | "deposit" | "other";
  currency: string;
  invoiceNumber: string | null;
  timezone: string;
  hasAdjustingNotes: boolean;
  priors: SalesReceiptPrior[];
  connection: {
    enabled: boolean;
    taxpayerTin: string;
    client: string;
    deviceId: string;
    credentialsConfigured: boolean;
  };
  originalRegistration: {
    status: string;
    irn: string | null;
    documentNumber: string | null;
    requestSnapshot: unknown;
  } | null;
};

export type SalesReceiptFiscalAssessment =
  | { ok: true; payload: FiscalSalesReceiptPayload; preview: SalesReceiptPreview }
  | { ok: false; reasons: string[]; projection: SalesReceiptPreview | null };

export function assessSalesReceiptFiscal(
  allocationId: string,
  input: SalesReceiptFiscalInput,
): SalesReceiptFiscalAssessment {
  const reasons: string[] = [];
  if (input.reversalRow || input.amount < 0) {
    reasons.push("A reversal row cannot be registered as a fiscal sales receipt.");
  }
  if (input.reversed) {
    reasons.push("This allocation was reversed and is not eligible for a fiscal sales receipt.");
  }
  if (input.paymentKind === "deposit") {
    reasons.push("Deposits are not fiscal sales receipts.");
  } else if (input.paymentKind !== "payment") {
    reasons.push("Only a posted guest payment allocation can be registered.");
  }
  if (input.amount <= 0.009) {
    reasons.push("Allocation amount must be greater than zero.");
  }
  if (input.currency.trim().toUpperCase() !== "ETB") {
    reasons.push("Only ETB invoices are currently supported.");
  }
  if (input.hasAdjustingNotes) {
    reasons.push(
      "Sales Receipt for invoices adjusted by Credit/Debit Notes is not supported in the current fiscal phase.",
    );
  }
  if (!input.connection.enabled) reasons.push("The fiscal integration is disabled.");
  if (!input.connection.credentialsConfigured) {
    reasons.push("Fiscal API credentials have not been configured.");
  }
  if (
    input.connection.taxpayerTin.trim().length === 0 ||
    input.connection.client.trim().length === 0
  ) {
    reasons.push("The fiscal connection is incomplete.");
  }
  if (input.connection.deviceId.trim().length === 0) reasons.push("Device ID is missing.");

  const original = input.originalRegistration;
  const request = original ? parseSalesInvoice(original.requestSnapshot) : null;
  if (!original || original.status !== "REGISTERED") {
    reasons.push("Original invoice has not been fiscally registered.");
  } else {
    if (!original.irn || original.irn.trim().length === 0) {
      reasons.push("Original fiscal IRN is missing.");
    }
    if (!original.documentNumber || original.documentNumber.trim().length === 0) {
      reasons.push("Original fiscal document number is missing.");
    }
    if (!request) {
      reasons.push(
        original.requestSnapshot == null
          ? "Original fiscal request snapshot is unavailable."
          : "Original fiscal invoice uses an unsupported legacy request format.",
      );
    }
  }
  const inheritedBuyer =
    request?.transactionType === "B2B" ? copyOriginalBuyerDetails(original?.requestSnapshot) : null;
  if (request && request.transactionType !== "B2C" && request.transactionType !== "B2B") {
    reasons.push("Only a B2C or B2B sales receipt can be registered in the current fiscal phase.");
  }
  if (request?.transactionType === "B2B" && !inheritedBuyer) {
    reasons.push("Original fiscal BuyerDetails are missing.");
  }
  if (input.priors.some((prior) => !prior.fiscalRegistered)) {
    reasons.push("An earlier payment allocation must be fiscalized first.");
  }

  const paid = fiscalMoney(Math.abs(input.amount));
  const priorTotal = fiscalMoney(
    input.priors.reduce((sum, prior) => sum + fiscalMoney(prior.amount), 0),
  );
  const invoiceTotal = request ? request.total : null;
  let projection: SalesReceiptPreview | null = null;
  if (
    invoiceTotal != null &&
    original?.irn &&
    original.documentNumber &&
    (request?.transactionType === "B2C" ||
      (request?.transactionType === "B2B" && inheritedBuyer)) &&
    paid > 0.009
  ) {
    const outstandingBefore = fiscalMoney(invoiceTotal - priorTotal);
    const remainingRaw = fiscalMoney(outstandingBefore - paid);
    if (outstandingBefore <= 0.01) {
      reasons.push("This invoice had no amount due before this allocation.");
    } else if (paid > outstandingBefore + 0.01) {
      reasons.push("This allocation exceeds the invoice amount that was outstanding before it.");
    }
    if (remainingRaw < -0.01) {
      reasons.push("The sales receipt remaining amount is inconsistent.");
    }
    const receiptDate = receiptDay(input.createdAt, input.timezone);
    if (!receiptDate) reasons.push("The allocation time is missing.");
    if (outstandingBefore > 0.01 && remainingRaw >= -0.01 && receiptDate) {
      const remaining = remainingRaw <= 0.01 ? 0 : remainingRaw;
      projection = {
        invoiceNumber: input.invoiceNumber,
        fiscalDocumentNumber: original.documentNumber.trim(),
        invoiceIrn: original.irn.trim(),
        transactionType: request.transactionType === "B2B" ? "B2B" : "B2C",
        invoiceTotal,
        paid,
        remaining,
        coverage: remaining > 0.01 ? "PARTIAL" : "FULL",
        receiptDate,
      };
    }
  }

  if (reasons.length > 0 || !projection || !request || !original?.irn || !original.documentNumber) {
    return { ok: false, reasons, projection };
  }
  const payload: FiscalSalesReceiptPayload = {
    client: input.connection.client.trim(),
    trnx_id: salesReceiptTrnxId(allocationId),
    device_id: input.connection.deviceId.trim(),
    InvoiceIRN: original.irn.trim(),
    ReceiptDate: projection.receiptDate,
    source_date: projection.receiptDate,
    tax_payer_tin: input.connection.taxpayerTin.trim(),
    PaymentCoverage: projection.coverage,
    RemainingAmount: projection.remaining,
    TransactionType: projection.transactionType,
    InvoicePaidAmount: projection.paid,
    invoice_document_no: original.documentNumber.trim(),
    invoice_total_amount: projection.invoiceTotal,
    info:
      projection.transactionType === "B2B" && inheritedBuyer
        ? { BuyerDetails: inheritedBuyer }
        : {},
  };
  return { ok: true, payload, preview: projection };
}

export function salesReceiptPreviewFromPayload(payload: unknown): SalesReceiptPreview | null {
  const row = record(payload);
  if (!row) return null;
  const coverage =
    row.PaymentCoverage === "FULL" || row.PaymentCoverage === "PARTIAL"
      ? row.PaymentCoverage
      : null;
  const date = text(row.ReceiptDate);
  const irn = text(row.InvoiceIRN);
  const documentNumber = text(row.invoice_document_no);
  if (!coverage || !date || !irn || !documentNumber) return null;
  return {
    invoiceNumber: null,
    fiscalDocumentNumber: documentNumber,
    invoiceIrn: irn,
    transactionType: row.TransactionType === "B2B" ? "B2B" : "B2C",
    invoiceTotal: fiscalMoney(numberValue(row.invoice_total_amount)),
    paid: fiscalMoney(numberValue(row.InvoicePaidAmount)),
    remaining: fiscalMoney(numberValue(row.RemainingAmount)),
    coverage,
    receiptDate: date,
  };
}

function parseSalesInvoice(snapshot: unknown): { transactionType: string; total: number } | null {
  const row = record(snapshot);
  if (!row || row.Type !== "INV") return null;
  if ("ItemList" in row || "ValueDetails" in row) return null;
  const info = record(row.info);
  const details = record(info?.ValueDetails);
  if (!info || !details || !("TotalValue" in details)) return null;
  const total = numberValue(details.TotalValue);
  if (!Number.isFinite(total)) return null;
  const transactionType = typeof row.TransactionType === "string" ? row.TransactionType : "";
  if (!transactionType) return null;
  return { transactionType, total: fiscalMoney(total) };
}

function receiptDay(iso: string, timezone: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const day = propertyCalendarDate(iso, timezone.trim() || "UTC");
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
