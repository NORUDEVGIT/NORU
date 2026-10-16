import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ABSENT_CALENDAR_VERSION,
  RATE_CHANGE_HISTORY_PAGE_SIZE,
  buildRateChangePreview,
  calendarVersionToken,
  decideAtomicRateChangeApply,
  effectiveNightlyRate,
  findDuplicateTargets,
  groupHistoryByOperation,
  historyDeltasForRow,
  isIsoDate,
  normalizeReason,
  paginateRateChangeHistory,
  proposedRateFromRule,
  resolveRateChangeActionType,
  roundNightlyRate,
  targetKey,
  type RateChangeHistoryRow,
  type RateChangePlanSnapshot,
} from "./rate-change.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PLAN = "22222222-2222-4222-8222-222222222222";
const ROOM_TYPE = "33333333-3333-4333-8333-333333333333";
const RESTAURANT = "44444444-4444-4444-8444-444444444444";
const FOREIGN = "55555555-5555-4555-8555-555555555555";

function plan(overrides: Partial<RateChangePlanSnapshot> = {}): RateChangePlanSnapshot {
  return {
    id: PLAN_ID,
    restaurantId: RESTAURANT,
    code: "BAR",
    name: "BAR",
    roomTypeId: ROOM_TYPE,
    roomTypeName: "Standard",
    currency: "EUR",
    baseRate: 100,
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    active: true,
    ...overrides,
  };
}

function preview(input: Parameters<typeof buildRateChangePreview>[0]["targets"][number][] | Parameters<typeof buildRateChangePreview>[0], extra?: Partial<Parameters<typeof buildRateChangePreview>[0]>) {
  if (Array.isArray(input)) {
    return buildRateChangePreview({
      restaurantId: RESTAURANT,
      targets: input,
      rule: { type: "SET_RATE", value: 150 },
      plans: new Map([[PLAN_ID, plan()]]),
      overrides: new Map(),
      restrictions: new Map(),
      ...extra,
    });
  }
  return buildRateChangePreview(input);
}

function historyRow(partial: Partial<RateChangeHistoryRow>): RateChangeHistoryRow {
  return {
    id: "e1",
    operationId: "op1",
    actionType: "single_rate_change",
    ratePlanId: PLAN_ID,
    ratePlanCode: "BAR",
    ratePlanName: "BAR",
    roomTypeId: ROOM_TYPE,
    roomTypeName: "Standard",
    stayDate: "2026-09-24",
    previousBaseRate: 100,
    previousOverrideRate: null,
    previousEffectiveRate: 100,
    newOverrideRate: 150,
    newEffectiveRate: 150,
    absoluteDelta: 50,
    percentageDelta: 50,
    currency: "EUR",
    reason: null,
    actorMembershipId: "mem-1",
    actorName: null,
    source: "rate_revenue",
    createdAt: "2026-09-24T10:00:00.000Z",
    metadata: {},
    ...partial,
  };
}

describe("RR-P2-01 — rate change calculation", () => {
  it("SET_RATE writes the given nightly rate", () => {
    const none = proposedRateFromRule({ type: "SET_RATE", value: 175 }, 100, null, null);
    assert.deepEqual(none, { ok: true, proposedOverrideRate: 175, proposedEffectiveRate: 175 });
    const withOverride = proposedRateFromRule({ type: "SET_RATE", value: 90 }, 100, 120, null);
    assert.deepEqual(withOverride, { ok: true, proposedOverrideRate: 90, proposedEffectiveRate: 90 });
  });

  it("percentage changes use current effective rate, not always base", () => {
    const fromBase = proposedRateFromRule({ type: "PERCENT_INCREASE", value: 10 }, 100, null, null);
    assert.deepEqual(fromBase, { ok: true, proposedOverrideRate: 110, proposedEffectiveRate: 110 });
    const fromOverride = proposedRateFromRule({ type: "PERCENT_INCREASE", value: 10 }, 100, 120, null);
    assert.deepEqual(fromOverride, { ok: true, proposedOverrideRate: 132, proposedEffectiveRate: 132 });
    const down = proposedRateFromRule({ type: "PERCENT_DECREASE", value: 10 }, 100, 120, null);
    assert.deepEqual(down, { ok: true, proposedOverrideRate: 108, proposedEffectiveRate: 108 });
  });

  it("rounds the final nightly rate to 2 decimals", () => {
    assert.equal(roundNightlyRate(109.989), 109.99);
    assert.equal(roundNightlyRate(10.005), 10.01);
    const result = proposedRateFromRule({ type: "PERCENT_INCREASE", value: 15 }, 99.99, null, null);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.proposedEffectiveRate, 114.99);
  });

  it("RESET_OVERRIDE returns to base and does not write a fake override", () => {
    const reset = proposedRateFromRule({ type: "RESET_OVERRIDE" }, 100, 120, null);
    assert.deepEqual(reset, { ok: true, proposedOverrideRate: null, proposedEffectiveRate: 100 });
    assert.equal(effectiveNightlyRate(100, null), 100);
    assert.equal(effectiveNightlyRate(100, 120), 120);
  });

  it("COPY_FROM_DATE uses the source date effective rate", () => {
    const fromBase = proposedRateFromRule({ type: "COPY_FROM_DATE", sourceDate: "2026-09-01" }, 100, 80, 100);
    assert.deepEqual(fromBase, { ok: true, proposedOverrideRate: 100, proposedEffectiveRate: 100 });
    const fromOverride = proposedRateFromRule({ type: "COPY_FROM_DATE", sourceDate: "2026-09-01" }, 100, 80, 140);
    assert.deepEqual(fromOverride, { ok: true, proposedOverrideRate: 140, proposedEffectiveRate: 140 });
  });
});

