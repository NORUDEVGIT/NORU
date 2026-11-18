import type { RatePlanPricingMethod } from "@/packages/pms/lib/rate-plan-from-defaults";
import type { CancellationPolicyKind } from "@/packages/pms/lib/cancellation-policy-rules";
import type { PackageInclusionType } from "@/packages/pms/lib/rate-plan-package-inclusion";

export const RATE_PLAN_WIZARD_STEPS = [
  { id: 1, title: "Rate Plan & Pricing" },
  { id: 2, title: "Policies" },
  { id: 3, title: "Meals & Packages" },
  { id: 4, title: "Availability & Restrictions" },
  { id: 5, title: "Review" },
] as const;

/** Sentinel used when staff choose “No end date” for restriction validity. */
export const RATE_PLAN_RESTRICTION_OPEN_ENDED_TO = "9999-12-31";

export type RatePlanWizardStepId = (typeof RATE_PLAN_WIZARD_STEPS)[number]["id"];

export const RATE_PLAN_NONE = "__none__";

export const RATE_PLAN_PACKAGE_INCLUSION_DEFAULT: PackageInclusionType = "included";

export type RatePlanWizardForm = {
  categoryId: string;
  roomTypeId: string;
  name: string;
  code: string;
  description: string;
  validFrom: string;
  validTo: string;
  noEndDate: boolean;
  pricingMethod: RatePlanPricingMethod;
  methodPercent: number;
  baseRate: number;
  includedOccupancy: string;
  extraAdultRate: string;
  extraChildRate: string;
  cancellationPolicyId: string;
  depositPolicyId: string;
  noShowPolicyId: string;
  earlyDeparturePolicyId: string;
  mealPlanId: string;
  packageId: string;
  /** Rate Plan → Package relationship (not Package Master). */
  packageInclusionType: PackageInclusionType;
  active: boolean;
  /** UI-only mirror of Active — model has no separate sellable column. */
  sellable: boolean;
  /**
   * Booking restrictions. Advance days persist on hotel_rate_plans.
   * Stay / CTA / CTD seed or update hotel_rate_restrictions only when safe
   * (no heterogeneous date-level overrides). Empty strings mean
   * “No minimum / No maximum”. stop_sell is never owned here.
   */
  minStayNights: string;
  maxStayNights: string;
  minAdvanceDays: string;
  maxAdvanceDays: string;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  restrictionValidFrom: string;
  restrictionValidTo: string;
  restrictionNoEndDate: boolean;
};

export function todayDateInput(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function emptyRatePlanWizardForm(defaults?: {
  categoryId?: string;
  roomTypeId?: string;
}): RatePlanWizardForm {
  return {
    categoryId: defaults?.categoryId ?? "",
    roomTypeId: defaults?.roomTypeId ?? "",
    name: "",
    code: "",
    description: "",
    validFrom: todayDateInput(),
    validTo: "",
    noEndDate: true,
    pricingMethod: "fixed",
    methodPercent: 10,
    baseRate: 0,
    includedOccupancy: "",
    extraAdultRate: "",
    extraChildRate: "",
    cancellationPolicyId: RATE_PLAN_NONE,
    depositPolicyId: RATE_PLAN_NONE,
    noShowPolicyId: RATE_PLAN_NONE,
    earlyDeparturePolicyId: RATE_PLAN_NONE,
    mealPlanId: RATE_PLAN_NONE,
    packageId: RATE_PLAN_NONE,
    packageInclusionType: RATE_PLAN_PACKAGE_INCLUSION_DEFAULT,
    active: true,
    sellable: true,
    minStayNights: "",
    maxStayNights: "",
    minAdvanceDays: "",
    maxAdvanceDays: "",
    closedToArrival: false,
    closedToDeparture: false,
    restrictionValidFrom: todayDateInput(),
    restrictionValidTo: "",
    restrictionNoEndDate: true,
  };
}

export function parseOptionalPositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function parseOptionalNonNegativeInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export function formatAdvanceBookingSummary(minDays: string, maxDays: string): string {
  const min = parseOptionalNonNegativeInt(minDays);
  const max = parseOptionalNonNegativeInt(maxDays);
  if (min == null && max == null) return "None";
  if (min != null && max != null) return `${min}–${max} days`;
  if (min != null) return `From ${min} days`;
  return `Up to ${max} days`;
}

export function formatStaySummary(minNights: string, maxNights: string): {
  minimum: string;
  maximum: string;
} {
  const min = parseOptionalPositiveInt(minNights);
  const max = parseOptionalPositiveInt(maxNights);
  return {
    minimum: min == null ? "No minimum" : `${min} night${min === 1 ? "" : "s"}`,
    maximum: max == null ? "No maximum" : `${max} night${max === 1 ? "" : "s"}`,
  };
}

export function isOpenEndedRestrictionTo(validTo: string): boolean {
  return validTo === RATE_PLAN_RESTRICTION_OPEN_ENDED_TO;
}

/**
 * hotel_rate_restrictions stores open-ended windows as a capped date span
 * (not the 9999-12-31 sentinel). Treat near-max windows as “No end date”
 * so staff never see the sentinel and edit round-trips correctly.
 */
export function isEffectivelyOpenEndedRestrictionWindow(
  validFrom: string | null | undefined,
  validTo: string | null | undefined,
): boolean {
  if (!validTo || isOpenEndedRestrictionTo(validTo)) return true;
  if (!validFrom) return false;
  const from = new Date(`${validFrom}T12:00:00.000Z`);
  const to = new Date(`${validTo}T12:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
  const spanDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return spanDays >= 360;
}

export function derivedRefundabilityLabel(
  policyKind: CancellationPolicyKind | null | undefined,
): string {
  if (!policyKind) return "Select a cancellation policy";
  if (policyKind === "non_refundable") return "Non-refundable";
  return "Refundable / conditional";
}

export function isRatePlanWizardStep1Valid(form: RatePlanWizardForm): boolean {
  const code = form.code.trim().toUpperCase();
  return (
    Boolean(form.categoryId) &&
    Boolean(form.roomTypeId) &&
    Boolean(form.name.trim()) &&
    Boolean(code) &&
    /^[A-Z0-9_]{1,30}$/.test(code) &&
    Boolean(form.validFrom.trim()) &&
    Number.isFinite(form.baseRate) &&
    form.baseRate >= 0 &&
    (form.noEndDate || !form.validTo || form.validTo >= form.validFrom)
  );
}
