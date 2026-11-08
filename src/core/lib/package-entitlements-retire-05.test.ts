/**
 * PRODUCT-RETIRE-05 — force runtime retirement of RMS, Standalone POS and
 * Back Office. PRODUCT-RETIRE-14G removed those keys from the operational registry.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PACKAGE_KEYS,
  packageCompatibilityDefault,
  packageFlags,
  resolvePackages,
  type PackageEntitlementRow,
} from "./package-entitlements.ts";
import {
  inventoryWritePackageAllowed,
  sharedCoreLinkVisible,
} from "./shared-core-access.ts";
import { MARKETING_SEED } from "./marketing/seed.ts";
import { createSeedMarketingSnapshot } from "./marketing/document.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../..");
const repoRoot = join(here, "../../..");

const past = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();

function row(enabled: boolean, expires_at?: string | null): PackageEntitlementRow {
  return { package_key: "pms", enabled, expires_at: expires_at ?? null };
}

describe("PRODUCT-RETIRE-05 operational policy", () => {
  it("Test 31 — operational registry is PMS-only", () => {
    assert.deepEqual([...PACKAGE_KEYS], ["pms"]);
    const resolver = readFileSync(join(here, "package-entitlements.ts"), "utf8");
    assert.doesNotMatch(resolver, /export function isOperationalPackage/);
    assert.doesNotMatch(resolver, /source: "retired"/);
  });
});

describe("PRODUCT-RETIRE-05 explicit historical entitlements", () => {
  it("Test 26 — PMS missing-row, explicit, disabled and expiry semantics stay", () => {
    const missing = resolvePackages([]);
    assert.equal(missing.pms.enabled, true);
    assert.equal(missing.pms.source, "default_compatibility");
    assert.equal(packageCompatibilityDefault("pms"), true);

    const on = resolvePackages([row(true)]);
    assert.equal(on.pms.enabled, true);
    assert.equal(on.pms.source, "explicit");

    const off = resolvePackages([row(false)]);
    assert.equal(off.pms.enabled, false);
    assert.equal(off.pms.source, "explicit");

    const expired = resolvePackages([row(true, past)]);
    assert.equal(expired.pms.enabled, false);
    assert.equal(expired.pms.source, "explicit");

    const live = resolvePackages([row(true, future)]);
    assert.equal(live.pms.enabled, true);
  });

  it("leftover retired-package rows are ignored", () => {
    const states = resolvePackages([
      { package_key: "restaurant_management", enabled: true },
      { package_key: "pos", enabled: true },
      { package_key: "back_office", enabled: true },
      row(true),
    ]);
    assert.deepEqual(Object.keys(states), ["pms"]);
    assert.equal(states.pms.enabled, true);
  });
});

describe("PRODUCT-RETIRE-05 server guards", () => {
  it("PMS package guard remains the operational gate", () => {
    const pms = readFileSync(join(srcRoot, "packages/pms/lib/pms-package.server.ts"), "utf8");
    const publicPkg = readFileSync(join(here, "public-package.server.ts"), "utf8");
    const routeGuard = readFileSync(join(here, "route-package-guard.ts"), "utf8");
    const fns = readFileSync(join(here, "package-entitlements.functions.ts"), "utf8");

    assert.match(pms, /requirePmsPackage/);
    assert.match(pms, /publicPackageAvailable\(restaurantId, "pms"\)/);
    assert.match(publicPkg, /propertyHasPackage/);
    assert.match(routeGuard, /getMyRoutePackageAccess/);
    assert.match(fns, /propertyHasPackage\(ctx\.supabase, restaurantId, data\.packageKey\)/);
    assert.equal(
      existsSync(join(srcRoot, "packages/restaurant-management/lib/restaurant-package.server.ts")),
      false,
    );
  });
});

describe("PRODUCT-RETIRE-05 Platform Admin", () => {
  it("Test 28 — Platform Admin manages PMS only", () => {
    const panel = readFileSync(join(srcRoot, "core/components/admin/package-entitlements-panel.tsx"), "utf8");
    assert.match(panel, /PMS is the operational product/);
    assert.doesNotMatch(panel, /isOperationalPackage/);
    assert.doesNotMatch(panel, /\{retired \? "Retired"/);
    const fns = readFileSync(join(here, "package-entitlements.functions.ts"), "utf8");
    assert.match(fns, /z\.enum\(\["pms"\]\)/);
    assert.doesNotMatch(fns, /assertPackageMayBeEnabled/);
  });
});

describe("PRODUCT-RETIRE-05 Property Home and tenant navigation", () => {
  it("hides RMS / POS / Back Office launch tiles", () => {
    const home = readFileSync(join(srcRoot, "routes/restaurant/home.tsx"), "utf8");
    assert.match(home, /packages\.has\("pms"\)/);
    assert.doesNotMatch(home, /to="\/restaurant\/restaurant-management"/);
    assert.doesNotMatch(home, /to="\/restaurant\/pos"/);
    assert.doesNotMatch(home, /to="\/restaurant\/back-office"/);
    assert.match(home, /retired/);
    assert.match(home, /This product is retired and is no longer available/);
  });

  it("shell product navigation is gated on PMS", () => {
    const shell = readFileSync(join(srcRoot, "core/components/restaurant-shell.tsx"), "utf8");
    assert.match(shell, /packages\.has\("pms"\)/);
    assert.doesNotMatch(shell, /Standalone POS Home/);
    assert.doesNotMatch(shell, /Back Office Home/);
    assert.doesNotMatch(shell, /packages\/back-office/);
    assert.match(shell, /item\.to\.startsWith\("\/restaurant\/restaurant-management"\)/);
    assert.doesNotMatch(shell, /rmMod && rmPackage/);
    assert.doesNotMatch(shell, /Restaurant Management Home/);
  });
});

describe("PRODUCT-RETIRE-05 marketing independence", () => {
  it("Test 29 — public product cards still advertise all four packages", () => {
    assert.deepEqual(
      MARKETING_SEED.packages.map((pkg) => pkg.id),
      ["restaurant-management", "pms", "standalone-pos", "back-office"],
    );
    assert.deepEqual(
      MARKETING_SEED.packages.map((pkg) => pkg.title),
      ["Restaurant Management", "PMS", "Standalone POS", "Back Office Management"],
    );
    const site = MARKETING_SEED.site;
    assert.ok(site);
    assert.deepEqual(
      site.products.map((product) => product.id),
      ["pms", "rms", "pos", "back"],
    );
    assert.deepEqual(
      site.products.map((product) => product.title),
      ["PMS", "RMS", "Standalone POS", "Back Office"],
    );

    const cards = readFileSync(join(srcRoot, "core/components/noru-site/data/content.ts"), "utf8");
    assert.match(cards, /id:\s*"pms"/);
    assert.match(cards, /id:\s*"rms"/);
    assert.match(cards, /id:\s*"pos"/);
    assert.match(cards, /id:\s*"back"/);
    assert.doesNotMatch(cards, /isOperationalPackage/);
    assert.doesNotMatch(cards, /restaurant_package_entitlements/);

    const published = JSON.stringify(createSeedMarketingSnapshot().published);
    assert.equal(published.includes("isOperationalPackage"), false);
    assert.equal(published.includes("restaurant_package_entitlements"), false);
  });
});

describe("PRODUCT-RETIRE-05 shared Core", () => {
  it("Test 30 — Inventory / Procurement / Staff remain visible with PMS only", () => {
    const pmsOnly = packageFlags(resolvePackages([row(true)]));
    assert.deepEqual(pmsOnly, { pms: true });
    const has = (key: "pms") => pmsOnly[key];
    const allowed = ["inventory", "procurement", "human_resources", "reports_analytics"];
    assert.equal(sharedCoreLinkVisible("inventory", allowed, has), true);
    assert.equal(sharedCoreLinkVisible("procurement", allowed, has), true);
    assert.equal(sharedCoreLinkVisible("human_resources", allowed, has), true);
    assert.equal(sharedCoreLinkVisible("reports_analytics", allowed, has), true);
    assert.equal(inventoryWritePackageAllowed(pmsOnly), true);

    const home = readFileSync(join(srcRoot, "routes/restaurant/home.tsx"), "utf8");
    assert.match(home, /sharedCoreLinkVisible/);
    assert.match(home, /SHARED_CORE_LINKS/);
  });
});

describe("PRODUCT-RETIRE-05 remaining surfaces stay in place", () => {
  it("does not delete staff auth; retired room-charge RPCs and tax columns stay out of generated types", () => {
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/login.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/admin/login.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "integrations/cross-package/room-charge.functions.ts")), false);

    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.doesNotMatch(types, /post_order_room_charge/);
    assert.doesNotMatch(types, /reverse_order_room_charge/);
    assert.doesNotMatch(types, /tax_inclusive/);
    assert.doesNotMatch(types, /tax_rate/);
    const coreColumns = readFileSync(join(srcRoot, "packages/pms/lib/pms-set1-foundation.functions.ts"), "utf8");
    assert.doesNotMatch(coreColumns, /tax_inclusive, tax_rate, service_enabled, service_rate/);
  });

  it("does not delete product source trees or add a 05 migration", () => {
    assert.equal(existsSync(join(srcRoot, "packages/pms")), true);

    const drizzle = readdirSync(join(repoRoot, "drizzle/migrations"));
    const supabase = readdirSync(join(repoRoot, "supabase/migrations"));
    assert.equal(
      drizzle.some((name) => /retire-?05|runtime.?retir/i.test(name)),
      false,
    );
    assert.equal(
      supabase.some((name) => /retire-?05|runtime.?retir/i.test(name)),
      false,
    );
  });
});
