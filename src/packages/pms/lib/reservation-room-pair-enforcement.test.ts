import { beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 5D: an active reservation room pair decides room eligibility and final
 * assignment (migration 0213).
 *
 * The behaviour checks execute the real SQL of the migrations (0155, 0156, 0168,
 * 0172, 0183, 0205, 0209, 0210, 0212, 0213) in an in-process Postgres (PGlite):
 *
 *   mkdir /tmp/pgl && cd /tmp/pgl && npm i @electric-sql/pglite
 *   PGLITE_MODULE=/tmp/pgl/node_modules/@electric-sql/pglite/dist/index.js \
 *     npx vitest run src/packages/pms/lib/reservation-room-pair-enforcement.test.ts
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const MIGRATION = "supabase/migrations/0213_reservation_room_pair_enforcement.sql";
const migration = read(MIGRATION);
const code = migration.replace(/^\s*--.*$/gm, "");

function functionSource(sql: string, name: string): string {
  const match = new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}\\(`).exec(sql);
  if (!match) throw new Error(`${name} not found`);
  const end = sql.indexOf("\n$$;", match.index);
  return sql.slice(match.index, end + 4);
}

describe("0213 migration source", () => {
  it("is mirrored byte for byte and is the newest numbered migration", () => {
    expect(read("drizzle/migrations/0213_reservation_room_pair_enforcement.sql")).toBe(migration);
    for (const dir of ["supabase/migrations", "drizzle/migrations"]) {
      const newest = readdirSync(resolve(root, dir))
        .filter((name) => /^0\d{3}_/.test(name))
        .sort()
        .at(-1);
      expect(newest).toBe("0213_reservation_room_pair_enforcement.sql");
    }
  });

  it("adds one canonical pair evaluator that reuses the room evaluator", () => {
    const evaluator = functionSource(migration, "pms_evaluate_room_pairing");
    expect(evaluator.match(/public\.pms_evaluate_room_assignment\(/g)).toHaveLength(1);
    // Capability and operational rules are never copied out of the room evaluator.
    expect(evaluator).not.toMatch(
      /room\.accessible|room\.sellable|max_occupancy|housekeeping_status|maintenance_status|pms_operational_inventory_blocks/,
    );
    for (const code of [
      "CONNECTING_PAIR_MISMATCH",
      "CONNECTING_PAIR_INVALID",
      "CONNECTING_PARTNER_UNAVAILABLE",
    ]) {
      expect(`${evaluator}${functionSource(migration, "pms_assert_reservation_room_pairing")}`).toContain(
        code,
      );
    }
  });

  it("does not redefine the evaluator, the 0210 helpers or the 0211 link schema", () => {
    for (const name of [
      "pms_evaluate_room_assignment",
      "pms_assert_room_assignment_hard_rules",
      "pms_enforce_room_unit_requirements",
      "assert_reservation_room_units",
      "amend_hotel_reservation",
      "assign_hotel_reservation_room_unit",
      "check_in_hotel_reservation",
      "move_hotel_reservation_room",
      "save_hotel_reservation_room_pair",
      "remove_hotel_reservation_room_pair",
    ]) {
      expect(code).not.toContain(`FUNCTION public.${name}(`);
    }
    expect(code).not.toMatch(/ALTER TABLE\s+public\.hotel_room_links|CREATE (UNIQUE )?INDEX/);
    expect(code).not.toMatch(/ALTER TABLE|DROP TABLE|DROP FUNCTION/);
  });

  it("replaces only assert_reservation_room_unit_room, keeping the 0210 body", () => {
    const replaced = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
    expect(replaced).toEqual(["assert_reservation_room_unit_room"]);
    const before = functionSource(read("supabase/migrations/0210_room_requirement_final_enforcement.sql"), "assert_reservation_room_unit_room");
    const after = functionSource(migration, "assert_reservation_room_unit_room");
    const strip = (text: string) =>
      text.replace(/^\s*--.*$/gm, "").replace(/\s+/g, " ").trim();
    expect(strip(after)).toBe(
      strip(before).replace(
        "END; $$;",
        () =>
          "PERFORM public.pms_assert_reservation_room_pairing( _restaurant_id, _unit_id, _room_id, _room_just_selected => NOT EXISTS ( SELECT 1 FROM public.hotel_reservation_rooms held WHERE held.id = _unit_id AND held.restaurant_id = _restaurant_id AND held.room_id = _room_id ) ); END; $$;",
      ),
    );
  });

  it("wires pair enforcement into the unit table, the pair table and the link table", () => {
    expect(code).toMatch(
      /CREATE CONSTRAINT TRIGGER trg_hotel_reservation_rooms_pairing\s+AFTER INSERT OR UPDATE OF room_id\s+ON public\.hotel_reservation_rooms\s+DEFERRABLE INITIALLY DEFERRED/,
    );
    expect(code).toMatch(/trg_hotel_reservation_room_pairs_assignment\s+AFTER INSERT ON public\.hotel_reservation_room_pairs/);
    expect(code).toMatch(/trg_hotel_reservation_rooms_pair_dates\s+AFTER UPDATE OF arrival_date, departure_date/);
    expect(code).toMatch(/trg_hotel_room_links_in_use\s+BEFORE UPDATE OR DELETE\s+ON public\.hotel_room_links/);
  });

  it("keeps every new function hardened with explicit revokes", () => {
    const defs = [...code.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(/g)].map((m) => m[1]!);
    expect(defs).toEqual([
      "pms_evaluate_room_pairing",
      "pms_assert_reservation_room_pairing",
      "assert_reservation_room_unit_room",
      "pms_enforce_room_unit_pairing",
      "pms_enforce_room_pair_assignment",
      "pms_guard_reservation_room_pair_dates",
      "pms_guard_room_link_in_use",
    ]);
    for (const name of defs) {
      const body = functionSource(migration, name);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path TO 'public'");
      if (name !== "assert_reservation_room_unit_room") {
        expect(code).toMatch(
          new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated`),
        );
      }
    }
    for (const name of ["pms_evaluate_room_pairing", "pms_assert_reservation_room_pairing"]) {
      expect(code).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\)\\s+TO service_role`),
      );
    }
    expect(code).not.toMatch(/GRANT [^;]* TO (anon|authenticated|PUBLIC)/);
  });
});

type Db = {
  exec: (sql: string) => Promise<unknown>;
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

async function loadPglite(): Promise<(new () => Db) | null> {
  const specifier = process.env["PGLITE_MODULE"] ?? "@electric-sql/pglite";
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
CREATE TABLE public.restaurant_users (
  id uuid PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES public.restaurants(id)
);
CREATE TABLE public.room_types (
  id uuid PRIMARY KEY, restaurant_id uuid, max_occupancy integer,
  accessible_eligible boolean NOT NULL DEFAULT false
);
CREATE TABLE public.room_amenities (id uuid PRIMARY KEY, restaurant_id uuid, name text, code text, category text);
CREATE TABLE public.room_type_amenities (restaurant_id uuid, room_type_id uuid, amenity_id uuid);
CREATE TABLE public.hotel_room_amenity_overrides (restaurant_id uuid, room_id uuid, amenity_id uuid, kind text);
CREATE TABLE public.room_type_beds (restaurant_id uuid, room_type_id uuid, bed_type text);
CREATE TABLE public.hotel_rooms (
  id uuid PRIMARY KEY, restaurant_id uuid, room_type_id uuid, room_number text,
  active boolean DEFAULT true, status text DEFAULT 'available', sellable boolean DEFAULT true,
  accessible boolean DEFAULT false, housekeeping_status text DEFAULT 'clean',
  maintenance_status text DEFAULT 'normal', building_id uuid, floor_id uuid
);
CREATE TABLE public.hotel_room_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid, kind text, room_id uuid, other_room_id uuid
);
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
  special_requests text, notes text, status text DEFAULT 'confirmed', updated_at timestamptz,
  confirmation_number text, pms_group_id uuid, group_account_master_id uuid,
  UNIQUE (id, restaurant_id)
);
CREATE TABLE public.hotel_reservation_rooms (
  id uuid PRIMARY KEY, restaurant_id uuid, reservation_id uuid, unit_sequence integer,
  room_type_id uuid, room_id uuid,
  arrival_date date, departure_date date, adults integer, children integer,
  status text DEFAULT 'confirmed',
  accessible_room_required boolean NOT NULL DEFAULT false,
  connecting_room_required boolean NOT NULL DEFAULT false,
  CONSTRAINT hotel_reservation_rooms_id_restaurant_unique UNIQUE (id, restaurant_id)
);
CREATE TABLE public.hotel_reservation_counters (restaurant_id uuid PRIMARY KEY, last_number integer);
CREATE TABLE public.hotel_reservation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid, reservation_id uuid, event_type text,
  previous_values jsonb, new_values jsonb, notes text, actor_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_reservation_history_event_check CHECK (event_type IS NOT NULL)
);
CREATE TABLE public.pms_group_rooming_rows (
  id uuid PRIMARY KEY, restaurant_id uuid NOT NULL, group_id uuid NOT NULL,
  guest_name text NOT NULL, arrival_date date NOT NULL, departure_date date NOT NULL,
  reservation_id uuid, status text NOT NULL DEFAULT 'draft'
);
CREATE TABLE public.housekeeping_history (
  restaurant_id uuid, room_id uuid, event_type text,
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
CREATE FUNCTION public.rollup_hotel_reservation_status(_restaurant_id uuid, _reservation_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.hotel_reservations r
  SET room_id = (SELECT u.room_id FROM public.hotel_reservation_rooms u
                 WHERE u.reservation_id = r.id ORDER BY u.unit_sequence LIMIT 1),
      status = (SELECT u.status FROM public.hotel_reservation_rooms u
                WHERE u.reservation_id = r.id ORDER BY u.unit_sequence LIMIT 1)
  WHERE r.id = _reservation_id
$$;
CREATE FUNCTION public.open_folio_for_reservation(uuid, uuid, uuid)
RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.pms_housekeeping_transition_target(uuid, text, text)
RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
`;

