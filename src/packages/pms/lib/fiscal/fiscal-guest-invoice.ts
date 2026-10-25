/**
 * Phase 2 guest-invoice payload builder.
 *
 * Only an already-issued guest charge-group invoice in ETB can become a fiscal
 * INV. The operator chooses B2C or B2B when the registration is created.
 * B2C is the default and sends no BuyerDetails. B2B copies BuyerDetails from
 * the selected saved tax identity. Amounts come from the frozen invoice snapshot.
 * Tax codes and item identity come from property mappings. This module does
 * not post ledger rows and does not call the fiscal API.
 *
 * ItemList and ValueDetails are nested under info. Mode is derived by the
 * server from eligible payment allocations and then frozen. Unit is PCS.
 *
 * Room accommodation is one fiscal item for every rate plan. The rate plan is
 * not read. ProductDescription stays the frozen invoice description.
 *
 * Quantity uses the frozen quantity and frozen unit amount when their product
 * matches the frozen pretax amount. If the unit amount is missing but the
 * frozen quantity still divides the pretax amount exactly, that quantity is
 * kept and the unit price is pretax / quantity. If the snapshot has no positive
 * quantity, the line is sent as quantity 1 with the frozen pretax amount as
 * the unit price. A frozen quantity that does not reconcile is blocked. Nights
 * are never reconstructed from the live reservation or rate plan.
 *
 * Sales receipts are not sent. A later phase can use a known partial receipt:
 * invoice_total_amount, InvoicePaidAmount, RemainingAmount, and
 * PaymentCoverage PARTIAL. FULL payment semantics still need their own example.
 * Credit notes and debit notes are not sent from this builder.
 */
import { createHash } from "node:crypto";

import type { GuestFiscalCustomerType, GuestTaxBuyerDetails } from "../guest-tax-identities.ts";
import {
  expandFiscalGroup,
  fiscalNoTaxCode,
  numberFiscalLines,
  reconcileFiscalInvoice,
  type FiscalLineDraft,
  type FiscalLinkDraft,
  type NoruFiscalLineLink,
} from "./fiscal-line-expansion.ts";
import { isFiscalDocumentMode, type FiscalDocumentMode } from "./fiscal-document-mode.ts";
import {
  anchoredNatures,
  manualChargeNature,
  manualFiscalMapping,
  manualIdentityNature,
  manualNatureBlocksInvoice,
  MANUAL_NATURE_MIXED,
} from "./fiscal-manual-item.ts";
import {
  FISCAL_DOCUMENT_MODE,
  FISCAL_ITEM_UNIT,
  FiscalError,
  fiscalItemCodeNumber,
  fiscalNatureOfSupplies,
  type FiscalNatureOfSupplies,
} from "./fiscal.types.ts";

export const FISCAL_P2_SOURCE = "guest_invoice" as const;
export const FISCAL_P2_DOCUMENT = "INV" as const;

export type FiscalItemMapping = {
  serviceTypeId: string | null;
  departmentId: string | null;
  chargeSource: string | null;
  isDefault: boolean;
  externalItemCode: string;
  externalUnit: string;
  natureOfSupplies: string;
  harmonizationCode: string | null;
  active: boolean;
};

export type FiscalTaxMapping = {
  mappingKind: "TAX" | "NO_TAX";
  pmsTaxId: string | null;
  externalTaxCode: string;
  active: boolean;
  fiscalTreatment?: "SAME_LINE_TAX" | "SEPARATE_ITEM" | null;
  externalItemCode?: string | null;
  externalUnit?: string | null;
  natureOfSupplies?: string | null;
  harmonizationCode?: string | null;
};

export type GuestInvoiceFiscalInput = {
  issued: boolean;
  coverageScope: string;
  snapshot: unknown;
  connection: {
    enabled: boolean;
    taxpayerTin: string;
    client: string;
    deviceId: string;
    credentialsConfigured: boolean;
  };
  mode: string | null;
  taxMappings: FiscalTaxMapping[];
  itemMappings: FiscalItemMapping[];
  fiscalCustomerType?: GuestFiscalCustomerType;
  buyer?: GuestTaxBuyerDetails | null;
  /** Set by the server from payment allocations. Omitted callers keep the legacy constant. */
  documentMode?: FiscalDocumentMode | null;
  /** Real codes assigned at registration. Preview may omit them. */
  manualItemCodes?: Readonly<Record<string, string>>;
  /** Lets the registration screen succeed before a code is stored. */
  allowPreviewManualCode?: boolean;
};

