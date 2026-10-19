import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  emptyCheckInUnitProgress,
  resolveCheckInUnitTarget,
  selectCheckInUnitProgress,
  type CheckInUnitMaster,
  type CheckInUnitProgress,
  type CheckInUnitResolveInput,
} from "@/packages/pms/lib/fo-check-in-unit";

const master: CheckInUnitMaster = {
  guestId: "guest-booker",
  guestName: "Ada Booker",
  status: "confirmed",
  arrivalDate: "2026-10-20",
  departureDate: "2026-10-22",
  adults: 2,
  children: 0,
  infants: 0,
  roomTypeId: "type-master",
  roomTypeName: "Master type",
  roomId: "room-master",
  roomNumber: "101",
  ratePlanId: "plan-master",
  ratePlanName: "Master plan",
  subtotal: 400,
  currency: "ETB",
};

function unit(
  id: string,
  sequence: number,
  roomId: string,
  roomNumber: string,
): CheckInUnitResolveInput["units"][number] {
  return {
    id,
    sequence,
    status: "confirmed",
    arrivalDate: "2026-10-20",
    departureDate: "2026-10-22",
    adults: 1,
    children: 0,
    infants: 0,
    roomTypeId: `type-${id}`,
    roomTypeName: `Type ${sequence}`,
    roomId,
    roomNumber,
    ratePlanId: `plan-${id}`,
    ratePlanName: `Plan ${sequence}`,
    subtotal: sequence * 100,
    currency: "ETB",
  };
}

const unitOne = unit("unit-1", 1, "room-1", "201");
const unitTwo = unit("unit-2", 2, "room-2", "202");

function input(overrides: Partial<CheckInUnitResolveInput> = {}): CheckInUnitResolveInput {
  return {
    master,
    units: [unitOne, unitTwo],
    occupants: [
      {
        reservationRoomId: "unit-1",
        guestId: "guest-1",
        name: "Primary One",
        isPrimary: true,
      },
      {
        reservationRoomId: "unit-1",
        guestId: "guest-1b",
        name: "Share One",
        isPrimary: false,
      },
      {
        reservationRoomId: "unit-2",
        guestId: "guest-2",
        name: "Share Two",
        isPrimary: false,
      },
    ],
    packages: [
      {
        reservationRoomId: "unit-1",
        id: "pkg-1",
        packageId: "package-1",
        packageName: "Breakfast",
        appliedAmount: 20,
      },
      {
        reservationRoomId: "unit-2",
        id: "pkg-2",
        packageId: "package-2",
        packageName: "Airport",
        appliedAmount: 40,
      },
      {
        reservationRoomId: null,
        id: "pkg-stay",
        packageId: "package-stay",
        packageName: "Stay package",
        appliedAmount: 15,
      },
    ],
    ...overrides,
  };
}

