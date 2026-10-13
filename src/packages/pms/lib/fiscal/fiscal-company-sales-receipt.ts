/**
 * Company B2B sales receipt.
 *
 * One active company payment allocation against one registered B2B invoice.
 * BuyerDetails and the invoice total come from the original INV request.
 * Remaining amount follows allocation order. FULL is the zero-remainder case
 * shown in the provider B2B example. Cancellation is not built here.
 */
import { propertyCalendarDate } from "../cashiering-control.ts";
import { fiscalMoney } from "./fiscal-guest-invoice.ts";
import {
  copyOriginalBuyerDetails,
  originalInvoiceTotal,
  parseOriginalFiscalInvoice,
} from "./fiscal-original-invoice.ts";

export const COMPANY_RECEIPT_REVERSAL_WARNING =
  "Fiscal Sales Receipt exists; external receipt cancellation is not yet implemented.";

export function companyReceiptTrnxId(allocationId: string): string {
  return `csr-${allocationId}`;
}

export function p7ReceiptEnabled(documentType: string, sourceType: string): boolean {
  return documentType === "SALES_RECEIPT" && sourceType === "account_allocation";
}

export type CompanyReceiptCoverage = "PARTIAL" | "FULL";

export type CompanyReceiptPreview = {
  invoiceNumber: string | null;
  companyName: string;
  fiscalDocumentNumber: string;
  invoiceIrn: string;
  tin: string | null;
  vatNumber: string | null;
  invoiceTotal: number;
  paid: number;
  remaining: number;
  coverage: CompanyReceiptCoverage;
  receiptDate: string;
};

export type CompanyReceiptPayload = {
  client: string;
  trnx_id: string;
  device_id: string;
  InvoiceIRN: string;
  ReceiptDate: string;
  source_date: string;
  tax_payer_tin: string;
  PaymentCoverage: CompanyReceiptCoverage;
  RemainingAmount: number;
  TransactionType: "B2B";
  InvoicePaidAmount: number;
  invoice_document_no: string;
  invoice_total_amount: number;
  info: { BuyerDetails: Record<string, unknown> };
};

