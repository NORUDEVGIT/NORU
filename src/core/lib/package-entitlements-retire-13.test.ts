/**
 * PRODUCT-RETIRE-13 — non-destructive database deprecation / lock-down.
 * Historical RMS/POS/customer tables and rows remain. App-facing QR,
 * consumer, and retired-product write paths are closed in SQL.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MARKETING_SEED } from "./marketing/seed.ts";
import { PACKAGE_KEYS } from "./package-entitlements.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../..");
const repoRoot = join(here, "../../..");
const MIGRATION = "0196_product_retire_13_non_destructive_deprecation.sql";
const drizzlePath = join(repoRoot, "drizzle/migrations", MIGRATION);
const supabasePath = join(repoRoot, "supabase/migrations", MIGRATION);

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function readMigration(): string {
  assert.equal(existsSync(drizzlePath), true, drizzlePath);
  assert.equal(existsSync(supabasePath), true, supabasePath);
  const drizzleSql = readFileSync(drizzlePath, "utf8");
  const supabaseSql = readFileSync(supabasePath, "utf8");
  assert.equal(drizzleSql, supabaseSql);
  return drizzleSql;
}

const CUSTOMER_POLICIES = [
  ['orders', "Customers can view their own orders"],
  ['order_items', "Customers can view their own order items"],
  ['order_status_history', "Customers can view their own order history"],
] as const;

const PUBLIC_QR_POLICIES = [
  ['menu_categories', "Public can view active categories of live restaurants"],
  ['menu_items', "Public can view items of live restaurants"],
  ['menu_items', "Anyone can view available menu items"],
  ['orders', "Anyone can create an order"],
  ['orders', "Anyone can view orders"],
  ['orders', "Anyone can update order status"],
  ['order_items', "Anyone can add order items"],
  ['order_items', "Anyone can view order items"],
  ['restaurant_opening_hours', "opening hours are publicly readable"],
] as const;

const RETIRED_RPCS = [
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
  "has_kitchen_access",
  "post_order_room_charge",
  "reverse_order_room_charge",
  "pos_complete_sale",
  "pos_refund_sale",
  "pos_refund_sale_allocated",
] as const;

const PMS_RPCS = [
  "post_folio_manual_charge",
  "post_folio_service_charge",
  "post_folio_charge_correction",
  "open_hotel_cashier_shift",
  "close_hotel_cashier_shift",
  "create_direct_booking",
  "preview_folio_charge",
] as const;

const SHARED_TABLES = [
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

describe("PRODUCT-RETIRE-13 non-destructive database deprecation", () => {
  it("dual-lane 0196 SQL is identical", () => {
    const sql = readMigration();
    assert.match(sql, /PRODUCT-RETIRE-13/);
  });

  it("Test A — no customer/anonymous order policy remains in 0196", () => {
    const sql = readMigration();
    for (const [table, name] of CUSTOMER_POLICIES) {
      const pattern = new RegExp(
        `DROP POLICY IF EXISTS "${name}" ON public\\.${table}`,
      );
      assert.match(sql, pattern, name);
    }
    for (const [table, name] of PUBLIC_QR_POLICIES.filter(([t]) => t === "orders" || t === "order_items")) {
      const pattern = new RegExp(
        `DROP POLICY IF EXISTS "${name}" ON public\\.${table}`,
      );
      assert.match(sql, pattern, name);
    }
    assert.match(sql, /REVOKE ALL ON public\.orders FROM anon/);
    assert.match(sql, /REVOKE ALL ON public\.order_items FROM anon/);
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.orders FROM authenticated/);
  });

  it("Test B — retired POS/RMS write RPCs are revoked from app roles", () => {
    const sql = readMigration();
    for (const name of RETIRED_RPCS) {
      assert.match(sql, new RegExp(`'${name}'`), name);
    }
    assert.match(sql, /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION %s TO service_role/);
  });

  it("Test C — PMS functions are not revoked", () => {
    const sql = stripSqlComments(readMigration());
    for (const name of PMS_RPCS) {
      assert.doesNotMatch(sql, new RegExp(`\\b${name}\\b`), name);
    }
    assert.doesNotMatch(sql, /DROP POLICY[\s\S]{0,80}guest_profiles/);
    assert.doesNotMatch(sql, /REVOKE[\s\S]{0,80}open_hotel_cashier_shift/);
    assert.doesNotMatch(sql, /REVOKE[\s\S]{0,80}post_folio_/);
    assert.doesNotMatch(sql, /DROP POLICY[\s\S]{0,80}hotel_reservations/);
  });

  it("Test D — retired package rows and keys remain", () => {
    const sql = stripSqlComments(readMigration());
    assert.match(sql, /'restaurant_management', false/);
    assert.match(sql, /'pms', false/);
    assert.match(sql, /'pos', false/);
    assert.match(sql, /'back_office', false/);
    assert.doesNotMatch(sql, /DELETE FROM(?:\s+public\.)?\s*restaurant_package_entitlements/i);
    assert.doesNotMatch(sql, /DROP CONSTRAINT[\s\S]{0,80}package_key/i);
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
  });

  it("Test E — 13 SQL does not drop historical tables; generated types match later drops", () => {
    const sql = stripSqlComments(readMigration());
    const noPublication = sql.replace(/ALTER\s+PUBLICATION\s+\w+\s+DROP\s+TABLE\b/gi, "");
    assert.doesNotMatch(noPublication, /\bDROP\s+TABLE\b/i);
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /restaurant_tables:/);
    assert.match(types, /profiles:/);
    for (const table of [
      "orders",
      "order_items",
      "menu_items",
      "menu_categories",
      "pos_sales",
      "pos_settings",
      "order_receipts",
    ]) {
      assert.doesNotMatch(types, new RegExp(`^\\s+${table}:`, "m"), table);
    }
    assert.match(types, /qr_token/);
    assert.doesNotMatch(types, /guest_token_hash/);
    assert.doesNotMatch(types, /linked_customer_user_id/);
  });

  it("Test F — legacy tax columns remain", () => {
    const sql = stripSqlComments(readMigration());
    assert.doesNotMatch(sql, /\bDROP\s+COLUMN\b/i);
    assert.match(sql, /COMMENT ON COLUMN public\.restaurants\.tax_rate/);
    assert.match(sql, /COMMENT ON COLUMN public\.restaurants\.tax_inclusive/);
    assert.match(sql, /COMMENT ON COLUMN public\.restaurants\.service_enabled/);
    assert.match(sql, /COMMENT ON COLUMN public\.restaurants\.service_rate/);
    assert.match(sql, /COMMENT ON COLUMN public\.restaurants\.tax_name/);
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /pms_taxes:/);
    assert.match(types, /default_room_tax_group_id/);
    assert.doesNotMatch(types, /^\s+service_enabled:/m);
    assert.doesNotMatch(types, /^\s+service_rate:/m);
    assert.doesNotMatch(types, /^\s+tax_name:/m);
  });

  it("Test G — shared inventory/procurement/staff tables remain untouched", () => {
    const sql = stripSqlComments(readMigration());
    for (const table of SHARED_TABLES) {
      assert.doesNotMatch(sql, new RegExp(`\\b${table}\\b`), table);
    }
  });

  it("Test H — migration contains no destructive DROP TABLE/COLUMN or historical DELETEs", () => {
    const sql = stripSqlComments(readMigration());
    const noPublication = sql.replace(/ALTER\s+PUBLICATION\s+\w+\s+DROP\s+TABLE\b/gi, "");
    assert.doesNotMatch(noPublication, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(sql, /\bDROP\s+COLUMN\b/i);
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+(?:public\.)?orders\b/i);
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+(?:public\.)?profiles\b/i);
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+(?:public\.)?pos_/i);
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+(?:public\.)?menu_/i);
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+(?:public\.)?order_items\b/i);
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+auth\.users\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
    assert.match(sql, /DROP POLICY IF EXISTS/);
  });

  it("public QR catalog policies are dropped and anon catalog grants revoked", () => {
    const sql = readMigration();
    for (const [table, name] of PUBLIC_QR_POLICIES) {
      const pattern = new RegExp(
        `DROP POLICY IF EXISTS "${name}" ON public\\.${table}`,
      );
      assert.match(sql, pattern, name);
    }
    assert.match(sql, /REVOKE SELECT ON public\.menu_items FROM anon/);
    assert.match(sql, /REVOKE SELECT ON public\.menu_categories FROM anon/);
    assert.match(sql, /Kitchen staff can update their restaurant orders/);
  });

  it("realtime publication drops orders and order_items only", () => {
    const sql = readMigration();
    assert.match(sql, /ALTER PUBLICATION supabase_realtime DROP TABLE public\.order_items/);
    assert.match(sql, /ALTER PUBLICATION supabase_realtime DROP TABLE public\.orders/);
    assert.doesNotMatch(sql, /ALTER PUBLICATION[\s\S]{0,80}guest_folios/);
    assert.doesNotMatch(sql, /ALTER PUBLICATION[\s\S]{0,80}hotel_/);
  });

  it("does not touch storage, QR token generators, customer profile triggers, or module auto-grants", () => {
    const sql = stripSqlComments(readMigration());
    assert.doesNotMatch(sql, /menu-images/);
    assert.doesNotMatch(sql, /storage\.objects/);
    assert.doesNotMatch(sql, /qr_token/);
    assert.doesNotMatch(sql, /enforce_profile_account_type/);
    assert.doesNotMatch(sql, /staff_module_access/);
    assert.doesNotMatch(sql, /auth\.users/);
  });

  it("seed lock still writes retired packages disabled", () => {
    const sql = readMigration();
    assert.match(sql, /package_key IN \('restaurant_management', 'pos', 'back_office'\)/);
    assert.match(sql, /SET enabled = false/);
    assert.match(sql, /WHERE restaurant_id = NEW\.id/);
    const seed = readFileSync(
      join(repoRoot, "drizzle/migrations/0034_seed_disabled_package_entitlements.sql"),
      "utf8",
    );
    assert.match(seed, /'restaurant_management', false/);
  });

  it("marketing and runtime policy are unchanged", () => {
    assert.equal(
      MARKETING_SEED.packages.some((pkg) => pkg.id === "restaurant-management"),
      true,
    );
    assert.equal(
      MARKETING_SEED.packages.some((pkg) => pkg.id === "standalone-pos"),
      true,
    );
    assert.equal(
      MARKETING_SEED.packages.some((pkg) => pkg.id === "back-office"),
      true,
    );
    const drizzle = readdirSync(join(repoRoot, "drizzle/migrations"));
    assert.equal(drizzle.includes(MIGRATION), true);
    // 14A dropped empty POS. 14C snapshots folio_history cashier context.
    // 14D drops the exported RMS cluster. 14E removes menu-images storage.
    // 14G removes retired package/module metadata. 14H drops leftover columns.
    // 0196 itself stays non-destructive.
    for (const name of drizzle) {
      if (!/product_retire_14/i.test(name)) continue;
      assert.match(
        name,
        /product_retire_14a_empty_pos_cleanup|product_retire_14c_folio_legacy_cashier_snapshot|product_retire_14d_rms_financial_history_cleanup|product_retire_14e_menu_images_storage_cleanup|product_retire_14g_package_module_metadata_cleanup|product_retire_14h_legacy_column_cleanup/,
        name,
      );
    }
  });
});
