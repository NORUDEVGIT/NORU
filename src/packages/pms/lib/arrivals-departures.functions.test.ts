import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  assertEtaLifecycle,
  assertExpectedArrivalInstant,
  assertLateCheckoutUntil,
} from "./reservation-workspace/arrivals-departures.ts";

const functions = readFileSync(new URL("./arrivals-departures.functions.ts", import.meta.url), "utf8");
const migration = readFileSync(resolve("supabase/migrations/0098_pms_reservation_eta_late_checkout.sql"), "utf8");
const drizzle = readFileSync(resolve("drizzle/migrations/0098_pms_reservation_eta_late_checkout.sql"), "utf8");
const events = readFileSync(new URL("./reservations.server.ts", import.meta.url), "utf8");

describe("Phase 8A ETA and late checkout writers", () => {
  it("adds reservation columns without an arrivals table", () => {
    assert.equal(migration, drizzle);
    assert.match(migration, /expected_arrival_at timestamptz/);
    assert.match(migration, /late_checkout_granted boolean NOT NULL DEFAULT false/);
    assert.match(migration, /late_checkout_until timestamptz/);
    assert.match(migration, /late_checkout_note text/);
    assert.doesNotMatch(migration, /CREATE TABLE/);
  });

  it("records expected arrival history and blocks invalid lifecycle", () => {
    assert.match(functions, /export const setExpectedArrivalTime/);
    assert.match(functions, /export async function applyExpectedArrivalTime/);
    assert.match(functions, /eventType: "expected_arrival_updated"/);
    assert.match(events, /expected_arrival_updated/);
    assert.doesNotThrow(() => assertEtaLifecycle("pending"));
    assert.doesNotThrow(() => assertEtaLifecycle("confirmed"));
    assert.throws(() => assertEtaLifecycle("checked_in"), /before check-in/);
    assert.throws(() => assertEtaLifecycle("cancelled"), /before check-in/);
    assert.throws(() => assertEtaLifecycle("no_show"), /before check-in/);
    assert.equal(
      assertExpectedArrivalInstant({
        expectedArrivalAt: "2026-09-23T18:00:00.000Z",
        arrivalDate: "2026-09-23",
        timezone: "UTC",
      }),
      "2026-09-23T18:00:00.000Z",
    );
    assert.throws(
      () =>
        assertExpectedArrivalInstant({
          expectedArrivalAt: "2026-09-24T18:00:00.000Z",
          arrivalDate: "2026-09-23",
          timezone: "UTC",
        }),
      /arrival date/,
    );
  });

  it("grants same-day late checkout without changing departure date", () => {
    assert.match(functions, /export const setLateCheckout/);
    assert.match(functions, /eventType: "late_checkout_updated"/);
    assert.match(functions, /Late checkout is only available for in-house stays/);
    assert.match(functions, /Late checkout is not allowed by property policy/);
    assert.match(
      functions,
      /late_checkout_granted: params\.granted,\s*late_checkout_until: until,\s*late_checkout_note: note,/,
    );
    assert.doesNotMatch(
      functions.slice(
        functions.indexOf("late_checkout_granted: params.granted"),
        functions.indexOf("late_checkout_note: note,") + 30,
      ),
      /departure_date/,
    );
    assert.equal(
      assertLateCheckoutUntil({
        until: "2026-09-25T16:00:00.000Z",
        departureDate: "2026-09-25",
        checkOutTime: "11:00",
        timezone: "UTC",
      }),
      "2026-09-25T16:00:00.000Z",
    );
    assert.throws(
      () =>
        assertLateCheckoutUntil({
          until: "2026-09-25T10:00:00.000Z",
          departureDate: "2026-09-25",
          checkOutTime: "11:00",
          timezone: "UTC",
        }),
      /later than the property check-out time/,
    );
    assert.throws(
      () =>
        assertLateCheckoutUntil({
          until: "2026-09-26T16:00:00.000Z",
          departureDate: "2026-09-25",
          checkOutTime: "11:00",
          timezone: "UTC",
        }),
      /existing departure date/,
    );
  });

  it("loops the canonical ETA writer for bulk updates and reports partial failure", () => {
    assert.match(functions, /export const bulkSetExpectedArrivalTime/);
    assert.match(functions, /applyExpectedArrivalTime/);
    assert.match(functions, /failed\.push/);
    assert.doesNotMatch(functions, /checkInReservation|checkOutReservation|markNoShow/);
    assert.doesNotMatch(functions, /assignReservationRoom/);
  });
});
