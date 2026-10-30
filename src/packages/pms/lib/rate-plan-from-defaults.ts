/**
 * Create-time Rate Plan base calculation from Room Type defaults.
 * Persists only hotel_rate_plans.base_rate — never a live pricing method.
 */

export type RatePlanPricingMethod = "use_base" | "discount" | "markup" | "fixed";

export type ComputeRatePlanBaseInput = {
  method: RatePlanPricingMethod;
  roomTypeBase: number | null | undefined;
  percent?: number | null | undefined;
  fixedPrice?: number | null | undefined;
};

export type ComputeRatePlanBaseResult =
  | {
      ok: true;
      baseRate: number;
      roomTypeBase: number | null;
      adjustment: number;
    }
  | { ok: false; message: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeRatePlanBaseFromDefaults(
  input: ComputeRatePlanBaseInput,
): ComputeRatePlanBaseResult {
  const base = input.roomTypeBase;
  if (input.method === "fixed") {
    if (input.fixedPrice == null || !Number.isFinite(input.fixedPrice) || input.fixedPrice < 0) {
      return { ok: false, message: "Enter a fixed price." };
    }
    return {
      ok: true,
      baseRate: roundMoney(input.fixedPrice),
      roomTypeBase: base == null || !Number.isFinite(base) ? null : roundMoney(base),
      adjustment: 0,
    };
  }

  if (base == null || !Number.isFinite(base) || base < 0) {
    return {
      ok: false,
      message: "No Room Type base price is configured.",
    };
  }

  if (input.method === "use_base") {
    return { ok: true, baseRate: roundMoney(base), roomTypeBase: roundMoney(base), adjustment: 0 };
  }

  const percent = input.percent;
  if (percent == null || !Number.isFinite(percent) || percent < 0) {
    return { ok: false, message: "Enter a percent of 0 or more." };
  }

  if (input.method === "discount") {
    const next = roundMoney(base * (1 - percent / 100));
    return {
      ok: true,
      baseRate: next,
      roomTypeBase: roundMoney(base),
      adjustment: roundMoney(next - base),
    };
  }

  const next = roundMoney(base * (1 + percent / 100));
  return {
    ok: true,
    baseRate: next,
    roomTypeBase: roundMoney(base),
    adjustment: roundMoney(next - base),
  };
}

export function roomTypeBaseIsConfigured(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value >= 0;
}

export type RatePlanOccupancyFieldSource = {
  includedOccupancy?: number | null;
  extraAdultRate?: number | null;
  extraChildRate?: number | null;
  standardOccupancy?: number | null;
  extraAdultRateDefault?: number | null;
  extraChildRateDefault?: number | null;
};

export function occupancyFieldsFromRoomTypeDefaults(
  type: RatePlanOccupancyFieldSource | null | undefined,
): { includedOccupancy: string; extraAdultRate: string; extraChildRate: string } {
  const included = type?.standardOccupancy;
  return {
    includedOccupancy: included != null && Number.isInteger(included) && included >= 1 ? String(included) : "",
    extraAdultRate: type?.extraAdultRateDefault == null ? "" : String(type.extraAdultRateDefault),
    extraChildRate: type?.extraChildRateDefault == null ? "" : String(type.extraChildRateDefault),
  };
}

export function occupancyFieldsFromSavedRatePlan(
  plan: RatePlanOccupancyFieldSource | null | undefined,
): { includedOccupancy: string; extraAdultRate: string; extraChildRate: string } {
  return {
    includedOccupancy: plan?.includedOccupancy == null ? "" : String(plan.includedOccupancy),
    extraAdultRate: plan?.extraAdultRate == null ? "" : String(plan.extraAdultRate),
    extraChildRate: plan?.extraChildRate == null ? "" : String(plan.extraChildRate),
  };
}
