import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { attachListRoomUnits, type ListUnitClient } from "./reservations.functions";
import type { ReservationDetail } from "./reservations.functions";

/**
 * FO-GR01B: the Room Rack read path (`listReservations({ includeRoomUnits: true })`)
 * must attach each room unit's own occupant, the same `hotel_reservation_room_guests`
 * relation `getReservation` already uses, not leave it hardcoded empty.
 */

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>): ListUnitClient {
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_column: string, _value: string) {
              return {
                in(column: string, values: string[]) {
                  const rows = (tables[table] ?? []).filter((row) =>
                    values.includes(String(row[column])),
                  );
                  return {
                    order(_col: string, _opts: { ascending: boolean }) {
                      return Promise.resolve({ data: rows, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function reservation(id: string, guestId: string, guestName: string): ReservationDetail {
  return {
    id,
    confirmationNumber: "NR-000030",
    guestId,
    guestName,
    guestPhone: "+251900000000",
    guestEmail: null,
    guestVip: false,
    roomTypeId: "type-1",
    roomTypeName: "Suite",
    roomId: "room-401",
    roomNumber: "401",
    arrivalDate: "2026-10-23",
    departureDate: "2026-10-25",
    nights: 2,
    adults: 1,
    children: 0,
    status: "confirmed",
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
    ratePlanId: null,
    currency: "ETB",
    roomSubtotal: null,
    nightlyRates: [],
    pricedAt: null,
  } as unknown as ReservationDetail;
}

describe("FO-GR01B Room Rack occupant attachment", () => {
  it("attaches each unit's own primary occupant instead of leaving occupants empty", async () => {
    const db = fakeDb({
      hotel_reservation_rooms: [
        {
          id: "unit-a",
          reservation_id: "res-1",
          unit_sequence: 1,
          room_type_id: "type-1",
          room_id: "room-401",
          arrival_date: "2026-10-23",
          departure_date: "2026-10-25",
          adults: 1,
          children: 0,
          infants: 0,
          rate_plan_id: null,
          currency: "ETB",
          nightly_rate_snapshot: [],
          room_subtotal: null,
          priced_at: null,
          status: "checked_in",
        },
        {
          id: "unit-b",
          reservation_id: "res-1",
          unit_sequence: 2,
          room_type_id: "type-1",
          room_id: "room-101a",
          arrival_date: "2026-10-23",
          departure_date: "2026-10-25",
          adults: 1,
          children: 0,
          infants: 0,
          rate_plan_id: null,
          currency: "ETB",
          nightly_rate_snapshot: [],
          room_subtotal: null,
          priced_at: null,
          status: "confirmed",
        },
      ],
      hotel_rooms: [
        { id: "room-401", room_number: "401" },
        { id: "room-101a", room_number: "101A" },
      ],
      hotel_reservation_room_guests: [
        { reservation_room_id: "unit-a", guest_id: "guest-test", is_primary: true },
        { reservation_room_id: "unit-b", guest_id: "guest-aker", is_primary: true },
      ],
      guest_profiles: [
        { id: "guest-test", first_name: "Test", last_name: "Guest", phone: null },
        { id: "guest-aker", first_name: "Aker", last_name: "Girma", phone: "+251911" },
      ],
    });

    const [result] = await attachListRoomUnits(db, "restaurant-1", [
      reservation("res-1", "guest-test", "Test Guest"),
    ]);

    assert.equal(result?.rooms?.length, 2);
    const unitA = result?.rooms?.find((unit) => unit.id === "unit-a");
    const unitB = result?.rooms?.find((unit) => unit.id === "unit-b");
    assert.deepEqual(
      unitA?.occupants?.map((o) => [o.guestId, o.name, o.isPrimary]),
      [["guest-test", "Test Guest", true]],
    );
    assert.deepEqual(
      unitB?.occupants?.map((o) => [o.guestId, o.name, o.isPrimary]),
      [["guest-aker", "Aker Girma", true]],
    );
    // Unit B's occupant is never unit A's (or the header's) — no first-unit fallback.
    assert.notEqual(unitB?.occupants?.[0]?.guestId, unitA?.occupants?.[0]?.guestId);
    assert.notEqual(unitB?.occupants?.[0]?.guestId, result?.guestId);
  });

  it("keeps rooms empty-occupant when the relation has no rows for that unit", async () => {
    const db = fakeDb({
      hotel_reservation_rooms: [
        {
          id: "unit-only",
          reservation_id: "res-legacy",
          unit_sequence: 1,
          room_type_id: "type-1",
          room_id: "room-9",
          arrival_date: "2026-10-23",
          departure_date: "2026-10-25",
          adults: 1,
          children: 0,
          infants: 0,
          rate_plan_id: null,
          currency: "ETB",
          nightly_rate_snapshot: [],
          room_subtotal: null,
          priced_at: null,
          status: "confirmed",
        },
      ],
      hotel_rooms: [{ id: "room-9", room_number: "9" }],
      hotel_reservation_room_guests: [],
      guest_profiles: [],
    });

    const [result] = await attachListRoomUnits(db, "restaurant-1", [
      reservation("res-legacy", "guest-header", "Header Guest"),
    ]);
    assert.deepEqual(result?.rooms?.[0]?.occupants, []);
  });
});
