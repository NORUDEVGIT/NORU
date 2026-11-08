/**
 * PRODUCT-RETIRE-14D — drop the exported RMS financial/order/menu cluster.
 * Staff tables, PMS cashiering, folio_history snapshots, and identities stay.
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
const MIGRATION = "0199_product_retire_14d_rms_financial_history_cleanup.sql";
const drizzlePath = join(repoRoot, "drizzle/migrations", MIGRATION);
const supabasePath = join(repoRoot, "supabase/migrations", MIGRATION);

const APPROVED_DROP_TABLES = [
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
] as const;

const RMS_FUNCTIONS = [
  "record_pos_order_payment",
  "open_cashier_shift",
  "close_cashier_shift",
  "refund_restaurant_order",
  "apply_rm_order_discount",
  "clear_rm_order_discount",
  "apply_rm_order_comp",
  "complete_comped_order",
  "freeze_order_receipt",
  "record_order_receipt_reprint",
  "post_order_room_charge",
  "reverse_order_room_charge",
  "log_order_status",
  "has_kitchen_access",
] as const;

const STAFF_TABLES = [
  "restaurant_tables",
  "staff_table_assignments",
  "staff_shifts",
  "staff_attendance",
] as const;

const PMS_TABLES = [
  "guest_profiles",
  "guest_folios",
  "folio_transactions",
  "folio_history",
  "hotel_reservations",
  "hotel_rooms",
  "hotel_cashier_shifts",
  "pms_taxes",
  "pms_service_charges",
] as const;

const INVENTORY_TABLES = [
  "inventory_items",
  "inventory_units",
  "inventory_stock_movements",
  "restaurant_suppliers",
  "purchase_orders",
  "restaurant_assets",
] as const;

const CUSTOMER_AUTH = ["profiles", "auth.users", "linked_customer_user_id"] as const;

const LEGACY_TAX = [
  "tax_rate",
  "tax_inclusive",
  "service_enabled",
  "service_rate",
  "tax_name",
] as const;

const PMS_RPCS = [
  "open_hotel_cashier_shift",
  "close_hotel_cashier_shift",
  "post_folio_manual_charge",
  "post_folio_service_charge",
  "post_folio_charge_correction",
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

const RMS_TABLE_ACCESS =
  /\.from\(\s*["'](orders|order_items|order_status_history|order_payments|order_adjustments|order_receipts|order_refunds|order_refund_lines|menu_categories|menu_items|cashier_shifts)["']/;
const RMS_RPC =
  /\.rpc\(\s*["'](record_pos_order_payment|open_cashier_shift|close_cashier_shift|refund_restaurant_order|apply_rm_order_discount|clear_rm_order_discount|apply_rm_order_comp|complete_comped_order|freeze_order_receipt|record_order_receipt_reprint|post_order_room_charge|reverse_order_room_charge|has_kitchen_access)["']/;

describe("PRODUCT-RETIRE-14D RMS financial history cleanup", () => {
  it("Test A — dual-lane 0199 SQL is byte-identical", () => {
    const { drizzleSql, supabaseSql } = readMigration();
    const drizzleHash = createHash("sha256").update(drizzleSql).digest("hex");
    const supabaseHash = createHash("sha256").update(supabaseSql).digest("hex");
    assert.equal(drizzleHash, supabaseHash);
    assert.match(drizzleSql, /PRODUCT-RETIRE-14D/);
  });

  it("Test B — no DELETE FROM / TRUNCATE / broad CASCADE", () => {
    const { sql, body } = readMigration();
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(body, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
    assert.doesNotMatch(body, /\bTRUNCATE\b/i);
    assert.doesNotMatch(body, /\bCASCADE\b/i);
  });

  it("Test C — only approved RMS tables appear in DROP TABLE", () => {
    const { body } = readMigration();
    const dropped = droppedTables(body);
    assert.deepEqual([...dropped].sort(), [...APPROVED_DROP_TABLES].sort());
  });

  it("Test D — RMS functions and order-status triggers are dropped explicitly", () => {
    const { body } = readMigration();
    assert.match(body, /DROP TRIGGER IF EXISTS log_order_status_insert ON public\.orders/);
    assert.match(body, /DROP TRIGGER IF EXISTS log_order_status_update ON public\.orders/);
    for (const name of RMS_FUNCTIONS) {
      assert.match(body, new RegExp(`DROP FUNCTION IF EXISTS public\\.${name}\\b`), name);
    }
    assert.doesNotMatch(body, /DROP FUNCTION[\s\S]{0,80}set_updated_at/);
    for (const name of PMS_RPCS) {
      assert.doesNotMatch(body, new RegExp(`DROP FUNCTION[\\s\\S]{0,80}${name}`), name);
    }
  });

  it("Test E — staff tables are not targeted destructively", () => {
    const { body } = readMigration();
    const dropped = new Set(droppedTables(body));
    for (const table of STAFF_TABLES) {
      assert.equal(dropped.has(table), false, table);
      assert.doesNotMatch(body, new RegExp(`\\bDROP\\s+TABLE\\b[\\s\\S]{0,40}\\b${table}\\b`, "i"), table);
      assert.doesNotMatch(body, new RegExp(`REVOKE ALL ON TABLE public\\.${table}\\b`), table);
    }
  });

  it("Test F — PMS financial ownership is not dropped or altered", () => {
    const { body } = readMigration();
    const dropped = new Set(droppedTables(body));
    for (const table of PMS_TABLES) {
      assert.equal(dropped.has(table), false, table);
      assert.doesNotMatch(body, new RegExp(`\\bDROP\\s+TABLE\\b[\\s\\S]{0,40}\\b${table}\\b`, "i"), table);
    }
    assert.doesNotMatch(body, /ALTER TABLE public\.folio_history\b/);
    assert.doesNotMatch(body, /DROP COLUMN/);
    assert.match(body, /legacy_cashier_shift_id/);
    assert.match(body, /cashier_shift_id/);
  });

  it("Test G — inventory, identity, entitlements, storage, tax columns untouched", () => {
    const { body } = readMigration();
    for (const table of INVENTORY_TABLES) {
      assert.doesNotMatch(body, new RegExp(`\\bDROP\\s+TABLE\\b[\\s\\S]{0,40}\\b${table}\\b`, "i"), table);
    }
    for (const name of CUSTOMER_AUTH) {
      assert.doesNotMatch(body, new RegExp(name.replace(".", "\\.")), name);
    }
    assert.doesNotMatch(body, /restaurant_package_entitlements/);
    assert.doesNotMatch(body, /package_key/i);
    assert.doesNotMatch(body, /menu-images/);
    assert.doesNotMatch(body, /storage\.objects/);
    assert.doesNotMatch(body, /\bDROP\s+COLUMN\b/i);
    for (const col of LEGACY_TAX) {
      assert.doesNotMatch(body, new RegExp(`\\b${col}\\b`), col);
    }
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    assert.equal((MODULE_KEYS as readonly string[]).includes("food_and_beverage"), false);
    assert.equal((MODULE_KEYS as readonly string[]).includes("pos"), false);
    assert.equal((MODULE_KEYS as readonly string[]).includes("standalone_pos"), false);
    assert.ok((STAFF_ROLES as readonly string[]).includes("kitchen"));
    assert.ok((STAFF_ROLES as readonly string[]).includes("waiter"));
  });

  it("Test H — 14C FK must be absent before drop; hotel cashier RPCs asserted present", () => {
    const { body } = readMigration();
    assert.match(body, /folio_history_shift_same_property/);
    assert.match(body, /open_hotel_cashier_shift/);
    assert.match(body, /close_hotel_cashier_shift/);
    assert.match(body, /hotel_cashier_shifts/);
    assert.doesNotMatch(body, /DROP FUNCTION IF EXISTS public\.open_hotel_cashier_shift/);
    assert.doesNotMatch(body, /DROP FUNCTION IF EXISTS public\.close_hotel_cashier_shift/);
  });

  it("production source has zero RMS table or RPC references", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const tableHits = production.filter((file) => RMS_TABLE_ACCESS.test(readFileSync(file, "utf8")));
    const rpcHits = production.filter((file) => RMS_RPC.test(readFileSync(file, "utf8")));
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
