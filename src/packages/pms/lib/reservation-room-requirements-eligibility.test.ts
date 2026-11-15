import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { eligibilityStaffLines } from "../components/rooms/room-eligibility-display";
import { eligibilityCodeLabel } from "../components/rooms/room-inventory-utils";
import { assignmentIneligibilityReason } from "./fo-checkin-v2-model";
import { roomHoldReason } from "./reservation-detail-rooms";
import {
  ACCESSIBLE_REQUIRED_REJECTION,
  CONNECTING_REQUIRED_REJECTION,
  ROOM_UNIT_REQUIRED_FOR_ELIGIBILITY,
  loadEvaluationRequirements,
  requirementOverrides,
  requirementRejectionFromBlockers,
  requirementRejectionMessage,
  resolveEvaluationRequirements,
  type EvaluationRequirements,
  type RoomRequirementReadDb,
} from "./reservation-room-requirements";
import { getAssignmentEligibilityCompat } from "./room-inventory-compat";

/**
 * Phase 3A. Candidate-room evaluation reads the stored room requirements of the
 * selected reservation room unit and hands them to the canonical evaluator.
 *
 * The rule semantics run the real `pms_evaluate_room_assignment` (migration 0168)
 * in an in-process Postgres (PGlite) when it can be loaded:
 *
 *   PGLITE_MODULE=/tmp/pgl/node_modules/@electric-sql/pglite/dist/index.js \
 *     npx vitest run src/packages/pms/lib/reservation-room-requirements-eligibility.test.ts
 *
 * What these tests prove: the data path (stored unit row -> loader -> canonical
 * RPC arguments -> real SQL verdict -> staff wording) and, by source checks, that
 * each workflow's server function and screen calls that path with its unit.
 * What they do not prove: HTTP, auth middleware and React rendering.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ACCESSIBLE_CODE = "ACCESSIBILITY_MISMATCH";
const CONNECTING_CODE = "CONNECTING_ROOM_REQUIRED";

describe("resolveEvaluationRequirements", () => {
  const units = [
    { id: "u1", accessible_room_required: true, connecting_room_required: false },
    { id: "u2", accessible_room_required: false, connecting_room_required: true },
  ];

  it("uses the named unit's stored values", () => {
    expect(resolveEvaluationRequirements({ units, reservationRoomId: "u1" })).toEqual({
      accessibleRoomRequired: true,
      connectingRoomRequired: false,
      source: "unit",
      reservationRoomId: "u1",
    });
  });

  it("does not leak one unit's requirement into another (accessible and connecting)", () => {
    const one = resolveEvaluationRequirements({ units, reservationRoomId: "u1" });
    const two = resolveEvaluationRequirements({ units, reservationRoomId: "u2" });
    expect(one.accessibleRoomRequired).toBe(true);
    expect(two.accessibleRoomRequired).toBe(false);
    expect(one.connectingRoomRequired).toBe(false);
    expect(two.connectingRoomRequired).toBe(true);
  });

  it("refuses to guess when several units exist and none is named", () => {
    expect(() => resolveEvaluationRequirements({ units })).toThrow(
      ROOM_UNIT_REQUIRED_FOR_ELIGIBILITY,
    );
  });

  it("uses the only unit when none is named", () => {
    expect(resolveEvaluationRequirements({ units: [units[0]!] })).toMatchObject({
      accessibleRoomRequired: true,
      source: "unit",
    });
  });

  it("fails for a unit that is not on the reservation", () => {
    expect(() => resolveEvaluationRequirements({ units, reservationRoomId: "other" })).toThrow(
      "Reservation room was not found.",
    );
  });

  it("reads missing columns as not required", () => {
    expect(resolveEvaluationRequirements({ units: [{ id: "u1" }] })).toEqual({
      accessibleRoomRequired: false,
      connectingRoomRequired: false,
      source: "unit",
      reservationRoomId: "u1",
    });
  });

  it("uses the in-memory draft before the unit exists (New Reservation)", () => {
    expect(
      resolveEvaluationRequirements({
        units: [],
        draft: { accessibleRoomRequired: true, connectingRoomRequired: false },
      }),
    ).toEqual({
      accessibleRoomRequired: true,
      connectingRoomRequired: false,
      source: "draft",
      reservationRoomId: null,
    });
  });

  it("requires nothing without a unit and without a draft", () => {
    expect(resolveEvaluationRequirements({ units: [] })).toEqual({
      accessibleRoomRequired: false,
      connectingRoomRequired: false,
      source: "none",
      reservationRoomId: null,
    });
  });

  it("lets an Edit draft replace the stored value for that field only", () => {
    expect(
      resolveEvaluationRequirements({
        units,
        reservationRoomId: "u1",
        draft: { accessibleRoomRequired: false },
      }),
    ).toEqual({
      accessibleRoomRequired: false,
      connectingRoomRequired: false,
      source: "draft",
      reservationRoomId: "u1",
    });
  });
});

describe("requirementOverrides", () => {
  const stored = { accessibleRoomRequired: true, connectingRoomRequired: false };
  it("is clear when the check matches the stored requirement", () => {
    expect(
      requirementOverrides(stored, { accessibleRequired: true, connectingRequired: false }),
    ).toEqual({ accessible: false, connecting: false, any: false });
  });
  it("flags each field that differs", () => {
    expect(
      requirementOverrides(stored, { accessibleRequired: false, connectingRequired: true }),
    ).toEqual({ accessible: true, connecting: true, any: true });
  });
});

describe("staff rejection wording", () => {
  it("uses the exact staff sentences", () => {
    expect(ACCESSIBLE_REQUIRED_REJECTION).toBe("This stay requires an accessible room.");
    expect(CONNECTING_REQUIRED_REJECTION).toBe(
      "This stay requires a room with connecting-room capability.",
    );
  });

  it("maps the internal codes and nothing else", () => {
    expect(requirementRejectionMessage(ACCESSIBLE_CODE)).toBe(ACCESSIBLE_REQUIRED_REJECTION);
    expect(requirementRejectionMessage(CONNECTING_CODE)).toBe(CONNECTING_REQUIRED_REJECTION);
    expect(requirementRejectionMessage("ROOM_BLOCKED")).toBeNull();
    expect(
      requirementRejectionFromBlockers([{ code: "ROOM_BLOCKED" }, { code: CONNECTING_CODE }]),
    ).toBe(CONNECTING_REQUIRED_REJECTION);
    expect(requirementRejectionFromBlockers([])).toBeNull();
  });

  it("never shows a raw code to staff, whatever message the evaluator carried", () => {
    for (const [code, text] of [
      [ACCESSIBLE_CODE, ACCESSIBLE_REQUIRED_REJECTION],
      [CONNECTING_CODE, CONNECTING_REQUIRED_REJECTION],
    ] as const) {
      expect(assignmentIneligibilityReason(false, [{ code }])).toBe(text);
      expect(assignmentIneligibilityReason(false, [{ code, message: code }])).toBe(text);
      expect(eligibilityCodeLabel(code)).toBe(text);
      expect(
        roomHoldReason({
          eligible: false,
          current: false,
          occupiedUntil: null,
          statusLabel: "Available",
          blockerCode: code,
        }),
      ).toBe(text);
      const lines = eligibilityStaffLines({
        source: "canonical",
        eligible: false,
        blockers: [{ code }],
        warnings: [],
        preferenceReasons: [],
        arrival: "2026-12-10",
        departure: "2026-12-12",
        guests: 2,
        maxOccupancy: 3,
        housekeepingStatus: "clean",
        maintenanceStatus: "normal",
        operationalStatus: "available",
        bedPreference: null,
        roomBeds: null,
        buildingPreference: null,
        roomBuilding: null,
        floorPreference: null,
        roomFloor: null,
        accessibleRequired: true,
        connectingRequired: true,
        forCheckIn: false,
        roomTypeAligned: true,
      });
      expect(lines.some((line) => line.tone === "fail" && line.text === text)).toBe(true);
      expect(lines.every((line) => !line.text.includes(code))).toBe(true);
    }
  });

  it("keeps other blockers on their own wording", () => {
    expect(assignmentIneligibilityReason(false, [{ code: "ROOM_BLOCKED" }])).toBe(
      "This room is blocked.",
    );
  });
});

describe("workflow wiring (source)", () => {
  const reservations = read("src/packages/pms/lib/reservations.functions.ts");
  const lib = read("src/packages/pms/lib/reservation-room-requirements.ts");

  it("never reads guest text, special requests or preferences as a source", () => {
    const code = lib.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/special_requests|specialRequests|guest_preference|guest_accessibility/);
    const loaderStart = code.indexOf("export async function loadEvaluationRequirements");
    expect(code.slice(loaderStart)).not.toMatch(/hotel_reservations|hotel_guests|notes/);
  });

  it("passes the stored values to the canonical evaluator in listAssignableRooms", () => {
    const start = reservations.indexOf("export const listAssignableRooms");
    const body = reservations.slice(start, reservations.indexOf("export const", start + 10));
    expect(body).toContain("loadEvaluationRequirements(");
    expect(body).toContain("reservationRoomId: data.reservationRoomId");
    expect(body).toContain("accessibleRequired: requirements.accessibleRoomRequired");
    expect(body).toContain("connectingRequired: requirements.connectingRoomRequired");
    expect(body).toContain("getAssignmentEligibilityCompat(");
  });

  it("passes the stored values in Check-in candidates and the assign write", () => {
    for (const name of ["listCheckInRoomCandidates", "assignReservationRoom"]) {
      const start = reservations.indexOf(`export const ${name}`);
      expect(start).toBeGreaterThan(-1);
      const body = reservations.slice(start, reservations.indexOf("\nexport const", start + 10));
      expect(body).toContain("loadEvaluationRequirements(");
      expect(body).toContain("accessibleRequired: requirements.accessibleRoomRequired");
      expect(body).toContain("connectingRequired: requirements.connectingRoomRequired");
    }
    const assign = reservations.slice(reservations.indexOf("export const assignReservationRoom"));
    expect(assign).toContain("reservationRoomId: targetUnit?.id");
    expect(assign).toContain("requirementRejectionFromBlockers(eligibility.blockers)");
  });

  it("evaluates Move Room targets and the unit display read with the unit's requirements", () => {
    const display = read("src/packages/pms/lib/reservation-room-display.functions.ts");
    expect(display).toContain("loadEvaluationRequirements(");
    expect(display).toContain("accessibleRequired: requirements.accessibleRoomRequired");
    expect(display).toContain("connectingRequired: requirements.connectingRoomRequired");
    const dialogs = read("src/packages/pms/components/frontoffice/front-office-dialogs.tsx");
    const select = dialogs.slice(
      dialogs.indexOf("function RoomSelect"),
      dialogs.indexOf("function stayForRoomTarget"),
    );
    expect(select).toContain("reservationRoomId");
    expect(dialogs.match(/reservationRoomId=\{reservationRoomId\}/g)?.length).toBe(2);
  });

  it("check-in readiness uses the unit's stored values and keeps its own rules", () => {
    const readiness = read("src/packages/pms/lib/fo-check-in-readiness.functions.ts");
    expect(readiness).toContain("loadEvaluationRequirements(");
    expect(readiness).toContain("reservationRoomId: target.reservationRoomId");
    expect(readiness).toContain("accessibleRequired: requirements.accessibleRoomRequired");
    expect(readiness).toContain("connectingRequired: requirements.connectingRoomRequired");
  });

  it("Move Room keeps the requirement: the move path never touches the columns", () => {
    const frontoffice = read("src/packages/pms/lib/frontoffice.functions.ts");
    const start = frontoffice.indexOf("export const moveReservationRoom");
    expect(start).toBeGreaterThan(-1);
    const body = frontoffice.slice(start, frontoffice.indexOf("\nexport const", start + 10));
    expect(body).not.toMatch(/accessible_room_required|connecting_room_required/);
  });

  it("each screen sends its unit with the candidate-list request", () => {
    const expectations: Array<[string, RegExp]> = [
      [
        "src/packages/pms/components/workspaces/reservation-detail-rooms.tsx",
        /reservationRoomId: activeUnit\.id/,
      ],
      [
        "src/packages/pms/components/frontoffice/fo-check-in-stepper.tsx",
        /\.\.\.\(reservationRoomId \? \{ reservationRoomId \} : \{\}\)/,
      ],
      [
        "src/packages/pms/components/frontoffice/fo-checkin-v2-workspace.tsx",
        /reservationRoomId: unit\.reservationRoomId/,
      ],
      [
        "src/packages/pms/components/frontoffice/fo-check-in-workspace-sheet.tsx",
        /reservationRoomId: stay\.reservationRoomId/,
      ],
      [
        "src/packages/pms/components/frontoffice/fo-rack-confirm-sheet.tsx",
        /reservationRoomId: draft!\.reservationRoomId/,
      ],
      [
        "src/packages/pms/components/frontoffice/fo-amend-sheet.tsx",
        /reservationRoomId: stay\.reservationRoomId/,
      ],
      [
        "src/packages/pms/components/workspaces/reservation-edit-workspace.tsx",
        /draft\?\.accessibleRoomRequired/,
      ],
      [
        "src/packages/pms/lib/fo-check-in-unit.functions.ts",
        /reservationRoomId: target\.reservationRoomId/,
      ],
    ];
    for (const [file, pattern] of expectations) {
      expect(read(file), file).toMatch(pattern);
    }
  });

  it("Edit re-evaluates with the draft values, and the key carries them", () => {
    const edit = read("src/packages/pms/components/workspaces/reservation-edit-workspace.tsx");
    expect(edit).toContain("draft?.reservationRoomId ?? null");
    expect(edit).toContain("draft?.connectingRoomRequired");
    expect(edit).toMatch(/accessibleRoomRequired: draft!\.accessibleRoomRequired|accessibleRoomRequired/);
  });

  it("New Reservation sends the in-memory wizard values, so no database row is needed", () => {
    const create = read("src/packages/pms/components/bookings/create-reservation-page.tsx");
    const start = create.indexOf("const roomsQuery = useQuery");
    const query = create.slice(start, start + 2200);
    expect(query).toContain("accessibleRoomRequired");
    expect(query).toContain("connectingRoomRequired");
    expect(query).not.toContain("reservationRoomId");
  });

  it("group auto-assignment reports a failed check per reservation instead of dropping the run", () => {
    const auto = read("src/packages/pms/lib/guest-group-auto-assignment.ts");
    expect(auto).toContain("catch (error)");
    expect(auto).toContain("assigned: false");
  });

  it("group swap evaluates each side with the unit that holds its room", () => {
    const group = read("src/packages/pms/lib/guest-group-detail.functions.ts");
    expect(group).toContain("unitIdHoldingRoom(db, data.restaurantId, a.id, roomA)");
    expect(group).toContain("...(unitA ? { reservationRoomId: unitA } : {})");
    expect(group).toContain("...(unitB ? { reservationRoomId: unitB } : {})");
  });

  it("the room board dialog stays a manual check", () => {
    const board = read("src/packages/pms/components/rooms/room-board-dialogs.tsx");
    expect(board).not.toContain("getEligibilityReservationUnit");
    expect(board).not.toContain("loadEvaluationRequirements");
  });

  it("the Eligibility tab never saves an override", () => {
    const view = read("src/packages/pms/components/rooms/room-inventory-rules.tsx");
    const start = view.indexOf("export function RoomAssignmentEligibilityView");
    const body = view.slice(start, start + 22000);
    expect(body).toContain("getEligibilityReservationUnit");
    expect(body).toContain("Temporary override");
    expect(body).not.toMatch(/saveRoomRequirementsAtomic|persistUnitRoomRequirements|updateReservation/);
    const server = read("src/packages/pms/lib/room-inventory.functions.ts");
    const fnStart = server.indexOf("export const getEligibilityReservationUnit");
    const fn = server.slice(fnStart, server.indexOf("const evaluateRoomAssignmentSchema"));
    expect(fn).not.toMatch(/\.(update|insert|upsert|delete)\(/);
    expect(fn).not.toMatch(/\.rpc\(/);
  });

  it("changes no schema, no migration and no rule definition", () => {
    for (const file of [
      "src/packages/pms/lib/reservation-room-requirements.ts",
      "src/packages/pms/lib/room-inventory.functions.ts",
    ]) {
      expect(read(file)).not.toMatch(/ALTER TABLE|CREATE TABLE|CREATE OR REPLACE FUNCTION/);
    }
  });
});

/* ------------------------------------------------------------------ PGlite */

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

