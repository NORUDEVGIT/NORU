import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ABSENT_RESTRICTION_VERSION,
  RESTRICTION_CHANGE_MAX_TARGETS,
  RESTRICTION_HISTORY_DEFAULT_PAGE_SIZE,
  applyRestrictionFields,
  buildRestrictionChangePreview,
  decideAtomicRestrictionApply,
  emptyRestrictionState,
  groupRestrictionHistoryByOperation,
  isEmptyRestriction,
  isRestrictionChangeSource,
  normalizeReason,
  proposedRestrictionState,
  restrictionActionType,
  restrictionChangeRequestSchema,
  restrictionChangedFields,
  restrictionHistoryPageBounds,
  restrictionVersionToken,
  targetKey,
  validateRestrictionChangeRequest,
  type RestrictionHistoryRow,
  type RestrictionPlanSnapshot,
  type RestrictionRowSnapshot,
  type RestrictionState,
} from "./restriction-change.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PLAN = "22222222-2222-4222-8222-222222222222";
const ROOM_TYPE = "33333333-3333-4333-8333-333333333333";
const RESTAURANT = "44444444-4444-4444-8444-444444444444";

function plan(overrides: Partial<RestrictionPlanSnapshot> = {}): RestrictionPlanSnapshot {
  return {
    id: PLAN_ID,
    code: "BAR",
    name: "BAR",
    roomTypeId: ROOM_TYPE,
    roomTypeName: "Standard",
    active: true,
    ...overrides,
  };
}

function row(overrides: Partial<RestrictionRowSnapshot> = {}): RestrictionRowSnapshot {
  return {
    minStay: 2,
    maxStay: 7,
    closedToArrival: false,
    closedToDeparture: false,
    stopSell: false,
    updatedAt: "2026-09-24T10:00:00.000Z",
    ...overrides,
  };
}

function preview(
  targets: { ratePlanId: string; date: string }[],
  extra: Partial<Parameters<typeof buildRestrictionChangePreview>[0]> = {},
) {
  return buildRestrictionChangePreview({
    restaurantId: RESTAURANT,
    targets,
    operation: extra.operation ?? { type: "SET_FIELDS", fields: { minStay: 2 } },
    plans: extra.plans ?? new Map([[PLAN_ID, plan()]]),
    current: extra.current ?? new Map(),
    reason: extra.reason,
    source: extra.source,
    expectedVersions: extra.expectedVersions,
  });
}

function historyRow(partial: Partial<RestrictionHistoryRow> = {}): RestrictionHistoryRow {
  return {
    id: "e1",
    restaurantId: RESTAURANT,
    operationId: "op1",
    actionType: "single_restriction_change",
    ratePlanId: PLAN_ID,
    ratePlanCode: "BAR",
    ratePlanName: "BAR",
    roomTypeId: ROOM_TYPE,
    roomTypeName: "Standard",
    stayDate: "2026-09-24",
    previous: emptyRestrictionState(),
    next: { ...emptyRestrictionState(), minStay: 2 },
    reason: null,
    actorMembershipId: "mem-1",
    actorName: null,
    source: "rate_revenue",
    createdAt: "2026-09-24T10:00:00.000Z",
    ...partial,
  };
}