describe("resolveCheckInUnitTarget", () => {
  it("resolves the only unit without an explicit id", () => {
    const result = resolveCheckInUnitTarget(input({ units: [unitOne] }));
    expect(result.reservationRoomId).toBe("unit-1");
    expect(result.roomId).toBe("room-1");
    expect(result.roomNumber).toBe("201");
    expect(result.guestSource).toBe("unit_primary");
    expect(result.primaryGuestId).toBe("guest-1");
    expect(result.subtotal).toBe(100);
    expect(result.siblings).toEqual([]);
  });

  it("rejects two units when the id is omitted", () => {
    expect(() => resolveCheckInUnitTarget(input())).toThrow(
      "Choose which room this action applies to.",
    );
  });

  it("returns only the requested unit primary guest, room, and packages", () => {
    const result = resolveCheckInUnitTarget(input({ reservationRoomId: "unit-2" }));
    expect(result.reservationRoomId).toBe("unit-2");
    expect(result.roomId).toBe("room-2");
    expect(result.roomNumber).toBe("202");
    expect(result.roomId).not.toBe(master.roomId);
    expect(result.occupants.map((occupant) => occupant.guestId)).toEqual(["guest-2"]);
    expect(result.packages.map((row) => row.id)).toEqual(["pkg-2"]);
    expect(result.primaryGuestId).toBe(master.guestId);
    expect(result.guestSource).toBe("booker");
    expect(result.primaryGuestName).toBe("Ada Booker");
    expect(result.siblings).toEqual([
      {
        id: "unit-1",
        sequence: 1,
        status: "confirmed",
        roomId: "room-1",
        roomNumber: "201",
      },
    ]);
  });

  it("does not present a sibling room as the target room", () => {
    const result = resolveCheckInUnitTarget(input({ reservationRoomId: "unit-1" }));
    expect(result.roomId).toBe("room-1");
    expect(result.roomNumber).toBe("201");
    expect(result.roomId).not.toBe("room-2");
    expect(result.roomId).not.toBe(master.roomId);
    expect(result.occupants.map((occupant) => occupant.guestId)).toEqual(["guest-1", "guest-1b"]);
    expect(result.primaryGuestId).toBe("guest-1");
    expect(result.guestSource).toBe("unit_primary");
  });

  it("labels the booker when the selected unit has no primary and does not attach that booker to the sibling", () => {
    const selected = resolveCheckInUnitTarget(input({ reservationRoomId: "unit-2" }));
    const sibling = resolveCheckInUnitTarget(input({ reservationRoomId: "unit-1" }));
    expect(selected.guestSource).toBe("booker");
    expect(selected.occupants.some((occupant) => occupant.guestId === master.guestId)).toBe(false);
    expect(selected.occupants.some((occupant) => occupant.isPrimary)).toBe(false);
    expect(sibling.guestSource).toBe("unit_primary");
    expect(sibling.primaryGuestId).toBe("guest-1");
    expect(sibling.occupants.some((occupant) => occupant.guestId === master.guestId)).toBe(false);
  });

  it("uses the master room and booker when the reservation has no unit rows", () => {
    const result = resolveCheckInUnitTarget(
      input({
        units: [],
        occupants: [],
      }),
    );
    expect(result.reservationRoomId).toBeNull();
    expect(result.roomId).toBe("room-master");
    expect(result.roomNumber).toBe("101");
    expect(result.guestSource).toBe("booker");
    expect(result.primaryGuestId).toBe("guest-booker");
    expect(result.occupants).toEqual([]);
    expect(result.packages.map((row) => row.id)).toEqual(["pkg-stay"]);
    expect(result.siblings).toEqual([]);
  });

  it("rejects an unknown unit id", () => {
    expect(() => resolveCheckInUnitTarget(input({ reservationRoomId: "unit-missing" }))).toThrow(
      "That room is not on this reservation.",
    );
  });
});

describe("getCheckInUnit wiring", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/fo-check-in-unit.functions.ts"),
    "utf8",
  );
  const assignable = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/reservations.functions.ts"),
    "utf8",
  );
  const listFn = assignable.slice(
    assignable.indexOf("export const listAssignableRooms"),
    assignable.indexOf("export const listReservations"),
  );

  it("reads one unit through the existing room commands and does not pass forCheckIn", () => {
    expect(source).toContain("requireReservationManager");
    expect(source).toContain("resolveCheckInUnitTarget");
    expect(source).toContain("listReservationRoomDisplay");
    expect(source).toContain("listAssignableRooms");
    expect(source).toContain("excludeReservationId: data.reservationId");
    expect(source).toContain("hotel_reservation_room_guests");
    expect(source).toContain("getReservationPackageAttributions");
    expect(source).toContain("selectCheckInUnitProgress");
    expect(source).toContain("reservation_room_id");
    const progressFn = source.slice(
      source.indexOf("async function loadUnitProgress"),
      source.indexOf("export async function loadCheckInUnitTarget"),
    );
    expect(progressFn).not.toContain("maybeSingle");
    expect(source).not.toContain("forCheckIn");
    expect(source).not.toContain("getCheckInContext");
    expect(source).not.toContain("loadStay");
    expect(listFn).toContain("if (eligibility.eligible)");
    expect(listFn).not.toMatch(/forCheckIn:\s*true/);
  });
});

