import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEMAND_AVAILABILITY_BASIS,
  DEMAND_DEFAULT_RANGE_DAYS,
  DEMAND_FORECAST_AVAILABLE,
  DEMAND_MAX_RANGE_DAYS,
  DEMAND_OTB_STATUSES,
  DEMAND_PENDING_INCLUDED,
  DEMAND_PICKUP_WINDOWS,
  DEMAND_RECENT_BOOKING_DAYS,
  DEMAND_SNAPSHOT_HORIZON_DAYS,
  buildDemandModel,
  clampDemandRange,
  computePickup,
  daysToArrival,
  defaultDemandRange,
  isRecentBooking,
  leadTimeDays,
  priorAsOfDate,
  propertyDateFromInstant,
  snapshotStayRange,
  type DemandBuildInput,
  type DemandReservation,
} from "./demand.ts";
import { workspaceToSnapshotRows } from "./demand-snapshot.ts";
import { computeBookedRevenueOverview } from "./revenue-metrics.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function reservation(partial: Partial<DemandReservation> = {}): DemandReservation {
  return {
    roomTypeId: "rt-1",
    ratePlanId: "rp-1",
    arrivalDate: "2026-09-26",
    departureDate: "2026-09-28",
    nightly: [
      { date: "2026-09-26", rate: 100 },
      { date: "2026-09-27", rate: 120 },
    ],
    createdAt: "2026-09-20T12:00:00.000Z",
    ...partial,
  };
}

function baseInput(partial: Partial<DemandBuildInput> = {}): DemandBuildInput {
  return {
    asOfBusinessDate: "2026-09-25",
    fromDate: "2026-09-25",
    toDate: "2026-09-27",
    requestedFrom: "2026-09-25",
    requestedTo: "2026-09-27",
    rangeClamped: false,
    timezone: "UTC",
    currency: "USD",
    roomTypeId: null,
    ratePlanId: null,
    rooms: [
      { id: "room-1", roomTypeId: "rt-1" },
      { id: "room-2", roomTypeId: "rt-1" },
      { id: "room-3", roomTypeId: "rt-2" },
    ],
    roomTypes: [
      { id: "rt-1", name: "Deluxe" },
      { id: "rt-2", name: "Standard" },
    ],
    reservations: [reservation()],
    plans: [
      { id: "rp-1", roomTypeId: "rt-1" },
      { id: "rp-2", roomTypeId: "rt-2" },
    ],
    overrides: [{ ratePlanId: "rp-1", date: "2026-09-26" }],
    restrictions: [{ ratePlanId: "rp-1", date: "2026-09-26" }],
    snapshotHistoryStartsAt: null,
    ...partial,
  };
}

