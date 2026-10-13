/**
 * Phase 6 company B2B invoice payload builder.
 *
 * An already-issued company account invoice in ETB becomes a fiscal INV with
 * TransactionType B2B. BuyerDetails is nested under info and is taken from the
 * invoice's frozen bill-to snapshot. Amounts and item identity come from the
 * frozen invoice lines and the existing item/tax mappings.
 *
 * This module does not post charges, change the account balance, or call the
 * fiscal API. Company credit notes, debit notes, and sales receipts are not
 * built here. FULL payment coverage is not involved.
 *
 * BuyerDetails.IdType is the provider example KID. IdNumber stays null.
 * Registration number is sent as VatNumber. A missing registration number does
 * not block registration.
 */
import {
  FISCAL_DOCUMENT_MODE,
  FISCAL_ITEM_UNIT,
  fiscalItemCodeNumber,
  fiscalNatureOfSupplies,
} from "./fiscal.types.ts";
import {
  fiscalMoney,
  formatFiscalDocumentDate,
  type FiscalInvLine,
  type FiscalItemMapping,
  type FiscalTaxMapping,
} from "./fiscal-guest-invoice.ts";

export const FISCAL_P6_SOURCE = "account_invoice" as const;
export const FISCAL_P6_DOCUMENT = "INV" as const;
export const FISCAL_B2B_ID_TYPE = "KID" as const;

export function companyInvoiceTrnxId(invoiceId: string): string {
  return `ci-${invoiceId}`;
}

export function p6HandlerEnabled(documentType: string, sourceType: string): boolean {
  return documentType === FISCAL_P6_DOCUMENT && sourceType === FISCAL_P6_SOURCE;
}

export type CompanyBuyerDetails = {
  City: string | null;
  Email: string | null;
  HouseNumber: null;
  IdNumber: null;
  IdType: typeof FISCAL_B2B_ID_TYPE;
  Tin: string;
  LegalName: string;
  Phone: string | null;
  Region: string | null;
  VatNumber: string | null;
  Wereda: null;
  Zone: null;
  Kebele: null;
};

export type CompanyInvoicePayload = {
  Date: string;
  Mode: typeof FISCAL_DOCUMENT_MODE;
  Type: "INV";
  info: {
    ItemList: FiscalInvLine[];
    ValueDetails: {
      Discount: number;
      TaxValue: number;
      TotalValue: number;
      ExciseValue: number;
      InvoiceCurrency: "ETB";
      IncomeWithholdValue: number;
      TransactionWithholdValue: number;
    };
    BuyerDetails: CompanyBuyerDetails;
  };
  client: string;
  trnx_id: string;
  device_id: string;
  tax_payer_tin: string;
  RelatedDocument: null;
  TransactionType: "B2B";
};

export type CompanyInvoiceFiscalPreview = {
  invoiceNumber: string;
  legalName: string;
  tin: string;
  vatNumber: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  transactionType: "B2B";
  currency: "ETB";
  pretax: number;
  tax: number;
  total: number;
};

export type CompanyInvoiceFiscalInput = {
  issued: boolean;
  snapshot: unknown;
  connection: {
    enabled: boolean;
    taxpayerTin: string;
    client: string;
    deviceId: string;
    credentialsConfigured: boolean;
  };
  taxMappings: FiscalTaxMapping[];
  itemMappings: FiscalItemMapping[];
};

export type CompanyInvoiceFiscalAssessment =
  | { ok: true; payload: CompanyInvoicePayload; preview: CompanyInvoiceFiscalPreview }
  | {
      ok: false;
      reasons: string[];
      missingTaxes: string[];
      missingItems: string[];
      missingDevice: boolean;
    };

type FrozenTax = { taxId: string | null; name: string; amount: number };
type FrozenGroup = {
  description: string;
  chargeSource: string | null;
  serviceTypeId: string | null;
  departmentId: string | null;
  quantity: number | null;
  unitAmount: number | null;
  subtotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  taxLines: FrozenTax[];
  identityFrozen: boolean;
};

