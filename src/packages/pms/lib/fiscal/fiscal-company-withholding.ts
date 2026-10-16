/**
 * Company fiscal withholding.
 *
 * The request is built once from the withholding certificate and the original
 * registered B2B invoice snapshot. Amounts stay frozen. NORU does not calculate
 * a withholding rate. Cancellation is not built here.
 */
import { fiscalMoney } from "./fiscal-guest-invoice.ts";
import { copyOriginalBuyerDetails, parseOriginalFiscalInvoice } from "./fiscal-original-invoice.ts";

export const WITHHOLDING_NOTE_REASON =
  "Fiscal withholding is not yet supported for an invoice adjusted by a Credit or Debit Note.";

export function companyWithholdingTrnxId(certificateId: string): string {
  return `cwh-${certificateId}`;
}

export function p8HandlerEnabled(documentType: string, sourceType: string): boolean {
  return documentType === "WITHHOLDING" && sourceType === "withholding";
}

export type WithholdingPayload = {
  tax_payer_tin: string;
  client: string;
  device_id: string;
  trnx_id: string;
  invoice_buyer_tin: string;
  invoice_date: string;
  PreTaxAmount: number;
  WithholdingAmount: number;
  invoice_irn: string;
  info: { BuyerDetails: Record<string, unknown> };
  source_date: string;
};

export type WithholdingPreview = {
  companyName: string;
  invoiceNumber: string | null;
  certificateDate: string;
  buyerTin: string;
  invoiceIrn: string;
  pretaxBase: number;
  amount: number;
};

export type WithholdingFiscalInput = {
  amount: number;
  pretaxBase: number;
  certificateDate: string;
  reversed: boolean;
  reversalRow: boolean;
  accountKind: string;
  currency: string;
  invoiceNumber: string | null;
  hasAdjustingNotes: boolean;
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
    requestSnapshot: unknown;
  } | null;
};

export type WithholdingAssessment =
  | { ok: true; payload: WithholdingPayload; preview: WithholdingPreview }
  | { ok: false; reasons: string[]; projection: WithholdingPreview | null };

export function assessCompanyWithholdingFiscal(
  certificateId: string,
  input: WithholdingFiscalInput,
): WithholdingAssessment {
  const reasons: string[] = [];
  if (input.reversalRow) {
    reasons.push("A reversal cannot be registered as fiscal withholding.");
  }
  if (input.reversed) {
    reasons.push("This withholding certificate was reversed and cannot be fiscalized.");
  }
  if (input.accountKind !== "company") {
    reasons.push("Only a company withholding certificate can be registered in this fiscal phase.");
  }
  if (input.currency.trim().toUpperCase() !== "ETB") {
    reasons.push("Only ETB invoices are currently supported.");
  }
  if (!(input.amount > 0)) reasons.push("Withholding amount must be greater than zero.");
  if (!(input.pretaxBase > 0)) reasons.push("Pretax base must be greater than zero.");
  if (input.hasAdjustingNotes) reasons.push(WITHHOLDING_NOTE_REASON);
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
  const invoiceDate = fiscalInvoiceCalendarDate(record(original?.requestSnapshot)?.Date);
  const sourceDate = calendarDay(input.certificateDate);
  const buyerTin = text(buyer?.Tin);
  if (!original || original.status !== "REGISTERED") {
    reasons.push("Original invoice has not been fiscally registered.");
  } else {
    if (!original.irn?.trim()) reasons.push("Original fiscal IRN is missing.");
    if (!request) {
      reasons.push(
        original.requestSnapshot == null
          ? "Original fiscal request snapshot is unavailable."
          : "Original fiscal invoice uses an unsupported legacy request format.",
      );
    } else if (request.transactionType !== "B2B") {
      reasons.push("Only a B2B invoice can be the source of fiscal withholding.");
    }
    if (request && !buyer) reasons.push("Original fiscal BuyerDetails are missing.");
    if (buyer && !buyerTin) reasons.push("Original fiscal buyer TIN is missing.");
    if (request && !invoiceDate) reasons.push("Original fiscal invoice date is missing.");
  }
  if (!sourceDate) reasons.push("The certificate date is missing.");

  const preview =
    buyer && original?.irn?.trim() && buyerTin && sourceDate
      ? {
          companyName: text(buyer.LegalName) ?? "",
          invoiceNumber: input.invoiceNumber,
          certificateDate: sourceDate,
          buyerTin,
          invoiceIrn: original.irn.trim(),
          pretaxBase: fiscalMoney(input.pretaxBase),
          amount: fiscalMoney(input.amount),
        }
      : null;
  if (
    reasons.length > 0 ||
    !preview ||
    !buyer ||
    !buyerTin ||
    !original?.irn ||
    !invoiceDate ||
    !sourceDate ||
    request?.transactionType !== "B2B"
  ) {
    return { ok: false, reasons, projection: preview };
  }
  return {
    ok: true,
    preview,
    payload: {
      tax_payer_tin: input.connection.taxpayerTin.trim(),
      client: input.connection.client.trim(),
      device_id: input.connection.deviceId.trim(),
      trnx_id: companyWithholdingTrnxId(certificateId),
      invoice_buyer_tin: buyerTin,
      invoice_date: invoiceDate,
      PreTaxAmount: fiscalMoney(input.pretaxBase),
      WithholdingAmount: fiscalMoney(input.amount),
      invoice_irn: original.irn.trim(),
      info: { BuyerDetails: buyer },
      source_date: sourceDate,
    },
  };
}

