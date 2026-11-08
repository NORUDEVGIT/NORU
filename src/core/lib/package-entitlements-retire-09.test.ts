/**
 * PRODUCT-RETIRE-09 — public QR / table-ordering application surface is gone.
 * Room-charge, tax, PMS fiscal QR, marketing RMS card, and historical schema
 * remain. Consumer accounts are retired by PRODUCT-RETIRE-10. No migration.
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

const QR_ROUTE_FILES = [
  "routes/scan.tsx",
  "routes/cart.tsx",
  "routes/confirmation.tsx",
  "routes/review.tsx",
  "routes/status.tsx",
  "routes/table.tsx",
];

const QR_SOURCE_FILES = [
  "packages/restaurant-management/components/bill-totals.tsx",
  "packages/restaurant-management/components/dietary-badges.tsx",
  "packages/restaurant-management/components/item-detail-dialog.tsx",
  "packages/restaurant-management/components/legacy-order-redirect.tsx",
  "packages/restaurant-management/components/menu-item-card.tsx",
  "packages/restaurant-management/components/menu-link.tsx",
  "packages/restaurant-management/components/order-lines.tsx",
  "packages/restaurant-management/components/quantity-stepper.tsx",
  "packages/restaurant-management/components/site-header.tsx",
  "packages/restaurant-management/components/table-context-bar.tsx",
  "packages/restaurant-management/lib/guest-order.server.ts",
  "packages/restaurant-management/lib/menu-images.server.ts",
  "packages/restaurant-management/lib/menu.functions.ts",
  "packages/restaurant-management/lib/order-core.server.ts",
  "packages/restaurant-management/lib/order-pricing.server.ts",
  "packages/restaurant-management/lib/order-status.ts",
  "packages/restaurant-management/lib/order-tracking.functions.ts",
  "packages/restaurant-management/lib/orders.functions.ts",
  "packages/restaurant-management/lib/public-restaurant.functions.ts",
  "packages/restaurant-management/lib/restaurant-table-qr.ts",
  "packages/restaurant-management/lib/tables.functions.ts",
  "packages/restaurant-management/state/order-store.tsx",
  "packages/restaurant-management/state/restaurant-context.tsx",
];

describe("PRODUCT-RETIRE-09 QR/public ordering surface", () => {
  it("Test A — /scan and /r/$restaurantSlug/** no longer exist in routes", () => {
    for (const file of QR_ROUTE_FILES) {
      assert.equal(existsSync(join(srcRoot, file)), false, file);
    }
    assert.equal(existsSync(join(srcRoot, "routes/r")), false);
    const tree = readFileSync(join(srcRoot, "routeTree.gen.ts"), "utf8");
    assert.doesNotMatch(tree, /['"]\/scan['"]/);
    assert.doesNotMatch(tree, /routes\/scan/);
    assert.doesNotMatch(tree, /['"]\/r\/\$restaurantSlug/);
    assert.doesNotMatch(tree, /routes\/r\/\$restaurantSlug/);
    const production = walk(srcRoot).filter(isProductionSource);
    for (const file of production) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /createFileRoute\(\s*["']\/scan["']\)/, relative(srcRoot, file));
      assert.doesNotMatch(
        src,
        /createFileRoute\(\s*["']\/r\/\$restaurantSlug/,
        relative(srcRoot, file),
      );
    }
  });

  it("Test B — no production customer_qr creation path or placeOrder", () => {
    for (const file of [
      "packages/restaurant-management/lib/orders.functions.ts",
      "packages/restaurant-management/lib/order-core.server.ts",
      "packages/restaurant-management/lib/guest-order.server.ts",
    ]) {
      assert.equal(existsSync(join(srcRoot, file)), false, file);
    }
    const production = walk(srcRoot).filter(isProductionSource);
    const placeOrderHits = production.filter((file) => {
      const src = readFileSync(file, "utf8");
      return /export const placeOrder\b/.test(src) || /createServerFn[\s\S]{0,200}placeOrder/.test(src);
    });
    assert.deepEqual(placeOrderHits.map((file) => relative(srcRoot, file)), []);
    const createHits = production.filter((file) => {
      const rel = relative(srcRoot, file);
      if (rel === "packages/restaurant-management/lib/rm-receipts.server.ts") return false;
      const src = readFileSync(file, "utf8");
      return /order_source\s*[:=]\s*["']customer_qr["']/.test(src);
    });
    assert.deepEqual(createHits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test C — 0 production application reads of restaurant_tables.qr_token", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => {
      const src = readFileSync(file, "utf8");
      return /\bqr_token\b/.test(src);
    });
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test D — OrderProvider is not mounted globally and has no production import", () => {
    assert.equal(
      existsSync(join(srcRoot, "packages/restaurant-management/state/order-store.tsx")),
      false,
    );
    const root = readFileSync(join(srcRoot, "routes/__root.tsx"), "utf8");
    assert.doesNotMatch(root, /OrderProvider/);
    assert.doesNotMatch(root, /order-store/);
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => /OrderProvider/.test(readFileSync(file, "utf8")));
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test E — consumer account is retired by PRODUCT-RETIRE-10", () => {
    assert.equal(existsSync(join(srcRoot, "routes/login.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/account")), false);
    assert.equal(existsSync(join(srcRoot, "core/lib/customer.functions.ts")), false);
    assert.equal(existsSync(join(srcRoot, "core/components/customer-site-header.tsx")), false);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/login.tsx")), true);
    assert.equal(existsSync(join(srcRoot, "routes/admin/login.tsx")), true);
  });

  it("Test F — room-charge RPCs are gone from generated types; live bridge is retired by 11", () => {
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.doesNotMatch(types, /post_order_room_charge/);
    assert.doesNotMatch(types, /reverse_order_room_charge/);
    assert.equal(existsSync(join(srcRoot, "integrations/cross-package/room-charge.functions.ts")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-receipts.ts")), false);
    assert.equal(
      existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-receipts.server.ts")),
      false,
    );
  });

  it("Test G — historical tax columns remain; RMS tax files are retired by 12", () => {
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.ts")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.server.ts")), false);
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /pms_taxes:/);
    assert.match(types, /pms_service_charges:/);
    assert.doesNotMatch(types, /^\s+service_enabled:/m);
    assert.doesNotMatch(types, /^\s+service_rate:/m);
  });

  it("Test H — PMS fiscal signed_qr remains and is not restaurant table QR", () => {
    const fiscal = readFileSync(
      join(srcRoot, "packages/pms/lib/fiscal/fiscal-sales-receipt.server.ts"),
      "utf8",
    );
    assert.match(fiscal, /signed_qr/);
    assert.doesNotMatch(fiscal, /qr-scanner/);
    assert.doesNotMatch(fiscal, /from ["']qrcode["']/);
    const guest = readFileSync(
      join(srcRoot, "packages/pms/lib/fiscal/fiscal-guest-invoice.server.ts"),
      "utf8",
    );
    assert.match(guest, /signed_qr/);
    const identity = readFileSync(
      join(srcRoot, "packages/pms/lib/identity-documents-card4.functions.ts"),
      "utf8",
    );
    assert.match(identity, /scan_image_allowed/);
  });

  it("Test I — public RMS marketing card remains and dead /scan nav is gone", () => {
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
    assert.equal(isAllowedMarketingHref("/scan"), false);
    assert.equal(
      MARKETING_SEED.nav.some((item) => item.href === "/scan"),
      false,
    );
    assert.equal(
      MARKETING_SEED.footer.linkGroups.some((group) =>
        group.links.some((link) => link.href === "/scan"),
      ),
      false,
    );
  });

  it("Test J — remaining RMS production files are customer-free QR-free leftovers", () => {
    for (const file of QR_SOURCE_FILES) {
      assert.equal(existsSync(join(srcRoot, file)), false, file);
    }
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/components")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/state")), false);
    const remaining = walk(join(srcRoot, "packages/restaurant-management"))
      .filter(isProductionSource)
      .map((file) => relative(join(srcRoot, "packages/restaurant-management"), file))
      .sort();
    assert.deepEqual(remaining, [...REMAINING_RMS_PRODUCTION].sort());
  });

  it("Test K — qr-scanner and qrcode are not production dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    assert.equal(pkg.dependencies?.["qr-scanner"], undefined);
    assert.equal(pkg.dependencies?.qrcode, undefined);
    assert.equal(pkg.devDependencies?.["@types/qrcode"], undefined);
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => {
      const src = readFileSync(file, "utf8");
      return /from ["']qr-scanner["']/.test(src) || /from ["']qrcode["']/.test(src);
    });
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test L — no database migration was created", () => {
    const drizzle = readdirSync(join(repoRoot, "drizzle/migrations"));
    const supabase = readdirSync(join(repoRoot, "supabase/migrations"));
    assert.equal(
      drizzle.some((name) => /retire-?09|qr.?drop|drop.?restaurant_tables|drop.?menu_/i.test(name)),
      false,
    );
    assert.equal(
      supabase.some((name) => /retire-?09|qr.?drop|drop.?restaurant_tables|drop.?menu_/i.test(name)),
      false,
    );
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.match(types, /qr_token/);
    assert.doesNotMatch(types, /menu_categories/);
    assert.match(types, /restaurant_tables/);
    assert.doesNotMatch(types, /guest_token_hash/);
  });
});
