/**
 * PRODUCT-RETIRE-08 — RMS staff/operational application surface is gone.
 * Marketing and historical `restaurant_management` entitlement remain.
 * QR/public ordering is retired by 09. Consumer accounts are retired by 10.
 * RMS tax compatibility is retired by 12.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PACKAGE_KEYS, resolvePackages } from "./package-entitlements.ts";
import { sharedCoreLinkVisible } from "./shared-core-access.ts";
import { MARKETING_SEED } from "./marketing/seed.ts";

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
  return true;
}

const RMS_IMPORT = /from\s+["'][^"']*packages\/restaurant-management(?:\/[^"']*)?["']/;
const RMS_DYNAMIC = /import\(\s*["'][^"']*packages\/restaurant-management(?:\/[^"']*)?["']\s*\)/;
const RMS_STAFF_ROUTE =
  /createFileRoute\(\s*["']\/(?:restaurant\/restaurant-management|restaurant\/dashboard|restaurant\/kitchen|restaurant\/menu|restaurant\/tables|restaurant\/waiter|restaurant\/orders|kitchen)/;
const CORE_FORMAT = /from\s+["']@\/core\/state\/property-format["']/;

const REMAINING_RMS_PRODUCTION = new Set<string>([]);

const SHARED_INVENTORY_DIRS = [
  join(srcRoot, "components/inventory"),
  join(srcRoot, "routes/restaurant/inventory"),
];
const SHARED_INVENTORY_FILES = [
  join(srcRoot, "lib/inventory.functions.ts"),
  join(srcRoot, "lib/inventory.server.ts"),
  join(srcRoot, "lib/inventory-package.server.ts"),
  join(srcRoot, "lib/inventory-reporting.functions.ts"),
  join(srcRoot, "lib/inventory-reporting.server.ts"),
  join(srcRoot, "lib/purchasing.functions.ts"),
  join(srcRoot, "lib/purchasing.server.ts"),
  join(srcRoot, "lib/suppliers.functions.ts"),
  join(srcRoot, "lib/assets.functions.ts"),
  join(srcRoot, "lib/assets.server.ts"),
];

describe("PRODUCT-RETIRE-08 RMS staff surface", () => {
  it("Test A — no staff operational RMS routes remain", () => {
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/restaurant-management")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/dashboard.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/kitchen.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/menu.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/tables.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/waiter.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/orders")), false);
    assert.equal(existsSync(join(srcRoot, "routes/kitchen")), false);
    const production = walk(srcRoot).filter(isProductionSource);
    for (const file of production) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, RMS_STAFF_ROUTE, relative(srcRoot, file));
    }
    const tree = readFileSync(join(srcRoot, "routeTree.gen.ts"), "utf8");
    assert.doesNotMatch(tree, /['"]\/restaurant\/restaurant-management/);
    assert.doesNotMatch(tree, /routes\/restaurant\/restaurant-management/);
    assert.doesNotMatch(tree, /['"]\/restaurant\/dashboard['"]/);
    assert.doesNotMatch(tree, /['"]\/restaurant\/kitchen['"]/);
    assert.doesNotMatch(tree, /['"]\/restaurant\/menu['"]/);
    assert.doesNotMatch(tree, /['"]\/restaurant\/tables['"]/);
    assert.doesNotMatch(tree, /['"]\/restaurant\/waiter['"]/);
    assert.doesNotMatch(tree, /['"]\/restaurant\/orders/);
  });

  it("Test B — no RMS staff launch/nav items", () => {
    const home = readFileSync(join(srcRoot, "routes/restaurant/home.tsx"), "utf8");
    assert.doesNotMatch(home, /to="\/restaurant\/restaurant-management"/);
    assert.doesNotMatch(home, /title="Restaurant Management"/);
    const shell = readFileSync(join(srcRoot, "core/components/restaurant-shell.tsx"), "utf8");
    assert.doesNotMatch(shell, /Restaurant Management Home/);
    assert.doesNotMatch(shell, /rmMod && rmPackage/);
    assert.doesNotMatch(shell, /RM_MODULES/);
    assert.match(shell, /item\.to\.startsWith\("\/restaurant\/restaurant-management"\)/);
    const reports = readFileSync(
      join(srcRoot, "core/components/workspaces/reports-workspace.tsx"),
      "utf8",
    );
    assert.doesNotMatch(reports, /\/restaurant\/restaurant-management/);
    const configuration = readFileSync(
      join(srcRoot, "core/components/workspaces/configuration-workspace.tsx"),
      "utf8",
    );
    assert.doesNotMatch(configuration, /\/restaurant\/restaurant-management/);
    const staff = readFileSync(
      join(srcRoot, "core/components/workspaces/staff-workspace.tsx"),
      "utf8",
    );
    assert.doesNotMatch(staff, /packages\/restaurant-management/);
  });

  it("Test C — remaining RMS production files are entitlement only", () => {
    const remaining = walk(join(srcRoot, "packages/restaurant-management"))
      .filter(isProductionSource)
      .map((file) => relative(join(srcRoot, "packages/restaurant-management"), file))
      .sort();
    assert.deepEqual(remaining, [...REMAINING_RMS_PRODUCTION].sort());
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/components/workspaces")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/components/rm-pos")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-routes.ts")), false);
    assert.equal(
      existsSync(join(srcRoot, "packages/restaurant-management/lib/restaurant-management-modules.ts")),
      false,
    );
  });

  it("Test D — Shared Inventory no longer lives under RMS and does not import RMS", () => {
    assert.equal(existsSync(join(srcRoot, "components/inventory/inventory-page.tsx")), true);
    assert.equal(
      existsSync(join(srcRoot, "packages/restaurant-management/components/workspaces/inventory-workspace.tsx")),
      false,
    );
    const host = readFileSync(join(srcRoot, "routes/restaurant/inventory/index.tsx"), "utf8");
    assert.match(host, /from ["']@\/components\/inventory\/inventory-page["']/);
    assert.doesNotMatch(host, RMS_IMPORT);
    const files = [...SHARED_INVENTORY_DIRS.flatMap(walk), ...SHARED_INVENTORY_FILES].filter(
      isProductionSource,
    );
    const rmsHits = files.filter((file) => {
      const src = readFileSync(file, "utf8");
      return RMS_IMPORT.test(src) || RMS_DYNAMIC.test(src);
    });
    assert.deepEqual(rmsHits.map((file) => relative(srcRoot, file)), []);
    const inventoryPage = readFileSync(join(srcRoot, "components/inventory/inventory-page.tsx"), "utf8");
    assert.match(inventoryPage, CORE_FORMAT);
    assert.doesNotMatch(inventoryPage, RMS_IMPORT);
    const has = (key: "pms") => key === "pms";
    assert.equal(sharedCoreLinkVisible("inventory", ["inventory"], has), true);
  });

  it("Test E — PMS production code does not import RMS", () => {
    const files = walk(join(srcRoot, "packages/pms")).filter(isProductionSource);
    const hits = files.filter((file) => {
      const src = readFileSync(file, "utf8");
      return RMS_IMPORT.test(src) || RMS_DYNAMIC.test(src);
    });
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test F — QR/public ordering is retired by PRODUCT-RETIRE-09", () => {
    assert.equal(existsSync(join(srcRoot, "routes/scan.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/r")), false);
  });

  it("Test G — consumer account is retired by PRODUCT-RETIRE-10", () => {
    assert.equal(existsSync(join(srcRoot, "routes/login.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/account")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/login.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/admin/login.tsx")), true);
  });

  it("Test H — room-charge RPCs are gone from generated types; live bridge is retired by 11", () => {
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.doesNotMatch(types, /post_order_room_charge/);
    assert.doesNotMatch(types, /reverse_order_room_charge/);
    assert.match(types, /room_charge_/);
    assert.equal(existsSync(join(srcRoot, "integrations/cross-package/room-charge.functions.ts")), false);
  });

  it("Test I — historical tax columns remain; RMS tax files are retired by 12", () => {
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /pms_taxes:/);
    assert.match(types, /pms_service_charges:/);
    assert.doesNotMatch(types, /^\s+service_enabled:/m);
    assert.doesNotMatch(types, /^\s+service_rate:/m);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.ts")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.server.ts")), false);
    assert.equal(existsSync(join(srcRoot, "packages/pms/lib/pms-set1-foundation.ts")), true);
  });

  it("Test J — restaurant_management is no longer an operational package key", () => {
    assert.equal((PACKAGE_KEYS as readonly string[]).includes("restaurant_management"), false);
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    assert.equal(
      "restaurant_management" in
        resolvePackages([{ package_key: "restaurant_management", enabled: true }]),
      false,
    );
    const panel = readFileSync(
      join(srcRoot, "core/components/admin/package-entitlements-panel.tsx"),
      "utf8",
    );
    assert.match(panel, /PMS is the operational product/);
    assert.doesNotMatch(panel, /\{retired \? "Retired"/);
  });

  it("Test K — public marketing still includes RMS", () => {
    assert.equal(
      MARKETING_SEED.packages.some(
        (pkg) => pkg.id === "restaurant-management" && pkg.title === "Restaurant Management",
      ),
      true,
    );
    const site = MARKETING_SEED.site;
    assert.ok(site);
    assert.equal(
      site.products.some((product) => product.id === "rms" && product.title === "RMS"),
      true,
    );
    const cards = readFileSync(join(srcRoot, "core/components/noru-site/data/content.ts"), "utf8");
    assert.match(cards, /id:\s*"rms"/);
    assert.match(cards, /title:\s*"RMS"/);
  });

  it("Test L — no database migration was created", () => {
    const drizzle = readdirSync(join(repoRoot, "drizzle/migrations"));
    const supabase = readdirSync(join(repoRoot, "supabase/migrations"));
    assert.equal(
      drizzle.some((name) => /retire-?08|rms.?drop|drop.?restaurant_management/i.test(name)),
      false,
    );
    assert.equal(
      supabase.some((name) => /retire-?08|rms.?drop|drop.?restaurant_management/i.test(name)),
      false,
    );
  });
});
