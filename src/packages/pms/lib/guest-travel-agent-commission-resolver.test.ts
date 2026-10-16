import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveTravelAgentCommissionRule,
  type TravelAgentCommissionPlanCandidate,
  type TravelAgentCommissionRuleRecord,
} from "./guest-travel-agent-commission-resolver.ts";

describe("Travel Agency Commission Resolution Engine", () => {
  const basePlan: TravelAgentCommissionPlanCandidate = {
    id: "plan-1",
    commission_type: "percent",
    rate_value: 10,
    currency: "ETB",
    effective_on: "2026-01-01",
    expires_on: "2026-12-31",
    active: true,
  };

  const standardRoomId = "room-std";
  const deluxeRoomId = "room-dlx";
  const barStdPlanId = "rate-bar-std";
  const barDlxPlanId = "rate-bar-dlx";
  const corpDlxPlanId = "rate-corp-dlx";

  it("Case A: All -> 10% applies to Standard / BAR reservation", () => {
    const rules: TravelAgentCommissionRuleRecord[] = [
      {
        id: "rule-all",
        commission_plan_id: "plan-1",
        scope_type: "all",
        commission_type: "percent",
        commission_value: 10,
        active: true,
      },
    ];

    const result = resolveTravelAgentCommissionRule({
      plans: [basePlan],
      rules,
      arrivalDate: "2026-06-15",
      roomTypeId: standardRoomId,
      ratePlanId: barStdPlanId,
      roomSubtotal: 1000,
    });

    assert.equal(result.matched, true);
    assert.equal(result.scope, "all");
    assert.equal(result.commissionType, "percent");
    assert.equal(result.commissionValue, 10);
    assert.equal(result.amount, 100);
    assert.equal(result.currency, "ETB");
  });

  it("Case B: Deluxe -> 20% overrides All -> 10% on Deluxe / BAR reservation", () => {
    const rules: TravelAgentCommissionRuleRecord[] = [
      {
        id: "rule-all",
        commission_plan_id: "plan-1",
        scope_type: "all",
        commission_type: "percent",
        commission_value: 10,
        active: true,
      },
      {
        id: "rule-dlx",
        commission_plan_id: "plan-1",
        scope_type: "room_type",
        room_type_id: deluxeRoomId,
        commission_type: "percent",
        commission_value: 20,
        active: true,
      },
    ];

    const result = resolveTravelAgentCommissionRule({
      plans: [basePlan],
      rules,
      arrivalDate: "2026-06-15",
      roomTypeId: deluxeRoomId,
      ratePlanId: barDlxPlanId,
      roomSubtotal: 2000,
    });

    assert.equal(result.matched, true);
    assert.equal(result.scope, "room_type");
    assert.equal(result.commissionType, "percent");
    assert.equal(result.commissionValue, 20);
    assert.equal(result.amount, 400);
  });

  it("Case C: Deluxe / Corporate Rate -> 15% overrides Room Type and All rules", () => {
    const rules: TravelAgentCommissionRuleRecord[] = [
      {
        id: "rule-all",
        commission_plan_id: "plan-1",
        scope_type: "all",
        commission_type: "percent",
        commission_value: 10,
        active: true,
      },
      {
        id: "rule-dlx",
        commission_plan_id: "plan-1",
        scope_type: "room_type",
        room_type_id: deluxeRoomId,
        commission_type: "percent",
        commission_value: 20,
        active: true,
      },
      {
        id: "rule-corp-dlx",
        commission_plan_id: "plan-1",
        scope_type: "rate_plan",
        room_type_id: deluxeRoomId,
        rate_plan_id: corpDlxPlanId,
        commission_type: "percent",
        commission_value: 15,
        active: true,
      },
    ];

    const result = resolveTravelAgentCommissionRule({
      plans: [basePlan],
      rules,
      arrivalDate: "2026-06-15",
      roomTypeId: deluxeRoomId,
      ratePlanId: corpDlxPlanId,
      roomSubtotal: 2000,
    });

    assert.equal(result.matched, true);
    assert.equal(result.scope, "rate_plan");
    assert.equal(result.commissionType, "percent");
    assert.equal(result.commissionValue, 15);
    assert.equal(result.amount, 300);
  });

  it("Case D: No All rule, No matching Room Type, No matching Rate Plan -> no commission", () => {
    const rules: TravelAgentCommissionRuleRecord[] = [
      {
        id: "rule-dlx",
        commission_plan_id: "plan-1",
        scope_type: "room_type",
        room_type_id: deluxeRoomId,
        commission_type: "percent",
        commission_value: 20,
        active: true,
      },
    ];

    const result = resolveTravelAgentCommissionRule({
      plans: [basePlan],
      rules,
      arrivalDate: "2026-06-15",
      roomTypeId: standardRoomId,
      ratePlanId: barStdPlanId,
      roomSubtotal: 1000,
    });

    assert.equal(result.matched, false);
    assert.equal(result.scope, "none");
    assert.equal(result.commissionType, null);
    assert.equal(result.commissionValue, null);
    assert.equal(result.amount, 0);
  });

  it("Case E: Legacy commission plan: 10%, no rule rows -> 10% Apply-to-All fallback", () => {
    const result = resolveTravelAgentCommissionRule({
      plans: [basePlan],
      rules: [], // no rules
      arrivalDate: "2026-06-15",
      roomTypeId: standardRoomId,
      ratePlanId: barStdPlanId,
      roomSubtotal: 1500,
    });

    assert.equal(result.matched, true);
    assert.equal(result.scope, "legacy_plan");
    assert.equal(result.commissionType, "percent");
    assert.equal(result.commissionValue, 10);
    assert.equal(result.amount, 150);
  });

  it("Fixed commission: applies once per reservation/stay without multiplying by nights/rooms", () => {
    const rules: TravelAgentCommissionRuleRecord[] = [
      {
        id: "rule-fixed",
        commission_plan_id: "plan-1",
        scope_type: "rate_plan",
        room_type_id: deluxeRoomId,
        rate_plan_id: corpDlxPlanId,
        commission_type: "fixed",
        commission_value: 500,
        active: true,
      },
    ];

    const result = resolveTravelAgentCommissionRule({
      plans: [basePlan],
      rules,
      arrivalDate: "2026-06-15",
      roomTypeId: deluxeRoomId,
      ratePlanId: corpDlxPlanId,
      roomSubtotal: 4500, // 3 nights @ 1500
    });

    assert.equal(result.matched, true);
    assert.equal(result.scope, "rate_plan");
    assert.equal(result.commissionType, "fixed");
    assert.equal(result.commissionValue, 500);
    // Flat ETB 500 once per stay:
    assert.equal(result.amount, 500);
  });

  it("Expired plan: yields no commission", () => {
    const expiredPlan: TravelAgentCommissionPlanCandidate = {
      ...basePlan,
      expires_on: "2026-05-01",
    };

    const result = resolveTravelAgentCommissionRule({
      plans: [expiredPlan],
      rules: [],
      arrivalDate: "2026-06-15",
      roomTypeId: standardRoomId,
      ratePlanId: barStdPlanId,
      roomSubtotal: 1000,
    });

    assert.equal(result.matched, false);
    assert.equal(result.scope, "none");
    assert.equal(result.amount, 0);
  });
});