describe("RR-P2-01 — rate change validation", () => {
  it("rejects a plan that does not belong to the property", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      plans: new Map([[PLAN_ID, plan({ restaurantId: FOREIGN })]]),
    });
    assert.equal(result.valid, false);
    assert.deepEqual(result.items[0]?.validationMessages, ["RATE_PLAN_NOT_FOUND"]);
  });

  it("rejects an inactive rate plan", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      plans: new Map([[PLAN_ID, plan({ active: false })]]),
    });
    assert.equal(result.valid, false);
    assert.ok(result.items[0]?.validationMessages.includes("RATE_PLAN_INACTIVE"));
  });

  it("rejects a target outside plan validity", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2025-12-31" }]);
    assert.equal(result.valid, false);
    assert.ok(result.items[0]?.validationMessages.includes("RATE_PLAN_OUT_OF_RANGE"));
  });

  it("rejects a negative SET_RATE", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      rule: { type: "SET_RATE", value: -1 },
    });
    assert.equal(result.valid, false);
    assert.ok(result.items[0]?.validationMessages.includes("RATE_CHANGE_NEGATIVE"));
  });

  it("rejects duplicate rate-plan/date targets", () => {
    const targets = [
      { ratePlanId: PLAN_ID, date: "2026-09-24" },
      { ratePlanId: PLAN_ID, date: "2026-09-24" },
    ];
    assert.equal(findDuplicateTargets(targets).length, 1);
    const result = preview(targets);
    assert.equal(result.valid, false);
    assert.ok(result.items.every((item) => item.validationMessages.includes("RATE_CHANGE_DUPLICATE")));
  });

  it("rejects an invalid calendar date", () => {
    assert.equal(isIsoDate("2026-02-31"), false);
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-02-31" }]);
    assert.equal(result.valid, false);
    assert.ok(result.items[0]?.validationMessages.includes("RATE_CHANGE_INVALID_DATE"));
  });

  it("rejects an invalid COPY_FROM_DATE source", () => {
    const missing = proposedRateFromRule({ type: "COPY_FROM_DATE", sourceDate: "2026-09-01" }, 100, null, null);
    assert.deepEqual(missing, { ok: false, code: "RATE_CHANGE_SOURCE_INVALID" });
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      rule: { type: "COPY_FROM_DATE", sourceDate: "2025-01-01" },
    });
    assert.equal(result.valid, false);
    assert.ok(result.items[0]?.validationMessages.includes("RATE_CHANGE_SOURCE_INVALID"));
  });

  it("rejects an unsupported rule type", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      rule: { type: "ABSOLUTE_INCREASE", value: 10 } as never,
    });
    assert.equal(result.valid, false);
    assert.ok(result.items[0]?.validationMessages.includes("RATE_CHANGE_UNSUPPORTED"));
  });

  it("does not silently block a past date inside plan validity", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-01-02" }], {
      plans: new Map([[PLAN_ID, plan({ validFrom: null, validTo: null })]]),
    });
    assert.equal(result.valid, true);
  });

  it("treats a blank reason as null", () => {
    assert.equal(normalizeReason("  "), null);
    assert.equal(normalizeReason("promo"), "promo");
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], { reason: "  " });
    assert.equal(result.reason, null);
  });

  it("returns restriction context as warnings, not hard errors", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      restrictions: new Map([
        [
          targetKey(PLAN_ID, "2026-09-24"),
          { minStay: 2, maxStay: 5, closedToArrival: true, closedToDeparture: true, stopSell: true },
        ],
      ]),
    });
    assert.equal(result.valid, true);
    assert.ok(result.items[0]?.stopSell);
    assert.ok(result.items[0]?.validationMessages.some((message) => message.includes("Stop sell")));
  });
});

