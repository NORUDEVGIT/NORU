import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 1 stores an accessibility requirement and a connecting-room requirement
 * on each reservation room unit. Assignment does not read them yet.
 *
 * Behaviour checks apply the migration to a table that already has a row, in
 * an in-process Postgres (PGlite), when it can be loaded:
 *
 *   PGLITE_MODULE=/tmp/pgl/node_modules/@electric-sql/pglite/dist/index.js \
 *     npx vitest run src/packages/pms/lib/reservation-room-requirements.test.ts
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const FILE = "0208_reservation_room_assignment_requirements.sql";
const migration = read(`supabase/migrations/${FILE}`);

describe("0208 reservation room requirements", () => {
  it("is mirrored byte for byte in both migration lanes", () => {
    expect(read(`drizzle/migrations/${FILE}`)).toBe(migration);
  });

  it("adds both requirement columns as boolean, not null, default false", () => {
    expect(migration).toContain("ALTER TABLE public.hotel_reservation_rooms");
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS accessible_room_required boolean NOT NULL DEFAULT false",
    );
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS connecting_room_required boolean NOT NULL DEFAULT false",
    );
    expect(migration).toContain(
      "Whether this reservation room unit requires an accessible room for assignment. This is a reservation requirement, not a room capability.",
    );
    expect(migration).toContain(
      "Whether this reservation room unit requires a room with connecting-room capability. This is a reservation requirement, not a room capability.",
    );
  });

  it("does not backfill, infer, or change assignment behaviour", () => {
    expect(migration).not.toMatch(/\bUPDATE\b/i);
    expect(migration).not.toMatch(/special_requests|special_request_category|guest_preferences/i);
    expect(migration).not.toContain("pms_evaluate_room_assignment");
    expect(migration).not.toMatch(/\bDROP\b|\bDELETE\b/i);
  });

  it("exposes both columns on the generated reservation-room types", () => {
    const types = read("src/integrations/supabase/types.ts");
    const start = types.indexOf("hotel_reservation_rooms: {");
    const end = types.indexOf("hotel_reservations: {", start);
    const table = types.slice(start, end);
    expect(table).toContain("accessible_room_required: boolean");
    expect(table).toContain("connecting_room_required: boolean");
    expect(table).toContain("accessible_room_required?: boolean");
    expect(table).toContain("connecting_room_required?: boolean");
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

describeDb("0208 applied to an existing reservation room", () => {
  it("keeps the existing row false and rejects null", async () => {
    const db = new PGlite!();
    await db.exec(`
      CREATE TABLE public.hotel_reservation_rooms (
        id uuid PRIMARY KEY,
        restaurant_id uuid NOT NULL,
        reservation_id uuid NOT NULL
      );
      INSERT INTO public.hotel_reservation_rooms (id, restaurant_id, reservation_id)
      VALUES (
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333'
      );
    `);
    await db.exec(migration);

    const existing = await db.query<{
      accessible_room_required: boolean;
      connecting_room_required: boolean;
    }>(`
      SELECT accessible_room_required, connecting_room_required
      FROM public.hotel_reservation_rooms
      WHERE id = '11111111-1111-4111-8111-111111111111'
    `);
    expect(existing.rows[0]).toEqual({
      accessible_room_required: false,
      connecting_room_required: false,
    });

    await db.exec(`
      INSERT INTO public.hotel_reservation_rooms (id, restaurant_id, reservation_id)
      VALUES (
        '44444444-4444-4444-8444-444444444444',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333'
      );
    `);
    const inserted = await db.query<{
      accessible_room_required: boolean;
      connecting_room_required: boolean;
    }>(`
      SELECT accessible_room_required, connecting_room_required
      FROM public.hotel_reservation_rooms
      WHERE id = '44444444-4444-4444-8444-444444444444'
    `);
    expect(inserted.rows[0]).toEqual({
      accessible_room_required: false,
      connecting_room_required: false,
    });

    const columns = await db.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string;
    }>(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'hotel_reservation_rooms'
        AND column_name IN ('accessible_room_required', 'connecting_room_required')
      ORDER BY column_name
    `);
    expect(columns.rows).toEqual([
      {
        column_name: "accessible_room_required",
        data_type: "boolean",
        is_nullable: "NO",
        column_default: "false",
      },
      {
        column_name: "connecting_room_required",
        data_type: "boolean",
        is_nullable: "NO",
        column_default: "false",
      },
    ]);

    await expect(
      db.exec(`
        INSERT INTO public.hotel_reservation_rooms (
          id, restaurant_id, reservation_id, accessible_room_required
        ) VALUES (
          '55555555-5555-4555-8555-555555555555',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
          NULL
        );
      `),
    ).rejects.toThrow(/null/i);
  });
});
