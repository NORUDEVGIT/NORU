import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BULK_RESTRICTION_EXISTING_RESERVATION_COPY,
  BULK_RESTRICTION_IMPACT_COPY,
  BULK_RESTRICTION_OVER_MAX_COPY,
  BULK_RESTRICTION_STALE_COPY,
  BULK_RESTRICTION_SUCCESS_COPY,
  RESTRICTION_CHANGE_MAX_TARGETS,
  buildInventoryLookup,
  buildRestrictionOperation,
  emptyTriStatePatch,
  expandBulkTargets,
  expectedVersionsFromRestrictionPreview,
  fieldsFromTriState,
  formatRestrictionBeforeAfter,
  humanizeRestrictionValidation,
  inclusiveDayCount,
  isRestrictionBulkStaleMessage,
  joinRestrictionPreviewInventory,
  plansForSelectedRoomTypes,
  prunePlanIdsForRoomTypes,
  summarizeRestrictionPreview,
  uniqueIds,
  withOccupiedStopSell,
} from "./bulk-restriction-change.ts";
import type { RestrictionChangePreviewItem } from "./restriction-change.ts";
import type { RateCalendarWorkspace } from "./rate-calendar.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const BAR = "plan-bar";
const CORP = "plan-corp";
const DELUXE = "rt-deluxe";
const STANDARD = "rt-standard";

const plans = [
  { id: BAR, roomTypeId: DELUXE, currency: "USD" },
  { id: CORP, roomTypeId: STANDARD, currency: "EUR" },
];

function previewItem(overrides: Partial<RestrictionChangePreviewItem> = {}): RestrictionChangePreviewItem {
  return {
    date: "2026-09-24",
    ratePlanId: BAR,
    ratePlanCode: "BAR",
    ratePlanName: "Best Available",
    roomTypeId: DELUXE,
    roomTypeName: "Deluxe",
    before: {
      minStay: null,
      maxStay: null,
      closedToArrival: false,
      closedToDeparture: false,
      stopSell: false,
    },
    after: {
      minStay: 2,
      maxStay: null,
      closedToArrival: true,
      closedToDeparture: false,
      stopSell: false,
    },
    changedFields: ["minStay", "closedToArrival"],
    expectedVersion: "2026-09-20T10:00:00Z",
    validationStatus: "valid",
    validationMessages: [],
    noOp: false,
    ...overrides,
  };
}

