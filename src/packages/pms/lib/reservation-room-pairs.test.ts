import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  CONNECTING_PAIR_NOTE,
  REMOVE_PAIR_KEEP_LABEL,
  REMOVE_PAIR_TURN_OFF_LABEL,
  ROOM1_PAIR_REF,
  assertValidPairSequences,
  connectingPairLine,
  draftPairsToSequences,
  draftPartnerOptions,
  pairForUnit,
  pairLabelFor,
  pairUnitOptionLabel,
  pendingPairSave,
  pruneDraftPairs,
  removePairConfirmText,
  retryPendingPairSave,
  roomPairErrorMessage,
  roomingPartnerOptions,
  saveRoomPairsBySequence,
  savedPartnerOptions,
  setDraftPartner,
  type DraftPairUnit,
  type ReservationPairUnit,
  type RoomPairDb,
} from "./reservation-room-pairs";

/**
 * Phase 5C: reservation room pairs for connecting-room stays.
 *
 * Database checks run migration 0212 in an in-process Postgres (PGlite), when
 * it can be loaded:
 *
 *   PGLITE_MODULE=/tmp/pgl/node_modules/@electric-sql/pglite/dist/index.js \
 *     npx vitest run src/packages/pms/lib/reservation-room-pairs.test.ts
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const FILE = "0212_reservation_room_pairs.sql";
const migration = read(`supabase/migrations/${FILE}`);

const FUNCTIONS = [
  "public.pms_reservation_room_pair_label(uuid, uuid)",
  "public.pms_record_room_pair_event(uuid, text, text, uuid)",
  "public.save_hotel_reservation_room_pair(uuid, uuid, uuid, uuid, boolean, boolean)",
  "public.remove_hotel_reservation_room_pair(uuid, uuid, boolean, boolean, uuid)",
  "public.save_pms_group_rooming_pair(uuid, uuid, uuid, uuid)",
];
const TRIGGER_FUNCTIONS = [
  "public.pms_guard_reservation_room_pair()",
  "public.pms_reservation_room_pair_unit_guard()",
];

describe("0212 migration text", () => {
  it("is still present and mirrored byte for byte (0213 builds on it)", () => {
    const numbered = readdirSync(resolve(root, "supabase/migrations"))
      .filter((name) => /^\d{4}_/.test(name))
      .sort();
    expect(numbered).toContain(FILE);
    expect(numbered.indexOf(FILE)).toBeLessThan(numbered.length);
    expect(read(`drizzle/migrations/${FILE}`)).toBe(migration);
  });

  it("revokes PUBLIC, anon and authenticated and grants service_role only", () => {
    for (const signature of FUNCTIONS) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION ${signature}\n  FROM PUBLIC, anon, authenticated;`,
      );
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}\n  TO service_role;`);
    }
    for (const signature of TRIGGER_FUNCTIONS) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION ${signature}\n  FROM PUBLIC, anon, authenticated;`,
      );
    }
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.hotel_reservation_room_pairs FROM PUBLIC, anon, authenticated;",
    );
    expect(migration).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/);
    const code = migration.replace(/--.*$/gm, "");
    const definers = code.match(/SECURITY DEFINER/g)?.length ?? 0;
    const paths = code.match(/SET search_path TO 'public'/g)?.length ?? 0;
    expect(definers).toBe(FUNCTIONS.length + TRIGGER_FUNCTIONS.length);
    expect(paths).toBe(definers);
  });

  it("leaves assignment enforcement, room links and earlier migrations alone", () => {
    expect(migration).not.toMatch(
      /pms_evaluate_room_assignment|pms_assert_room_assignment_hard_rules|pms_enforce_room_unit_requirements|accessible_eligible|connecting_eligible/,
    );
    expect(migration).not.toMatch(/(ALTER|CREATE|DROP)[^;]*hotel_room_links/i);
    expect(migration).not.toMatch(
      /\b(assert_reservation_room_units?|assert_reservation_room_unit_room|amend_hotel_reservation|move_hotel_reservation_room|check_in_hotel_reservation)\b/,
    );
    expect(migration).not.toMatch(/DELETE FROM/i);
  });
});

/* ------------------------------------------------------------------ pure helpers */

const units: DraftPairUnit[] = [
  { ref: ROOM1_PAIR_REF, unitSequence: 1, label: "Room 1" },
  { ref: "k2", unitSequence: 2, label: "Room 2" },
  { ref: "k3", unitSequence: 3, label: "Room 3" },
  { ref: "k4", unitSequence: 4, label: "Room 4" },
];

