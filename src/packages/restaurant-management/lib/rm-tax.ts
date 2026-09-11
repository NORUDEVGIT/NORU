/**
 * Issue #22 — Restaurant Management property-level tax/VAT + optional service.
 *
 * Single math authority for till, waiter, QR and settings preview.
 * Merchandise → discount/comp → tax (inclusive extract vs exclusive add) →
 * optional service (% of tax-exclusive net AFTER discount/comp) → payable.
 *
 * Standalone POS `pos_*` tax is intentionally not referenced here.
 */

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, roundMoney(value)));
}

export interface RmTaxSettings {
  taxRate: number;
  taxInclusive: boolean;
  serviceEnabled: boolean;
  serviceRate: number;
}

export const DEFAULT_RM_TAX_SETTINGS: RmTaxSettings = {
  taxRate: 0,
  taxInclusive: false,
  serviceEnabled: false,
  serviceRate: 0,
};

export const SAMPLE_BILL_MERCHANDISE = 100;

export type RmTaxLabel = "Tax (included)" | "Tax (added)";

export interface RmBillAdjustments {
  discountAmount?: number;
  compAmount?: number;
}

export interface RmBillTotals {
  merchandiseSubtotal: number;
  discountAmount: number;
  compAmount: number;
  adjustedMerchandise: number;
  merchandiseNet: number;
  taxAmount: number;
  serviceAmount: number;
  payable: number;
  taxInclusive: boolean;
  taxRate: number;
  serviceEnabled: boolean;
  serviceRate: number;
  taxLabel: RmTaxLabel;
}

export function taxLabel(inclusive: boolean): RmTaxLabel {
  return inclusive ? "Tax (included)" : "Tax (added)";
}

export function normalizeRmTaxSettings(input: Partial<RmTaxSettings> | null | undefined): RmTaxSettings {
  return {
    taxRate: normalizeRate(input?.taxRate ?? 0),
    taxInclusive: input?.taxInclusive === true,
    serviceEnabled: input?.serviceEnabled === true,
    serviceRate: normalizeRate(input?.serviceRate ?? 0),
  };
}

/** Settings as stored on `restaurants` (snake_case). */
export interface RmTaxSettingsRow {
  tax_rate?: number | string | null;
  tax_inclusive?: boolean | null;
  service_enabled?: boolean | null;
  service_rate?: number | string | null;
}

export function parseRmTaxSettings(row: RmTaxSettingsRow | null | undefined): RmTaxSettings {
  return normalizeRmTaxSettings({
    taxRate: row?.tax_rate == null ? 0 : Number(row.tax_rate),
    taxInclusive: row?.tax_inclusive === true,
    serviceEnabled: row?.service_enabled === true,
    serviceRate: row?.service_rate == null ? 0 : Number(row.service_rate),
  });
}

export function merchandiseFromLines(lines: { price: number; quantity: number }[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
}

/**
 * Inclusive: extract tax already inside catalog prices — never add it again.
 * Exclusive: add tax on top of catalog prices.
 * Service, when on, is always a % of tax-exclusive net AFTER discount/comp.
 * Discount and comp reduce the merchandise base before tax and service.
 */
export function computeRmBill(
  merchandiseSubtotal: number,
  settings: RmTaxSettings,
  adjustments: RmBillAdjustments = {},
): RmBillTotals {
  const merchandise = roundMoney(Math.max(0, Number.isFinite(merchandiseSubtotal) ? merchandiseSubtotal : 0));
  const discountAmount = roundMoney(Math.max(0, Number.isFinite(adjustments.discountAmount) ? (adjustments.discountAmount ?? 0) : 0));
  const compAmount = roundMoney(Math.max(0, Number.isFinite(adjustments.compAmount) ? (adjustments.compAmount ?? 0) : 0));
  const adjustedMerchandise = roundMoney(Math.max(0, merchandise - discountAmount - compAmount));
  const normalized = normalizeRmTaxSettings(settings);
  const rate = normalized.taxRate;

  let taxAmount = 0;
  let merchandiseNet = adjustedMerchandise;

  if (rate > 0) {
    if (normalized.taxInclusive) {
      taxAmount = roundMoney(adjustedMerchandise * (rate / (100 + rate)));
      merchandiseNet = roundMoney(adjustedMerchandise - taxAmount);
    } else {
      taxAmount = roundMoney(adjustedMerchandise * (rate / 100));
      merchandiseNet = adjustedMerchandise;
    }
  }

  const serviceAmount =
    normalized.serviceEnabled && normalized.serviceRate > 0
      ? roundMoney(merchandiseNet * (normalized.serviceRate / 100))
      : 0;

  // Inclusive catalog prices already contain tax; exclusive adds it.
  const payable = normalized.taxInclusive
    ? roundMoney(adjustedMerchandise + serviceAmount)
    : roundMoney(adjustedMerchandise + taxAmount + serviceAmount);

  return {
    merchandiseSubtotal: merchandise,
    discountAmount,
    compAmount,
    adjustedMerchandise,
    merchandiseNet,
    taxAmount,
    serviceAmount,
    payable,
    taxInclusive: normalized.taxInclusive,
    taxRate: normalized.taxRate,
    serviceEnabled: normalized.serviceEnabled,
    serviceRate: normalized.serviceRate,
    taxLabel: taxLabel(normalized.taxInclusive),
  };
}

export interface RmOrderTaxSnapshot {
  merchandiseSubtotal: number | null;
  taxAmount: number | null;
  serviceAmount: number | null;
  taxRate: number | null;
  taxInclusive: boolean | null;
  serviceEnabled: boolean | null;
  serviceRate: number | null;
  discountAmount?: number | null;
  compAmount?: number | null;
  payable: number;
}

/**
 * Historical rows with null snapshots are legacy price × qty: payable is the
 * stored total and tax/service are treated as zero.
 */
export function billFromOrderSnapshot(snapshot: RmOrderTaxSnapshot): RmBillTotals {
  if (snapshot.merchandiseSubtotal == null || snapshot.taxAmount == null || snapshot.serviceAmount == null) {
    const payable = roundMoney(snapshot.payable);
    return {
      merchandiseSubtotal: payable,
      discountAmount: 0,
      compAmount: 0,
      adjustedMerchandise: payable,
      merchandiseNet: payable,
      taxAmount: 0,
      serviceAmount: 0,
      payable,
      taxInclusive: false,
      taxRate: 0,
      serviceEnabled: false,
      serviceRate: 0,
      taxLabel: taxLabel(false),
    };
  }

  return computeRmBill(
    snapshot.merchandiseSubtotal,
    {
      taxRate: snapshot.taxRate ?? 0,
      taxInclusive: snapshot.taxInclusive === true,
      serviceEnabled: snapshot.serviceEnabled === true,
      serviceRate: snapshot.serviceRate ?? 0,
    },
    {
      discountAmount: snapshot.discountAmount ?? 0,
      compAmount: snapshot.compAmount ?? 0,
    },
  );
}

export function snapshotColumns(bill: RmBillTotals) {
  return {
    merchandise_subtotal: bill.merchandiseSubtotal,
    discount_amount: bill.discountAmount,
    comp_amount: bill.compAmount,
    tax_amount: bill.taxAmount,
    service_amount: bill.serviceAmount,
    tax_rate_snapshot: bill.taxRate,
    tax_inclusive_snapshot: bill.taxInclusive,
    service_enabled_snapshot: bill.serviceEnabled,
    service_rate_snapshot: bill.serviceRate,
    total: bill.payable,
  };
}