describe("RR-P3-03 — target expansion", () => {
  it("expands a single plan across dates", () => {
    const result = expandBulkTargets({ planIds: [BAR], fromDate: "2026-09-24", toDate: "2026-09-26" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.targetCount, 3);
    assert.deepEqual(
      result.targets.map((row) => row.date),
      ["2026-09-24", "2026-09-25", "2026-09-26"],
    );
    assert.ok(result.targets.every((row) => row.ratePlanId === BAR));
  });

  it("expands multiple plans across dates without inventing combinations", () => {
    const result = expandBulkTargets({
      planIds: [BAR, CORP],
      fromDate: "2026-09-24",
      toDate: "2026-09-25",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.targetCount, 4);
    assert.deepEqual(
      result.targets.map((row) => `${row.ratePlanId}|${row.date}`),
      [`${BAR}|2026-09-24`, `${BAR}|2026-09-25`, `${CORP}|2026-09-24`, `${CORP}|2026-09-25`],
    );
  });

  it("supports multiple room types only through their real plans", () => {
    const visible = plansForSelectedRoomTypes(plans, [DELUXE, STANDARD]);
    assert.deepEqual(
      visible.map((plan) => plan.id),
      [BAR, CORP],
    );
    const deluxeOnly = plansForSelectedRoomTypes(plans, [DELUXE]);
    assert.deepEqual(
      deluxeOnly.map((plan) => plan.id),
      [BAR],
    );
    const pruned = prunePlanIdsForRoomTypes([BAR, CORP], plans, [DELUXE]);
    assert.deepEqual(pruned, [BAR]);
  });

  it("blocks selections over the 366 target cap without truncating", () => {
    const result = expandBulkTargets({
      planIds: [BAR, CORP],
      fromDate: "2026-01-01",
      toDate: "2026-07-04",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "over_max");
    assert.ok(result.targetCount > RESTRICTION_CHANGE_MAX_TARGETS);
    assert.deepEqual(result.dates, []);
    assert.equal(inclusiveDayCount("2026-01-01", "2026-01-01"), 1);
    assert.deepEqual(uniqueIds([BAR, BAR, ""]), [BAR]);
  });

  it("rejects empty or inverted selections", () => {
    assert.equal(expandBulkTargets({ planIds: [], fromDate: "2026-09-24", toDate: "2026-09-25" }).ok, false);
    assert.equal(expandBulkTargets({ planIds: [BAR], fromDate: "2026-09-26", toDate: "2026-09-24" }).ok, false);
    const empty = expandBulkTargets({ planIds: [], fromDate: "2026-09-24", toDate: "2026-09-25" });
    if (empty.ok) return;
    assert.equal(empty.code, "empty");
  });
});

describe("RR-P3-03 — SET_FIELDS and CLEAR_ALL", () => {
  it("SET_FIELDS patches omit unchanged fields", () => {
    const patch = emptyTriStatePatch();
    patch.minStay = { mode: "set", value: "2" };
    patch.stopSell = { mode: "on" };
    const built = fieldsFromTriState(patch);
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.deepEqual(Object.keys(built.fields).sort(), ["minStay", "stopSell"]);
    assert.equal(built.fields.minStay, 2);
    assert.equal(built.fields.stopSell, true);
    assert.equal(Object.prototype.hasOwnProperty.call(built.fields, "maxStay"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(built.fields, "closedToArrival"), false);
  });

  it("SET_FIELDS clear writes null / false and does not send unchanged booleans", () => {
    const patch = emptyTriStatePatch();
    patch.maxStay = { mode: "clear", value: "" };
    patch.closedToArrival = { mode: "off" };
    const built = fieldsFromTriState(patch);
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.fields.maxStay, null);
    assert.equal(built.fields.closedToArrival, false);
    assert.equal(Object.prototype.hasOwnProperty.call(built.fields, "stopSell"), false);
  });

  it("CLEAR_ALL is the official operation, not all-default SET_FIELDS", () => {
    const built = buildRestrictionOperation({ type: "CLEAR_ALL", patch: emptyTriStatePatch() });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.operation.type, "CLEAR_ALL");
    assert.equal("fields" in built.operation, false);
    const emptySet = buildRestrictionOperation({ type: "SET_FIELDS", patch: emptyTriStatePatch() });
    assert.equal(emptySet.ok, false);
  });
});

describe("RR-P3-03 — review composition", () => {
  it("joins occupancy from the calendar inventory model", () => {
    const calendar = {
      groups: [
        {
          roomType: { id: DELUXE, code: "DLX", name: "Deluxe" },
          rows: [
            {
              plan: {
                id: BAR,
                code: "BAR",
                name: "BAR",
                roomTypeId: DELUXE,
                currency: "USD",
                baseRate: 100,
                validFrom: null,
                validTo: null,
                active: true,
              },
              cells: [
                {
                  date: "2026-09-24",
                  roomTypeId: DELUXE,
                  ratePlanId: BAR,
                  inventory: {
                    roomsSold: 2,
                    roomsAvailable: 10,
                    remainingRooms: 8,
                    occupancyPercent: 20,
                    band: "available",
                  },
                },
              ],
            },
          ],
        },
      ],
    } as unknown as RateCalendarWorkspace;
    const rows = joinRestrictionPreviewInventory([previewItem()], buildInventoryLookup(calendar));
    assert.equal(rows[0]?.occupancyPercent, 20);
    assert.equal(rows[0]?.roomsSold, 2);
    assert.equal(rows[0]?.roomsAvailable, 10);
    const later = joinRestrictionPreviewInventory(
      [previewItem({ date: "2026-10-20" })],
      buildInventoryLookup(calendar),
    );
    assert.equal(later[0]?.occupancyPercent, null);
    assert.equal(later[0]?.roomsSold, null);
  });

  it("summarizes before/after, reservation explanation, and no revenue strings", () => {
    const items = [
      previewItem(),
      previewItem({
        date: "2026-09-25",
        ratePlanId: CORP,
        roomTypeId: STANDARD,
        validationStatus: "invalid",
        validationMessages: ["RESTRICTION_PLAN_NOT_FOUND"],
        changedFields: ["stopSell"],
        after: {
          minStay: null,
          maxStay: null,
          closedToArrival: false,
          closedToDeparture: false,
          stopSell: true,
        },
      }),
    ];
    const summary = summarizeRestrictionPreview(items);
    assert.equal(summary.affectedDates, 2);
    assert.equal(summary.affectedRatePlans, 2);
    assert.equal(summary.affectedRoomTypes, 2);
    assert.equal(summary.validTargets, 1);
    assert.equal(summary.invalidTargets, 1);
    assert.deepEqual(summary.changedFields, ["minStay", "closedToArrival", "stopSell"]);
    assert.match(formatRestrictionBeforeAfter(items[0]!), /Min stay: — → 2 nights/);
    assert.match(formatRestrictionBeforeAfter(items[0]!), /CTA: Open → Closed/);
    assert.equal(
      humanizeRestrictionValidation("RESTRICTION_PLAN_NOT_FOUND"),
      "That rate plan doesn't belong to this property.",
    );
    assert.equal(humanizeRestrictionValidation("RESTRICTION_CHANGE_STALE"), BULK_RESTRICTION_STALE_COPY);
    assert.deepEqual(expectedVersionsFromRestrictionPreview(items)[0]?.expectedVersion, "2026-09-20T10:00:00Z");
    assert.match(BULK_RESTRICTION_EXISTING_RESERVATION_COPY, /Existing reservations stay as booked/);
    assert.doesNotMatch(BULK_RESTRICTION_IMPACT_COPY, /Estimated Revenue|forecast|lost revenue/i);
    const occupied = withOccupiedStopSell(summary, [
      {
        ...items[1]!,
        occupancyPercent: 40,
        roomsSold: 3,
        roomsAvailable: 10,
      },
    ]);
    assert.equal(occupied.occupiedStopSellCount, 1);
  });
});

describe("RR-P3-03 — wiring, apply and no fake product", () => {
  const view = readRel("../../components/rates/bulk-restriction/bulk-restriction-view.tsx");
  const panel = readRel("../../components/rates/bulk-restriction/bulk-restriction-panel.tsx");
  const scope = readRel("../../components/rates/bulk-restriction/bulk-restriction-scope-step.tsx");
  const define = readRel("../../components/rates/bulk-restriction/bulk-restriction-define-step.tsx");
  const progress = readRel("../../components/rates/bulk-restriction/bulk-restriction-progress.tsx");
  const review = readRel("../../components/rates/restriction-impact/restriction-review-panel.tsx");
  const table = readRel("../../components/rates/restriction-impact/restriction-review-table.tsx");
  const confirm = readRel("../../components/rates/restriction-impact/restriction-confirm-apply.tsx");
  const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
  const ia = readRel("../rate-revenue-workspace.ts");
  const functions = readRel("./restriction-change.functions.ts");
  const helper = readRel("./bulk-restriction-change.ts");

  it("wires SET_FIELDS and CLEAR_ALL through previewRestrictionChanges and applyRestrictionChanges", () => {
    assert.match(define, /SET_FIELDS/);
    assert.match(define, /CLEAR_ALL/);
    assert.match(define, /Unchanged/);
    assert.match(view, /previewRestrictionChanges/);
    assert.match(view, /applyRestrictionChanges/);
    assert.match(view, /source: "rate_revenue"/);
    assert.match(view, /expectedVersionsFromRestrictionPreview/);
    assert.doesNotMatch(view, /saveRateRestriction/);
    assert.match(functions, /export const previewRestrictionChanges/);
    assert.match(functions, /export const applyRestrictionChanges/);
  });

  it("reviews deterministic impact and joins inventory without a forecast block", () => {
    assert.match(review, /Restriction impact/);
    assert.match(review, /BULK_RESTRICTION_IMPACT_COPY/);
    assert.match(review, /BULK_RESTRICTION_EXISTING_RESERVATION_COPY/);
    assert.match(table, /Changed Fields/);
    assert.match(table, /Before → After/);
    assert.match(table, /Validation/);
    assert.match(table, /occupancyPercent/);
    assert.match(table, /roomsSold/);
    assert.match(view, /joinRestrictionPreviewInventory/);
    assert.match(view, /buildInventoryLookup/);
    assert.equal(
      BULK_RESTRICTION_IMPACT_COPY.includes("Existing reservations are not cancelled, repriced, or amended"),
      true,
    );
    assert.doesNotMatch(review, /Estimated Revenue/);
    assert.doesNotMatch(confirm, /Estimated Revenue/);
    assert.doesNotMatch(review, /Incremental Bookings/);
    assert.doesNotMatch(confirm, /Submit for Approval/);
    assert.doesNotMatch(confirm, /Save as Draft/);
  });

  it("applies once, invalidates the official keys, and returns stale conflicts to review", () => {
    assert.match(view, /applyFn\(\{ data: requestPayload\(\) \}\)/);
    assert.match(view, /invalidateQueries\(\{ queryKey: \["revenue-rate-calendar"\] \}\)/);
    assert.match(view, /invalidateQueries\(\{ queryKey: \["revenue-control"\] \}\)/);
    assert.match(view, /invalidateQueries\(\{ queryKey: \["restriction-change-history"\] \}\)/);
    assert.match(view, /invalidateQueries\(\{ queryKey: \["rate-restrictions"\] \}\)/);
    assert.match(view, /if \(isRestrictionBulkStaleMessage\(err\.message\)\) setStep\(3\)/);
    assert.match(view, /BULK_RESTRICTION_STALE_COPY/);
    assert.equal(isRestrictionBulkStaleMessage("RESTRICTION_CHANGE_STALE"), true);
    assert.equal(BULK_RESTRICTION_STALE_COPY.includes("Refresh and review again"), true);
    assert.match(confirm, /Confirm & Apply/);
    assert.match(confirm, /Nothing will be applied until every target is valid/);
    assert.match(confirm, /BULK_RESTRICTION_SUCCESS_COPY/);
    assert.equal(BULK_RESTRICTION_SUCCESS_COPY, "Restrictions applied.");
    assert.match(confirm, /Return to Restrictions/);
    assert.match(confirm, /View Restriction History/);
  });

  it("does not present approval, forecast, OTA or publish as live Phase 3 functionality", () => {
    const files = [view, panel, scope, define, progress, review, table, confirm, helper];
    for (const source of files) {
      assert.doesNotMatch(source, /Submit for Approval/);
      assert.doesNotMatch(source, /Save as Draft/);
      assert.doesNotMatch(source, /Estimated Revenue/);
      assert.doesNotMatch(source, /Incremental Bookings/);
      assert.doesNotMatch(source, /Forecast Impact/);
      assert.doesNotMatch(source, /Sync OTA/);
      assert.doesNotMatch(source, /Publish Restrictions/);
      assert.doesNotMatch(source, /Apply Template/);
      assert.doesNotMatch(source, /listRevenueCommercialMasters/);
    }
    assert.match(confirm, /canApply/);
    assert.match(view, /canApplyRestrictions/);
    assert.match(scope, /BULK_RESTRICTION_OVER_MAX_COPY/);
    assert.match(BULK_RESTRICTION_OVER_MAX_COPY, /366/);
    assert.match(workspace, /<BulkRestrictionView/);
    assert.match(workspace, /case "apply-restriction"/);
    assert.doesNotMatch(view, /rates-tabs/);
    assert.match(ia, /id: "apply-restriction"/);
    assert.match(ia, /review\/confirmation inside apply-restriction/);
    const applyDef = ia.slice(ia.indexOf('id: "apply-restriction"'), ia.indexOf('id: "restriction-history"'));
    assert.match(applyDef, /implemented: true/);
  });

  it("does not add a migration, RPC, or change 0016 pricing", () => {
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0102_pms_rate_restriction_change_events.sql"));
    assert.ok(!migrations.some((name) => /p3-03|bulk.restriction|restriction.impact/i.test(name)));
    const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(helper, /CREATE OR REPLACE FUNCTION/);
    assert.doesNotMatch(helper, /rpc\(/);
    assert.doesNotMatch(view, /rpc\(/);
    assert.doesNotMatch(view, /template_id|commercial_restriction_id/);
    assert.match(helper, /Template prefill is deferred/);
  });
});
