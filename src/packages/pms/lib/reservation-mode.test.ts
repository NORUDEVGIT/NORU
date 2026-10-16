import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseCreateReservationDraft } from "@/packages/pms/lib/create-reservation-draft";
import { resolveReservationMode } from "@/packages/pms/lib/reservation-mode";

function read(name: string) {
  return readFileSync(resolve(process.cwd(), name), "utf8");
}

describe("GROUP-RES-01 reservation mode", () => {
  const migration = read("drizzle/migrations/0159_reservation_mode.sql");
  const migrationCopy = read("supabase/migrations/0159_reservation_mode.sql");
  const createFn = read("src/packages/pms/lib/reservations.functions.ts");
  const draftPage = read("src/packages/pms/components/bookings/create-reservation-page.tsx");
  const plan = read("docs/pms/group-reservation-implementation-plan.md");
  const backfill = migration.slice(
    migration.indexOf("UPDATE public.hotel_reservations AS reservation"),
    migration.indexOf("DROP FUNCTION"),
  );
  const priced = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced("),
    migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced_commercial(",
    ),
  );

  it("adds reservation_mode and keeps both migration copies identical", () => {
    expect(migrationCopy).toBe(migration);
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS reservation_mode text NOT NULL DEFAULT 'single'",
    );
    expect(migration).toContain("CHECK (reservation_mode IN ('single', 'group'))");
    expect(migration).not.toContain("DROP COLUMN");
    expect(migration).not.toContain("ALTER TABLE public.pms_group");
    expect(migration).not.toContain("hotel_reservation_room_guests");
  });

  it("backfills one room unit to single and several room units to group", () => {
    expect(migration).toContain("DEFAULT 'single'");
    expect(backfill).toContain("SET reservation_mode = 'group'");
    expect(backfill).toContain("hotel_reservation_rooms");
    expect(backfill).toContain(") > 1");
    expect(backfill).not.toContain("rooms_requested");
  });

  it("accepts one room for single and several rooms for group", () => {
    expect(resolveReservationMode({ requested: "single", roomUnitCount: 1 })).toBe("single");
    expect(resolveReservationMode({ requested: null, roomUnitCount: 1 })).toBe("single");
    expect(() => resolveReservationMode({ requested: "single", roomUnitCount: 2 })).toThrow(
      "SINGLE_RESERVATION_ROOM_LIMIT",
    );
    expect(resolveReservationMode({ requested: "group", roomUnitCount: 2 })).toBe("group");
    expect(resolveReservationMode({ requested: "group", roomUnitCount: 1 })).toBe("group");
    expect(resolveReservationMode({ requested: null, roomUnitCount: 3 })).toBe("group");
    expect(priced).toContain("IF mode_value = 'single' AND unit_count > 1 THEN");
    expect(priced).toContain("RAISE EXCEPTION 'SINGLE_RESERVATION_ROOM_LIMIT'");
    expect(priced).not.toContain("mode_value = 'group' AND");
    expect(priced).toContain("SET reservation_mode = mode_value");
    expect(priced.match(/public\.create_hotel_reservation\(/g)).toHaveLength(1);
    expect(priced).toContain("RETURNS public.hotel_reservations");
    expect(priced).not.toContain("confirmation_number");
  });

  it("restores an older draft without reservationMode as single", () => {
    const restored = parseCreateReservationDraft({
      version: 1,
      guest: { id: "guest-1", fullName: "Sara Bekele" },
    });
    expect(restored?.reservationMode).toBe("single");
    expect(restored?.guest?.fullName).toBe("Sara Bekele");
    const groupDraft = parseCreateReservationDraft({ version: 1, reservationMode: "group" });
    expect(groupDraft?.reservationMode).toBe("group");
    expect(draftPage).toContain('useState<ReservationMode>("single")');
    expect(draftPage).toContain("reservation-type-selector");
  });

  it("leaves group and block linkage on the existing create path", () => {
    const createBody = createFn.slice(
      createFn.indexOf("export const createReservation"),
      createFn.indexOf("export const copyReservation"),
    );
    expect(createBody).toContain("pmsGroupId");
    expect(createBody).toContain("pmsGroupBlockId");
    expect(createBody).toContain("attachReservationToGroup");
    expect(createBody).toContain("resolveReservationMode");
    expect(createFn).toContain('select("reservation_mode")');
    expect(plan).toContain("| GROUP-RES-01 | PASS |");
    expect(plan).toContain("| GROUP-RES-04 | PASS WITH DEBT |");
    expect(plan).toContain("| GROUP-RES-05 | PASS WITH DEBT |");
    expect(plan).toContain("| GROUP-RES-06 | PASS WITH DEBT |");
    expect(plan).not.toContain("GROUP-RES-04 was started");
  });
});