describe("RR-P3-01 — SET_FIELDS state patching", () => {
  it("empty row + min stay produces a min-stay-only restriction", () => {
    const after = applyRestrictionFields(emptyRestrictionState(), { minStay: 3 });
    assert.deepEqual(after, { ...emptyRestrictionState(), minStay: 3 });
    assert.equal(isEmptyRestriction(after), false);
  });

  it("existing row can change CTA only", () => {
    const current: RestrictionState = row();
    const after = applyRestrictionFields(current, { closedToArrival: true });
    assert.equal(after.minStay, 2);
    assert.equal(after.maxStay, 7);
    assert.equal(after.closedToArrival, true);
    assert.deepEqual(restrictionChangedFields(current, after), ["closedToArrival"]);
  });

  it("existing row can change min and max together", () => {
    const after = applyRestrictionFields(row(), { minStay: 3, maxStay: 5 });
    assert.equal(after.minStay, 3);
    assert.equal(after.maxStay, 5);
    assert.equal(after.closedToArrival, false);
  });

  it("null clears nullable min/max", () => {
    const after = applyRestrictionFields(row(), { minStay: null, maxStay: null });
    assert.equal(after.minStay, null);
    assert.equal(after.maxStay, null);
    assert.equal(after.stopSell, false);
  });

  it("explicit false clears boolean flags", () => {
    const current = row({ closedToArrival: true, stopSell: true });
    const after = applyRestrictionFields(current, { closedToArrival: false, stopSell: false });
    assert.equal(after.closedToArrival, false);
    assert.equal(after.stopSell, false);
  });

  it("omitted fields stay unchanged", () => {
    const current = row({ closedToDeparture: true, stopSell: true });
    const after = applyRestrictionFields(current, { minStay: 4 });
    assert.equal(after.minStay, 4);
    assert.equal(after.maxStay, 7);
    assert.equal(after.closedToDeparture, true);
    assert.equal(after.stopSell, true);
  });

  it("all-default after patch is treated as a delete", () => {
    const after = applyRestrictionFields(row({ minStay: 2, maxStay: null }), {
      minStay: null,
      closedToArrival: false,
    });
    assert.equal(isEmptyRestriction(after), true);
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      operation: { type: "SET_FIELDS", fields: { minStay: null, maxStay: null } },
      current: new Map([[targetKey(PLAN_ID, "2026-09-24"), row({ minStay: 2, maxStay: null })]]),
    });
    assert.equal(result.items[0]?.noOp, false);
    assert.equal(isEmptyRestriction(result.items[0]!.after), true);
  });
});

describe("RR-P3-01 — CLEAR_ALL", () => {
  it("existing row becomes the empty default state", () => {
    const after = proposedRestrictionState(row(), { type: "CLEAR_ALL" });
    assert.deepEqual(after, emptyRestrictionState());
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      operation: { type: "CLEAR_ALL" },
      current: new Map([[targetKey(PLAN_ID, "2026-09-24"), row()]]),
    });
    assert.equal(result.items[0]?.noOp, false);
    assert.deepEqual(result.items[0]?.changedFields, ["minStay", "maxStay"]);
  });

  it("missing row is a valid no-op and does not invent a change", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      operation: { type: "CLEAR_ALL" },
    });
    assert.equal(result.valid, true);
    assert.equal(result.items[0]?.noOp, true);
    assert.deepEqual(result.items[0]?.changedFields, []);
    assert.equal(result.items[0]?.expectedVersion, ABSENT_RESTRICTION_VERSION);
  });
});

