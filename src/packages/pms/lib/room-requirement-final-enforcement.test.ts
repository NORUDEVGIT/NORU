import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACCESSIBLE_REQUIRED_REJECTION,
  CONNECTING_REQUIRED_REJECTION,
  requirementRejectionFromError,
} from "./room-requirement-rejection";
import { roomInventoryAutoAssignment } from "./guest-group-auto-assignment";
import { assignmentAvailabilityMessage, ROOM_NO_LONGER_AVAILABLE } from "./reservation-detail-rooms";
import { pendingRequirementSave, retryPendingRequirementSave } from "./reservation-room-requirements";
import { reservationError } from "./reservations.server";

/**
 * Phase 3B: the final room write paths enforce the stored room unit
 * requirements (accessible_room_required, connecting_room_required).
 *
 * The behaviour checks execute the real SQL from the migrations (0155, 0156,
 * 0168, 0172, 0183, 0205, 0209, 0210) in an in-process Postgres (PGlite). Run:
 *
 *   mkdir /tmp/pgl && cd /tmp/pgl && npm i @electric-sql/pglite
 *   PGLITE_MODULE=/tmp/pgl/node_modules/@electric-sql/pglite/dist/index.js \
 *     npx vitest run src/packages/pms/lib/room-requirement-final-enforcement.test.ts
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const MIGRATION = "supabase/migrations/0210_room_requirement_final_enforcement.sql";
const migration = read(MIGRATION);

function functionSource(sql: string, name: string): string {
  const match = new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}\\(`).exec(sql);
  if (!match) throw new Error(`${name} not found`);
  const end = sql.indexOf("\n$$;", match.index);
  return sql.slice(match.index, end + 4);
}

describe("0210 migration source", () => {
  it("is mirrored byte for byte in both migration lanes", () => {
    expect(read("drizzle/migrations/0210_room_requirement_final_enforcement.sql")).toBe(migration);
  });

  it("extends the existing helper and asks the canonical evaluator once", () => {
    const helper = functionSource(migration, "pms_assert_room_assignment_hard_rules");
    expect(helper.match(/public\.pms_evaluate_room_assignment\(/g)).toHaveLength(1);
    expect(helper).toContain("_accessible_required => accessibility_rule_on");
    expect(helper).toContain("_connecting_required => connecting_rule_on");
    expect(helper).toContain("'ACCESSIBILITY_MISMATCH'");
    expect(helper).toContain("'CONNECTING_ROOM_REQUIRED'");
    // No capability logic is copied out of the evaluator.
    expect(helper).not.toMatch(/hotel_room_links|room\.accessible|accessible_eligible|amenit/);
    const code = migration.replace(/^\s*--.*$/gm, "");
    expect(code).not.toMatch(/hotel_room_links|accessible_eligible/);
  });

  it("reads requirement values from the stored room unit, never from a caller argument", () => {
    for (const name of [
      "assert_reservation_room_unit_room",
      "assert_reservation_room_units",
      "amend_hotel_reservation",
    ]) {
      const body = functionSource(migration, name);
      expect(body).toMatch(/accessible_room_required/);
      expect(body).toMatch(/connecting_room_required/);
    }
    expect(functionSource(migration, "assert_reservation_room_unit_room")).not.toMatch(
      /\n {2}_accessible_required boolean/,
    );
  });

  it("refuses to guess the unit for a multi-room amend room change", () => {
    const amend = functionSource(migration, "amend_hotel_reservation");
    expect(amend).toMatch(/IF unit_count > 1 THEN\s+RAISE EXCEPTION 'ROOM_UNIT_REQUIRED'/);
  });

  it("keeps every SECURITY DEFINER function hardened", () => {
    const defs = [...migration.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(/g)].map(
      (m) => m[1]!,
    );
    expect(defs).toEqual([
      "pms_assert_room_assignment_hard_rules",
      "assert_reservation_room_units",
      "assert_reservation_room_unit_room",
      "amend_hotel_reservation",
      "pms_enforce_room_unit_requirements",
    ]);
    for (const name of defs) {
      const body = functionSource(migration, name);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path TO 'public'");
    }
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.pms_assert_room_assignment_hard_rules\([^)]*\)\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.pms_assert_room_assignment_hard_rules\([^)]*\)\s+TO service_role/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.pms_enforce_room_unit_requirements\(\)\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).not.toMatch(/GRANT [^;]* TO (anon|authenticated|PUBLIC)/);
  });

  it("does not redefine 0205 neighbours it does not need, or the 0209 save", () => {
    for (const name of [
      "assert_room_assignable",
      "pms_evaluate_room_assignment",
      "save_hotel_reservation_room_requirements",
      "assign_hotel_reservation_room_unit",
      "check_in_hotel_reservation",
      "move_hotel_reservation_room",
    ]) {
      expect(migration).not.toContain(`FUNCTION public.${name}(`);
    }
    expect(migration).not.toMatch(/ALTER TABLE|hotel_rooms SET|UPDATE public\.hotel_rooms/);
  });

  it("raises only staff-mapped domain codes", () => {
    const raised = new Set([...migration.matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g)].map((m) => m[1]));
    expect(raised).toEqual(
      new Set([
        "ROOM_ACCESSIBILITY_REQUIREMENT_NOT_MET",
        "ROOM_CONNECTING_REQUIREMENT_NOT_MET",
        "ROOM_CAPACITY_EXCEEDED",
        "ROOM_HOUSEKEEPING_NOT_READY",
        "ROOM_ALREADY_BOOKED",
        "NO_AVAILABILITY",
        "RESERVATION_NOT_FOUND",
        "RESERVATION_CANCELLED",
        "ROOM_UNIT_REQUIRED",
      ]),
    );
  });
});

describe("staff wording for refused requirements", () => {
  it("maps both codes in the reservation error table", () => {
    expect(reservationError("ROOM_ACCESSIBILITY_REQUIREMENT_NOT_MET").message).toBe(
      ACCESSIBLE_REQUIRED_REJECTION,
    );
    expect(reservationError("ROOM_CONNECTING_REQUIREMENT_NOT_MET").message).toBe(
      CONNECTING_REQUIRED_REJECTION,
    );
  });

  it("puts the two codes in the rates error table too", () => {
    const source = read("src/packages/pms/lib/rates.server.ts");
    expect(source).toMatch(/RATE_ERRORS[^\n]*= \{\n {2}\.\.\.REQUIREMENT_WRITE_ERRORS,/);
  });

  it("recognises raw codes and mapped sentences, nothing else", () => {
    expect(requirementRejectionFromError("ERROR: ROOM_ACCESSIBILITY_REQUIREMENT_NOT_MET")).toBe(
      ACCESSIBLE_REQUIRED_REJECTION,
    );
    expect(requirementRejectionFromError(new Error(CONNECTING_REQUIRED_REJECTION))).toBe(
      CONNECTING_REQUIRED_REJECTION,
    );
    expect(requirementRejectionFromError("ROOM_ALREADY_BOOKED")).toBeNull();
    expect(requirementRejectionFromError(null)).toBeNull();
  });

  it("is never replaced by the generic unavailable sentence", () => {
    expect(assignmentAvailabilityMessage(ACCESSIBLE_REQUIRED_REJECTION)).toBe(
      ACCESSIBLE_REQUIRED_REJECTION,
    );
    expect(assignmentAvailabilityMessage(CONNECTING_REQUIRED_REJECTION)).toBe(
      CONNECTING_REQUIRED_REJECTION,
    );
    expect(assignmentAvailabilityMessage("That room is not eligible")).toBe(ROOM_NO_LONGER_AVAILABLE);
    const source = read("src/packages/pms/lib/reservations.functions.ts");
    const start = source.indexOf("function assignmentWriteError(");
    const body = source.slice(start, source.indexOf("\n}\n", start));
    expect(body.indexOf("requirementRejectionFromError")).toBeGreaterThan(0);
    expect(body.indexOf("requirementRejectionFromError")).toBeLessThan(
      body.indexOf("ROOM_ASSIGNMENT_UNAVAILABLE"),
    );
  });

  it("carries the requirement sentence into the create recovery state", async () => {
    const intended = [{ accessibleRoomRequired: true, connectingRoomRequired: false }];
    const pending = pendingRequirementSave(
      {
        id: "r1",
        confirmationNumber: "C1",
        roomRequirements: { complete: false, reason: ACCESSIBLE_REQUIRED_REJECTION },
      },
      intended,
    );
    expect(pending?.reason).toBe(ACCESSIBLE_REQUIRED_REJECTION);
    const retried = await retryPendingRequirementSave(
      { reservationId: "r1", confirmationNumber: "C1", intended },
      async () => ({ complete: false, reason: CONNECTING_REQUIRED_REJECTION }),
    );
    expect(retried?.reason).toBe(CONNECTING_REQUIRED_REJECTION);
  });
});

describe("app wiring passes the actual room unit to final enforcement", () => {
  it("rack move commit sends the dragged unit", () => {
    const sheet = read("src/packages/pms/components/frontoffice/fo-rack-confirm-sheet.tsx");
    const start = sheet.indexOf('draft.kind === "move_room") {\n        return move(');
    expect(start).toBeGreaterThan(0);
    expect(sheet.slice(start, start + 600)).toContain(
      "...(draft.reservationRoomId ? { reservationRoomId: draft.reservationRoomId } : {})",
    );
  });

  it("group assign forwards the unit and swap passes each side's unit", () => {
    const source = read("src/packages/pms/lib/guest-group-detail.functions.ts");
    expect(source).toMatch(
      /await assignReservationRoom\(\{\s+data: \{[^}]*\.\.\.\(data\.reservationRoomId \? \{ reservationRoomId: data\.reservationRoomId \} : \{\}\)/,
    );
    const swap = source.slice(
      source.indexOf("export const swapGroupRooms"),
      source.indexOf("export const bulkAssignGroupRooms"),
    );
    expect(swap.match(/reservationId: a\.id,\s+\.\.\.\(unitA \? \{ reservationRoomId: unitA \} : \{\}\)/g)).toHaveLength(3);
    expect(swap.match(/reservationId: b\.id,\s+\.\.\.\(unitB \? \{ reservationRoomId: unitB \} : \{\}\)/g)).toHaveLength(4);
    expect(source).toContain("groupAssignmentNeeds(db, data.restaurantId, open)");
  });

  it("Create checks the draft requirement before the reservation exists", () => {
    const source = read("src/packages/pms/lib/reservations.functions.ts");
    const check = source.indexOf("await assertDraftRoomRequirementsMet(context.supabase, {");
    const create = source.indexOf('supabaseAdmin.rpc("create_hotel_reservation_priced", pricedArgs)');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(create);
  });

  it("Edit checks the new requirement values before any write", () => {
    const source = read("src/packages/pms/lib/reservations.functions.ts");
    const start = source.indexOf("async function applyUnitScopedReservationEdit(");
    const body = source.slice(start, source.indexOf("\nexport ", start));
    const check = body.indexOf("await assertDraftRoomRequirementsMet(input.supabaseAdmin");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(body.indexOf('db.rpc("amend_hotel_reservation_priced"'));
    expect(check).toBeLessThan(body.indexOf('db.rpc("assign_hotel_reservation_room_unit"'));
  });
});

describe("group auto-assign builds one need per room unit", () => {
  const room = (id: string) => ({ id, roomNumber: id }) as never;

  it("asks for candidates per unit and returns the unit with each proposal", async () => {
    const asked: Array<string | undefined> = [];
    const results = await roomInventoryAutoAssignment.propose({
      restaurantId: "p",
      needs: [
        need("res-1", "unit-1"),
        need("res-1", "unit-2"),
      ],
      inventory: {
        listAssignableRooms: async (input) => {
          asked.push(input.reservationRoomId);
          // Unit 2 requires an accessible room; only 102 qualifies for it.
          return input.reservationRoomId === "unit-2" ? [room("102")] : [room("101"), room("102")];
        },
      },
    });
    expect(asked).toEqual(["unit-1", "unit-2"]);
    expect(results.map((row) => [row.reservationRoomId, row.roomId])).toEqual([
      ["unit-1", "101"],
      ["unit-2", "102"],
    ]);
  });

  it("never offers a sibling unit's current room", async () => {
    const results = await roomInventoryAutoAssignment.propose({
      restaurantId: "p",
      needs: [need("res-1", "unit-1"), { ...need("res-1", "unit-2"), currentRoomId: "101" }],
      inventory: { listAssignableRooms: async () => [room("101")] },
    });
    expect(results[0]).toMatchObject({ reservationRoomId: "unit-1", assigned: false, roomId: null });
  });

  function need(reservationId: string, reservationRoomId: string) {
    return {
      reservationId,
      reservationRoomId,
      roomTypeId: "t",
      arrival: "2026-12-10",
      departure: "2026-12-12",
      adults: 1,
      children: 0,
      currentRoomId: null,
      preferenceNote: null,
    };
  }
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
CREATE TABLE public.room_types (
  id uuid PRIMARY KEY, restaurant_id uuid, max_occupancy integer,
  accessible_eligible boolean NOT NULL DEFAULT false
);
CREATE TABLE public.room_amenities (id uuid PRIMARY KEY, restaurant_id uuid, name text, code text, category text);
CREATE TABLE public.room_type_amenities (restaurant_id uuid, room_type_id uuid, amenity_id uuid);
CREATE TABLE public.hotel_room_amenity_overrides (restaurant_id uuid, room_id uuid, amenity_id uuid, kind text);
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
  special_requests text, notes text, status text DEFAULT 'confirmed', updated_at timestamptz
);
CREATE TABLE public.hotel_reservation_rooms (
  id uuid PRIMARY KEY, restaurant_id uuid, reservation_id uuid, unit_sequence integer,
  room_type_id uuid, room_id uuid,
  arrival_date date, departure_date date, adults integer, children integer,
  status text DEFAULT 'confirmed',
  accessible_room_required boolean NOT NULL DEFAULT false,
  connecting_room_required boolean NOT NULL DEFAULT false
);
CREATE TABLE public.hotel_reservation_counters (restaurant_id uuid PRIMARY KEY, last_number integer);
CREATE TABLE public.hotel_reservation_history (
  restaurant_id uuid, reservation_id uuid, event_type text,
  previous_values jsonb, new_values jsonb, notes text, actor_membership_id uuid
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

const IDS = {
  property: "00000000-0000-0000-0000-0000000000a1",
  type: "00000000-0000-0000-0000-0000000000b1",
  typeTwin: "00000000-0000-0000-0000-0000000000b2",
  roomAccessible: "00000000-0000-0000-0000-0000000000c1",
  roomPlain: "00000000-0000-0000-0000-0000000000c2",
  roomLinked: "00000000-0000-0000-0000-0000000000c3",
  roomLinkPartner: "00000000-0000-0000-0000-0000000000c4",
  roomAccessibleDirty: "00000000-0000-0000-0000-0000000000c5",
  roomTwin: "00000000-0000-0000-0000-0000000000c6",
  roomPlain2: "00000000-0000-0000-0000-0000000000c7",
  reservation: "00000000-0000-0000-0000-0000000000d1",
  reservationB: "00000000-0000-0000-0000-0000000000d2",
  unit1: "00000000-0000-0000-0000-0000000000e1",
  unit2: "00000000-0000-0000-0000-0000000000e2",
  unitB: "00000000-0000-0000-0000-0000000000e3",
};
const ARRIVAL = "2026-12-10";
const DEPARTURE = "2026-12-12";
const ACCESSIBLE = "ROOM_ACCESSIBILITY_REQUIREMENT_NOT_MET";
const CONNECTING = "ROOM_CONNECTING_REQUIREMENT_NOT_MET";

type Rules = Partial<
  Record<
    | "require_accessibility_match"
    | "require_connecting_room_match"
    | "require_occupancy_match"
    | "require_housekeeping_readiness"
    | "require_room_type_match"
    | "require_maintenance_availability",
    boolean
  >
>;

type UnitSeed = {
  id: string;
  sequence?: number;
  reservationId?: string;
  roomId: string | null;
  accessible?: boolean;
  connecting?: boolean;
  status?: string;
  adults?: number;
};

describe.skipIf(!PGlite)("room requirements, executed against the migration SQL", () => {
  let db: Db;

  async function failure(sql: string): Promise<string | null> {
    try {
      await db.exec(sql);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  }

  async function setRules(rules: Rules) {
    await db.exec(`DELETE FROM public.pms_inventory_rules`);
    const columns = ["restaurant_id", ...Object.keys(rules)];
    const values = [`'${IDS.property}'`, ...Object.values(rules).map(String)];
    await db.exec(
      `INSERT INTO public.pms_inventory_rules (${columns.join(", ")}) VALUES (${values.join(", ")})`,
    );
  }

  /**
   * Seed reservations and units directly, as already-stored data. The trigger
   * is off while seeding so a test can start from a legacy state.
   */
  async function seed(units: UnitSeed[]) {
    await db.exec(`
      ALTER TABLE public.hotel_reservation_rooms DISABLE TRIGGER trg_hotel_reservation_rooms_requirements;
      DELETE FROM public.hotel_reservation_history;
      DELETE FROM public.hotel_reservation_rooms;
      DELETE FROM public.hotel_reservations;
      DELETE FROM public.hotel_room_links;
      INSERT INTO public.hotel_room_links VALUES
        ('${IDS.property}', 'connecting', '${IDS.roomLinked}', '${IDS.roomLinkPartner}');
      UPDATE public.hotel_rooms SET accessible = false, housekeeping_status = 'clean';
      UPDATE public.hotel_rooms SET accessible = true
        WHERE id IN ('${IDS.roomAccessible}', '${IDS.roomAccessibleDirty}');
      UPDATE public.hotel_rooms SET housekeeping_status = 'dirty' WHERE id = '${IDS.roomAccessibleDirty}';
    `);
    const reservations = new Set(units.map((unit) => unit.reservationId ?? IDS.reservation));
    for (const reservationId of reservations) {
      const own = units.filter((unit) => (unit.reservationId ?? IDS.reservation) === reservationId);
      const first = own[0]!;
      await db.exec(`
        INSERT INTO public.hotel_reservations
          (id, restaurant_id, room_type_id, room_id, arrival_date, departure_date, adults, children, status)
        VALUES ('${reservationId}', '${IDS.property}', '${IDS.type}',
                ${first.roomId ? `'${first.roomId}'` : "NULL"},
                '${ARRIVAL}', '${DEPARTURE}', ${first.adults ?? 1}, 0, '${first.status ?? "confirmed"}');
      `);
      for (const [index, unit] of own.entries()) {
        await db.exec(`
          INSERT INTO public.hotel_reservation_rooms
            (id, restaurant_id, reservation_id, unit_sequence, room_type_id, room_id,
             arrival_date, departure_date, adults, children, status,
             accessible_room_required, connecting_room_required)
          VALUES ('${unit.id}', '${IDS.property}', '${reservationId}', ${unit.sequence ?? index + 1},
                  '${IDS.type}', ${unit.roomId ? `'${unit.roomId}'` : "NULL"},
                  '${ARRIVAL}', '${DEPARTURE}', ${unit.adults ?? 1}, 0, '${unit.status ?? "confirmed"}',
                  ${unit.accessible ?? false}, ${unit.connecting ?? false});
        `);
      }
    }
    await db.exec(
      `ALTER TABLE public.hotel_reservation_rooms ENABLE TRIGGER trg_hotel_reservation_rooms_requirements;`,
    );
  }

  const unitRoomCheck = (unitId: string, roomId: string, reservationId = IDS.reservation) =>
    `SELECT public.assert_reservation_room_unit_room(
       '${IDS.property}', '${reservationId}', '${unitId}', '${roomId}',
       '${IDS.type}', '${ARRIVAL}', '${DEPARTURE}')`;
  const createCheck = () =>
    `SELECT public.assert_reservation_room_units('${IDS.property}', '${IDS.reservation}')`;
  const assign = (roomId: string | null, unitId?: string, reservationId = IDS.reservation) =>
    `SELECT public.assign_hotel_reservation_room_unit(
       '${IDS.property}', '${reservationId}', ${roomId ? `'${roomId}'` : "NULL"}, NULL,
       ${unitId ? `'${unitId}'` : "NULL"})`;
  const checkIn = (unitId?: string) =>
    `SELECT public.check_in_hotel_reservation(
       '${IDS.property}', '${IDS.reservation}', NULL, NULL, ${unitId ? `'${unitId}'` : "NULL"})`;
  const move = (roomId: string, unitId?: string) =>
    `SELECT public.move_hotel_reservation_room(
       '${IDS.property}', '${IDS.reservation}', '${roomId}', 'Rack move', NULL,
       ${unitId ? `'${unitId}'` : "NULL"})`;
  const amend = (roomId: string, notes = "x") =>
    `SELECT public.amend_hotel_reservation(
       '${IDS.property}', '${IDS.reservation}', '${IDS.type}', '${roomId}',
       '${ARRIVAL}', '${DEPARTURE}', 1, 0, NULL, '${notes}', NULL)`;
  const saveRequirements = (units: Array<[number, boolean, boolean]>) =>
    `SELECT public.save_hotel_reservation_room_requirements('${IDS.property}', '${IDS.reservation}',
       '${JSON.stringify(
         units.map(([sequence, accessible, connecting]) => ({
           unit_sequence: sequence,
           accessible_room_required: accessible,
           connecting_room_required: connecting,
         })),
       )}'::jsonb)`;
  const unitRow = async (unitId: string) =>
    (
      await db.query<{
        room_id: string | null;
        accessible_room_required: boolean;
        connecting_room_required: boolean;
      }>(
        `SELECT room_id, accessible_room_required, connecting_room_required
         FROM public.hotel_reservation_rooms WHERE id = '${unitId}'`,
      )
    ).rows[0]!;
  const canonicalBlockers = async (roomId: string, accessible: boolean, connecting: boolean) =>
    (
      await db.query<{ blockers: Array<{ code: string }> }>(
        `SELECT public.pms_evaluate_room_assignment(
           _restaurant_id => '${IDS.property}', _room_id => '${roomId}', _room_type_id => '${IDS.type}',
           _arrival => '${ARRIVAL}', _departure => '${DEPARTURE}', _adults => 1, _children => 0,
           _accessible_required => ${accessible}, _connecting_required => ${connecting}
         )->'blockers' AS blockers`,
      )
    ).rows[0]!.blockers.map((b) => b.code);

  it("loads the real functions", async () => {
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
    await db.exec(migration);
    await db.exec(`
      INSERT INTO public.restaurants VALUES ('${IDS.property}', '2026-12-01', 'Europe/London');
      INSERT INTO public.pms_housekeeping_settings VALUES ('${IDS.property}', true, false, false);
      INSERT INTO public.room_types VALUES ('${IDS.type}', '${IDS.property}', 2), ('${IDS.typeTwin}', '${IDS.property}', 4);
      INSERT INTO public.hotel_rooms (id, restaurant_id, room_type_id) VALUES
        ('${IDS.roomAccessible}', '${IDS.property}', '${IDS.type}'),
        ('${IDS.roomPlain}', '${IDS.property}', '${IDS.type}'),
        ('${IDS.roomLinked}', '${IDS.property}', '${IDS.type}'),
        ('${IDS.roomLinkPartner}', '${IDS.property}', '${IDS.type}'),
        ('${IDS.roomAccessibleDirty}', '${IDS.property}', '${IDS.type}'),
        ('${IDS.roomTwin}', '${IDS.property}', '${IDS.typeTwin}'),
        ('${IDS.roomPlain2}', '${IDS.property}', '${IDS.type}');
    `);
    const helpers = await db.query<{ signature: string }>(
      `SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE proname = 'pms_assert_room_assignment_hard_rules'`,
    );
    expect(helpers.rows.map((row) => row.signature)).toEqual([
      "pms_assert_room_assignment_hard_rules(uuid,uuid,uuid,date,date,uuid,integer,integer,boolean,boolean,boolean,boolean)",
    ]);
  }, 60_000);

  it("grants the helper to service_role only", async () => {
    const grants = await db.query<{ role: string; allowed: boolean }>(`
      SELECT role, has_function_privilege(role,
        'public.pms_assert_room_assignment_hard_rules(uuid,uuid,uuid,date,date,uuid,integer,integer,boolean,boolean,boolean,boolean)',
        'EXECUTE') AS allowed
      FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role`);
    expect(Object.fromEntries(grants.rows.map((row) => [row.role, row.allowed]))).toEqual({
      anon: false,
      authenticated: false,
      service_role: true,
    });
    const trigger = await db.query<{ allowed: boolean }>(`
      SELECT bool_or(has_function_privilege(role, 'public.pms_enforce_room_unit_requirements()', 'EXECUTE')) AS allowed
      FROM unnest(ARRAY['anon', 'authenticated']) AS role`);
    expect(trigger.rows[0]!.allowed).toBe(false);
  });

  describe("accessibility matrix", () => {
    const cases: Array<[string, boolean, boolean, string, string | null]> = [
      ["required, rule ON, room not accessible", true, true, IDS.roomPlain, ACCESSIBLE],
      ["required, rule ON, room accessible", true, true, IDS.roomAccessible, null],
      ["not required, rule ON, room not accessible", false, true, IDS.roomPlain, null],
      ["required, rule OFF, room not accessible", true, false, IDS.roomPlain, null],
    ];
    for (const [name, required, ruleOn, roomId, expected] of cases) {
      it(name, async () => {
        await seed([{ id: IDS.unit1, roomId: null, accessible: required }]);
        await setRules({ require_accessibility_match: ruleOn });
        const message = await failure(unitRoomCheck(IDS.unit1, roomId));
        if (expected) expect(message).toContain(expected);
        else expect(message).toBeNull();
        // Same verdict as canonical Assignment Eligibility.
        const blockers = await canonicalBlockers(roomId, required, false);
        expect(blockers.includes("ACCESSIBILITY_MISMATCH")).toBe(expected !== null);
      });
    }
  });

  describe("connecting matrix", () => {
    const cases: Array<[string, boolean, boolean, string, string | null]> = [
      ["required, rule ON, room without connecting link", true, true, IDS.roomPlain, CONNECTING],
      ["required, rule ON, room with connecting link", true, true, IDS.roomLinked, null],
      ["required, rule ON, room on the other side of a link", true, true, IDS.roomLinkPartner, null],
      ["not required, rule ON, room without link", false, true, IDS.roomPlain, null],
      ["required, rule OFF, room without link", true, false, IDS.roomPlain, null],
    ];
    for (const [name, required, ruleOn, roomId, expected] of cases) {
      it(name, async () => {
        await seed([{ id: IDS.unit1, roomId: null, connecting: required }]);
        await setRules({ require_connecting_room_match: ruleOn });
        const message = await failure(unitRoomCheck(IDS.unit1, roomId));
        if (expected) expect(message).toContain(expected);
        else expect(message).toBeNull();
        const blockers = await canonicalBlockers(roomId, false, required);
        expect(blockers.includes("CONNECTING_ROOM_REQUIRED")).toBe(expected !== null);
      });
    }
  });

  describe("Create with a preassigned room", () => {
    it("rejects a stored requirement the preassigned room does not meet", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain, accessible: true }]);
      await setRules({ require_accessibility_match: true });
      expect(await failure(createCheck())).toContain(ACCESSIBLE);
      await setRules({ require_accessibility_match: false });
      expect(await failure(createCheck())).toBeNull();
    });

    it("the 0209 requirement save refuses a requirement the assigned room does not meet, all or nothing", async () => {
      await seed([
        { id: IDS.unit1, roomId: IDS.roomPlain },
        { id: IDS.unit2, roomId: IDS.roomAccessible },
      ]);
      await setRules({ require_accessibility_match: true });
      expect(await failure(saveRequirements([[1, true, false], [2, true, false]]))).toContain(ACCESSIBLE);
      expect((await unitRow(IDS.unit1)).accessible_room_required).toBe(false);
      expect((await unitRow(IDS.unit2)).accessible_room_required).toBe(false);
      expect(await failure(saveRequirements([[1, false, false], [2, true, false]]))).toBeNull();
      expect((await unitRow(IDS.unit2)).accessible_room_required).toBe(true);
    });

    it("the requirement save on an unassigned unit is not blocked", async () => {
      await seed([{ id: IDS.unit1, roomId: null }]);
      await setRules({ require_accessibility_match: true, require_connecting_room_match: true });
      expect(await failure(saveRequirements([[1, true, true]]))).toBeNull();
    });

    it("a unit inserted with a requirement and an incompatible room is refused", async () => {
      await seed([{ id: IDS.unit1, roomId: null }]);
      await setRules({ require_connecting_room_match: true });
      expect(
        await failure(`
          INSERT INTO public.hotel_reservation_rooms
            (id, restaurant_id, reservation_id, unit_sequence, room_type_id, room_id,
             arrival_date, departure_date, adults, children, connecting_room_required)
          VALUES ('${IDS.unit2}', '${IDS.property}', '${IDS.reservation}', 2, '${IDS.type}',
                  '${IDS.roomPlain}', '${ARRIVAL}', '${DEPARTURE}', 1, 0, true)`),
      ).toContain(CONNECTING);
    });
  });

  describe("Edit a unit that holds a room", () => {
    it("false to true with an incompatible room is rejected and nothing is unassigned", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain }]);
      await setRules({ require_accessibility_match: true });
      expect(
        await failure(
          `UPDATE public.hotel_reservation_rooms SET accessible_room_required = true WHERE id = '${IDS.unit1}'`,
        ),
      ).toContain(ACCESSIBLE);
      expect(await unitRow(IDS.unit1)).toEqual({
        room_id: IDS.roomPlain,
        accessible_room_required: false,
        connecting_room_required: false,
      });
    });

    it("false to true with a compatible room is allowed", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomLinked }]);
      await setRules({ require_connecting_room_match: true });
      expect(
        await failure(
          `UPDATE public.hotel_reservation_rooms SET connecting_room_required = true WHERE id = '${IDS.unit1}'`,
        ),
      ).toBeNull();
    });

    it("true to false is allowed even when the room does not meet it", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain, accessible: true, connecting: true }]);
      await setRules({ require_accessibility_match: true, require_connecting_room_match: true });
      expect(
        await failure(
          `UPDATE public.hotel_reservation_rooms
           SET accessible_room_required = false, connecting_room_required = false WHERE id = '${IDS.unit1}'`,
        ),
      ).toBeNull();
    });

    it("turning one requirement off does not re-judge the one left on", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain, accessible: true, connecting: true }]);
      await setRules({ require_accessibility_match: true, require_connecting_room_match: true });
      expect(
        await failure(
          `UPDATE public.hotel_reservation_rooms SET connecting_room_required = false WHERE id = '${IDS.unit1}'`,
        ),
      ).toBeNull();
    });

    it("turning a requirement on while the rule is OFF is allowed", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain }]);
      await setRules({ require_accessibility_match: false });
      expect(
        await failure(
          `UPDATE public.hotel_reservation_rooms SET accessible_room_required = true WHERE id = '${IDS.unit1}'`,
        ),
      ).toBeNull();
    });

    it("an unrelated unit update is not re-judged", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain, accessible: true }]);
      await setRules({ require_accessibility_match: true });
      expect(
        await failure(`UPDATE public.hotel_reservation_rooms SET adults = 2 WHERE id = '${IDS.unit1}'`),
      ).toBeNull();
    });
  });

  describe("Assign Room", () => {
    it("uses the unit's stored requirement", async () => {
      await seed([{ id: IDS.unit1, roomId: null, accessible: true }]);
      await setRules({ require_accessibility_match: true });
      expect(await failure(assign(IDS.roomPlain, IDS.unit1))).toContain(ACCESSIBLE);
      expect((await unitRow(IDS.unit1)).room_id).toBeNull();
      expect(await failure(assign(IDS.roomAccessible, IDS.unit1))).toBeNull();
      expect((await unitRow(IDS.unit1)).room_id).toBe(IDS.roomAccessible);
    });

    it("resolves the only unit of a single-room reservation", async () => {
      await seed([{ id: IDS.unit1, roomId: null, connecting: true }]);
      await setRules({ require_connecting_room_match: true });
      expect(await failure(assign(IDS.roomPlain))).toContain(CONNECTING);
      expect(await failure(assign(IDS.roomLinked))).toBeNull();
    });

    it("refuses to guess the unit on a multi-room reservation", async () => {
      await seed([
        { id: IDS.unit1, roomId: null },
        { id: IDS.unit2, roomId: null, accessible: true },
      ]);
      await setRules({ require_accessibility_match: true });
      expect(await failure(assign(IDS.roomPlain))).toContain("ROOM_UNIT_REQUIRED");
    });

    it("rejects at the final step when the room changed after it was offered", async () => {
      await seed([{ id: IDS.unit1, roomId: null, accessible: true }]);
      await setRules({ require_accessibility_match: true });
      expect(await canonicalBlockers(IDS.roomAccessible, true, false)).not.toContain(
        "ACCESSIBILITY_MISMATCH",
      );
      await db.exec(`UPDATE public.hotel_rooms SET accessible = false WHERE id = '${IDS.roomAccessible}'`);
      expect(await failure(assign(IDS.roomAccessible, IDS.unit1))).toContain(ACCESSIBLE);
    });

    it("rejects at the final step when the connecting link was removed after it was offered", async () => {
      await seed([{ id: IDS.unit1, roomId: null, connecting: true }]);
      await setRules({ require_connecting_room_match: true });
      expect(await canonicalBlockers(IDS.roomLinked, false, true)).not.toContain(
        "CONNECTING_ROOM_REQUIRED",
      );
      await db.exec(`DELETE FROM public.hotel_room_links`);
      expect(await failure(assign(IDS.roomLinked, IDS.unit1))).toContain(CONNECTING);
    });
  });

  describe("Check-in", () => {
    it("rejects a room assigned before the requirement was turned on, once the rule is on", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain }]);
      await setRules({ require_accessibility_match: false });
      await db.exec(
        `UPDATE public.hotel_reservation_rooms SET accessible_room_required = true WHERE id = '${IDS.unit1}'`,
      );
      await setRules({ require_accessibility_match: true });
      expect(await failure(checkIn(IDS.unit1))).toContain(ACCESSIBLE);
      expect((await unitRow(IDS.unit1)).room_id).toBe(IDS.roomPlain);
    });

    it("allows the same check-in when the rule is off", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain, accessible: true }]);
      await setRules({ require_accessibility_match: false });
      expect(await failure(checkIn(IDS.unit1))).toBeNull();
    });

    it("allows a compatible room", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomLinked, connecting: true }]);
      await setRules({ require_connecting_room_match: true });
      expect(await failure(checkIn())).toBeNull();
    });
  });

  describe("Move Room and rack move commit", () => {
    it("validates the moved unit and keeps its requirement", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomAccessible, accessible: true, status: "checked_in" }]);
      await setRules({ require_accessibility_match: true });
      expect(await failure(move(IDS.roomPlain, IDS.unit1))).toContain(ACCESSIBLE);
      expect(await failure(move(IDS.roomAccessibleDirty, IDS.unit1))).toBeNull();
      expect(await unitRow(IDS.unit1)).toEqual({
        room_id: IDS.roomAccessibleDirty,
        accessible_room_required: true,
        connecting_room_required: false,
      });
    });

    it("judges the dragged unit of a multi-room stay, not Room 1", async () => {
      await seed([
        { id: IDS.unit1, roomId: IDS.roomPlain2, status: "checked_in" },
        { id: IDS.unit2, roomId: IDS.roomAccessible, accessible: true, status: "checked_in" },
      ]);
      await setRules({ require_accessibility_match: true });
      expect(await failure(move(IDS.roomPlain, IDS.unit2))).toContain(ACCESSIBLE);
      expect(await failure(move(IDS.roomPlain, IDS.unit1))).toBeNull();
      expect(await failure(move(IDS.roomLinked))).toContain("ROOM_UNIT_REQUIRED");
    });
  });

  describe("amend with a room change", () => {
    it("uses the only unit's stored requirement", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomAccessible, accessible: true }]);
      await setRules({ require_accessibility_match: true });
      expect(await failure(amend(IDS.roomPlain))).toContain(ACCESSIBLE);
      expect(await failure(amend(IDS.roomAccessibleDirty))).toBeNull();
    });

    it("does not re-judge an unrelated edit that keeps the room", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain, accessible: true }]);
      await setRules({ require_accessibility_match: true });
      expect(await failure(amend(IDS.roomPlain, "late arrival"))).toBeNull();
    });

    it("refuses a room change on a multi-room reservation without a unit", async () => {
      await seed([
        { id: IDS.unit1, roomId: IDS.roomAccessible },
        { id: IDS.unit2, roomId: null },
      ]);
      await setRules({});
      expect(await failure(amend(IDS.roomPlain))).toContain("ROOM_UNIT_REQUIRED");
    });
  });

  describe("group assign and swap through the unit path", () => {
    it("isolates sibling units: each is judged by its own requirement", async () => {
      await seed([
        { id: IDS.unit1, roomId: null, accessible: true },
        { id: IDS.unit2, roomId: null },
      ]);
      await setRules({ require_accessibility_match: true });
      expect(await failure(assign(IDS.roomPlain, IDS.unit2))).toBeNull();
      expect(await failure(assign(IDS.roomPlain2, IDS.unit1))).toContain(ACCESSIBLE);
      expect(await failure(assign(IDS.roomAccessible, IDS.unit1))).toBeNull();
    });

    it("swap validates each target room against the unit that will occupy it", async () => {
      await seed([
        { id: IDS.unit1, roomId: IDS.roomAccessible, accessible: true },
        { id: IDS.unitB, reservationId: IDS.reservationB, roomId: IDS.roomPlain },
      ]);
      await setRules({ require_accessibility_match: true });
      // The group swap clears both rooms, then gives each side the other's room.
      expect(await failure(assign(null, IDS.unit1))).toBeNull();
      expect(await failure(assign(null, IDS.unitB, IDS.reservationB))).toBeNull();
      expect(await failure(assign(IDS.roomAccessible, IDS.unitB, IDS.reservationB))).toBeNull();
      expect(await failure(assign(IDS.roomPlain, IDS.unit1))).toContain(ACCESSIBLE);
    });
  });

  describe("regressions", () => {
    it("occupancy and housekeeping still block a room that meets the requirement", async () => {
      await seed([{ id: IDS.unit1, roomId: null, accessible: true, adults: 3 }]);
      await setRules({ require_accessibility_match: true, require_occupancy_match: true });
      expect(await failure(unitRoomCheck(IDS.unit1, IDS.roomAccessible))).toContain(
        "ROOM_CAPACITY_EXCEEDED",
      );
      await seed([{ id: IDS.unit1, roomId: null, accessible: true }]);
      await setRules({ require_accessibility_match: true, require_housekeeping_readiness: true });
      expect(await failure(unitRoomCheck(IDS.unit1, IDS.roomAccessibleDirty))).toContain(
        "ROOM_HOUSEKEEPING_NOT_READY",
      );
    });

    it("reports the requirement ahead of housekeeping when both fail", async () => {
      await seed([{ id: IDS.unit1, roomId: null, connecting: true }]);
      await setRules({ require_connecting_room_match: true, require_housekeeping_readiness: true });
      await db.exec(`UPDATE public.hotel_rooms SET housekeeping_status = 'dirty' WHERE id = '${IDS.roomPlain}'`);
      expect(await failure(unitRoomCheck(IDS.unit1, IDS.roomPlain))).toContain(CONNECTING);
    });

    it("keeps room type mismatch ahead of the requirement", async () => {
      await seed([{ id: IDS.unit1, roomId: null, accessible: true }]);
      await setRules({ require_accessibility_match: true, require_room_type_match: true });
      expect(await failure(unitRoomCheck(IDS.unit1, IDS.roomTwin))).toContain("ROOM_NOT_ASSIGNABLE");
    });

    it("keeps the 0205 behaviour when no requirement is stored", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain, adults: 3 }]);
      await setRules({ require_occupancy_match: true });
      expect(await failure(createCheck())).toContain("ROOM_CAPACITY_EXCEEDED");
      await setRules({});
      expect(await failure(createCheck())).toBeNull();
    });

    it("leaves a property without a rules row unchanged", async () => {
      await seed([{ id: IDS.unit1, roomId: null, accessible: true, connecting: true }]);
      await db.exec(`DELETE FROM public.pms_inventory_rules`);
      expect(await failure(assign(IDS.roomPlain, IDS.unit1))).toBeNull();
    });
  });

  describe("the room's Accessible room flag is the only capability the hard rule reads", () => {
    const amenity = "00000000-0000-0000-0000-0000000000f1";

    async function withTypeGuidanceAndFeatures(run: () => Promise<void>) {
      await db.exec(`
        UPDATE public.room_types SET accessible_eligible = true WHERE id = '${IDS.type}';
        INSERT INTO public.room_amenities VALUES
          ('${amenity}', '${IDS.property}', 'Wheelchair Accessible', 'ACC_WHEELCHAIR_ACCESSIBLE', 'Accessibility');
        INSERT INTO public.room_type_amenities VALUES ('${IDS.property}', '${IDS.type}', '${amenity}');
        INSERT INTO public.hotel_room_amenity_overrides VALUES ('${IDS.property}', '${IDS.roomPlain}', '${amenity}', 'add');
      `);
      try {
        await run();
      } finally {
        await db.exec(`
          UPDATE public.room_types SET accessible_eligible = false;
          DELETE FROM public.hotel_room_amenity_overrides;
          DELETE FROM public.room_type_amenities;
          DELETE FROM public.room_amenities;
        `);
      }
    }

    it("room type guidance and accessibility features do not make an unflagged room eligible", async () => {
      await seed([{ id: IDS.unit1, roomId: null, accessible: true }]);
      await setRules({ require_accessibility_match: true });
      await withTypeGuidanceAndFeatures(async () => {
        expect(await canonicalBlockers(IDS.roomPlain, true, false)).toContain("ACCESSIBILITY_MISMATCH");
        expect(await failure(unitRoomCheck(IDS.unit1, IDS.roomPlain))).toContain(ACCESSIBLE);
        expect(await failure(assign(IDS.roomPlain, IDS.unit1))).toContain(ACCESSIBLE);
      });
    });

    it("a room marked Accessible room satisfies the rule with no type guidance or features", async () => {
      await seed([{ id: IDS.unit1, roomId: null, accessible: true }]);
      await setRules({ require_accessibility_match: true });
      expect(await canonicalBlockers(IDS.roomAccessible, true, false)).not.toContain("ACCESSIBILITY_MISMATCH");
      expect(await failure(assign(IDS.roomAccessible, IDS.unit1))).toBeNull();
    });

    it("turning the requirement ON still checks only the room flag", async () => {
      await seed([{ id: IDS.unit1, roomId: IDS.roomPlain }]);
      await setRules({ require_accessibility_match: true });
      await withTypeGuidanceAndFeatures(async () => {
        expect(
          await failure(
            `UPDATE public.hotel_reservation_rooms SET accessible_room_required = true WHERE id = '${IDS.unit1}'`,
          ),
        ).toContain(ACCESSIBLE);
        expect((await unitRow(IDS.unit1)).accessible_room_required).toBe(false);
      });
    });
  });
});

describe.skipIf(Boolean(PGlite))("room requirements, executed against the migration SQL", () => {
  it.skip("needs @electric-sql/pglite (see the comment at the top of this file)", () => {});
});