export function assessCompanyInvoiceFiscal(
  invoiceId: string,
  input: CompanyInvoiceFiscalInput,
): CompanyInvoiceFiscalAssessment {
  const reasons: string[] = [];
  const missingTaxes: string[] = [];
  const missingItems: string[] = [];
  let missingDevice = false;
  if (!input.issued) reasons.push("Only an issued invoice can be registered.");
  const parsed = parseCompanyInvoice(input.snapshot);
  if (!parsed) {
    reasons.push("Only an issued company invoice can be registered.");
  } else if (parsed.accountKind === "group") {
    reasons.push("Group invoices are not eligible for fiscal registration in the current phase.");
  } else if (parsed.accountKind !== "company") {
    reasons.push("Only an issued company invoice can be registered.");
  }
  if (parsed && parsed.currency !== "ETB") {
    reasons.push("Only ETB is supported in the current fiscal phase.");
  }
  if (parsed?.hasServiceCharge) {
    reasons.push(
      "This invoice includes a service charge and is not eligible for fiscal registration yet.",
    );
  }
  if (parsed && !parsed.legalName) {
    reasons.push("Company legal name is required for B2B fiscal registration.");
  }
  if (parsed && !parsed.tin) {
    reasons.push("Company TIN is required for B2B fiscal registration.");
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

  const lines: FiscalInvLine[] = [];
  const company =
    parsed != null &&
    parsed.accountKind === "company" &&
    parsed.currency === "ETB" &&
    !parsed.hasServiceCharge &&
    parsed.legalName != null &&
    parsed.tin != null;
  if (company && parsed) {
    parsed.groups.forEach((group, index) => {
      if (!group.identityFrozen) {
        reasons.push(
          `This company invoice does not freeze the item identity required for fiscal mapping: "${group.description}".`,
        );
        return;
      }
      if (group.taxTotal > 0.01 && (group.taxLines.length === 0 || !group.taxLines[0]?.taxId)) {
        reasons.push(
          `This company invoice does not freeze the tax identity required for fiscal mapping: "${group.description}".`,
        );
        return;
      }
      if (group.taxLines.length > 1) {
        reasons.push(`This invoice line has more than one tax component: "${group.description}".`);
        return;
      }
      if (
        group.taxLines.length === 1 &&
        Math.abs(fiscalMoney(group.taxLines[0].amount) - group.taxTotal) > 0.01
      ) {
        reasons.push(`The frozen tax for "${group.description}" does not match the line tax.`);
        return;
      }
      const tax = resolveTax(group, input.taxMappings);
      if (!tax.ok) {
        missingTaxes.push(tax.label);
        reasons.push(tax.reason);
        return;
      }
      const item = resolveItem(group, input.itemMappings);
      if (!item) {
        missingItems.push(group.description);
        reasons.push(`Missing item mapping for "${group.description}".`);
        return;
      }
      const nature = fiscalNatureOfSupplies(item.natureOfSupplies.trim());
      if (!nature) {
        reasons.push(
          `Nature of supplies for "${group.description}" must be corrected to Service or Goods.`,
        );
        return;
      }
      const itemCode = fiscalItemCodeNumber(item.externalItemCode);
      if (itemCode == null) {
        reasons.push(
          `Fiscal item code for "${group.description}" must be a whole number such as 1001.`,
        );
        return;
      }
      const price = frozenLinePrice(group);
      if (!price.ok) {
        reasons.push(price.reason);
        return;
      }
      lines.push({
        Unit: FISCAL_ITEM_UNIT,
        TaxCode: tax.code,
        Discount: 0,
        ItemCode: itemCode,
        Quantity: price.quantity,
        TaxAmount: group.taxTotal,
        UnitPrice: price.unitPrice,
        LineNumber: index + 1,
        PreTaxValue: group.subtotal,
        ExciseTaxValue: 0,
        TotalLineAmount: fiscalMoney(group.subtotal + group.taxTotal),
        NatureOfSupplies: nature,
        HarmonizationCode: item.harmonizationCode?.trim() || null,
        ProductDescription: group.description,
      });
    });
  }

  if (!company || !parsed || lines.length !== parsed.groups.length || reasons.length > 0) {
    return { ok: false, reasons, missingTaxes, missingItems, missingDevice };
  }

  const pretax = fiscalMoney(lines.reduce((sum, line) => sum + line.PreTaxValue, 0));
  const tax = fiscalMoney(lines.reduce((sum, line) => sum + line.TaxAmount, 0));
  const total = fiscalMoney(lines.reduce((sum, line) => sum + line.TotalLineAmount, 0));
  if (
    Math.abs(pretax - parsed.subtotal) > 0.01 ||
    Math.abs(tax - parsed.tax) > 0.01 ||
    Math.abs(total - parsed.total) > 0.01
  ) {
    reasons.push("The fiscal lines do not match the frozen invoice totals.");
    return { ok: false, reasons, missingTaxes, missingItems, missingDevice };
  }

  let date = "";
  try {
    date = formatFiscalDocumentDate(parsed.issuedAt);
  } catch {
    reasons.push("The invoice issue time is missing.");
    return { ok: false, reasons, missingTaxes, missingItems, missingDevice };
  }

  const buyer: CompanyBuyerDetails = {
    City: parsed.city,
    Email: parsed.email,
    HouseNumber: null,
    IdNumber: null,
    IdType: FISCAL_B2B_ID_TYPE,
    Tin: parsed.tin,
    LegalName: parsed.legalName,
    Phone: parsed.phone,
    Region: parsed.region,
    VatNumber: parsed.vatNumber,
    Wereda: null,
    Zone: null,
    Kebele: null,
  };
  const payload: CompanyInvoicePayload = {
    Date: date,
    Mode: FISCAL_DOCUMENT_MODE,
    Type: "INV",
    info: {
      ItemList: lines,
      ValueDetails: {
        Discount: 0,
        TaxValue: parsed.tax,
        TotalValue: parsed.total,
        ExciseValue: 0,
        InvoiceCurrency: "ETB",
        IncomeWithholdValue: 0,
        TransactionWithholdValue: 0,
      },
      BuyerDetails: buyer,
    },
    client: input.connection.client.trim(),
    trnx_id: companyInvoiceTrnxId(invoiceId),
    device_id: input.connection.deviceId.trim(),
    tax_payer_tin: input.connection.taxpayerTin.trim(),
    RelatedDocument: null,
    TransactionType: "B2B",
  };
  return {
    ok: true,
    payload,
    preview: {
      invoiceNumber: parsed.invoiceNumber,
      legalName: buyer.LegalName,
      tin: buyer.Tin,
      vatNumber: buyer.VatNumber,
      phone: buyer.Phone,
      email: buyer.Email,
      city: buyer.City,
      region: buyer.Region,
      transactionType: "B2B",
      currency: "ETB",
      pretax: parsed.subtotal,
      tax: parsed.tax,
      total: parsed.total,
    },
  };
}

export function companyPreviewFromPayload(payload: unknown): CompanyInvoiceFiscalPreview | null {
  const row = record(payload);
  const info = record(row?.info);
  const buyer = record(info?.BuyerDetails);
  const details = record(info?.ValueDetails);
  if (!row || row.TransactionType !== "B2B" || !buyer || !details) return null;
  const legalName = optionalText(buyer.LegalName);
  const tin = optionalText(buyer.Tin);
  if (!legalName || !tin) return null;
  return {
    invoiceNumber: "",
    legalName,
    tin,
    vatNumber: optionalText(buyer.VatNumber),
    phone: optionalText(buyer.Phone),
    email: optionalText(buyer.Email),
    city: optionalText(buyer.City),
    region: optionalText(buyer.Region),
    transactionType: "B2B",
    currency: "ETB",
    pretax: fiscalMoney(numberValue(details.TotalValue) - numberValue(details.TaxValue)),
    tax: fiscalMoney(numberValue(details.TaxValue)),
    total: fiscalMoney(numberValue(details.TotalValue)),
  };
}

function parseCompanyInvoice(snapshot: unknown): {
  accountKind: string;
  issuedAt: string;
  invoiceNumber: string;
  currency: string;
  legalName: string | null;
  tin: string | null;
  vatNumber: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  subtotal: number;
  tax: number;
  total: number;
  hasServiceCharge: boolean;
  groups: FrozenGroup[];
} | null {
  const row = record(snapshot);
  if (!row || !Array.isArray(row.groups)) return null;
  const account = record(row.account);
  const billTo = record(row.billTo);
  const property = record(row.property);
  const totals = record(row.totals);
  const document = record(row.document);
  const groups = row.groups.map(parseGroup).filter((group): group is FrozenGroup => group !== null);
  if (groups.length !== row.groups.length || groups.length === 0) return null;
  const subtotal = fiscalMoney(numberValue(totals?.subtotal));
  const tax = fiscalMoney(numberValue(totals?.tax));
  const service = fiscalMoney(numberValue(totals?.serviceCharge));
  const total = fiscalMoney(
    totals?.invoiceTotal == null ? subtotal + tax + service : numberValue(totals.invoiceTotal),
  );
  return {
    accountKind: typeof account?.accountKind === "string" ? account.accountKind : "",
    issuedAt: typeof row.issuedAt === "string" ? row.issuedAt : "",
    invoiceNumber: optionalText(document?.issuedNumber) ?? "",
    currency: (optionalText(account?.currency) ?? optionalText(property?.currencyCode) ?? "")
      .trim()
      .toUpperCase(),
    legalName: optionalText(billTo?.name),
    tin: optionalText(billTo?.taxId),
    vatNumber: optionalText(billTo?.registrationNumber),
    phone: optionalText(billTo?.phone),
    email: optionalText(billTo?.email),
    city: optionalText(billTo?.city),
    region: optionalText(billTo?.region),
    subtotal,
    tax,
    total,
    hasServiceCharge: service > 0.01 || groups.some((group) => group.serviceChargeTotal > 0.01),
    groups,
  };
}

function parseGroup(value: unknown): FrozenGroup | null {
  const row = record(value);
  if (!row) return null;
  const chargeSnapshot = record(row.chargeSnapshot);
  const taxLines = Array.isArray(row.taxLines)
    ? row.taxLines.map(parseTax).filter((tax): tax is FrozenTax => tax !== null)
    : [];
  if (Array.isArray(row.taxLines) && taxLines.length !== row.taxLines.length) return null;
  const serviceTypeId = optionalText(chargeSnapshot?.serviceTypeId);
  const departmentId = optionalText(chargeSnapshot?.departmentId);
  const chargeSource = optionalText(row.chargeSource);
  return {
    description: optionalText(row.description) ?? "Invoice line",
    chargeSource,
    serviceTypeId,
    departmentId,
    quantity: positiveOrNull(row.quantity),
    unitAmount: row.unitAmount == null ? null : numberValue(row.unitAmount),
    subtotal: fiscalMoney(numberValue(row.subtotal)),
    taxTotal: fiscalMoney(numberValue(row.taxTotal)),
    serviceChargeTotal: fiscalMoney(numberValue(row.serviceChargeTotal)),
    taxLines,
    identityFrozen: Boolean(chargeSource || serviceTypeId || departmentId),
  };
}

function parseTax(value: unknown): FrozenTax | null {
  const row = record(value);
  if (!row) return null;
  const snap = record(row.taxSnapshot);
  return {
    taxId: optionalText(snap?.taxId),
    name: optionalText(row.name) ?? optionalText(snap?.name) ?? "Tax",
    amount: fiscalMoney(numberValue(row.amount)),
  };
}

function resolveTax(
  group: FrozenGroup,
  mappings: FiscalTaxMapping[],
): { ok: true; code: string } | { ok: false; label: string; reason: string } {
  const active = mappings.filter((mapping) => mapping.active);
  if (group.taxLines.length === 0) {
    const noTax = active.find((mapping) => mapping.mappingKind === "NO_TAX");
    if (!noTax) {
      return { ok: false, label: "No tax", reason: 'Missing tax mapping for "No tax".' };
    }
    return { ok: true, code: noTax.externalTaxCode.trim() };
  }
  const tax = group.taxLines[0];
  const mapped = active.find(
    (mapping) =>
      mapping.mappingKind === "TAX" && mapping.pmsTaxId && mapping.pmsTaxId === tax.taxId,
  );
  if (!mapped) {
    return { ok: false, label: tax.name, reason: `Missing tax mapping for "${tax.name}".` };
  }
  return { ok: true, code: mapped.externalTaxCode.trim() };
}

function resolveItem(group: FrozenGroup, mappings: FiscalItemMapping[]): FiscalItemMapping | null {
  const active = mappings.filter((mapping) => mapping.active);
  if (group.serviceTypeId) {
    const match = active.find((mapping) => mapping.serviceTypeId === group.serviceTypeId);
    if (match) return match;
  }
  if (group.departmentId) {
    const match = active.find((mapping) => mapping.departmentId === group.departmentId);
    if (match) return match;
  }
  if (group.chargeSource) {
    const match = active.find((mapping) => mapping.chargeSource === group.chargeSource);
    if (match) return match;
  }
  return active.find((mapping) => mapping.isDefault) ?? null;
}

function frozenLinePrice(
  group: FrozenGroup,
): { ok: true; quantity: number; unitPrice: number } | { ok: false; reason: string } {
  if (group.quantity != null && group.quantity > 0) {
    if (
      group.unitAmount != null &&
      Math.abs(fiscalMoney(group.unitAmount * group.quantity) - group.subtotal) <= 0.01
    ) {
      return { ok: true, quantity: group.quantity, unitPrice: fiscalMoney(group.unitAmount) };
    }
    const derived = fiscalMoney(group.subtotal / group.quantity);
    if (Math.abs(fiscalMoney(derived * group.quantity) - group.subtotal) <= 0.01) {
      return { ok: true, quantity: group.quantity, unitPrice: derived };
    }
    return {
      ok: false,
      reason: `The frozen quantity for "${group.description}" does not reconcile to the pretax amount.`,
    };
  }
  return { ok: true, quantity: 1, unitPrice: group.subtotal };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = numberValue(value);
  return parsed > 0 ? parsed : null;
}