describe("RR-P3-01 — validation", () => {
  it("rejects a plan that does not belong to the property", () => {
    const result = preview([{ ratePlanId: OTHER_PLAN, date: "2026-09-24" }]);
    assert.equal(result.valid, false);
    assert.ok(result.items[0]?.validationMessages.includes("RESTRICTION_PLAN_NOT_FOUND"));
  });

  it("rejects an invalid date", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-02-31" }]);
    assert.equal(result.valid, false);
    assert.ok(result.items[0]?.validationMessages.includes("RESTRICTION_INVALID_DATE"));
  });

  it("rejects a duplicate target", () => {
    const result = preview([
      { ratePlanId: PLAN_ID, date: "2026-09-24" },
      { ratePlanId: PLAN_ID, date: "2026-09-24" },
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.items[0]?.validationMessages.includes("RESTRICTION_DUPLICATE_TARGET"));
  });

  it("rejects min stay below 1", () => {
    assert.equal(
      validateRestrictionChangeRequest({
        restaurantId: RESTAURANT,
        targets: [{ ratePlanId: PLAN_ID, date: "2026-09-24" }],
        operation: { type: "SET_FIELDS", fields: { minStay: 0 } },
      }),
      "RESTRICTION_MIN_STAY_INVALID",
    );
  });

  it("rejects max stay below 1", () => {
    assert.equal(
      validateRestrictionChangeRequest({
        restaurantId: RESTAURANT,
        targets: [{ ratePlanId: PLAN_ID, date: "2026-09-24" }],
        operation: { type: "SET_FIELDS", fields: { maxStay: 0 } },
      }),
      "RESTRICTION_MAX_STAY_INVALID",
    );
  });

  it("rejects max shorter than min after the patch", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      operation: { type: "SET_FIELDS", fields: { minStay: 5, maxStay: 2 } },
    });
    assert.equal(result.valid, false);
    assert.ok(result.items[0]?.validationMessages.includes("RESTRICTION_STAY_RANGE_INVALID"));
  });

  it("rejects more than 366 targets", () => {
    const targets = Array.from({ length: RESTRICTION_CHANGE_MAX_TARGETS + 1 }, (_, index) => ({
      ratePlanId: PLAN_ID,
      date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
    }));
    assert.equal(
      validateRestrictionChangeRequest({
        restaurantId: RESTAURANT,
        targets,
        operation: { type: "SET_FIELDS", fields: { stopSell: true } },
      }),
      "RESTRICTION_TARGET_LIMIT",
    );
  });

  it("rejects SET_FIELDS with no fields", () => {
    assert.equal(
      validateRestrictionChangeRequest({
        restaurantId: RESTAURANT,
        targets: [{ ratePlanId: PLAN_ID, date: "2026-09-24" }],
        operation: { type: "SET_FIELDS", fields: {} },
      }),
      "RESTRICTION_NO_FIELDS",
    );
  });

  it("rejects an unsupported source", () => {
    assert.equal(isRestrictionChangeSource("channel_manager"), false);
    assert.equal(
      validateRestrictionChangeRequest({
        restaurantId: RESTAURANT,
        targets: [{ ratePlanId: PLAN_ID, date: "2026-09-24" }],
        operation: { type: "CLEAR_ALL" },
        source: "channel_manager" as never,
      }),
      "RESTRICTION_CHANGE_UNSUPPORTED",
    );
    assert.throws(() =>
      restrictionChangeRequestSchema.parse({
        restaurantId: RESTAURANT,
        targets: [{ ratePlanId: PLAN_ID, date: "2026-09-24" }],
        operation: { type: "CLEAR_ALL" },
        source: "channel_manager",
      }),
    );
  });

  it("does not silently block a past date or inactive plan", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2020-01-02" }], {
      plans: new Map([[PLAN_ID, plan({ active: false })]]),
    });
    assert.equal(result.valid, true);
  });
});

describe("RR-P3-01 — concurrency", () => {
  it("returns the existing-row updated_at token", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      current: new Map([[targetKey(PLAN_ID, "2026-09-24"), row()]]),
    });
    assert.equal(result.items[0]?.expectedVersion, "2026-09-24T10:00:00.000Z");
    assert.equal(restrictionVersionToken(null), ABSENT_RESTRICTION_VERSION);
  });

  it("returns the absent token when no row exists", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }]);
    assert.equal(result.items[0]?.expectedVersion, ABSENT_RESTRICTION_VERSION);
  });

  it("fails the whole apply when an existing row is stale", () => {
    const result = preview(
      [
        { ratePlanId: PLAN_ID, date: "2026-09-24" },
        { ratePlanId: PLAN_ID, date: "2026-09-25" },
      ],
      {
        current: new Map([[targetKey(PLAN_ID, "2026-09-24"), row()]]),
        expectedVersions: new Map([
          [targetKey(PLAN_ID, "2026-09-24"), "2026-09-24T09:00:00.000Z"],
        ]),
      },
    );
    assert.ok(result.items[0]?.validationMessages.includes("RESTRICTION_CHANGE_STALE"));
    const decision = decideAtomicRestrictionApply(result);
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.deepEqual(decision.items, []);
  });

  it("fails when a row appears after preview expected absent", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      current: new Map([[targetKey(PLAN_ID, "2026-09-24"), row()]]),
      expectedVersions: new Map([[targetKey(PLAN_ID, "2026-09-24"), ABSENT_RESTRICTION_VERSION]]),
    });
    assert.ok(result.items[0]?.validationMessages.includes("RESTRICTION_CHANGE_STALE"));
    assert.equal(decideAtomicRestrictionApply(result).ok, false);
  });

  it("fails when a row disappears after preview", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      expectedVersions: new Map([[targetKey(PLAN_ID, "2026-09-24"), "2026-09-24T10:00:00.000Z"]]),
    });
    assert.ok(result.items[0]?.validationMessages.includes("RESTRICTION_CHANGE_STALE"));
    assert.equal(decideAtomicRestrictionApply(result).ok, false);
  });
});

