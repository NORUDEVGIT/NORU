import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BULK_RATE_CHANGE_IMPACT_COPY,
  BULK_RATE_CHANGE_OVER_MAX_COPY,
  BULK_RATE_CHANGE_STALE_COPY,
  BULK_RATE_CHANGE_SUCCESS_COPY,
  buildInventoryLookup,
  expandBulkTargets,
  expectedVersionsFromPreview,
  humanizeRateChangeValidation,
  inclusiveDayCount,
  isBulkStaleMessage,
  joinPreviewInventory,
  plansForSelectedRoomTypes,
  prunePlanIdsForRoomTypes,
  restrictionMarks,
  summarizeBulkPreview,
  uniqueIds,
  uniquePlanCurrencies,
} from "./bulk-rate-change.ts";
import { RATE_CHANGE_MAX_TARGETS, type RateChangePreviewItem } from "./rate-change.ts";
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

function previewItem(overrides: Partial<RateChangePreviewItem> = {}): RateChangePreviewItem {
  return {
    date: "2026-09-24",
    ratePlanId: BAR,
    ratePlanCode: "BAR",
    ratePlanName: "Best Available",
    roomTypeId: DELUXE,
    roomTypeName: "Deluxe",
    currency: "USD",
    baseRate: 100,
    currentOverrideRate: null,
    currentEffectiveRate: 100,
    proposedOverrideRate: 110,
    proposedEffectiveRate: 110,
    absoluteDelta: 10,
    percentageDelta: 10,
    minStay: 2,
    maxStay: null,
    closedToArrival: true,
    closedToDeparture: false,
    stopSell: false,
    validationStatus: "valid",
    validationMessages: [],
    expectedVersion: "2026-09-20T10:00:00Z",
    ...overrides,
  };
}

describe("RR-P2-04 — target expansion", () => {
  it("expands a single plan across dates", () => {
    const result = expandBulkTargets({ planIds: [BAR], fromDate: "2026-09-24", toDate: "2026-09-26" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.targetCount, 3);
    assert.deepEqual(result.targets.map((row) => row.date), ["2026-09-24", "2026-09-25", "2026-09-26"]);
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
    assert.deepEqual(visible.map((plan) => plan.id), [BAR, CORP]);
    const deluxeOnly = plansForSelectedRoomTypes(plans, [DELUXE]);
    assert.deepEqual(deluxeOnly.map((plan) => plan.id), [BAR]);
    const pruned = prunePlanIdsForRoomTypes([BAR, CORP], plans, [DELUXE]);
    assert.deepEqual(pruned, [BAR]);
  });

  it("removes duplicate plan ids before expansion", () => {
    const result = expandBulkTargets({
      planIds: [BAR, BAR],
      fromDate: "2026-09-24",
      toDate: "2026-09-24",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.targetCount, 1);
    assert.deepEqual(uniqueIds([BAR, BAR, ""]), [BAR]);
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
    assert.ok(result.targetCount > RATE_CHANGE_MAX_TARGETS);
    assert.deepEqual(result.dates, []);
    assert.equal(inclusiveDayCount("2026-01-01", "2026-01-01"), 1);
  });

  it("rejects empty or inverted selections", () => {
    assert.equal(expandBulkTargets({ planIds: [], fromDate: "2026-09-24", toDate: "2026-09-25" }).ok, false);
    assert.equal(expandBulkTargets({ planIds: [BAR], fromDate: "2026-09-26", toDate: "2026-09-24" }).ok, false);
    const empty = expandBulkTargets({ planIds: [], fromDate: "2026-09-24", toDate: "2026-09-25" });
    if (empty.ok) return;
    assert.equal(empty.code, "empty");
  });
});

describe("RR-P2-04 — review composition", () => {
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
    const rows = joinPreviewInventory([previewItem()], buildInventoryLookup(calendar));
    assert.equal(rows[0]?.occupancyPercent, 20);
    assert.equal(rows[0]?.roomsSold, 2);
    assert.equal(rows[0]?.roomsAvailable, 10);
  });

  it("summarizes before/after, restrictions and validation copy", () => {
    const items = [
      previewItem(),
      previewItem({
        date: "2026-09-25",
        ratePlanId: CORP,
        roomTypeId: STANDARD,
        validationStatus: "invalid",
        validationMessages: ["RATE_PLAN_INACTIVE"],
        absoluteDelta: null,
      }),
    ];
    const summary = summarizeBulkPreview(items);
    assert.equal(summary.affectedDates, 2);
    assert.equal(summary.affectedRatePlans, 2);
    assert.equal(summary.affectedRoomTypes, 2);
    assert.equal(summary.validTargets, 1);
    assert.equal(summary.invalidTargets, 1);
    assert.equal(summary.averageAbsoluteDelta, 10);
    assert.deepEqual(restrictionMarks(items[0]!), ["CTA", "Min 2"]);
    assert.equal(humanizeRateChangeValidation("RATE_PLAN_INACTIVE"), "This rate plan is inactive.");
    assert.equal(humanizeRateChangeValidation("RATE_PLAN_OUT_OF_RANGE"), "This date is outside the rate plan validity window.");
    assert.equal(humanizeRateChangeValidation("RATE_CHANGE_STALE"), BULK_RATE_CHANGE_STALE_COPY);
    assert.equal(uniquePlanCurrencies(plans).length, 2);
    assert.deepEqual(expectedVersionsFromPreview(items)[0]?.expectedVersion, "2026-09-20T10:00:00Z");
  });
});

