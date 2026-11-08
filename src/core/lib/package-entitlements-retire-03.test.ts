/**
 * PRODUCT-RETIRE-03 — PMS-only missing-row compatibility.
 * PRODUCT-RETIRE-14G removed retired package keys from the operational registry.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PACKAGE_KEYS,
  packageCompatibilityDefault,
  packageFlags,
  resolvePackages,
  type PackageEntitlementRow,
} from "./package-entitlements.ts";

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
  return !/\.test\.ts$/.test(file);
}

function row(enabled: boolean, expires_at?: string | null): PackageEntitlementRow {
  return { package_key: "pms", enabled, expires_at: expires_at ?? null };
}

const past = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();

describe("PRODUCT-RETIRE-03 packageCompatibilityDefault", () => {
  it("Test 1 — missing PMS row stays compatibility-enabled", () => {
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    assert.equal(packageCompatibilityDefault("pms"), true);
    const states = resolvePackages([]);
    assert.equal(states.pms.enabled, true);
    assert.equal(states.pms.source, "default_compatibility");
    assert.equal(states.pms.expiresAt, null);
  });

  it("Test 5 — explicit disabled PMS is off", () => {
    const states = resolvePackages([row(false)]);
    assert.equal(states.pms.enabled, false);
    assert.equal(states.pms.source, "explicit");
    assert.deepEqual(packageFlags(states), { pms: false });
  });

  it("Test 7 — PMS expiry is honoured", () => {
    assert.equal(resolvePackages([row(true, past)]).pms.enabled, false);
    assert.equal(resolvePackages([row(true, future)]).pms.enabled, true);
  });

  it("Test 9 — Property Home has no retired product launchers", () => {
    const home = readFileSync(join(srcRoot, "routes/restaurant/home.tsx"), "utf8");
    assert.doesNotMatch(home, /to="\/restaurant\/restaurant-management"/);
    assert.doesNotMatch(home, /to="\/restaurant\/pos"/);
    assert.doesNotMatch(home, /to="\/restaurant\/back-office"/);
    assert.doesNotMatch(home, /packages\.has\([^)]+\)\s*\?\?\s*true/);
  });

  it("Test 12 — marketing publishing stays independent of entitlements", () => {
    const marketing = readFileSync(join(here, "marketing/document.test.ts"), "utf8");
    assert.match(marketing, /keeps four public marketing products without reading entitlements/);
    const seed = readFileSync(join(here, "marketing/seed.ts"), "utf8");
    assert.match(seed, /id:\s*"restaurant-management"/);
    assert.match(seed, /id:\s*"pms"/);
    assert.match(seed, /id:\s*"standalone-pos"/);
    assert.doesNotMatch(seed, /restaurant_package_entitlements/);
    assert.doesNotMatch(seed, /packageCompatibilityDefault/);
    const cards = readFileSync(join(srcRoot, "core/components/noru-site/data/content.ts"), "utf8");
    assert.match(cards, /id:\s*"pms"/);
    assert.match(cards, /id:\s*"rms"/);
    assert.match(cards, /id:\s*"pos"/);
    assert.match(cards, /id:\s*"back"/);
    assert.doesNotMatch(cards, /restaurant_package_entitlements/);
  });
});

describe("PRODUCT-RETIRE-03 clearing a row", () => {
  it("restores PMS when its explicit row is cleared", () => {
    const disabled = resolvePackages([row(false)]);
    assert.equal(disabled.pms.enabled, false);
    assert.equal(resolvePackages([]).pms.enabled, true);
  });
});

describe("PRODUCT-RETIRE-03 Platform Admin missing-row flag", () => {
  it("uses packageCompatibilityDefault for absent rows", () => {
    const fns = readFileSync(join(here, "package-entitlements.functions.ts"), "utf8");
    assert.match(fns, /packageCompatibilityDefault\(key\)/);
    assert.doesNotMatch(fns, /enabledFlag: row \? row\.enabled : true/);
  });
});

describe("PRODUCT-RETIRE-03 source lock", () => {
  it("owns missing-row compatibility in one helper", () => {
    const resolver = readFileSync(join(here, "package-entitlements.ts"), "utf8");
    assert.match(resolver, /export function packageCompatibilityDefault/);
    assert.match(resolver, /return packageKey === "pms"/);
    assert.match(resolver, /enabled: packageCompatibilityDefault\(key\)/);

    const production = walk(srcRoot).filter(isProductionSource);
    const definitions = production.filter((file) =>
      /export function packageCompatibilityDefault/.test(readFileSync(file, "utf8")),
    );
    assert.deepEqual(
      definitions.map((file) => relative(srcRoot, file)),
      ["core/lib/package-entitlements.ts"],
    );
  });

  it("keeps runtime entitlement reads behind the canonical resolver", () => {
    const allowed = new Set([
      "core/lib/package-entitlements.server.ts",
      "core/lib/package-entitlements.functions.ts",
      "integrations/supabase/types.ts",
    ]);
    const tableRead = /\.from\(\s*["']restaurant_package_entitlements["']\s*\)/;
    const hits = walk(srcRoot)
      .filter(isProductionSource)
      .filter((file) => tableRead.test(readFileSync(file, "utf8")))
      .map((file) => relative(srcRoot, file));
    for (const hit of hits) {
      assert.ok(allowed.has(hit), `unexpected entitlement table read: ${hit}`);
    }
  });

  it("rejects competing missing-row enable fallbacks in runtime access code", () => {
    const entitlementFiles = [
      join(here, "package-entitlements.ts"),
      join(here, "package-entitlements.server.ts"),
      join(here, "package-entitlements.functions.ts"),
      join(here, "public-package.server.ts"),
      join(here, "route-package-guard.ts"),
      join(here, "use-package-entitlements.ts"),
      join(srcRoot, "packages/pms/lib/pms-package.server.ts"),
    ];
    const forbidden = [
      /row\?\.enabled\s*\?\?\s*true/,
      /enabled\s*\?\?\s*true/,
      /row\s*\?\s*row\.enabled\s*:\s*true/,
      /!\s*row[\s\S]{0,80}enabled:\s*true/,
    ];
    for (const file of entitlementFiles) {
      const src = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        assert.doesNotMatch(src, pattern, relative(srcRoot, file));
      }
    }
  });

  it("new-tenant provisioning writes an explicit disabled PMS row", () => {
    const server = readFileSync(join(here, "package-entitlements.server.ts"), "utf8");
    assert.match(server, /provisionDisabledPackageEntitlements/);
    assert.match(server, /enabled:\s*false/);
    const register = readFileSync(join(here, "restaurant.functions.ts"), "utf8");
    assert.match(register, /provisionDisabledPackageEntitlements/);
  });

  it("does not add a database migration for this task", () => {
    const drizzle = readdirSync(join(repoRoot, "drizzle/migrations"));
    const supabase = readdirSync(join(repoRoot, "supabase/migrations"));
    assert.equal(
      drizzle.some((name) => /retire-?03|pms-only|package.?compat/i.test(name)),
      false,
    );
    assert.equal(
      supabase.some((name) => /retire-?03|pms-only|package.?compat/i.test(name)),
      false,
    );
  });
});
