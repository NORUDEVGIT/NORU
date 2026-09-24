import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { FrontOfficeStay } from "../frontoffice.functions.ts";
import {
  arrivalCheckInHint,
  arrivalExceptionKeys,
  dailyControlTotals,
  departureCheckOutHint,
  departureExceptionKeys,
  mapArrivalRow,
  mapDepartureRow,
  stayRoomReady,
} from "./arrivals-departures.ts";
import { FINANCIAL_SIGNAL_BATCH_CAP } from "./shared-read-models.ts";
import type { LateCheckoutPolicy } from "./shared-read-models.ts";

const source = readFileSync(new URL("./arrivals-departures.server.ts", import.meta.url), "utf8");
const mapping = readFileSync(new URL("./arrivals-departures.ts", import.meta.url), "utf8");
const fo = readFileSync(new URL("../frontoffice.functions.ts", import.meta.url), "utf8");
const signals = readFileSync(new URL("../fo-exceptions.functions.ts", import.meta.url), "utf8");

const policy: LateCheckoutPolicy = {
  allowed: true,
  fee: 25,
  needsApproval: true,
  checkOutTime: "11:00",
};

function stay(overrides: Partial<FrontOfficeStay> = {}): FrontOfficeStay {
  return {
    id: "res-1",
    confirmationNumber: "NORU-2401",
    guestId: "guest-1",
    guestName: "Ada Lovelace",
    guestVip: false,
    guestPhone: "+44 20 0000 0000",
    guestEmail: "ada@example.test",
    roomTypeId: "type-1",
    roomTypeName: "Deluxe King",
    roomId: "room-1",
    roomNumber: "101",
    arrivalDate: "2026-09-23",
    departureDate: "2026-09-25",
    nights: 2,
    adults: 2,
    children: 0,
    status: "confirmed",
    specialRequests: null,
    source: "staff",
    guaranteeMethod: "card",
    overstay: false,
    walkInIncomplete: false,
    expectedArrivalAt: null,
    lateCheckoutGranted: false,
    lateCheckoutUntil: null,
    lateCheckoutNote: null,
    ...overrides,
  };
}

