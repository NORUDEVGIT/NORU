import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDemandModel,
  defaultDemandRange,
  type DemandBuildInput,
  type DemandCellMetrics,
  type DemandDateRow,
} from "./demand.ts";
import {
  DEMAND_EMPTY_NO_OTB,
  DEMAND_EMPTY_NO_ROOM_TYPES,
  DEMAND_FORECAST_UNAVAILABLE_COPY,
  DEMAND_FORECAST_UNAVAILABLE_TITLE,
  DEMAND_KPI_BOOKED_NIGHTS,
  DEMAND_KPI_OTB_OCCUPANCY,
  DEMAND_KPI_REMAINING_NIGHTS,
  DEMAND_RECENT_BOOKING_ACTIVITY_LABEL,
  DEMAND_SNAPSHOT_NOT_STARTED,
  collectDemandAttention,
  demandAttentionKinds,
  demandHasOtb,
  demandHasRestrictionAttention,
  demandLimitationNotes,
  demandSnapshotNote,
  rollupDemandRoomTypes,
} from "./demand-overview.ts";
import { implementedRevenueViews, revenueViewDefinition } from "../rate-revenue-workspace.ts";
import { REVENUE_CONTROL_HIGH_OCCUPANCY_PERCENT, REVENUE_CONTROL_LOW_REMAINING_RATIO } from "./revenue-control.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function dateRow(partial: Partial<DemandDateRow> & Pick<DemandDateRow, "date">): DemandDateRow {
  return {
    daysToArrival: 1,
    roomsOnBooks: 0,
    roomsAvailable: 10,
    roomsRemaining: 10,
    occupancyPercent: 0,
    bookedRoomRevenue: 0,
    adr: 0,
    revpar: 0,
    pricedShare: 100,
    recentBookings: 0,
    roomTypes: [],
    ...partial,
  };
}

function cell(partial: Partial<DemandCellMetrics> & Pick<DemandCellMetrics, "date" | "roomTypeId">): DemandCellMetrics {
  return {
    roomTypeName: partial.roomTypeId,
    roomsOnBooks: 0,
    roomsAvailable: 10,
    roomsRemaining: 10,
    occupancyPercent: 0,
    bookedRoomRevenue: 0,
    soldRoomNights: 0,
    revenueSoldNights: 0,
    adr: 0,
    revpar: 0,
    pricedRooms: 0,
    pricedShare: 100,
    recentBookings: 0,
    activeRestrictionCount: 0,
    rateOverrideCount: 0,
    daysToArrival: 1,
    ...partial,
  };
}

