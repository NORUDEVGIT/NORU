import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { stayOverlapsRange } from "../front-office-shell.ts";
import {
  assignmentOverlapIds,
  calendarReadInputSchema,
  mapCalendarBar,
  resolveCalendarWindow,
  stayOverlapsCalendarWindow,
} from "./calendar.server.ts";
import {
  CALENDAR_AVAILABILITY_TYPE_CAP,
  CALENDAR_BAR_STATUSES,
  CALENDAR_BLOCK_CAP,
  CALENDAR_HORIZONS,
  CALENDAR_RESERVATION_CAP,
  type CalendarBar,
  type ReservationOperationalSummary,
} from "./shared-read-models.ts";

const source = readFileSync(new URL("./calendar.server.ts", import.meta.url), "utf8");

function summary(
  overrides: Partial<ReservationOperationalSummary> = {},
): ReservationOperationalSummary {
  return {
    reservationId: "res-1",
    confirmationNumber: "NORU-2401",
    arrivalDate: "2026-09-23",
    departureDate: "2026-09-26",
    nights: 3,
    adults: 2,
    children: 0,
    status: "confirmed",
    source: "staff",
    roomTypeId: "type-1",
    roomTypeName: "Deluxe King",
    roomId: "room-1",
    roomNumber: "101",
    guestId: "guest-1",
    guestName: "Ada Lovelace",
    guestPhone: null,
    guestEmail: null,
    guestVip: true,
    ratePlanId: "rate-1",
    ratePlanName: "BAR",
    roomSubtotal: 300,
    currency: "GBP",
    companyMasterId: null,
    companyName: null,
    travelAgentMasterId: null,
    travelAgentName: null,
    groupAccountMasterId: null,
    groupName: null,
    commercialBookingSource: null,
    marketSegment: null,
    externalReference: null,
    guaranteeMethod: null,
    specialRequests: null,
    notes: null,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-22T10:00:00Z",
    ...overrides,
  };
}

function bar(overrides: Partial<CalendarBar> = {}): CalendarBar {
  return {
    reservationId: "res-1",
    confirmationNumber: "NORU-2401",
    guestId: "guest-1",
    guestName: "Ada Lovelace",
    guestVip: false,
    status: "confirmed",
    roomTypeId: "type-1",
    roomId: "room-1",
    arrivalDate: "2026-09-23",
    departureDate: "2026-09-26",
    adults: 1,
    children: 0,
    updatedAt: "2026-09-22T10:00:00Z",
    source: "staff",
    ratePlanName: null,
    exceptionKeys: [],
    ...overrides,
  };
}

