/**
 * PMS Property Setup Card 2 — Rate & Pricing (pure helpers and types).
 * Canonical owner for master rate categories, rate plans, base rates,
 * and room type relationships.
 *
 * Operational overrides and daily rate adjustments live in Rate & Revenue.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";
import type {
  CancellationPenaltyType,
  CancellationPolicyKind,
  CancellationWindowUnit,
} from "./cancellation-policy-rules";
export {
  PREDEFINED_RATE_CATEGORIES,
  isPredefinedCategoryConfigured,
  findMatchingPredefinedCategory,
  normalizeCategoryKey,
  type PredefinedRateCategory,
} from "./rates-categories-catalogue";

export const CARD2_RATES_AUDIT_SECTION = "card2-rates";
export const CARD2_RATES_UNAVAILABLE =
  "Rates & Pricing are unavailable until hotel rates are applied.";
export const CARD2_RATES_DERIVED_COPY =
  "Derived and corporate-style pricing is not in this schema. Card 2 does not invent a second rate engine.";
export const CARD2_RATES_ROOM_TYPES_COPY =
  "Room types come from Rooms & Operations. Rates assign a price to an existing type. They do not create types.";

export type Card2RatesAuditRow = {
  id: string;
  action: string;
  createdAt: string;
  detail: string | null;
};

export type Card2RoomTypeRef = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type RateCategoryRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type Card2MealPlanRef = {
  id: string;
  code: string;
  name: string;
  includesBreakfast: boolean;
  active: boolean;
};

export {
  CANCELLATION_PENALTY_TYPE_LABELS,
  CANCELLATION_PENALTY_TYPES,
  CANCELLATION_POLICY_KIND_LABELS,
  CANCELLATION_POLICY_KINDS,
  CANCELLATION_WINDOW_UNIT_LABELS,
  CANCELLATION_WINDOW_UNITS,
  type CancellationPenaltyType,
  type CancellationPolicyKind,
  type CancellationWindowUnit,
} from "./cancellation-policy-rules";

export type RateCancellationPolicyRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  policyKind: CancellationPolicyKind;
  windowValue: number | null;
  windowUnit: CancellationWindowUnit;
  cutoffTime: string | null;
  penaltyType: CancellationPenaltyType;
  penaltyValue: number;
  deadlineHours: number | null;
  active: boolean;
};

export const RATE_REFUNDABILITY_KINDS = [
  "refundable",
  "non_refundable",
  "partially_refundable",
] as const;
export type RateRefundabilityKind = (typeof RATE_REFUNDABILITY_KINDS)[number];

export type RateRefundabilityRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  kind: RateRefundabilityKind;
  active: boolean;
};

export type RatePlanRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  currency: string;
  baseRate: number;
  validFrom?: string | null;
  validTo?: string | null;
  mealPlanId: string | null;
  mealPlanName: string;
  breakfastIncluded: boolean;
  cancellationPolicyId: string | null;
  cancellationName: string;
  refundabilityId: string | null;
  refundabilityName: string;
  refundabilityKind: RateRefundabilityKind | null;
  active: boolean;
};

export type RatesCard2Snapshot = {
  roomTypes: Card2RoomTypeRef[];
  categories: RateCategoryRow[];
  mealPlans: Card2MealPlanRef[];
  cancellationPolicies: RateCancellationPolicyRow[];
  refundabilityCodes: RateRefundabilityRow[];
  plans: RatePlanRow[];
};

export type RatesCard2Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
};

export function evaluateRatesCard2Readiness(snapshot: RatesCard2Snapshot): RatesCard2Readiness {
  const blockers: string[] = [];
  const typeIds = new Set(snapshot.roomTypes.map((row) => row.id));
  const hasRows = snapshot.plans.length > 0 || snapshot.categories.length > 0;

  if (snapshot.roomTypes.length === 0) {
    blockers.push("Add a room type in Rooms & Operations before assigning rates.");
  }

  const completePlan = snapshot.plans.find(
    (row) => row.active && row.baseRate > 0 && typeIds.has(row.roomTypeId),
  );
  if (!completePlan) {
    blockers.push(
      "Save at least one active rate plan with a price on an existing Card 2 room type.",
    );
  }

  if (!hasRows) {
    return { ready: false, status: "not_started", blockers };
  }
  if (blockers.length === 0) {
    return { ready: true, status: "complete", blockers };
  }
  return { ready: false, status: "in_progress", blockers };
}
