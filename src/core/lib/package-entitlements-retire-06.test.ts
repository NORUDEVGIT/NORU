/**
 * PRODUCT-RETIRE-06 — Standalone POS application surface is gone.
 * Historical `pos` entitlement key, marketing card, and `pos_*` schema remain.
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

const POS_TABLE_ACCESS =
  /\.from\(\s*["']pos_(settings|registers|categories|products|cashier_shifts|sale_counters|sales|sale_items|payments|refunds)["']/;
const POS_RPC = /\.rpc\(\s*["']pos_(complete_sale|refund_sale|refund_sale_allocated)["']/;
const POS_PACKAGE_IMPORT = /from\s+["'][^"']*packages\/standalone-pos(?:\/[^"']*)?["']/;
const POS_ROUTE = /createFileRoute\(\s*["']\/restaurant\/pos/;

describe("PRODUCT-RETIRE-06 Standalone POS surface", () => {
  it("Test A — no /restaurant/pos route remains", () => {
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/pos")), false);
    const production = walk(srcRoot).filter(isProductionSource);
    for (const file of production) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, POS_ROUTE, relative(srcRoot, file));
    }
    const tree = readFileSync(join(srcRoot, "routeTree.gen.ts"), "utf8");
    assert.doesNotMatch(tree, /['"]\/restaurant\/pos/);
    assert.doesNotMatch(tree, /routes\/restaurant\/pos/);
  });

  it("Test B — no production import from src/packages/standalone-pos", () => {
    assert.equal(existsSync(join(srcRoot, "packages/standalone-pos")), false);
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => POS_PACKAGE_IMPORT.test(readFileSync(file, "utf8")));
    assert.deepEqual(
      hits.map((file) => relative(srcRoot, file)),
      [],
    );
  });

  it("Test C — no production application code accesses pos_* tables", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => POS_TABLE_ACCESS.test(readFileSync(file, "utf8")));
    assert.deepEqual(
      hits.map((file) => relative(srcRoot, file)),
      [],
    );
  });

  it("Test D — no production code calls POS RPCs", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => POS_RPC.test(readFileSync(file, "utf8")));
    assert.deepEqual(
      hits.map((file) => relative(srcRoot, file)),
      [],
    );
  });

  it("Test E — pos is no longer an operational package key", () => {
    assert.equal((PACKAGE_KEYS as readonly string[]).includes("pos"), false);
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    assert.equal("pos" in resolvePackages([{ package_key: "pos", enabled: true }]), false);
  });

  it("Test F — Platform Admin cannot enable POS", () => {
    const fns = readFileSync(join(here, "package-entitlements.functions.ts"), "utf8");
    assert.match(fns, /z\.enum\(\["pms"\]\)/);
    assert.doesNotMatch(fns, /assertPackageMayBeEnabled/);
    const panel = readFileSync(join(srcRoot, "core/components/admin/package-entitlements-panel.tsx"), "utf8");
    assert.doesNotMatch(panel, /\{retired \? "Retired"/);
    assert.doesNotMatch(panel, /from ["']@\/packages\/standalone-pos/);
  });

  it("Test G — marketing still advertises Standalone POS", () => {
    assert.equal(
      MARKETING_SEED.packages.some((pkg) => pkg.id === "standalone-pos" && pkg.title === "Standalone POS"),
      true,
    );
    const site = MARKETING_SEED.site;
    assert.ok(site);
    assert.equal(
      site.products.some((product) => product.id === "pos" && product.title === "Standalone POS"),
      true,
    );
    const cards = readFileSync(join(srcRoot, "core/components/noru-site/data/content.ts"), "utf8");
    assert.match(cards, /id:\s*"pos"/);
    assert.match(cards, /title:\s*"Standalone POS"/);
    assert.doesNotMatch(cards, /isOperationalPackage/);
  });

  it("Test H — PMS Cashiering remains present", () => {
    assert.equal(existsSync(join(srcRoot, "packages/pms/lib/cashiering.functions.ts")), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/pms/cashiering.tsx")), true);
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /guest_folios/);
    assert.match(types, /folio_transactions/);
    assert.match(types, /hotel_cashier_shifts/);
    assert.match(types, /hotel_drawer_movements/);
    assert.match(types, /pms_payment_methods/);
    const cashiering = readFileSync(join(srcRoot, "packages/pms/lib/cashiering.functions.ts"), "utf8");
    assert.doesNotMatch(cashiering, POS_TABLE_ACCESS);
    assert.doesNotMatch(cashiering, POS_RPC);
  });

  it("Test I — shared Core inventory/procurement/staff are unaffected", () => {
    const has = (key: "pms") => key === "pms";
    const allowed = ["inventory", "procurement", "human_resources"];
    assert.equal(sharedCoreLinkVisible("inventory", allowed, has), true);
    assert.equal(sharedCoreLinkVisible("procurement", allowed, has), true);
    assert.equal(sharedCoreLinkVisible("human_resources", allowed, has), true);
    const home = readFileSync(join(srcRoot, "routes/restaurant/home.tsx"), "utf8");
    assert.match(home, /SHARED_CORE_LINKS/);
    assert.match(home, /to: "\/restaurant\/inventory"/);
    assert.match(home, /to: "\/restaurant\/staff"/);
  });

  it("Test J — no database migration was created", () => {
    const drizzle = readdirSync(join(repoRoot, "drizzle/migrations"));
    const supabase = readdirSync(join(repoRoot, "supabase/migrations"));
    assert.equal(
      drizzle.some((name) => /retire-?06|standalone.?pos.?drop|drop.?pos_/i.test(name)),
      false,
    );
    assert.equal(
      supabase.some((name) => /retire-?06|standalone.?pos.?drop|drop.?pos_/i.test(name)),
      false,
    );
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.doesNotMatch(types, /pos_settings/);
    assert.doesNotMatch(types, /pos_complete_sale/);
  });
});
