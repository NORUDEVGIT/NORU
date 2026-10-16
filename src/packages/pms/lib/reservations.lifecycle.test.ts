import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BOOKING_STATUS_TRANSITIONS,
  MANUAL_RESERVATION_STATUSES,
  RESERVATION_STATUSES,
  isAllowedBookingStatusTransition,
} from "./reservation-dates.ts";
import { assertBookingStatusTransition, reservationError } from "./reservations.server.ts";

const functions = readFileSync(new URL("./reservations.functions.ts", import.meta.url), "utf8");
const fo = readFileSync(new URL("./frontoffice.functions.ts", import.meta.url), "utf8");
const checkIn = readFileSync(new URL("./fo-check-in.functions.ts", import.meta.url), "utf8");
const checkOut = readFileSync(new URL("./fo-check-out.functions.ts", import.meta.url), "utf8");
const cancelNoShow = readFileSync(new URL("./fo-cancel-noshow.functions.ts", import.meta.url), "utf8");

const statusHandler = functions.slice(
  functions.indexOf("export const setReservationStatus"),
  functions.indexOf("export const getBookingsDashboard"),
);

describe("DB03-B01 booking-status allowlist", () => {
  it("locks the explicit booking-side matrix", () => {
    assert.deepEqual([...MANUAL_RESERVATION_STATUSES], ["pending", "confirmed", "cancelled"]);
    assert.deepEqual([...BOOKING_STATUS_TRANSITIONS.pending], ["confirmed", "cancelled"]);
    assert.deepEqual([...BOOKING_STATUS_TRANSITIONS.confirmed], ["cancelled"]);
    assert.deepEqual([...BOOKING_STATUS_TRANSITIONS.cancelled], ["pending", "confirmed"]);
    assert.deepEqual([...RESERVATION_STATUSES], [
      "pending",
      "confirmed",
      "cancelled",
      "checked_in",
      "checked_out",
      "no_show",
    ]);
  });

  it("allows booking-side transitions", () => {
    assert.equal(isAllowedBookingStatusTransition("pending", "confirmed"), true);
    assert.equal(isAllowedBookingStatusTransition("pending", "cancelled"), true);
    assert.equal(isAllowedBookingStatusTransition("confirmed", "cancelled"), true);
    assert.equal(isAllowedBookingStatusTransition("cancelled", "pending"), true);
    assert.equal(isAllowedBookingStatusTransition("cancelled", "confirmed"), true);
  });

  it("treats same-status as a no-op, not a mutation", () => {
    for (const status of RESERVATION_STATUSES) {
      assert.equal(isAllowedBookingStatusTransition(status, status), true);
      assert.doesNotThrow(() => assertBookingStatusTransition(status, status));
    }
  });

  it("rejects confirmed → pending (not a booking restore)", () => {
    assert.equal(isAllowedBookingStatusTransition("confirmed", "pending"), false);
    assert.throws(
      () => assertBookingStatusTransition("confirmed", "pending"),
      (err: unknown) => err instanceof Error && err.message === reservationError("INVALID_TRANSITION").message,
    );
  });

  it("rejects Front Office stay states as generic sources", () => {
    const sources = ["checked_in", "checked_out", "no_show"] as const;
    const targets = ["pending", "confirmed", "cancelled"] as const;
    for (const from of sources) {
      for (const to of targets) {
        assert.equal(isAllowedBookingStatusTransition(from, to), false);
        assert.throws(
          () => assertBookingStatusTransition(from, to),
          (err: unknown) =>
            err instanceof Error && err.message === reservationError("INVALID_TRANSITION").message,
        );
      }
    }
  });

  it("uses INVALID_TRANSITION copy without leaking internals", () => {
    assert.equal(
      reservationError("INVALID_TRANSITION").message,
      "That action isn't allowed for this reservation's current status.",
    );
    assert.doesNotMatch(reservationError("INVALID_TRANSITION").message, /allowlist|RPC|checked_in/);
  });

  it("setReservationStatus guards before capacity, update, and history", () => {
    assert.match(statusHandler, /assertBookingStatusTransition\(existing\.status, data\.status\)/);
    const guardIdx = statusHandler.indexOf("assertBookingStatusTransition(existing.status, data.status)");
    const capacityIdx = statusHandler.indexOf("assert_reservation_capacity");
    const updateIdx = statusHandler.indexOf(".update({");
    const historyIdx = statusHandler.indexOf("recordReservationEvent");
    assert.ok(guardIdx >= 0);
    assert.ok(guardIdx < capacityIdx);
    assert.ok(guardIdx < updateIdx);
    assert.ok(guardIdx < historyIdx);
    assert.match(statusHandler, /existing\.status === data\.status/);
    assert.match(
      statusHandler,
      /if \(existing\.status === "cancelled"\)[\s\S]*assert_reservation_capacity/,
    );
  });

  it("does not weaken cancelled restore capacity re-check", () => {
    assert.match(statusHandler, /Restoring a cancelled reservation has to win a capacity check again/);
    assert.match(statusHandler, /assert_reservation_capacity/);
  });

  it("does not call Front Office lifecycle RPCs from the generic writer", () => {
    assert.doesNotMatch(statusHandler, /check_in_hotel_reservation/);
    assert.doesNotMatch(statusHandler, /check_out_hotel_reservation/);
    assert.doesNotMatch(statusHandler, /mark_hotel_reservation_no_show/);
  });

  it("Front Office dedicated RPCs remain the stay-state writers", () => {
    assert.match(fo, /check_in_hotel_reservation/);
    assert.match(fo, /check_out_hotel_reservation/);
    assert.match(fo, /mark_hotel_reservation_no_show/);
    assert.match(checkIn, /check_in_hotel_reservation/);
    assert.match(checkOut, /check_out_hotel_reservation/);
    assert.match(cancelNoShow, /mark_hotel_reservation_no_show/);
    assert.match(cancelNoShow, /room_id: null/);
    assert.match(functions, /export const copyReservation/);
    assert.match(functions, /roomId: null/);
  });
});
