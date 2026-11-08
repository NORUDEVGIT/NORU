/**
 * PRODUCT-RETIRE-11 — live RMS → PMS room-charge posting is gone.
 * Historical folio `restaurant_order` references, DB RPCs, receipts in storage,
 * tax compatibility, and PMS-owned cashiering remain. No migration.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
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

const REMAINING_RMS_PRODUCTION = new Set<string>([]);

const RPC_POST = /\.rpc\(\s*["']post_order_room_charge["']/;
const RPC_REVERSE = /\.rpc\(\s*["']reverse_order_room_charge["']/;
const RPC_FREEZE = /\.rpc\(\s*["']freeze_order_receipt["']/;
const WRITE_ROOM_CHARGE_COL =
  /room_charge_(?:folio_id|posted_at|posted_by_membership_id|reservation_id)\s*:/;

describe("PRODUCT-RETIRE-11 RMS room-charge runtime bridge", () => {
  it("Test A — 0 live application callers create RMS-origin room charges", () => {
    assert.equal(existsSync(join(srcRoot, "integrations/cross-package/room-charge.functions.ts")), false);
    assert.equal(existsSync(join(srcRoot, "integrations/cross-package/room-charge.server.ts")), false);
    const production = walk(srcRoot).filter(isProductionSource);
    const postHits = production.filter((file) => RPC_POST.test(readFileSync(file, "utf8")));
    assert.deepEqual(postHits.map((file) => relative(srcRoot, file)), []);
    const reverseHits = production.filter((file) => RPC_REVERSE.test(readFileSync(file, "utf8")));
    assert.deepEqual(reverseHits.map((file) => relative(srcRoot, file)), []);
    const freezeHits = production.filter((file) => RPC_FREEZE.test(readFileSync(file, "utf8")));
    assert.deepEqual(freezeHits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test B — no new application writes to orders.room_charge_*", () => {
    const production = walk(srcRoot).filter(isProductionSource);
    const hits = production.filter((file) => WRITE_ROOM_CHARGE_COL.test(readFileSync(file, "utf8")));
    assert.deepEqual(hits.map((file) => relative(srcRoot, file)), []);
  });

  it("Test C — historical restaurant_order folio display remains in PMS Cashiering", () => {
    const sheet = readFileSync(
      join(srcRoot, "packages/pms/components/cashiering/charge-details-sheet.tsx"),
      "utf8",
    );
    assert.match(sheet, /referenceType === "restaurant_order"/);
    assert.match(sheet, /return row\.description/);
    assert.match(sheet, /return "POS"/);
    assert.doesNotMatch(sheet, /postOrderRoomCharge|post_order_room_charge/);
    assert.doesNotMatch(sheet, /rm-receipts|room-charge\.functions/);
    const cashiering = readFileSync(join(srcRoot, "packages/pms/lib/cashiering.functions.ts"), "utf8");
    assert.match(cashiering, /reference_type/);
    assert.match(cashiering, /post_folio_manual_charge/);
    assert.match(cashiering, /post_folio_service_charge/);
    assert.doesNotMatch(cashiering, /post_order_room_charge/);
    assert.doesNotMatch(cashiering, /packages\/restaurant-management/);
  });

  it("Test D — PMS cashiering remains independent of RMS", () => {
    const pms = walk(join(srcRoot, "packages/pms")).filter(isProductionSource);
    const rmsHits = pms.filter((file) => {
      const src = readFileSync(file, "utf8");
      return /packages\/restaurant-management/.test(src) || /post_order_room_charge/.test(src);
    });
    assert.deepEqual(rmsHits.map((file) => relative(srcRoot, file)), []);
    assert.equal(existsSync(join(srcRoot, "packages/pms/lib/cashiering.functions.ts")), true);
    assert.equal(existsSync(join(srcRoot, "routes/restaurant/pms/cashiering.tsx")), true);
  });

  it("Test E — remaining RMS production is entitlement only", () => {
    const remaining = walk(join(srcRoot, "packages/restaurant-management"))
      .filter(isProductionSource)
      .map((file) => relative(join(srcRoot, "packages/restaurant-management"), file))
      .sort();
    assert.deepEqual(remaining, [...REMAINING_RMS_PRODUCTION].sort());
    assert.equal(
      existsSync(join(srcRoot, "packages/restaurant-management/lib/restaurant-package.server.ts")),
      false,
    );
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-receipts.ts")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-receipts.server.ts")), false);
  });

  it("Test F — entitlements, marketing, and historical RPCs remain", () => {
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.ts")), false);
    assert.equal(existsSync(join(srcRoot, "packages/restaurant-management/lib/rm-tax.server.ts")), false);
    const types = readFileSync(join(srcRoot, "integrations/supabase/types.ts"), "utf8");
    assert.doesNotMatch(types, /post_order_room_charge/);
    assert.doesNotMatch(types, /reverse_order_room_charge/);
    assert.doesNotMatch(types, /freeze_order_receipt/);
    assert.doesNotMatch(types, /room_charge_folio_id/);
    assert.equal(
      MARKETING_SEED.packages.some((pkg) => pkg.id === "restaurant-management"),
      true,
    );
  });

  it("Test G — no database migration was created", () => {
    const drizzle = readdirSync(join(repoRoot, "drizzle/migrations"));
    const supabase = readdirSync(join(repoRoot, "supabase/migrations"));
    assert.equal(
      drizzle.some((name) => /retire-?11|drop.?room_charge|drop.?post_order_room_charge/i.test(name)),
      false,
    );
    assert.equal(
      supabase.some((name) => /retire-?11|drop.?room_charge|drop.?post_order_room_charge/i.test(name)),
      false,
    );
  });
});