const P = "00000000-0000-0000-0000-0000000000a1";
const TYPE = "00000000-0000-0000-0000-0000000000b1";
const MEMBER = "00000000-0000-0000-0000-0000000000f1";
const GROUP = "00000000-0000-0000-0000-0000000000f2";
const uuid = (kind: string, n: number) =>
  `00000000-0000-0000-${kind}-${String(n).padStart(12, "0")}`;
const ROOM = (n: number) => uuid("0001", n);
const RES = (n: number) => uuid("0002", n);
const UNIT = (n: number) => uuid("0003", n);
const ARRIVAL = "2026-12-10";
const DEPARTURE = "2026-12-12";

// Rooms. 301-302-309 connect; 303-304 connect; 305 stands alone; 306/307 are
// adjacent only; 310 (accessible) connects to 311; 312/313 are both accessible
// and connect; 314 has a link to 315 which is out of service.
const ROOMS: Array<{ n: number; accessible?: boolean; status?: string }> = [
  { n: 301 },
  { n: 302 },
  { n: 303 },
  { n: 304 },
  { n: 305 },
  { n: 306 },
  { n: 307 },
  { n: 309 },
  { n: 310, accessible: true },
  { n: 311 },
  { n: 312, accessible: true },
  { n: 313, accessible: true },
  { n: 314 },
  { n: 315, status: "out_of_order" },
];
const LINKS: Array<[number, number, string]> = [
  [301, 302, "connecting"],
  [309, 302, "connecting"],
  [303, 304, "connecting"],
  [306, 307, "adjacent"],
  [310, 311, "connecting"],
  [312, 313, "connecting"],
  [314, 315, "connecting"],
];

