/**
 * Phase 3 credit-note payload builder.
 *
 * A fiscal CRE registers an already-issued guest credit note. It does not
 * post a ledger correction. Item identity is copied from the original
 * successful INV request snapshot. Amounts are the positive credited
 * magnitudes from the issued credit note.
 *
 * A credit group matches an invoice group when sourceGroupId equals
 * parentTransactionId. When the original request stores noruFiscalLines, that
 * group expands into its source line and any separate tax items. Otherwise the
 * fiscal line is the ItemList entry at that group's index. Description text
 * is not a match key. Credited amounts come from the frozen credit components.
 *
 * CRE LineNumber is 1..n in original invoice order. A partial credit uses
 * quantity 1 and the credited pretax amount as the unit price. A full credit
 * keeps the original quantity and unit price when that product still equals
 * the credited pretax amount.
 *
 * Debit notes and sales receipts are not built here.
 */
import {
  expandCorrectionGroup,
  noteComponents,
  readNoruFiscalLines,
  type NoteComponent,
} from "./fiscal-line-expansion.ts";
import { fiscalMoney, formatFiscalDocumentDate } from "./fiscal-guest-invoice.ts";
import {
  copyOriginalBuyerDetails,
  invoiceGroupParentIds,
  parseOriginalFiscalInvoice,
  uniqueInvoiceGroupIndex,
  type OriginalFiscalLine,
} from "./fiscal-original-invoice.ts";
import { type FiscalDocumentMode } from "./fiscal-document-mode.ts";

export const FISCAL_P3_SOURCE = "credit_note" as const;
export const FISCAL_P3_DOCUMENT = "CRE" as const;

export function creditNoteTrnxId(creditNoteId: string): string {
  return `gc-${creditNoteId}`;
}

export function p3HandlerEnabled(documentType: string, sourceType: string): boolean {
  return documentType === FISCAL_P3_DOCUMENT && sourceType === FISCAL_P3_SOURCE;
}

export type CreditNoteFiscalLinePreview = {
  productDescription: string;
  itemCode: number | string;
  creditedAmount: number;
};

export type CreditNoteFiscalPreview = {
  noteNumber: string;
  originalInvoiceNumber: string | null;
  originalFiscalDocumentNumber: string | null;
  relatedIrn: string;
  transactionType: "B2C" | "B2B";
  currency: "ETB";
  mode: FiscalDocumentMode;
  pretax: number;
  tax: number;
  total: number;
  lines: CreditNoteFiscalLinePreview[];
};

export type FiscalCreLine = {
  Unit: string;
  TaxCode: string;
  Discount: number;
  ItemCode: number | string;
  Quantity: number;
  TaxAmount: number;
  UnitPrice: number;
  LineNumber: number;
  PreTaxValue: number;
  ExciseTaxValue: number;
  TotalLineAmount: number;
  NatureOfSupplies: string;
  HarmonizationCode: string | null;
  ProductDescription: string;
};

export type FiscalCrePayload = {
  Date: string;
  Mode: FiscalDocumentMode;
  Type: "CRE";
  info: {
    ItemList: FiscalCreLine[];
    ValueDetails: {
      Discount: number;
      TaxValue: number;
      TotalValue: number;
      ExciseValue: number;
      InvoiceCurrency: "ETB";
      IncomeWithholdValue: number;
      TransactionWithholdValue: number;
    };
    BuyerDetails?: Record<string, unknown>;
  };
  client: string;
  trnx_id: string;
  device_id: string;
  tax_payer_tin: string;
  RelatedDocument: string;
  TransactionType: "B2C" | "B2B";
};