export type FiscalInvLine = {
  Unit: typeof FISCAL_ITEM_UNIT;
  TaxCode: string;
  Discount: number;
  ItemCode: number;
  Quantity: number;
  TaxAmount: number;
  UnitPrice: number;
  LineNumber: number;
  PreTaxValue: number;
  ExciseTaxValue: number;
  TotalLineAmount: number;
  NatureOfSupplies: FiscalNatureOfSupplies;
  HarmonizationCode: string | null;
  ProductDescription: string;
};

export type FiscalInvPayload = {
  Date: string;
  Mode: FiscalDocumentMode;
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
    BuyerDetails?: GuestTaxBuyerDetails;
  };
  client: string;
  trnx_id: string;
  device_id: string;
  tax_payer_tin: string;
  RelatedDocument: null;
  TransactionType: GuestFiscalCustomerType;
  noruFiscalLines?: NoruFiscalLineLink[];
};

export type GuestInvoiceFiscalPreview = {
  invoiceNumber: string;
  guestName: string;
  transactionType: GuestFiscalCustomerType;
  currency: "ETB";
  mode: string;
  pretax: number;
  tax: number;
  total: number;
};

export type GuestInvoiceFiscalAssessment =
  | { ok: true; payload: FiscalInvPayload; preview: GuestInvoiceFiscalPreview }
  | {
      ok: false;
      reasons: string[];
      missingTaxes: string[];
      missingItems: string[];
      missingMode: boolean;
      missingDevice: boolean;
    };

type FrozenTax = {
  transactionId: string | null;
  taxId: string | null;
  name: string;
  amount: number;
};
type FrozenGroup = {
  groupKey: string;
  description: string;
  chargeSource: string | null;
  serviceTypeId: string | null;
  departmentId: string | null;
  quantity: number | null;
  unitAmount: number | null;
  subtotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  grossTotal: number;
  taxLines: FrozenTax[];
  serviceLineCount: number;
  natureOfSupplies: string | null;
};

export function guestInvoiceTrnxId(invoiceId: string): string {
  return `gi-${invoiceId}`;
}

export function formatFiscalDocumentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "The invoice issue time is missing.");
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function fiscalMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function fiscalPayloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function p2HandlerEnabled(documentType: string, sourceType: string): boolean {
  return documentType === FISCAL_P2_DOCUMENT && sourceType === FISCAL_P2_SOURCE;
}

