/**
 * Reads a successful guest INV request snapshot.
 *
 * Credit and debit registration copy item identity from this snapshot.
 * A root ItemList, or info set to null, is an unsupported legacy shape.
 */
import { fiscalMoney } from "./fiscal-guest-invoice.ts";

export type OriginalFiscalLine = {
  index: number;
  unit: string;
  taxCode: string;
  itemCode: number | string;
  quantity: number;
  unitPrice: number;
  preTax: number;
  tax: number;
  nature: string;
  harmonization: string | null;
  description: string;
};

export function parseOriginalFiscalInvoice(snapshot: unknown): {
  transactionType: string;
  lines: OriginalFiscalLine[];
} | null {
  const row = record(snapshot);
  if (!row || row.Type !== "INV") return null;
  const info = record(row.info);
  const items = info?.ItemList;
  if (!Array.isArray(items) || items.length === 0) return null;
  if ("ItemList" in row || "ValueDetails" in row) return null;
  const lines = items.map(parseOriginalLine);
  if (lines.some((line) => line == null)) return null;
  const transactionType = typeof row.TransactionType === "string" ? row.TransactionType : "";
  return { transactionType, lines: lines as OriginalFiscalLine[] };
}

/** Exact BuyerDetails object from a stored INV request, including null fields. */
export function copyOriginalBuyerDetails(snapshot: unknown): Record<string, unknown> | null {
  const info = record(record(snapshot)?.info);
  const buyer = record(info?.BuyerDetails);
  if (!buyer) return null;
  return { ...buyer };
}

export function originalInvoiceTotal(snapshot: unknown): number | null {
  const details = record(record(record(snapshot)?.info)?.ValueDetails);
  if (!details || !("TotalValue" in details)) return null;
  const total = numberValue(details.TotalValue);
  return Number.isFinite(total) ? fiscalMoney(total) : null;
}

/** Company invoice groups are keyed by sourceGroupId. Guest groups use parentTransactionId. */
export function invoiceGroupSourceIds(snapshot: unknown): Array<string | null> {
  const row = record(snapshot);
  if (!Array.isArray(row?.groups)) return [];
  return row.groups.map((group) => text(record(group)?.sourceGroupId));
}

export function invoiceGroupParentIds(snapshot: unknown): Array<string | null> {
  const row = record(snapshot);
  if (!Array.isArray(row?.groups)) return [];
  return row.groups.map((group) => text(record(group)?.parentTransactionId));
}

/** The invoice group index whose parent transaction is this source id, once. */
export function uniqueInvoiceGroupIndex(
  parentIds: Array<string | null>,
  sourceGroupId: string,
): number | null {
  const indexes = parentIds
    .map((id, index) => (id === sourceGroupId ? index : -1))
    .filter((index) => index >= 0);
  return indexes.length === 1 ? indexes[0] : null;
}

function parseOriginalLine(value: unknown, index: number): OriginalFiscalLine | null {
  const row = record(value);
  if (!row) return null;
  const description = typeof row.ProductDescription === "string" ? row.ProductDescription : "";
  const taxCode = typeof row.TaxCode === "string" ? row.TaxCode.trim() : "";
  const unit = typeof row.Unit === "string" ? row.Unit.trim() : "";
  const nature = typeof row.NatureOfSupplies === "string" ? row.NatureOfSupplies.trim() : "";
  const itemCode = copiedItemCode(row.ItemCode);
  if (!description || !taxCode || !unit || !nature || itemCode == null) return null;
  return {
    index,
    unit,
    taxCode,
    itemCode,
    quantity: numberValue(row.Quantity),
    unitPrice: fiscalMoney(numberValue(row.UnitPrice)),
    preTax: fiscalMoney(numberValue(row.PreTaxValue)),
    tax: fiscalMoney(numberValue(row.TaxAmount)),
    nature,
    harmonization:
      row.HarmonizationCode == null
        ? null
        : typeof row.HarmonizationCode === "string"
          ? row.HarmonizationCode
          : null,
    description,
  };
}

function copiedItemCode(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
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