export type CompanyReceiptInput = {
  amount: number;
  createdAt: string;
  reversed: boolean;
  reversalRow: boolean;
  paymentKind: "payment" | "deposit" | "other";
  accountKind: string;
  currency: string;
  invoiceNumber: string | null;
  timezone: string;
  hasAdjustingNotes: boolean;
  priors: Array<{ amount: number; fiscalRegistered: boolean }>;
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

export type CompanyReceiptAssessment =
  | { ok: true; payload: CompanyReceiptPayload; preview: CompanyReceiptPreview }
  | { ok: false; reasons: string[]; projection: CompanyReceiptPreview | null };

export function assessCompanyReceiptFiscal(
  allocationId: string,
  input: CompanyReceiptInput,
): CompanyReceiptAssessment {
  const reasons: string[] = [];
  if (input.accountKind !== "company") {
    reasons.push("Only a company payment allocation can be registered in this fiscal phase.");
  }
  if (input.reversalRow || input.amount < 0) {
    reasons.push("A reversal row cannot be registered as a fiscal sales receipt.");
  }
  if (input.reversed) {
    reasons.push("This allocation was reversed and is not eligible for a fiscal sales receipt.");
  }
  if (input.paymentKind === "deposit") reasons.push("Deposits are not fiscal sales receipts.");
  else if (input.paymentKind !== "payment") {
    reasons.push("Only a posted company payment allocation can be registered.");
  }
  if (input.amount <= 0.009) reasons.push("Allocation amount must be greater than zero.");
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
  const request = original ? parseOriginalFiscalInvoice(original.requestSnapshot) : null;
  const buyer = original ? copyOriginalBuyerDetails(original.requestSnapshot) : null;
  const invoiceTotal = original ? originalInvoiceTotal(original.requestSnapshot) : null;
  if (!original || original.status !== "REGISTERED") {
    reasons.push("Original invoice has not been fiscally registered.");
  } else {
    if (!original.irn?.trim()) reasons.push("Original fiscal IRN is missing.");
    if (!original.documentNumber?.trim())
      reasons.push("Original fiscal document number is missing.");
    if (!request) {
      reasons.push(
        original.requestSnapshot == null
          ? "Original fiscal request snapshot is unavailable."
          : "Original fiscal invoice uses an unsupported legacy request format.",
      );
    } else if (request.transactionType !== "B2B") {
      reasons.push("Only a B2B sales receipt can be registered in the current fiscal phase.");
    }
    if (request && !buyer) reasons.push("Original fiscal BuyerDetails are missing.");
  }
  if (input.priors.some((prior) => !prior.fiscalRegistered)) {
    reasons.push("An earlier payment allocation must be fiscalized first.");
  }
  const paid = fiscalMoney(Math.abs(input.amount));
  const priorTotal = fiscalMoney(
    input.priors.reduce((sum, prior) => sum + fiscalMoney(prior.amount), 0),
  );
  let projection: CompanyReceiptPreview | null = null;
  if (
    invoiceTotal != null &&
    original?.irn &&
    original.documentNumber &&
    request?.transactionType === "B2B" &&
    buyer &&
    paid > 0.009
  ) {
    const outstandingBefore = fiscalMoney(invoiceTotal - priorTotal);
    const remainingRaw = fiscalMoney(outstandingBefore - paid);
    if (outstandingBefore <= 0.01) {
      reasons.push("This invoice had no amount due before this allocation.");
    } else if (paid > outstandingBefore + 0.01) {
      reasons.push("This allocation exceeds the invoice amount that was outstanding before it.");
    }
    if (remainingRaw < -0.01) reasons.push("The sales receipt remaining amount is inconsistent.");
    const receiptDate = receiptDay(input.createdAt, input.timezone);
    if (!receiptDate) reasons.push("The allocation time is missing.");
    if (outstandingBefore > 0.01 && remainingRaw >= -0.01 && receiptDate) {
      const remaining = remainingRaw <= 0.01 ? 0 : remainingRaw;
      projection = {
        invoiceNumber: input.invoiceNumber,
        companyName: text(buyer.LegalName) ?? "",
        fiscalDocumentNumber: original.documentNumber.trim(),
        invoiceIrn: original.irn.trim(),
        tin: text(buyer.Tin),
        vatNumber: text(buyer.VatNumber),
        invoiceTotal,
        paid,
        remaining,
        coverage: remaining > 0.01 ? "PARTIAL" : "FULL",
        receiptDate,
      };
    }
  }
  if (reasons.length > 0 || !projection || !buyer || !original?.irn || !original.documentNumber) {
    return { ok: false, reasons, projection };
  }
  return {
    ok: true,
    preview: projection,
    payload: {
      client: input.connection.client.trim(),
      trnx_id: companyReceiptTrnxId(allocationId),
      device_id: input.connection.deviceId.trim(),
      InvoiceIRN: original.irn.trim(),
      ReceiptDate: projection.receiptDate,
      source_date: projection.receiptDate,
      tax_payer_tin: input.connection.taxpayerTin.trim(),
      PaymentCoverage: projection.coverage,
      RemainingAmount: projection.remaining,
      TransactionType: "B2B",
      InvoicePaidAmount: projection.paid,
      invoice_document_no: original.documentNumber.trim(),
      invoice_total_amount: projection.invoiceTotal,
      info: { BuyerDetails: buyer },
    },
  };
}

export function companyReceiptPreviewFromPayload(payload: unknown): CompanyReceiptPreview | null {
  const row = record(payload);
  const buyer = record(record(row?.info)?.BuyerDetails);
  if (!row || !buyer) return null;
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
    companyName: text(buyer.LegalName) ?? "",
    fiscalDocumentNumber: documentNumber,
    invoiceIrn: irn,
    tin: text(buyer.Tin),
    vatNumber: text(buyer.VatNumber),
    invoiceTotal: fiscalMoney(numberValue(row.invoice_total_amount)),
    paid: fiscalMoney(numberValue(row.InvoicePaidAmount)),
    remaining: fiscalMoney(numberValue(row.RemainingAmount)),
    coverage,
    receiptDate: date,
  };
}

function receiptDay(iso: string, timezone: string): string | null {
  if (Number.isNaN(new Date(iso).getTime())) return null;
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
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