describe("RR-P2-01 — atomic apply decision", () => {
  it("applies every valid target and groups bulk as one action type", () => {
    const result = preview(
      [
        { ratePlanId: PLAN_ID, date: "2026-09-24" },
        { ratePlanId: PLAN_ID, date: "2026-09-25" },
      ],
      { rule: { type: "PERCENT_INCREASE", value: 10 } },
    );
    const decision = decideAtomicRateChangeApply(result);
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.items.length, 2);
      assert.equal(decision.actionType, "bulk_rate_change");
    }
    assert.equal(resolveRateChangeActionType({ type: "SET_RATE", value: 1 }, 1), "single_rate_change");
    assert.equal(resolveRateChangeActionType({ type: "RESET_OVERRIDE" }, 4), "reset_override");
    assert.equal(resolveRateChangeActionType({ type: "COPY_FROM_DATE", sourceDate: "2026-09-01" }, 4), "copy_rate");
  });

  it("applies nothing when one target is invalid", () => {
    const result = preview([
      { ratePlanId: PLAN_ID, date: "2026-09-24" },
      { ratePlanId: OTHER_PLAN, date: "2026-09-25" },
    ]);
    const decision = decideAtomicRateChangeApply(result);
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.items.length, 0);
      assert.equal(decision.error, "RATE_PLAN_NOT_FOUND");
    }
  });

  it("applies nothing when one target is stale", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      overrides: new Map([[targetKey(PLAN_ID, "2026-09-24"), { nightlyRate: 120, updatedAt: "2026-09-24T10:01:00.000Z" }]]),
      expectedVersions: new Map([[targetKey(PLAN_ID, "2026-09-24"), "2026-09-24T10:00:00.000Z"]]),
    });
    assert.ok(result.items[0]?.validationMessages.includes("RATE_CHANGE_STALE"));
    const decision = decideAtomicRateChangeApply(result);
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.items.length, 0);
  });

  it("records history rows only when the atomic decision commits", () => {
    const valid = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }]);
    assert.equal(decideAtomicRateChangeApply(valid).ok, true);
    const invalid = preview([{ ratePlanId: PLAN_ID, date: "2026-02-31" }]);
    const refused = decideAtomicRateChangeApply(invalid);
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.deepEqual(refused.items, []);
  });
});

describe("RR-P2-01 — history model", () => {
  it("groups a single change as one operation and one event", () => {
    const grouped = groupHistoryByOperation([historyRow({})]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]?.events.length, 1);
    assert.deepEqual(grouped[0]?.affectedDates, ["2026-09-24"]);
  });

  it("groups a bulk change as one operation_id with many event rows", () => {
    const grouped = groupHistoryByOperation([
      historyRow({ id: "e1", stayDate: "2026-09-24", actionType: "bulk_rate_change" }),
      historyRow({ id: "e2", stayDate: "2026-09-25", actionType: "bulk_rate_change", newEffectiveRate: 160 }),
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]?.events.length, 2);
    assert.deepEqual(grouped[0]?.affectedDates, ["2026-09-24", "2026-09-25"]);
  });

  it("records reset before/after as override null and effective = base", () => {
    const row = historyRow({
      actionType: "reset_override",
      previousOverrideRate: 120,
      previousEffectiveRate: 120,
      newOverrideRate: null,
      newEffectiveRate: 100,
    });
    const deltas = historyDeltasForRow(row);
    assert.equal(row.newOverrideRate, null);
    assert.equal(row.newEffectiveRate, 100);
    assert.equal(deltas.absoluteDelta, -20);
  });

  it("keeps actor, reason, and source on the history row", () => {
    const row = historyRow({
      actorMembershipId: "mem-9",
      reason: "comp set",
      source: "rate_revenue",
    });
    assert.equal(row.actorMembershipId, "mem-9");
    assert.equal(row.reason, "comp set");
    assert.equal(row.source, "rate_revenue");
  });

  it("paginates history with the repository offset default of 25", () => {
    const rows = Array.from({ length: 30 }, (_, index) => historyRow({ id: `e${index}` }));
    const page = paginateRateChangeHistory(rows, 2, RATE_CHANGE_HISTORY_PAGE_SIZE);
    assert.equal(page.page, 2);
    assert.equal(page.pageSize, 25);
    assert.equal(page.total, 30);
    assert.equal(page.rows.length, 5);
  });

  it("uses absent as the concurrency token when no override exists", () => {
    assert.equal(calendarVersionToken(null), ABSENT_CALENDAR_VERSION);
    assert.equal(calendarVersionToken("2026-09-24T10:00:00.000Z"), "2026-09-24T10:00:00.000Z");
  });
});