describe("draft pairing", () => {
  it("pairs symmetrically and releases earlier partners", () => {
    let pairs = setDraftPartner({}, ROOM1_PAIR_REF, "k2");
    expect(pairs).toEqual({ [ROOM1_PAIR_REF]: "k2", k2: ROOM1_PAIR_REF });
    pairs = setDraftPartner(pairs, "k3", "k2");
    expect(pairs).toEqual({ k3: "k2", k2: "k3" });
    pairs = setDraftPartner(pairs, "k3", null);
    expect(pairs).toEqual({});
    expect(setDraftPartner({}, "k2", "k2")).toEqual({});
  });

  it("offers every other unit not paired elsewhere", () => {
    const pairs = setDraftPartner({}, ROOM1_PAIR_REF, "k2");
    expect(draftPartnerOptions(units, pairs, "k3").map((unit) => unit.ref)).toEqual(["k4"]);
    expect(draftPartnerOptions(units, pairs, "k2").map((unit) => unit.ref)).toEqual([
      ROOM1_PAIR_REF,
      "k3",
      "k4",
    ]);
  });

  it("drops pairs of removed rooms and one-sided entries", () => {
    const pairs = { ...setDraftPartner({}, "k2", "k3"), k4: ROOM1_PAIR_REF };
    expect(pruneDraftPairs(pairs, [ROOM1_PAIR_REF, "k2", "k4"])).toEqual({});
    expect(pruneDraftPairs(pairs, [ROOM1_PAIR_REF, "k2", "k3", "k4"])).toEqual({ k2: "k3", k3: "k2" });
  });

  it("sends each pair once by unit sequence", () => {
    const pairs = setDraftPartner(setDraftPartner({}, "k3", ROOM1_PAIR_REF), "k4", "k2");
    expect(draftPairsToSequences(units, pairs)).toEqual([
      { unitSequenceA: 1, unitSequenceB: 3 },
      { unitSequenceA: 2, unitSequenceB: 4 },
    ]);
  });

  it("refuses a pair list with a repeated or missing unit", () => {
    expect(() => assertValidPairSequences([{ unitSequenceA: 1, unitSequenceB: 1 }], 2)).toThrow();
    expect(() =>
      assertValidPairSequences(
        [
          { unitSequenceA: 1, unitSequenceB: 2 },
          { unitSequenceA: 2, unitSequenceB: 3 },
        ],
        3,
      ),
    ).toThrow(/already paired/);
    expect(() => assertValidPairSequences([{ unitSequenceA: 1, unitSequenceB: 3 }], 2)).toThrow();
    expect(() => assertValidPairSequences([{ unitSequenceA: 1, unitSequenceB: 2 }], 2)).not.toThrow();
  });

  it("labels options and pairs without raw ids", () => {
    expect(pairUnitOptionLabel({ unitSequence: 2, roomTypeName: "Deluxe King", adults: 2 })).toBe(
      "Room 2 · Deluxe King · 2 adults",
    );
    expect(
      pairUnitOptionLabel({ unitSequence: 1, roomTypeName: null, adults: 1, children: 1, confirmationNumber: "R-9" }),
    ).toBe("Room 1 (R-9) · 1 adult, 1 child");
    expect(connectingPairLine("Room 1 ↔ Room 2")).toBe("Connecting pair: Room 1 ↔ Room 2");
    expect(CONNECTING_PAIR_NOTE).toBe("Reservation rooms paired for connecting-room assignment.");
    expect(removePairConfirmText("Room 1", "Room 2")).toBe(
      "Remove the connection between Room 1 and Room 2?",
    );
    expect(REMOVE_PAIR_TURN_OFF_LABEL).toBe("Remove pairing and turn off connecting requirement");
    expect(REMOVE_PAIR_KEEP_LABEL).toBe("Remove pairing but keep connecting requirement");
  });

  it("maps database codes to staff wording and never leaks them", () => {
    expect(roomPairErrorMessage("ROOM_PAIR_NOT_RELATED")).toMatch(/same group/);
    expect(roomPairErrorMessage(new Error("ROOM_PAIR_STAYS_DO_NOT_OVERLAP"))).toMatch(/same nights/);
    expect(roomPairErrorMessage("something odd 1234-uuid")).toBe(
      "The connecting pair could not be saved. Try again.",
    );
  });
});

describe("saved pairs read model", () => {
  const unit = (id: string, sequence: number, own: boolean, status = "confirmed"): ReservationPairUnit => ({
    id,
    reservationId: own ? "r1" : "r2",
    unitSequence: sequence,
    status,
    roomTypeName: "Deluxe",
    adults: 2,
    children: 0,
    confirmationNumber: own ? "C1" : "C2",
    own,
  });
  const list = [unit("u1", 1, true), unit("u2", 2, true), unit("u3", 1, false), unit("u4", 3, true, "cancelled")];
  const pairs = [{ pairId: "p", unitAId: "u3", unitBId: "u1", label: "" }];

  it("puts own rooms first and names other reservations by confirmation", () => {
    expect(pairLabelFor(pairs[0]!, list)).toBe("Room 1 ↔ Room 1 (C2)");
    expect(pairLabelFor({ unitAId: "u2", unitBId: "u1" }, list)).toBe("Room 1 ↔ Room 2");
  });

  it("finds a unit's partner and offers only free active units", () => {
    expect(pairForUnit("u1", pairs)?.partnerId).toBe("u3");
    expect(savedPartnerOptions("u2", list, pairs).map((row) => row.id)).toEqual([]);
    expect(savedPartnerOptions("u1", list, pairs).map((row) => row.id)).toEqual(["u2", "u3"]);
  });

  it("offers rooming rows that are free or already this row's partner", () => {
    const rows = [
      { id: "a", connecting_partner_row_id: "b" },
      { id: "b", connecting_partner_row_id: "a" },
      { id: "c", connecting_partner_row_id: null },
    ];
    expect(roomingPartnerOptions(rows, "a").map((row) => row.id)).toEqual(["b", "c"]);
    expect(roomingPartnerOptions(rows, "c").map((row) => row.id)).toEqual([]);
  });
});