describe("RR-P3-01 — atomicity", () => {
  it("applies multiple valid targets as one bulk action", () => {
    const result = preview(
      [
        { ratePlanId: PLAN_ID, date: "2026-09-24" },
        { ratePlanId: PLAN_ID, date: "2026-09-25" },
      ],
      { operation: { type: "SET_FIELDS", fields: { stopSell: true } } },
    );
    const decision = decideAtomicRestrictionApply(result);
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.items.length, 2);
      assert.equal(decision.actionType, "bulk_restriction_change");
    }
    assert.equal(restrictionActionType({ type: "SET_FIELDS", fields: { stopSell: true } }, 1), "single_restriction_change");
    assert.equal(restrictionActionType({ type: "CLEAR_ALL" }, 4), "clear_restriction");
  });

  it("applies nothing when one target is invalid", () => {
    const result = preview([
      { ratePlanId: PLAN_ID, date: "2026-09-24" },
      { ratePlanId: OTHER_PLAN, date: "2026-09-25" },
    ]);
    const decision = decideAtomicRestrictionApply(result);
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.deepEqual(decision.items, []);
      assert.equal(decision.error, "RESTRICTION_PLAN_NOT_FOUND");
    }
  });

  it("applies nothing when one target is stale", () => {
    const result = preview(
      [
        { ratePlanId: PLAN_ID, date: "2026-09-24" },
        { ratePlanId: PLAN_ID, date: "2026-09-25" },
      ],
      {
        current: new Map([[targetKey(PLAN_ID, "2026-09-24"), row()]]),
        expectedVersions: new Map([
          [targetKey(PLAN_ID, "2026-09-24"), "stale-token"],
        ]),
      },
    );
    const decision = decideAtomicRestrictionApply(result);
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.deepEqual(decision.items, []);
  });
});

