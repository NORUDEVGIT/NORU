import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { computeBookedRevenueOverview } from "./revenue-metrics.ts";
import {
  COMMERCIAL_FILTER_NOTE,
  HISTORY_EMPTY_COPY,
  REVENUE_CONTROL_MAX_RANGE_DAYS,
  buildRevenueControlModel,
  clampRevenueControlRange,
  controlRowSignal,
  defaultControlCenterRange,
  resolveFocusRatePlan,
  type ControlPlan,
  type ControlReservation,
  type RevenueControlBuildInput,
} from "./revenue-control.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const DELUXE = "rt-deluxe";
const STANDARD = "rt-standard";
const BAR = "rp-bar";
const CORP = "rp-corp";

const plans: ControlPlan[] = [
  {
    id: BAR,
    code: "BAR",
    name: "BAR",
    roomTypeId: DELUXE,
    baseRate: 100,
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    active: true,
  },
  {
    id: CORP,
    code: "CORP",
    name: "Corporate",
    roomTypeId: STANDARD,
    baseRate: 80,
    validFrom: "2026-01-01",
    validTo: "2026-10-01",
    active: true,
  },
];

function reservation(
  partial: Partial<ControlReservation> & Pick<ControlReservation, "roomTypeId" | "arrivalDate" | "departureDate">,
): ControlReservation {
  return {
    ratePlanId: BAR,
    nightly: [],
    ...partial,
  };
}

function baseInput(overrides: Partial<RevenueControlBuildInput> = {}): RevenueControlBuildInput {
  return {
    fromDate: "2026-09-01",
    toDate: "2026-09-02",
    requestedFrom: "2026-09-01",
    requestedTo: "2026-09-02",
    rangeClamped: false,
    roomTypeId: null,
    ratePlanId: null,
    asOfDate: "2026-09-02",
    currency: "EUR",
    rooms: [
      { id: "room-1", roomTypeId: DELUXE },
      { id: "room-2", roomTypeId: DELUXE },
      { id: "room-3", roomTypeId: STANDARD },
    ],
    roomTypes: [
      { id: DELUXE, name: "Deluxe" },
      { id: STANDARD, name: "Standard" },
    ],
    reservations: [
      reservation({
        roomTypeId: DELUXE,
        ratePlanId: BAR,
        arrivalDate: "2026-09-01",
        departureDate: "2026-09-03",
        nightly: [
          { date: "2026-09-01", rate: 120 },
          { date: "2026-09-02", rate: 120 },
        ],
      }),
    ],
    plans,
    overrides: [],
    restrictions: [],
    history: [],
    ...overrides,
  };
}