describe("create recovery", () => {
  const pairs = [{ unitSequenceA: 1, unitSequenceB: 2 }];

  it("holds nothing when no pair was intended or every pair saved", () => {
    expect(pendingPairSave({ id: "r", confirmationNumber: "C", roomPairs: { complete: false } }, [])).toBeNull();
    expect(pendingPairSave({ id: "r", confirmationNumber: "C", roomPairs: { complete: true } }, pairs)).toBeNull();
  });

  it("keeps the reservation and the intended pairs when the save failed", () => {
    expect(
      pendingPairSave({ id: "r", confirmationNumber: "C", roomPairs: { complete: false, reason: "x" } }, pairs),
    ).toEqual({ reservationId: "r", confirmationNumber: "C", pairs, reason: "x" });
  });

  it("retries only the pairs on the same reservation and keeps them on failure", async () => {
    const pending = { reservationId: "r", confirmationNumber: "C", pairs };
    const calls: unknown[] = [];
    const failed = await retryPendingPairSave(pending, async (input) => {
      calls.push(input);
      return { complete: false, reason: "Not yet" };
    });
    expect(failed).toEqual({ ...pending, reason: "Not yet" });
    const thrown = await retryPendingPairSave(pending, async () => {
      throw new Error("ROOM_PAIR_NOT_RELATED");
    });
    expect(thrown?.pairs).toEqual(pairs);
    const done = await retryPendingPairSave(pending, async (input) => {
      calls.push(input);
      return { complete: true };
    });
    expect(done).toBeNull();
    expect(calls).toEqual([
      { reservationId: "r", pairs },
      { reservationId: "r", pairs },
    ]);
  });

  it("resolves unit ids by reservation and unit sequence", async () => {
    const rpcCalls: Array<Record<string, unknown>> = [];
    const filters: Array<[string, string]> = [];
    const builder = {
      eq(column: string, value: string) {
        filters.push([column, value]);
        return builder;
      },
      in: () => builder,
      is: () => builder,
      or: () => builder,
      then: (resolveRows: (value: unknown) => unknown) =>
        resolveRows({
          data: [
            { id: "unit-1", unit_sequence: 1 },
            { id: "unit-2", unit_sequence: 2 },
          ],
          error: null,
        }),
    };
    const db = {
      from: () => ({ select: () => builder }),
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        rpcCalls.push(args);
        return { data: { created: true }, error: null };
      },
    } as unknown as RoomPairDb;
    const saved = await saveRoomPairsBySequence(db, {
      restaurantId: "p1",
      reservationId: "r1",
      actorMembershipId: "m1",
      pairs: [{ unitSequenceA: 1, unitSequenceB: 2 }],
    });
    expect(saved.complete).toBe(true);
    expect(filters).toEqual([
      ["restaurant_id", "p1"],
      ["reservation_id", "r1"],
    ]);
    expect(rpcCalls).toEqual([
      { _restaurant_id: "p1", _unit_id: "unit-1", _partner_unit_id: "unit-2", _actor_membership_id: "m1" },
    ]);
  });
});

/* ------------------------------------------------------------------ wiring */

describe("staff surfaces", () => {
  const createPage = read("src/packages/pms/components/bookings/create-reservation-page.tsx");
  const rooming = read("src/packages/pms/components/bookings/create-reservation-rooming-list.tsx");
  const edit = read("src/packages/pms/components/workspaces/reservation-edit-workspace.tsx");
  const detail = read("src/packages/pms/components/workspaces/reservation-detail-rooms.tsx");
  const group = read("src/packages/pms/components/reservations/group-detail-workspace.tsx");
  const reservations = read("src/packages/pms/lib/reservations.functions.ts");
  const groups = read("src/packages/pms/lib/groups.functions.ts");

  it("create keeps the draft pairs in memory, sends them and recovers without recreating", () => {
    expect(createPage).toContain("roomPairs: intendedRoomPairs");
    expect(createPage).toContain("pendingPairSave(result, intendedRoomPairs)");
    expect(createPage).toContain("retryPendingPairSave(current");
    expect(createPage).toContain("saveReservationRoomPairsAfterCreate");
    expect(createPage).toMatch(/pendingPairsRef\.current\) \{\n\s+throw new Error/);
    expect(rooming).toContain("<DraftConnectsToSelect");
    expect(rooming).toMatch(/pairUnits\.length > 1/);
  });

  it("the create server saves pairs after the requirements and never before the reservation", () => {
    const start = reservations.indexOf("const roomRequirements = await saveRoomRequirementsAtomic(");
    const pairs = reservations.indexOf("await saveRoomPairsBySequence(", start);
    expect(start).toBeGreaterThan(0);
    expect(pairs).toBeGreaterThan(start);
    expect(reservations).toContain("assertValidPairSequences(roomPairs, unitRequirements.length)");
  });

  it("edit, detail and group screens show and change pairs", () => {
    expect(edit).toContain("<SavedConnectsToSection");
    expect(edit).toContain("<ConnectingPairsSummary");
    expect(edit).toContain("PAIRED_REQUIREMENT_LOCK_NOTE");
    expect(detail).toContain("<ConnectingPairsSummary");
    expect(group).toContain("<RoomingPairCell");
    expect(group).toContain("<ConnectingPairsList");
    expect(groups).toContain("carryRoomingPairToReservations(");
  });

  it("only booking, edit, detail and group code touch pairs; assignment paths do not", () => {
    const dir = resolve(root, "src/packages/pms");
    const users: string[] = [];
    const walk = (path: string) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const full = `${path}/${entry.name}`;
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
          if (/reservation-room-pairs/.test(readFileSync(full, "utf8"))) {
            users.push(full.slice(dir.length + 1));
          }
        }
      }
    };
    walk(dir);
    expect(users.sort()).toEqual(
      [
        "components/bookings/create-reservation-page.tsx",
        "components/bookings/create-reservation-rooming-list.tsx",
        "components/bookings/reservation-room-pair-controls.tsx",
        "components/reservations/group-detail-workspace.tsx",
        "components/workspaces/reservation-edit-workspace.tsx",
        "lib/groups.functions.ts",
        "lib/reservation-room-pairs.functions.ts",
        "lib/reservations.functions.ts",
      ].sort(),
    );
  });
});