describe("RR-P2-01 — SQL contracts and wiring", () => {
  const supabase = readRel("../../../../../supabase/migrations/0101_pms_rate_change_events.sql");
  const drizzle = readRel("../../../../../drizzle/migrations/0101_pms_rate_change_events.sql");
  const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
  const domain = readRel("./rate-change.ts");
  const server = readRel("./rate-change.server.ts");
  const functions = readRel("./rate-change.functions.ts");
  const saveOverride = readRel("../rates.functions.ts");

  it("keeps dual-lane 0101 SQL identical", () => {
    assert.equal(drizzle, supabase);
  });

  it("creates an immutable hotel_rate_change_events table and atomic apply RPC", () => {
    assert.match(supabase, /CREATE TABLE public\.hotel_rate_change_events/);
    assert.match(supabase, /operation_id uuid NOT NULL/);
    assert.match(supabase, /single_rate_change/);
    assert.match(supabase, /bulk_rate_change/);
    assert.match(supabase, /reset_override/);
    assert.match(supabase, /copy_rate/);
    assert.match(supabase, /GRANT SELECT ON public\.hotel_rate_change_events TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT INSERT ON public\.hotel_rate_change_events TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT UPDATE ON public\.hotel_rate_change_events TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT DELETE ON public\.hotel_rate_change_events TO authenticated/);
    assert.match(supabase, /RATE_CHANGE_EVENT_IMMUTABLE/);
    assert.match(supabase, /BEFORE UPDATE OR DELETE ON public\.hotel_rate_change_events/);
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.apply_hotel_rate_changes/);
    assert.match(supabase, /SECURITY DEFINER/);
    assert.match(supabase, /RATE_CHANGE_STALE/);
    assert.match(supabase, /expectedVersion/);
    assert.match(supabase, /ROUND\(current_effective \* \(1 \+ \(rule_value \/ 100\)\), 2\)/);
    assert.match(supabase, /DELETE FROM public\.hotel_rate_calendar/);
    assert.match(supabase, /Pass 1: validate/);
    assert.match(supabase, /Pass 2: apply every calendar write/);
    assert.match(supabase, /Pass 3: immutable history rows/);
    assert.match(supabase, /Past dates and Night Audit-closed dates are not blocked/);
    assert.match(supabase, /reason is nullable/);
    assert.doesNotMatch(supabase, /approval/);
    assert.doesNotMatch(supabase, /forecast/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
  });

  it("does not change 0016 pricing or snapshot contracts", () => {
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.create_hotel_reservation_priced/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.amend_hotel_reservation_priced/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.reprice_hotel_reservation/);
    assert.match(pricing, /SELECT c\.nightly_rate INTO rate FROM public\.hotel_rate_calendar c/);
    assert.match(pricing, /IF rate IS NULL THEN\s+rate := plan\.base_rate;/);
    assert.match(pricing, /closed_to_arrival/);
    assert.match(pricing, /closed_to_departure/);
    assert.match(pricing, /stop_sell/);
    assert.match(pricing, /nightly_rate_snapshot/);
    assert.match(pricing, /room_subtotal/);
    assert.match(pricing, /priced_at/);
  });

  it("wires one official apply RPC and keeps Calendar compatibility", () => {
    assert.match(functions, /export const previewRateChanges/);
    assert.match(functions, /export const applyRateChanges/);
    assert.match(functions, /export const listRateChangeHistory/);
    assert.match(functions, /export const getRateChangeOperationDetail/);
    assert.match(functions, /requireRateManager/);
    assert.match(server, /rpc\("apply_hotel_rate_changes"/);
    assert.doesNotMatch(server, /for \(.*\) \{\s*await saveRateOverride/);
    assert.doesNotMatch(server, /\.update\(/);
    assert.doesNotMatch(server, /\.delete\(/);
    assert.match(server, /Preview never mutates/);
    assert.match(saveOverride, /from\("hotel_rate_calendar"\)/);
    assert.match(saveOverride, /Compatibility Rate Calendar writer/);
    assert.match(saveOverride, /applyRateChanges/);
    assert.match(domain, /reason-required policy remains a UI\/product decision/);
    assert.match(domain, /Past-date \/ Night Audit-closed date edits are not blocked/);
  });

  it("does not implement UI-01–UI-06, approvals, or forecast logic", () => {
    assert.doesNotMatch(domain, /expected revenue|incremental bookings|pickup forecast/i);
    assert.doesNotMatch(server, /approval_status|submit for approval|draft status/i);
    assert.doesNotMatch(functions, /approveRateChange|rejectRateChange/);
    const workspace = readRel("../rate-revenue-workspace.ts");
    assert.match(workspace, /id: "bulk-rate-change"/);
    assert.match(workspace, /implemented: false/);
    assert.match(workspace, /id: "rate-history"/);
  });
});