/** Converts a stored fiscal document Date (DD-MM-YYYYTHH:mm:ss) to YYYY-MM-DD. */
export function fiscalInvoiceCalendarDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})T\d{2}:\d{2}:\d{2}$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function withholdingPreviewFromPayload(payload: unknown): WithholdingPreview | null {
  const row = record(payload);
  const buyer = record(record(row?.info)?.BuyerDetails);
  if (!row || typeof row.WithholdingAmount !== "number" || !buyer) return null;
  const date = calendarDay(row.source_date);
  const irn = text(row.invoice_irn);
  const tin = text(row.invoice_buyer_tin);
  if (!date || !irn || !tin) return null;
  return {
    companyName: text(buyer.LegalName) ?? "",
    invoiceNumber: null,
    certificateDate: date,
    buyerTin: tin,
    invoiceIrn: irn,
    pretaxBase: fiscalMoney(Number(row.PreTaxAmount)),
    amount: fiscalMoney(row.WithholdingAmount),
  };
}

/**
 * Withholding success is not an invoice. Status A and a receipt number are
 * required. IRN and document number are not.
 */
export function parseFiscalWithholdingSuccess(body: unknown):
  | {
      ok: true;
      irn: null;
      documentNumber: null;
      externalId: string | null;
      externalRrn: string;
      acknowledgedAtRaw: null;
      acknowledgedAt: null;
      signedQr: string | null;
      signedInvoice: null;
      externalStatus: string;
    }
  | { ok: false; fatal: boolean; message: string } {
  const source = withholdingBody(body);
  if (!source) {
    return {
      ok: false,
      fatal: true,
      message: "The fiscal service returned an unexpected withholding response.",
    };
  }
  const status = typeof source.status === "string" ? source.status.trim() : "";
  const rrn = text(source.rrn);
  if (status !== "A" || !rrn) {
    return {
      ok: false,
      fatal: true,
      message: "The fiscal service returned an unexpected withholding response.",
    };
  }
  const id = source.id;
  const externalId =
    typeof id === "number" && Number.isFinite(id)
      ? String(id)
      : typeof id === "string" && id.trim()
        ? id.trim()
        : null;
  return {
    ok: true,
    irn: null,
    documentNumber: null,
    externalId,
    externalRrn: rrn,
    acknowledgedAtRaw: null,
    acknowledgedAt: null,
    signedQr: text(source.qr),
    signedInvoice: null,
    externalStatus: "A",
  };
}

export function originalFiscalPretax(snapshot: unknown): number | null {
  const details = record(record(record(snapshot)?.info)?.ValueDetails);
  if (details && "TotalValue" in details && "TaxValue" in details) {
    const total = Number(details.TotalValue);
    const tax = Number(details.TaxValue);
    if (Number.isFinite(total) && Number.isFinite(tax)) return fiscalMoney(total - tax);
  }
  const items = record(record(snapshot)?.info)?.ItemList;
  if (!Array.isArray(items)) return null;
  const sum = items.reduce((total, item) => total + Number(record(item)?.PreTaxValue ?? 0), 0);
  return Number.isFinite(sum) ? fiscalMoney(sum) : null;
}

function withholdingBody(body: unknown): Record<string, unknown> | null {
  const row = record(body);
  if (!row || row.nonJson === true) return null;
  return record(row.body) ?? record(row.data) ?? row;
}

function calendarDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.trim().slice(0, 10);
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
