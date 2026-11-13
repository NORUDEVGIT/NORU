import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Hard assignment rules (occupancy, housekeeping) must give the same verdict in
 * Assignment Eligibility and in the reservation write paths that accept an
 * already selected room.
 *
 * The source checks always run. The behaviour checks execute the real SQL
 * functions from the migrations (0155, 0168, 0172, 0205) in an in-process
 * Postgres (PGlite). PGlite is not a project dependency, so those checks run
 * when it can be loaded and are skipped otherwise:
 *
 *   mkdir /tmp/pgl && cd /tmp/pgl && npm i @electric-sql/pglite
 *   PGLITE_MODULE=/tmp/pgl/node_modules/@electric-sql/pglite/dist/index.js \
 *     npx vitest run src/packages/pms/lib/room-assignment-hard-rules.test.ts
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const MIGRATION = "supabase/migrations/0205_room_assignment_hard_rule_consistency.sql";
const migration = read(MIGRATION);

function functionSource(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const end = sql.indexOf("\n$$;", start);
  return sql.slice(start, end + 4);
}

describe("0205 migration source", () => {
  it("is mirrored byte for byte in both migration lanes", () => {
    expect(read("drizzle/migrations/0205_room_assignment_hard_rule_consistency.sql")).toBe(
      migration,
    );
  });

  it("asks the canonical evaluation instead of re-implementing the rules", () => {
    const helper = functionSource(migration, "pms_assert_room_assignment_hard_rules");
    expect(helper).toContain("public.pms_evaluate_room_assignment(");
    expect(helper).toContain("'OCCUPANCY_EXCEEDED'");
    expect(helper).toContain("'HOUSEKEEPING_NOT_READY'");
    expect(helper).not.toMatch(/max_occupancy|housekeeping_status|clean_required/);
  });

  it("is internal and service-role only", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.pms_assert_room_assignment_hard_rules\([^)]*\)\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.pms_assert_room_assignment_hard_rules\([^)]*\)\s+TO service_role/,
    );
  });

  it("keeps assert_room_assignable and the other rules untouched", () => {
    expect(migration).not.toContain("FUNCTION public.assert_room_assignable(");
    expect(migration).not.toContain("FUNCTION public.pms_evaluate_room_assignment(");
    expect(migration).not.toContain("FUNCTION public.change_hotel_stay_dates(");
  });

  it("uses staff-facing domain codes only", () => {
    const raised = [...migration.matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(new Set(raised)).toEqual(
      new Set([
        "ROOM_CAPACITY_EXCEEDED",
        "ROOM_HOUSEKEEPING_NOT_READY",
        "ROOM_ALREADY_BOOKED",
        "NO_AVAILABILITY",
        "RESERVATION_NOT_FOUND",
        "RESERVATION_CANCELLED",
      ]),
    );
  });

  it("maps the new domain codes to staff text in both error tables", () => {
    for (const file of [
      "src/packages/pms/lib/reservations.server.ts",
      "src/packages/pms/lib/rates.server.ts",
    ]) {
      const source = read(file);
      expect(source).toMatch(/ROOM_CAPACITY_EXCEEDED:\s*"/);
      expect(source).toMatch(/ROOM_HOUSEKEEPING_NOT_READY:\s*"/);
    }
  });
});

type Db = {
  exec: (sql: string) => Promise<unknown>;
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

async function loadPglite(): Promise<(new () => Db) | null> {
  const specifier = process.env.PGLITE_MODULE ?? "@electric-sql/pglite";
  try {
    const mod = (await import(/* @vite-ignore */ specifier)) as { PGlite: new () => Db };
    return mod.PGlite;
  } catch {
    return null;
  }
}

const PGlite = await loadPglite();

const STUB_SCHEMA = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
CREATE FUNCTION public.is_restaurant_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

CREATE TABLE public.restaurants (id uuid PRIMARY KEY, business_date date, timezone text);
CREATE TABLE public.room_types (id uuid PRIMARY KEY, restaurant_id uuid, max_occupancy integer);
CREATE TABLE public.room_type_beds (restaurant_id uuid, room_type_id uuid, bed_type text);
CREATE TABLE public.hotel_rooms (
  id uuid PRIMARY KEY, restaurant_id uuid, room_type_id uuid,
  active boolean DEFAULT true, status text DEFAULT 'available', sellable boolean DEFAULT true,
  accessible boolean DEFAULT false, housekeeping_status text DEFAULT 'clean',
  maintenance_status text DEFAULT 'normal', building_id uuid, floor_id uuid
);
CREATE TABLE public.hotel_room_links (restaurant_id uuid, kind text, room_id uuid, other_room_id uuid);
CREATE TABLE public.pms_inventory_rules (
  restaurant_id uuid PRIMARY KEY,
  sellable_status_required boolean DEFAULT true,
  require_room_type_match boolean DEFAULT true,
  require_occupancy_match boolean DEFAULT false,
  require_bed_type_match boolean DEFAULT false,
  require_accessibility_match boolean DEFAULT false,
  require_connecting_room_match boolean DEFAULT false,
  require_maintenance_availability boolean DEFAULT false,
  require_housekeeping_readiness boolean DEFAULT false,
  housekeeping_affects_assignment boolean DEFAULT false,
  use_building_preference boolean DEFAULT false,
  use_floor_preference boolean DEFAULT false,
  use_guest_preference boolean DEFAULT false
);
CREATE TABLE public.pms_housekeeping_settings (
  restaurant_id uuid PRIMARY KEY,
  clean_required boolean DEFAULT true,
  inspection_required boolean DEFAULT false,
  maintenance_clear_required boolean DEFAULT false
);
CREATE TABLE public.pms_maintenance_status_rules (
  restaurant_id uuid, maintenance_status text, prevents_room_assignment boolean, active boolean
);
CREATE TABLE public.pms_operational_inventory_blocks (
  restaurant_id uuid, status text, inventory_impact text, target_kind text,
  room_id uuid, room_type_id uuid, start_date date, end_date date
);
CREATE TABLE public.hotel_reservations (
  id uuid PRIMARY KEY, restaurant_id uuid, room_type_id uuid, room_id uuid,
  arrival_date date, departure_date date, adults integer, children integer,
  special_requests text, notes text, status text DEFAULT 'confirmed'
);
CREATE TABLE public.hotel_reservation_rooms (
  id uuid PRIMARY KEY, restaurant_id uuid, reservation_id uuid, room_type_id uuid, room_id uuid,
  arrival_date date, departure_date date, adults integer, children integer,
  status text DEFAULT 'confirmed'
);
CREATE TABLE public.hotel_reservation_counters (restaurant_id uuid PRIMARY KEY, last_number integer);
CREATE TABLE public.hotel_reservation_history (
  restaurant_id uuid, reservation_id uuid, event_type text,
  previous_values jsonb, new_values jsonb, actor_membership_id uuid
);

-- Test doubles for pieces that are not part of this rule.
CREATE FUNCTION public.pms_stay_overlaps_room(
  _restaurant_id uuid, _room_id uuid, _arrival date, _departure date, _exclude uuid
) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hotel_reservations r
    WHERE r.restaurant_id = _restaurant_id AND r.room_id = _room_id
      AND r.status NOT IN ('cancelled', 'checked_out', 'no_show')
      AND r.arrival_date < _departure AND r.departure_date > _arrival
      AND (_exclude IS NULL OR r.id <> _exclude)
  )
$$;
CREATE FUNCTION public.pms_count_available_inventory(
  uuid, uuid, date, date, uuid
) RETURNS integer LANGUAGE sql AS $$ SELECT 99 $$;
`;

const IDS = {
  property: "00000000-0000-0000-0000-0000000000a1",
  typeKing: "00000000-0000-0000-0000-0000000000b1",
  typeTwin: "00000000-0000-0000-0000-0000000000b2",
  roomClean: "00000000-0000-0000-0000-0000000000c1",
  roomDirty: "00000000-0000-0000-0000-0000000000c2",
  roomTwin: "00000000-0000-0000-0000-0000000000c3",
  roomRepair: "00000000-0000-0000-0000-0000000000c4",
  reservation: "00000000-0000-0000-0000-0000000000d1",
  unit: "00000000-0000-0000-0000-0000000000e1",
};
const ARRIVAL = "2026-12-10";
const DEPARTURE = "2026-12-12";

type RuleName =
  | "require_occupancy_match"
  | "require_housekeeping_readiness"
  | "housekeeping_affects_assignment"
  | "require_room_type_match"
  | "require_maintenance_availability";

describe.skipIf(!PGlite)("hard assignment rules, executed against the migration SQL", () => {
  let db: Db;

  async function sqlOf(path: string, name: string): Promise<string> {
    return functionSource(read(path), name);
  }

  async function setRules(rules: Partial<Record<RuleName, boolean>>) {
    await db.exec(`DELETE FROM public.pms_inventory_rules`);
    const columns = ["restaurant_id", ...Object.keys(rules)];
    const values = [`'${IDS.property}'`, ...Object.values(rules).map(String)];
    await db.exec(
      `INSERT INTO public.pms_inventory_rules (${columns.join(", ")}) VALUES (${values.join(", ")})`,
    );
  }

  async function failure(sql: string): Promise<string | null> {
    try {
      await db.exec(sql);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  }

  async function reset() {
    await db.exec(`
      DELETE FROM public.hotel_reservation_history;
      DELETE FROM public.hotel_reservation_rooms;
      DELETE FROM public.hotel_reservations;
      DELETE FROM public.pms_maintenance_status_rules;
      UPDATE public.hotel_rooms SET housekeeping_status = 'clean', maintenance_status = 'normal';
      UPDATE public.hotel_rooms SET housekeeping_status = 'dirty' WHERE id = '${IDS.roomDirty}';
      UPDATE public.hotel_rooms SET maintenance_status = 'repair' WHERE id = '${IDS.roomRepair}';
      INSERT INTO public.pms_maintenance_status_rules VALUES
        ('${IDS.property}', 'repair', true, true);
    `);
  }

  /** Reservation with one unit that already holds `roomId`, as create writes it. */
  async function seedReservation(roomId: string, adults: number, children = 0) {
    await db.exec(`
      DELETE FROM public.hotel_reservation_rooms;
      DELETE FROM public.hotel_reservations;
      INSERT INTO public.hotel_reservations
        (id, restaurant_id, room_type_id, room_id, arrival_date, departure_date, adults, children)
        VALUES ('${IDS.reservation}', '${IDS.property}', '${IDS.typeKing}', '${roomId}',
                '${ARRIVAL}', '${DEPARTURE}', ${adults}, ${children});
      INSERT INTO public.hotel_reservation_rooms
        (id, restaurant_id, reservation_id, room_type_id, room_id, arrival_date, departure_date, adults, children)
        VALUES ('${IDS.unit}', '${IDS.property}', '${IDS.reservation}', '${IDS.typeKing}', '${roomId}',
                '${ARRIVAL}', '${DEPARTURE}', ${adults}, ${children});
    `);
  }

  const createCheck = () =>
    `SELECT public.assert_reservation_room_units('${IDS.property}', '${IDS.reservation}')`;

  const canonicalBlockers = async (roomId: string, adults: number, children = 0) => {
    const result = await db.query<{ blockers: Array<{ code: string }> }>(
      `SELECT public.pms_evaluate_room_assignment(
         '${IDS.property}', '${roomId}', '${IDS.typeKing}', '${ARRIVAL}', '${DEPARTURE}',
         NULL, ${adults}, ${children}
       )->'blockers' AS blockers`,
    );
    return result.rows[0].blockers.map((b) => b.code);
  };

  async function load() {
    const Ctor = PGlite as new () => Db;
    db = new Ctor();
    await db.exec(STUB_SCHEMA);
    await db.exec(
      await sqlOf(
        "supabase/migrations/0155_room_unit_inventory_price.sql",
        "assert_room_assignable",
      ),
    );
    const evaluation = read(
      "supabase/migrations/0168_room_assignment_eligibility_qualification.sql",
    );
    await db.exec(evaluation);
    await db.exec(
      await sqlOf(
        "supabase/migrations/0172_reservation_overbooking.sql",
        "assert_reservation_capacity",
      ),
    );
    await db.exec(migration);
    await db.exec(`
      INSERT INTO public.restaurants VALUES ('${IDS.property}', '2026-12-01', 'Europe/London');
      INSERT INTO public.pms_housekeeping_settings VALUES ('${IDS.property}', true, false, false);
      INSERT INTO public.room_types VALUES
        ('${IDS.typeKing}', '${IDS.property}', 2),
        ('${IDS.typeTwin}', '${IDS.property}', 4);
      INSERT INTO public.hotel_rooms (id, restaurant_id, room_type_id) VALUES
        ('${IDS.roomClean}', '${IDS.property}', '${IDS.typeKing}'),
        ('${IDS.roomDirty}', '${IDS.property}', '${IDS.typeKing}'),
        ('${IDS.roomTwin}', '${IDS.property}', '${IDS.typeTwin}'),
        ('${IDS.roomRepair}', '${IDS.property}', '${IDS.typeKing}');
    `);
  }

  it("loads the real functions", async () => {
    await load();
    await reset();
    const result = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'pms_assert_room_assignment_hard_rules'`,
    );
    expect(result.rows[0].n).toBe(1);
  });

  describe("create with a preassigned room", () => {
    it("saves a valid room", async () => {
      await reset();
      await setRules({ require_occupancy_match: true, require_housekeeping_readiness: true });
      await seedReservation(IDS.roomClean, 2);
      expect(await failure(createCheck())).toBeNull();
    });

    it("blocks occupancy exceeded when the occupancy rule is on", async () => {
      await reset();
      await setRules({ require_occupancy_match: true });
      await seedReservation(IDS.roomClean, 2, 1);
      expect(await failure(createCheck())).toContain("ROOM_CAPACITY_EXCEEDED");
    });

    it("allows occupancy exceeded when the occupancy rule is off", async () => {
      await reset();
      await setRules({ require_occupancy_match: false });
      await seedReservation(IDS.roomClean, 2, 1);
      expect(await failure(createCheck())).toBeNull();
    });

    it("blocks a dirty room when the housekeeping readiness rule is on", async () => {
      await reset();
      await setRules({ require_housekeeping_readiness: true });
      await seedReservation(IDS.roomDirty, 2);
      expect(await failure(createCheck())).toContain("ROOM_HOUSEKEEPING_NOT_READY");
    });

    it("blocks a dirty room when housekeeping affects assignment", async () => {
      await reset();
      await setRules({ housekeeping_affects_assignment: true });
      await seedReservation(IDS.roomDirty, 2);
      expect(await failure(createCheck())).toContain("ROOM_HOUSEKEEPING_NOT_READY");
    });

    it("allows a dirty room when both housekeeping rules are off", async () => {
      await reset();
      await setRules({ require_occupancy_match: true });
      await seedReservation(IDS.roomDirty, 2);
      expect(await failure(createCheck())).toBeNull();
    });

    it("allows everything this rule covers when the property has no rules row", async () => {
      await reset();
      await db.exec(`DELETE FROM public.pms_inventory_rules`);
      await seedReservation(IDS.roomDirty, 3);
      expect(await failure(createCheck())).toBeNull();
    });

    it("keeps room type mismatch blocked when configured", async () => {
      await reset();
      await setRules({ require_room_type_match: true, require_occupancy_match: true });
      await seedReservation(IDS.roomTwin, 2);
      expect(await failure(createCheck())).toContain("ROOM_NOT_ASSIGNABLE");
    });

    it("keeps maintenance restriction blocked when configured", async () => {
      await reset();
      await setRules({ require_maintenance_availability: true });
      await seedReservation(IDS.roomRepair, 2);
      expect(await failure(createCheck())).toContain("ROOM_NOT_ASSIGNABLE");
    });

    it("keeps maintenance allowed when that rule is off", async () => {
      await reset();
      await setRules({ require_maintenance_availability: false });
      await seedReservation(IDS.roomRepair, 2);
      expect(await failure(createCheck())).toBeNull();
    });

    it("keeps the earlier room error ahead of the new ones", async () => {
      await reset();
      await setRules({
        require_room_type_match: true,
        require_occupancy_match: true,
        require_housekeeping_readiness: true,
      });
      await seedReservation(IDS.roomTwin, 3);
      await db.exec(
        `UPDATE public.hotel_rooms SET housekeeping_status = 'dirty' WHERE id = '${IDS.roomTwin}'`,
      );
      expect(await failure(createCheck())).toContain("ROOM_NOT_ASSIGNABLE");
    });
  });

  describe("same verdict as canonical Assignment Eligibility", () => {
    const cases: Array<{
      name: string;
      rules: Partial<Record<RuleName, boolean>>;
      room: string;
      adults: number;
      children: number;
    }> = [
      {
        name: "occupancy ON, exceeded",
        rules: { require_occupancy_match: true },
        room: IDS.roomClean,
        adults: 2,
        children: 1,
      },
      { name: "occupancy OFF, exceeded", rules: {}, room: IDS.roomClean, adults: 2, children: 1 },
      {
        name: "occupancy ON, fits",
        rules: { require_occupancy_match: true },
        room: IDS.roomClean,
        adults: 2,
        children: 0,
      },
      {
        name: "housekeeping ON, dirty",
        rules: { require_housekeeping_readiness: true },
        room: IDS.roomDirty,
        adults: 1,
        children: 0,
      },
      {
        name: "housekeeping affects, dirty",
        rules: { housekeeping_affects_assignment: true },
        room: IDS.roomDirty,
        adults: 1,
        children: 0,
      },
      { name: "housekeeping OFF, dirty", rules: {}, room: IDS.roomDirty, adults: 1, children: 0 },
      {
        name: "both ON, both failing",
        rules: { require_occupancy_match: true, require_housekeeping_readiness: true },
        room: IDS.roomDirty,
        adults: 3,
        children: 0,
      },
    ];

    for (const scenario of cases) {
      it(scenario.name, async () => {
        await reset();
        await setRules(scenario.rules);
        const blockers = await canonicalBlockers(scenario.room, scenario.adults, scenario.children);
        await seedReservation(scenario.room, scenario.adults, scenario.children);
        const message = await failure(createCheck());

        // Occupancy is reported first when both rules fail.
        const expectedCode = blockers.includes("OCCUPANCY_EXCEEDED")
          ? "ROOM_CAPACITY_EXCEEDED"
          : blockers.includes("HOUSEKEEPING_NOT_READY")
            ? "ROOM_HOUSEKEEPING_NOT_READY"
            : null;
        if (expectedCode) expect(message).toContain(expectedCode);
        else expect(message).toBeNull();
      });
    }
  });

  describe("Assign Room, check-in and room move", () => {
    const unitCheck = (roomId: string) =>
      `SELECT public.assert_reservation_room_unit_room(
         '${IDS.property}', '${IDS.reservation}', '${IDS.unit}', '${roomId}',
         '${IDS.typeKing}', '${ARRIVAL}', '${DEPARTURE}')`;

    it("blocks a dirty room when the rule is on, allows it when off", async () => {
      await reset();
      await seedReservation(IDS.roomClean, 2);
      await setRules({ require_housekeeping_readiness: true });
      expect(await failure(unitCheck(IDS.roomDirty))).toContain("ROOM_HOUSEKEEPING_NOT_READY");
      await setRules({});
      expect(await failure(unitCheck(IDS.roomDirty))).toBeNull();
    });

    it("blocks occupancy exceeded using the unit's guests when the rule is on", async () => {
      await reset();
      await seedReservation(IDS.roomClean, 3);
      await setRules({ require_occupancy_match: true });
      expect(await failure(unitCheck(IDS.roomClean))).toContain("ROOM_CAPACITY_EXCEEDED");
      await setRules({ require_occupancy_match: false });
      expect(await failure(unitCheck(IDS.roomClean))).toBeNull();
    });

    it("accepts a clean room that fits", async () => {
      await reset();
      await seedReservation(IDS.roomClean, 2);
      await setRules({ require_occupancy_match: true, require_housekeeping_readiness: true });
      expect(await failure(unitCheck(IDS.roomClean))).toBeNull();
    });
  });

  describe("amend with an assigned room", () => {
    const amend = (roomId: string, adults: number, children: number, notes = "x") =>
      `SELECT public.amend_hotel_reservation(
         '${IDS.property}', '${IDS.reservation}', '${IDS.typeKing}', '${roomId}',
         '${ARRIVAL}', '${DEPARTURE}', ${adults}, ${children}, NULL, '${notes}', NULL)`;

    it("blocks a change to a dirty room when the rule is on, allows it when off", async () => {
      await reset();
      await seedReservation(IDS.roomClean, 2);
      await setRules({ require_housekeeping_readiness: true });
      expect(await failure(amend(IDS.roomDirty, 2, 0))).toContain("ROOM_HOUSEKEEPING_NOT_READY");
      await setRules({});
      expect(await failure(amend(IDS.roomDirty, 2, 0))).toBeNull();
    });

    it("blocks a guest increase beyond the room when occupancy is on, allows it when off", async () => {
      await reset();
      await seedReservation(IDS.roomClean, 2);
      await setRules({ require_occupancy_match: true });
      expect(await failure(amend(IDS.roomClean, 2, 1))).toContain("ROOM_CAPACITY_EXCEEDED");
      await setRules({});
      expect(await failure(amend(IDS.roomClean, 2, 1))).toBeNull();
    });

    it("does not re-check an unrelated edit on a room that is dirty now", async () => {
      await reset();
      await seedReservation(IDS.roomDirty, 2);
      await setRules({ require_occupancy_match: true, require_housekeeping_readiness: true });
      expect(await failure(amend(IDS.roomDirty, 2, 0, "late arrival"))).toBeNull();
    });

    it("does not re-check a stay whose guests already exceed the room when only notes change", async () => {
      await reset();
      await seedReservation(IDS.roomClean, 3);
      await setRules({ require_occupancy_match: true });
      expect(await failure(amend(IDS.roomClean, 3, 0, "note"))).toBeNull();
    });

    it("still rejects a room of the wrong type", async () => {
      await reset();
      await seedReservation(IDS.roomClean, 2);
      await setRules({ require_room_type_match: true });
      expect(await failure(amend(IDS.roomTwin, 2, 0))).toContain("ROOM_NOT_ASSIGNABLE");
    });
  });
});

describe.skipIf(Boolean(PGlite))(
  "hard assignment rules, executed against the migration SQL",
  () => {
    it.skip("needs @electric-sql/pglite (see the comment at the top of this file)", () => {});
  },
);
