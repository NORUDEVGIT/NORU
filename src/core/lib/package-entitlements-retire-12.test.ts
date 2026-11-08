/**
 * PRODUCT-RETIRE-12 — RMS tax compatibility is gone. PMS Taxes & Fees
 * (`pms_taxes`) is the sole operational tax owner. Legacy restaurant tax
 * columns remain in the database but are not read or written by application code.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MARKETING_SEED } from "./marketing/seed.ts";
import { PACKAGE_KEYS } from "./package-entitlements.ts";

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

const REMAINING_RMS_PRODUCTION = new Set<string>([]);
const LEGACY_TAX_COL = /\b(?:tax_inclusive|service_enabled|service_rate)\b|\btax_rate\b(?!_snapshot)/;
const LEGACY_TAX_WRITE = /tax_inclusive\s*:|tax_rate\s*:|service_enabled\s*:|service_rate\s*:/;
const RMS_TAX_IMPORT = /from\s+["'][^"']*rm-tax(?:\.server)?["']|import\(\s*["'][^"']*rm-tax/;

describe("PRODUCT-RETIRE-12 RMS tax compatibility", () => {
  it("Test A — RMS tax files are gone", () => {
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.ts")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.server.ts")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.test.ts")), false);
  });

  it("Test B — 0 production imports of rm-tax", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => RMS_TAX_IMPORT.test(readFileSync(file, "utf8")));
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test C — 0 operational production writes of restaurants tax columns", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => LEGACY_TAX_WRITE.test(readFileSync(file, "utf8")));
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test D — 0 operational production reads of restaurants tax columns", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => LEGACY_TAX_COL.test(readFileSync(file, "utf8")));
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test E — PMS tax owner is pms_taxes / Taxes & Fees", () => {
    const taxesFns = readFileSync(join(srcRoot, "packages/pms/lib/taxes-card3.functions.ts"), "utf8");
    assert.match(taxesFns, /from\("pms_taxes"\)/);
    assert.match(taxesFns, /from\("pms_service_charges"\)/);
    assert.doesNotMatch(taxesFns, /from\("restaurants"\)[\s\S]{0,160}tax_rate/);
    const cashiering = readFileSync(join(srcRoot, "packages/pms/lib/cashiering.functions.ts"), "utf8");
    assert.match(cashiering, /preview_folio_charge/);
    assert.match(cashiering, /post_folio_manual_charge/);
    assert.match(cashiering, /post_folio_service_charge/);
    assert.doesNotMatch(cashiering, /rm-tax|packages\/restaurant-management/);
    const stay = readFileSync(join(srcRoot, "packages/pms/lib/room-charge-guest-total.server.ts"), "utf8");
    assert.match(stay, /from\("pms_taxes"\)/);
    assert.doesNotMatch(stay, /\btax_rate\b/);
    const set1 = readFileSync(join(srcRoot, "packages/pms/lib/pms-set1-foundation.ts"), "utf8");
    assert.match(set1, /SET1_TAXES_OWNER_COPY/);
    assert.doesNotMatch(set1, /SET1_TAX_RM_SHARE/);
    assert.match(set1, /pms_taxes/);
  });

  it("Test F — remaining RMS production is entitlement wrapper only", () => {
    const remaining = walk(join(srcRoot, "packages/restaurant-management"))
      .filter(isProductionSource)
      .map((file) => relative(join(srcRoot, "packages/restaurant-management"), file))
      .sort();
    assert.deepEqual(remaining, [...REMAINING_RMS_PRODUCTION].sort());
  });

  it("Test G — entitlements and marketing are unchanged", () => {
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    assert.equal((PACKAGE_KEYS as readonly string[]).includes("restaurant_management"), false);
    assert.equal(
      MARKETING_SEED.packages.some((pkg) => pkg.id === "restaurant-management"),
      true,
    );
  });

  it("Test H — PMS tax owner remains after restaurant till columns were dropped", () => {
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /pms_taxes:/);
    assert.match(types, /default_room_tax_group_id/);
    assert.doesNotMatch(types, /^\s+service_enabled:/m);
    assert.doesNotMatch(types, /^\s+tax_name:/m);
  });

  it("Test I — no database migration was created", () => {
    const drizzle = readdirSync(join(repoRoot, "drizzle/migrations"));
    const supabase = readdirSync(join(repoRoot, "supabase/migrations"));
    assert.equal(
      drizzle.some((name) => /retire-?12|drop.?tax_rate|drop.?tax_inclusive/i.test(name)),
      false,
    );
    assert.equal(
      supabase.some((name) => /retire-?12|drop.?tax_rate|drop.?tax_inclusive/i.test(name)),
      false,
    );
  });
});
