/**
 * PRODUCT-RETIRE-14G — remove retired package entitlement keys and dead module metadata.
 * PMS entitlement, kitchen/waiter roles, Inventory, Staff, and marketing cards stay.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INVENTORY_ROLES,
  MODULE_KEYS,
  ROLE_MODULES,
  SELECTABLE_STAFF_ROLES,
  STAFF_ROLES,
  canAccessModuleFor,
} from "./module-access.ts";
import { PACKAGE_KEYS, packageCompatibilityDefault, resolvePackages } from "./package-entitlements.ts";
import { inventoryWritePackageAllowed } from "./shared-core-access.ts";
import { MARKETING_SEED } from "./marketing/seed.ts";
import { currentNoruSiteContent } from "./marketing/noru-site-defaults.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../..");
const repoRoot = join(here, "../../..");
const MIGRATION = "0201_product_retire_14g_package_module_metadata_cleanup.sql";
const drizzlePath = join(repoRoot, "drizzle/migrations", MIGRATION);
const supabasePath = join(repoRoot, "supabase/migrations", MIGRATION);
const RETIRED_PACKAGES = ["restaurant_management", "pos", "back_office"] as const;
const RETIRED_MODULES = ["food_and_beverage", "pos", "standalone_pos"] as const;

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
  if (!existsSync(dir)) return out;
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
  if (rel.startsWith("core/lib/marketing/")) return false;
  if (rel.startsWith("core/components/noru-site/")) return false;
  return true;
}

describe("PRODUCT-RETIRE-14G package and module metadata cleanup", () => {
  it("Test A — operational PACKAGE_KEYS contains only PMS", () => {
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    assert.equal(packageCompatibilityDefault("pms"), true);
    const missing = resolvePackages([]);
    assert.equal(missing.pms.enabled, true);
    assert.equal(missing.pms.source, "default_compatibility");
    const disabled = resolvePackages([{ package_key: "pms", enabled: false }]);
    assert.equal(disabled.pms.enabled, false);
    const extra = resolvePackages([
      { package_key: "pms", enabled: true },
      { package_key: "restaurant_management", enabled: true },
      { package_key: "pos", enabled: true },
      { package_key: "back_office", enabled: true },
    ]);
    assert.deepEqual(Object.keys(extra), ["pms"]);
    assert.equal(extra.pms.enabled, true);
  });

  it("Test B — no production runtime branches for RMS/POS/Back Office entitlements", () => {
    const resolver = readFileSync(join(here, "package-entitlements.ts"), "utf8");
    assert.doesNotMatch(resolver, /export function isOperationalPackage/);
    assert.doesNotMatch(resolver, /export function assertPackageMayBeEnabled/);
    assert.match(resolver, /PACKAGE_KEYS = \["pms"\]/);
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => {
      const text = readFileSync(file, "utf8");
      if (/"restaurant_management"/.test(text)) return true;
      if (/'restaurant_management'/.test(text)) return true;
      if (/"back_office"/.test(text) && !/icon:\s*"back_office"/.test(text)) return true;
      if (/isOperationalPackage/.test(text)) return true;
      if (/assertPackageMayBeEnabled/.test(text)) return true;
      return false;
    });
    assert.deepEqual(
      hits.map((file) => relative(srcRoot, file)),
      [],
    );
    assert.equal(
      existsSync(join(srcRoot, "packages/restaurant-management/lib/restaurant-package.server.ts")),
      false,
    );
  });

  it("Test C — Platform Admin only manages PMS entitlement", () => {
    const panel = readFileSync(
      join(srcRoot, "core/components/admin/package-entitlements-panel.tsx"),
      "utf8",
    );
    const fns = readFileSync(join(here, "package-entitlements.functions.ts"), "utf8");
    assert.match(panel, /PMS is the operational product/);
    assert.doesNotMatch(panel, /Retired product/);
    assert.doesNotMatch(panel, /isOperationalPackage/);
    assert.match(fns, /z\.enum\(\["pms"\]\)/);
    assert.doesNotMatch(fns, /restaurant_management/);
    assert.doesNotMatch(fns, /back_office/);
    assert.doesNotMatch(fns, /z\.enum\(\["pms", "pos"/);
  });

  it("Test D — provisioning inserts only PMS", () => {
    const { body } = readMigration();
    assert.match(body, /VALUES \(NEW\.id, 'pms', false\)/);
    assert.doesNotMatch(body, /NEW\.id, 'restaurant_management'/);
    assert.doesNotMatch(body, /NEW\.id, 'pos'/);
    assert.doesNotMatch(body, /NEW\.id, 'back_office'/);
    const server = readFileSync(join(here, "package-entitlements.server.ts"), "utf8");
    assert.match(server, /PACKAGE_KEYS\.map/);
    assert.doesNotMatch(server, /restaurant_management/);
  });

  it("Test E — marketing still contains all four advertised products", () => {
    const ids = MARKETING_SEED.packages.map((pkg) => pkg.id).sort();
    assert.deepEqual(ids, ["back-office", "pms", "restaurant-management", "standalone-pos"]);
    const site = currentNoruSiteContent();
    const productIds = site.products.map((product) => product.id).sort();
    assert.deepEqual(productIds, ["back", "pms", "pos", "rms"]);
    assert.equal(
      site.products.some((product) => product.id === "pos" && product.title === "Standalone POS"),
      true,
    );
    const cards = readFileSync(join(srcRoot, "core/components/noru-site/data/content.ts"), "utf8");
    assert.match(cards, /id:\s*"pms"/);
    assert.match(cards, /id:\s*"rms"/);
    assert.match(cards, /id:\s*"pos"/);
    assert.match(cards, /id:\s*"back"/);
    assert.doesNotMatch(cards, /restaurant_package_entitlements/);
  });

  it("Test F — no staff_module_access use of retired module keys in catalogue", () => {
    for (const key of RETIRED_MODULES) {
      assert.equal((MODULE_KEYS as readonly string[]).includes(key), false, key);
    }
    const { body } = readMigration();
    const added = body.slice(body.lastIndexOf("ADD CONSTRAINT staff_module_access_module_key_check"));
    assert.match(added, /staff_module_access_module_key_check/);
    assert.doesNotMatch(added, /food_and_beverage/);
    assert.doesNotMatch(added, /standalone_pos/);
    const access = readFileSync(join(here, "module-access.ts"), "utf8");
    assert.doesNotMatch(access, /food_and_beverage/);
    assert.doesNotMatch(access, /standalone_pos/);
  });

  it("Test G — canonical module catalogue excludes retired keys and keeps retained modules", () => {
    const keys = MODULE_KEYS as readonly string[];
    for (const key of ["inventory", "procurement", "human_resources", "front_office", "housekeeping", "accounting_finance", "reports_analytics", "configuration", "property_settings", "pms"]) {
      assert.equal(keys.includes(key), true, key);
    }
    for (const key of RETIRED_MODULES) {
      assert.equal(keys.includes(key), false, key);
    }
  });

  it("Test H — kitchen role preserved", () => {
    assert.equal((STAFF_ROLES as readonly string[]).includes("kitchen"), true);
    assert.equal(SELECTABLE_STAFF_ROLES.includes("kitchen"), true);
    assert.deepEqual(ROLE_MODULES.kitchen, ["inventory", "procurement"]);
    const { sql } = readMigration();
    assert.match(sql, /kitchen/);
    assert.doesNotMatch(stripSqlComments(sql), /DELETE FROM public\.restaurant_users/);
  });

  it("Test I — waiter role preserved", () => {
    assert.equal((STAFF_ROLES as readonly string[]).includes("waiter"), true);
    assert.equal(SELECTABLE_STAFF_ROLES.includes("waiter"), true);
    assert.deepEqual(ROLE_MODULES.waiter, []);
    const { sql } = readMigration();
    assert.match(sql, /waiter/);
  });

  it("Test J — shared Inventory remains accessible according to retained authorization", () => {
    assert.equal((INVENTORY_ROLES as readonly string[]).includes("kitchen"), true);
    assert.equal((INVENTORY_ROLES as readonly string[]).includes("owner"), true);
    assert.equal((INVENTORY_ROLES as readonly string[]).includes("storekeeper"), true);
    assert.equal(canAccessModuleFor("kitchen", "inventory"), true);
    assert.equal(canAccessModuleFor("kitchen", "procurement"), true);
    assert.equal(inventoryWritePackageAllowed({ pms: true }), true);
    assert.equal(inventoryWritePackageAllowed({ pms: false }), false);
    const inventory = readFileSync(join(srcRoot, "lib/inventory-package.server.ts"), "utf8");
    assert.match(inventory, /publicPackageAvailable\(restaurantId, "pms"\)/);
    assert.doesNotMatch(inventory, /restaurant_management/);
    assert.doesNotMatch(inventory, /back_office/);
  });

  it("dual-lane 0201 SQL is byte-identical and scoped to metadata cleanup", () => {
    const { drizzleSql, supabaseSql, body } = readMigration();
    const drizzleHash = createHash("sha256").update(drizzleSql).digest("hex");
    const supabaseHash = createHash("sha256").update(supabaseSql).digest("hex");
    assert.equal(drizzleHash, supabaseHash);
    assert.equal(drizzleHash, "eb3c60344dd8e7bb522942eb26a78629f8f6e2a721ea7f956cbba86e540670f5");
    assert.match(drizzleSql, /PRODUCT-RETIRE-14G/);
    assert.match(body, /DELETE FROM public\.restaurant_package_entitlements/);
    assert.match(body, /package_key = 'pms'/);
    assert.doesNotMatch(body, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(body, /\bDROP\s+COLUMN\b/i);
    assert.doesNotMatch(body, /\bTRUNCATE\b/i);
    assert.doesNotMatch(body, /\bCASCADE\b/i);
    assert.doesNotMatch(body, /guest_profiles/);
    assert.doesNotMatch(body, /guest_folios/);
    assert.doesNotMatch(body, /hotel_reservations/);
    assert.doesNotMatch(body, /folio_history/);
    assert.doesNotMatch(body, /tax_rate/);
    assert.doesNotMatch(body, /cashier_shift_id/);
    assert.doesNotMatch(body, /linked_customer_user_id/);
    assert.doesNotMatch(body, /DELETE FROM public\.staff_module_access/);
    assert.doesNotMatch(body, /DELETE FROM public\.restaurant_users/);
    for (const key of RETIRED_PACKAGES) {
      assert.equal((PACKAGE_KEYS as readonly string[]).includes(key), false, key);
    }
  });
});