describe("DB-04I-04 Arrivals & Departures read model", () => {
  it("defaults to property business date and allows an explicit selected date", () => {
    assert.match(source, /resolvePropertyBusinessDate/);
    assert.match(source, /business_date, timezone/);
    assert.match(
      source,
      /data\.date \? assertDateOnly\(data\.date, "Operational date"\) : businessDate/,
    );
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
    assert.doesNotMatch(source, /propertyToday\(/);
  });

  it("wraps Front Office arrival and departure loaders instead of forking SQL", () => {
    assert.match(source, /loadFrontOfficeArrivals/);
    assert.match(source, /loadFrontOfficeDepartures/);
    assert.match(fo, /export async function loadFrontOfficeArrivals/);
    assert.match(fo, /export async function loadFrontOfficeDepartures/);
    assert.match(
      fo,
      /\.in\("status", data\.status \? \[data\.status\] : \["pending", "confirmed"\]\)/,
    );
    assert.match(fo, /\.eq\("arrival_date", date\)/);
    assert.match(fo, /\.in\("status", \["confirmed", "checked_in"\]\)/);
    assert.match(fo, /\.eq\("status", "checked_in"\)[\s\S]*\.lt\("departure_date", date\)/);
    assert.doesNotMatch(source, /from\("hotel_reservations"\)/);
    assert.doesNotMatch(source, /checkInReservation|checkOutReservation|markNoShow|moveRoom/);
    assert.match(fo, /expected_arrival_at, late_checkout_granted, late_checkout_until, late_checkout_note/);
  });

  it("keeps same-day checked-in stays out of the live arrival queue", () => {
    assert.match(fo, /loadFrontOfficeArrivals[\s\S]*\["pending", "confirmed"\]/);
    assert.doesNotMatch(
      fo.slice(
        fo.indexOf("export async function loadFrontOfficeArrivals"),
        fo.indexOf("export const listArrivals"),
      ),
      /checked_in/,
    );
  });

  it("maps pending, confirmed, unassigned, assigned, VIP, and walk-in progress", () => {
    const pendingUnassigned = mapArrivalRow({
      stay: stay({
        status: "pending",
        roomId: null,
        roomNumber: null,
        guestVip: true,
        walkInIncomplete: true,
      }),
      room: undefined,
      folioLane: "live",
      signal: undefined,
    });
    assert.equal(pendingUnassigned.stay.status, "pending");
    assert.equal(pendingUnassigned.guest.vip, true);
    assert.equal(pendingUnassigned.room.assigned, false);
    assert.equal(pendingUnassigned.operational.unassigned, true);
    assert.equal(pendingUnassigned.operational.walkInIncomplete, true);
    assert.ok(pendingUnassigned.operational.exceptionKeys.includes("unassigned"));
    assert.equal(pendingUnassigned.hints.canAssignRoom, true);
    assert.equal(pendingUnassigned.hints.canCheckIn, false);
    assert.equal(pendingUnassigned.hints.canUpdateEta, true);
    assert.equal(pendingUnassigned.hints.canViewGuest, true);

    const confirmedAssigned = mapArrivalRow({
      stay: stay({ status: "confirmed", expectedArrivalAt: "2026-09-23T18:00:00.000Z" }),
      room: { operationalStatus: "available", housekeepingStatus: "clean" },
      folioLane: "live",
      signal: undefined,
    });
    assert.equal(confirmedAssigned.stay.status, "confirmed");
    assert.equal(confirmedAssigned.room.assigned, true);
    assert.equal(confirmedAssigned.room.ready, true);
    assert.equal(confirmedAssigned.hints.canCheckIn, true);
    assert.equal(confirmedAssigned.operational.expectedArrivalTime, "2026-09-23T18:00:00.000Z");
  });

  it("uses Housekeeping/Inventory readiness without inventing a Reservation ready state", () => {
    assert.equal(stayRoomReady(null, undefined), false);
    assert.equal(
      stayRoomReady("room-1", { operationalStatus: "available", housekeepingStatus: "clean" }),
      true,
    );
    assert.equal(
      stayRoomReady("room-1", { operationalStatus: "available", housekeepingStatus: "inspected" }),
      true,
    );
    assert.equal(
      stayRoomReady("room-1", { operationalStatus: "available", housekeepingStatus: "dirty" }),
      false,
    );
    assert.equal(
      stayRoomReady("room-1", { operationalStatus: "out_of_order", housekeepingStatus: "clean" }),
      false,
    );
    assert.match(mapping, /isRoomReady/);
    assert.doesNotMatch(source, /pms_evaluate_room_assignment/);
    assert.deepEqual(
      arrivalExceptionKeys({
        status: "confirmed",
        roomId: "room-1",
        operationalStatus: "available",
        housekeepingStatus: "dirty",
        ready: false,
        financialState: "available",
        depositUnpaid: false,
        outstandingBalance: false,
        specialRequests: null,
      }),
      ["room_not_ready"],
    );
    assert.deepEqual(
      arrivalExceptionKeys({
        status: "confirmed",
        roomId: "room-1",
        operationalStatus: "out_of_service",
        housekeepingStatus: "clean",
        ready: false,
        financialState: "available",
        depositUnpaid: false,
        outstandingBalance: false,
        specialRequests: null,
      }),
      ["room_unavailable"],
    );
    assert.ok(
      arrivalExceptionKeys({
        status: "confirmed",
        roomId: "room-1",
        operationalStatus: "available",
        housekeepingStatus: "clean",
        ready: true,
        financialState: "available",
        depositUnpaid: false,
        outstandingBalance: false,
        specialRequests: "Late vegetarian dinner",
      }).includes("special_request"),
    );
  });

  it("maps due-today and overstay departures and excludes checkout from the hint unless checked_in", () => {
    const dueToday = mapDepartureRow({
      stay: stay({ status: "checked_in", overstay: false }),
      room: { operationalStatus: "available", housekeepingStatus: "dirty" },
      folioLane: "live",
      signal: undefined,
      policy,
    });
    assert.equal(dueToday.stay.overstay, false);
    assert.equal(dueToday.stay.inHouse, true);
    assert.equal(dueToday.hints.canCheckOut, true);
    assert.equal(dueToday.hints.canExtendStay, true);
    assert.equal(dueToday.hints.canGrantLateCheckout, true);
    assert.equal(dueToday.room.roomTypeName, "Deluxe King");

    const overdue = mapDepartureRow({
      stay: stay({
        status: "checked_in",
        departureDate: "2026-09-22",
        overstay: true,
      }),
      room: undefined,
      folioLane: "live",
      signal: undefined,
      policy,
    });
    assert.equal(overdue.stay.overstay, true);
    assert.ok(overdue.operational.exceptionKeys.includes("overstay"));

    const late = mapDepartureRow({
      stay: stay({
        status: "checked_in",
        lateCheckoutGranted: true,
        lateCheckoutUntil: "2026-09-25T16:00:00.000Z",
        lateCheckoutNote: "Flight at 20:00",
      }),
      room: undefined,
      folioLane: "live",
      signal: undefined,
      policy,
    });
    assert.equal(late.operational.lateCheckout.granted, true);
    assert.equal(late.operational.lateCheckout.until, "2026-09-25T16:00:00.000Z");
    assert.equal(late.operational.lateCheckout.policy?.fee, 25);

    assert.equal(departureCheckOutHint("checked_in"), true);
    assert.equal(departureCheckOutHint("confirmed"), false);
    assert.equal(departureCheckOutHint("checked_out"), false);
    assert.match(fo, /checked_out/);
    assert.doesNotMatch(
      fo.slice(
        fo.indexOf("export async function loadFrontOfficeDepartures"),
        fo.indexOf("export const listDepartures"),
      ),
      /checked_out/,
    );
  });

  it("batches financial signals once and degrades permission without failing the read", () => {
    assert.match(source, /loadFoStaySignals/);
    assert.match(source, /FINANCIAL_SIGNAL_BATCH_CAP/);
    assert.match(signals, /export async function loadFoStaySignals/);
    assert.match(signals, /reservationIds: z\.array\(idSchema\)\.max\(200\)/);
    assert.equal(FINANCIAL_SIGNAL_BATCH_CAP, 200);
    assert.match(source, /financialIds\.slice\(0, FINANCIAL_SIGNAL_BATCH_CAP\)/);
    assert.doesNotMatch(source, /loadQuickViewFinancial/);
    assert.doesNotMatch(source, /getReservationQuickView/);

    const denied = mapArrivalRow({
      stay: stay(),
      room: { operationalStatus: "available", housekeepingStatus: "clean" },
      folioLane: "permission_denied",
      signal: {
        folioId: "folio-1",
        folioNumber: "F-1",
        balance: 40,
        depositPosted: 0,
        depositWaived: false,
        checkoutOverride: false,
        keyIssued: false,
        keyWaived: false,
      },
    });
    assert.equal(denied.financial.state, "permission_denied");
    assert.equal(denied.financial.folioId, null);
    assert.equal(denied.hints.canOpenFolio, false);

    const none = mapArrivalRow({
      stay: stay(),
      room: { operationalStatus: "available", housekeepingStatus: "clean" },
      folioLane: "live",
      signal: undefined,
    });
    assert.equal(none.financial.state, "available");
    assert.equal(none.financial.folioId, null);
    assert.equal(none.financial.balance, null);

    const live = mapDepartureRow({
      stay: stay({ status: "checked_in" }),
      room: undefined,
      folioLane: "live",
      signal: {
        folioId: "folio-2",
        folioNumber: "F-2",
        balance: 125.5,
        depositPosted: 50,
        depositWaived: false,
        checkoutOverride: false,
        keyIssued: false,
        keyWaived: false,
      },
      policy,
    });
    assert.equal(live.financial.state, "available");
    assert.equal(live.financial.balance, 125.5);
    assert.equal(live.financial.depositPosted, 50);
    assert.ok(live.operational.exceptionKeys.includes("payment_issue"));
  });

  it("keeps check-in hints conservative and checkout hints stay-state only", () => {
    assert.equal(arrivalCheckInHint({ status: "pending", assigned: true, ready: true }), false);
    assert.equal(arrivalCheckInHint({ status: "confirmed", assigned: false, ready: true }), false);
    assert.equal(arrivalCheckInHint({ status: "confirmed", assigned: true, ready: false }), false);
    assert.equal(arrivalCheckInHint({ status: "confirmed", assigned: true, ready: true }), true);
    assert.equal(arrivalCheckInHint({ status: "checked_in", assigned: true, ready: true }), false);
  });

  it("reads persisted ETA and late checkout without inventing values", () => {
    const arrival = mapArrivalRow({
      stay: stay({ expectedArrivalAt: null }),
      room: undefined,
      folioLane: "coming_soon",
      signal: undefined,
    });
    const departure = mapDepartureRow({
      stay: stay({ status: "checked_in", lateCheckoutGranted: false }),
      room: undefined,
      folioLane: "coming_soon",
      signal: undefined,
      policy: { ...policy, allowed: false },
    });
    assert.equal(arrival.operational.expectedArrivalTime, null);
    assert.equal(departure.operational.lateCheckout.granted, false);
    assert.equal(departure.hints.canGrantLateCheckout, false);
    assert.doesNotMatch(mapping, /etaMinutes/);
  });

  it("derives daily control counts and leaves checked-in/out today unsupported", () => {
    const arrivals = [
      mapArrivalRow({
        stay: stay({ id: "a1", roomId: null, roomNumber: null }),
        room: undefined,
        folioLane: "live",
        signal: undefined,
      }),
      mapArrivalRow({
        stay: stay({ id: "a2" }),
        room: { operationalStatus: "available", housekeepingStatus: "dirty" },
        folioLane: "live",
        signal: undefined,
      }),
    ];
    const departures = [
      mapDepartureRow({
        stay: stay({ id: "d1", status: "checked_in", overstay: true }),
        room: undefined,
        folioLane: "live",
        signal: {
          folioId: "folio-2",
          folioNumber: "F-2",
          balance: 40,
          depositPosted: 10,
          depositWaived: false,
          checkoutOverride: false,
          keyIssued: false,
          keyWaived: false,
        },
        policy,
      }),
    ];
    const totals = dailyControlTotals(arrivals, departures);
    assert.equal(totals.arrivals, 2);
    assert.equal(totals.departures, 1);
    assert.equal(totals.unassignedArrivals, 1);
    assert.equal(totals.notReadyArrivals, 1);
    assert.equal(totals.overstays, 1);
    assert.equal(totals.departurePaymentIssues, 1);
    assert.equal(totals.checkedInToday, null);
    assert.equal(totals.checkedOutToday, null);
    assert.match(source, /checkedInOutToday: true/);
    assert.doesNotMatch(source, /checkedInToday: 0/);
  });

  it("scopes every workspace read to the restaurant and batches rooms once", () => {
    assert.match(source, /requireReservationManager/);
    assert.match(source, /\.eq\("id", data\.restaurantId\)/);
    assert.match(source, /loadRoomInventory/);
    assert.match(source, /\.from\("hotel_rooms"\)/);
    assert.match(source, /\.eq\("restaurant_id", restaurantId\)/);
    assert.match(source, /Promise\.all\(\[\s*loadFrontOfficeArrivals/);
    assert.match(source, /Promise\.all\(\[\s*loadRoomInventory/);
  });

  it("documents bounded unpaginated daily queues", () => {
    assert.match(source, /daily_operational_queues/);
    assert.match(source, /hasMore: false/);
    assert.match(source, /vip: z\.boolean\(\)\.optional\(\)/);
    assert.match(source, /assignment: z\.enum\(\["assigned", "unassigned"\]\)/);
    assert.match(source, /arrivalStatus: z\.enum\(\["pending", "confirmed"\]\)/);
    assert.match(source, /overstay: z\.boolean\(\)\.optional\(\)/);
    assert.match(source, /departureStatus: z\.enum\(\["confirmed", "checked_in"\]\)/);
  });

  it("reuses FO exception keys and does not load the exceptions engine", () => {
    assert.deepEqual(
      departureExceptionKeys({
        overstay: true,
        financialState: "available",
        outstandingBalance: true,
      }),
      ["overstay", "payment_issue"],
    );
    assert.doesNotMatch(source, /listExceptionFeed|buildExceptionRows|getFrontOfficeExceptions/);
  });
});
