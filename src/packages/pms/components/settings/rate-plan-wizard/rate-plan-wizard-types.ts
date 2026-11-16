import type { RatePlanPricingMethod } from "@/packages/pms/lib/rate-plan-from-defaults";
import type { CancellationPolicyKind } from "@/packages/pms/lib/cancellation-policy-rules";

export const RATE_PLAN_WIZARD_STEPS = [
  { id: 1, title: "Rate Plan & Pricing" },
  { id: 2, title: "Policies" },
  { id: 3, title: "Meals & Packages" },
  { id: 4, title: "Status & Availability" },
  { id: 5, title: "Review" },
] as const;

export type RatePlanWizardStepId = (typeof RATE_PLAN_WIZARD_STEPS)[number]["id"];

export const RATE_PLAN_NONE = "__none__";

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
  active: boolean;
  /** UI-only mirror of Active — model has no separate sellable column. */
  sellable: boolean;
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
    active: true,
    sellable: true,
  };
}

export function derivedRefundabilityLabel(
  policyKind: CancellationPolicyKind | null | undefined,
): string {
  if (!policyKind) return "Select a cancellation policy";
  if (policyKind === "non_refundable") return "Non-refundable";
  return "Refundable / conditional";
}

export function isRatePlanWizardStep1Valid(form: RatePlanWizardForm): boolean {
  return (
    Boolean(form.categoryId) &&
    Boolean(form.roomTypeId) &&
    Boolean(form.name.trim()) &&
    Boolean(form.code.trim()) &&
    Boolean(form.validFrom.trim()) &&
    Number.isFinite(form.baseRate) &&
    form.baseRate >= 0 &&
    (form.noEndDate || !form.validTo || form.validTo >= form.validFrom)
  );
}