describe("RR-P3-01 — history model", () => {
  it("groups a single apply as one operation and one event", () => {
    const grouped = groupRestrictionHistoryByOperation([historyRow({})]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]?.events.length, 1);
    assert.equal(grouped[0]?.operationId, "op1");
  });

  it("groups a bulk apply as one operation_id with many events", () => {
    const grouped = groupRestrictionHistoryByOperation([
      historyRow({ id: "e1", stayDate: "2026-09-24", actionType: "bulk_restriction_change" }),
      historyRow({
        id: "e2",
        stayDate: "2026-09-25",
        actionType: "bulk_restriction_change",
        next: { ...emptyRestrictionState(), stopSell: true },
      }),
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]?.events.length, 2);
  });

  it("stores a full before/after snapshot, not one event per field", () => {
    const row = historyRow({
      previous: { minStay: 2, maxStay: 7, closedToArrival: false, closedToDeparture: false, stopSell: false },
      next: { minStay: 3, maxStay: 5, closedToArrival: true, closedToDeparture: false, stopSell: true },
    });
    assert.equal(restrictionChangedFields(row.previous, row.next).length, 4);
    assert.equal(row.previous.minStay, 2);
    assert.equal(row.next.stopSell, true);
  });

  it("records clear as empty after-state", () => {
    const row = historyRow({
      actionType: "clear_restriction",
      previous: { minStay: 2, maxStay: null, closedToArrival: true, closedToDeparture: false, stopSell: false },
      next: emptyRestrictionState(),
    });
    assert.equal(row.actionType, "clear_restriction");
    assert.equal(isEmptyRestriction(row.next), true);
  });

  it("keeps actor, reason, and source on the history row", () => {
    const row = historyRow({
      actorMembershipId: "mem-9",
      reason: "group block",
      source: "restriction_calendar",
    });
    assert.equal(row.actorMembershipId, "mem-9");
    assert.equal(row.reason, "group block");
    assert.equal(row.source, "restriction_calendar");
  });

  it("treats a blank reason as null", () => {
    assert.equal(normalizeReason("  "), null);
    assert.equal(normalizeReason("comp set"), "comp set");
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], { reason: "  " });
    assert.equal(result.reason, null);
  });

  it("does not invent a history-worthy change for a no-op", () => {
    const result = preview([{ ratePlanId: PLAN_ID, date: "2026-09-24" }], {
      operation: { type: "SET_FIELDS", fields: { minStay: 2 } },
      current: new Map([[targetKey(PLAN_ID, "2026-09-24"), row({ minStay: 2, maxStay: null })]]),
    });
    assert.equal(result.items[0]?.noOp, true);
    assert.deepEqual(result.items[0]?.changedFields, []);
  });

  it("paginates history with a default of 25 and a max of 100", () => {
    const defaults = restrictionHistoryPageBounds({});
    assert.equal(defaults.page, 1);
    assert.equal(defaults.pageSize, RESTRICTION_HISTORY_DEFAULT_PAGE_SIZE);
    assert.equal(restrictionHistoryPageBounds({ page: 2, pageSize: 200 }).pageSize, 100);
  });
});

