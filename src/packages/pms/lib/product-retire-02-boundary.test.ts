import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pmsRoot = join(here, "..");
const routesRoot = join(here, "../../../routes/restaurant/pms");

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

const productionFiles = walk(pmsRoot).filter(isProductionSource);
const productionSources = productionFiles.map((file) => ({
  file,
  rel: relative(pmsRoot, file),
  src: readFileSync(file, "utf8"),
}));

const PMS_OWNED_ROUTES: Array<[string, string]> = [
  ["index.tsx", "/restaurant/pms/"],
  ["front-office.tsx", "/restaurant/pms/front-office"],
  ["reservations.index.tsx", "/restaurant/pms/reservations"],
  ["guests.index.tsx", "/restaurant/pms/guests"],
  ["room-inventory.tsx", "/restaurant/pms/room-inventory"],
  ["housekeeping.tsx", "/restaurant/pms/housekeeping"],
  ["cashiering.tsx", "/restaurant/pms/cashiering"],
  ["rates-revenue.tsx", "/restaurant/pms/rates-revenue"],
  ["night-audit.tsx", "/restaurant/pms/night-audit"],
  ["reports.tsx", "/restaurant/pms/reports"],
];

const FOREIGN_PACKAGE = /requireRoutePackage\("(restaurant_management|back_office|pos)"\)/;
const RMS_IMPORT = /from\s+["'][^"']*packages\/restaurant-management(?:\/[^"']*)?["']/;
const RMS_DYNAMIC_IMPORT =
  /import\(\s*["'][^"']*packages\/restaurant-management(?:\/[^"']*)?["']\s*\)/;
const RMS_CASHIER_TABLE = /\.from\(\s*["']cashier_shifts["']\s*\)/;
const CONSUMER_CUSTOMER =
  /registerCustomer|customer\.functions|account_type\s*[:=]\s*["']customer["']/;

describe("PRODUCT-RETIRE-02 PMS-only boundary", () => {
  it("A. canonical PMS routes require the pms package only", () => {
    for (const [file] of PMS_OWNED_ROUTES) {
      const source = readFileSync(join(routesRoot, file), "utf8");
      assert.match(source, /requireRoutePackage\("pms"\)/, file);
      assert.doesNotMatch(source, FOREIGN_PACKAGE, file);
    }
  });

  it("B. production PMS package code does not import RMS package code", () => {
    const hits = productionSources.filter(
      ({ src }) => RMS_IMPORT.test(src) || RMS_DYNAMIC_IMPORT.test(src),
    );
    assert.deepEqual(
      hits.map(({ rel }) => rel),
      [],
      "PMS production files must not import packages/restaurant-management",
    );
  });

  it("C. PMS cashiering does not query RMS cashier_shifts", () => {
    const cashiering = productionSources.filter(
      ({ rel }) =>
        /(?:^|\/)cashiering[^/]*\.(ts|tsx)$/.test(rel) || rel.startsWith("components/cashiering/"),
    );
    assert.ok(cashiering.length > 0, "expected cashiering production files");
    for (const { rel, src } of cashiering) {
      assert.doesNotMatch(src, RMS_CASHIER_TABLE, rel);
      assert.doesNotMatch(src, /export const getShiftSummary/, rel);
    }
    const functions = readFileSync(join(here, "cashiering.functions.ts"), "utf8");
    assert.match(functions, /list_hotel_drawers/);
    assert.match(functions, /hotel_cashier_shift_id|listCashierShifts/);
  });

  it("D. hotel guest identity stays on guest_profiles, not consumer customers", () => {
    const guests = readFileSync(join(here, "guests.functions.ts"), "utf8");
    assert.match(guests, /\.from\("guest_profiles"\)/);
    assert.doesNotMatch(guests, CONSUMER_CUSTOMER);
    const guestHits = productionSources.filter(({ src }) => CONSUMER_CUSTOMER.test(src));
    assert.deepEqual(
      guestHits.map(({ rel }) => rel),
      [],
      "PMS production files must not use consumer customer accounts",
    );
  });

  it("removes the RMS F&B shortcut from PMS operational chrome", () => {
    const chrome = readFileSync(
      join(pmsRoot, "components/rooms/room-inventory-chrome.tsx"),
      "utf8",
    );
    assert.doesNotMatch(chrome, /restaurant-management\/dashboard/);
    assert.doesNotMatch(chrome, /label:\s*"F&B"/);
    const liveNav = readFileSync(join(here, "pms-module-nav.ts"), "utf8");
    assert.doesNotMatch(liveNav, /restaurant-management/);
  });
});
