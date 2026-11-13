import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const FILE = "0206_reservation_rpc_execute_grants.sql";
const migration = read(`supabase/migrations/${FILE}`);

const SERVER_ONLY = [
  "create_hotel_reservation",
  "create_hotel_reservation_priced",
  "create_hotel_reservation_priced_commercial",
  "amend_hotel_reservation_priced",
  "assign_hotel_reservation_room_unit",
  "change_hotel_stay_dates",
  "sync_hotel_reservation_packages",
  "sync_hotel_reservation_promotion",
];

const statements = (verb: "REVOKE ALL ON" | "GRANT EXECUTE ON") =>
  [
    ...migration.matchAll(
      new RegExp(`${verb} FUNCTION public\\.([a-z_]+)\\(([^)]*)\\)\\s+(FROM|TO) ([^;]+);`, "g"),
    ),
  ].map((m) => ({ name: m[1], target: m[4].trim() }));

describe("0206 reservation RPC execute grants", () => {
  it("is mirrored byte for byte in both migration lanes", () => {
    expect(read(`drizzle/migrations/${FILE}`)).toBe(migration);
  });

  it("only changes grants", () => {
    expect(migration).not.toMatch(/CREATE|DROP|ALTER|POLICY|UPDATE|INSERT|DELETE/);
  });

  it("revokes every server-only writer from PUBLIC, anon and authenticated", () => {
    const revoked = statements("REVOKE ALL ON");
    expect(revoked.map((s) => s.name).sort()).toEqual([...SERVER_ONLY].sort());
    for (const s of revoked) expect(s.target).toBe("PUBLIC, anon, authenticated");
  });

  it("keeps service_role and grants nothing to browser roles", () => {
    const granted = statements("GRANT EXECUTE ON");
    expect(granted.map((s) => s.name).sort()).toEqual([...SERVER_ONLY].sort());
    for (const s of granted) expect(s.target).toBe("service_role");
    expect(migration).not.toMatch(/TO (anon|authenticated|PUBLIC)/);
  });

  it("matches the server-only callers in application code", () => {
    const sources = [
      "src/packages/pms/lib/reservations.functions.ts",
      "src/packages/pms/lib/reservation-room-type.functions.ts",
      "src/packages/pms/lib/reservation-detail-controls.functions.ts",
    ]
      .map(read)
      .join("\n");
    for (const name of SERVER_ONLY) {
      expect(sources).not.toMatch(new RegExp(`context\\.supabase\\s*\\.rpc\\(\\s*"${name}"`));
    }
  });
});