const P = "00000000-0000-0000-0000-0000000000a1";
const TYPE = "00000000-0000-0000-0000-0000000000b1";
const ROOM_PLAIN = "00000000-0000-0000-0000-0000000000c1";
const ROOM_ACCESSIBLE = "00000000-0000-0000-0000-0000000000c2";
const ROOM_CONNECTING = "00000000-0000-0000-0000-0000000000c3";
const ROOM_OTHER = "00000000-0000-0000-0000-0000000000c4";
const RES = "00000000-0000-0000-0000-0000000000d1";
const RES_SINGLE = "00000000-0000-0000-0000-0000000000d2";
const RES_NO_UNIT = "00000000-0000-0000-0000-0000000000d3";
const UNIT_A = "00000000-0000-0000-0000-0000000000e1";
const UNIT_B = "00000000-0000-0000-0000-0000000000e2";
const UNIT_SINGLE = "00000000-0000-0000-0000-0000000000e3";
const ARRIVAL = "2026-12-10";
const DEPARTURE = "2026-12-12";

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
  id uuid PRIMARY KEY, restaurant_id uuid, reservation_id uuid, unit_sequence integer,
  room_type_id uuid, room_id uuid, arrival_date date, departure_date date,
  adults integer, children integer, status text DEFAULT 'confirmed',
  accessible_room_required boolean NOT NULL DEFAULT false,
  connecting_room_required boolean NOT NULL DEFAULT false
);
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