describe("RR-P4-01 — live OTB", () => {
  it("counts a future confirmed stay on each occupied night and groups by room type", () => {
    const model = buildDemandModel(baseInput());
    const deluxe26 = model.dates.find((row) => row.date === "2026-09-26")?.roomTypes.find((cell) => cell.roomTypeId === "rt-1");
    const deluxe27 = model.dates.find((row) => row.date === "2026-09-27")?.roomTypes.find((cell) => cell.roomTypeId === "rt-1");
    const deluxe25 = model.dates.find((row) => row.date === "2026-09-25")?.roomTypes.find((cell) => cell.roomTypeId === "rt-1");
    assert.equal(deluxe26?.roomsOnBooks, 1);
    assert.equal(deluxe27?.roomsOnBooks, 1);
    assert.equal(deluxe25?.roomsOnBooks, 0);
    assert.equal(deluxe26?.roomsAvailable, 2);
    assert.equal(deluxe26?.roomsRemaining, 1);
    assert.equal(deluxe26?.bookedRoomRevenue, 100);
    assert.equal(deluxe27?.bookedRoomRevenue, 120);
    const standard = model.dates[1]?.roomTypes.find((cell) => cell.roomTypeId === "rt-2");
    assert.equal(standard?.roomsOnBooks, 0);
    assert.equal(standard?.roomsAvailable, 1);
  });

  it("counts group reservation rows as rooms, not travelers", () => {
    const model = buildDemandModel(
      baseInput({
        reservations: [
          reservation({ roomTypeId: "rt-1" }),
          reservation({ roomTypeId: "rt-1", ratePlanId: "rp-1" }),
        ],
      }),
    );
    const cell = model.dates.find((row) => row.date === "2026-09-26")?.roomTypes.find((item) => item.roomTypeId === "rt-1");
    assert.equal(cell?.roomsOnBooks, 2);
  });

  it("keeps OTB statuses aligned with Revenue Control and excludes pending", () => {
    assert.deepEqual([...DEMAND_OTB_STATUSES], ["confirmed", "checked_in", "checked_out"]);
    assert.equal(DEMAND_PENDING_INCLUDED, false);
    const statuses = readRel("../rates.server.ts");
    assert.match(statuses, /export const REVENUE_STATUSES = \["confirmed", "checked_in", "checked_out"\]/);
    const server = readRel("./demand.server.ts");
    assert.match(server, /REVENUE_STATUSES/);
    assert.doesNotMatch(server, /"pending"/);
  });

  it("does not invent cancelled or no-show occupancy in the live loader", () => {
    const server = readRel("./demand.server.ts");
    assert.match(server, /\.in\("status", REVENUE_STATUSES/);
    assert.doesNotMatch(server, /cancelled|no_show/);
  });
});

describe("RR-P4-01 — revenue formulas", () => {
  it("reuses computeBookedRevenueOverview for ADR, RevPAR and priced share", () => {
    const model = buildDemandModel(baseInput());
    const cell = model.dates.find((row) => row.date === "2026-09-26")?.roomTypes.find((item) => item.roomTypeId === "rt-1");
    const expected = computeBookedRevenueOverview({
      soldRoomNights: 1,
      availableRoomNights: 2,
      bookedRoomRevenue: 100,
      pricedNights: 1,
    });
    assert.equal(cell?.adr, expected.adr);
    assert.equal(cell?.revpar, expected.revPar);
    assert.equal(cell?.pricedShare, expected.pricedShare);
    assert.equal(cell?.occupancyPercent, expected.occupancyPercent);
  });

  it("keeps unpriced sold nights in occupancy and exposes priced share", () => {
    const model = buildDemandModel(
      baseInput({
        reservations: [reservation({ nightly: [] })],
      }),
    );
    const cell = model.dates.find((row) => row.date === "2026-09-26")?.roomTypes.find((item) => item.roomTypeId === "rt-1");
    assert.equal(cell?.roomsOnBooks, 1);
    assert.equal(cell?.bookedRoomRevenue, 0);
    assert.equal(cell?.pricedRooms, 0);
    assert.equal(cell?.pricedShare, 0);
    assert.equal(model.limitations.unpricedReservationsPresent, true);
    const server = readRel("./demand.server.ts");
    assert.match(server, /parseSnapshot/);
    assert.doesNotMatch(server, /price_hotel_stay/);
  });

  it("applies a rate-plan filter to revenue only, never to room-type occupancy", () => {
    const model = buildDemandModel(
      baseInput({
        ratePlanId: "rp-other",
        reservations: [reservation()],
      }),
    );
    const cell = model.dates.find((row) => row.date === "2026-09-26")?.roomTypes.find((item) => item.roomTypeId === "rt-1");
    assert.equal(cell?.roomsOnBooks, 1);
    assert.equal(cell?.bookedRoomRevenue, 0);
    assert.equal(model.limitations.ratePlanFilterAppliesToRevenueOnly, true);
  });
});

describe("RR-P4-01 — date, timezone and range", () => {
  it("uses property timezone for created_at and lead time, not UTC-only slicing", () => {
    assert.equal(propertyDateFromInstant("2026-09-20T22:00:00.000Z", "Pacific/Auckland"), "2026-09-21");
    assert.equal(propertyDateFromInstant("2026-09-20T22:00:00.000Z", "UTC"), "2026-09-20");
    assert.equal(leadTimeDays("2026-09-26", "2026-09-20"), 6);
    assert.equal(daysToArrival("2026-09-25", "2026-09-26"), 1);
    assert.equal(isRecentBooking("2026-09-20", "2026-09-25"), true);
    assert.equal(isRecentBooking("2026-09-17", "2026-09-25"), false);
    assert.equal(DEMAND_RECENT_BOOKING_DAYS, 7);
  });

  it("defaults to 30 future stay dates from the business date and clamps to 90", () => {
    assert.deepEqual(defaultDemandRange("2026-09-25"), { fromDate: "2026-09-25", toDate: "2026-10-24" });
    assert.equal(DEMAND_DEFAULT_RANGE_DAYS, 30);
    assert.equal(DEMAND_MAX_RANGE_DAYS, 90);
    const clamped = clampDemandRange("2026-09-25", "2027-01-01");
    assert.equal(clamped.rangeClamped, true);
    assert.equal(clamped.fromDate, "2026-09-25");
    assert.equal(clamped.toDate, "2026-12-23");
    const stay = snapshotStayRange("2026-09-25");
    assert.equal(stay.fromDate, "2026-09-25");
    assert.equal(stay.toDate, "2026-12-23");
    assert.equal(DEMAND_SNAPSHOT_HORIZON_DAYS, 90);
  });

  it("loads as-of from the property business date", () => {
    const server = readRel("./demand.server.ts");
    assert.match(server, /loadRevenueProperty/);
    assert.match(server, /asOfBusinessDate = options\?\.asOfBusinessDate \?\? property\.businessDate/);
    assert.doesNotMatch(server, /new Date\(\)/);
  });
});

describe("RR-P4-01 — snapshot capture and pickup", () => {
  it("maps live cells to one snapshot row per room type × stay date", () => {
    const model = buildDemandModel(baseInput({ asOfBusinessDate: "2026-09-25" }));
    const rows = workspaceToSnapshotRows("rest-1", model);
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.asOfBusinessDate === "2026-09-25"));
    assert.ok(rows.some((row) => row.roomTypeId === "rt-1" && row.stayDate === "2026-09-26" && row.roomsOnBooks === 1));
  });

  it("computes pickup deltas and does not treat a missing prior as zero", () => {
    const current = {
      roomsOnBooks: 4,
      roomsAvailable: 10,
      roomsRemaining: 6,
      bookedRoomRevenue: 800,
      occupancyPercent: 40,
      adr: 200,
      revpar: 80,
      pricedRooms: 4,
      pricedShare: 100,
    };
    const prior = {
      ...current,
      roomsOnBooks: 3,
      bookedRoomRevenue: 500,
      occupancyPercent: 30,
      adr: 166.67,
    };
    const up = computePickup({ current, prior });
    assert.equal(up.available, true);
    assert.equal(up.roomsPickup, 1);
    assert.equal(up.revenuePickup, 300);
    assert.equal(up.occupancyPointChange, 10);
    const down = computePickup({
      current: { ...current, roomsOnBooks: 2, bookedRoomRevenue: 400, occupancyPercent: 20, adr: 200 },
      prior: current,
    });
    assert.equal(down.roomsPickup, -2);
    assert.equal(down.revenuePickup, -400);
    const missing = computePickup({ current, prior: null });
    assert.equal(missing.available, false);
    assert.equal(missing.roomsPickup, null);
    assert.equal(missing.reason, "missing_prior_snapshot");
    const zero = computePickup({ current, prior: current });
    assert.equal(zero.roomsPickup, 0);
    assert.equal(zero.revenuePickup, 0);
    assert.deepEqual([...DEMAND_PICKUP_WINDOWS], [1, 3, 7, 14]);
    assert.equal(priorAsOfDate("2026-09-25", 7), "2026-09-18");
  });

  it("captures insert-once after a successful Night Audit close", () => {
    const capture = readRel("./demand-snapshot.server.ts");
    const night = readRel("../nightaudit.functions.ts");
    assert.match(capture, /already_present/);
    assert.match(capture, /insert\(/);
    assert.doesNotMatch(capture, /\.update\(/);
    assert.doesNotMatch(capture, /\.delete\(/);
    assert.match(capture, /asOfBusinessDate: input\.asOfBusinessDate/);
    assert.match(night, /captureOtbAfterClose/);
    assert.match(night, /if \(error\) return \{ ok: false/);
    const closeFn = night.slice(night.indexOf("export const closeBusinessDate"));
    const failedReturn = closeFn.indexOf("if (error) return { ok: false, message: nightAuditError(error.message).message }");
    assert.ok(failedReturn > 0);
    assert.match(closeFn.slice(failedReturn), /captureOtbAfterClose\(supabaseAdmin, data\.restaurantId, run\.business_date\)/);
    assert.match(night, /Never roll back a completed close/);
  });
});

describe("RR-P4-01 — SQL, honesty and no forecast", () => {
  it("keeps dual-lane 0103 SQL identical and immutable", () => {
    const drizzle = readRel("../../../../../drizzle/migrations/0103_pms_revenue_otb_snapshots.sql");
    const supabase = readRel("../../../../../supabase/migrations/0103_pms_revenue_otb_snapshots.sql");
    assert.equal(drizzle, supabase);
    assert.match(supabase, /CREATE TABLE public\.hotel_revenue_otb_snapshots/);
    assert.match(supabase, /hotel_revenue_otb_snapshots_grain_unique/);
    assert.match(supabase, /OTB_SNAPSHOT_IMMUTABLE/);
    assert.match(supabase, /BEFORE UPDATE OR DELETE ON public\.hotel_revenue_otb_snapshots/);
    assert.match(supabase, /GRANT SELECT ON public\.hotel_revenue_otb_snapshots TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT INSERT ON public\.hotel_revenue_otb_snapshots TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT UPDATE ON public\.hotel_revenue_otb_snapshots TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT DELETE ON public\.hotel_revenue_otb_snapshots TO authenticated/);
    assert.doesNotMatch(supabase, /forecast_runs|forecast_snapshots|forecast_history/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.close_business_date/);
    assert.match(supabase, /no backfill/);
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0103_pms_revenue_otb_snapshots.sql"));
  });

  it("exposes forecastAvailable false and does not add predictive fields", () => {
    const model = buildDemandModel(baseInput());
    assert.equal(model.limitations.forecastAvailable, false);
    assert.equal(DEMAND_FORECAST_AVAILABLE, false);
    assert.equal(DEMAND_AVAILABILITY_BASIS, "active_hotel_rooms");
    assert.equal(model.limitations.availabilityIncludesFutureOosRisk, true);
    const domain = readRel("./demand.ts");
    const functions = readRel("./demand.functions.ts");
    const snapshotFns = readRel("./demand-snapshot.functions.ts");
    assert.doesNotMatch(domain, /forecastRooms|projectedOccupancy|demandScore|forecastConfidence/);
    assert.match(functions, /getRevenueDemandOverview/);
    assert.match(functions, /requireRateManager/);
    assert.doesNotMatch(functions, /captureRevenueOtbSnapshot/);
    assert.match(snapshotFns, /getRevenueOtbSnapshots/);
    assert.match(snapshotFns, /getRevenueOtbSnapshotHistoryStart/);
    assert.doesNotMatch(snapshotFns, /captureRevenueOtbSnapshot/);
    assert.match(readRel("./demand-snapshot.server.ts"), /loadOtbSnapshotHistoryStart/);
    assert.match(readRel("./demand.server.ts"), /hotel_rooms/);
    assert.match(readRel("./demand.server.ts"), /eq\("active", true\)/);
    assert.doesNotMatch(readRel("./demand.functions.ts"), /marketSegmentId|salesChannelId/);
  });
});
