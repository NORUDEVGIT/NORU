/**
 * PRODUCT-RETIRE-15 — permanent PMS-only architecture regression.
 * Runtime is PMS only. Marketing still advertises four public products.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MODULE_KEYS,
  ROLE_MODULES,
  SELECTABLE_STAFF_ROLES,
  STAFF_ROLES,
  canAccessModuleFor,
} from "./module-access.ts";
import { PACKAGE_KEYS, resolvePackages } from "./package-entitlements.ts";
import { MARKETING_SEED } from "./marketing/seed.ts";
import { currentNoruSiteContent } from "./marketing/noru-site-defaults.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../..");
const repoRoot = join(here, "../../..");

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

const RETIRED_PACKAGES = ["restaurant_management", "pos", "back_office"] as const;
const RETIRED_MODULES = ["food_and_beverage", "pos", "standalone_pos"] as const;
const RETIRED_ROUTES = [
  "/restaurant/restaurant-management",
  "/restaurant/pos",
  "/restaurant/back-office",
  "/scan",
  "/r/$restaurantSlug",
  "/cart",
  "/account",
] as const;
const RETIRED_TABLES = [
  "orders",
  "order_items",
  "order_payments",
  "order_refunds",
  "order_receipts",
  "menu_items",
  "menu_categories",
  "cashier_shifts",
  "pos_settings",
  "pos_registers",
  "pos_categories",
  "pos_products",
  "pos_cashier_shifts",
  "pos_sales",
  "pos_sale_items",
  "pos_payments",
  "pos_refunds",
] as const;
const RETIRED_FNS = [
  "post_order_room_charge",
  "reverse_order_room_charge",
  "open_cashier_shift",
  "close_cashier_shift",
  "apply_rm_order_comp",
  "pos_complete_sale",
  "has_kitchen_access",
] as const;

describe("PRODUCT-RETIRE-15 PMS-only architecture", () => {
  it("runtime packages are PMS only", () => {
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    const resolved = resolvePackages([
      { package_key: "restaurant_management", enabled: true },
      { package_key: "pos", enabled: true },
      { package_key: "back_office", enabled: true },
    ]);
    assert.deepEqual(Object.keys(resolved), ["pms"]);
    for (const key of RETIRED_PACKAGES) {
      assert.equal((PACKAGE_KEYS as readonly string[]).includes(key), false, key);
    }
  });

  it("retired operational routes are absent", () => {
    const tree = readFileSync(join(srcRoot, "routeTree.gen.ts"), "utf8");
    for (const route of RETIRED_ROUTES) {
      assert.doesNotMatch(tree, new RegExp(`fullPath: '${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
    assert.doesNotMatch(tree, /fullPath: '\/login'/);
    assert.doesNotMatch(tree, /fullPath: '\/register'/);
    assert.match(tree, /fullPath: '\/restaurant\/login'/);
    assert.match(tree, /fullPath: '\/restaurant\/register'/);
    assert.match(tree, /fullPath: '\/restaurant\/forgot-password'/);
    assert.match(tree, /fullPath: '\/restaurant\/reset-password'/);
    assert.match(tree, /fullPath: '\/admin\/login'/);
    assert.match(tree, /fullPath: '\/restaurant\/pms\//);
    assert.match(tree, /fullPath: '\/stay\/\$propertySlug\/'/);
    assert.equal(existsSync(join(srcRoot, "routes/login.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/register.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/scan.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/account")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/restaurant-management")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/pos")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/back-office")), false);
  });

  it("retired production imports are zero", () => {
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management")), false);
    assert.equal(existsSync(join(srcRoot, "packages/standalone-pos")), false);
    assert.equal(existsSync(join(srcRoot, "packages/back-office")), false);
    assert.equal(existsSync(join(srcRoot, "packages/pms")), true);
    const rmsImport = /from\s+["'][^"']*packages\/(?:restaurant-management|standalone-pos|back-office)(?:\/[^"']*)?["']/;
    const rmsDynamic = /import\(\s*["'][^"']*packages\/(?:restaurant-management|standalone-pos|back-office)(?:\/[^"']*)?["']\s*\)/;
    const hits = walk(srcRoot).filter(isProductionSource).filter((file) => {
      const src = readFileSync(file, "utf8");
      return rmsImport.test(src) || rmsDynamic.test(src);
    });
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
    const home = readFileSync(join(srcRoot, "routes/index.tsx"), "utf8");
    assert.match(home, /dashboardHref: hasRestaurant \? "\/restaurant\/home"/);
    assert.doesNotMatch(home, /\/restaurant\/restaurant-management/);
  });

  it("retired entitlement and module keys are absent", () => {
    for (const key of RETIRED_MODULES) {
      assert.equal((MODULE_KEYS as readonly string[]).includes(key), false, key);
    }
    assert.deepEqual(
      [...MODULE_KEYS],
      [
        "pms",
        "front_office",
        "housekeeping",
        "inventory",
        "procurement",
        "human_resources",
        "accounting_finance",
        "reports_analytics",
        "configuration",
        "property_settings",
      ],
    );
  });

  it("marketing still contains four public product cards", () => {
    const ids = MARKETING_SEED.packages.map((pkg) => pkg.id).sort();
    assert.deepEqual(ids, ["back-office", "pms", "restaurant-management", "standalone-pos"]);
    const site = currentNoruSiteContent();
    assert.deepEqual(site.products.map((product) => product.id).sort(), ["back", "pms", "pos", "rms"]);
  });

  it("kitchen and waiter remain required staff roles", () => {
    assert.equal((STAFF_ROLES as readonly string[]).includes("kitchen"), true);
    assert.equal((STAFF_ROLES as readonly string[]).includes("waiter"), true);
    assert.equal(SELECTABLE_STAFF_ROLES.includes("kitchen"), true);
    assert.equal(SELECTABLE_STAFF_ROLES.includes("waiter"), true);
    assert.deepEqual(ROLE_MODULES.kitchen, ["inventory", "procurement"]);
    assert.equal(canAccessModuleFor("kitchen", "inventory"), true);
    assert.equal(canAccessModuleFor("waiter", "inventory"), false);
  });

  it("PMS owns taxes, cashiering, guest profiles; inventory remains shared", () => {
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /pms_taxes:/);
    assert.match(types, /pms_service_charges:/);
    assert.match(types, /pms_fees:/);
    assert.match(types, /hotel_cashier_shifts:/);
    assert.match(types, /open_hotel_cashier_shift:/);
    assert.match(types, /close_hotel_cashier_shift:/);
    assert.match(types, /guest_profiles:/);
    assert.match(types, /inventory_items:/);
    assert.match(types, /purchase_orders:/);
    assert.match(types, /restaurant_users:/);
    assert.match(types, /restaurant_tables:/);
    assert.doesNotMatch(types, /linked_customer_user_id/);
    assert.doesNotMatch(types, /guest_token_hash/);
    for (const table of RETIRED_TABLES) {
      assert.doesNotMatch(types, new RegExp(`^\\s+${table}:`, "m"), table);
    }
    for (const fn of RETIRED_FNS) {
      assert.doesNotMatch(types, new RegExp(`^\\s+${fn}:`, "m"), fn);
    }
    const root = readFileSync(join(srcRoot, "routes/__root.tsx"), "utf8");
    assert.doesNotMatch(root, /Restaurant Ordering Platform/);
    assert.doesNotMatch(root, /scan, order to your table/);
    const home = readFileSync(join(srcRoot, "routes/restaurant/home.tsx"), "utf8");
    assert.match(home, /title="PMS"/);
    assert.doesNotMatch(home, /title="Restaurant Management"/);
    assert.doesNotMatch(home, /title="Standalone POS"/);
    assert.doesNotMatch(home, /title="Back Office"/);
    assert.equal(existsSync(join(repoRoot, "docs/pms-only-architecture.md")), true);
  });
});
