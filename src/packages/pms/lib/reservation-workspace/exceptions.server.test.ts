import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

import { deriveExceptionRows } from "../fo-exceptions.ts";
import type { FrontOfficeStay } from "../frontoffice.functions.ts";
import {
  applyExceptionFilters,
  dedupeExceptionItems,
  deriveAssignmentOverlapItems,
  deriveMissingContactItems,
  deriveMissingRateItems,
  deriveOperationalBlockItems,
  deriveRoomNotReadyItems,
  exceptionIdentity,
  exceptionTotals,
  isBlockingException,
  mapFoExceptionRow,
  staysOverlapExclusive,
} from "./exceptions.server.ts";
import type { ReservationExceptionItem } from "./shared-read-models.ts";

const source = readFileSync(new URL("./exceptions.server.ts", import.meta.url), "utf8");
const foFns = readFileSync(new URL("../fo-exceptions.functions.ts", import.meta.url), "utf8");

function stay(overrides: Partial<FrontOfficeStay> = {}): FrontOfficeStay {
  return {
    id: "res-1",
    confirmationNumber: "NORU-2401",
    guestId: "guest-1",
    guestName: "Ada Lovelace",
    guestVip: true,
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
    overstay: false,
    walkInIncomplete: false,
    ...overrides,
  };
}