describe("DB-04I-05 Booking Calendar read model", () => {
  it("defaults the window from property business date and supports 1/7/14/30 horizons", () => {
    assert.deepEqual([...CALENDAR_HORIZONS], [1, 7, 14, 30]);
    assert.deepEqual(resolveCalendarWindow({ horizon: 7, businessDate: "2026-09-23" }), {
      start: "2026-09-23",
      end: "2026-09-30",
      horizon: 7,
    });
    assert.deepEqual(
      resolveCalendarWindow({
        rangeStart: "2026-10-01",
        rangeEnd: "2026-10-15",
        horizon: 14,
        businessDate: "2026-09-23",
      }),
      { start: "2026-10-01", end: "2026-10-15", horizon: 14 },
    );
    assert.throws(
      () =>
        resolveCalendarWindow({
          rangeStart: "2026-09-23",
          rangeEnd: "2026-09-29",
          horizon: 7,
          businessDate: "2026-09-23",
        }),
      /exclusive/,
    );
    assert.match(source, /resolvePropertyBusinessDate/);
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  });

  it("uses departure-exclusive overlap and does not page the FO rack", () => {
    assert.equal(stayOverlapsCalendarWindow("2026-09-23", "2026-09-26", "2026-09-23", 7), true);
    assert.equal(stayOverlapsCalendarWindow("2026-09-22", "2026-09-23", "2026-09-23", 7), false);
    assert.equal(stayOverlapsCalendarWindow("2026-09-30", "2026-10-02", "2026-09-23", 7), false);
    assert.equal(stayOverlapsCalendarWindow("2026-09-29", "2026-09-30", "2026-09-23", 7), true);
    assert.equal(stayOverlapsRange("2026-09-22", "2026-09-23", "2026-09-23", 7), false);
    assert.match(source, /\.gt\("departure_date", rangeStart\)/);
    assert.match(source, /\.lt\("arrival_date", rangeEnd\)/);
    assert.doesNotMatch(source, /collectRackReservationPages|listReservations|listRoomRack/);
    assert.doesNotMatch(source, /pms_evaluate_room_assignment/);
  });

  it("validates mode, horizon, location filters, and status filters", () => {
    const parsed = calendarReadInputSchema.parse({
      restaurantId: "00000000-0000-4000-8000-000000000001",
      horizon: 7,
      mode: "room",
      building: "Main",
      floor: "2",
      wing: "East",
      statuses: ["pending", "confirmed"],
    });
    assert.equal(parsed.mode, "room");
    assert.throws(() =>
      calendarReadInputSchema.parse({
        restaurantId: "00000000-0000-4000-8000-000000000001",
        horizon: 3,
        mode: "room",
      }),
    );
    assert.throws(() =>
      calendarReadInputSchema.parse({
        restaurantId: "00000000-0000-4000-8000-000000000001",
        rangeStart: "2026-09-23",
        rangeEnd: "2026-09-23",
        horizon: 1,
        mode: "room_type",
      }),
    );
  });

  it("maps assigned bars without embedding Quick View and splits unassigned pending/confirmed demand", () => {
    const assigned = mapCalendarBar(summary());
    assert.equal(assigned.roomId, "room-1");
    assert.equal(assigned.guestVip, true);
    assert.equal(assigned.ratePlanName, "BAR");
    assert.deepEqual(assigned.exceptionKeys, []);
    assert.equal("financial" in assigned, false);

    const unassigned = mapCalendarBar(
      summary({ reservationId: "res-2", roomId: null, status: "pending" }),
    );
    assert.deepEqual(unassigned.exceptionKeys, ["unassigned"]);
    const cancelled = mapCalendarBar(summary({ roomId: null, status: "cancelled" }));
    assert.equal(cancelled.exceptionKeys.includes("unassigned"), false);
    assert.match(source, /bar\.status === "pending" \|\| bar\.status === "confirmed"/);
    assert.deepEqual([...CALENDAR_BAR_STATUSES], ["pending", "confirmed", "checked_in"]);
  });

  it("flags overlapping assignments on the same room without inventing lock schema", () => {
    const ids = assignmentOverlapIds([
      bar({ reservationId: "a", arrivalDate: "2026-09-23", departureDate: "2026-09-26" }),
      bar({ reservationId: "b", arrivalDate: "2026-09-25", departureDate: "2026-09-28" }),
      bar({
        reservationId: "c",
        roomId: "room-2",
        arrivalDate: "2026-09-23",
        departureDate: "2026-09-24",
      }),
    ]);
    assert.deepEqual([...ids].sort(), ["a", "b"]);
    assert.doesNotMatch(source, /calendar_lock|row_version|SELECT FOR UPDATE/);
  });

  it("reads rooms, HK/operational state, and sellable from hotel_rooms without a calendar table", () => {
    assert.match(source, /from\("hotel_rooms"\)/);
    assert.match(source, /housekeeping_status/);
    assert.match(source, /sellable/);
    assert.match(source, /occupiedNow/);
    assert.match(source, /from\("pms_operational_inventory_blocks"\)/);
    assert.match(source, /\.eq\("status", "active"\)/);
    assert.doesNotMatch(
      source,
      /reservation_calendar|calendar_reservations|reservation_calendar_days/,
    );
    assert.doesNotMatch(source, /moveReservationRoom|changeStayDates|checkInReservation/);
  });

  it("batches availability by room type through the inventory compat engine", () => {
    assert.match(source, /getRoomTypeAvailabilityCompat/);
    assert.doesNotMatch(source, /copied_availability|reservation_availability/);
    assert.equal(CALENDAR_AVAILABILITY_TYPE_CAP, 40);
    assert.equal(CALENDAR_RESERVATION_CAP, 1500);
    assert.equal(CALENDAR_BLOCK_CAP, 500);
    assert.match(source, /CALENDAR_RESERVATION_CAP \+ 1/);
    assert.match(source, /truncated/);
  });

  it("scopes every read to the restaurant and runs independent loads in parallel", () => {
    assert.match(source, /requireReservationManager/);
    assert.match(source, /\.eq\("restaurant_id", restaurantId\)/);
    assert.match(source, /\.eq\("id", data\.restaurantId\)/);
    assert.match(source, /Promise\.all\(\[\s*loadOccupiedNow/);
    assert.match(source, /loadAvailabilityOverlay/);
  });
});
