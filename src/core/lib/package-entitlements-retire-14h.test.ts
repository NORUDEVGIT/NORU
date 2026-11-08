/**
 * PRODUCT-RETIRE-14H — drop leftover RMS/customer schema columns.
 * PMS tax, cashiering, guest profiles, and 14C snapshot columns stay.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { STAFF_ROLES } from "./module-access.ts";
import { MARKETING_SEED } from "./marketing/seed.ts";
import { currentNoruSiteContent } from "./marketing/noru-site-defaults.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../..");
const repoRoot = join(here, "../../..");
const MIGRATION = "0202_product_retire_14h_legacy_column_cleanup.sql";
const drizzlePath = join(repoRoot, "drizzle/migrations", MIGRATION);
const supabasePath = join(repoRoot, "supabase/migrations", MIGRATION);
const HASH = "a35ed682efc5c0814348ee43a1bff267bccf96552ecdd494ef1bca55e9260ec1";

const DROPPED = [
  "restaurants.tax_rate",
  "restaurants.tax_inclusive",
  "restaurants.service_enabled",
  "restaurants.service_rate",
  "restaurants.tax_name",
  "guest_profiles.linked_customer_user_id",
  "folio_history.cashier_shift_id",
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

function publicTable(types: string, name: string): string {
  const start = types.indexOf(`      ${name}: {`);
  assert.ok(start >= 0, name);
  const prefix = `      ${name}: {`;
  const rest = types.slice(start + prefix.length);
  const next = rest.search(/\n      [a-z0-9_]+: \{/i);
  assert.ok(next >= 0, `next table after ${name}`);
  return types.slice(start, start + prefix.length + next);
}

describe("PRODUCT-RETIRE-14H legacy column cleanup", () => {
  it("Test A — dual-lane 0202 SQL is byte-identical", () => {
    const { drizzleSql, supabaseSql } = readMigration();
    const drizzleHash = createHash("sha256").update(drizzleSql).digest("hex");
    const supabaseHash = createHash("sha256").update(supabaseSql).digest("hex");
    assert.equal(drizzleHash, supabaseHash);
    assert.equal(drizzleHash, HASH);
    assert.match(drizzleSql, /PRODUCT-RETIRE-14H/);
  });

  it("Test B — schema cleanup only: no DELETE, TRUNCATE, or CASCADE", () => {
    const { body } = readMigration();
    assert.doesNotMatch(body, /\bDELETE\b/i);
    assert.doesNotMatch(body, /\bTRUNCATE\b/i);
    assert.doesNotMatch(body, /\bCASCADE\b/i);
    assert.doesNotMatch(body, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(body, /\bDROP\s+FUNCTION\b/i);
  });

  it("Test C — only the seven allowed columns are dropped", () => {
    const { body } = readMigration();
    const drops = [...body.matchAll(/ALTER TABLE public\.(\w+)\s+DROP COLUMN (\w+)/g)].map(
      (m) => `${m[1]}.${m[2]}`,
    );
    assert.deepEqual(drops, [...DROPPED]);
  });

  it("Test D — PMS tax owners are not altered", () => {
    const { body } = readMigration();
    assert.doesNotMatch(body, /pms_taxes/);
    assert.doesNotMatch(body, /pms_service_charges/);
    assert.doesNotMatch(body, /pms_fees/);
    assert.match(body, /default_room_tax_group_id/);
    assert.doesNotMatch(body, /DROP COLUMN default_room_tax_group_id/);
  });

  it("Test E — PMS cashiering owners are not altered", () => {
    const { body } = readMigration();
    assert.doesNotMatch(body, /hotel_cashier_shifts/);
    assert.doesNotMatch(body, /open_hotel_cashier_shift/);
    assert.doesNotMatch(body, /close_hotel_cashier_shift/);
    assert.match(body, /hotel_cashier_shift_id/);
    assert.doesNotMatch(body, /DROP COLUMN hotel_cashier_shift_id/);
  });

  it("Test F — folio_history snapshot columns are preserved", () => {
    const { sql, body } = readMigration();
    assert.match(sql, /legacy_cashier_shift_id/);
    assert.doesNotMatch(body, /DROP COLUMN legacy_cashier_shift_id/);
    assert.doesNotMatch(body, /DROP COLUMN legacy_cashier_shift_status/);
    assert.doesNotMatch(body, /DROP COLUMN legacy_cashier_shift_opened_at/);
    assert.doesNotMatch(body, /DROP COLUMN legacy_cashier_shift_closed_at/);
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    const history = publicTable(types, "folio_history");
    assert.match(history, /legacy_cashier_shift_id:/);
    assert.match(history, /legacy_cashier_shift_status:/);
    assert.match(history, /legacy_cashier_shift_opened_at:/);
    assert.match(history, /legacy_cashier_shift_closed_at:/);
    assert.doesNotMatch(history, /(?<!legacy_)cashier_shift_id:/);
  });

  it("Test G — guest_profiles remains; only the consumer link field is removed", () => {
    const { body } = readMigration();
    assert.doesNotMatch(body, /DROP TABLE/);
    assert.match(body, /ALTER TABLE public\.guest_profiles\s+DROP COLUMN linked_customer_user_id/);
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /guest_profiles: \{/);
    assert.doesNotMatch(types, /linked_customer_user_id/);
    const restaurants = publicTable(types, "restaurants");
    assert.match(restaurants, /default_room_tax_group_id:/);
    assert.doesNotMatch(restaurants, /tax_rate:/);
    assert.doesNotMatch(restaurants, /tax_inclusive:/);
    assert.doesNotMatch(restaurants, /service_enabled:/);
    assert.doesNotMatch(restaurants, /service_rate:/);
    assert.doesNotMatch(restaurants, /tax_name:/);
    assert.match(types, /pms_taxes: \{/);
    assert.match(types, /pms_service_charges: \{/);
    assert.match(types, /pms_fees: \{/);
  });

  it("Test H — production source has no leftover legacy-column refs", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const linked = production.filter((file) => /linked_customer_user_id/.test(readFileSync(file, "utf8")));
    assert.deepEqual(
      linked.map((file) => relative(srcRoot, file)),
      [],
    );
    const folioWrites = production.filter((file) => {
      const text = readFileSync(file, "utf8");
      if (!text.includes("folio_history")) return false;
      if (!text.includes("cashier_shift_id")) return false;
      return /\.from\(\s*["']folio_history["']\s*\)[\s\S]{0,400}cashier_shift_id/.test(text);
    });
    assert.deepEqual(
      folioWrites.map((file) => relative(srcRoot, file)),
      [],
    );
    const restaurantTax = production.filter((file) => {
      const text = readFileSync(file, "utf8");
      return /from\(\s*["']restaurants["']\s*\)[\s\S]{0,400}\b(tax_rate|tax_inclusive|service_enabled|service_rate|tax_name)\b/.test(
        text,
      );
    });
    assert.deepEqual(
      restaurantTax.map((file) => relative(srcRoot, file)),
      [],
    );
  });

  it("Test I — kitchen and waiter roles are untouched", () => {
    const { body } = readMigration();
    assert.doesNotMatch(body, /restaurant_users/);
    assert.ok((STAFF_ROLES as readonly string[]).includes("kitchen"));
    assert.ok((STAFF_ROLES as readonly string[]).includes("waiter"));
  });

  it("Test J — marketing still contains all four advertised products", () => {
    const ids = MARKETING_SEED.packages.map((pkg) => pkg.id).sort();
    assert.deepEqual(ids, ["back-office", "pms", "restaurant-management", "standalone-pos"]);
    const site = currentNoruSiteContent();
    assert.deepEqual(site.products.map((product) => product.id).sort(), ["back", "pms", "pos", "rms"]);
  });
});