describe("RR-P2-04 — wiring, apply and no fake product", () => {
  const view = readRel("../../components/rates/bulk-rate-change/bulk-rate-change-view.tsx");
  const panel = readRel("../../components/rates/bulk-rate-change/bulk-rate-change-panel.tsx");
  const scope = readRel("../../components/rates/bulk-rate-change/bulk-scope-step.tsx");
  const define = readRel("../../components/rates/bulk-rate-change/bulk-define-step.tsx");
  const progress = readRel("../../components/rates/bulk-rate-change/bulk-wizard-progress.tsx");
  const review = readRel("../../components/rates/impact-review/bulk-review-panel.tsx");
  const table = readRel("../../components/rates/impact-review/bulk-review-table.tsx");
  const confirm = readRel("../../components/rates/impact-review/bulk-confirm-apply.tsx");
  const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
  const ia = readRel("../rate-revenue-workspace.ts");
  const functions = readRel("./rate-change.functions.ts");

  it("wires all five official operations through previewRateChanges and applyRateChanges", () => {
    assert.match(define, /SET_RATE/);
    assert.match(define, /PERCENT_INCREASE/);
    assert.match(define, /PERCENT_DECREASE/);
    assert.match(define, /COPY_FROM_DATE/);
    assert.match(define, /RESET_OVERRIDE/);
    assert.match(define, /Reset to Base Rate/);
    assert.match(view, /previewRateChanges/);
    assert.match(view, /applyRateChanges/);
    assert.match(view, /source: "rate_revenue"/);
    assert.match(view, /expectedVersionsFromPreview/);
    assert.doesNotMatch(view, /saveRateOverride/);
    assert.match(functions, /export const previewRateChanges/);
    assert.match(functions, /export const applyRateChanges/);
  });

  it("reviews deterministic impact and joins inventory without a forecast block", () => {
    assert.match(review, /Rate change impact/);
    assert.match(review, /BULK_RATE_CHANGE_IMPACT_COPY/);
    assert.match(table, /Current/);
    assert.match(table, /Delta/);
    assert.match(table, /Restrictions/);
    assert.match(table, /Validation/);
    assert.match(table, /occupancyPercent/);
    assert.match(table, /roomsAvailable/);
    assert.match(view, /joinPreviewInventory/);
    assert.match(view, /buildInventoryLookup/);
    assert.equal(
      BULK_RATE_CHANGE_IMPACT_COPY.includes("Existing reservation pricing snapshots are not changed"),
      true,
    );
    assert.doesNotMatch(review, /Estimated Revenue/);
    assert.doesNotMatch(confirm, /Estimated Revenue/);
    assert.doesNotMatch(review, /Incremental Bookings/);
    assert.match(confirm, /Submit for Approval|SUBMIT_FOR_APPROVAL_LABEL/);
    assert.doesNotMatch(confirm, /Save as Draft/);
  });

  it("applies once, invalidates the official keys, and returns stale conflicts to review", () => {
    assert.match(view, /applyFn\(\{ data: requestPayload\(\) \}\)/);
    assert.match(view, /invalidateQueries\(\{ queryKey: \["revenue-rate-calendar"\] \}\)/);
    assert.match(view, /invalidateQueries\(\{ queryKey: \["revenue-control"\] \}\)/);
    assert.match(view, /invalidateQueries\(\{ queryKey: \["rate-change-history"\] \}\)/);
    assert.match(view, /invalidateQueries\(\{ queryKey: \["bulk-rate-preview"\] \}\)/);
    assert.match(view, /if \(isBulkStaleMessage\(err\.message\)\) setStep\(3\)/);
    assert.match(view, /BULK_RATE_CHANGE_STALE_COPY/);
    assert.equal(isBulkStaleMessage("RATE_CHANGE_STALE"), true);
    assert.equal(BULK_RATE_CHANGE_STALE_COPY.includes("Refresh and review the changes again"), true);
    assert.match(confirm, /Confirm & Apply/);
    assert.match(confirm, /Nothing will be applied until every target is valid/);
    assert.match(confirm, /BULK_RATE_CHANGE_SUCCESS_COPY/);
    assert.equal(BULK_RATE_CHANGE_SUCCESS_COPY, "Rate changes applied.");
  });

  it("does not present approval, forecast or draft workflow as live Phase 2 functionality", () => {
    const files = [view, panel, scope, define, progress, review, table, confirm];
    for (const source of files) {
      assert.doesNotMatch(source, /Save as Draft/);
      assert.doesNotMatch(source, /Estimated Revenue/);
      assert.doesNotMatch(source, /Incremental Bookings/);
      assert.doesNotMatch(source, /Forecast Impact/);
      assert.doesNotMatch(source, /approval queue/i);
    }
    assert.match(confirm, /canEdit/);
    assert.match(view, /canEditDailyRates/);
    assert.match(scope, /BULK_RATE_CHANGE_OVER_MAX_COPY/);
    assert.match(BULK_RATE_CHANGE_OVER_MAX_COPY, /366/);
    assert.match(workspace, /<BulkRateChangeView/);
    assert.match(workspace, /case "bulk-rate-change"/);
    assert.doesNotMatch(view, /rates-tabs/);
    assert.match(ia, /id: "bulk-rate-change"/);
    assert.match(ia, /implemented: true/);
    assert.match(ia, /review\/confirmation inside bulk-rate-change/);
  });

  it("does not add a migration, RPC, or change 0016 pricing", () => {
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0101_pms_rate_change_events.sql"));
    assert.ok(!migrations.some((name) => /p2-04|bulk.rate.change|impact.review/i.test(name)));
    const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    const helper = readRel("./bulk-rate-change.ts");
    assert.doesNotMatch(helper, /CREATE OR REPLACE FUNCTION/);
    assert.doesNotMatch(helper, /rpc\(/);
    assert.doesNotMatch(view, /rpc\(/);
  });
});
