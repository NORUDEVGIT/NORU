/**
 * PRODUCT-RETIRE-14C — snapshot legacy RMS cashier-shift context into
 * folio_history and drop the cashier_shifts FK. RMS tables stay.
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
const MIGRATION = "0198_product_retire_14c_folio_legacy_cashier_snapshot.sql";
const drizzlePath = join(repoRoot, "drizzle/migrations", MIGRATION);
const supabasePath = join(repoRoot, "supabase/migrations", MIGRATION);

const RMS_TABLES = [
  "orders",
  "order_items",
  "order_status_history",
  "order_payments",
  "order_adjustments",
  "order_receipts",
  "order_refunds",
  "order_refund_lines",
  "menu_categories",
  "menu_items",
  "cashier_shifts",
  "restaurant_tables",
  "staff_table_assignments",
] as const;

const PMS_CASHIER_TOKENS = [
  "hotel_cashier_shifts",
  "hotel_cashier_shift_id",
  "open_hotel_cashier_shift",
  "close_hotel_cashier_shift",
] as const;

const CUSTOMER_AUTH = ["profiles", "auth.users", "guest_token_hash", "linked_customer_user_id"] as const;

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

describe("PRODUCT-RETIRE-14C folio legacy cashier snapshot", () => {
  it("Test A — dual-lane 0198 SQL is byte-identical", () => {
    const { drizzleSql, supabaseSql } = readMigration();
    const drizzleHash = createHash("sha256").update(drizzleSql).digest("hex");
    const supabaseHash = createHash("sha256").update(supabaseSql).digest("hex");
    assert.equal(drizzleHash, supabaseHash);
    assert.match(drizzleSql, /PRODUCT-RETIRE-14C/);
    assert.doesNotMatch(drizzleSql, /0197_product_retire_14a/);
  });

  it("Test B — no DELETE FROM / TRUNCATE / DROP TABLE / CASCADE", () => {
    const { sql, body } = readMigration();
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(body, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
    assert.doesNotMatch(body, /\bTRUNCATE\b/i);
    assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(body, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(body, /\bCASCADE\b/i);
  });

  it("Test C — snapshot columns, generic backfill, and fail-closed assertion", () => {
    const { sql, body } = readMigration();
    assert.match(body, /ADD COLUMN IF NOT EXISTS legacy_cashier_shift_id uuid/);
    assert.match(body, /ADD COLUMN IF NOT EXISTS legacy_cashier_shift_status text/);
    assert.match(body, /ADD COLUMN IF NOT EXISTS legacy_cashier_shift_opened_at timestamptz/);
    assert.match(body, /ADD COLUMN IF NOT EXISTS legacy_cashier_shift_closed_at timestamptz/);
    assert.match(body, /UPDATE public\.folio_history AS fh/);
    assert.match(body, /legacy_cashier_shift_id = fh\.cashier_shift_id/);
    assert.match(body, /FROM public\.cashier_shifts AS cs/);
    assert.match(body, /RAISE EXCEPTION/);
    assert.match(body, /cashier_shift_id IS NOT NULL/);
    assert.match(sql, /legacy_cashier_shift_id IS DISTINCT FROM fh\.cashier_shift_id/);
    assert.doesNotMatch(body, /WHERE fh\.id IN\s*\(/i);
  });

  it("Test D — FK removed without CASCADE; cashier_shift_id column kept", () => {
    const { sql, body } = readMigration();
    assert.match(body, /DROP CONSTRAINT folio_history_shift_same_property;/);
    assert.doesNotMatch(body, /DROP CONSTRAINT folio_history_shift_same_property[\s\S]{0,80}CASCADE/i);
    assert.doesNotMatch(body, /\bDROP\s+COLUMN\b/i);
    assert.match(sql, /DEPRECATED PRODUCT-RETIRE-14C — legacy RMS cashier shift identifier; historical only/);
    assert.match(sql, /COMMENT ON COLUMN public\.folio_history\.legacy_cashier_shift_id/);
    assert.match(sql, /COMMENT ON COLUMN public\.folio_history\.legacy_cashier_shift_status/);
    assert.match(sql, /COMMENT ON COLUMN public\.folio_history\.legacy_cashier_shift_opened_at/);
    assert.match(sql, /COMMENT ON COLUMN public\.folio_history\.legacy_cashier_shift_closed_at/);
  });

  it("Test E — historical event fields are not rewritten", () => {
    const { body } = readMigration();
    assert.doesNotMatch(body, /\bevent_type\s*=/);
    assert.doesNotMatch(body, /\bcreated_at\s*=/);
    assert.doesNotMatch(body, /\bprevious_values\s*=/);
    assert.doesNotMatch(body, /\bnew_values\s*=/);
    assert.doesNotMatch(body, /\bcashier_shift_id\s*=/);
    assert.doesNotMatch(body, /\bDELETE\s+FROM\s+(?:public\.)?folio_history\b/i);
    assert.doesNotMatch(body, /\bDELETE\s+FROM\s+(?:public\.)?cashier_shifts\b/i);
  });

  it("Test F — PMS cashier owner objects are not mentioned", () => {
    const { sql, body } = readMigration();
    for (const token of PMS_CASHIER_TOKENS) {
      assert.doesNotMatch(sql, new RegExp(`\\b${token}\\b`), token);
      assert.doesNotMatch(body, new RegExp(`\\b${token}\\b`), token);
    }
  });

  it("Test G — RMS financial/history tables are not dropped", () => {
    const { body } = readMigration();
    for (const table of RMS_TABLES) {
      assert.doesNotMatch(body, new RegExp(`\\bDROP\\s+TABLE\\b[\\s\\S]{0,40}\\b${table}\\b`, "i"), table);
    }
    assert.doesNotMatch(body, /DROP FUNCTION[\s\S]{0,80}open_cashier_shift/);
    assert.doesNotMatch(body, /DROP FUNCTION[\s\S]{0,80}close_cashier_shift/);
    assert.doesNotMatch(body, /DROP FUNCTION[\s\S]{0,80}open_hotel_cashier_shift/);
  });

  it("Test H — customer/staff/entitlements/storage untouched", () => {
    const { body } = readMigration();
    for (const name of CUSTOMER_AUTH) {
      assert.doesNotMatch(body, new RegExp(name.replace(".", "\\.")), name);
    }
    assert.doesNotMatch(body, /restaurant_package_entitlements/);
    assert.doesNotMatch(body, /PACKAGE_KEYS/);
    assert.doesNotMatch(body, /package_key/i);
    assert.doesNotMatch(body, /menu-images/);
    assert.doesNotMatch(body, /storage\.objects/);
    assert.doesNotMatch(body, /staff_table_assignments/);
    assert.doesNotMatch(body, /restaurant_tables/);
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    assert.equal((MODULE_KEYS as readonly string[]).includes("food_and_beverage"), false);
    assert.ok((STAFF_ROLES as readonly string[]).includes("waiter"));
  });

  it("production source has zero writes to folio_history.cashier_shift_id", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => {
      const text = readFileSync(file, "utf8");
      if (/\brecordFolioEvent\b/.test(text)) return true;
      if (!text.includes("folio_history")) return false;
      if (!text.includes("cashier_shift_id")) return false;
      return /\.from\(\s*["']folio_history["']\s*\)[\s\S]{0,400}cashier_shift_id/.test(text);
    });
    assert.deepEqual(
      hits.map((file) => relative(srcRoot, file)),
      [],
    );
  });
});