function progress(
  reservationRoomId: string | null,
  patch: Partial<CheckInUnitProgress> = {},
): CheckInUnitProgress {
  return { ...emptyCheckInUnitProgress(reservationRoomId), ...patch, reservationRoomId };
}

describe("selectCheckInUnitProgress", () => {
  const unitOne = progress("unit-1", {
    registrationWaived: true,
    registrationWaiverReason: "desk",
    completedAt: "2026-10-20T10:00:00.000Z",
  });
  const unitTwo = progress("unit-2", { depositWaived: true, depositWaiverReason: "card" });
  const legacy = progress(null, {
    keyWaived: true,
    completedAt: "2026-10-01T00:00:00.000Z",
  });

  it("does not return another unit's waiver or completed_at", () => {
    const selected = selectCheckInUnitProgress({
      reservationRoomId: "unit-2",
      unitCount: 2,
      rows: [unitOne, unitTwo],
    });
    expect(selected.reservationRoomId).toBe("unit-2");
    expect(selected.depositWaived).toBe(true);
    expect(selected.registrationWaived).toBe(false);
    expect(selected.completedAt).toBeNull();
    const sibling = selectCheckInUnitProgress({
      reservationRoomId: "unit-1",
      unitCount: 2,
      rows: [unitOne, unitTwo],
    });
    expect(sibling.completedAt).toBe("2026-10-20T10:00:00.000Z");
    expect(sibling.depositWaived).toBe(false);
  });

  it("keeps a single-unit waiver on that unit", () => {
    const selected = selectCheckInUnitProgress({
      reservationRoomId: "unit-1",
      unitCount: 1,
      rows: [unitOne],
    });
    expect(selected.registrationWaived).toBe(true);
    expect(selected.registrationWaiverReason).toBe("desk");
    expect(selected.completedAt).toBe("2026-10-20T10:00:00.000Z");
  });

  it("does not treat a multi-unit legacy row as completion of a unit", () => {
    const selected = selectCheckInUnitProgress({
      reservationRoomId: "unit-2",
      unitCount: 2,
      rows: [legacy],
    });
    expect(selected.reservationRoomId).toBe("unit-2");
    expect(selected.completedAt).toBeNull();
    expect(selected.keyWaived).toBe(false);
  });

  it("rejects a null unit id when room units exist", () => {
    expect(() =>
      selectCheckInUnitProgress({ reservationRoomId: null, unitCount: 2, rows: [legacy] }),
    ).toThrow("Check-in progress for this stay has to be stored on a room.");
  });

  it("returns the null-unit row when the reservation has no units", () => {
    const selected = selectCheckInUnitProgress({
      reservationRoomId: null,
      unitCount: 0,
      rows: [legacy],
    });
    expect(selected.reservationRoomId).toBeNull();
    expect(selected.keyWaived).toBe(true);
    expect(selected.completedAt).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("fo check-in progress unit migration", () => {
  const supabaseSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0169_fo_checkin_progress_unit.sql"),
    "utf8",
  );
  const drizzleSql = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0169_fo_checkin_progress_unit.sql"),
    "utf8",
  );

  it("stores one progress row per reservation and unit, and backfills only a single unit", () => {
    expect(supabaseSql).toBe(drizzleSql);
    expect(supabaseSql).toContain("ADD COLUMN IF NOT EXISTS reservation_room_id uuid");
    expect(supabaseSql).toContain(
      "DROP CONSTRAINT IF EXISTS fo_checkin_progress_reservation_unique",
    );
    expect(supabaseSql).toContain(
      "UNIQUE NULLS NOT DISTINCT (reservation_id, reservation_room_id)",
    );
    expect(supabaseSql).toContain("SET reservation_room_id = unit.id");
    expect(supabaseSql).toContain(") = 1");
    expect(supabaseSql).toContain("RAISE EXCEPTION 'CHECKIN_PROGRESS_UNIT_REQUIRED'");
    expect(supabaseSql).not.toMatch(/INSERT INTO public\.fo_checkin_progress/i);
    expect(supabaseSql).not.toMatch(/SET [^;]*completed_at/i);
    expect(supabaseSql).not.toMatch(/SET [^;]*registration_waived/i);
  });
});
