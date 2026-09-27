import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDemandModel,
  type DemandBuildInput,
  type DemandReservation,
} from "./demand.ts";
import {
  DEMAND_CALENDAR_JUMP_DAYS,
  DEMAND_CALENDAR_LEGEND_LABELS,
  DEMAND_CALENDAR_PICKUP_WINDOW,
  DEMAND_CALENDAR_VISIBLE_DAYS,
  DEMAND_DETAIL_LIVE_COPY,
  buildDemandCalendarModel,
  defaultDemandCalendarRange,
  demandCalendarBand,
  demandCalendarBandLabel,
  demandCalendarQuickSearch,
  demandDetailAttention,
  formatDemandPickup7d,
} from "./demand-calendar.ts";
import { DEMAND_FORECAST_UNAVAILABLE_TITLE } from "./demand-overview.ts";
import { buildPickupModel, type PickupBuildInput } from "./pickup-pace.ts";
import {
  buildRateCalendarModel,
  type RateCalendarBuildInput,
  type RateCalendarPlan,
} from "./rate-calendar.ts";
import { foundationRevenueViews, implementedRevenueViews, revenueViewDefinition } from "../rate-revenue-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const DELUXE = "rt-1";
const STANDARD = "rt-2";
const BAR = "rp-1";
const CORP = "rp-2";