/* ------------------------------------------------------------------ database */

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
const describeDb = PGlite ? describe : describe.skip;

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const M1 = "99999999-9999-4999-8999-999999999999";
const G1 = "77777777-7777-4777-8777-777777777777";
const R1 = "a0000000-0000-4000-8000-000000000001";
const R2 = "a0000000-0000-4000-8000-000000000002";
const R3 = "a0000000-0000-4000-8000-000000000003";
const R4 = "a0000000-0000-4000-8000-000000000004";
const RX = "a0000000-0000-4000-8000-0000000000ff";
const ROOM_PLAIN = "c0000000-0000-4000-8000-000000000001";
const U = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ROW = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describeDb("0212 reservation room pairs in Postgres", () => {
  let db: Db;

  beforeAll(async () => {
    db = new PGlite!();
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT ALL ON TABLES TO anon, authenticated, service_role;

      CREATE TABLE public.restaurants (id uuid PRIMARY KEY);
      CREATE TABLE public.restaurant_users (
        id uuid PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES public.restaurants(id)
      );
      CREATE TABLE public.hotel_reservations (
        id uuid PRIMARY KEY,
        restaurant_id uuid NOT NULL,
        confirmation_number text,
        pms_group_id uuid,
        group_account_master_id uuid,
        status text NOT NULL DEFAULT 'confirmed',
        UNIQUE (id, restaurant_id)
      );
      CREATE TABLE public.hotel_rooms (id uuid PRIMARY KEY, connecting boolean NOT NULL);
      CREATE TABLE public.hotel_reservation_rooms (
        id uuid PRIMARY KEY,
        restaurant_id uuid NOT NULL,
        reservation_id uuid NOT NULL REFERENCES public.hotel_reservations(id) ON DELETE CASCADE,
        unit_sequence integer NOT NULL,
        room_type_id uuid,
        room_id uuid,
        arrival_date date NOT NULL,
        departure_date date NOT NULL,
        adults integer NOT NULL DEFAULT 2,
        children integer NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'confirmed',
        accessible_room_required boolean NOT NULL DEFAULT false,
        connecting_room_required boolean NOT NULL DEFAULT false,
        CONSTRAINT hotel_reservation_rooms_id_restaurant_unique UNIQUE (id, restaurant_id),
        UNIQUE (reservation_id, unit_sequence)
      );
      -- Stand-in for the 0210 requirement trigger: an assigned room must meet the requirement.
      CREATE FUNCTION public.stub_enforce_requirements() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.connecting_room_required AND NEW.room_id IS NOT NULL
           AND NOT (SELECT connecting FROM public.hotel_rooms WHERE id = NEW.room_id) THEN
          RAISE EXCEPTION 'ROOM_CONNECTING_REQUIREMENT_NOT_MET';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_hotel_reservation_rooms_requirements
        BEFORE INSERT OR UPDATE OF room_id, accessible_room_required, connecting_room_required
        ON public.hotel_reservation_rooms FOR EACH ROW
        EXECUTE FUNCTION public.stub_enforce_requirements();
      CREATE TABLE public.hotel_reservation_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id uuid NOT NULL,
        reservation_id uuid NOT NULL REFERENCES public.hotel_reservations(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        previous_values jsonb,
        new_values jsonb,
        notes text,
        actor_membership_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT hotel_reservation_history_event_check CHECK (event_type IN ('created'))
      );
      CREATE TABLE public.pms_group_rooming_rows (
        id uuid PRIMARY KEY,
        restaurant_id uuid NOT NULL,
        group_id uuid NOT NULL,
        guest_name text NOT NULL,
        arrival_date date NOT NULL,
        departure_date date NOT NULL,
        reservation_id uuid,
        status text NOT NULL DEFAULT 'draft'
      );
    `);
    await db.exec(migration);
  });

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM public.hotel_reservation_room_pairs;
      DELETE FROM public.hotel_reservation_history;
      DELETE FROM public.pms_group_rooming_rows;
      DELETE FROM public.hotel_reservation_rooms;
      DELETE FROM public.hotel_reservations;
      DELETE FROM public.hotel_rooms;
      DELETE FROM public.restaurant_users;
      DELETE FROM public.restaurants;
      INSERT INTO public.restaurants VALUES ('${P1}'), ('${P2}');
      INSERT INTO public.restaurant_users VALUES ('${M1}', '${P1}');
      INSERT INTO public.hotel_rooms VALUES ('${ROOM_PLAIN}', false);
      INSERT INTO public.hotel_reservations (id, restaurant_id, confirmation_number, pms_group_id) VALUES
        ('${R1}', '${P1}', 'C-1', NULL),
        ('${R2}', '${P1}', 'C-2', '${G1}'),
        ('${R3}', '${P1}', 'C-3', '${G1}'),
        ('${R4}', '${P1}', 'C-4', NULL),
        ('${RX}', '${P2}', 'X-1', NULL);
      INSERT INTO public.hotel_reservation_rooms
        (id, restaurant_id, reservation_id, unit_sequence, arrival_date, departure_date, status) VALUES
        ('${U(1)}', '${P1}', '${R1}', 1, '2026-12-01', '2026-12-04', 'confirmed'),
        ('${U(2)}', '${P1}', '${R1}', 2, '2026-12-01', '2026-12-04', 'pending'),
        ('${U(3)}', '${P1}', '${R1}', 3, '2026-12-01', '2026-12-04', 'confirmed'),
        ('${U(4)}', '${P1}', '${R1}', 4, '2026-12-10', '2026-12-12', 'confirmed'),
        ('${U(5)}', '${P1}', '${R2}', 1, '2026-12-01', '2026-12-04', 'confirmed'),
        ('${U(6)}', '${P1}', '${R3}', 1, '2026-12-02', '2026-12-05', 'confirmed'),
        ('${U(7)}', '${P1}', '${R4}', 1, '2026-12-01', '2026-12-04', 'confirmed'),
        ('${U(9)}', '${P2}', '${RX}', 1, '2026-12-01', '2026-12-04', 'confirmed');
    `);
  });

  const save = (unit: string, partner: string, replace = false, keep = false, property = P1) =>
    db.query<{ result: { pair_id: string; created: boolean } }>(
      `SELECT public.save_hotel_reservation_room_pair($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6) AS result`,
      [property, unit, partner, M1, replace, keep],
    );
  const remove = (pairId: string, keepA: boolean | null, keepB: boolean | null) =>
    db.query(
      `SELECT public.remove_hotel_reservation_room_pair($1::uuid, $2::uuid, $3, $4, $5::uuid) AS result`,
      [P1, pairId, keepA, keepB, M1],
    );
  const flags = async (...ids: string[]) =>
    (
      await db.query<{ id: string; c: boolean }>(
        `SELECT id, connecting_room_required AS c FROM public.hotel_reservation_rooms WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [ids],
      )
    ).rows.map((row) => row.c);
  const activePairs = async () =>
    (
      await db.query<{ a: string; b: string }>(
        `SELECT unit_a_id AS a, unit_b_id AS b FROM public.hotel_reservation_room_pairs WHERE ended_at IS NULL ORDER BY a`,
      )
    ).rows;
  const history = async () =>
    (
      await db.query<{ reservation_id: string; event_type: string; notes: string; new_values: unknown }>(
        `SELECT reservation_id, event_type, notes, new_values FROM public.hotel_reservation_history ORDER BY created_at, event_type, reservation_id`,
      )
    ).rows;

  describe("pair table", () => {
    it("creates a valid pair in canonical order, turning on both requirements atomically", async () => {
      const { rows } = await save(U(2), U(1));
      expect(rows[0]!.result.created).toBe(true);
      expect(await activePairs()).toEqual([{ a: U(1), b: U(2) }]);
      expect(await flags(U(1), U(2))).toEqual([true, true]);
      const events = await history();
      expect(events).toHaveLength(1);
      expect(events[0]!.event_type).toBe("room_pair_created");
      expect(events[0]!.notes).toBe("Connecting-room pair created: Room 1 ↔ Room 2");
      const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      expect(events[0]!.notes).not.toMatch(uuid);
      expect(JSON.stringify(events[0]!.new_values)).not.toMatch(uuid);
      expect(events[0]!.new_values).toEqual({ connecting_pair: "Room 1 ↔ Room 2" });
    });

    it("treats the reverse of an existing pair as the same pair", async () => {
      const first = await save(U(1), U(2));
      const again = await save(U(2), U(1));
      expect(again.rows[0]!.result).toMatchObject({ pair_id: first.rows[0]!.result.pair_id, created: false });
      expect(await activePairs()).toHaveLength(1);
      expect(await history()).toHaveLength(1);
    });

    it("rejects a direct reverse or duplicate insert", async () => {
      await db.query(
        `UPDATE public.hotel_reservation_rooms SET connecting_room_required = true WHERE id = ANY($1::uuid[])`,
        [[U(1), U(2)]],
      );
      await expect(
        db.query(
          `INSERT INTO public.hotel_reservation_room_pairs (restaurant_id, unit_a_id, unit_b_id) VALUES ($1, $2, $3)`,
          [P1, U(2), U(1)],
        ),
      ).rejects.toThrow(/order_check/);
      await db.query(
        `INSERT INTO public.hotel_reservation_room_pairs (restaurant_id, unit_a_id, unit_b_id) VALUES ($1, $2, $3)`,
        [P1, U(1), U(2)],
      );
      await expect(
        db.query(
          `INSERT INTO public.hotel_reservation_room_pairs (restaurant_id, unit_a_id, unit_b_id) VALUES ($1, $2, $3)`,
          [P1, U(1), U(2)],
        ),
      ).rejects.toThrow(/ROOM_PAIR_EXISTS/);
    });

    it("rejects a self pair", async () => {
      await expect(save(U(1), U(1))).rejects.toThrow(/ROOM_PAIR_SELF/);
    });

    it("rejects a unit of another property", async () => {
      await expect(save(U(1), U(9))).rejects.toThrow(/ROOM_UNIT_NOT_FOUND/);
      await expect(save(U(9), U(1), false, false, P2)).rejects.toThrow(/ROOM_PAIR_INVALID|ROOM_UNIT_NOT_FOUND/);
      expect(await flags(U(1), U(9))).toEqual([false, false]);
    });

    it("rejects a unit already paired elsewhere, from either side", async () => {
      await save(U(1), U(2));
      await expect(save(U(3), U(2))).rejects.toThrow(/ROOM_PAIR_PARTNER_ALREADY_PAIRED/);
      await expect(save(U(1), U(3))).rejects.toThrow(/ROOM_PAIR_UNIT_ALREADY_PAIRED/);
      // unit 2 is unit_b of the first pair and would be unit_a here.
      await expect(
        db.query(
          `UPDATE public.hotel_reservation_rooms SET connecting_room_required = true WHERE id = ANY($1::uuid[])`,
          [[U(3)]],
        ).then(() =>
          db.query(
            `INSERT INTO public.hotel_reservation_room_pairs (restaurant_id, unit_a_id, unit_b_id) VALUES ($1, $2, $3)`,
            [P1, U(2), U(3)],
          ),
        ),
      ).rejects.toThrow(/ROOM_PAIR_UNIT_ALREADY_PAIRED/);
      expect(await activePairs()).toEqual([{ a: U(1), b: U(2) }]);
    });

    it("rejects stays that do not overlap", async () => {
      await expect(save(U(1), U(4))).rejects.toThrow(/ROOM_PAIR_STAYS_DO_NOT_OVERLAP/);
      expect(await flags(U(1), U(4))).toEqual([false, false]);
    });

    it.each(["cancelled", "no_show", "checked_out"])("rejects a %s unit", async (status) => {
      await db.query(`UPDATE public.hotel_reservation_rooms SET status = $1 WHERE id = $2`, [status, U(2)]);
      await expect(save(U(1), U(2))).rejects.toThrow(/ROOM_PAIR_UNIT_NOT_ACTIVE/);
      expect(await flags(U(1), U(2))).toEqual([false, false]);
    });

    it("pairs across reservations only inside one group", async () => {
      await expect(save(U(1), U(7))).rejects.toThrow(/ROOM_PAIR_NOT_RELATED/);
      await expect(save(U(1), U(5))).rejects.toThrow(/ROOM_PAIR_NOT_RELATED/);
      const { rows } = await save(U(5), U(6));
      expect(rows[0]!.result.created).toBe(true);
      const events = await history();
      expect(events.map((event) => event.reservation_id).sort()).toEqual([R2, R3].sort());
      expect(events[0]!.notes).toBe("Connecting-room pair created: Room 1 (C-2) ↔ Room 1 (C-3)");
      const master = "88888888-8888-4888-8888-888888888888";
      await db.query(
        `UPDATE public.hotel_reservations SET group_account_master_id = $1 WHERE id = ANY($2::uuid[])`,
        [master, [R1, R4]],
      );
      await expect(save(U(1), U(7))).resolves.toBeDefined();
    });
  });

  describe("requirement flags", () => {
    it("leaves no partial flag when the assigned room cannot meet the requirement", async () => {
      await db.query(`UPDATE public.hotel_reservation_rooms SET room_id = $1 WHERE id = $2`, [ROOM_PLAIN, U(2)]);
      await expect(save(U(1), U(2))).rejects.toThrow(/ROOM_CONNECTING_REQUIREMENT_NOT_MET/);
      expect(await flags(U(1), U(2))).toEqual([false, false]);
      expect(await activePairs()).toEqual([]);
      expect(await history()).toEqual([]);
    });

    it("keeps a paired unit's requirement on until the pair is removed", async () => {
      await save(U(1), U(2));
      await expect(
        db.query(`UPDATE public.hotel_reservation_rooms SET connecting_room_required = false WHERE id = $1`, [U(1)]),
      ).rejects.toThrow(/ROOM_PAIR_REQUIRES_CONNECTING/);
      expect(await flags(U(1), U(2))).toEqual([true, true]);
    });

    it("refuses a direct insert while either requirement is off", async () => {
      await expect(
        db.query(
          `INSERT INTO public.hotel_reservation_room_pairs (restaurant_id, unit_a_id, unit_b_id) VALUES ($1, $2, $3)`,
          [P1, U(1), U(2)],
        ),
      ).rejects.toThrow(/ROOM_PAIR_REQUIRES_CONNECTING/);
    });

    it("removes and turns both requirements off", async () => {
      const { rows } = await save(U(1), U(2));
      await remove(rows[0]!.result.pair_id, false, false);
      expect(await activePairs()).toEqual([]);
      expect(await flags(U(1), U(2))).toEqual([false, false]);
      const events = await history();
      expect(events.map((event) => event.event_type)).toEqual(["room_pair_created", "room_pair_removed"]);
      expect(events[1]!.notes).toBe("Connecting-room pair removed: Room 1 ↔ Room 2");
    });

    it("removes and keeps the requirement per unit as chosen", async () => {
      const { rows } = await save(U(1), U(2));
      await remove(rows[0]!.result.pair_id, true, false);
      expect(await flags(U(1), U(2))).toEqual([true, false]);
    });

    it("requires an explicit decision for both units", async () => {
      const { rows } = await save(U(1), U(2));
      await expect(remove(rows[0]!.result.pair_id, null, false)).rejects.toThrow(/ROOM_PAIR_DECISION_REQUIRED/);
      expect(await activePairs()).toHaveLength(1);
      expect(await flags(U(1), U(2))).toEqual([true, true]);
    });

    it("leaves an unpaired requirement as a plain capability flag", async () => {
      await db.query(`UPDATE public.hotel_reservation_rooms SET connecting_room_required = true WHERE id = $1`, [U(3)]);
      await db.query(`UPDATE public.hotel_reservation_rooms SET connecting_room_required = false WHERE id = $1`, [U(3)]);
      expect(await flags(U(3))).toEqual([false]);
      expect(await activePairs()).toEqual([]);
    });
  });

  describe("lifecycle", () => {
    it("ends the pair, keeps its history and leaves flags when a unit is cancelled", async () => {
      await save(U(1), U(2));
      await db.query(`UPDATE public.hotel_reservation_rooms SET status = 'cancelled' WHERE id = $1`, [U(2)]);
      expect(await activePairs()).toEqual([]);
      const stored = await db.query<{ ended_reason: string; ended_at: string | null }>(
        `SELECT ended_reason, ended_at FROM public.hotel_reservation_room_pairs`,
      );
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0]!.ended_reason).toBe("unit_cancelled");
      expect(await flags(U(1), U(2))).toEqual([true, true]);
      expect((await history()).at(-1)!.notes).toBe(
        "Connecting-room pair ended because Room 2 was cancelled: Room 1 ↔ Room 2",
      );
    });

    it("ends the pair on no-show, and the unit can pair again afterwards", async () => {
      await save(U(1), U(2));
      await db.query(`UPDATE public.hotel_reservation_rooms SET status = 'no_show' WHERE id = $1`, [U(2)]);
      const stored = await db.query<{ ended_reason: string }>(`SELECT ended_reason FROM public.hotel_reservation_room_pairs`);
      expect(stored.rows[0]!.ended_reason).toBe("unit_no_show");
      await save(U(1), U(3));
      expect(await activePairs()).toEqual([{ a: U(1), b: U(3) }]);
    });

    it("does not reopen or rewrite an ended pair", async () => {
      const { rows } = await save(U(1), U(2));
      await remove(rows[0]!.result.pair_id, true, true);
      await expect(
        db.query(`UPDATE public.hotel_reservation_room_pairs SET ended_at = NULL, ended_reason = NULL, ended_by = NULL`),
      ).rejects.toThrow(/ROOM_PAIR_ENDED/);
      await expect(remove(rows[0]!.result.pair_id, true, true)).rejects.toThrow(/ROOM_PAIR_NOT_FOUND/);
    });

    it("cascades only when the unit itself is deleted", async () => {
      await save(U(1), U(2));
      await db.query(`DELETE FROM public.hotel_reservations WHERE id = $1`, [R1]);
      expect((await db.query(`SELECT 1 FROM public.hotel_reservation_room_pairs`)).rows).toHaveLength(0);
      expect((await db.query(`SELECT 1 FROM public.hotel_reservations`)).rows).toHaveLength(4);
    });
  });

  describe("edit", () => {
    it("changes a pair atomically and records the change", async () => {
      await save(U(1), U(2));
      await expect(save(U(1), U(3))).rejects.toThrow(/ROOM_PAIR_UNIT_ALREADY_PAIRED/);
      await save(U(1), U(3), true, false);
      expect(await activePairs()).toEqual([{ a: U(1), b: U(3) }]);
      expect(await flags(U(1), U(2), U(3))).toEqual([true, false, true]);
      const types = (await history()).map((event) => event.event_type);
      expect(types).toEqual(["room_pair_created", "room_pair_changed", "room_pair_created"]);
    });

    it("can keep the previous partner's requirement on change", async () => {
      await save(U(1), U(2));
      await save(U(1), U(3), true, true);
      expect(await flags(U(1), U(2), U(3))).toEqual([true, true, true]);
    });

    it("never changes a room assignment", async () => {
      const connectingRoom = "c0000000-0000-4000-8000-000000000002";
      await db.query(`INSERT INTO public.hotel_rooms VALUES ($1, true)`, [connectingRoom]);
      await db.query(`UPDATE public.hotel_reservation_rooms SET room_id = $1 WHERE id = $2`, [connectingRoom, U(1)]);
      const { rows } = await save(U(1), U(2));
      await remove(rows[0]!.result.pair_id, false, false);
      const assigned = await db.query<{ id: string; room_id: string | null }>(
        `SELECT id, room_id FROM public.hotel_reservation_rooms WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [[U(1), U(2)]],
      );
      expect(assigned.rows.map((row) => row.room_id)).toEqual([connectingRoom, null]);
    });
  });

  describe("group rooming list", () => {
    const pairRows = (row: string, partner: string | null) =>
      db.query(`SELECT public.save_pms_group_rooming_pair($1::uuid, $2::uuid, $3::uuid, $4::uuid)`, [
        P1,
        G1,
        row,
        partner,
      ]);
    const partners = async () =>
      (
        await db.query<{ id: string; p: string | null }>(
          `SELECT id, connecting_partner_row_id AS p FROM public.pms_group_rooming_rows ORDER BY id`,
        )
      ).rows.map((row) => row.p);

    beforeEach(async () => {
      await db.exec(`
        INSERT INTO public.pms_group_rooming_rows (id, restaurant_id, group_id, guest_name, arrival_date, departure_date) VALUES
          ('${ROW(1)}', '${P1}', '${G1}', 'Ana', '2026-12-01', '2026-12-04'),
          ('${ROW(2)}', '${P1}', '${G1}', 'Ben', '2026-12-02', '2026-12-05'),
          ('${ROW(3)}', '${P1}', '${G1}', 'Cy', '2026-12-01', '2026-12-04'),
          ('${ROW(4)}', '${P1}', '${G1}', 'Di', '2027-01-01', '2027-01-03');
      `);
    });

    it("stores intent on both rows and moves it when the partner changes", async () => {
      await pairRows(ROW(1), ROW(2));
      expect(await partners()).toEqual([ROW(2), ROW(1), null, null]);
      await pairRows(ROW(1), ROW(3));
      expect(await partners()).toEqual([ROW(3), null, ROW(1), null]);
      await pairRows(ROW(3), null);
      expect(await partners()).toEqual([null, null, null, null]);
    });

    it("rejects self, taken partners and non-overlapping stays", async () => {
      await expect(pairRows(ROW(1), ROW(1))).rejects.toThrow(/ROOMING_PAIR_SELF/);
      await pairRows(ROW(1), ROW(2));
      await expect(pairRows(ROW(3), ROW(2))).rejects.toThrow(/ROOMING_PAIR_PARTNER_ALREADY_PAIRED/);
      await expect(pairRows(ROW(3), ROW(4))).rejects.toThrow(/ROOM_PAIR_STAYS_DO_NOT_OVERLAP/);
    });

    it("carries into a reservation pair once both rows have reservations", async () => {
      await pairRows(ROW(1), ROW(2));
      await db.query(`UPDATE public.pms_group_rooming_rows SET reservation_id = $1 WHERE id = $2`, [R2, ROW(1)]);
      await db.query(`UPDATE public.pms_group_rooming_rows SET reservation_id = $1 WHERE id = $2`, [R3, ROW(2)]);
      // The application resolves the first active unit of each reservation and calls the pair RPC.
      const { rows } = await save(U(5), U(6));
      expect(rows[0]!.result.created).toBe(true);
      expect(await flags(U(5), U(6))).toEqual([true, true]);
    });
  });

  describe("security", () => {
    const signatures = [
      "public.save_hotel_reservation_room_pair(uuid, uuid, uuid, uuid, boolean, boolean)",
      "public.remove_hotel_reservation_room_pair(uuid, uuid, boolean, boolean, uuid)",
      "public.save_pms_group_rooming_pair(uuid, uuid, uuid, uuid)",
      "public.pms_reservation_room_pair_label(uuid, uuid)",
      "public.pms_record_room_pair_event(uuid, text, text, uuid)",
    ];

    it.each(signatures)("%s runs for service_role only", async (signature) => {
      const { rows } = await db.query<{ anon: boolean; auth: boolean; svc: boolean; acl: string }>(
        `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') AS auth,
                has_function_privilege('service_role', $1, 'EXECUTE') AS svc,
                COALESCE(array_to_string(proacl, ','), '') AS acl
         FROM pg_proc WHERE oid = $1::regprocedure`,
        [signature],
      );
      expect(rows[0]).toMatchObject({ anon: false, auth: false, svc: true });
      expect(rows[0]!.acl).not.toMatch(/(^|,)=X/);
      const definer = await db.query<{ prosecdef: boolean; proconfig: string[] }>(
        `SELECT prosecdef, proconfig FROM pg_proc WHERE oid = $1::regprocedure`,
        [signature],
      );
      expect(definer.rows[0]!.prosecdef).toBe(true);
      expect(definer.rows[0]!.proconfig).toEqual(["search_path=public"]);
    });

    it("keeps the pair table away from browser roles", async () => {
      const { rows } = await db.query<{ anon: boolean; auth: boolean; svc: boolean; rls: boolean }>(
        `SELECT has_table_privilege('anon', 'public.hotel_reservation_room_pairs', 'SELECT') AS anon,
                has_table_privilege('authenticated', 'public.hotel_reservation_room_pairs', 'SELECT') AS auth,
                has_table_privilege('service_role', 'public.hotel_reservation_room_pairs', 'SELECT') AS svc,
                (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hotel_reservation_room_pairs'::regclass) AS rls`,
      );
      expect(rows[0]).toEqual({ anon: false, auth: false, svc: true, rls: true });
    });

    it("denies anon and authenticated callers at run time", async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`SET ROLE ${role}`);
        try {
          await expect(save(U(1), U(2))).rejects.toThrow(/permission denied/);
        } finally {
          await db.exec("RESET ROLE");
        }
      }
      expect(await activePairs()).toEqual([]);
    });
  });
});
