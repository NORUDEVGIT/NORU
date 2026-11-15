import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 0209 saves the room requirements of a new reservation in one atomic call.
 *
 * Behaviour checks run the migration in an in-process Postgres (PGlite), when it
 * can be loaded:
 *
 *   PGLITE_MODULE=/tmp/pgl/node_modules/@electric-sql/pglite/dist/index.js \
 *     npx vitest run src/packages/pms/lib/reservation-room-requirements-rpc.test.ts
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const FILE = "0209_save_hotel_reservation_room_requirements.sql";
const migration = read(`supabase/migrations/${FILE}`);
const SIGNATURE = "public.save_hotel_reservation_room_requirements(uuid, uuid, jsonb)";

describe("0209 save room requirements migration", () => {
  it("is mirrored byte for byte in both migration lanes", () => {
    expect(read(`drizzle/migrations/${FILE}`)).toBe(migration);
  });

  it("revokes browser execution and grants only service_role", () => {
    expect(migration).toContain(
      `REVOKE ALL ON FUNCTION ${SIGNATURE}\n  FROM PUBLIC, anon, authenticated;`,
    );
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${SIGNATURE}\n  TO service_role;`);
    expect(migration).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/);
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO 'public'");
  });

  it("changes no table, assignment rule or earlier migration", () => {
    expect(migration).not.toMatch(/ALTER TABLE|CREATE TABLE|DROP |DELETE /i);
    expect(migration).not.toMatch(
      /pms_evaluate_room_assignment|pms_assert_room_assignment_hard_rules|create_hotel_reservation/,
    );
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
const describeDb = PGlite ? describe : describe.skip;

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const R1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const R2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const R_OTHER_PROPERTY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Unit = {
  unit_sequence?: unknown;
  accessible_room_required?: unknown;
  connecting_room_required?: unknown;
};
const u = (sequence: number, accessible: boolean, connecting: boolean): Unit => ({
  unit_sequence: sequence,
  accessible_room_required: accessible,
  connecting_room_required: connecting,
});

describeDb("0209 save_hotel_reservation_room_requirements", () => {
  let db: Db;

  beforeAll(async () => {
    db = new PGlite!();
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
      -- Same exposure as the project: new public functions are executable by browser roles.
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

      CREATE TABLE public.hotel_reservations (
        id uuid PRIMARY KEY,
        restaurant_id uuid NOT NULL
      );
      CREATE TABLE public.hotel_reservation_rooms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id uuid NOT NULL,
        reservation_id uuid NOT NULL,
        unit_sequence integer NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        accessible_room_required boolean NOT NULL DEFAULT false,
        connecting_room_required boolean NOT NULL DEFAULT false,
        UNIQUE (reservation_id, unit_sequence)
      );
    `);
    await db.exec(migration);
  });

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM public.hotel_reservation_rooms;
      DELETE FROM public.hotel_reservations;
      INSERT INTO public.hotel_reservations (id, restaurant_id) VALUES
        ('${R1}', '${P1}'), ('${R2}', '${P1}'), ('${R_OTHER_PROPERTY}', '${P2}');
      INSERT INTO public.hotel_reservation_rooms (restaurant_id, reservation_id, unit_sequence, status) VALUES
        ('${P1}', '${R1}', 1, 'confirmed'),
        ('${P1}', '${R1}', 2, 'pending'),
        ('${P1}', '${R2}', 1, 'confirmed'),
        ('${P2}', '${R_OTHER_PROPERTY}', 1, 'confirmed');
    `);
  });

  const save = (property: string, reservation: string, units: unknown) =>
    db.query<{ result: { reservation_id: string; units_updated: number } }>(
      `SELECT public.save_hotel_reservation_room_requirements($1::uuid, $2::uuid, $3::jsonb) AS result`,
      [property, reservation, JSON.stringify(units)],
    );

  const flags = async () =>
    (
      await db.query<{ reservation_id: string; unit_sequence: number; a: boolean; c: boolean }>(`
        SELECT reservation_id, unit_sequence,
               accessible_room_required AS a, connecting_room_required AS c
        FROM public.hotel_reservation_rooms
        ORDER BY reservation_id, unit_sequence
      `)
    ).rows.map((row) => `${row.reservation_id.slice(0, 1)}${row.unit_sequence}:${row.a}/${row.c}`);

  const ALL_FALSE = ["a1:false/false", "a2:false/false", "b1:false/false", "c1:false/false"];

  describe("atomicity", () => {
    it("updates both valid units and returns the reservation and count", async () => {
      const { rows } = await save(P1, R1, [u(1, true, false), u(2, false, true)]);
      expect(rows[0]!.result).toEqual({ reservation_id: R1, units_updated: 2 });
      expect(await flags()).toEqual([
        "a1:true/false",
        "a2:false/true",
        "b1:false/false",
        "c1:false/false",
      ]);
    });

    it("updates neither unit when the second does not exist", async () => {
      await expect(save(P1, R1, [u(1, true, true), u(3, true, true)])).rejects.toThrow(
        /ROOM_UNIT_NOT_FOUND/,
      );
      expect(await flags()).toEqual(ALL_FALSE);
    });

    it.each(["checked_in", "checked_out", "cancelled", "no_show"])(
      "updates neither unit when the second is %s",
      async (status) => {
        await db.query(
          `UPDATE public.hotel_reservation_rooms SET status = $1 WHERE reservation_id = $2 AND unit_sequence = 2`,
          [status, R1],
        );
        await expect(save(P1, R1, [u(1, true, true), u(2, true, true)])).rejects.toThrow(
          /ROOM_UNIT_NOT_EDITABLE/,
        );
        expect(await flags()).toEqual(ALL_FALSE);
      },
    );

    it("rejects the whole call when a unit is listed twice", async () => {
      await expect(save(P1, R1, [u(1, true, false), u(1, false, true)])).rejects.toThrow(
        /ROOM_REQUIREMENTS_DUPLICATE_UNIT/,
      );
      expect(await flags()).toEqual(ALL_FALSE);
    });

    it("rejects a reservation of another property without changes", async () => {
      await expect(save(P1, R_OTHER_PROPERTY, [u(1, true, true)])).rejects.toThrow(
        /RESERVATION_NOT_FOUND/,
      );
      await expect(save(P2, R1, [u(1, true, true)])).rejects.toThrow(/RESERVATION_NOT_FOUND/);
      expect(await flags()).toEqual(ALL_FALSE);
    });

    it("rejects a unit that belongs to another reservation without changes", async () => {
      // R2 has only unit 1. Unit 2 exists only on R1 and must not be reached through R2.
      await expect(save(P1, R2, [u(1, true, true), u(2, true, true)])).rejects.toThrow(
        /ROOM_UNIT_NOT_FOUND/,
      );
      await expect(
        save(P1, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", [u(1, true, true)]),
      ).rejects.toThrow(/RESERVATION_NOT_FOUND/);
      expect(await flags()).toEqual(ALL_FALSE);
    });
  });

  describe("input", () => {
    it.each([
      ["a missing accessible value", [{ unit_sequence: 1, connecting_room_required: true }]],
      ["a missing connecting value", [{ unit_sequence: 1, accessible_room_required: true }]],
      ["a string boolean", [{ ...u(1, true, true), accessible_room_required: "true" }]],
      ["a null boolean", [{ ...u(1, true, true), connecting_room_required: null }]],
      ["a numeric boolean", [{ ...u(1, true, true), accessible_room_required: 1 }]],
      ["a missing sequence", [{ accessible_room_required: true, connecting_room_required: true }]],
      ["a fractional sequence", [{ ...u(1, true, true), unit_sequence: 1.5 }]],
      ["a zero sequence", [u(0, true, true)]],
      ["a non-object entry", [true]],
      ["an empty list", []],
      ["an object instead of a list", u(1, true, true)],
    ])("rejects %s without defaulting", async (_name, payload) => {
      await expect(save(P1, R1, payload)).rejects.toThrow(/ROOM_REQUIREMENTS_INVALID/);
      expect(await flags()).toEqual(ALL_FALSE);
    });

    it("rejects one bad entry among good ones without saving the good ones", async () => {
      await expect(
        save(P1, R1, [u(1, true, true), { unit_sequence: 2, accessible_room_required: true }]),
      ).rejects.toThrow(/ROOM_REQUIREMENTS_INVALID/);
      expect(await flags()).toEqual(ALL_FALSE);
    });
  });

  describe("values", () => {
    it.each([
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ])("stores accessible=%s connecting=%s", async (accessible, connecting) => {
      await save(P1, R1, [u(1, accessible, connecting)]);
      expect((await flags())[0]).toBe(`a1:${accessible}/${connecting}`);
    });

    it("turns a stored true back to false", async () => {
      await save(P1, R1, [u(1, true, true)]);
      await save(P1, R1, [u(1, false, false)]);
      expect((await flags())[0]).toBe("a1:false/false");
    });
  });

  describe("retry", () => {
    const reservationCount = async () =>
      Number(
        (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.hotel_reservations`))
          .rows[0]!.n,
      );

    it("is safe to run the same payload twice", async () => {
      const payload = [u(1, true, false), u(2, true, true)];
      const first = await save(P1, R1, payload);
      const after = await flags();
      const second = await save(P1, R1, payload);
      expect(second.rows[0]!.result).toEqual(first.rows[0]!.result);
      expect(await flags()).toEqual(after);
    });

    it("succeeds on a corrected retry after a failed call", async () => {
      await expect(save(P1, R1, [u(1, true, false), u(3, false, true)])).rejects.toThrow();
      expect(await flags()).toEqual(ALL_FALSE);
      const { rows } = await save(P1, R1, [u(1, true, false), u(2, false, true)]);
      expect(rows[0]!.result.units_updated).toBe(2);
      expect((await flags()).slice(0, 2)).toEqual(["a1:true/false", "a2:false/true"]);
    });

    it("keeps the reservation and never creates one, whether the call fails or succeeds", async () => {
      const before = await reservationCount();
      await expect(save(P1, R1, [u(1, true, true), u(9, true, true)])).rejects.toThrow();
      expect(await reservationCount()).toBe(before);
      const kept = await db.query(`SELECT 1 FROM public.hotel_reservations WHERE id = $1`, [R1]);
      expect(kept.rows).toHaveLength(1);
      await save(P1, R1, [u(1, true, true), u(2, true, true)]);
      expect(await reservationCount()).toBe(before);
      const units = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.hotel_reservation_rooms WHERE reservation_id = $1`,
        [R1],
      );
      expect(units.rows[0]!.n).toBe(2);
    });
  });

  describe("security", () => {
    const can = async (role: string) =>
      (
        await db.query<{ ok: boolean }>(
          `SELECT has_function_privilege($1, '${SIGNATURE}', 'EXECUTE') AS ok`,
          [role],
        )
      ).rows[0]!.ok;

    it("is executable by service_role only", async () => {
      expect(await can("service_role")).toBe(true);
      expect(await can("authenticated")).toBe(false);
      expect(await can("anon")).toBe(false);
      const publicGrant = await db.query<{ n: number }>(`
        SELECT count(*)::int AS n
        FROM pg_proc p, aclexplode(p.proacl) acl
        WHERE p.oid = '${SIGNATURE}'::regprocedure
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
      `);
      expect(publicGrant.rows[0]!.n).toBe(0);
    });

    it.each(["anon", "authenticated"])("denies a call made as %s", async (role) => {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(save(P1, R1, [u(1, true, true)])).rejects.toThrow(/permission denied/i);
      } finally {
        await db.exec(`RESET ROLE`);
      }
      expect(await flags()).toEqual(ALL_FALSE);
    });

    it("lets service_role save through the definer function", async () => {
      await db.exec(`SET ROLE service_role`);
      try {
        const { rows } = await save(P1, R1, [u(1, true, false)]);
        expect(rows[0]!.result.units_updated).toBe(1);
      } finally {
        await db.exec(`RESET ROLE`);
      }
      expect((await flags())[0]).toBe("a1:true/false");
    });

    it("is a security definer function with a fixed search path", async () => {
      const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[] }>(
        `SELECT prosecdef, proconfig FROM pg_proc WHERE oid = '${SIGNATURE}'::regprocedure`,
      );
      expect(rows[0]!.prosecdef).toBe(true);
      expect(rows[0]!.proconfig).toEqual(["search_path=public"]);
    });
  });
});