export function assessGuestInvoiceFiscal(
  invoiceId: string,
  input: GuestInvoiceFiscalInput,
): GuestInvoiceFiscalAssessment {
  const reasons: string[] = [];
  const missingTaxes: string[] = [];
  const missingItems: string[] = [];
  const missingMode = false;
  let missingDevice = false;

  if (!input.issued) reasons.push("Only an issued invoice can be registered.");
  if (input.coverageScope !== "charge_groups") {
    reasons.push("Legacy invoice is not eligible for fiscal registration.");
  }
  const parsed = parseFrozenInvoice(input.snapshot);
  if (!parsed) {
    reasons.push("This invoice does not have frozen charge groups.");
  }
  if (parsed && parsed.currency !== "ETB") {
    reasons.push("Only ETB is supported in the current fiscal phase.");
  }
  if (parsed?.hasServiceCharge) {
    reasons.push(
      "This invoice includes a service charge and is not eligible for fiscal registration yet.",
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
  if (input.connection.deviceId.trim().length === 0) {
    missingDevice = true;
    reasons.push("Device ID is missing.");
  }

  const drafts: FiscalLineDraft[] = [];
  const linkDrafts: FiscalLinkDraft[] = [];
  let expanded = 0;
  if (!parsed || parsed.currency !== "ETB" || parsed.hasServiceCharge) {
    return { ok: false, reasons, missingTaxes, missingItems, missingMode, missingDevice };
  }
  const anchored = anchoredNatures(
    parsed.groups
      .map((group) => resolveItem(group, input.itemMappings)?.natureOfSupplies)
      .filter((nature): nature is string => Boolean(nature)),
  );
  const manualNature = manualChargeNature(anchored);
  if (
    manualNatureBlocksInvoice(
      parsed.groups.map((group) => ({
        chargeSource: group.chargeSource,
        natureOfSupplies: group.natureOfSupplies,
        mapped: resolveItem(group, input.itemMappings) != null,
      })),
      manualNature,
    )
  ) {
    reasons.push(MANUAL_NATURE_MIXED);
    return { ok: false, reasons, missingTaxes, missingItems, missingMode, missingDevice };
  }
  const documentMode = isFiscalDocumentMode(input.documentMode)
    ? input.documentMode
    : FISCAL_DOCUMENT_MODE;
  let previewSerial = 1001;
  parsed.groups.forEach((group, index) => {
    const mapped = resolveItem(group, input.itemMappings);
    const manualCode =
      input.manualItemCodes?.[group.groupKey] ??
      (group.chargeSource === "manual" && input.allowPreviewManualCode
        ? String(previewSerial++)
        : null);
    const chosenNature = manualIdentityNature(group.natureOfSupplies, manualNature);
    const item =
      mapped ??
      (group.chargeSource === "manual" && manualCode && chosenNature
        ? manualFiscalMapping(manualCode, chosenNature)
        : null);
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
    const fiscalGroup = expandFiscalGroup({
      groupKey: group.groupKey || `group-${index}`,
      description: group.description,
      subtotal: group.subtotal,
      taxTotal: group.taxTotal,
      taxLines: group.taxLines,
      taxMappings: input.taxMappings,
      noTaxCode: fiscalNoTaxCode(input.taxMappings),
      source: {
        itemCode,
        nature,
        harmonizationCode: item.harmonizationCode?.trim() || null,
        quantity: price.quantity,
        unitPrice: price.unitPrice,
      },
    });
    if (!fiscalGroup.ok) {
      if (fiscalGroup.missingTax) missingTaxes.push(fiscalGroup.missingTax);
      reasons.push(fiscalGroup.reason);
      return;
    }
    drafts.push(...fiscalGroup.lines);
    linkDrafts.push(...fiscalGroup.links);
    expanded += 1;
  });

  if (expanded !== parsed.groups.length || reasons.length > 0) {
    return { ok: false, reasons, missingTaxes, missingItems, missingMode, missingDevice };
  }
  const numbered = numberFiscalLines(drafts, linkDrafts);
  const lines = numbered.lines;
  const reconciled = reconcileFiscalInvoice({
    lines,
    links: numbered.links,
    subtotal: parsed.subtotal,
    tax: parsed.tax,
    total: parsed.total,
  });
  if (!reconciled.ok) {
    reasons.push(reconciled.reason);
    return { ok: false, reasons, missingTaxes, missingItems, missingMode, missingDevice };
  }

  const fiscalCustomerType = input.fiscalCustomerType === "B2B" ? "B2B" : "B2C";
  const buyer = fiscalCustomerType === "B2B" ? (input.buyer ?? null) : null;
  if (fiscalCustomerType === "B2B" && !buyer) {
    reasons.push("Select an active tax identity for this guest.");
    return { ok: false, reasons, missingTaxes, missingItems, missingMode, missingDevice };
  }
  if (buyer && (buyer.LegalName.trim().length === 0 || buyer.Tin.trim().length === 0)) {
    reasons.push("The selected tax identity needs a legal name and TIN.");
    return { ok: false, reasons, missingTaxes, missingItems, missingMode, missingDevice };
  }

  const valueDetails = {
    Discount: 0,
    TaxValue: reconciled.taxValue,
    TotalValue: reconciled.totalValue,
    ExciseValue: 0,
    InvoiceCurrency: "ETB" as const,
    IncomeWithholdValue: 0,
    TransactionWithholdValue: 0,
  };
  const payload: FiscalInvPayload = {
    Date: formatFiscalDocumentDate(parsed.issuedAt),
    Mode: documentMode,
    Type: "INV",
    info: buyer
      ? { ItemList: lines, ValueDetails: valueDetails, BuyerDetails: buyer }
      : { ItemList: lines, ValueDetails: valueDetails },
    client: input.connection.client.trim(),
    trnx_id: guestInvoiceTrnxId(invoiceId),
    device_id: input.connection.deviceId.trim(),
    tax_payer_tin: input.connection.taxpayerTin.trim(),
    RelatedDocument: null,
    TransactionType: fiscalCustomerType,
    noruFiscalLines: numbered.links,
  };
  return {
    ok: true,
    payload,
    preview: {
      invoiceNumber: parsed.invoiceNumber,
      guestName: parsed.guestName,
      transactionType: fiscalCustomerType,
      currency: "ETB",
      mode: documentMode,
      pretax: reconciled.sourcePretax,
      tax: reconciled.taxValue,
      total: reconciled.totalValue,
    },
  };
}

export function parseFiscalInvoiceSuccess(body: unknown):
  | {
      ok: true;
      irn: string;
      documentNumber: string;
      acknowledgedAtRaw: string | null;
      acknowledgedAt: string | null;
      signedQr: string | null;
      signedInvoice: string | null;
      externalStatus: string;
    }
  | { ok: false; fatal: boolean; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      fatal: true,
      message: "The fiscal service returned an unexpected registration response.",
    };
  }
  const record = body as Record<string, unknown>;
  if (record.nonJson === true) {
    return {
      ok: false,
      fatal: true,
      message: "The fiscal service returned an unexpected registration response.",
    };
  }
  const nested =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null;
  const wrapped =
    record.body && typeof record.body === "object" && !Array.isArray(record.body)
      ? (record.body as Record<string, unknown>)
      : null;
  const source = nested ?? wrapped ?? record;
  const status = source.status ?? record.status;
  const irn = stringField(source.irn) ?? stringField(record.irn);
  const documentNumber = stringField(source.documentNumber) ?? stringField(record.documentNumber);
  const errorMessage = stringField(source.errorMessage) ?? stringField(record.errorMessage);
  if (status !== "A" || !irn || !documentNumber) {
    return {
      ok: false,
      fatal: true,
      message: errorMessage
        ? "The fiscal service rejected the invoice."
        : "The fiscal service returned an unexpected registration response.",
    };
  }
  const acknowledgedAtRaw = stringField(source.ackDate) ?? stringField(record.ackDate);
  const acknowledged = acknowledgedAtRaw ? new Date(acknowledgedAtRaw) : null;
  return {
    ok: true,
    irn,
    documentNumber,
    acknowledgedAtRaw,
    acknowledgedAt:
      acknowledged && !Number.isNaN(acknowledged.getTime()) ? acknowledged.toISOString() : null,
    signedQr: stringField(source.signedQR) ?? stringField(record.signedQR),
    signedInvoice: stringField(source.signedInvoice) ?? stringField(record.signedInvoice),
    externalStatus: "A",
  };
}