describe.skipIf(!PGlite)("stored requirements through the real canonical evaluator", () => {
  let db: Db;

  /** The slice of a Supabase client the loader needs, backed by the in-process Postgres. */
  const readDb: RoomRequirementReadDb = {
    from: (table) => ({
      select: (columns: string) => {
        const filters: Array<[string, string]> = [];
        const builder: any = {
          eq(column: string, value: string) {
            filters.push([column, value]);
            return builder;
          },
          then(resolveFn: (value: unknown) => unknown, rejectFn?: (reason: unknown) => unknown) {
            const where = filters.map(([column], index) => `${column} = $${index + 1}`).join(" AND ");
            return db
              .query(
                `SELECT ${columns} FROM public.${table}${where ? ` WHERE ${where}` : ""} ORDER BY unit_sequence`,
                filters.map(([, value]) => value),
              )
              .then((result) => ({ data: result.rows, error: null }))
              .then(resolveFn, rejectFn);
          },
        };
        return builder;
      },
    }),
  };

  /** A client whose `rpc` runs the real SQL function, as the server does. */
  const rpcClient = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      const keys = Object.keys(args);
      const call = keys.map((key, index) => `${key} => $${index + 1}`).join(", ");
      const result = await db.query<{ result: unknown }>(
        `SELECT public.${name}(${call}) AS result`,
        keys.map((key) => args[key]),
      );
      return { data: result.rows[0]?.result ?? null, error: null };
    },
  };

  async function setRules(rules: { accessibility: boolean; connecting: boolean }) {
    await db.exec(`DELETE FROM public.pms_inventory_rules`);
    await db.exec(
      `INSERT INTO public.pms_inventory_rules
         (restaurant_id, require_accessibility_match, require_connecting_room_match)
       VALUES ('${P}', ${rules.accessibility}, ${rules.connecting})`,
    );
  }

  /** What the server functions do: load the unit's requirements, pass them to the evaluator. */
  async function evaluate(
    roomId: string,
    selection: { reservationId?: string; reservationRoomId?: string; draft?: object },
  ) {
    const requirements: EvaluationRequirements = await loadEvaluationRequirements(readDb, {
      restaurantId: P,
      reservationId: selection.reservationId ?? null,
      reservationRoomId: selection.reservationRoomId ?? null,
      draft: selection.draft ?? null,
    });
    const verdict = await getAssignmentEligibilityCompat(
      rpcClient,
      {
        restaurantId: P,
        roomId,
        roomTypeId: TYPE,
        arrival: ARRIVAL,
        departure: DEPARTURE,
        excludeReservationId: selection.reservationId ?? null,
        accessibleRequired: requirements.accessibleRoomRequired,
        connectingRequired: requirements.connectingRoomRequired,
      },
      () => {
        throw new Error("canonical evaluator expected");
      },
    );
    return {
      source: requirements.source,
      eligible: verdict.eligible,
      codes: verdict.blockers.map((blocker) => String(blocker["code"])),
      staff: assignmentIneligibilityReason(verdict.eligible, verdict.blockers),
    };
  }

  async function setUnit(id: string, accessible: boolean, connecting: boolean) {
    await db.exec(
      `UPDATE public.hotel_reservation_rooms
         SET accessible_room_required = ${accessible}, connecting_room_required = ${connecting}
       WHERE id = '${id}'`,
    );
  }

  beforeAll(async () => {
    const Ctor = PGlite as new () => Db;
    db = new Ctor();
    await db.exec(STUB_SCHEMA);
    await db.exec(read("supabase/migrations/0168_room_assignment_eligibility_qualification.sql"));
    await db.exec(`
      INSERT INTO public.restaurants VALUES ('${P}', '2026-12-01', 'Europe/London');
      INSERT INTO public.pms_housekeeping_settings VALUES ('${P}', true, false, false);
      INSERT INTO public.room_types VALUES ('${TYPE}', '${P}', 4);
      INSERT INTO public.hotel_rooms (id, restaurant_id, room_type_id, accessible) VALUES
        ('${ROOM_PLAIN}', '${P}', '${TYPE}', false),
        ('${ROOM_ACCESSIBLE}', '${P}', '${TYPE}', true),
        ('${ROOM_CONNECTING}', '${P}', '${TYPE}', false),
        ('${ROOM_OTHER}', '${P}', '${TYPE}', false);
      INSERT INTO public.hotel_room_links VALUES ('${P}', 'connecting', '${ROOM_CONNECTING}', '${ROOM_OTHER}');
      -- The guest text says accessible and connecting. It must not matter.
      INSERT INTO public.hotel_reservations
        (id, restaurant_id, room_type_id, arrival_date, departure_date, adults, children, special_requests, notes)
      VALUES
        ('${RES}', '${P}', '${TYPE}', '${ARRIVAL}', '${DEPARTURE}', 2, 0,
         'Wheelchair user. Connecting room if available.', 'accessible, connecting'),
        ('${RES_SINGLE}', '${P}', '${TYPE}', '${ARRIVAL}', '${DEPARTURE}', 2, 0,
         'Needs an accessible room', NULL),
        ('${RES_NO_UNIT}', '${P}', '${TYPE}', '${ARRIVAL}', '${DEPARTURE}', 2, 0, NULL, NULL);
      INSERT INTO public.hotel_reservation_rooms
        (id, restaurant_id, reservation_id, unit_sequence, room_type_id, arrival_date, departure_date, adults, children)
      VALUES
        ('${UNIT_A}', '${P}', '${RES}', 1, '${TYPE}', '${ARRIVAL}', '${DEPARTURE}', 2, 0),
        ('${UNIT_B}', '${P}', '${RES}', 2, '${TYPE}', '${ARRIVAL}', '${DEPARTURE}', 2, 0),
        ('${UNIT_SINGLE}', '${P}', '${RES_SINGLE}', 1, '${TYPE}', '${ARRIVAL}', '${DEPARTURE}', 2, 0);
    `);
  });

  describe("accessible room", () => {
    it("false is a normal check and allows a plain room", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_SINGLE, false, false);
      const result = await evaluate(ROOM_PLAIN, { reservationId: RES_SINGLE });
      expect(result).toMatchObject({ source: "unit", eligible: true, codes: [] });
    });

    it("true, rule ON, accessible room: allowed", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_SINGLE, true, false);
      const result = await evaluate(ROOM_ACCESSIBLE, { reservationId: RES_SINGLE });
      expect(result).toMatchObject({ eligible: true, codes: [] });
    });

    it("true, rule ON, plain room: rejected with the staff sentence", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_SINGLE, true, false);
      const result = await evaluate(ROOM_PLAIN, { reservationId: RES_SINGLE });
      expect(result.eligible).toBe(false);
      expect(result.codes).toContain(ACCESSIBLE_CODE);
      expect(result.staff).toBe("This stay requires an accessible room.");
    });

    it("true, rule OFF, plain room: not rejected", async () => {
      await setRules({ accessibility: false, connecting: true });
      await setUnit(UNIT_SINGLE, true, false);
      const result = await evaluate(ROOM_PLAIN, { reservationId: RES_SINGLE });
      expect(result).toMatchObject({ eligible: true, codes: [] });
    });

    it("no linked unit and no draft: a manual check requires nothing", async () => {
      await setRules({ accessibility: true, connecting: true });
      const result = await evaluate(ROOM_PLAIN, {});
      expect(result).toMatchObject({ source: "none", eligible: true });
    });

    it("a reservation with no unit row and no draft requires nothing", async () => {
      await setRules({ accessibility: true, connecting: true });
      const result = await evaluate(ROOM_PLAIN, { reservationId: RES_NO_UNIT });
      expect(result).toMatchObject({ source: "none", eligible: true });
    });
  });

  describe("connecting room", () => {
    it("false is a normal check and allows an unlinked room", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_SINGLE, false, false);
      const result = await evaluate(ROOM_PLAIN, { reservationId: RES_SINGLE });
      expect(result).toMatchObject({ eligible: true, codes: [] });
    });

    it("true, rule ON, linked room: allowed", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_SINGLE, false, true);
      const result = await evaluate(ROOM_CONNECTING, { reservationId: RES_SINGLE });
      expect(result).toMatchObject({ eligible: true, codes: [] });
    });

    it("true, rule ON, unlinked room: rejected with the staff sentence", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_SINGLE, false, true);
      const result = await evaluate(ROOM_PLAIN, { reservationId: RES_SINGLE });
      expect(result.eligible).toBe(false);
      expect(result.codes).toContain(CONNECTING_CODE);
      expect(result.staff).toBe("This stay requires a room with connecting-room capability.");
    });

    it("true, rule OFF, unlinked room: not rejected", async () => {
      await setRules({ accessibility: true, connecting: false });
      await setUnit(UNIT_SINGLE, false, true);
      const result = await evaluate(ROOM_PLAIN, { reservationId: RES_SINGLE });
      expect(result).toMatchObject({ eligible: true, codes: [] });
    });
  });

  describe("several rooms on one reservation", () => {
    it("accessible on room 1 does not leak to room 2", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_A, true, false);
      await setUnit(UNIT_B, false, false);
      const first = await evaluate(ROOM_PLAIN, { reservationId: RES, reservationRoomId: UNIT_A });
      const second = await evaluate(ROOM_PLAIN, { reservationId: RES, reservationRoomId: UNIT_B });
      expect(first.codes).toContain(ACCESSIBLE_CODE);
      expect(second).toMatchObject({ eligible: true, codes: [] });
    });

    it("connecting on room 2 does not leak to room 1", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_A, false, false);
      await setUnit(UNIT_B, false, true);
      const first = await evaluate(ROOM_PLAIN, { reservationId: RES, reservationRoomId: UNIT_A });
      const second = await evaluate(ROOM_PLAIN, { reservationId: RES, reservationRoomId: UNIT_B });
      expect(first).toMatchObject({ eligible: true, codes: [] });
      expect(second.codes).toContain(CONNECTING_CODE);
    });

    it("refuses to evaluate without naming the room", async () => {
      await expect(evaluate(ROOM_PLAIN, { reservationId: RES })).rejects.toThrow(
        ROOM_UNIT_REQUIRED_FOR_ELIGIBILITY,
      );
    });

    it("does not read the guest text: special requests say accessible and connecting", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_A, false, false);
      const result = await evaluate(ROOM_PLAIN, { reservationId: RES, reservationRoomId: UNIT_A });
      expect(result).toMatchObject({ source: "unit", eligible: true, codes: [] });
    });
  });

  describe("drafts and moves", () => {
    it("pre-create: the wizard's in-memory value reaches the evaluator", async () => {
      await setRules({ accessibility: true, connecting: true });
      const required = await evaluate(ROOM_PLAIN, { draft: { accessibleRoomRequired: true } });
      expect(required).toMatchObject({ source: "draft", eligible: false });
      expect(required.codes).toContain(ACCESSIBLE_CODE);
      const notRequired = await evaluate(ROOM_PLAIN, { draft: { accessibleRoomRequired: false } });
      expect(notRequired).toMatchObject({ eligible: true });
    });

    it("pre-create with the toggle OFF is not blocked", async () => {
      await setRules({ accessibility: false, connecting: false });
      const result = await evaluate(ROOM_PLAIN, {
        draft: { accessibleRoomRequired: true, connectingRoomRequired: true },
      });
      expect(result).toMatchObject({ eligible: true, codes: [] });
    });

    it("Edit: the draft replaces the stored value for the session, the stored row is untouched", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_SINGLE, false, false);
      const draft = await evaluate(ROOM_PLAIN, {
        reservationId: RES_SINGLE,
        reservationRoomId: UNIT_SINGLE,
        draft: { accessibleRoomRequired: true },
      });
      expect(draft).toMatchObject({ source: "draft", eligible: false });
      const stored = await db.query<{ accessible_room_required: boolean }>(
        `SELECT accessible_room_required FROM public.hotel_reservation_rooms WHERE id = '${UNIT_SINGLE}'`,
      );
      expect(stored.rows[0]!.accessible_room_required).toBe(false);
    });

    it("post-create: the persisted value is used once the unit exists", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_SINGLE, true, false);
      const result = await evaluate(ROOM_PLAIN, {
        reservationId: RES_SINGLE,
        reservationRoomId: UNIT_SINGLE,
      });
      expect(result).toMatchObject({ source: "unit", eligible: false });
    });

    it("Move Room: the requirement is still there after the unit changes room", async () => {
      await setRules({ accessibility: true, connecting: true });
      await setUnit(UNIT_SINGLE, true, false);
      await db.exec(
        `UPDATE public.hotel_reservation_rooms SET room_id = '${ROOM_ACCESSIBLE}' WHERE id = '${UNIT_SINGLE}'`,
      );
      const moved = await evaluate(ROOM_PLAIN, {
        reservationId: RES_SINGLE,
        reservationRoomId: UNIT_SINGLE,
      });
      expect(moved.codes).toContain(ACCESSIBLE_CODE);
      const ok = await evaluate(ROOM_ACCESSIBLE, {
        reservationId: RES_SINGLE,
        reservationRoomId: UNIT_SINGLE,
      });
      expect(ok).toMatchObject({ eligible: true });
    });
  });
});
