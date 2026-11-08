/**
 * PRODUCT-RETIRE-07 — Back Office application surface is gone.
 * Historical `back_office` entitlement key and marketing card remain.
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

const BO_PACKAGE_IMPORT = /from\s+["'][^"']*packages\/back-office(?:\/[^"']*)?["']/;
const BO_DYNAMIC_IMPORT = /import\(\s*["'][^"']*packages\/back-office(?:\/[^"']*)?["']\s*\)/;
const BO_ROUTE = /createFileRoute\(\s*["']\/restaurant\/back-office/;

describe("PRODUCT-RETIRE-07 Back Office surface", () => {
  it("Test A — no /restaurant/back-office route remains", () => {
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/back-office")), false);
    const production = walk(srcRoot).filter(isProductionSource);
    for (const file of production) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, BO_ROUTE, relative(srcRoot, file));
    }
    const tree = readFileSync(join(srcRoot, "routeTree.gen.ts"), "utf8");
    assert.doesNotMatch(tree, /['"]\/restaurant\/back-office/);
    assert.doesNotMatch(tree, /routes\/restaurant\/back-office/);
  });

  it("Test B — no production import from src/packages/back-office", () => {
    assert.equal(existsSync(join(srcRoot, "packages/back-office")), false);
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => {
      const src = readFileSync(file, "utf8");
      return BO_PACKAGE_IMPORT.test(src) || BO_DYNAMIC_IMPORT.test(src);
    });
    assert.deepEqual(
      hits.map((file) => relative(srcRoot, file)),
      [],
    );
  });

  it("Test C — back_office is no longer an operational package key", () => {
    assert.equal((PACKAGE_KEYS as readonly string[]).includes("back_office"), false);
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    assert.equal("back_office" in resolvePackages([{ package_key: "back_office", enabled: true }]), false);
  });

  it("Test D — Platform Admin cannot enable Back Office", () => {
    const fns = readFileSync(join(here, "package-entitlements.functions.ts"), "utf8");
    assert.match(fns, /z\.enum\(\["pms"\]\)/);
    assert.doesNotMatch(fns, /assertPackageMayBeEnabled/);
    const panel = readFileSync(join(srcRoot, "core/components/admin/package-entitlements-panel.tsx"), "utf8");
    assert.doesNotMatch(panel, /\{retired \? "Retired"/);
    assert.doesNotMatch(panel, /from ["']@\/packages\/back-office/);
  });

  it("Test E — marketing still advertises Back Office", () => {
    assert.equal(
      MARKETING_SEED.packages.some((pkg) => pkg.id === "back-office" && pkg.title === "Back Office Management"),
      true,
    );
    const site = MARKETING_SEED.site;
    assert.ok(site);
    assert.equal(
      site.products.some((product) => product.id === "back" && product.title === "Back Office"),
      true,
    );
    const cards = readFileSync(join(srcRoot, "core/components/noru-site/data/content.ts"), "utf8");
    assert.match(cards, /id:\s*"back"/);
    assert.match(cards, /title:\s*"Back Office"/);
    assert.doesNotMatch(cards, /isOperationalPackage/);
  });

  it("Test F — shared Inventory still exists", () => {
    assert.equal(existsSync(join(srcRoot, "components/inventory")), true);
    assert.equal(existsSync(join(srcRoot, "lib/inventory.functions.ts")), true);
    assert.equal(existsSync(join(srcRoot, "lib/inventory.server.ts")), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/inventory/index.tsx")), true);
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /inventory_items/);
    assert.match(types, /inventory_units/);
    assert.match(types, /inventory_stock_movements/);
  });

  it("Test G — shared Procurement still exists", () => {
    assert.equal(existsSync(join(srcRoot, "lib/purchasing.functions.ts")), true);
    assert.equal(existsSync(join(srcRoot, "lib/suppliers.functions.ts")), true);
    assert.equal(existsSync(join(srcRoot, "components/inventory/purchasing-tab.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "components/inventory/suppliers-tab.tsx")), true);
    assert.equal(
      existsSync(join(srcRoot, "routes/restaurant/inventory/purchasing/$purchaseOrderId.tsx")),
      true,
    );
    const po = readFileSync(
      join(srcRoot, "routes/restaurant/inventory/purchasing/$purchaseOrderId.tsx"),
      "utf8",
    );
    assert.match(po, /from ["']@\/components\/inventory\/purchase-order-page["']/);
    assert.doesNotMatch(po, /packages\/back-office/);
    const shell = readFileSync(join(srcRoot, "core/components/restaurant-shell.tsx"), "utf8");
    const procBlock = shell.slice(shell.indexOf("PROCUREMENT_NAV"), shell.indexOf("const STAFF_NAV"));
    assert.match(procBlock, /tab:\s*"suppliers"/);
    assert.match(procBlock, /tab:\s*"purchasing"/);
    assert.match(procBlock, /to:\s*"\/restaurant\/inventory"/);
    assert.doesNotMatch(procBlock, /\/restaurant\/back-office\/procurement/);
  });

  it("Test H — PMS Administration / Staff still exists", () => {
    assert.equal(existsSync(join(srcRoot, "core/lib/staff.functions.ts")), true);
    assert.equal(existsSync(join(srcRoot, "core/lib/workforce.functions.ts")), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/staff.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/pms/administration.tsx")), true);
    const staff = readFileSync(join(srcRoot, "core/components/workspaces/staff-workspace.tsx"), "utf8");
    assert.doesNotMatch(staff, /BackOfficeHrLink/);
    assert.doesNotMatch(staff, /packages\/back-office/);
    const admin = readFileSync(
      join(srcRoot, "packages/pms/components/workspaces/pms-administration-workspace.tsx"),
      "utf8",
    );
    assert.doesNotMatch(admin, /BackOfficeHrLink/);
    assert.doesNotMatch(admin, /packages\/back-office/);
  });

  it("Test I — PMS Cashiering remains intact", () => {
    assert.equal(existsSync(join(srcRoot, "packages/pms/lib/cashiering.functions.ts")), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/pms/cashiering.tsx")), true);
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /guest_folios/);
    assert.match(types, /folio_transactions/);
    assert.match(types, /hotel_cashier_shifts/);
    assert.match(types, /hotel_drawer_movements/);
    assert.match(types, /pms_payment_methods/);
    const cashiering = readFileSync(join(srcRoot, "packages/pms/lib/cashiering.functions.ts"), "utf8");
    assert.doesNotMatch(cashiering, /packages\/back-office/);
    assert.doesNotMatch(cashiering, /requireBackOfficeFinanceRead/);
    assert.doesNotMatch(cashiering, /getBackOfficeFinanceOverview/);
  });

  it("Test J — no database migration was created", () => {
    const drizzle = readdirSync(join(repoRoot, "drizzle/migrations"));
    const supabase = readdirSync(join(repoRoot, "supabase/migrations"));
    assert.equal(
      drizzle.some((name) => /retire-?07|back.?office.?drop|drop.?back_office/i.test(name)),
      false,
    );
    assert.equal(
      supabase.some((name) => /retire-?07|back.?office.?drop|drop.?back_office/i.test(name)),
      false,
    );
  });

  it("PMS-only still permits shared Inventory, Procurement, Staff, and Reports", () => {
    const has = (key: "pms") => key === "pms";
    const allowed = ["inventory", "procurement", "human_resources", "reports_analytics"];
    assert.equal(sharedCoreLinkVisible("inventory", allowed, has), true);
    assert.equal(sharedCoreLinkVisible("procurement", allowed, has), true);
    assert.equal(sharedCoreLinkVisible("human_resources", allowed, has), true);
    assert.equal(sharedCoreLinkVisible("reports_analytics", allowed, has), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/reports.tsx")), true);
  });
});
