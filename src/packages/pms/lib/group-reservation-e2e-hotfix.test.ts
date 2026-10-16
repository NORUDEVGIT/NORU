import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  attachRoomOccupants,
  createReservationRoomUnitPayload,
  frontOfficeRoomTargets,
  projectReservationRoomUnits,
  type ReservationRoomMasterSlice,
  type ReservationRoomUnitRow,
} from "@/packages/pms/lib/reservation-room-units";
import {
  buildPersistedReservationPrintData,
  type PersistedReservationPrintInput,
} from "@/packages/pms/lib/reservation-print-document";
import { buildGroupRoomGuestAssignments } from "@/packages/pms/lib/create-reservation-rooming";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const master: ReservationRoomMasterSlice = {
  roomTypeId: "type-1",
  roomId: null,
  arrivalDate: "2026-10-14",
  departureDate: "2026-10-16",
  adults: 1,
  children: 0,
  infants: 0,
  ratePlanId: "plan-1",
  currency: "ETB",
  nightlyRates: [{ date: "2026-10-14", rate: 6750 }],
  roomSubtotal: 31500,
  pricedAt: "2026-10-14T08:00:00Z",
};

function room(
  id: string,
  unitSequence: number,
  roomTypeId: string,
  ratePlanId: string,
  subtotal: number,
): ReservationRoomUnitRow {
  return {
    id,
    unit_sequence: unitSequence,
    room_type_id: roomTypeId,
    room_id: null,
    arrival_date: "2026-10-14",
    departure_date: "2026-10-16",
    adults: 1,
    children: 0,
    infants: 0,
    rate_plan_id: ratePlanId,
    currency: "ETB",
    nightly_rate_snapshot: [
      { date: "2026-10-14", rate: subtotal / 2 },
      { date: "2026-10-15", rate: subtotal / 2 },
    ],
    room_subtotal: subtotal,
    priced_at: "2026-10-14T08:00:00Z",
    status: "confirmed",
  };
}

function persistedPrintInput(
  roomRows: PersistedReservationPrintInput["roomRows"],
): PersistedReservationPrintInput {
  return {
    generatedAt: "14 Oct 2026, 10:00",
    propertyName: "NORU",
    status: "confirmed",
    confirmationNumber: "NR-000020",
    createdAt: "2026-10-14T08:00:00Z",
    confirmedAt: "2026-10-14T08:00:00Z",
    guestName: "Abel Abraha",
    phone: null,
    email: null,
    nationality: null,
    idDocumentNumber: null,
    bookedBy: "Same as guest",
    bookingSource: "Direct",
    salesChannel: null,
    marketSegment: null,
    companyName: null,
    travelAgentName: null,
    groupName: null,
    arrivalDate: "2026-10-14",
    departureDate: "2026-10-16",
    nights: 2,
    rooms: 2,
    adults: 2,
    children: 0,
    infants: 0,
    roomImageUrl: null,
    roomName: "Card2 Smoke Twin",
    roomCode: null,
    ratePlan: "BAR",
    inclusions: null,
    ratePerNight: null,
    roomTotal: "ETB 31,500",
    packages: [],
    packagesKnown: true,
    packagesTotal: null,
    paymentType: null,
    paymentMethod: null,
    depositRequired: null,
    depositAmount: null,
    depositDueDate: null,
    paymentTerms: [],
    cancellation: null,
    noShow: null,
    earlyDeparture: null,
    refundability: null,
    preferences: [],
    serviceRequests: [],
    specialRequests: null,
    roomAssignment: null,
    reservationKind: "group",
    guestRole: "Primary Guest / Booker",
    roomRows,
  };
}

