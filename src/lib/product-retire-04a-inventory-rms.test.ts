/**
 * PRODUCT-RETIRE-04A — Shared Inventory must not reach RMS recipes.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isProductionSource(file: string): boolean {
  return !/\.test\.ts$/.test(file);
}

const RMS_IMPORT = /from\s+["']@\/packages\/restaurant-management(?:\/[^"']*)?["']/;
const RMS_DYNAMIC = /import\(\s*["']@\/packages\/restaurant-management(?:\/[^"']*)?["']\s*\)/;
const RECIPE_USAGE = /getIngredientUsage|recipes\.functions|Used in recipes/;

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

function sharedInventoryProduction(): string[] {
  return [
    ...SHARED_INVENTORY_DIRS.flatMap(walk),
    ...SHARED_INVENTORY_FILES,
  ].filter(isProductionSource);
}

describe("PRODUCT-RETIRE-04A Shared Inventory recipe UI", () => {
  it("removes Used in recipes from the shared item list", () => {
    const src = readFileSync(join(srcRoot, "components/inventory/item-list.tsx"), "utf8");
    assert.doesNotMatch(src, /Used in recipes/);
    assert.doesNotMatch(src, /"recipes"/);
    assert.match(src, /"history"/);
    assert.match(src, /"edit"/);
    assert.match(src, /Receive stock/);
    assert.match(src, /Record usage/);
    assert.match(src, /View history/);
  });

  it("keeps catalogue, movements, and procurement on the shared inventory page", () => {
    const src = readFileSync(
      join(srcRoot, "components/inventory/inventory-page.tsx"),
      "utf8",
    );
    assert.match(src, /listInventoryItems/);
    assert.match(src, /createInventoryMovement/);
    assert.match(src, /SuppliersTab/);
    assert.match(src, /PurchasingTab/);
    assert.match(src, /InventoryOverviewDashboard/);
    assert.doesNotMatch(src, RECIPE_USAGE);
  });
});

describe("PRODUCT-RETIRE-04A Shared Inventory → RMS boundary", () => {
  it("retained shared inventory production code does not import RMS recipe services", () => {
    const files = sharedInventoryProduction();
    assert.ok(files.length > 0, "expected shared inventory production files");
    const recipeHits = files.filter((file) => RECIPE_USAGE.test(readFileSync(file, "utf8")));
    assert.deepEqual(
      recipeHits.map((file) => relative(srcRoot, file)),
      [],
      "shared inventory must not call RMS recipes",
    );
  });

  it("retained shared inventory production code does not import RMS recipe modules", () => {
    const files = sharedInventoryProduction();
    const rmsRecipe = /packages\/restaurant-management\/(?:lib\/recipes|components\/.*recipe)/;
    const hits = files.filter((file) => {
      const src = readFileSync(file, "utf8");
      return rmsRecipe.test(src) || /getIngredientUsage/.test(src);
    });
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
  });

  it("fails if shared inventory item-list or lib inventory reintroduces RMS production imports for recipes", () => {
    const locked = [
      join(srcRoot, "components/inventory/item-list.tsx"),
      join(srcRoot, "lib/inventory.functions.ts"),
      join(srcRoot, "lib/inventory.server.ts"),
      join(srcRoot, "lib/inventory-package.server.ts"),
    ];
    for (const file of locked) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, RMS_IMPORT, relative(srcRoot, file));
      assert.doesNotMatch(src, RMS_DYNAMIC, relative(srcRoot, file));
    }
  });

  it("recipe table is gone from generated types while RMS staff recipe UI stays gone", () => {
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.doesNotMatch(types, /menu_item_recipe_components/);
    assert.equal(
      existsSync(join(srcRoot, "packages/restaurant-management/lib/recipes.functions.ts")),
      false,
    );
  });
});
