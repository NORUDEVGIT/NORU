import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  attachRoomOccupants,
  projectReservationRoomUnits,
  type ReservationRoomMasterSlice,
  type ReservationRoomUnitRow,
} from "@/packages/pms/lib/reservation-room-units";

function read(name: string) {
  return readFileSync(resolve(process.cwd(), name), "utf8");
}

const master: ReservationRoomMasterSlice = {
  roomTypeId: "type-1",
  roomId: null,
  arrivalDate: "2026-11-01",
  departureDate: "2026-11-03",
  adults: 1,
  children: 0,
  infants: 0,
  ratePlanId: null,
  currency: "ETB",
  nightlyRates: [],
  roomSubtotal: null,
  pricedAt: null,
};

function unitRow(id: string, sequence: number): ReservationRoomUnitRow {
  return {
    id,
    unit_sequence: sequence,
    room_type_id: "type-1",
    room_id: null,
    arrival_date: "2026-11-01",
    departure_date: "2026-11-03",
    adults: 1,
    children: 0,
    infants: 0,
    rate_plan_id: null,
    currency: "ETB",
    nightly_rate_snapshot: [],
    room_subtotal: null,
    priced_at: null,
  };
}

describe("GROUP-RES-02 room occupants", () => {
  const migration = read("drizzle/migrations/0160_reservation_room_guests.sql");
  const migrationCopy = read("supabase/migrations/0160_reservation_room_guests.sql");
  const createFn = read("src/packages/pms/lib/reservations.functions.ts");
  const page = read("src/packages/pms/components/bookings/create-reservation-page.tsx");
  const plan = read("docs/pms/group-reservation-implementation-plan.md");
  const backfill = migration.slice(
    migration.indexOf("INSERT INTO public.hotel_reservation_room_guests ("),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.assign_reservation_room_guests"),
  );
  const assign = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.assign_reservation_room_guests"),
    migration.indexOf("DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced_commercial"),
  );
  const priced = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced("),
    migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced_commercial(",
    ),
  );
  const createBody = createFn.slice(
    createFn.indexOf("export const createReservation"),
    createFn.indexOf("export const copyReservation"),
  );

  it("creates the occupant table with same-property keys and one primary per room", () => {
    expect(migrationCopy).toBe(migration);
    expect(migration).toContain("CREATE TABLE public.hotel_reservation_room_guests");
    expect(migration).toContain("hotel_reservation_room_guests_guest_same_property");
    expect(migration).toContain("hotel_reservation_room_guests_reservation_same_property");
    expect(migration).toContain("hotel_reservation_room_guests_room_same_reservation");
    expect(migration).toContain("REFERENCES public.guest_profiles (id, restaurant_id)");
    expect(migration).toContain(
      "REFERENCES public.hotel_reservation_rooms (id, restaurant_id, reservation_id)",
    );
    expect(migration).toContain("CREATE UNIQUE INDEX hotel_reservation_room_guests_one_primary");
    expect(migration).toContain("WHERE is_primary");
    expect(migration).not.toContain("ALTER TABLE public.pms_group");
    expect(migration).not.toContain("DROP COLUMN");
  });

  it("backfills the lead guest onto unit 1 only", () => {
    expect(backfill).toContain("reservation.guest_id, true");
    expect(backfill).toContain("unit.unit_sequence = 1");
    expect(backfill).toContain("occupant.is_primary");
    expect(backfill).not.toContain("unit.unit_sequence > 1");
    expect(backfill).not.toContain("UPDATE public.hotel_reservations");
    expect(assign).not.toContain("UPDATE public.hotel_reservations");
    expect(assign).toContain("AND unit.unit_sequence = 1");
  });

  it("writes explicit occupants inside the create function and defaults unit 1 when omitted", () => {
    expect(priced).toContain(
      "PERFORM public.assign_reservation_room_guests(created.restaurant_id, created.id, _room_guest_assignments)",
    );
    expect(priced).toContain("_room_guest_assignments jsonb DEFAULT NULL");
    expect(priced.indexOf("PERFORM public.assign_reservation_room_guests")).toBeLessThan(
      priced.indexOf("RETURN created;"),
    );
    expect(createBody).toContain("roomGuestAssignments");
    expect(createBody).toContain("data.roomGuestAssignments");
    expect(createBody).toContain("_room_guest_assignments");
    expect(createBody).not.toContain('.from("hotel_reservation_room_guests")');
    expect(assign).toContain("RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND'");
    expect(assign).toContain("RAISE EXCEPTION 'GUEST_NOT_FOUND'");
    expect(assign).toContain("RAISE EXCEPTION 'ROOM_GUEST_PRIMARY_CONFLICT'");
  });

  it("exposes occupants on the room DTO and leaves the lead guest on the booking", () => {
    const units = attachRoomOccupants(projectReservationRoomUnits(master, [unitRow("room-1", 1)]), [
      {
        reservationRoomId: "room-1",
        guestId: "guest-2",
        name: "Sara Bekele",
        isPrimary: false,
      },
      {
        reservationRoomId: "room-1",
        guestId: "guest-1",
        name: "Abel Tesfaye",
        isPrimary: true,
      },
      {
        reservationRoomId: "room-2",
        guestId: "guest-9",
        name: "Other Guest",
        isPrimary: true,
      },
    ]);
    expect(units[0]?.occupants).toEqual([
      { guestId: "guest-1", name: "Abel Tesfaye", isPrimary: true },
      { guestId: "guest-2", name: "Sara Bekele", isPrimary: false },
    ]);
    expect(createFn).toContain('select("reservation_room_id, guest_id, is_primary")');
    expect(createFn).toContain('.from("guest_profiles")');
    expect(createFn).toContain("guestId: row.guest_id");
    expect(page).toContain("roomGuestAssignments");
    expect(page).toContain("reservation-type-selector");
    expect(page).toContain("CreateReservationRoomingList");
    expect(plan).toContain("| GROUP-RES-02 | PASS |");
    expect(plan).toContain("| GROUP-RES-04 | PASS WITH DEBT |");
    expect(plan).toContain("| GROUP-RES-05 | PASS WITH DEBT |");
    expect(plan).toContain("| GROUP-RES-06 | PASS WITH DEBT |");
    expect(plan).not.toContain("GROUP-RES-04 was started");
  });
});
