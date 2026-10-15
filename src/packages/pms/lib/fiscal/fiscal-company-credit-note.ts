/**
 * Company B2B credit-note payload.
 *
 * Registers an already-issued company credit note. Item identity and
 * BuyerDetails are copied from the original B2B INV request. Amounts are the
 * positive credited magnitudes. Current company profile and mappings are not
 * read.
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
  invoiceGroupSourceIds,
  parseOriginalFiscalInvoice,
  uniqueInvoiceGroupIndex,
  type OriginalFiscalLine,
} from "./fiscal-original-invoice.ts";
import { type FiscalDocumentMode } from "./fiscal-document-mode.ts";

export const FISCAL_P7_CREDIT_SOURCE = "credit_note" as const;
export const FISCAL_P7_CREDIT_DOCUMENT = "CRE" as const;

export function companyCreditTrnxId(creditNoteId: string): string {
  return `ccn-${creditNoteId}`;
}

export type CompanyCreditPreview = {
  noteNumber: string;
  companyName: string;
  originalInvoiceNumber: string | null;
  originalFiscalDocumentNumber: string | null;
  relatedIrn: string;
  transactionType: "B2B";
  tin: string | null;
  vatNumber: string | null;
  pretax: number;
  tax: number;
  total: number;
};

export type CompanyCreditPayload = {
  Date: string;
  Mode: FiscalDocumentMode;
  Type: "CRE";
  info: {
    ItemList: Array<Record<string, unknown>>;
    ValueDetails: {
      Discount: number;
      TaxValue: number;
      TotalValue: number;
      ExciseValue: number;
      InvoiceCurrency: "ETB";
      IncomeWithholdValue: number;
      TransactionWithholdValue: number;
    };
    BuyerDetails: Record<string, unknown>;
  };
  client: string;
  trnx_id: string;
  device_id: string;
  tax_payer_tin: string;
  RelatedDocument: string;
  TransactionType: "B2B";
};

export type CompanyCreditInput = {
  accountInvoiceId: string | null;
  accountKind: string;
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

export type CompanyCreditAssessment =
  | { ok: true; payload: CompanyCreditPayload; preview: CompanyCreditPreview }
  | { ok: false; reasons: string[]; missingDevice: boolean };

type CreditGroup = {
  sourceGroupId: string;
  pretax: number;
  tax: number;
  serviceCharge: number;
  components: NoteComponent[];
};

export function assessCompanyCreditFiscal(
  creditNoteId: string,
  input: CompanyCreditInput,
): CompanyCreditAssessment {
  const reasons: string[] = [];
  let missingDevice = false;
  if (!input.accountInvoiceId || input.accountKind !== "company") {
    reasons.push("Only a company credit note can be registered in this fiscal phase.");
  }
  if (input.currency.trim().toUpperCase() !== "ETB") {
    reasons.push("Only ETB Credit Notes are currently supported.");
  }
  pushConnection(reasons, input.connection, () => {
    missingDevice = true;
  });
  const original = input.originalRegistration;
  const request = original ? parseOriginalFiscalInvoice(original.requestSnapshot) : null;
  const buyer = original ? copyOriginalBuyerDetails(original.requestSnapshot) : null;
  pushOriginal(reasons, original, request, buyer, "credit note");
  const credits = parseCreditGroups(input.creditSnapshot);
  const invoiceGroups = invoiceGroupSourceIds(input.invoiceSnapshot);
  if (!credits) reasons.push("This credit note does not have frozen credit groups.");
  if (credits?.some((group) => group.serviceCharge > 0.009)) {
    reasons.push(
      "This credit note includes a service charge and is not eligible for fiscal registration yet.",
    );
  }
  if (reasons.length > 0 || !request || !buyer || !credits || !original?.irn) {
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
    return {
      ok: false,
      reasons: [...reasons, "The credit note issue time is missing."],
      missingDevice,
    };
  }
  const lines = matches.map((match, offset) => {
    const price = creditPrice(match.line, match.pretax);
    return { match, price, offset };
  });
  if (lines.some((line) => !line.price.ok)) {
    return {
      ok: false,
      reasons: [...reasons, ...lines.flatMap((line) => (line.price.ok ? [] : [line.price.reason]))],
      missingDevice,
    };
  }
  const itemList = lines.map((line) => {
    const price = line.price.ok ? line.price : { quantity: 1, unitPrice: 0 };
    const total = fiscalMoney(line.match.pretax + line.match.tax);
    return {
      Unit: line.match.line.unit,
      TaxCode: line.match.line.taxCode,
      Discount: 0,
      ItemCode: line.match.line.itemCode,
      Quantity: price.quantity,
      TaxAmount: line.match.tax,
      UnitPrice: price.unitPrice,
      LineNumber: line.offset + 1,
      PreTaxValue: line.match.pretax,
      ExciseTaxValue: 0,
      TotalLineAmount: total,
      NatureOfSupplies: line.match.line.nature,
      HarmonizationCode: line.match.line.harmonization,
      ProductDescription: line.match.line.description,
    };
  });
  const pretax = fiscalMoney(itemList.reduce((sum, line) => sum + Number(line.PreTaxValue), 0));
  const tax = fiscalMoney(itemList.reduce((sum, line) => sum + Number(line.TaxAmount), 0));
  const total = fiscalMoney(itemList.reduce((sum, line) => sum + Number(line.TotalLineAmount), 0));
  if (Math.abs(total - fiscalMoney(Math.abs(input.totalDelta))) > 0.01) {
    return {
      ok: false,
      reasons: [...reasons, "The fiscal credit does not match the issued credit note total."],
      missingDevice,
    };
  }
  const payload: CompanyCreditPayload = {
    Date: issuedAt,
    Mode: request.mode,
    Type: "CRE",
    info: {
      ItemList: itemList,
      ValueDetails: {
        Discount: 0,
        TaxValue: tax,
        TotalValue: total,
        ExciseValue: 0,
        InvoiceCurrency: "ETB",
        IncomeWithholdValue: 0,
        TransactionWithholdValue: 0,
      },
      BuyerDetails: buyer,
    },
    client: input.connection.client.trim(),
    trnx_id: companyCreditTrnxId(creditNoteId),
    device_id: input.connection.deviceId.trim(),
    tax_payer_tin: input.connection.taxpayerTin.trim(),
    RelatedDocument: original.irn.trim(),
    TransactionType: "B2B",
  };
  return {
    ok: true,
    payload,
    preview: previewFrom(input, original, buyer, pretax, tax, total),
  };
}

function previewFrom(
  input: CompanyCreditInput,
  original: NonNullable<CompanyCreditInput["originalRegistration"]>,
  buyer: Record<string, unknown>,
  pretax: number,
  tax: number,
  total: number,
): CompanyCreditPreview {
  const document = record(record(input.creditSnapshot)?.document);
  return {
    noteNumber: input.noteNumber,
    companyName: text(buyer.LegalName) ?? "",
    originalInvoiceNumber: text(document?.originalInvoiceNumber),
    originalFiscalDocumentNumber: original.documentNumber,
    relatedIrn: original.irn?.trim() ?? "",
    transactionType: "B2B",
    tin: text(buyer.Tin),
    vatNumber: text(buyer.VatNumber),
    pretax,
    tax,
    total,
  };
}

function pushConnection(
  reasons: string[],
  connection: CompanyCreditInput["connection"],
  missingDevice: () => void,
) {
  if (!connection.enabled) reasons.push("The fiscal integration is disabled.");
  if (!connection.credentialsConfigured) {
    reasons.push("Fiscal API credentials have not been configured.");
  }
  if (connection.taxpayerTin.trim().length === 0 || connection.client.trim().length === 0) {
    reasons.push("The fiscal connection is incomplete.");
  }
  if (connection.deviceId.trim().length === 0) {
    missingDevice();
    reasons.push("Device ID is missing.");
  }
}

function pushOriginal(
  reasons: string[],
  original: CompanyCreditInput["originalRegistration"],
  request: ReturnType<typeof parseOriginalFiscalInvoice>,
  buyer: Record<string, unknown> | null,
  label: string,
) {
  if (!original || original.status !== "REGISTERED") {
    reasons.push("Original invoice has not been fiscally registered.");
    return;
  }
  if (!original.irn || original.irn.trim().length === 0) {
    reasons.push("Original fiscal IRN is missing.");
  }
  if (!request) {
    reasons.push(
      original.requestSnapshot == null
        ? "Original fiscal request snapshot is unavailable."
        : "Original fiscal invoice uses an unsupported legacy request format.",
    );
  } else if (request.transactionType !== "B2B") {
    reasons.push(`Only a B2B ${label} can be registered in the current fiscal phase.`);
  }
  if (request && !buyer) reasons.push("Original fiscal BuyerDetails are missing.");
}

function creditPrice(
  line: OriginalFiscalLine,
  pretax: number,
): { ok: true; quantity: number; unitPrice: number } | { ok: false; reason: string } {
  if (pretax <= 0) return { ok: false, reason: "Credit Note line has no pretax amount." };
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