describe("RR-P3-01 — SQL contracts, pricing, and ownership", () => {
  const supabase = readRel("../../../../../supabase/migrations/0102_pms_rate_restriction_change_events.sql");
  const drizzle = readRel("../../../../../drizzle/migrations/0102_pms_rate_restriction_change_events.sql");
  const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
  const card3 = readRel("../../../../../drizzle/migrations/0076_pms_card3_revenue_commercial_rules.sql");
  const domain = readRel("./restriction-change.ts");
  const server = readRel("./restriction-change.server.ts");
  const functions = readRel("./restriction-change.functions.ts");
  const saveRestriction = readRel("../rates.functions.ts");
  const workspace = readRel("../rate-revenue-workspace.ts");

  it("keeps dual-lane 0102 SQL identical", () => {
    assert.equal(drizzle, supabase);
  });

  it("creates an immutable history table and atomic apply RPC", () => {
    assert.match(supabase, /CREATE TABLE public\.hotel_rate_restriction_change_events/);
    assert.match(supabase, /operation_id uuid NOT NULL/);
    assert.match(supabase, /single_restriction_change/);
    assert.match(supabase, /bulk_restriction_change/);
    assert.match(supabase, /clear_restriction/);
    assert.match(supabase, /GRANT SELECT ON public\.hotel_rate_restriction_change_events TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT INSERT ON public\.hotel_rate_restriction_change_events TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT UPDATE ON public\.hotel_rate_restriction_change_events TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT DELETE ON public\.hotel_rate_restriction_change_events TO authenticated/);
    assert.match(supabase, /RESTRICTION_CHANGE_EVENT_IMMUTABLE/);
    assert.match(supabase, /BEFORE UPDATE OR DELETE ON public\.hotel_rate_restriction_change_events/);
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.apply_hotel_rate_restrictions/);
    assert.match(supabase, /SECURITY DEFINER/);
    assert.match(supabase, /RESTRICTION_CHANGE_STALE/);
    assert.match(supabase, /expectedVersion/);
    assert.match(supabase, /SET_FIELDS/);
    assert.match(supabase, /CLEAR_ALL/);
    assert.match(supabase, /DELETE FROM public\.hotel_rate_restrictions/);
    assert.match(supabase, /Pass 1: validate/);
    assert.match(supabase, /Pass 2: apply every restriction write/);
    assert.match(supabase, /Pass 3: immutable history rows/);
    assert.match(supabase, /IF \(item->>'skip'\)::boolean THEN/);
    assert.match(supabase, /Past dates and Night Audit-closed dates are not blocked/);
    assert.match(supabase, /Active \/ valid_from \/ valid_to are not enforced/);
    assert.match(supabase, /reason is nullable/);
    assert.doesNotMatch(supabase, /approval/);
    assert.doesNotMatch(supabase, /forecast/);
    assert.doesNotMatch(supabase, /template_id|commercial_restriction_id/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
  });

  it("does not change 0016 pricing or snapshot contracts", () => {
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.create_hotel_reservation_priced/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.amend_hotel_reservation_priced/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.reprice_hotel_reservation/);
    assert.match(pricing, /SELECT \* INTO restriction FROM public\.hotel_rate_restrictions\s+WHERE rate_plan_id = plan\.id AND restriction_date = _arrival;/);
    assert.match(pricing, /IF restriction\.closed_to_arrival THEN/);
    assert.match(pricing, /nights < restriction\.min_stay/);
    assert.match(pricing, /nights > restriction\.max_stay/);
    assert.match(pricing, /restriction_date = _departure/);
    assert.match(pricing, /closed_to_departure/);
    assert.match(pricing, /WHILE night < _departure LOOP/);
    assert.match(pricing, /restriction\.stop_sell/);
    assert.match(pricing, /nightly_rate_snapshot/);
    assert.match(pricing, /room_subtotal/);
    assert.match(pricing, /priced_at/);
    assert.match(pricing, /updated_at timestamptz NOT NULL DEFAULT now\(\)/);
  });

  it("keeps Property Setup catalogue ownership on pms_commercial_restrictions", () => {
    assert.match(card3, /CREATE TABLE IF NOT EXISTS public\.pms_commercial_restrictions/);
    assert.match(card3, /Does not replace hotel_rate_restrictions or price_hotel_stay/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.pms_commercial_restrictions/);
    assert.doesNotMatch(domain, /template_id|commercial_restriction_id/);
    assert.doesNotMatch(server, /pms_commercial_restrictions/);
  });

  it("wires one official apply RPC and keeps Restriction Calendar compatibility", () => {
    assert.match(functions, /export const previewRestrictionChanges/);
    assert.match(functions, /export const applyRestrictionChanges/);
    assert.match(functions, /export const listRestrictionChangeHistory/);
    assert.match(functions, /export const getRestrictionOperationDetail/);
    assert.match(functions, /requireRateManager/);
    assert.match(server, /rpc\("apply_hotel_rate_restrictions"/);
    assert.doesNotMatch(server, /for \(.*\) \{\s*await saveRateRestriction/);
    assert.doesNotMatch(server, /\.update\(/);
    assert.doesNotMatch(server, /\.delete\(/);
    assert.match(server, /Preview never mutates/);
    assert.match(server, /restriction_change_applied/);
    assert.match(saveRestriction, /from\("hotel_rate_restrictions"\)/);
    assert.match(saveRestriction, /Compatibility Restriction Calendar writer/);
    assert.match(saveRestriction, /applyRestrictionChanges/);
    assert.match(domain, /Past dates \/ Night Audit-closed dates — not blocked/);
    assert.match(domain, /saveRateRestriction does/);
    assert.match(domain, /not enforce these/);
  });

  it("does not add approvals, distribution sync, or a history workspace", () => {
    assert.doesNotMatch(domain, /lost revenue|expected booking loss|forecast/i);
    assert.doesNotMatch(server, /approval_status|submit for approval|draft status/i);
    assert.doesNotMatch(functions, /approveRestrictionChange|rejectRestrictionChange/);
    assert.match(workspace, /id: "restriction-history"/);
    const historyDef = workspace.slice(
      workspace.indexOf('id: "restriction-history"'),
      workspace.indexOf('id: "demand-forecast"'),
    );
    assert.match(historyDef, /implemented: false/);
  });
});