/** Fatal provider rule rejection. Returns null for transport and non-JSON failures. */
export function parseFiscalRuleValidation(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (record.nonJson === true) return null;
  const statusCode = Number(record.statusCode ?? 0);
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const rule = statusCode === 406 || message.toUpperCase().includes("RULE VALIDATION");
  if (!rule) return null;
  const lines = [message || "RULE VALIDATION ERROR"];
  const portions = Array.isArray(record.body) ? record.body : [];
  for (const portion of portions) {
    if (!portion || typeof portion !== "object" || Array.isArray(portion)) continue;
    const row = portion as Record<string, unknown>;
    if (typeof row.portion === "string" && row.portion.trim().length > 0) {
      lines.push(row.portion.trim());
    }
    const errors = Array.isArray(row.errorMessage)
      ? row.errorMessage
      : typeof row.errorMessage === "string"
        ? [row.errorMessage]
        : [];
    for (const error of errors) {
      if (typeof error === "string" && error.trim().length > 0) lines.push(error.trim());
    }
  }
  return lines.join("\n").slice(0, 1000);
}

export function fiscalQrSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200_000) return null;
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.startsWith("iVBORw0")) return `data:image/png;base64,${trimmed}`;
  return null;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function frozenLinePrice(
  group: FrozenGroup,
): { ok: true; quantity: number; unitPrice: number } | { ok: false; reason: string } {
  if (group.quantity != null && group.quantity > 0) {
    if (
      group.unitAmount != null &&
      Math.abs(fiscalMoney(group.unitAmount * group.quantity) - group.subtotal) <= 0.01
    ) {
      return {
        ok: true,
        quantity: group.quantity,
        unitPrice: fiscalMoney(group.unitAmount),
      };
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

function resolveItem(group: FrozenGroup, mappings: FiscalItemMapping[]): FiscalItemMapping | null {
  const active = mappings.filter((mapping) => mapping.active);
  // Rate plan is not a classifier. Room charges share the room mapping.
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

function parseFrozenInvoice(snapshot: unknown): {
  issuedAt: string;
  invoiceNumber: string;
  guestName: string;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  hasServiceCharge: boolean;
  groups: FrozenGroup[];
} | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const row = snapshot as Record<string, unknown>;
  if (Number(row.version ?? 0) < 2 || !Array.isArray(row.groups) || row.groups.length === 0) {
    return null;
  }
  const document = record(row.document);
  const folio = record(row.folio);
  const property = record(row.property);
  const totals = record(row.totals);
  const currency = String(folio?.currency ?? property?.currencyCode ?? "")
    .trim()
    .toUpperCase();
  const groups = row.groups.map(parseGroup).filter((group): group is FrozenGroup => group !== null);
  if (groups.length !== row.groups.length) return null;
  const subtotal = fiscalMoney(numberValue(totals?.subtotal));
  const tax = fiscalMoney(numberValue(totals?.tax));
  const service = fiscalMoney(numberValue(totals?.serviceCharge));
  const total = fiscalMoney(
    totals?.invoiceTotal == null ? subtotal + tax + service : numberValue(totals.invoiceTotal),
  );
  return {
    issuedAt: String(row.issuedAt ?? ""),
    invoiceNumber: String(document?.issuedNumber ?? ""),
    guestName: String(folio?.guestName ?? ""),
    currency,
    subtotal,
    tax,
    total,
    hasServiceCharge:
      service > 0 ||
      groups.some((group) => group.serviceChargeTotal > 0 || group.serviceLineCount > 0),
    groups,
  };
}

function parseGroup(value: unknown): FrozenGroup | null {
  const row = record(value);
  if (!row || row.ok === false) return null;
  const chargeSnapshot = record(row.chargeSnapshot);
  const taxLines = Array.isArray(row.taxLines)
    ? row.taxLines.map(parseTax).filter((tax): tax is FrozenTax => tax !== null)
    : [];
  if (Array.isArray(row.taxLines) && taxLines.length !== row.taxLines.length) return null;
  return {
    groupKey: textOrNull(row.parentTransactionId) ?? textOrNull(row.sourceGroupId) ?? "",
    description: String(row.description ?? "Invoice line"),
    chargeSource: textOrNull(row.chargeSource),
    serviceTypeId: textOrNull(chargeSnapshot?.serviceTypeId),
    departmentId: textOrNull(chargeSnapshot?.departmentId),
    natureOfSupplies: textOrNull(chargeSnapshot?.natureOfSupplies),
    quantity: positiveOrNull(row.quantity),
    unitAmount: row.unitAmount == null ? null : numberValue(row.unitAmount),
    subtotal: fiscalMoney(numberValue(row.subtotal)),
    taxTotal: fiscalMoney(numberValue(row.taxTotal)),
    serviceChargeTotal: fiscalMoney(numberValue(row.serviceChargeTotal)),
    grossTotal: fiscalMoney(numberValue(row.grossTotal)),
    taxLines,
    serviceLineCount: Array.isArray(row.serviceLines) ? row.serviceLines.length : 0,
  };
}

function parseTax(value: unknown): FrozenTax | null {
  const row = record(value);
  if (!row) return null;
  const snap = record(row.taxSnapshot);
  return {
    transactionId: textOrNull(row.id),
    taxId: textOrNull(snap?.taxId),
    name: String(row.name ?? snap?.name ?? row.description ?? "Tax"),
    amount: fiscalMoney(numberValue(row.amount)),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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
