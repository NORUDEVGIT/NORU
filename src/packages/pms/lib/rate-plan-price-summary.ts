/**
 * Display-only Rate Plan ↔ Package price composition for Create Review / Edit.
 * Does not change Rate Plan base_rate or Package Master pricing ownership.
 */

import {
  PACKAGE_CHARGE_BASIS_LABELS,
  type PackageChargeBasis,
} from "@/packages/pms/lib/meals-card3.server";

export function formatRatePlanMoney(currencyCode: string, amount: number): string {
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    : String(amount);
  return `${currencyCode.trim() || "CUR"} ${formatted}`;
}

/** Staff-facing short charge-basis suffix from Package Master (`PACKAGE_CHARGE_BASES`). */
export function packageChargeBasisSuffix(basis: PackageChargeBasis): string {
  switch (basis) {
    case "per_stay":
      return "/ stay";
    case "per_night":
      return "/ night";
    case "per_person":
      return "/ person";
    case "per_room":
      return "/ room";
    case "per_unit":
      return "/ unit";
    default:
      return "";
  }
}

export function formatPackagePriceDetail(
  row: { packagePrice: number; chargeBasis: PackageChargeBasis },
  currencyCode: string,
): string {
  const money = formatRatePlanMoney(currencyCode, row.packagePrice);
  const suffix = packageChargeBasisSuffix(row.chargeBasis);
  return suffix ? `${money} ${suffix}` : money;
}

/** Dropdown secondary line: `ETB 1,200 · Per stay`. */
export function formatPackageDropdownDetail(
  row: { packagePrice: number; chargeBasis: PackageChargeBasis },
  currencyCode: string,
): string {
  const money = formatRatePlanMoney(currencyCode, row.packagePrice);
  const basis =
    PACKAGE_CHARGE_BASIS_LABELS[row.chargeBasis] ?? String(row.chargeBasis);
  return `${money} · ${basis}`;
}

/**
 * Display-only 1-night preview.
 * Room base rate stays owned by the Rate Plan; package amount stays owned by Package Master.
 */
export function oneNightStartingTotal(baseRate: number, packagePrice: number): number {
  const room = Number.isFinite(baseRate) ? baseRate : 0;
  const pkg = Number.isFinite(packagePrice) ? packagePrice : 0;
  return Math.round((room + pkg + Number.EPSILON) * 100) / 100;
}
