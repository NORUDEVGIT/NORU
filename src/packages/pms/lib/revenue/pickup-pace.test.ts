import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { priorAsOfDate } from "./demand.ts";
import type { OtbSnapshotRow } from "./demand-snapshot.ts";
import {
  PICKUP_DEFAULT_WINDOW_DAYS,
  PICKUP_MISSING_PRIOR,
  PICKUP_NO_SNAPSHOTS,
  PICKUP_REQUIRES_TWO_SNAPSHOTS,
  buildPickupModel,
  formatPickupPoints,
  pickupCoverageCopy,
  pickupHistoryFromCopy,
  pickupWindowUnavailableCopy,
  type PickupBuildInput,
} from "./pickup-pace.ts";
import { implementedRevenueViews, revenueViewDefinition } from "../rate-revenue-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function snap(partial: Partial<OtbSnapshotRow> = {}): OtbSnapshotRow {
  return {
    restaurantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    asOfBusinessDate: "2026-09-25",
    stayDate: "2026-09-26",
    roomTypeId: "rt-1",
    roomsOnBooks: 4,
    roomsAvailable: 10,
    roomsRemaining: 6,
    bookedRoomRevenue: 400,
    currency: "USD",
    occupancyPercent: 40,
    adr: 100,
    revpar: 40,
    pricedRooms: 4,
    pricedShare: 100,
    ...partial,
  };
}

function baseInput(partial: Partial<PickupBuildInput> = {}): PickupBuildInput {
  return {
    currentAsOf: "2026-09-25",
    priorAsOfExists: true,
    windowDays: 7,
    fromDate: "2026-09-25",
    toDate: "2026-09-27",
    requestedFrom: "2026-09-25",
    requestedTo: "2026-09-27",
    rangeClamped: false,
    currentRows: [snap()],
    priorRows: [
      snap({
        asOfBusinessDate: "2026-09-18",
        roomsOnBooks: 2,
        roomsRemaining: 8,
        bookedRoomRevenue: 160,
        occupancyPercent: 20,
        adr: 80,
        pricedRooms: 2,
      }),
    ],
    roomTypes: [{ id: "rt-1", name: "Deluxe" }],
    snapshotHistoryStartsAt: "2026-09-18",
    ...partial,
  };
}