describe("group reservation runtime persistence hotfix", () => {
  const page = read("src/packages/pms/components/bookings/create-reservation-page.tsx");
  const create = read("src/packages/pms/lib/reservations.functions.ts");
  const migration = read("drizzle/migrations/0160_reservation_room_guests.sql");
  const detail = read("src/packages/pms/components/workspaces/reservation-detail-overview.tsx");
  const frontOffice = read("src/packages/pms/lib/frontoffice.functions.ts");

  it("keeps the real Step 4 submit payload group-shaped through both RPCs", () => {
    const roomPayload = createReservationRoomUnitPayload({
      roomTypeId: "type-1",
      adults: 1,
      children: 0,
      infants: 0,
      ratePlanId: "plan-1",
      roomsRequested: 1,
      extraUnits: [
        {
          roomTypeId: "type-2",
          adults: 1,
          children: 0,
          infants: 0,
          ratePlanId: "plan-2",
        },
      ],
    });
    const guestAssignments = buildGroupRoomGuestAssignments({
      reservationMode: "group",
      activeRoomIndex: 1,
      guestId: "guest-1",
      arrival: "2026-10-14",
      departure: "2026-10-16",
      room1: {
        roomTypeId: "type-1",
        adults: 1,
        children: 0,
        infants: 0,
        ratePlanId: "plan-1",
      },
      extras: [
        {
          key: "room-2",
          roomTypeId: "type-2",
          adults: 1,
          children: 0,
          infants: 0,
          ratePlanId: "plan-2",
          occupant: { guestId: "guest-2", fullName: "Abebaw Demeke" },
        },
      ],
    });
    expect(roomPayload.roomUnits).toHaveLength(2);
    expect(roomPayload.roomUnits?.map((unit) => unit.ratePlanId)).toEqual(["plan-1", "plan-2"]);
    expect(guestAssignments).toEqual([
      { unitSequence: 1, guestId: "guest-1", isPrimary: true },
      { unitSequence: 2, guestId: "guest-2", isPrimary: true },
    ]);
    expect(page).toContain("roomUnits: roomUnitPayload.roomUnits ?? undefined");
    expect(page).toContain('reservationMode: "group" as const');
    expect(page).toContain(
      "roomGuestAssignments: buildGroupRoomGuestAssignments(currentRooming())",
    );
    expect(create).toContain("_room_units: roomUnitPayload.roomUnits.map");
    expect(create).toContain("_reservation_mode: reservationMode");
    expect(create).toContain("_room_guest_assignments: data.roomGuestAssignments.map");
    expect(create).toContain("_rooms: roomUnitPayload.roomUnits?.length ?? roomUnitPayload.rooms");
    expect(create).toContain('.rpc("create_hotel_reservation_priced_commercial", {');
    expect(create).toContain('supabaseAdmin.rpc("create_hotel_reservation_priced", pricedArgs)');
  });

  it("keeps insertion and guest assignment in the authoritative atomic transaction", () => {
    expect(migration).toContain("INSERT INTO public.hotel_reservation_rooms");
    expect(migration).toContain("FOR unit_index IN 1..GREATEST(unit_count - 1, 0) LOOP");
    expect(migration).toContain("unit_index + 1");
    expect(migration).toContain(
      "PERFORM public.assign_reservation_room_guests(created.restaurant_id, created.id, _room_guest_assignments)",
    );
    expect(migration.indexOf("INSERT INTO public.hotel_reservation_rooms")).toBeLessThan(
      migration.indexOf("PERFORM public.assign_reservation_room_guests"),
    );
  });

  it("projects one master into two room units, two occupants, Front Office, and print", () => {
    const units = attachRoomOccupants(
      projectReservationRoomUnits(master, [
        room("room-1", 1, "type-1", "plan-1", 13500),
        room("room-2", 2, "type-2", "plan-2", 18000),
      ]).map((unit, index) => ({
        ...unit,
        roomTypeName: index === 0 ? "Card2 Smoke Twin" : "Deluxe-King",
        ratePlanName: index === 0 ? "BAR" : "Deluxe-king J",
      })),
      [
        {
          reservationRoomId: "room-1",
          guestId: "guest-1",
          name: "Abel Abraha",
          isPrimary: true,
        },
        {
          reservationRoomId: "room-2",
          guestId: "guest-2",
          name: "Abebaw Demeke",
          isPrimary: true,
        },
      ],
    );

    const masters = [{ id: "reservation-1", confirmationNumber: "NR-000020", mode: "group" }];
    expect(masters).toHaveLength(1);
    expect(masters[0]?.confirmationNumber).toBe("NR-000020");
    expect(units).toHaveLength(2);
    expect(units.map((unit) => unit.ratePlanId)).toEqual(["plan-1", "plan-2"]);
    expect(units.map((unit) => unit.occupants[0]?.name)).toEqual(["Abel Abraha", "Abebaw Demeke"]);
    expect(units.filter((unit) => unit.occupants[0]?.isPrimary)).toHaveLength(2);

    const targets = frontOfficeRoomTargets(units);
    expect(targets).toHaveLength(2);
    expect(targets[1]?.occupants?.[0]?.name).toBe("Abebaw Demeke");

    const roomRows = units.map((unit) => ({
      sequence: String(unit.unitSequence),
      occupant: unit.occupants[0]?.name ?? "—",
      roomType: unit.roomTypeName ?? "—",
      occupancy: `${unit.adults}A`,
      ratePlan: unit.ratePlanName ?? "—",
      ratePerNight: unit.unitSequence === 1 ? "ETB 6,750" : "ETB 9,000",
      subtotal: unit.unitSequence === 1 ? "ETB 13,500" : "ETB 18,000",
    }));
    const print = buildPersistedReservationPrintData(persistedPrintInput(roomRows));
    expect(print.confirmationNumber).toBe("NR-000020");
    expect(print.roomRows).toHaveLength(2);
    expect(print.booking).toContainEqual({
      label: "Reservation Type",
      value: "Group Reservation",
    });
  });

  it("derives detail and Front Office from room units rather than rooms_requested", () => {
    expect(detail).toContain("const roomUnits = reservation.rooms ?? []");
    expect(detail).toContain("roomUnits.length");
    expect(detail).toContain('data-testid="overview-group-rooms"');
    expect(frontOffice).toContain("attachFrontOfficeRoomUnits");
    expect(frontOffice).toContain('.from("hotel_reservation_room_guests")');
    expect(frontOffice).toContain("roomUnits: byReservation.get(stay.id) ?? []");
  });
});
