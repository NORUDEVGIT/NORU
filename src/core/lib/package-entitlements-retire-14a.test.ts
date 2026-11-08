/**
 * PRODUCT-RETIRE-14A — drop empty isolated retirement objects + empty
 * Standalone POS schema. RMS/PMS/staff/customer history stays.
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
const MIGRATION = "0197_product_retire_14a_empty_pos_cleanup.sql";
const drizzlePath = join(repoRoot, "drizzle/migrations", MIGRATION);
const supabasePath = join(repoRoot, "supabase/migrations", MIGRATION);

const APPROVED_DROP_TABLES = [
  "staff_action_grants",
  "restaurant_opening_hours",
  "menu_item_recipe_components",
  "pos_settings",
  "pos_registers",
  "pos_categories",
  "pos_products",
  "pos_cashier_shifts",
  "pos_sale_counters",
  "pos_sales",
  "pos_sale_items",
  "pos_payments",
  "pos_refunds",
] as const;

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

const PMS_SHARED_TABLES = [
  "guest_profiles",
  "guest_folios",
  "folio_transactions",
  "folio_history",
  "hotel_reservations",
  "hotel_rooms",
  "hotel_cashier_shifts",
  "pms_taxes",
  "pms_service_charges",
  "inventory_items",
  "inventory_units",
  "inventory_stock_movements",
  "restaurant_suppliers",
  "purchase_orders",
  "restaurant_assets",
  "staff_shifts",
  "staff_attendance",
  "restaurant_users",
  "staff_module_access",
] as const;

const ENTITLEMENT_OBJECTS = [
  "restaurant_package_entitlements",
  "PACKAGE_KEYS",
] as const;

const CUSTOMER_AUTH = ["profiles", "auth.users", "guest_token_hash", "linked_customer_user_id"] as const;

const LEGACY_COLUMNS = [
  "tax_rate",
  "tax_inclusive",
  "service_enabled",
  "service_rate",
  "tax_name",
  "room_charge_folio_id",
  "room_charge_reservation_id",
  "room_charge_posted_at",
  "room_charge_posted_by_membership_id",
] as const;

const POS_FUNCTIONS = [
  "pos_complete_sale",
  "pos_refund_sale_allocated",
  "pos_protect_completed_sale",
  "pos_protect_completed_sale_items",
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

function droppedTables(body: string): string[] {
  const names: string[] = [];
  const re = /\bDROP\s+TABLE\s+IF\s+EXISTS\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    names.push(match[1]);
  }
  return names;
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

const GROUP1_POS_ACCESS =
  /\.from\(\s*["'](staff_action_grants|restaurant_opening_hours|menu_item_recipe_components|pos_settings|pos_registers|pos_categories|pos_products|pos_cashier_shifts|pos_sale_counters|pos_sales|pos_sale_items|pos_payments|pos_refunds)["']/;
const POS_RPC = /\.rpc\(\s*["']pos_(complete_sale|refund_sale|refund_sale_allocated)["']/;

describe("PRODUCT-RETIRE-14A empty isolated + empty POS cleanup", () => {
  it("Test A — dual-lane 0197 SQL is byte-identical", () => {
    const { drizzleSql, supabaseSql } = readMigration();
    const drizzleHash = createHash("sha256").update(drizzleSql).digest("hex");
    const supabaseHash = createHash("sha256").update(supabaseSql).digest("hex");
    assert.equal(drizzleHash, supabaseHash);
    assert.match(drizzleSql, /PRODUCT-RETIRE-14A/);
    assert.doesNotMatch(drizzleSql, /0196_product_retire_13/);
  });

  it("Test B — no DELETE FROM", () => {
    const { sql, body } = readMigration();
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(body, /\bDELETE\s+FROM\b/i);
  });

  it("Test C — no TRUNCATE", () => {
    const { sql, body } = readMigration();
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
    assert.doesNotMatch(body, /\bTRUNCATE\b/i);
  });

  it("Test D — no broad CASCADE", () => {
    const { sql, body } = readMigration();
    assert.doesNotMatch(sql, /\bCASCADE\b/i);
    assert.doesNotMatch(body, /\bCASCADE\b/i);
  });

  it("Test E — only approved Group 1 / POS tables appear in DROP TABLE", () => {
    const { body } = readMigration();
    const dropped = droppedTables(body);
    assert.deepEqual([...dropped].sort(), [...APPROVED_DROP_TABLES].sort());
    for (const name of POS_FUNCTIONS) {
      assert.match(body, new RegExp(`DROP FUNCTION IF EXISTS public\\.${name}\\b`), name);
    }
    assert.match(body, /DROP FUNCTION IF EXISTS public\.pos_refund_sale\b/);
    assert.match(body, /DROP TRIGGER IF EXISTS pos_sales_protect_completed ON public\.pos_sales/);
    assert.match(body, /DROP TRIGGER IF EXISTS pos_sale_items_protect_completed ON public\.pos_sale_items/);
    assert.doesNotMatch(body, /DROP FUNCTION[\s\S]{0,80}set_updated_at/);
  });

  it("Test F — RMS financial/history tables are untouched", () => {
    const { body } = readMigration();
    const dropped = new Set(droppedTables(body));
    for (const table of RMS_TABLES) {
      assert.equal(dropped.has(table), false, table);
      assert.doesNotMatch(body, new RegExp(`\\bDROP\\s+TABLE\\b[\\s\\S]{0,40}\\b${table}\\b`, "i"), table);
    }
  });

  it("Test G — PMS/shared tables are untouched", () => {
    const { body } = readMigration();
    const dropped = new Set(droppedTables(body));
    for (const table of PMS_SHARED_TABLES) {
      assert.equal(dropped.has(table), false, table);
      assert.doesNotMatch(body, new RegExp(`\\bDROP\\s+TABLE\\b[\\s\\S]{0,40}\\b${table}\\b`, "i"), table);
    }
  });

  it("Test H — entitlement tables/constraints untouched", () => {
    const { body } = readMigration();
    for (const name of ENTITLEMENT_OBJECTS) {
      assert.doesNotMatch(body, new RegExp(`\\b${name}\\b`), name);
    }
    assert.doesNotMatch(body, /DROP CONSTRAINT/i);
    assert.doesNotMatch(body, /package_key/i);
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
  });

  it("Test I — customer/auth tables untouched", () => {
    const { body } = readMigration();
    for (const name of CUSTOMER_AUTH) {
      assert.doesNotMatch(body, new RegExp(name.replace(".", "\\.")), name);
    }
    assert.doesNotMatch(body, /account_type/);
  });

  it("Test J — legacy tax/room-charge columns untouched", () => {
    const { body } = readMigration();
    assert.doesNotMatch(body, /\bDROP\s+COLUMN\b/i);
    for (const col of LEGACY_COLUMNS) {
      assert.doesNotMatch(body, new RegExp(`\\b${col}\\b`), col);
    }
    assert.doesNotMatch(body, /menu-images/);
    assert.doesNotMatch(body, /storage\.objects/);
  });

  it("module keys and staff roles remain", () => {
    assert.equal((MODULE_KEYS as readonly string[]).includes("food_and_beverage"), false);
    assert.equal((MODULE_KEYS as readonly string[]).includes("pos"), false);
    assert.equal((MODULE_KEYS as readonly string[]).includes("standalone_pos"), false);
    assert.ok((STAFF_ROLES as readonly string[]).includes("kitchen"));
    assert.ok((STAFF_ROLES as readonly string[]).includes("waiter"));
  });

  it("production source has zero Group 1 / POS table or RPC references", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const tableHits = production.filter((file) => GROUP1_POS_ACCESS.test(readFileSync(file, "utf8")));
    const rpcHits = production.filter((file) => POS_RPC.test(readFileSync(file, "utf8")));
    assert.deepEqual(
      tableHits.map((file) => relative(srcRoot, file)),
      [],
    );
    assert.deepEqual(
      rpcHits.map((file) => relative(srcRoot, file)),
      [],
    );
  });
});