describe("RR-P4-03 — UI-13 Pickup & Pace", () => {
  it("mounts pickup-pace as implemented without a rate-plan context field", () => {
    const definition = revenueViewDefinition("pickup-pace");
    assert.equal(definition.implemented, true);
    assert.equal(definition.plannedCapability, undefined);
    assert.equal(definition.label, "Pickup & Pace");
    assert.equal(definition.requiredCapability, "canViewForecast");
    assert.deepEqual([...definition.contextFields], ["dateRange", "roomType"]);
    assert.ok(implementedRevenueViews().includes("pickup-pace"));
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /<PickupPaceView/);
    assert.match(workspace, /case "pickup-pace"/);
    assert.match(workspace, /requestedView !== "demand-forecast" && requestedView !== "pickup-pace"/);
  });

  it("calls getRevenuePickupPace only and omits live demand and commercial filters", () => {
    const view = readRel("../../components/rates/pickup-pace/pickup-pace-view.tsx");
    const functions = readRel("./pickup-pace.functions.ts");
    const schema = readRel("./pickup-pace.ts");
    assert.match(view, /getRevenuePickupPace/);
    assert.match(view, /"revenue-pickup-pace"/);
    assert.match(functions, /requireRateManager/);
    assert.doesNotMatch(view, /getRevenueDemandOverview|getRevenueControlWorkspace|captureRevenueOtbSnapshot/);
    assert.doesNotMatch(view, /Recent Booking Activity|getRevenueOtbSnapshotHistoryStart/);
    assert.doesNotMatch(schema, /ratePlanId|marketSegmentId|commercialSourceId|salesChannelId/);
    assert.doesNotMatch(functions, /ratePlanId|marketSegmentId/);
  });

  it("computes positive, negative and zero pickup without clamping", () => {
    const up = buildPickupModel(baseInput());
    assert.equal(up.historyAvailable, true);
    assert.equal(up.summary.roomsPickup, 2);
    assert.equal(up.summary.revenuePickup, 240);
    assert.equal(up.summary.occupancyPointChange, 20);
    assert.equal(up.summary.adrChange, 20);
    assert.equal(up.summary.currentRoomsOnBooks, 4);
    assert.equal(up.summary.priorRoomsOnBooks, 2);
    assert.equal(up.pairRows[0]?.roomsPickup, 2);
    assert.equal(up.pairRows[0]?.comparable, true);

    const down = buildPickupModel(
      baseInput({
        currentRows: [snap({ roomsOnBooks: 1, roomsRemaining: 9, bookedRoomRevenue: 80, pricedRooms: 1 })],
        priorRows: [snap({ asOfBusinessDate: "2026-09-18", roomsOnBooks: 3, roomsRemaining: 7, bookedRoomRevenue: 300, pricedRooms: 3 })],
      }),
    );
    assert.equal(down.summary.roomsPickup, -2);
    assert.equal(down.summary.revenuePickup, -220);
    assert.ok((down.summary.roomsPickup ?? 0) < 0);

    const zero = buildPickupModel(
      baseInput({
        currentRows: [snap()],
        priorRows: [snap({ asOfBusinessDate: "2026-09-18" })],
      }),
    );
    assert.equal(zero.summary.roomsPickup, 0);
    assert.equal(zero.summary.revenuePickup, 0);
  });

  it("labels occupancy change in percentage points", () => {
    assert.equal(formatPickupPoints(4.2), "+4.2 pts");
    assert.equal(formatPickupPoints(-1.5), "-1.5 pts");
    assert.equal(formatPickupPoints(0), "0 pts");
    const kpis = readRel("../../components/rates/pickup-pace/pickup-kpis.tsx");
    assert.match(kpis, /formatPickupPoints/);
    assert.match(kpis, /Percentage points/);
    assert.doesNotMatch(kpis, /\+4\.2%/);
  });

  it("does not treat missing snapshots as zero", () => {
    const none = buildPickupModel(baseInput({ currentAsOf: null, snapshotHistoryStartsAt: null, currentRows: [], priorRows: [], priorAsOfExists: false }));
    assert.equal(none.historyAvailable, false);
    assert.equal(none.historyReason, "no_snapshots");
    assert.equal(none.summary.roomsPickup, null);
    assert.equal(PICKUP_NO_SNAPSHOTS.includes("No OTB snapshots"), true);

    const one = buildPickupModel(baseInput({ snapshotHistoryStartsAt: "2026-09-25", priorAsOfExists: false, priorRows: [] }));
    assert.equal(one.historyAvailable, false);
    assert.equal(one.historyReason, "single_snapshot");
    assert.equal(one.summary.roomsPickup, null);
    assert.equal(one.summary.comparableRows, 0);
    assert.equal(PICKUP_REQUIRES_TWO_SNAPSHOTS, "Pickup requires at least two OTB snapshots.");

    const missing = buildPickupModel(
      baseInput({ snapshotHistoryStartsAt: "2026-09-20", priorAsOfExists: false, priorRows: [] }),
    );
    assert.equal(missing.historyAvailable, false);
    assert.equal(missing.historyReason, "missing_prior_as_of");
    assert.equal(missing.priorAsOf, "2026-09-18");
    assert.equal(missing.summary.roomsPickup, null);
    assert.match(PICKUP_MISSING_PRIOR, /No snapshot exists for the selected comparison date/);
    assert.match(pickupWindowUnavailableCopy(7), /7-day pickup is not available yet/);
  });

  it("excludes partial stay-date or room-type rows from summary totals", () => {
    const model = buildPickupModel(
      baseInput({
        roomTypes: [
          { id: "rt-1", name: "Deluxe" },
          { id: "rt-2", name: "Standard" },
        ],
        currentRows: [
          snap({ roomTypeId: "rt-1", roomsOnBooks: 4, bookedRoomRevenue: 400, pricedRooms: 4 }),
          snap({ roomTypeId: "rt-2", roomsOnBooks: 8, bookedRoomRevenue: 800, pricedRooms: 8, roomsRemaining: 2 }),
        ],
        priorRows: [snap({ asOfBusinessDate: "2026-09-18", roomTypeId: "rt-1", roomsOnBooks: 2, bookedRoomRevenue: 160, pricedRooms: 2 })],
      }),
    );
    assert.equal(model.summary.comparableRows, 1);
    assert.equal(model.summary.excludedRows, 1);
    assert.equal(model.summary.coverageTotal, 2);
    assert.equal(model.summary.roomsPickup, 2);
    assert.equal(model.summary.revenuePickup, 240);
    assert.notEqual(model.summary.roomsPickup, 10);
    const deluxe = model.roomTypes.find((row) => row.roomTypeId === "rt-1");
    const standard = model.roomTypes.find((row) => row.roomTypeId === "rt-2");
    assert.equal(deluxe?.comparable, true);
    assert.equal(deluxe?.roomsPickup, 2);
    assert.equal(standard?.comparable, false);
    assert.equal(standard?.roomsPickup, null);
    assert.equal(pickupCoverageCopy(1, 2), "Pickup is based on 1 of 2 comparable stay-date/room-type snapshot rows.");
    assert.equal(pickupCoverageCopy(2, 2), null);
  });

  it("uses exact prior as-of dates for 1D 3D 7D 14D", () => {
    assert.equal(PICKUP_DEFAULT_WINDOW_DAYS, 7);
    assert.equal(priorAsOfDate("2026-09-25", 1), "2026-09-24");
    assert.equal(priorAsOfDate("2026-09-25", 3), "2026-09-22");
    assert.equal(priorAsOfDate("2026-09-25", 7), "2026-09-18");
    assert.equal(priorAsOfDate("2026-09-25", 14), "2026-09-11");
    for (const windowDays of [1, 3, 7, 14] as const) {
      const model = buildPickupModel(baseInput({ windowDays, priorAsOfExists: false, priorRows: [] }));
      assert.equal(model.priorAsOf, priorAsOfDate("2026-09-25", windowDays));
    }
    const selector = readRel("../../components/rates/pickup-pace/pickup-window-selector.tsx");
    assert.match(selector, /DEMAND_PICKUP_WINDOWS/);
    assert.match(selector, /\{days\}D/);
  });

  it("keeps snapshot-as-of terminology and omits forecast or YoY strings", () => {
    const status = readRel("../../components/rates/pickup-pace/pickup-history-status.tsx");
    const view = readRel("../../components/rates/pickup-pace/pickup-pace-view.tsx");
    const kpis = readRel("../../components/rates/pickup-pace/pickup-kpis.tsx");
    const compare = readRel("../../components/rates/pickup-pace/pickup-otb-compare-chart.tsx");
    const ui = [status, view, kpis, compare].join("\n");
    assert.match(status, /Current Snapshot:/);
    assert.match(status, /Compared With:/);
    assert.match(status, /pickupHistoryFromCopy/);
    assert.doesNotMatch(ui, /Forecast Pickup|Projected Pickup|Expected Pickup|Pickup Confidence/);
    assert.doesNotMatch(ui, /YoY Pace|Same Time Last Year|Same Lead Time|Last Year/);
    assert.doesNotMatch(ui, /Recent Booking Activity|High Demand|Low Demand/);
    assert.match(compare, /This is not a forecast/);
    assert.equal(pickupHistoryFromCopy("2026-09-18"), "Pickup history available from 2026-09-18.");
  });

  it("shows the real earliest snapshot date and does not invent pre-0103 history", () => {
    const model = buildPickupModel(baseInput({ snapshotHistoryStartsAt: "2026-09-18" }));
    assert.equal(model.snapshotHistoryStartsAt, "2026-09-18");
    const status = readRel("../../components/rates/pickup-pace/pickup-history-status.tsx");
    assert.match(status, /snapshotHistoryStartsAt/);
    assert.doesNotMatch(status, /2020-01-01|backfill/);
  });

  it("adds no migration, RPC, Night Audit change, or price_hotel_stay edit", () => {
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(!migrations.some((name) => /pickup.pace|ui-13|forecast.engine/i.test(name)));
    assert.ok(migrations.includes("0103_pms_revenue_otb_snapshots.sql"));
    const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    const domain = readRel("./pickup-pace.ts");
    const server = readRel("./pickup-pace.server.ts");
    const functions = readRel("./pickup-pace.functions.ts");
    const night = readRel("../nightaudit.functions.ts");
    assert.doesNotMatch(domain, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(server, /captureRevenueOtbSnapshot|captureOtbSnapshotAfterClose/);
    assert.doesNotMatch(functions, /captureRevenueOtbSnapshot/);
    assert.match(night, /captureOtbAfterClose/);
    assert.match(server, /listRevenueOtbSnapshots/);
    assert.match(server, /loadLatestOtbSnapshotAsOf/);
    assert.doesNotMatch(readRel("./demand-snapshot.server.ts"), /\.update\(/);
  });
});