function reservation(partial: Partial<DemandReservation> = {}): DemandReservation {
  return {
    roomTypeId: DELUXE,
    ratePlanId: BAR,
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

function demandInput(partial: Partial<DemandBuildInput> = {}): DemandBuildInput {
  return {
    asOfBusinessDate: "2026-09-25",
    fromDate: "2026-09-25",
    toDate: "2026-10-08",
    requestedFrom: "2026-09-25",
    requestedTo: "2026-10-08",
    rangeClamped: false,
    timezone: "UTC",
    currency: "USD",
    roomTypeId: null,
    ratePlanId: null,
    rooms: [
      { id: "room-1", roomTypeId: DELUXE },
      { id: "room-2", roomTypeId: DELUXE },
      { id: "room-3", roomTypeId: STANDARD },
    ],
    roomTypes: [
      { id: DELUXE, name: "Deluxe" },
      { id: STANDARD, name: "Standard" },
    ],
    reservations: [reservation()],
    plans: [
      { id: BAR, roomTypeId: DELUXE },
      { id: CORP, roomTypeId: STANDARD },
    ],
    overrides: [{ ratePlanId: BAR, date: "2026-09-26" }],
    restrictions: [{ ratePlanId: BAR, date: "2026-09-26" }],
    snapshotHistoryStartsAt: "2026-09-18",
    ...partial,
  };
}

const plans: RateCalendarPlan[] = [
  {
    id: BAR,
    code: "BAR",
    name: "BAR",
    roomTypeId: DELUXE,
    currency: "USD",
    baseRate: 180,
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    active: true,
  },
  {
    id: CORP,
    code: "CORP",
    name: "Corporate",
    roomTypeId: STANDARD,
    currency: "USD",
    baseRate: 140,
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    active: true,
  },
];

function rateInput(partial: Partial<RateCalendarBuildInput> = {}): RateCalendarBuildInput {
  return {
    fromDate: "2026-09-25",
    toDate: "2026-10-08",
    requestedFrom: "2026-09-25",
    requestedTo: "2026-10-08",
    rangeClamped: false,
    roomTypeId: null,
    ratePlanId: null,
    currency: "USD",
    rooms: [
      { id: "r1", roomTypeId: DELUXE },
      { id: "r2", roomTypeId: DELUXE },
      { id: "r3", roomTypeId: STANDARD },
    ],
    roomTypes: [
      { id: DELUXE, code: "DLX", name: "Deluxe" },
      { id: STANDARD, code: "STD", name: "Standard" },
    ],
    plans,
    overrides: [{ ratePlanId: BAR, date: "2026-09-26", nightlyRate: 210, updatedAt: "2026-09-24T10:00:00.000Z" }],
    restrictions: [
      {
        ratePlanId: BAR,
        date: "2026-09-26",
        minStay: 2,
        maxStay: null,
        closedToArrival: true,
        closedToDeparture: false,
        stopSell: true,
        updatedAt: "2026-09-24T10:00:00.000Z",
      },
    ],
    reservations: [{ roomTypeId: DELUXE, arrivalDate: "2026-09-26", departureDate: "2026-09-28" }],
    ...partial,
  };
}

function pickupInput(partial: Partial<PickupBuildInput> = {}): PickupBuildInput {
  return {
    currentAsOf: "2026-09-25",
    priorAsOfExists: true,
    windowDays: 7,
    fromDate: "2026-09-25",
    toDate: "2026-10-08",
    requestedFrom: "2026-09-25",
    requestedTo: "2026-10-08",
    rangeClamped: false,
    currentRows: [
      {
        restaurantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        asOfBusinessDate: "2026-09-25",
        stayDate: "2026-09-26",
        roomTypeId: DELUXE,
        roomsOnBooks: 4,
        roomsAvailable: 2,
        roomsRemaining: 0,
        bookedRoomRevenue: 400,
        currency: "USD",
        occupancyPercent: 100,
        adr: 100,
        revpar: 200,
        pricedRooms: 4,
        pricedShare: 100,
      },
    ],
    priorRows: [
      {
        restaurantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        asOfBusinessDate: "2026-09-18",
        stayDate: "2026-09-26",
        roomTypeId: DELUXE,
        roomsOnBooks: 1,
        roomsAvailable: 2,
        roomsRemaining: 1,
        bookedRoomRevenue: 100,
        currency: "USD",
        occupancyPercent: 50,
        adr: 100,
        revpar: 50,
        pricedRooms: 1,
        pricedShare: 100,
      },
    ],
    roomTypes: [
      { id: DELUXE, name: "Deluxe" },
      { id: STANDARD, name: "Standard" },
    ],
    snapshotHistoryStartsAt: "2026-09-18",
    ...partial,
  };
}

function composeCalendar(
  demandPartial: Partial<DemandBuildInput> = {},
  ratePartial: Partial<RateCalendarBuildInput> = {},
  pickupPartial: Partial<PickupBuildInput> = {},
) {
  return buildDemandCalendarModel(
    buildDemandModel(demandInput(demandPartial)),
    buildRateCalendarModel(rateInput(ratePartial)),
    buildPickupModel(pickupInput(pickupPartial)),
  );
}

describe("RR-P4-04 — UI-15 Demand Calendar + UI-14 Demand Detail", () => {
  it("mounts demand-calendar as implemented without a rate-plan context field", () => {
    const definition = revenueViewDefinition("demand-calendar");
    assert.equal(definition.implemented, true);
    assert.equal(definition.plannedCapability, undefined);
    assert.equal(definition.label, "Demand Calendar");
    assert.equal(definition.requiredCapability, "canViewForecast");
    assert.deepEqual([...definition.contextFields], ["dateRange", "roomType"]);
    assert.match(definition.description, /stay date and room type/i);
    assert.ok(implementedRevenueViews().includes("demand-calendar"));
    assert.ok(!foundationRevenueViews().includes("demand-calendar"));
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /<DemandCalendarView/);
    assert.match(workspace, /case "demand-calendar"/);
    assert.match(workspace, /defaultDemandCalendarRange\(businessDate\)/);
  });

  it("leaves forecast-detail and forecast-history unimplemented", () => {
    assert.equal(revenueViewDefinition("forecast-detail").implemented, false);
    assert.equal(revenueViewDefinition("forecast-history").implemented, false);
    assert.ok(foundationRevenueViews().includes("forecast-detail"));
    assert.ok(foundationRevenueViews().includes("forecast-history"));
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    assert.doesNotMatch(workspace, /case "forecast-detail"/);
    assert.doesNotMatch(workspace, /case "forecast-history"/);
    assert.doesNotMatch(workspace, /ForecastHistoryView|ForecastDetailView/);
  });

  it("composes room-type rows and 14 stay-date columns from live demand", () => {
    assert.deepEqual(defaultDemandCalendarRange("2026-09-25"), {
      fromDate: "2026-09-25",
      toDate: "2026-10-08",
    });
    assert.equal(DEMAND_CALENDAR_VISIBLE_DAYS, 14);
    assert.equal(DEMAND_CALENDAR_JUMP_DAYS, 7);
    const calendar = composeCalendar();
    assert.equal(calendar.dates.length, 14);
    assert.equal(calendar.dates[0], "2026-09-25");
    assert.equal(calendar.dates[13], "2026-10-08");
    assert.equal(calendar.rows.length, 2);
    assert.deepEqual(calendar.rows.map((row) => row.roomTypeName), ["Deluxe", "Standard"]);
    const deluxe26 = calendar.rows[0]?.cells.find((cell) => cell.date === "2026-09-26");
    assert.equal(deluxe26?.roomsOnBooks, 1);
    assert.equal(deluxe26?.roomsAvailable, 2);
    assert.equal(deluxe26?.roomsRemaining, 1);
    assert.equal(deluxe26?.occupancyPercent, 50);
    assert.equal(deluxe26?.bookedRoomRevenue, 100);
    assert.equal(deluxe26?.recentBookings, 1);
    assert.equal(calendar.limitations.forecastAvailable, false);
  });

  it("uses occupancy/inventory color states and never High Demand", () => {
    assert.equal(demandCalendarBand({ occupancyPercent: 0, roomsRemaining: 0, roomsAvailable: 0 }), "sold-out");
    assert.equal(demandCalendarBand({ occupancyPercent: 100, roomsRemaining: 0, roomsAvailable: 10 }), "sold-out");
    assert.equal(demandCalendarBand({ occupancyPercent: 90, roomsRemaining: 1, roomsAvailable: 10 }), "high-occupancy");
    assert.equal(demandCalendarBand({ occupancyPercent: 80, roomsRemaining: 2, roomsAvailable: 10 }), "elevated");
    assert.equal(demandCalendarBand({ occupancyPercent: 40, roomsRemaining: 6, roomsAvailable: 10 }), "open");
    assert.equal(demandCalendarBandLabel("sold-out"), "Sold Out");
    assert.equal(demandCalendarBandLabel("high-occupancy"), "High Occupancy");
    assert.equal(demandCalendarBandLabel("elevated"), "Elevated Occupancy");
    assert.equal(demandCalendarBandLabel("open"), "Open Inventory");
    assert.deepEqual([...DEMAND_CALENDAR_LEGEND_LABELS], [
      "Open Inventory",
      "Elevated Occupancy",
      "High Occupancy",
      "Sold Out",
      "Stop Sell",
      "Restriction",
      "Rate Override",
    ]);
    const helper = readRel("./demand-calendar.ts");
    const legend = readRel("../../components/rates/demand-calendar/demand-calendar-legend.tsx");
    assert.doesNotMatch(helper, /"High Demand"|"Low Demand"|"Normal Demand"/);
    assert.doesNotMatch(legend, /High Demand|Low Demand|Demand Score/);
  });

  it("ORs restrictions, flags overrides, and shows 7D pickup only when comparable", () => {
    const calendar = composeCalendar();
    const deluxe26 = calendar.rows[0]?.cells.find((cell) => cell.date === "2026-09-26");
    assert.equal(deluxe26?.stopSell, true);
    assert.deepEqual(deluxe26?.marks.map((mark) => mark.label), ["SS", "CTA", "Min 2"]);
    assert.equal(deluxe26?.overrideActive, true);
    assert.equal(deluxe26?.roomsPickup7d, 3);
    assert.equal(formatDemandPickup7d(3), "+3 7D");
    assert.equal(formatDemandPickup7d(null), null);
    assert.equal(deluxe26?.rates[0]?.code, "BAR");
    assert.equal(deluxe26?.rates[0]?.effectiveRate, 210);

    const missingPickup = composeCalendar({}, {}, { currentRows: [], priorRows: [], currentAsOf: null, priorAsOfExists: false });
    const openCell = missingPickup.rows[0]?.cells.find((cell) => cell.date === "2026-09-25");
    assert.equal(openCell?.roomsPickup7d, null);
    assert.equal(openCell?.recentBookings, 0);

    const cell = readRel("../../components/rates/demand-calendar/demand-calendar-cell.tsx");
    assert.match(cell, /ring-2 ring-\[#C89933\]/);
    assert.match(cell, /formatDemandPickup7d/);
    assert.match(cell, /Override/);
  });

  it("exposes live overview fields and honest pickup windows in Demand Detail", () => {
    const calendar = composeCalendar();
    const deluxe26 = calendar.rows[0]?.cells.find((cell) => cell.date === "2026-09-26");
    assert.ok(deluxe26);
    assert.deepEqual(demandDetailAttention(deluxe26), [
      "Stop Sell",
      "Restriction Active",
      "Rate Override",
    ]);
    assert.equal(DEMAND_DETAIL_LIVE_COPY, "Live on-the-books demand for the selected stay date.");
    assert.equal(calendar.limitations.forecastNote, DEMAND_FORECAST_UNAVAILABLE_TITLE);
    const overview = readRel("../../components/rates/demand-detail/demand-detail-overview.tsx");
    const pickup = readRel("../../components/rates/demand-detail/demand-detail-pickup.tsx");
    const drawer = readRel("../../components/rates/demand-detail/demand-detail-drawer.tsx");
    assert.match(overview, /DEMAND_DETAIL_LIVE_COPY/);
    assert.match(overview, /DEMAND_FORECAST_UNAVAILABLE_TITLE/);
    assert.match(overview, /DEMAND_RECENT_BOOKING_ACTIVITY_LABEL/);
    assert.match(overview, /This is not pickup/);
    assert.match(overview, /Sold Out|Stop Sell/);
    assert.match(pickup, /getRevenuePickupPace/);
    assert.match(pickup, /fromDate: stayDate/);
    assert.match(pickup, /toDate: stayDate/);
    assert.match(pickup, /PickupWindowSelector/);
    assert.match(pickup, /unavailable/);
    assert.doesNotMatch(pickup, /zero-fill|recentBookings/);
    assert.match(drawer, /Overview/);
    assert.match(drawer, /Pickup/);
    assert.match(drawer, /Rates & Restrictions/);
    assert.match(drawer, /Related/);
    assert.match(drawer, /xl:grid-cols-\[minmax\(0,1fr\)_420px\]|max-w-md/);
  });

  it("shows commercial context without a recommended rate", () => {
    const rates = readRel("../../components/rates/demand-detail/demand-detail-rates.tsx");
    const overview = readRel("../../components/rates/demand-detail/demand-detail-overview.tsx");
    assert.match(rates, /effectiveRate/);
    assert.match(rates, /overrideActive/);
    assert.doesNotMatch(rates, /Recommended Rate|recommended rate|auto-price/);
    assert.doesNotMatch(overview, /Recommended Rate|Forecast Occupancy|Expected Pickup|Demand Score/);
  });

  it("seeds quick actions with stay date and room type only", () => {
    assert.deepEqual(demandCalendarQuickSearch("rate-calendar", "2026-09-26", DELUXE), {
      view: "rate-calendar",
      from: "2026-09-26",
      to: "2026-09-26",
      roomType: DELUXE,
    });
    assert.deepEqual(demandCalendarQuickSearch("restrictions", "2026-09-26", DELUXE), {
      view: "restrictions",
      from: "2026-09-26",
      to: "2026-09-26",
      roomType: DELUXE,
    });
    assert.deepEqual(demandCalendarQuickSearch("pickup-pace", "2026-09-26", DELUXE), {
      view: "pickup-pace",
      from: "2026-09-26",
      to: "2026-10-09",
      roomType: DELUXE,
    });
    const related = readRel("../../components/rates/demand-detail/demand-detail-related.tsx");
    assert.match(related, /View Rate Calendar/);
    assert.match(related, /View Restrictions/);
    assert.match(related, /View Pickup & Pace/);
    assert.doesNotMatch(related, /View Reservations/);
    assert.doesNotMatch(related, /ratePlan/);
  });

  it("uses the official calendar API and 7D snapshot pickup", () => {
    const functions = readRel("./demand-calendar.functions.ts");
    const server = readRel("./demand-calendar.server.ts");
    const view = readRel("../../components/rates/demand-calendar/demand-calendar-view.tsx");
    const toolbar = readRel("../../components/rates/demand-calendar/demand-calendar-toolbar.tsx");
    assert.match(functions, /getRevenueDemandCalendar/);
    assert.match(functions, /requireRateManager/);
    assert.match(functions, /DEMAND_CALENDAR_LOAD_ERROR/);
    assert.match(server, /loadRevenueDemandOverview/);
    assert.match(server, /loadRevenueRateCalendar/);
    assert.match(server, /loadRevenuePickupPace/);
    assert.match(server, /windowDays: DEMAND_CALENDAR_PICKUP_WINDOW/);
    assert.equal(DEMAND_CALENDAR_PICKUP_WINDOW, 7);
    assert.doesNotMatch(server, /ratePlanId/);
    assert.match(view, /"revenue-demand-calendar"/);
    assert.match(view, /DemandDetailDrawer/);
    assert.match(view, /aria-busy="true"/);
    assert.match(toolbar, /View Pickup & Pace/);
    assert.doesNotMatch(toolbar, /Forecast|Demand Score/);
    assert.doesNotMatch(view, /getRevenueControlWorkspace|captureRevenueOtbSnapshot/);
  });

  it("keeps UI-12 as a calendar link only and does not invent forecast", () => {
    const overview = readRel("../../components/rates/demand-overview/demand-forecast-view.tsx");
    assert.match(overview, /View Demand Calendar/);
    assert.doesNotMatch(overview, /DemandDetailDrawer/);
    const helper = readRel("./demand-calendar.ts");
    const ui = [
      helper,
      readRel("../../components/rates/demand-calendar/demand-calendar-view.tsx"),
      readRel("../../components/rates/demand-detail/demand-detail-overview.tsx"),
    ].join("\n");
    assert.doesNotMatch(ui, /Forecast Occupancy|Expected Pickup|Demand Score|YoY|competitor|auto-price/);
    assert.doesNotMatch(ui, /forecastRooms|projectedOccupancy/);
  });

  it("adds no migration and does not edit price_hotel_stay", () => {
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(!migrations.some((name) => /demand.calendar|ui-15|ui-14|forecast.engine/i.test(name)));
    const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    const helper = readRel("./demand-calendar.ts");
    assert.doesNotMatch(helper, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
  });

  it("locks Phase 4 integration A–I", () => {
    const overviewView = readRel("../../components/rates/demand-overview/demand-forecast-view.tsx");
    const pickupView = readRel("../../components/rates/pickup-pace/pickup-pace-view.tsx");
    const calendarView = readRel("../../components/rates/demand-calendar/demand-calendar-view.tsx");
    const calendarServer = readRel("./demand-calendar.server.ts");
    const calendarHelper = readRel("./demand-calendar.ts");
    const pickupHelper = readRel("./pickup-pace.ts");
    const demandHelper = readRel("./demand.ts");
    const workspace = readRel("../rate-revenue-workspace.ts");

    assert.match(overviewView, /getRevenueDemandOverview/);
    assert.match(pickupView, /getRevenuePickupPace/);
    assert.match(calendarHelper, /stay date × room type|stay date and room type/i);
    assert.match(calendarView, /DemandDetailDrawer/);
    assert.match(calendarServer, /loadRevenueRateCalendar/);
    assert.match(calendarHelper, /hotel_rate_restrictions|restriction/);
    assert.match(calendarHelper, /overrideActive/);
    assert.match(pickupHelper, /snapshot-to-snapshot|current OTB snapshot − prior OTB snapshot/);
    assert.doesNotMatch(calendarHelper, /recentBookings as pickup|roomsPickup7d: live\.recentBookings/);
    assert.match(demandHelper, /forecastAvailable: false/);
    assert.match(workspace, /id: "forecast-history"/);
    assert.match(workspace, /implemented: false/);
    assert.equal(revenueViewDefinition("forecast-history").implemented, false);
  });
});
