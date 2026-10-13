/**
 * Phase 2 guest-invoice payload builder.
 *
 * Only an already-issued guest charge-group invoice in ETB, treated as B2C,
 * can become a fiscal INV. Amounts come from the frozen invoice snapshot.
 * Tax codes and item identity come from property mappings. This module does
 * not post ledger rows and does not call the fiscal API.
 *
 * ItemList and ValueDetails are nested under info. Mode is FISCAL_DOCUMENT_MODE
 * and Unit is FISCAL_ITEM_UNIT. Neither is chosen from a payment or a mapping.
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
  };
  client: string;
  trnx_id: string;
  device_id: string;
  tax_payer_tin: string;
  RelatedDocument: null;
  TransactionType: "B2C";
};

export type GuestInvoiceFiscalPreview = {
  invoiceNumber: string;
  guestName: string;
  transactionType: "B2C";
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
  grossTotal: number;
  taxLines: FrozenTax[];
  serviceLineCount: number;
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

  const lines: FiscalInvLine[] = [];
  if (!parsed || parsed.currency !== "ETB" || parsed.hasServiceCharge) {
    return { ok: false, reasons, missingTaxes, missingItems, missingMode, missingDevice };
  }
  parsed.groups.forEach((group, index) => {
    if (group.taxLines.length > 1) {
      reasons.push(`This invoice line has more than one tax component: "${group.description}".`);
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

  if (lines.length !== parsed.groups.length || reasons.length > 0) {
    return { ok: false, reasons, missingTaxes, missingItems, missingMode, missingDevice };
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
    return { ok: false, reasons, missingTaxes, missingItems, missingMode, missingDevice };
  }

  const payload: FiscalInvPayload = {
    Date: formatFiscalDocumentDate(parsed.issuedAt),
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
    },
    client: input.connection.client.trim(),
    trnx_id: guestInvoiceTrnxId(invoiceId),
    device_id: input.connection.deviceId.trim(),
    tax_payer_tin: input.connection.taxpayerTin.trim(),
    RelatedDocument: null,
    TransactionType: "B2C",
  };
  return {
    ok: true,
    payload,
    preview: {
      invoiceNumber: parsed.invoiceNumber,
      guestName: parsed.guestName,
      transactionType: "B2C",
      currency: "ETB",
      mode: FISCAL_DOCUMENT_MODE,
      pretax: parsed.subtotal,
      tax: parsed.tax,
      total: parsed.total,
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
    return {
      ok: false,
      label: tax.name,
      reason: `Missing tax mapping for "${tax.name}".`,
    };
  }
  return { ok: true, code: mapped.externalTaxCode.trim() };
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
    description: String(row.description ?? "Invoice line"),
    chargeSource: textOrNull(row.chargeSource),
    serviceTypeId: textOrNull(chargeSnapshot?.serviceTypeId),
    departmentId: textOrNull(chargeSnapshot?.departmentId),
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