function item(overrides: Partial<ReservationExceptionItem> = {}): ReservationExceptionItem {
  return {
    key: "unassigned",
    severity: "standard",
    blocking: false,
    reservationId: "res-1",
    confirmationNumber: "NORU-2401",
    guest: { id: "guest-1", name: "Ada Lovelace", vip: false, phone: null, email: null },
    stay: { arrivalDate: "2026-09-23", departureDate: "2026-09-25", status: "pending" },
    room: null,
    financial: {
      state: "not_available",
      folioId: null,
      balance: null,
      depositPosted: null,
      depositWaived: null,
    },
    sourceModule: "reservation",
    responsibleModule: "reservation",
    summary: "Arrival has no room assigned.",
    actionTarget: "assign_room",
    detectedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("DB-04I-06 Reservation Exceptions / Control read model", () => {
  it("reuses FO live exception derivation and stay/feed loaders", () => {
    assert.match(source, /deriveExceptionRows/);
    assert.match(source, /loadFoExceptionFeeds/);
    assert.match(source, /loadFoStaySignals/);
    assert.match(source, /loadFrontOfficeArrivals/);
    assert.match(source, /loadFrontOfficeInHouse/);
    assert.match(source, /loadFrontOfficeDepartures/);
    assert.match(foFns, /export async function loadFoExceptionFeeds/);
    const { rows } = deriveExceptionRows({
      arrivals: [
        {
          id: "res-1",
          confirmationNumber: "NORU-2401",
          guestName: "Ada",
          roomId: null,
          roomNumber: null,
          arrivalDate: "2026-09-23",
          departureDate: "2026-09-25",
          status: "confirmed",
          overstay: false,
        },
      ],
      inHouse: [],
      departures: [],
      rooms: [],
      folioLane: "live",
      businessDate: "2026-09-23",
    });
    assert.equal(rows[0]?.type, "unassigned");
  });

  it("uses property business date and FO operational scope, not history", () => {
    assert.match(source, /resolvePropertyBusinessDate/);
    assert.match(source, /date: businessDate/);
    assert.match(source, /today: businessDate/);
    assert.doesNotMatch(source, /from\("hotel_reservation_history"\)/);
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  });

  it("upgrades confirmed unassigned to high/blocking and keeps pending standard", () => {
    assert.equal(isBlockingException("unassigned", "confirmed"), true);
    assert.equal(isBlockingException("unassigned", "pending"), false);
    const confirmed = mapFoExceptionRow(
      {
        id: "unassigned:res-1",
        type: "unassigned",
        label: "Unassigned",
        severity: "standard",
        reason: "Arrival has no room assigned.",
        stayId: "res-1",
        guestName: "Ada",
        confirmationNumber: "NORU-2401",
        roomNumber: null,
        arrivalDate: "2026-09-23",
        departureDate: "2026-09-25",
        ageDays: null,
        primaryCta: { id: "assign", label: "Assign room" },
        secondary: "sheet",
        waived: false,
      },
      stay({ roomId: null, roomNumber: null, status: "confirmed" }),
      "t",
    );
    assert.equal(confirmed.severity, "high");
    assert.equal(confirmed.blocking, true);
    assert.equal(confirmed.actionTarget, "assign_room");
    const pending = mapFoExceptionRow(
      {
        id: "unassigned:res-2",
        type: "unassigned",
        label: "Unassigned",
        severity: "standard",
        reason: "Arrival has no room assigned.",
        stayId: "res-2",
        guestName: "Ada",
        confirmationNumber: "NORU-2402",
        roomNumber: null,
        arrivalDate: "2026-09-23",
        departureDate: "2026-09-25",
        ageDays: null,
        primaryCta: { id: "assign", label: "Assign room" },
        secondary: "sheet",
        waived: false,
      },
      stay({ id: "res-2", roomId: null, status: "pending" }),
      "t",
    );
    assert.equal(pending.severity, "standard");
    assert.equal(pending.blocking, false);
  });

  it("deduplicates reservationId + key and prefers the high-severity source", () => {
    assert.equal(
      exceptionIdentity({ key: "unassigned", reservationId: "res-1" }),
      "res-1:unassigned:",
    );
    const deduped = dedupeExceptionItems([
      item({ severity: "standard" }),
      item({ severity: "high", blocking: true, summary: "preferred" }),
    ]);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]?.summary, "preferred");
  });

  it("flags missing rate snapshot only for confirmed stays", () => {
    const pricing = new Map([
      ["res-1", { ratePlanId: null, roomSubtotal: null }],
      ["res-2", { ratePlanId: "rate-1", roomSubtotal: 120 }],
    ]);
    const flagged = deriveMissingRateItems(
      [stay({ status: "confirmed" }), stay({ id: "res-2", status: "pending" })],
      pricing,
      "t",
    );
    assert.equal(flagged.length, 1);
    assert.equal(flagged[0]?.key, "missing_rate_snapshot");
    assert.equal(flagged[0]?.blocking, false);
  });

  it("derives HK not-ready on arrivals and skips OOO as unavailable instead", () => {
    const rooms = new Map([
      [
        "room-1",
        {
          id: "room-1",
          status: "available",
          housekeepingStatus: "dirty",
          active: true,
          roomNumber: "101",
          roomTypeId: "type-1",
        },
      ],
      [
        "room-2",
        {
          id: "room-2",
          status: "out_of_order",
          housekeepingStatus: "clean",
          active: true,
          roomNumber: "102",
          roomTypeId: "type-1",
        },
      ],
    ]);
    const items = deriveRoomNotReadyItems(
      [stay(), stay({ id: "res-2", roomId: "room-2", roomNumber: "102" })],
      rooms,
      "t",
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]?.key, "room_not_ready");
    assert.equal(items[0]?.sourceModule, "housekeeping");
  });

  it("detects overlapping operational blocks without per-stay queries", () => {
    assert.equal(
      staysOverlapExclusive("2026-09-23", "2026-09-25", "2026-09-24", "2026-09-26"),
      true,
    );
    assert.equal(
      staysOverlapExclusive("2026-09-23", "2026-09-24", "2026-09-24", "2026-09-26"),
      false,
    );
    const items = deriveOperationalBlockItems(
      [stay()],
      [
        {
          id: "block-1",
          targetKind: "room",
          roomId: "room-1",
          roomTypeId: "type-1",
          startDate: "2026-09-23",
          endDate: "2026-09-24",
          blockType: "ooo",
          status: "active",
          reason: "works",
        },
      ],
      "t",
    );
    assert.equal(items[0]?.key, "operational_block");
    assert.equal(items[0]?.blocking, true);
  });

  it("keeps payment issues high/blocking and degrades finance without failing the read", () => {
    assert.equal(isBlockingException("payment_issue", "confirmed"), true);
    assert.match(source, /financial_signals_unavailable/);
    assert.match(source, /folioLane === "permission_denied"/);
    assert.doesNotMatch(source, /getReservationQuickView|loadQuickViewFinancial/);
  });

  it("maps overstay to Front Office checkout and excludes cancelled/checked-out from extra detectors", () => {
    assert.equal(isBlockingException("overstay", "checked_in"), true);
    const contact = deriveMissingContactItems(
      [
        stay({ guestPhone: null, guestEmail: null }),
        stay({ id: "res-x", status: "checked_out", guestPhone: null, guestEmail: null }),
      ],
      "t",
    );
    assert.equal(contact.length, 1);
    assert.equal(contact[0]?.sourceModule, "guest");
    assert.equal(contact[0]?.blocking, false);
  });

  it("derives assignment overlap from exclusive stay dates on the same room", () => {
    const items = deriveAssignmentOverlapItems(
      [
        stay({ id: "res-1", roomId: "room-1", arrivalDate: "2026-09-23", departureDate: "2026-09-25" }),
        stay({ id: "res-2", roomId: "room-1", arrivalDate: "2026-09-24", departureDate: "2026-09-26" }),
        stay({ id: "res-3", roomId: "room-1", arrivalDate: "2026-09-25", departureDate: "2026-09-27" }),
      ],
      "t",
    );
    assert.equal(items.length, 3);
    assert.ok(items.every((row) => row.key === "assignment_overlap"));
    assert.ok(items.every((row) => row.blocking));
    assert.equal(items[0]?.actionTarget, "open_room_rack");
  });

  it("filters by severity, source, responsible module and key, and totals from the bounded set", () => {
    const rows = [
      item({ key: "unassigned", severity: "standard", sourceModule: "reservation" }),
      item({
        key: "overstay",
        reservationId: "res-2",
        severity: "high",
        blocking: true,
        sourceModule: "front_office",
        responsibleModule: "front_office",
        stay: { arrivalDate: "2026-09-20", departureDate: "2026-09-22", status: "checked_in" },
      }),
    ];
    const high = applyExceptionFilters(rows, {
      severity: "high",
      sourceModule: null,
      responsibleModule: null,
      key: null,
      status: null,
    });
    assert.equal(high.length, 1);
    assert.equal(high[0]?.key, "overstay");
    const totals = exceptionTotals(rows, true);
    assert.equal(totals.total, 2);
    assert.equal(totals.high, 1);
    assert.equal(totals.blocking, 1);
  });

  it("does not persist exceptions, invent guarantee errors, or add writes", () => {
    assert.match(source, /requireReservationManager/);
    assert.match(source, /\.eq\("restaurant_id", restaurantId\)/);
    assert.doesNotMatch(
      source,
      /reservation_exceptions|exception_queue|reservation_alerts|reservation_control_items/,
    );
    assert.doesNotMatch(source, /guaranteeMethod|commercial_booking_source/);
    assert.doesNotMatch(source, /insert\(|upsert\(|checkInReservation|auto-assign/);
    assert.match(source, /deriveAssignmentOverlapItems/);
    assert.match(source, /attachExceptionFinancial/);
    assert.match(source, /RESERVATION_EXCEPTION_ITEM_CAP/);
    assert.match(source, /overbooking_feed_truncated/);
  });
});
