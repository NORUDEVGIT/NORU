/**
 * Canonical Travel Agency Commission Resolution Engine
 * Enforces strict rule precedence:
 *   1. Rate Plan-specific rule (highest)
 *   2. Room Type-specific rule
 *   3. Apply-to-All rule
 *   4. Legacy commission-plan fallback
 *   5. No match -> no commission
 */

import { calculateCommissionAmount } from "./guest-travel-agent-detail-workspace.ts";

export type TravelAgentCommissionScopeType = "all" | "room_type" | "rate_plan";

export type TravelAgentCommissionRuleRecord = {
  id: string;
  commission_plan_id: string;
  scope_type: TravelAgentCommissionScopeType;
  room_type_id?: string | null;
  rate_plan_id?: string | null;
  commission_type: "percent" | "fixed";
  commission_value: number;
  active: boolean;
  display_order?: number;
};

export type TravelAgentCommissionPlanCandidate = {
  id: string;
  commission_type: "percent" | "fixed";
  rate_value: number;
  currency: string;
  effective_on: string;
  expires_on?: string | null;
  active?: boolean;
};

export type CommissionResolutionInput = {
  plans: TravelAgentCommissionPlanCandidate[];
  rules?: TravelAgentCommissionRuleRecord[];
  arrivalDate: string;
  roomTypeId?: string | null;
  ratePlanId?: string | null;
};

export type CommissionResolutionResult = {
  matched: boolean;
  planId: string | null;
  ruleId: string | null;
  scope: "rate_plan" | "room_type" | "all" | "legacy_plan" | "none";
  commissionType: "percent" | "fixed" | null;
  commissionValue: number | null;
  currency: string | null;
  amount: number;
};

/**
 * Resolves the applicable commission rule and computes the commission amount
 * strictly using room_subtotal as the revenue basis.
 */
export function resolveTravelAgentCommissionRule(
  options: CommissionResolutionInput & { roomSubtotal: number },
): CommissionResolutionResult {
  const { plans, rules = [], arrivalDate, roomTypeId, ratePlanId, roomSubtotal } = options;

  // 1. Resolve active commission plan for the reservation's arrival date
  const activePlan = plans
    .filter((p) => p.active !== false)
    .find((p) => {
      const starts = p.effective_on <= arrivalDate;
      const ends = !p.expires_on || p.expires_on >= arrivalDate;
      return starts && ends;
    });

  if (!activePlan) {
    return {
      matched: false,
      planId: null,
      ruleId: null,
      scope: "none",
      commissionType: null,
      commissionValue: null,
      currency: null,
      amount: 0,
    };
  }

  // Filter rules belonging to this plan
  const planRules = rules.filter(
    (r) => r.active !== false && r.commission_plan_id === activePlan.id,
  );

  // 2. Precedence 1: Exact Rate Plan match
  if (ratePlanId) {
    const ratePlanRule = planRules.find(
      (r) => r.scope_type === "rate_plan" && r.rate_plan_id === ratePlanId,
    );
    if (ratePlanRule) {
      const val = Number(ratePlanRule.commission_value);
      const amount = calculateCommissionAmount({
        type: ratePlanRule.commission_type,
        rateValue: val,
        basisAmount: roomSubtotal,
      });
      return {
        matched: true,
        planId: activePlan.id,
        ruleId: ratePlanRule.id,
        scope: "rate_plan",
        commissionType: ratePlanRule.commission_type,
        commissionValue: val,
        currency: activePlan.currency,
        amount,
      };
    }
  }

  // 3. Precedence 2: Room Type match
  if (roomTypeId) {
    const roomTypeRule = planRules.find(
      (r) => r.scope_type === "room_type" && r.room_type_id === roomTypeId,
    );
    if (roomTypeRule) {
      const val = Number(roomTypeRule.commission_value);
      const amount = calculateCommissionAmount({
        type: roomTypeRule.commission_type,
        rateValue: val,
        basisAmount: roomSubtotal,
      });
      return {
        matched: true,
        planId: activePlan.id,
        ruleId: roomTypeRule.id,
        scope: "room_type",
        commissionType: roomTypeRule.commission_type,
        commissionValue: val,
        currency: activePlan.currency,
        amount,
      };
    }
  }

  // 4. Precedence 3: Apply-to-All rule
  const allRule = planRules.find((r) => r.scope_type === "all");
  if (allRule) {
    const val = Number(allRule.commission_value);
    const amount = calculateCommissionAmount({
      type: allRule.commission_type,
      rateValue: val,
      basisAmount: roomSubtotal,
    });
    return {
      matched: true,
      planId: activePlan.id,
      ruleId: allRule.id,
      scope: "all",
      commissionType: allRule.commission_type,
      commissionValue: val,
      currency: activePlan.currency,
      amount,
    };
  }

  // 5. Precedence 4: Legacy plan fallback (when no rules rows exist)
  if (planRules.length === 0 && activePlan.commission_type && Number(activePlan.rate_value) >= 0) {
    const val = Number(activePlan.rate_value);
    const amount = calculateCommissionAmount({
      type: activePlan.commission_type,
      rateValue: val,
      basisAmount: roomSubtotal,
    });
    return {
      matched: true,
      planId: activePlan.id,
      ruleId: null,
      scope: "legacy_plan",
      commissionType: activePlan.commission_type,
      commissionValue: val,
      currency: activePlan.currency,
      amount,
    };
  }

  // 6. Precedence 5: No matching rule -> zero commission
  return {
    matched: false,
    planId: activePlan.id,
    ruleId: null,
    scope: "none",
    commissionType: null,
    commissionValue: null,
    currency: activePlan.currency,
    amount: 0,
  };
}