export type CreditNoteFiscalInput = {
  guestInvoiceId: string | null;
  currency: string;
  issuedAt: string;
  noteNumber: string;
  totalDelta: number;
  creditSnapshot: unknown;
  invoiceSnapshot: unknown;
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

export type CreditNoteFiscalAssessment =
  | { ok: true; payload: FiscalCrePayload; preview: CreditNoteFiscalPreview }
  | { ok: false; reasons: string[]; missingDevice: boolean };

type CreditGroup = {
  sourceGroupId: string;
  pretax: number;
  tax: number;
  serviceCharge: number;
  components: NoteComponent[];
};

export function assessCreditNoteFiscal(
  creditNoteId: string,
  input: CreditNoteFiscalInput,
): CreditNoteFiscalAssessment {
  const reasons: string[] = [];
  let missingDevice = false;
  if (!input.guestInvoiceId) {
    reasons.push("Only a guest credit note can be registered in the current fiscal phase.");
  }
  if (input.currency.trim().toUpperCase() !== "ETB") {
    reasons.push("Only ETB Credit Notes are currently supported.");
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
  if (input.connection.deviceId.trim().length === 0) {
    missingDevice = true;
    reasons.push("Device ID is missing.");
  }

  const original = input.originalRegistration;
  const request = original ? parseOriginalFiscalInvoice(original.requestSnapshot) : null;
  if (!original || original.status !== "REGISTERED") {
    reasons.push("Original invoice has not been fiscally registered.");
  } else {
    if (!original.irn || original.irn.trim().length === 0) {
      reasons.push("Original fiscal IRN is missing.");
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
    reasons.push("Only a B2C or B2B credit note can be registered in the current fiscal phase.");
  }
  if (request?.transactionType === "B2B" && !inheritedBuyer) {
    reasons.push("Original fiscal BuyerDetails are missing.");
  }

  const credits = parseCreditGroups(input.creditSnapshot);
  const invoiceGroups = invoiceGroupParentIds(input.invoiceSnapshot);
  if (!credits) reasons.push("This credit note does not have frozen credit groups.");
  if (credits?.some((group) => group.serviceCharge > 0.009)) {
    reasons.push(
      "This credit note includes a service charge and is not eligible for fiscal registration yet.",
    );
  }
  if (reasons.length > 0 || !request || !credits || !original?.irn) {
    return { ok: false, reasons, missingDevice };
  }
  if (!request.mode) {
    reasons.push("Original fiscal invoice Mode is missing.");
    return { ok: false, reasons, missingDevice };
  }

  const storedLinks = readNoruFiscalLines(original.requestSnapshot);
  const matches: Array<{ line: OriginalFiscalLine; pretax: number; tax: number }> = [];
  if (storedLinks.length > 0) {
    for (const credit of credits) {
      const expanded = expandCorrectionGroup({
        groupKey: credit.sourceGroupId,
        pretax: credit.pretax,
        tax: credit.tax,
        components: credit.components,
        links: storedLinks,
        lines: request.lines,
      });
      if (!expanded.ok) {
        reasons.push(expanded.reason);
        continue;
      }
      for (const part of expanded.parts) {
        const line = request.lines[part.line.index];
        if (!line || matches.some((match) => match.line.index === line.index)) {
          reasons.push("Credit Note line cannot be matched to an original fiscal invoice line.");
          continue;
        }
        matches.push({ line, pretax: part.pretax, tax: part.tax });
      }
    }
  } else {
    for (const credit of credits) {
      const index = uniqueInvoiceGroupIndex(invoiceGroups, credit.sourceGroupId);
      if (index == null || !request.lines[index]) {
        reasons.push("Credit Note line cannot be matched to an original fiscal invoice line.");
        continue;
      }
      const line = request.lines[index];
      if (matches.some((match) => match.line.index === line.index)) {
        reasons.push("Credit Note line cannot be matched to an original fiscal invoice line.");
        continue;
      }
      if (credit.pretax > line.preTax + 0.01 || credit.tax > line.tax + 0.01) {
        reasons.push("Credit Note amount exceeds the original fiscal line.");
        continue;
      }
      matches.push({ line, pretax: credit.pretax, tax: credit.tax });
    }
  }
  if (matches.length === 0 || reasons.length > 0) {
    return { ok: false, reasons, missingDevice };
  }
  matches.sort((left, right) => left.line.index - right.line.index);

  let issuedAt = "";
  try {
    issuedAt = formatFiscalDocumentDate(input.issuedAt);
  } catch {
    reasons.push("The credit note issue time is missing.");
    return { ok: false, reasons, missingDevice };
  }

  const lines: FiscalCreLine[] = [];
  for (const [offset, match] of matches.entries()) {
    const price = creditPrice(match.line, match.pretax);
    if (!price.ok) {
      reasons.push(price.reason);
      continue;
    }
    const total = fiscalMoney(match.pretax + match.tax);
    lines.push({
      Unit: match.line.unit,
      TaxCode: match.line.taxCode,
      Discount: 0,
      ItemCode: match.line.itemCode,
      Quantity: price.quantity,
      TaxAmount: match.tax,
      UnitPrice: price.unitPrice,
      LineNumber: offset + 1,
      PreTaxValue: match.pretax,
      ExciseTaxValue: 0,
      TotalLineAmount: total,
      NatureOfSupplies: match.line.nature,
      HarmonizationCode: match.line.harmonization,
      ProductDescription: match.line.description,
    });
  }
  if (lines.length !== matches.length || reasons.length > 0) {
    return { ok: false, reasons, missingDevice };
  }

  const pretax = fiscalMoney(lines.reduce((sum, line) => sum + line.PreTaxValue, 0));
  const tax = fiscalMoney(lines.reduce((sum, line) => sum + line.TaxAmount, 0));
  const total = fiscalMoney(lines.reduce((sum, line) => sum + line.TotalLineAmount, 0));
  if (Math.abs(total - fiscalMoney(Math.abs(input.totalDelta))) > 0.01) {
    reasons.push("The fiscal credit does not match the issued credit note total.");
    return { ok: false, reasons, missingDevice };
  }
  const document = record(record(input.creditSnapshot)?.document);
  const transactionType = request.transactionType === "B2B" ? "B2B" : "B2C";
  const valueDetails = {
    Discount: 0,
    TaxValue: tax,
    TotalValue: total,
    ExciseValue: 0,
    InvoiceCurrency: "ETB" as const,
    IncomeWithholdValue: 0,
    TransactionWithholdValue: 0,
  };
  const payload: FiscalCrePayload = {
    Date: issuedAt,
    Mode: request.mode,
    Type: "CRE",
    info: inheritedBuyer
      ? { ItemList: lines, ValueDetails: valueDetails, BuyerDetails: inheritedBuyer }
      : { ItemList: lines, ValueDetails: valueDetails },
    client: input.connection.client.trim(),
    trnx_id: creditNoteTrnxId(creditNoteId),
    device_id: input.connection.deviceId.trim(),
    tax_payer_tin: input.connection.taxpayerTin.trim(),
    RelatedDocument: original.irn.trim(),
    TransactionType: transactionType,
  };
  return {
    ok: true,
    payload,
    preview: {
      noteNumber: input.noteNumber,
      originalInvoiceNumber: text(document?.originalInvoiceNumber),
      originalFiscalDocumentNumber: original.documentNumber,
      relatedIrn: original.irn.trim(),
      transactionType,
      currency: "ETB",
      mode: request.mode,
      pretax,
      tax,
      total,
      lines: lines.map((line) => ({
        productDescription: line.ProductDescription,
        itemCode: line.ItemCode,
        creditedAmount: line.TotalLineAmount,
      })),
    },
  };
}

function creditPrice(
  line: OriginalFiscalLine,
  pretax: number,
): { ok: true; quantity: number; unitPrice: number } | { ok: false; reason: string } {
  if (pretax <= 0) {
    return { ok: false, reason: "Credit Note line has no pretax amount." };
  }
  if (
    Math.abs(pretax - line.preTax) <= 0.01 &&
    line.quantity > 0 &&
    Math.abs(fiscalMoney(line.unitPrice * line.quantity) - pretax) <= 0.01
  ) {
    return { ok: true, quantity: line.quantity, unitPrice: fiscalMoney(line.unitPrice) };
  }
  const unitPrice = fiscalMoney(pretax);
  if (Math.abs(fiscalMoney(unitPrice * 1) - pretax) > 0.01) {
    return {
      ok: false,
      reason: "The credited amount does not reconcile to a fiscal quantity and unit price.",
    };
  }
  return { ok: true, quantity: 1, unitPrice };
}

function parseCreditGroups(snapshot: unknown): CreditGroup[] | null {
  const row = record(snapshot);
  if (!Array.isArray(row?.groups) || row.groups.length === 0) return null;
  const groups = row.groups.map((group) => {
    const item = record(group);
    const sourceGroupId = text(item?.sourceGroupId);
    if (!item || !sourceGroupId) return null;
    return {
      sourceGroupId,
      pretax: fiscalMoney(Math.abs(numberValue(item.subtotal))),
      tax: fiscalMoney(Math.abs(numberValue(item.tax))),
      serviceCharge: fiscalMoney(Math.abs(numberValue(item.serviceCharge))),
      components: noteComponents(item),
    };
  });
  if (groups.some((group) => group == null)) return null;
  return groups as CreditGroup[];
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
