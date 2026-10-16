import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  additionalRoomOccupants,
  primaryRoomOccupant,
  roomOccupancyText,
  roomOccupantCapacity,
  roomOccupantsMutable,
  roomOperationActions,
  shouldShowRoomOccupantContext,
} from "@/packages/pms/lib/reservation-room-occupants";

function read(name: string) {
  return readFileSync(resolve(process.cwd(), name), "utf8");
}

describe("GROUP-RES-06 room occupant operations", () => {
  const migration = read("drizzle/migrations/0161_manage_reservation_room_guest.sql");
  const migrationCopy = read("supabase/migrations/0161_manage_reservation_room_guest.sql");
  const writer = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.manage_reservation_room_guest"),
    migration.indexOf("REVOKE ALL ON FUNCTION public.manage_reservation_room_guest"),
  );
  const functions = read("src/packages/pms/lib/reservations.functions.ts");
  const rooms = read(
    "src/packages/pms/components/workspaces/reservation-detail-room-occupants.tsx",
  );
  const roomsTab = read("src/packages/pms/components/workspaces/reservation-detail-rooms.tsx");
  const checkIn = read("src/packages/pms/lib/fo-check-in.functions.ts");
  const checkInUi = read("src/packages/pms/components/frontoffice/fo-check-in-stepper.tsx");
  const checkOutUi = read("src/packages/pms/components/frontoffice/fo-check-out-stepper.tsx");
  const dialogs = read("src/packages/pms/components/frontoffice/front-office-dialogs.tsx");
  const createPage = read("src/packages/pms/components/bookings/create-reservation-page.tsx");
  const stay08e = read("drizzle/migrations/0156_room_unit_front_office.sql");
  const plan = read("docs/pms/group-reservation-implementation-plan.md");
  const handler = functions.slice(
    functions.indexOf("export const manageReservationRoomGuest"),
    functions.indexOf("export const setReservationStatus"),
  );

  it("adds a same-property guest to the targeted room and rejects a duplicate", () => {
    expect(migrationCopy).toBe(migration);
    expect(writer).toContain("RAISE EXCEPTION 'GUEST_NOT_FOUND'");
    expect(writer).toContain("profile.restaurant_id = _restaurant_id");
    expect(writer).toContain("AND reservation_id = _reservation_id");
    expect(writer).toContain("RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND'");
    expect(writer).toContain("RAISE EXCEPTION 'ROOM_GUEST_DUPLICATE'");
    expect(writer).toContain("INSERT INTO public.hotel_reservation_room_guests");
    expect(handler).toContain('rpc("manage_reservation_room_guest"');
    expect(handler).toContain("requireReservationManager");
  });

  it("keeps one primary, changes it atomically, and does not delete the guest profile", () => {
    expect(read("drizzle/migrations/0160_reservation_room_guests.sql")).toContain(
      "CREATE UNIQUE INDEX hotel_reservation_room_guests_one_primary",
    );
    expect(writer.indexOf("SET is_primary = false")).toBeLessThan(
      writer.indexOf("SET is_primary = true"),
    );
    expect(writer).toContain("'room_primary_guest_changed'");
    expect(writer).toContain("RAISE EXCEPTION 'ROOM_GUEST_PRIMARY_REQUIRED'");
    expect(writer).toContain("DELETE FROM public.hotel_reservation_room_guests");
    expect(writer).not.toContain("DELETE FROM public.guest_profiles");
    expect(writer).not.toContain("UPDATE public.hotel_reservations");
    expect(writer).not.toContain("confirmation_number");
  });

  it("leaves booked occupancy unchanged and keeps historical occupants", () => {
    expect(writer).toContain("RAISE EXCEPTION 'OCCUPANT_CAPACITY'");
    expect(writer).toContain("unit.adults + unit.children");
    expect(writer).not.toContain("SET adults");
    expect(writer).toContain("RAISE EXCEPTION 'ROOM_GUEST_HISTORICAL'");
    expect(writer).toContain("'cancelled', 'checked_out', 'no_show'");
    expect(stay08e).not.toContain("hotel_reservation_room_guests");
    expect(writer).toContain("'room_guest_added'");
    expect(writer).toContain("'room_guest_removed'");
    expect(writer).toContain("'guest_id', _guest_id");
    expect(writer).not.toContain("first_name");
  });

  it("targets one room and leaves the folio and master rollup writers alone", () => {
    expect(writer).toContain("reservation_room_id = unit.id");
    expect(migration).not.toContain("open_folio_for_reservation");
    expect(migration).not.toContain("guest_folios");
    expect(migration).not.toContain("rollup_hotel_reservation_status");
    expect(stay08e).toContain("PERFORM public.open_folio_for_reservation");
    expect(stay08e).toContain("rollup_hotel_reservation_status");
    expect(checkIn).toContain("_reservation_room_id");
    expect(checkIn).not.toContain("hotel_reservation_rooms");
    expect(checkIn).not.toContain("manage_reservation_room_guest");
    expect(createPage).not.toContain("manageReservationRoomGuest");
  });

  it("shows room occupants on Reservation Detail without raw ids", () => {
    expect(rooms).toContain('data-testid="reservation-room-occupants"');
    expect(rooms).toContain("data-testid={`primary-occupant-${sequence}`}");
    expect(rooms).toContain("data-testid={`additional-occupant-${sequence}`}");
    expect(rooms).toContain("data-testid={`add-guest-${unit.unitSequence}`}");
    expect(rooms).toContain("data-testid={`change-primary-${sequence}`}");
    expect(rooms).toContain("data-testid={`remove-guest-${sequence}`}");
    expect(rooms).toContain("data-testid={`room-occupants-locked-${unit.unitSequence}`}");
    expect(rooms).toContain("listGuests");
    expect(rooms).toContain("GuestFormDialog");
    expect(rooms).toContain("ROOM_OCCUPANT_IDENTITY_NOTE");
    expect(rooms).toContain("{guest.fullName}");
    expect(rooms).not.toContain(">{guest.id}<");
    expect(roomsTab).toContain("ReservationRoomOccupants");
    expect(roomsTab).toContain("Choose which room this action applies to.");
    expect(roomOccupantsMutable("cancelled")).toBe(false);
    expect(roomOccupantsMutable("confirmed")).toBe(true);
    expect(
      primaryRoomOccupant([
        { guestId: "g2", name: "Loza Tilahun", isPrimary: false },
        { guestId: "g1", name: "Abel Abraha", isPrimary: true },
      ])?.name,
    ).toBe("Abel Abraha");
    expect(
      additionalRoomOccupants([
        { guestId: "g1", name: "Abel Abraha", isPrimary: true },
        { guestId: "g2", name: "Loza Tilahun", isPrimary: false },
      ]),
    ).toHaveLength(1);
  });

  it("shows only the selected room in Front Office and keeps one-room check-in simple", () => {
    expect(checkInUi).toContain("RoomUnitTargetSelect");
    expect(checkInUi).toContain("RoomUnitOccupantContext");
    expect(checkInUi).toContain("...(multiRoom ? { reservationRoomId } : {})");
    expect(checkInUi).toContain("Registration stays on the Primary Guest / Booker.");
    expect(checkOutUi).toContain("RoomUnitOccupantContext");
    expect(dialogs).toContain("RoomUnitOccupantContext");
    expect(dialogs).toContain("initialReservationRoomId");
    expect(
      shouldShowRoomOccupantContext({
        unitCount: 1,
        selected: true,
        occupants: [{ guestId: "lead", isPrimary: true }],
        bookerGuestId: "lead",
      }),
    ).toBe(false);
    expect(
      shouldShowRoomOccupantContext({
        unitCount: 2,
        selected: true,
        occupants: [{ guestId: "room-2", isPrimary: true }],
        bookerGuestId: "lead",
      }),
    ).toBe(true);
    expect(
      shouldShowRoomOccupantContext({
        unitCount: 2,
        selected: false,
        occupants: [{ guestId: "room-2", isPrimary: true }],
        bookerGuestId: "lead",
      }),
    ).toBe(false);
    expect(roomOccupantCapacity(2, 1)).toBe(3);
    expect(roomOccupancyText(2, 1, 0)).toBe("2 Adults · 1 Child · 0 Infants");
    expect(roomOperationActions("confirmed")).toEqual(["assign_room", "check_in"]);
    expect(roomOperationActions("checked_in")).toEqual(["change_room", "check_out"]);
    expect(roomOperationActions("cancelled")).toEqual([]);
    expect(plan).toContain("| GROUP-RES-06 | PASS WITH DEBT |");
    expect(plan).not.toContain("| GROUP-RES-07 |");
  });
});