describe("RR-P2-02 — Revenue Control read model", () => {
  it("reuses computeBookedRevenueOverview for summary metrics", () => {
    const model = buildRevenueControlModel(baseInput());
    const expected = computeBookedRevenueOverview({
      soldRoomNights: 2,
      availableRoomNights: 6,
      bookedRoomRevenue: 240,
      pricedNights: 2,
    });
    assert.equal(model.summary.occupancyPercent, expected.occupancyPercent);
    assert.equal(model.summary.adr, expected.adr);
    assert.equal(model.summary.revPar, expected.revPar);
    assert.equal(model.summary.roomRevenue, expected.roomRevenue);
    assert.equal(model.currency, "EUR");
  });

  it("aggregates nightly occupancy from overlapping stays", () => {
    const model = buildRevenueControlModel(baseInput());
    assert.equal(model.nightly.length, 2);
    assert.equal(model.nightly[0]?.soldRoomNights, 1);
    assert.equal(model.nightly[0]?.availableRoomNights, 3);
    assert.equal(model.nightly[0]?.occupancyPercent, 33.33);
    assert.equal(model.nightly[0]?.bookedRoomRevenue, 120);
  });

  it("uses matching room-type inventory for room-type occupancy", () => {
    const model = buildRevenueControlModel(baseInput({ roomTypeId: DELUXE }));
    assert.equal(model.summary.availableRoomNights, 4);
    assert.equal(model.summary.occupancySoldRoomNights, 2);
    assert.equal(model.appliedFilters.occupancyScope, "room-type");
    const deluxe = model.roomTypes.find((row) => row.roomTypeId === DELUXE);
    assert.equal(deluxe?.availableRoomNights, 4);
    assert.ok(!model.roomTypes.some((row) => row.roomTypeId === STANDARD));
  });

  it("does not change occupancy denominator when a rate plan is selected", () => {
    const unfiltered = buildRevenueControlModel(baseInput());
    const filtered = buildRevenueControlModel(baseInput({ ratePlanId: BAR }));
    assert.equal(filtered.summary.availableRoomNights, unfiltered.summary.availableRoomNights);
    assert.equal(filtered.summary.occupancyPercent, unfiltered.summary.occupancyPercent);
    assert.equal(filtered.summary.revPar, unfiltered.summary.revPar);
    assert.equal(filtered.appliedFilters.revenueScope, "rate-plan");
    assert.equal(filtered.summary.soldRoomNights, 2);
    assert.equal(filtered.summary.roomRevenue, 240);
  });

  it("ignores segment, source and channel for occupancy and inventory", () => {
    const model = buildRevenueControlModel(
      baseInput({
        marketSegmentId: "seg-1",
        commercialSourceId: "src-1",
        salesChannelId: "ch-1",
      }),
    );
    assert.equal(model.appliedFilters.commercialFiltersIgnored, true);
    assert.equal(model.commercialFilterNote, COMMERCIAL_FILTER_NOTE);
    assert.equal(model.summary.availableRoomNights, 6);
  });

  it("derives restriction attention and objective signals", () => {
    const model = buildRevenueControlModel(
      baseInput({
        ratePlanId: BAR,
        restrictions: [
          {
            ratePlanId: BAR,
            date: "2026-09-01",
            minStay: 2,
            maxStay: null,
            closedToArrival: true,
            closedToDeparture: false,
            stopSell: true,
          },
        ],
        overrides: [{ ratePlanId: BAR, date: "2026-09-01", nightlyRate: 150 }],
      }),
    );
    assert.equal(model.restrictionAttention.length, 1);
    assert.match(model.restrictionAttention[0]?.label ?? "", /Stop sell/);
    assert.equal(model.controlRows[0]?.signal, "Restriction Active");
    assert.equal(model.controlRows[0]?.overrideActive, true);
    assert.equal(model.controlRows[0]?.effectiveRate, 150);
    assert.ok(model.alerts.some((alert) => alert.id === "stop-sell"));
    assert.equal(controlRowSignal({
      occupancyPercent: 95,
      availableRoomNights: 10,
      remainingRoomNights: 1,
      restrictionActive: false,
      overrideActive: false,
    }), "Low Remaining Inventory");
    assert.equal(controlRowSignal({
      occupancyPercent: 95,
      availableRoomNights: 10,
      remainingRoomNights: 5,
      restrictionActive: false,
      overrideActive: false,
    }), "High Occupancy");
  });

  it("maps history and uses the honest empty copy", () => {
    const empty = buildRevenueControlModel(baseInput({ history: [] }));
    assert.equal(empty.recentActivity.available, true);
    assert.equal(empty.recentActivity.empty, true);
    assert.equal(HISTORY_EMPTY_COPY.includes("rate-change history was enabled"), true);

    const unavailable = buildRevenueControlModel(baseInput({ history: null }));
    assert.equal(unavailable.recentActivity.available, false);
    assert.equal(unavailable.recentActivity.empty, true);
  });

  it("resolves BAR as the focused plan and clamps long ranges", () => {
    const plan = resolveFocusRatePlan(plans, DELUXE, null);
    assert.equal(plan?.code, "BAR");
    const range = defaultControlCenterRange("2026-09-24");
    assert.equal(range.toDate, "2026-09-24");
    assert.equal(range.fromDate, "2026-08-26");
    const clamped = clampRevenueControlRange("2026-01-01", "2026-12-31");
    assert.equal(clamped.rangeClamped, true);
    assert.equal(clamped.fromDate, "2026-01-01");
    assert.ok(clamped.toDate < "2026-12-31");
    assert.equal(REVENUE_CONTROL_MAX_RANGE_DAYS, 62);
  });
});

describe("RR-P2-02 — wiring and no fake future data", () => {
  const view = readRel("../../components/rates/revenue-control/revenue-control-view.tsx");
  const kpis = readRel("../../components/rates/revenue-control/revenue-control-kpis.tsx");
  const attention = readRel("../../components/rates/revenue-control/revenue-attention.tsx");
  const trend = readRel("../../components/rates/revenue-control/revenue-control-trend.tsx");
  const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
  const domain = readRel("./revenue-control.ts");
  const server = readRel("./revenue-control.server.ts");
  const functions = readRel("./revenue-control.functions.ts");

  it("mounts Revenue Control on control-center and keeps Reports on RevenueOverviewTab", () => {
    assert.match(workspace, /RevenueControlView/);
    assert.match(workspace, /defaultControlCenterRange/);
    assert.doesNotMatch(workspace, /<RevenueOverviewTab /);
    const reports = readRel("../../components/workspaces/pms-reports-workspace.tsx");
    assert.match(reports, /RevenueOverviewTab/);
    assert.match(functions, /requireRateManager/);
    assert.match(functions, /getRevenueControlWorkspace/);
    assert.match(functions, /supabaseAdmin/);
    assert.match(server, /Promise\.all/);
    assert.match(server, /loadRevenueProperty/);
    assert.match(kpis, /Booked Room Revenue/);
  });

  it("does not present competitor, approval, forecast or rate-shopping as live data", () => {
    const files = [view, kpis, attention, trend, domain, server];
    for (const source of files) {
      assert.doesNotMatch(source, /competitor rate/i);
      assert.doesNotMatch(source, /approval queue/i);
      assert.doesNotMatch(source, /Forecast 87%/);
      assert.doesNotMatch(source, /rate-shopping|rate shopping/i);
      assert.doesNotMatch(source, /High Demand|Low Demand/);
    }
    assert.match(trend, /No forecast line/);
    assert.match(view, /Open Rate Calendar/);
    assert.doesNotMatch(view, /Review Forecast|Rate Shopping|Approvals/);
  });

  it("does not add a migration or change 0016 pricing", () => {
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0101_pms_rate_change_events.sql"));
    assert.ok(!migrations.some((name) => /forecast|approval|competitor|p2-02|revenue.control/i.test(name)));
    const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(server, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
  });
});
