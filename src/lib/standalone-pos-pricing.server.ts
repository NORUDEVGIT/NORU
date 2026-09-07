/**
 * Phase 8H2 — the one canonical Standalone POS money calculation.
 *
 * Every figure a sale line stores is produced here from server-read product
 * data. The browser may preview totals, but nothing it sends is trusted:
 * price, tax rate and every derived amount come from `pos_products` and the
 * property's POS settings. Rounding is half-up, per line, in the property
 * currency; the sale total is the sum of rounded line totals so a printed
 * receipt always adds up.
 */

export interface PosProductPricing {
  id: string;
  name: string;
  sku: string | null;
  unitPrice: number;
  taxRate: number | null;
}

export interface PosTaxSettings {
  defaultTaxRate: number;
  taxInclusive: boolean;
}

export interface PosLineAmounts {
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  lineSubtotal: number;
  lineTotal: number;
}

/** Half-up rounding to 2 decimals (JS default rounds .5 away from zero for positives). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Resolution order for a line's tax rate: product rate → POS default → 0. */
export function resolveTaxRate(product: PosProductPricing, settings: PosTaxSettings): number {
  if (product.taxRate !== null && product.taxRate !== undefined) return product.taxRate;
  return settings.defaultTaxRate ?? 0;
}

/**
 * Authoritative line calculation.
 *
 * Exclusive tax: subtotal = qty × price − discount, tax added on top.
 * Inclusive tax: the same net figure already contains the tax, which is
 * extracted so reports and the receipt agree.
 */
export function calculateLine(
  product: PosProductPricing,
  quantity: number,
  discountAmount: number,
  settings: PosTaxSettings,
): PosLineAmounts {
  const qty = Number(quantity);
  const rate = resolveTaxRate(product, settings);
  const gross = round2(product.unitPrice * qty);
  const discount = round2(Math.min(Math.max(discountAmount || 0, 0), gross));
  const net = round2(gross - discount);

  let lineSubtotal: number;
  let taxAmount: number;
  if (settings.taxInclusive) {
    lineSubtotal = round2(net / (1 + rate / 100));
    taxAmount = round2(net - lineSubtotal);
  } else {
    lineSubtotal = net;
    taxAmount = round2((net * rate) / 100);
  }

  return {
    quantity: qty,
    unitPrice: product.unitPrice,
    taxRate: rate,
    taxAmount,
    discountAmount: discount,
    lineSubtotal,
    lineTotal: round2(lineSubtotal + taxAmount),
  };
}

export interface PosSaleTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

/** Sale totals = sum of already-rounded line figures. */
export function calculateSaleTotals(
  lines: { lineSubtotal: number; taxAmount: number; discountAmount: number; lineTotal: number }[],
): PosSaleTotals {
  const sum = (pick: (l: (typeof lines)[number]) => number) =>
    round2(lines.reduce((acc, line) => acc + pick(line), 0));
  return {
    subtotal: sum((l) => l.lineSubtotal),
    discountAmount: sum((l) => l.discountAmount),
    taxAmount: sum((l) => l.taxAmount),
    total: sum((l) => l.lineTotal),
  };
}