type UnitSeed = {
  n: number;
  res?: number;
  seq?: number;
  room?: number | null;
  connecting?: boolean;
  accessible?: boolean;
  status?: string;
  arrival?: string;
  departure?: string;
};

describe.skipIf(!PGlite)("0213 pair enforcement, executed against the migration SQL", () => {
  let db: Db;
  const unitReservation = new Map<number, number>();

  async function failure(sql: string): Promise<string | null> {
    try {
      await db.exec(sql);
      return null;
    } catch (error) {
      try {
        await db.exec("ROLLBACK");
      } catch {
        /* no open transaction */
      }
      return (error as Error).message;
    }
  }

  async function setRules(rules: Record<string, boolean>) {
    await db.exec(`DELETE FROM public.pms_inventory_rules`);
    const columns = ["restaurant_id", ...Object.keys(rules)];
    const values = [`'${P}'`, ...Object.values(rules).map(String)];
    await db.exec(
      `INSERT INTO public.pms_inventory_rules (${columns.join(", ")}) VALUES (${values.join(", ")})`,
    );
  }

  /** Stored data as the app would leave it. Guards are off while seeding so a test can start from a legacy state. */
  async function seed(units: UnitSeed[], pairs: Array<[number, number]> = []) {
    unitReservation.clear();
    await db.exec(`
      ALTER TABLE public.hotel_reservation_rooms DISABLE TRIGGER USER;
      ALTER TABLE public.hotel_reservation_room_pairs DISABLE TRIGGER USER;
      DELETE FROM public.hotel_reservation_room_pairs;
      DELETE FROM public.hotel_reservation_history;
      DELETE FROM public.hotel_reservation_rooms;
      DELETE FROM public.hotel_reservations;
      DELETE FROM public.hotel_room_links;
      UPDATE public.hotel_rooms SET active = true;
    `);
    for (const [a, b, kind] of LINKS) {
      await db.exec(
        `INSERT INTO public.hotel_room_links (restaurant_id, kind, room_id, other_room_id)
         VALUES ('${P}', '${kind}', '${ROOM(a)}', '${ROOM(b)}')`,
      );
    }
    const reservationNumbers = [...new Set(units.map((unit) => unit.res ?? unit.n))];
    for (const reservation of reservationNumbers) {
      const own = units.filter((unit) => (unit.res ?? unit.n) === reservation);
      const first = own[0]!;
      await db.exec(`
        INSERT INTO public.hotel_reservations
          (id, restaurant_id, room_type_id, room_id, arrival_date, departure_date, adults, children, status, confirmation_number, pms_group_id)
        VALUES ('${RES(reservation)}', '${P}', '${TYPE}', ${first.room ? `'${ROOM(first.room)}'` : "NULL"},
                '${first.arrival ?? ARRIVAL}', '${first.departure ?? DEPARTURE}', 1, 0,
                '${first.status ?? "confirmed"}', 'C-${reservation}', '${GROUP}');
      `);
      for (const [index, unit] of own.entries()) {
        unitReservation.set(unit.n, reservation);
        await db.exec(`
          INSERT INTO public.hotel_reservation_rooms
            (id, restaurant_id, reservation_id, unit_sequence, room_type_id, room_id,
             arrival_date, departure_date, adults, children, status,
             accessible_room_required, connecting_room_required)
          VALUES ('${UNIT(unit.n)}', '${P}', '${RES(reservation)}', ${unit.seq ?? index + 1}, '${TYPE}',
                  ${unit.room ? `'${ROOM(unit.room)}'` : "NULL"},
                  '${unit.arrival ?? ARRIVAL}', '${unit.departure ?? DEPARTURE}', 1, 0,
                  '${unit.status ?? "confirmed"}', ${unit.accessible ?? false},
                  ${unit.connecting ?? pairs.some(([a, b]) => a === unit.n || b === unit.n)});
        `);
      }
    }
    for (const [a, b] of pairs) {
      const [low, high] = UNIT(a) < UNIT(b) ? [UNIT(a), UNIT(b)] : [UNIT(b), UNIT(a)];
      await db.exec(
        `INSERT INTO public.hotel_reservation_room_pairs (restaurant_id, unit_a_id, unit_b_id, created_by)
         VALUES ('${P}', '${low}', '${high}', '${MEMBER}')`,
      );
    }
    await db.exec(`
      ALTER TABLE public.hotel_reservation_rooms ENABLE TRIGGER USER;
      ALTER TABLE public.hotel_reservation_room_pairs ENABLE TRIGGER USER;
    `);
  }

  const assign = (unit: number, room: number | null) =>
    `SELECT public.assign_hotel_reservation_room_unit(
       '${P}', '${RES(unitReservation.get(unit)!)}', ${room ? `'${ROOM(room)}'` : "NULL"}, NULL, '${UNIT(unit)}')`;
  const checkIn = (unit: number) =>
    `SELECT public.check_in_hotel_reservation(
       '${P}', '${RES(unitReservation.get(unit)!)}', NULL, NULL, '${UNIT(unit)}')`;
  const move = (unit: number, room: number) =>
    `SELECT public.move_hotel_reservation_room(
       '${P}', '${RES(unitReservation.get(unit)!)}', '${ROOM(room)}', 'Rack move', NULL, '${UNIT(unit)}')`;
  const savePair = (unit: number, partner: number) =>
    `SELECT public.save_hotel_reservation_room_pair('${P}', '${UNIT(unit)}', '${UNIT(partner)}', '${MEMBER}')`;
  const evaluate = async (unit: number, room: number, partnerRoom?: number | null) =>
    (
      await db.query<{
        result: {
          paired: boolean;
          enforced: boolean;
          eligible: boolean;
          blockers: Array<{ code: string; partnerRoomNumber?: string }>;
          partner?: { partnerRoomNumber: string | null; partnerUnitSequence: number };
        };
      }>(
        `SELECT public.pms_evaluate_room_pairing('${P}', '${UNIT(unit)}', '${ROOM(room)}'
           ${partnerRoom === undefined ? "" : `, ${partnerRoom === null ? "NULL" : `'${ROOM(partnerRoom)}'`}, true`}) AS result`,
      )
    ).rows[0]!.result;
  const roomOf = async (unit: number) =>
    (
      await db.query<{ room_number: string | null }>(
        `SELECT r.room_number FROM public.hotel_reservation_rooms u
         LEFT JOIN public.hotel_rooms r ON r.id = u.room_id WHERE u.id = '${UNIT(unit)}'`,
      )
    ).rows[0]!.room_number;
  const activePairCount = async () =>
    Number(
      (
        await db.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM public.hotel_reservation_room_pairs WHERE ended_at IS NULL`,
        )
      ).rows[0]!.n,
    );

  const MISMATCH = "ROOM_CONNECTING_PAIR_MISMATCH";
  const INVALID = "ROOM_CONNECTING_PAIR_INVALID";
  const UNAVAILABLE = "ROOM_CONNECTING_PARTNER_UNAVAILABLE";
  const CAPABILITY = "ROOM_CONNECTING_REQUIREMENT_NOT_MET";
  const ACCESSIBLE = "ROOM_ACCESSIBILITY_REQUIREMENT_NOT_MET";

  beforeAll(async () => {
    const Ctor = PGlite as new () => Db;
    db = new Ctor();
    await db.exec(STUB_SCHEMA);
    await db.exec(functionSource(read("supabase/migrations/0155_room_unit_inventory_price.sql"), "assert_room_assignable"));
    await db.exec(read("supabase/migrations/0168_room_assignment_eligibility_qualification.sql"));
    await db.exec(functionSource(read("supabase/migrations/0172_reservation_overbooking.sql"), "assert_reservation_capacity"));
    const frontOffice = read("supabase/migrations/0156_room_unit_front_office.sql");
    for (const name of ["resolve_reservation_room_unit", "check_in_hotel_reservation", "move_hotel_reservation_room"]) {
      await db.exec(functionSource(frontOffice, name));
    }
    await db.exec(
      functionSource(read("supabase/migrations/0183_room_assignment_concurrency.sql"), "assign_hotel_reservation_room_unit"),
    );
    await db.exec(read("supabase/migrations/0205_room_assignment_hard_rule_consistency.sql"));
    await db.exec(read("supabase/migrations/0209_save_hotel_reservation_room_requirements.sql"));
    await db.exec(read("supabase/migrations/0210_room_requirement_final_enforcement.sql"));
    await db.exec(read("supabase/migrations/0212_reservation_room_pairs.sql"));
    await db.exec(migration);
    await db.exec(`
      INSERT INTO public.restaurants VALUES ('${P}', '2026-12-01', 'Europe/London');
      INSERT INTO public.restaurant_users VALUES ('${MEMBER}', '${P}');
      INSERT INTO public.pms_housekeeping_settings VALUES ('${P}', true, false, false);
      INSERT INTO public.room_types VALUES ('${TYPE}', '${P}', 4);
    `);
    for (const room of ROOMS) {
      await db.exec(
        `INSERT INTO public.hotel_rooms (id, restaurant_id, room_type_id, room_number, accessible, status)
         VALUES ('${ROOM(room.n)}', '${P}', '${TYPE}', '${room.n}', ${room.accessible ?? false}, '${room.status ?? "available"}')`,
      );
    }
    await setRules({ require_connecting_room_match: true });
  }, 120_000);

  it("exposes the new functions to service_role only", async () => {
    const grants = await db.query<{ fn: string; role: string; allowed: boolean }>(`
      SELECT fn, role, has_function_privilege(role, fn, 'EXECUTE') AS allowed
      FROM unnest(ARRAY[
        'public.pms_evaluate_room_pairing(uuid,uuid,uuid,uuid,boolean)',
        'public.pms_assert_reservation_room_pairing(uuid,uuid,uuid,boolean)',
        'public.pms_enforce_room_unit_pairing()',
        'public.pms_enforce_room_pair_assignment()',
        'public.pms_guard_reservation_room_pair_dates()',
        'public.pms_guard_room_link_in_use()'
      ]) AS fn,
      unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role`);
    for (const row of grants.rows) {
      const serverCallable = /room_pairing\(uuid|reservation_room_pairing\(uuid/.test(row.fn);
      expect(row.allowed, `${row.fn} ${row.role}`).toBe(serverCallable && row.role === "service_role");
    }
    await expect(
      db.exec(`SET ROLE authenticated; SELECT public.pms_evaluate_room_pairing('${P}', '${UNIT(1)}', '${ROOM(301)}')`),
    ).rejects.toThrow(/permission denied/i);
    await db.exec("RESET ROLE");
  });

  describe("partner already assigned", () => {
    it("allows a room physically connected to the partner's room", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2, room: 302 }], [[1, 2]]);
      expect(await failure(assign(1, 301))).toBeNull();
      expect(await roomOf(1)).toBe("301");
      const verdict = await evaluate(1, 309);
      expect(verdict).toMatchObject({ paired: true, enforced: true, eligible: true });
    });

    it("also allows the link read from the other side of the stored row", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2, room: 301 }], [[1, 2]]);
      expect(await failure(assign(1, 302))).toBeNull();
    });

    it("rejects a room that is not connected to the partner's room", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2, room: 302 }], [[1, 2]]);
      expect(await failure(assign(1, 303))).toContain(`${MISMATCH}[302]`);
      expect(await roomOf(1)).toBeNull();
      const verdict = await evaluate(1, 303);
      expect(verdict.eligible).toBe(false);
      expect(verdict.blockers).toEqual([{ code: "CONNECTING_PAIR_MISMATCH", partnerRoomNumber: "302" }]);
      expect(verdict.partner).toMatchObject({ partnerRoomNumber: "302", partnerUnitSequence: 1 });
    });

    it("does not treat an adjacent link as a connection", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2, room: 306 }], [[1, 2]]);
      // 307 has no connecting link at all, so the capability rule refuses it first.
      expect(await failure(assign(1, 307))).toContain(CAPABILITY);
      expect((await evaluate(1, 307)).blockers[0]).toMatchObject({ code: "CONNECTING_PAIR_MISMATCH" });
    });

    it("does not let a unit take the partner's own room", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2, room: 302 }], [[1, 2]]);
      expect((await evaluate(1, 302)).eligible).toBe(false);
    });
  });

  describe("partner not assigned yet", () => {
    it("allows a room with an eligible connected room, without holding that room", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2 }], [[1, 2]]);
      expect(await failure(assign(1, 301))).toBeNull();
      expect(await roomOf(2)).toBeNull();
      expect(await evaluate(1, 303)).toMatchObject({ eligible: true });
    });

    it("rejects a room with no connected room at all", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2 }], [[1, 2]]);
      // The capability rule (no connecting link) is reported first by the write path.
      expect(await failure(assign(1, 305))).toContain(CAPABILITY);
      expect(await roomOf(1)).toBeNull();
      expect((await evaluate(1, 305)).blockers).toEqual([{ code: "CONNECTING_PARTNER_UNAVAILABLE" }]);
    });

    it("rejects when every connected room is taken by another stay", async () => {
      await seed(
        [{ n: 1, res: 1 }, { n: 2, res: 2 }, { n: 3, res: 3, room: 304 }],
        [[1, 2]],
      );
      expect(await failure(assign(1, 303))).toContain(UNAVAILABLE);
    });

    it("rejects when the only connected room is held by a sibling of the partner's reservation", async () => {
      // Units 2 and 4 share a reservation; the evaluator excludes that whole
      // reservation, so the pair evaluator has to judge the sibling's claim.
      await seed(
        [{ n: 1, res: 1 }, { n: 2, res: 2 }, { n: 4, res: 2, room: 304 }],
        [[1, 2]],
      );
      expect(await failure(assign(1, 303))).toContain(UNAVAILABLE);
    });

    it("lets a unit move out of the room its partner would need", async () => {
      // Unit 1 holds 304 (cross-reservation) and goes to 303 while 304 is the only
      // room connected to 303: 304 is free for the partner once unit 1 leaves.
      await seed([{ n: 1, res: 1, room: 304 }, { n: 2, res: 2 }], [[1, 2]]);
      expect((await evaluate(1, 303)).eligible).toBe(true);
    });

    it("rejects when the connected room is inactive", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2 }], [[1, 2]]);
      await db.exec(`UPDATE public.hotel_rooms SET active = false WHERE id = '${ROOM(315)}'`);
      expect(await failure(assign(1, 314))).toContain(UNAVAILABLE);
    });

    it("judges the connected room by the partner unit's own accessible requirement", async () => {
      await setRules({ require_connecting_room_match: true, require_accessibility_match: true });
      // 311 is connected to 310 but is not accessible; unit 2 needs an accessible room.
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2, accessible: true }], [[1, 2]]);
      expect(await failure(assign(1, 310))).toContain(UNAVAILABLE);
      expect((await evaluate(1, 310)).eligible).toBe(false);
      // 312 and 313 are both accessible and connected.
      expect((await evaluate(1, 312)).eligible).toBe(true);
      await setRules({ require_connecting_room_match: true });
    });
  });

  describe("both assigned", () => {
    it("reports the current pair as no longer valid when the stored rooms are not connected", async () => {
      await seed(
        [{ n: 1, res: 1, room: 303 }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      const verdict = await evaluate(1, 303);
      expect(verdict.blockers).toEqual([{ code: "CONNECTING_PAIR_INVALID", partnerRoomNumber: "302" }]);
    });

    it("rejects check-in of a pair that is no longer connected", async () => {
      await seed(
        [{ n: 1, res: 1, room: 303 }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      expect(await failure(checkIn(1))).toContain(INVALID);
      expect(await failure(checkIn(2))).toContain(INVALID);
    });

    it("checks in a pair whose rooms are connected", async () => {
      await seed(
        [{ n: 1, res: 1, room: 301 }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      expect(await failure(checkIn(1))).toBeNull();
    });

    it("rejects check-in when the partner has no room and no connected room is left", async () => {
      await seed(
        [{ n: 1, res: 1, room: 303 }, { n: 2, res: 2 }, { n: 3, res: 3, room: 304 }],
        [[1, 2]],
      );
      expect(await failure(checkIn(1))).toContain(UNAVAILABLE);
    });
  });

  describe("Move Room", () => {
    it("moves a unit to another room connected to the partner and keeps the pair", async () => {
      await seed(
        [{ n: 1, res: 1, room: 301, status: "checked_in" }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      expect(await failure(move(1, 309))).toBeNull();
      expect(await roomOf(1)).toBe("309");
      expect(await activePairCount()).toBe(1);
    });

    it("refuses a target room that does not connect to the partner and keeps the pair", async () => {
      await seed(
        [{ n: 1, res: 1, room: 301, status: "checked_in" }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      expect(await failure(move(1, 303))).toContain(`${MISMATCH}[302]`);
      expect(await roomOf(1)).toBe("301");
      expect(await activePairCount()).toBe(1);
    });

    it("lets the pairing be removed first, then the non-connected room is allowed", async () => {
      await seed(
        [{ n: 1, res: 1, room: 301, status: "checked_in" }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      const pair = (await db.query<{ id: string }>(`SELECT id FROM public.hotel_reservation_room_pairs`)).rows[0]!.id;
      expect(
        await failure(
          `SELECT public.remove_hotel_reservation_room_pair('${P}', '${pair}', false, false, '${MEMBER}')`,
        ),
      ).toBeNull();
      expect(await failure(move(1, 305))).toBeNull();
    });
  });

  describe("every other writer is held to the pair", () => {
    it("rejects a direct unit update (rack, group, edit or any bypass)", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2, room: 302 }], [[1, 2]]);
      expect(
        await failure(`UPDATE public.hotel_reservation_rooms SET room_id = '${ROOM(303)}' WHERE id = '${UNIT(1)}'`),
      ).toContain(MISMATCH);
      expect(await roomOf(1)).toBeNull();
      expect(
        await failure(`UPDATE public.hotel_reservation_rooms SET room_id = '${ROOM(301)}' WHERE id = '${UNIT(1)}'`),
      ).toBeNull();
    });

    it("judges a swap inside one transaction on its final state", async () => {
      // Units 1 and 2 are paired and hold 301 and 302. Swapping them leaves the same two
      // connected rooms, so the intermediate state (both on 302) must not matter.
      await seed(
        [{ n: 1, res: 1, room: 301 }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      expect(
        await failure(`
          BEGIN;
          UPDATE public.hotel_reservation_rooms SET room_id = NULL WHERE id IN ('${UNIT(1)}', '${UNIT(2)}');
          UPDATE public.hotel_reservation_rooms SET room_id = '${ROOM(302)}' WHERE id = '${UNIT(1)}';
          UPDATE public.hotel_reservation_rooms SET room_id = '${ROOM(301)}' WHERE id = '${UNIT(2)}';
          COMMIT;
        `),
      ).toBeNull();
      expect(await roomOf(1)).toBe("302");
      expect(await roomOf(2)).toBe("301");
    });

    it("rolls a swap back when its final state breaks the pair", async () => {
      // Unit 3 is unpaired and sits in 303. Swapping unit 1 with it would leave unit 1
      // in 303, which is connected only to 304, not to unit 2's 302.
      await seed(
        [{ n: 1, res: 1, room: 301 }, { n: 2, res: 2, room: 302 }, { n: 3, res: 3, room: 303 }],
        [[1, 2]],
      );
      expect(
        await failure(`
          BEGIN;
          UPDATE public.hotel_reservation_rooms SET room_id = '${ROOM(303)}' WHERE id = '${UNIT(1)}';
          UPDATE public.hotel_reservation_rooms SET room_id = '${ROOM(301)}' WHERE id = '${UNIT(3)}';
          COMMIT;
        `),
      ).toContain(MISMATCH);
      expect(await roomOf(1)).toBe("301");
      expect(await roomOf(3)).toBe("303");
    });

    it("evaluates a hypothetical swap result before anything is written", async () => {
      await seed(
        [{ n: 1, res: 1, room: 301 }, { n: 2, res: 2, room: 302 }, { n: 3, res: 3, room: 303 }],
        [[1, 2]],
      );
      // Unit 1 would take 303 while its partner stays in 302.
      expect((await evaluate(1, 303, 302)).blockers[0]).toMatchObject({ code: "CONNECTING_PAIR_MISMATCH" });
      // The partners swapping with each other keep two connected rooms.
      expect((await evaluate(1, 302, 301)).eligible).toBe(true);
      expect((await evaluate(2, 301, 302)).eligible).toBe(true);
    });
  });

  describe("pair creation over assigned units", () => {
    it("accepts units that already hold connected rooms", async () => {
      await seed([{ n: 1, res: 1, room: 301 }, { n: 2, res: 2, room: 302 }]);
      expect(await failure(savePair(1, 2))).toBeNull();
    });

    it("refuses units whose rooms are not connected and writes nothing", async () => {
      await seed([{ n: 1, res: 1, room: 303 }, { n: 2, res: 2, room: 302 }]);
      expect(await failure(savePair(1, 2))).toContain(INVALID);
      expect(await activePairCount()).toBe(0);
    });

    it("refuses a unit whose room leaves the unassigned partner without a connected room", async () => {
      await seed([{ n: 1, res: 1, room: 303 }, { n: 2, res: 2 }, { n: 3, res: 3, room: 304 }]);
      expect(await failure(savePair(1, 2))).toContain(UNAVAILABLE);
      expect(await activePairCount()).toBe(0);
    });
  });

  describe("unpaired and ended pairs", () => {
    it("keeps the capability-only rule for an unpaired connecting requirement", async () => {
      await seed([{ n: 1, res: 1, connecting: true }]);
      // 301 has a link: allowed whatever happens to its neighbours.
      expect(await failure(assign(1, 301))).toBeNull();
      await seed([{ n: 1, res: 1, connecting: true }, { n: 3, res: 3, room: 302 }]);
      expect(await failure(assign(1, 301))).toBeNull();
      // No physical connecting link at all: the 0210 capability error, not a pair error.
      await seed([{ n: 1, res: 1, connecting: true }]);
      expect(await failure(assign(1, 305))).toContain(CAPABILITY);
      // An adjacent-only room has no connecting capability.
      expect(await failure(assign(1, 306))).toContain(CAPABILITY);
    });

    it("never enforces a pair when the property connecting rule is off", async () => {
      await setRules({ require_connecting_room_match: false });
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2, room: 302 }], [[1, 2]]);
      expect(await failure(assign(1, 305))).toBeNull();
      expect(await evaluate(1, 305)).toMatchObject({ paired: true, enforced: false, eligible: true });
      await setRules({ require_connecting_room_match: true });
    });

    it("stops enforcing once the pair is removed", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2, room: 302 }], [[1, 2]]);
      const pair = (await db.query<{ id: string }>(`SELECT id FROM public.hotel_reservation_room_pairs`)).rows[0]!.id;
      await db.exec(
        `SELECT public.remove_hotel_reservation_room_pair('${P}', '${pair}', true, true, '${MEMBER}')`,
      );
      // The pair is gone, so 303 (connected to 304, not to 302) is fine. The requirement was
      // kept, so the capability-only rule still applies to the unit.
      expect(await failure(assign(1, 303))).toBeNull();
      expect(await failure(assign(1, 305))).toContain(CAPABILITY);
    });

    it("stops enforcing when a unit is cancelled, without re-enforcing the ended pair", async () => {
      await seed([{ n: 1, res: 1, room: 301 }, { n: 2, res: 2, room: 302 }], [[1, 2]]);
      await db.exec(`UPDATE public.hotel_reservation_rooms SET status = 'cancelled' WHERE id = '${UNIT(2)}'`);
      expect(await activePairCount()).toBe(0);
      expect(await failure(move(1, 305))).not.toContain(MISMATCH);
      expect((await evaluate(1, 305)).paired).toBe(false);
    });

    it("does not enforce a pair whose partner is no longer active", async () => {
      await seed(
        [{ n: 1, res: 1, room: 301 }, { n: 2, res: 2, room: 302, status: "checked_out" }],
        [[1, 2]],
      );
      expect(await evaluate(1, 305)).toMatchObject({ paired: true, enforced: false, eligible: true });
    });
  });

  describe("accessibility and multi-room requirements", () => {
    it("still enforces an accessible requirement independently of the pair", async () => {
      await setRules({ require_connecting_room_match: true, require_accessibility_match: true });
      await seed(
        [{ n: 1, res: 1, accessible: true }, { n: 2, res: 2, room: 311 }],
        [[1, 2]],
      );
      // 301 is connected... but not to 311; 310 is accessible and connected to 311.
      expect(await failure(assign(1, 301))).toContain(ACCESSIBLE);
      expect(await failure(assign(1, 310))).toBeNull();
      await setRules({ require_connecting_room_match: true });
    });

    it("does not leak one room's requirement or pair onto another room of the reservation", async () => {
      await setRules({ require_connecting_room_match: true, require_accessibility_match: true });
      // One reservation, three rooms: 1 and 2 are paired, 2 needs an accessible room,
      // 3 requires nothing. Reservation 9 holds the partner.
      await seed(
        [
          { n: 1, res: 1, seq: 1 },
          { n: 5, res: 1, seq: 2, accessible: true },
          { n: 3, res: 1, seq: 3 },
          { n: 2, res: 2, room: 302 },
        ],
        [[1, 2]],
      );
      // Unit 3 is not paired and needs nothing: any room, including a plain unlinked one.
      expect(await failure(assign(3, 306))).toBeNull();
      // Unit 5 needs an accessible room only: it is not held to unit 1's pair.
      expect(await failure(assign(5, 312))).toBeNull();
      expect(await failure(assign(5, 305))).toContain(ACCESSIBLE);
      // Unit 1 is held to its partner, but not to unit 5's accessible requirement.
      expect(await failure(assign(1, 301))).toBeNull();
      await setRules({ require_connecting_room_match: true });
    });
  });

  describe("date changes", () => {
    it("refuses a date change that leaves paired units without overlapping nights", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2 }], [[1, 2]]);
      expect(
        await failure(
          `UPDATE public.hotel_reservation_rooms SET arrival_date = '2026-12-12', departure_date = '2026-12-14' WHERE id = '${UNIT(1)}'`,
        ),
      ).toContain("ROOM_PAIR_STAYS_DO_NOT_OVERLAP");
      expect(await activePairCount()).toBe(1);
    });

    it("allows a date change that still overlaps", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2 }], [[1, 2]]);
      expect(
        await failure(
          `UPDATE public.hotel_reservation_rooms SET departure_date = '2026-12-14' WHERE id = '${UNIT(1)}'`,
        ),
      ).toBeNull();
    });

    it("allows both paired units of one reservation to move together in one statement", async () => {
      await seed(
        [{ n: 1, res: 1, seq: 1 }, { n: 2, res: 1, seq: 2 }],
        [[1, 2]],
      );
      expect(
        await failure(
          `UPDATE public.hotel_reservation_rooms SET arrival_date = '2027-01-10', departure_date = '2027-01-12' WHERE reservation_id = '${RES(1)}'`,
        ),
      ).toBeNull();
      expect(await activePairCount()).toBe(1);
    });

    it("refuses moving one reservation away from a paired unit of another reservation", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2 }], [[1, 2]]);
      expect(
        await failure(
          `UPDATE public.hotel_reservation_rooms SET arrival_date = '2027-01-10', departure_date = '2027-01-12' WHERE reservation_id = '${RES(1)}'`,
        ),
      ).toContain("ROOM_PAIR_STAYS_DO_NOT_OVERLAP");
    });

    it("ignores a date change on an unpaired or ended pair", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2 }]);
      expect(
        await failure(
          `UPDATE public.hotel_reservation_rooms SET arrival_date = '2027-01-10', departure_date = '2027-01-12' WHERE id = '${UNIT(1)}'`,
        ),
      ).toBeNull();
    });
  });

  describe("physical link deletion guard", () => {
    const deleteLink = (a: number, b: number) =>
      `DELETE FROM public.hotel_room_links WHERE (room_id = '${ROOM(a)}' AND other_room_id = '${ROOM(b)}') OR (room_id = '${ROOM(b)}' AND other_room_id = '${ROOM(a)}')`;

    it("blocks removing the connecting link an active paired stay uses", async () => {
      await seed(
        [{ n: 1, res: 1, room: 301 }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      expect(await failure(deleteLink(301, 302))).toContain("ROOM_LINK_USED_BY_ACTIVE_PAIR");
      expect(await failure(deleteLink(302, 301))).toContain("ROOM_LINK_USED_BY_ACTIVE_PAIR");
      expect(
        await failure(`UPDATE public.hotel_room_links SET kind = 'adjacent' WHERE room_id = '${ROOM(301)}'`),
      ).toContain("ROOM_LINK_USED_BY_ACTIVE_PAIR");
      expect(
        await db.query(`SELECT 1 FROM public.hotel_room_links WHERE room_id = '${ROOM(301)}'`).then((r) => r.rows.length),
      ).toBe(1);
    });

    it("allows removing links the pair is not using", async () => {
      await seed(
        [{ n: 1, res: 1, room: 301 }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      // 309 is also linked to 302 but unit 1 is in 301.
      expect(await failure(deleteLink(309, 302))).toBeNull();
      expect(await failure(deleteLink(303, 304))).toBeNull();
    });

    it("never blocks an adjacent link", async () => {
      await seed(
        [{ n: 1, res: 1, room: 306 }, { n: 2, res: 2, room: 307 }],
        [[1, 2]],
      );
      expect(await failure(deleteLink(306, 307))).toBeNull();
    });

    it("allows removal when a unit holds no room, the pair has ended or a unit is inactive", async () => {
      await seed([{ n: 1, res: 1 }, { n: 2, res: 2, room: 302 }], [[1, 2]]);
      expect(await failure(deleteLink(301, 302))).toBeNull();
      await seed(
        [{ n: 1, res: 1, room: 301 }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      const pair = (await db.query<{ id: string }>(`SELECT id FROM public.hotel_reservation_room_pairs`)).rows[0]!.id;
      await db.exec(
        `SELECT public.remove_hotel_reservation_room_pair('${P}', '${pair}', true, true, '${MEMBER}')`,
      );
      expect(await failure(deleteLink(301, 302))).toBeNull();
    });

    it("blocks removal while a checked-in unit is on the link", async () => {
      await seed(
        [{ n: 1, res: 1, room: 301, status: "checked_in" }, { n: 2, res: 2, room: 302 }],
        [[1, 2]],
      );
      expect(await failure(deleteLink(301, 302))).toContain("ROOM_LINK_USED_BY_ACTIVE_PAIR");
    });
  });
});
