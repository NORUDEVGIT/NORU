/**
 * PRODUCT-RETIRE-10 — consumer diner account/auth application surface is gone.
 * Staff auth, Platform Admin auth, PMS guest_profiles, room-charge, tax,
 * marketing product cards, and historical customer DB rows remain. No migration.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MARKETING_SEED } from "./marketing/seed.ts";
import { isAllowedMarketingHref } from "./marketing/allowlist.ts";

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

const CONSUMER_ROUTE_FILES = [
  "routes/login.tsx",
  "routes/register.tsx",
  "routes/forgot-password.tsx",
  "routes/reset-password.tsx",
];

describe("PRODUCT-RETIRE-10 consumer customer account surface", () => {
  it("Test A — consumer auth and /account routes no longer exist", () => {
    for (const file of CONSUMER_ROUTE_FILES) {
      assert.equal(existsSync(join(srcRoot, file)), false, file);
    }
    assert.equal(existsSync(join(srcRoot, "routes/account")), false);
    const tree = readFileSync(join(srcRoot, "routeTree.gen.ts"), "utf8");
    assert.doesNotMatch(tree, /['"]\/login['"]/);
    assert.doesNotMatch(tree, /['"]\/register['"]/);
    assert.doesNotMatch(tree, /['"]\/forgot-password['"]/);
    assert.doesNotMatch(tree, /['"]\/reset-password['"]/);
    assert.doesNotMatch(tree, /['"]\/account['"]/);
    assert.doesNotMatch(tree, /['"]\/account\//);
    assert.doesNotMatch(tree, /routes\/login['"]/);
    const production = walk(srcRoot).filter(isProductionSource);
    for (const file of production) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /createFileRoute\(\s*["']\/login["']\)/, relative(srcRoot, file));
      assert.doesNotMatch(src, /createFileRoute\(\s*["']\/register["']\)/, relative(srcRoot, file));
      assert.doesNotMatch(src, /createFileRoute\(\s*["']\/forgot-password["']\)/, relative(srcRoot, file));
      assert.doesNotMatch(src, /createFileRoute\(\s*["']\/reset-password["']\)/, relative(srcRoot, file));
      assert.doesNotMatch(src, /createFileRoute\(\s*["']\/account/, relative(srcRoot, file));
    }
  });

  it("Test B — no production customer-account creation path", () => {
    assert.equal(existsSync(join(srcRoot, "core/lib/customer.functions.ts")), false);
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => {
      const src = readFileSync(file, "utf8");
      return (
        /registerCustomer/.test(src) ||
        /account_type\s*[:=]\s*["']customer["']/.test(src) ||
        /\.eq\(\s*["']account_type["']\s*,\s*["']customer["']\s*\)/.test(src)
      );
    });
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test C — staff and platform-admin auth remain", () => {
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/login.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/register.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/set-password.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/forgot-password.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/reset-password.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/admin/login.tsx")), true);
    const tree = readFileSync(join(srcRoot, "routeTree.gen.ts"), "utf8");
    assert.match(tree, /['"]\/restaurant\/login['"]/);
    assert.match(tree, /['"]\/restaurant\/register['"]/);
    assert.match(tree, /['"]\/admin\/login['"]/);
  });

  it("Test D — Platform Admin diner Customers surface is gone", () => {
    assert.equal(existsSync(join(srcRoot, "routes/admin/customers.tsx")), false);
    const tree = readFileSync(join(srcRoot, "routeTree.gen.ts"), "utf8");
    assert.doesNotMatch(tree, /['"]\/admin\/customers['"]/);
    const shell = readFileSync(join(srcRoot, "core/components/admin-shell.tsx"), "utf8");
    assert.doesNotMatch(shell, /\/admin\/customers/);
    assert.doesNotMatch(shell, /label: "Customers"/);
    const adminFns = readFileSync(join(srcRoot, "core/lib/admin.functions.ts"), "utf8");
    assert.doesNotMatch(adminFns, /listCustomersAdmin/);
    assert.doesNotMatch(adminFns, /totalCustomers/);
    assert.doesNotMatch(adminFns, /totalOrders/);
    const dashboard = readFileSync(join(srcRoot, "routes/admin/index.tsx"), "utf8");
    assert.doesNotMatch(dashboard, /Total customers/);
    assert.doesNotMatch(dashboard, /Total orders/);
  });

  it("Test E — PMS guest_profiles remain and do not import consumer account code", () => {
    const guests = readFileSync(join(srcRoot, "packages/pms/lib/guests.functions.ts"), "utf8");
    assert.match(guests, /guest_profiles/);
    assert.doesNotMatch(guests, /registerCustomer/);
    assert.doesNotMatch(guests, /customer\.functions/);
    assert.equal(existsSync(join(srcRoot, "packages/pms/lib/product-retire-02-boundary.test.ts")), true);
    assert.equal(existsSync(join(srcRoot, "routes/stay/$propertySlug/index.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/stay/$propertySlug/book.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/stay/$propertySlug/manage.tsx")), true);
  });

  it("Test F — public Sign In targets tenant login, not deleted /login", () => {
    const signIn = MARKETING_SEED.nav.find((item) => item.protectedRole === "sign_in");
    assert.ok(signIn);
    assert.equal(signIn.href, "/restaurant/login");
    assert.equal(isAllowedMarketingHref("/login"), false);
    assert.equal(isAllowedMarketingHref("/register"), false);
    assert.equal(isAllowedMarketingHref("/account"), false);
    assert.equal(isAllowedMarketingHref("/restaurant/login"), true);
    assert.equal(
      MARKETING_SEED.nav.some((item) => item.href === "/account" || item.href === "/login"),
      false,
    );
    assert.equal(
      MARKETING_SEED.footer.linkGroups.some((group) =>
        group.links.some((link) => link.href === "/login" || link.href === "/register"),
      ),
      false,
    );
  });

  it("Test G — four marketing product cards remain", () => {
    assert.equal(
      MARKETING_SEED.packages.some((pkg) => pkg.id === "restaurant-management"),
      true,
    );
    const site = MARKETING_SEED.site;
    assert.ok(site);
    const cards = readFileSync(join(srcRoot, "core/components/noru-site/data/content.ts"), "utf8");
    assert.match(cards, /id:\s*"pms"/);
    assert.match(cards, /id:\s*"rms"/);
    assert.match(cards, /id:\s*"pos"/);
    assert.match(cards, /id:\s*"back"/);
  });

  it("Test H — remaining RMS production files are entitlement only", () => {
    assert.equal(existsSync(join(srcRoot, "core/components/customer-site-header.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "core/lib/customer-order-status.ts")), false);
    const remaining = walk(join(srcRoot, "packages/restaurant-management"))
      .filter(isProductionSource)
      .map((file) => relative(join(srcRoot, "packages/restaurant-management"), file))
      .sort();
    assert.deepEqual(remaining, [...REMAINING_RMS_PRODUCTION].sort());
  });

  it("Test I — historical room-charge RPCs and tax remain", () => {
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.doesNotMatch(types, /post_order_room_charge/);
    assert.doesNotMatch(types, /reverse_order_room_charge/);
    assert.doesNotMatch(types, /linked_customer_user_id/);
    assert.match(types, /guest_profiles/);
    assert.equal(existsSync(join(srcRoot, "integrations/cross-package/room-charge.functions.ts")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.ts")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.server.ts")), false);
  });

  it("Test J — no database migration was created", () => {
    const drizzle = readdirSync(join(repoRoot, "drizzle/migrations"));
    const supabase = readdirSync(join(repoRoot, "supabase/migrations"));
    assert.equal(
      drizzle.some((name) => /retire-?10|drop.?customer|drop.?account_type/i.test(name)),
      false,
    );
    assert.equal(
      supabase.some((name) => /retire-?10|drop.?customer|drop.?account_type/i.test(name)),
      false,
    );
  });
});