describe("RR-P4-02 — UI-12 Demand & Forecast Overview", () => {
  it("mounts demand-forecast as implemented without plannedCapability", () => {
    const definition = revenueViewDefinition("demand-forecast");
    assert.equal(definition.implemented, true);
    assert.equal(definition.plannedCapability, undefined);
    assert.equal(definition.label, "Demand & Forecast");
    assert.equal(definition.requiredCapability, "canViewForecast");
    assert.ok(implementedRevenueViews().includes("demand-forecast"));
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /<DemandForecastView/);
    assert.match(workspace, /case "demand-forecast"/);
    assert.doesNotMatch(workspace, /plannedCapability: "Forward occupancy/);
  });

  it("calls getRevenueDemandOverview only and omits commercial filters", () => {
    const view = readRel("../../components/rates/demand-overview/demand-forecast-view.tsx");
    assert.match(view, /getRevenueDemandOverview/);
    assert.match(view, /"revenue-demand-overview"/);
    assert.doesNotMatch(view, /getRevenueControlWorkspace|getRevenueOtbSnapshots|captureRevenueOtbSnapshot|getRevenueRateCalendar/);
    assert.doesNotMatch(view, /marketSegmentId|commercialSourceId|salesChannelId/);
    assert.doesNotMatch(view, /pickup-pace|demand-calendar/);
  });

  it("labels summary KPIs as room nights, not physical rooms", () => {
    assert.equal(DEMAND_KPI_OTB_OCCUPANCY, "OTB Occupancy");
    assert.equal(DEMAND_KPI_BOOKED_NIGHTS, "Booked Room Nights");
    assert.equal(DEMAND_KPI_REMAINING_NIGHTS, "Remaining Room Nights");
    const kpis = readRel("../../components/rates/demand-overview/demand-overview-kpis.tsx");
    assert.match(kpis, /DEMAND_KPI_BOOKED_NIGHTS/);
    assert.match(kpis, /DEMAND_KPI_REMAINING_NIGHTS/);
    assert.match(kpis, /As of \{data\.asOfBusinessDate\}/);
    assert.doesNotMatch(kpis, /Rooms Remaining:/);
  });

  it("keeps forecast unavailable copy and omits predictive strings", () => {
    assert.equal(DEMAND_FORECAST_UNAVAILABLE_TITLE, "Forecast: Not Yet Available");
    assert.match(DEMAND_FORECAST_UNAVAILABLE_COPY, /predictive forecast is not configured/i);
    assert.match(DEMAND_FORECAST_UNAVAILABLE_COPY, /live on-the-books/i);
    const card = readRel("../../components/rates/demand-overview/forecast-unavailable-card.tsx");
    const view = readRel("../../components/rates/demand-overview/demand-forecast-view.tsx");
    const occupancy = readRel("../../components/rates/demand-overview/forward-occupancy-chart.tsx");
    const revenue = readRel("../../components/rates/demand-overview/booked-revenue-chart.tsx");
    const kpis = readRel("../../components/rates/demand-overview/demand-overview-kpis.tsx");
    const ui = [card, view, occupancy, revenue, kpis].join("\n");
    assert.match(card, /DEMAND_FORECAST_UNAVAILABLE_TITLE/);
    assert.match(view, /ForecastUnavailableCard/);
    assert.match(occupancy, /No forecast series/);
    assert.match(occupancy, /domain=\{\[0, 100\]\}/);
    assert.doesNotMatch(ui, /Forecast Occupancy|Projected Revenue|Demand Score|Recommended Rate/);
    assert.doesNotMatch(ui, /competitor|auto-price|YoY/);
  });

  it("labels recent activity as Recent Booking Activity, not Pickup", () => {
    assert.equal(DEMAND_RECENT_BOOKING_ACTIVITY_LABEL, "Recent Booking Activity");
    const recent = readRel("../../components/rates/demand-overview/recent-booking-activity.tsx");
    const kpis = readRel("../../components/rates/demand-overview/demand-overview-kpis.tsx");
    assert.match(recent, /DEMAND_RECENT_BOOKING_ACTIVITY_LABEL/);
    assert.match(kpis, /DEMAND_RECENT_BOOKING_ACTIVITY_LABEL/);
    assert.match(recent, /This is not pickup/);
    assert.doesNotMatch(recent, /Pickup & Pace|>Pickup</);
    assert.doesNotMatch(kpis, /Pickup/);
  });

  it("uses Control Center thresholds and honest attention labels", () => {
    assert.equal(REVENUE_CONTROL_HIGH_OCCUPANCY_PERCENT, 90);
    assert.equal(REVENUE_CONTROL_LOW_REMAINING_RATIO, 0.2);
    assert.deepEqual(
      demandAttentionKinds({
        occupancyPercent: 90,
        roomsRemaining: 1,
        roomsAvailable: 10,
        activeRestrictionCount: 0,
        rateOverrideCount: 0,
      }),
      ["High Occupancy", "Low Remaining Inventory"],
    );
    assert.deepEqual(
      demandAttentionKinds({
        occupancyPercent: 85,
        roomsRemaining: 2,
        roomsAvailable: 10,
        activeRestrictionCount: 0,
        rateOverrideCount: 0,
      }),
      ["Low Remaining Inventory"],
    );
    assert.deepEqual(
      demandAttentionKinds({
        occupancyPercent: 50,
        roomsRemaining: 5,
        roomsAvailable: 10,
        activeRestrictionCount: 1,
        rateOverrideCount: 0,
      }),
      ["Restriction Active"],
    );
    assert.deepEqual(
      demandAttentionKinds({
        occupancyPercent: 50,
        roomsRemaining: 5,
        roomsAvailable: 10,
        activeRestrictionCount: 0,
        rateOverrideCount: 2,
      }),
      ["Rate Override"],
    );
    const items = collectDemandAttention([
      dateRow({
        date: "2026-09-26",
        occupancyPercent: 50,
        roomsOnBooks: 5,
        roomsAvailable: 10,
        roomsRemaining: 5,
        roomTypes: [
          cell({
            date: "2026-09-26",
            roomTypeId: "rt-1",
            roomsOnBooks: 5,
            roomsAvailable: 10,
            roomsRemaining: 5,
            occupancyPercent: 50,
            activeRestrictionCount: 1,
          }),
        ],
      }),
    ]);
    assert.equal(items.length, 1);
    assert.deepEqual(items[0]?.kinds, ["Restriction Active"]);
    assert.equal(demandHasRestrictionAttention(items), true);
    const helper = readRel("./demand-overview.ts");
    assert.doesNotMatch(helper, /"High Demand"|"Low Demand"/);
    const table = readRel("../../components/rates/demand-overview/demand-attention-table.tsx");
    assert.match(table, /View Restrictions/);
    assert.doesNotMatch(table, /pickup-pace|demand-calendar/);
  });

  it("rolls room types by occupancy nights and sorts occupancy descending", () => {
    const rows = rollupDemandRoomTypes([
      dateRow({
        date: "2026-09-26",
        roomTypes: [
          cell({
            date: "2026-09-26",
            roomTypeId: "rt-std",
            roomTypeName: "Standard",
            roomsOnBooks: 1,
            roomsAvailable: 4,
            roomsRemaining: 3,
            occupancyPercent: 25,
            bookedRoomRevenue: 80,
            soldRoomNights: 1,
            revenueSoldNights: 1,
            pricedRooms: 1,
          }),
          cell({
            date: "2026-09-26",
            roomTypeId: "rt-dlx",
            roomTypeName: "Deluxe",
            roomsOnBooks: 3,
            roomsAvailable: 4,
            roomsRemaining: 1,
            occupancyPercent: 75,
            bookedRoomRevenue: 300,
            soldRoomNights: 3,
            revenueSoldNights: 3,
            pricedRooms: 3,
          }),
        ],
      }),
    ]);
    assert.equal(rows[0]?.roomTypeName, "Deluxe");
    assert.equal(rows[0]?.roomsOnBooks, 3);
    assert.equal(rows[0]?.occupancyPercent, 75);
    assert.equal(rows[1]?.roomTypeName, "Standard");
    const table = readRel("../../components/rates/demand-overview/demand-room-type-table.tsx");
    assert.match(table, /OTB nights/);
    assert.match(table, /Priced Share/);
    assert.doesNotMatch(table, /rate-plan occupancy|Rate Plan Occupancy/);
  });

  it("exposes empty and limitation copy without inventing forecast", () => {
    assert.equal(DEMAND_EMPTY_NO_OTB, "No on-the-books reservations for this date range.");
    assert.match(DEMAND_EMPTY_NO_ROOM_TYPES, /Property Setup/);
    const input: DemandBuildInput = {
      asOfBusinessDate: "2026-09-25",
      fromDate: "2026-09-25",
      toDate: "2026-09-26",
      requestedFrom: "2026-09-25",
      requestedTo: "2026-09-26",
      rangeClamped: false,
      timezone: "UTC",
      currency: "USD",
      roomTypeId: null,
      ratePlanId: "rp-1",
      rooms: [{ id: "room-1", roomTypeId: "rt-1" }],
      roomTypes: [{ id: "rt-1", name: "Deluxe" }],
      reservations: [],
      plans: [{ id: "rp-1", roomTypeId: "rt-1" }],
      overrides: [],
      restrictions: [],
      snapshotHistoryStartsAt: null,
    };
    const empty = buildDemandModel(input);
    assert.equal(demandHasOtb(empty), false);
    const notes = demandLimitationNotes(empty);
    assert.ok(notes.some((note) => note.includes("rate-plan filter")));
    assert.ok(notes.some((note) => /OOO\/OOS/.test(note)));
    assert.ok(notes.includes(DEMAND_SNAPSHOT_NOT_STARTED));
    assert.equal(demandSnapshotNote({ ...empty.limitations, snapshotHistoryStartsAt: "2026-09-20" }), "Snapshot history starts at 2026-09-20.");
    const view = readRel("../../components/rates/demand-overview/demand-forecast-view.tsx");
    assert.match(view, /DEMAND_EMPTY_NO_OTB/);
    assert.match(view, /DEMAND_EMPTY_NO_ROOM_TYPES/);
    assert.match(view, /DEMAND_LOAD_ERROR/);
    assert.match(view, /revenueUiError/);
  });

  it("defaults the URL-less range with defaultDemandRange from the business date", () => {
    assert.deepEqual(defaultDemandRange("2026-09-25"), { fromDate: "2026-09-25", toDate: "2026-10-24" });
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /defaultDemandRange\(businessDate\)/);
    assert.match(workspace, /requestedView !== "demand-forecast"/);
    const demandEffect = workspace.slice(workspace.indexOf('requestedView !== "demand-forecast"'));
    assert.match(demandEffect, /if \(search\.from \|\| search\.to\) return;/);
  });

  it("adds no migration and does not edit price_hotel_stay", () => {
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(!migrations.some((name) => /demand.overview|ui-12|forecast.engine/i.test(name)));
    const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    const helper = readRel("./demand-overview.ts");
    const view = readRel("../../components/rates/demand-overview/demand-forecast-view.tsx");
    assert.doesNotMatch(helper, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(view, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(helper, /forecastRooms|projectedOccupancy|demandScore/);
  });
});
