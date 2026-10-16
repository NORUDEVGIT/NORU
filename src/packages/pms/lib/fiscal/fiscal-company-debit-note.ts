/**
 * Company B2B debit-note payload.
 *
 * Registers an already-issued company debit note. Item identity and
 * BuyerDetails are copied from the original B2B INV request. Amounts are the
 * positive debit magnitudes. A debit may exceed the original line.
 */
import {
  debitTaxComponents,
  expandLinkedDebitGroup,
  readNoruFiscalLines,
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

export function companyDebitTrnxId(debitNoteId: string): string {
  return `cdn-${debitNoteId}`;
}

export type CompanyDebitPreview = {
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

export type CompanyDebitPayload = {
  Date: string;
  Mode: FiscalDocumentMode;
  Type: "DEB";
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

export type CompanyDebitInput = {
  accountInvoiceId: string | null;
  accountKind: string;
  currency: string;
  issuedAt: string;
  noteNumber: string;
  totalDelta: number;
  debitSnapshot: unknown;
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

export type CompanyDebitAssessment =
  | { ok: true; payload: CompanyDebitPayload; preview: CompanyDebitPreview }
  | { ok: false; reasons: string[]; missingDevice: boolean };

type DebitGroup = {
  sourceGroupId: string;
  pretax: number;
  tax: number;
  serviceCharge: number;
  quantity: number | null;
  unitAmount: number | null;
};

export function assessCompanyDebitFiscal(
  debitNoteId: string,
  input: CompanyDebitInput,
): CompanyDebitAssessment {
  const reasons: string[] = [];
  let missingDevice = false;
  if (!input.accountInvoiceId || input.accountKind !== "company") {
    reasons.push("Only a company debit note can be registered in this fiscal phase.");
  }
  if (input.currency.trim().toUpperCase() !== "ETB") {
    reasons.push("Only ETB Debit Notes are currently supported.");
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
  const buyer = original ? copyOriginalBuyerDetails(original.requestSnapshot) : null;
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
      reasons.push("Only a B2B debit note can be registered in the current fiscal phase.");
    }
    if (request && !buyer) reasons.push("Original fiscal BuyerDetails are missing.");
  }
  const debits = parseDebitGroups(input.debitSnapshot);
  const invoiceGroups = invoiceGroupSourceIds(input.invoiceSnapshot);
  if (!debits) reasons.push("This debit note does not have frozen debit groups.");
  if (debits?.some((group) => group.serviceCharge > 0.009)) {
    reasons.push(
      "This debit note includes a service charge and is not eligible for fiscal registration yet.",
    );
  }
  if (reasons.length > 0 || !request || !buyer || !debits || !original?.irn) {
    return { ok: false, reasons, missingDevice };
  }
  if (!request.mode) {
    reasons.push("Original fiscal invoice Mode is missing.");
    return { ok: false, reasons, missingDevice };
  }
  const storedLinks = readNoruFiscalLines(original.requestSnapshot);
  const matches: Array<{
    debit: DebitGroup;
    line: OriginalFiscalLine;
    explicit: boolean;
    pretax: number;
    tax: number;
  }> = [];
  if (storedLinks.length > 0) {
    for (const debit of debits) {
      const expanded = expandLinkedDebitGroup({
        groupKey: debit.sourceGroupId,
        pretax: debit.pretax,
        tax: debit.tax,
        components: debitTaxComponents(input.debitSnapshot, debit.sourceGroupId),
        links: storedLinks,
        lines: request.lines,
        invoiceGroupCount: invoiceGroups.length,
      });
      if (!expanded.ok) {
        reasons.push(expanded.reason);
        continue;
      }
      for (const part of expanded.parts) {
        const line = request.lines[part.line.index];
        if (!line || matches.some((match) => match.line.index === line.index)) {
          reasons.push("Debit Note line cannot be matched to an original fiscal invoice line.");
          continue;
        }
        matches.push({
          debit,
          line,
          explicit: expanded.explicit && part.role === "source",
          pretax: part.pretax,
          tax: part.tax,
        });
      }
    }
  } else {
    const single = request.lines.length === 1 && invoiceGroups.length === 1;
    for (const debit of debits) {
      const index = uniqueInvoiceGroupIndex(invoiceGroups, debit.sourceGroupId);
      const explicitLine = index == null ? null : (request.lines[index] ?? null);
      const line = explicitLine ?? (single ? request.lines[0] : null);
      if (!line) {
        reasons.push("Debit Note line cannot be matched to an original fiscal invoice line.");
        continue;
      }
      matches.push({
        debit,
        line,
        explicit: explicitLine != null,
        pretax: debit.pretax,
        tax: debit.tax,
      });
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
      reasons: [...reasons, "The debit note issue time is missing."],
      missingDevice,
    };
  }
  const itemList: Array<Record<string, unknown>> = [];
  for (const [offset, match] of matches.entries()) {
    const price = debitPrice({ ...match.debit, pretax: match.pretax }, match.explicit);
    if (!price.ok) {
      reasons.push(price.reason);
      continue;
    }
    itemList.push({
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
      TotalLineAmount: fiscalMoney(match.pretax + match.tax),
      NatureOfSupplies: match.line.nature,
      HarmonizationCode: match.line.harmonization,
      ProductDescription: match.line.description,
    });
  }
  if (itemList.length !== matches.length || reasons.length > 0) {
    return { ok: false, reasons, missingDevice };
  }
  const pretax = fiscalMoney(itemList.reduce((sum, line) => sum + Number(line.PreTaxValue), 0));
  const tax = fiscalMoney(itemList.reduce((sum, line) => sum + Number(line.TaxAmount), 0));
  const total = fiscalMoney(itemList.reduce((sum, line) => sum + Number(line.TotalLineAmount), 0));
  if (Math.abs(total - fiscalMoney(Math.abs(input.totalDelta))) > 0.01) {
    return {
      ok: false,
      reasons: [...reasons, "The fiscal debit does not match the issued debit note total."],
      missingDevice,
    };
  }
  return {
    ok: true,
    payload: {
      Date: issuedAt,
      Mode: request.mode,
      Type: "DEB",
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
      trnx_id: companyDebitTrnxId(debitNoteId),
      device_id: input.connection.deviceId.trim(),
      tax_payer_tin: input.connection.taxpayerTin.trim(),
      RelatedDocument: original.irn.trim(),
      TransactionType: "B2B",
    },
    preview: {
      noteNumber: input.noteNumber,
      companyName: text(buyer.LegalName) ?? "",
      originalInvoiceNumber: text(
        record(record(input.debitSnapshot)?.document)?.originalInvoiceNumber,
      ),
      originalFiscalDocumentNumber: original.documentNumber,
      relatedIrn: original.irn.trim(),
      transactionType: "B2B",
      tin: text(buyer.Tin),
      vatNumber: text(buyer.VatNumber),
      pretax,
      tax,
      total,
    },
  };
}

function debitPrice(
  group: DebitGroup,
  explicit: boolean,
): { ok: true; quantity: number; unitPrice: number } | { ok: false; reason: string } {
  if (group.pretax <= 0) return { ok: false, reason: "Debit Note line has no pretax amount." };
  if (
    explicit &&
    group.quantity != null &&
    group.quantity > 0 &&
    group.unitAmount != null &&
    group.unitAmount > 0 &&
    Math.abs(fiscalMoney(group.quantity * group.unitAmount) - group.pretax) <= 0.01
  ) {
    return { ok: true, quantity: group.quantity, unitPrice: fiscalMoney(group.unitAmount) };
  }
  const unitPrice = fiscalMoney(group.pretax);
  if (Math.abs(unitPrice - group.pretax) > 0.01) {
    return {
      ok: false,
      reason: "The debit amount does not reconcile to a fiscal quantity and unit price.",
    };
  }
  return { ok: true, quantity: 1, unitPrice };
}

function parseDebitGroups(snapshot: unknown): DebitGroup[] | null {
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
      quantity: item.quantity == null || item.quantity === "" ? null : numberValue(item.quantity),
      unitAmount:
        item.unitAmount == null || item.unitAmount === "" ? null : numberValue(item.unitAmount),
    };
  });
  if (groups.some((group) => group == null)) return null;
  return groups as DebitGroup[];
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
