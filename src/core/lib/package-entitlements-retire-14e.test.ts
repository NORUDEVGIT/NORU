/**
 * PRODUCT-RETIRE-14E — archive+remove retired menu-images storage.
 * PMS property-images / marketing-media and public schema stay.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MODULE_KEYS, STAFF_ROLES } from "./module-access.ts";
import { PACKAGE_KEYS } from "./package-entitlements.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../..");
const repoRoot = join(here, "../../..");
const MIGRATION = "0200_product_retire_14e_menu_images_storage_cleanup.sql";
const drizzlePath = join(repoRoot, "drizzle/migrations", MIGRATION);
const supabasePath = join(repoRoot, "supabase/migrations", MIGRATION);

const MENU_POLICIES = [
  "Managers can delete their menu images",
  "Managers can read their menu images",
  "Managers can update their menu images",
  "Managers can upload their menu images",
] as const;

const PROPERTY_POLICIES = [
  "Managers delete their property images",
  "Managers read their property images",
  "Managers update their property images",
  "Managers upload their property images",
] as const;

const PUBLIC_TABLES = [
  "restaurant_tables",
  "staff_table_assignments",
  "guest_profiles",
  "guest_folios",
  "folio_transactions",
  "folio_history",
  "hotel_reservations",
  "hotel_rooms",
  "hotel_cashier_shifts",
  "profiles",
  "restaurant_package_entitlements",
  "inventory_items",
] as const;

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function readMigration(): { drizzleSql: string; supabaseSql: string; sql: string; body: string } {
  assert.equal(existsSync(drizzlePath), true, drizzlePath);
  assert.equal(existsSync(supabasePath), true, supabasePath);
  const drizzleSql = readFileSync(drizzlePath, "utf8");
  const supabaseSql = readFileSync(supabasePath, "utf8");
  assert.equal(drizzleSql, supabaseSql);
  return { drizzleSql, supabaseSql, sql: drizzleSql, body: stripSqlComments(drizzleSql) };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isProductionSource(file: string): boolean {
  if (/\.test\.ts$/.test(file)) return false;
  const rel = relative(srcRoot, file);
  if (rel === "integrations/supabase/types.ts") return false;
  if (rel.startsWith("integrations/supabase/types")) return false;
  return true;
}

describe("PRODUCT-RETIRE-14E menu-images storage cleanup", () => {
  it("Test A — dual-lane 0200 SQL is byte-identical", () => {
    const { drizzleSql, supabaseSql } = readMigration();
    const drizzleHash = createHash("sha256").update(drizzleSql).digest("hex");
    const supabaseHash = createHash("sha256").update(supabaseSql).digest("hex");
    assert.equal(drizzleHash, supabaseHash);
    assert.match(drizzleSql, /PRODUCT-RETIRE-14E/);
  });

  it("Test B — no public-schema DROP TABLE / TRUNCATE / broad CASCADE", () => {
    const { sql, body } = readMigration();
    assert.doesNotMatch(body, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
    assert.doesNotMatch(body, /\bTRUNCATE\b/i);
    assert.doesNotMatch(body, /\bCASCADE\b/i);
    assert.doesNotMatch(body, /\bDROP\s+FUNCTION\b/i);
    assert.doesNotMatch(body, /\bDROP\s+COLUMN\b/i);
  });

  it("Test C — only the four dedicated menu-images policies are dropped", () => {
    const { body } = readMigration();
    for (const name of MENU_POLICIES) {
      assert.match(
        body,
        new RegExp(`DROP POLICY IF EXISTS "${name}" ON storage\\.objects`),
        name,
      );
    }
    const dropped = [...body.matchAll(/DROP POLICY IF EXISTS "([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...dropped].sort(), [...MENU_POLICIES].sort());
  });

  it("Test D — PMS/marketing storage and shared helper are preserved", () => {
    const { body } = readMigration();
    for (const name of PROPERTY_POLICIES) {
      assert.doesNotMatch(body, new RegExp(`DROP POLICY[\\s\\S]{0,80}${name}`), name);
    }
    assert.doesNotMatch(body, /DROP FUNCTION[\s\S]{0,80}can_manage_restaurant_storage/);
    assert.match(body, /can_manage_restaurant_storage\(text\)/);
    assert.match(body, /property-images/);
    assert.match(body, /marketing-media/);
    assert.doesNotMatch(body, /DELETE FROM storage\.objects/);
    assert.doesNotMatch(body, /DELETE FROM storage\.buckets/);
  });

  it("Test E — public schema tables are not mutated", () => {
    const { body } = readMigration();
    for (const table of PUBLIC_TABLES) {
      assert.doesNotMatch(body, new RegExp(`\\bDROP\\s+TABLE\\b[\\s\\S]{0,40}\\b${table}\\b`, "i"), table);
      assert.doesNotMatch(body, new RegExp(`DELETE FROM public\\.${table}\\b`), table);
    }
    assert.doesNotMatch(body, /auth\.users/);
    assert.doesNotMatch(body, /linked_customer_user_id/);
    assert.doesNotMatch(body, /PACKAGE_KEYS/);
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    assert.equal((MODULE_KEYS as readonly string[]).includes("food_and_beverage"), false);
    assert.ok((STAFF_ROLES as readonly string[]).includes("kitchen"));
    assert.ok((STAFF_ROLES as readonly string[]).includes("waiter"));
  });

  it("Test F — bucket/object bytes are not deleted in SQL", () => {
    const { sql, body } = readMigration();
    assert.doesNotMatch(body, /\bDELETE\s+FROM\b/i);
    assert.match(sql, /storage\.protect_delete/);
    assert.match(sql, /Storage API/);
  });

  it("production source has zero menu-images references", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => /menu-images/.test(readFileSync(file, "utf8")));
    assert.deepEqual(
      hits.map((file) => relative(srcRoot, file)),
      [],
    );
  });
});
