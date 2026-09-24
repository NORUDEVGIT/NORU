import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEGACY_REVENUE_TAB_MAP,
  REVENUE_DEFAULT_VIEW,
  REVENUE_UI_SCREEN_MAP,
  REVENUE_VIEW_DEFINITIONS,
  foundationRevenueViews,
  implementedRevenueViews,
  normalizeRevenueView,
} from "./rate-revenue-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Rate & Revenue Phase 1 Prompt 3 — workspace shell", () => {
  it("A. default view is control-center", () => {
    assert.equal(REVENUE_DEFAULT_VIEW, "control-center");
    assert.equal(normalizeRevenueView(), "control-center");
    assert.equal(normalizeRevenueView(""), "control-center");
    const route = readRel("../../../routes/restaurant/pms/rates-revenue.tsx");
    const workspace = readRel("../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /search\.view \?\? search\.tab/);
    assert.doesNotMatch(route, /"plans"/);
    assert.doesNotMatch(route, /searchTab \?\? "overview"/);
  });

  it("B. invalid view falls back to control-center", () => {
    assert.equal(normalizeRevenueView("not-a-view"), "control-center");
    assert.equal(normalizeRevenueView("masters"), "control-center");
    assert.equal(normalizeRevenueView("rate-plans"), "control-center");
  });

  it("C. old tab query values still map to workspace views", () => {
    assert.equal(LEGACY_REVENUE_TAB_MAP.overview, "control-center");
    assert.equal(LEGACY_REVENUE_TAB_MAP.plans, "rate-plans-reference");
    assert.equal(LEGACY_REVENUE_TAB_MAP.calendar, "rate-calendar");
    assert.equal(LEGACY_REVENUE_TAB_MAP.restrictions, "restrictions");
    assert.equal(normalizeRevenueView("overview"), "control-center");
    assert.equal(normalizeRevenueView("plans"), "rate-plans-reference");
    assert.equal(normalizeRevenueView("calendar"), "rate-calendar");
    assert.equal(normalizeRevenueView("restrictions"), "restrictions");
    const route = readRel("../../../routes/restaurant/pms/rates-revenue.tsx");
    assert.match(route, /search\["tab"\]/);
    assert.match(route, /search\["view"\]/);
  });

  it("D. implemented functional views still mount existing tabs", () => {
    const workspace = readRel("../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /<RevenueControlView /);
    assert.match(workspace, /<RatePlansTab /);
    assert.match(workspace, /<RateCalendarView/);
    assert.match(workspace, /<RateRestrictionsTab/);
    assert.match(workspace, /<BulkRateChangeView/);
    assert.match(workspace, /<RateHistoryView/);
    assert.match(workspace, /case "control-center"/);
    assert.match(workspace, /case "rate-plans-reference"/);
    assert.match(workspace, /case "rate-calendar"/);
    assert.match(workspace, /case "bulk-rate-change"/);
    assert.match(workspace, /case "rate-history"/);
    assert.match(workspace, /case "restrictions"/);
    assert.deepEqual(implementedRevenueViews(), [
      "control-center",
      "rate-plans-reference",
      "rate-calendar",
      "bulk-rate-change",
      "rate-history",
      "restrictions",
    ]);
  });

  it("E. future views render honest foundation states", () => {
    const workspace = readRel("../components/workspaces/rates-workspace.tsx");
    const foundation = readRel("../components/rates/revenue-foundation-view.tsx");
    assert.match(workspace, /RevenueFoundationView/);
    assert.match(foundation, /Foundation ready/);
    assert.match(foundation, /Planned capability/);
    assert.match(foundation, /Expected sources/);
    assert.doesNotMatch(foundation, /RevPAR/);
    assert.doesNotMatch(foundation, /\$\d/);
    assert.doesNotMatch(foundation, /approval queue/i);
    assert.ok(foundationRevenueViews().includes("demand-forecast"));
    assert.ok(!foundationRevenueViews().includes("rate-history"));
    assert.ok(!foundationRevenueViews().includes("bulk-rate-change"));
    assert.equal(
      foundationRevenueViews().length,
      REVENUE_VIEW_DEFINITIONS.filter((view) => !view.implemented).length,
    );
  });

  it("F. Rate & Revenue still has no master CRUD", () => {
    const workspace = readRel("../components/workspaces/rates-workspace.tsx");
    const tabs = readRel("../components/rates/rates-tabs.tsx");
    const plansStart = tabs.indexOf("export function RatePlansTab");
    const plansEnd = tabs.indexOf("function usePlanPicker");
    const plans = tabs.slice(plansStart, plansEnd);
    assert.doesNotMatch(workspace, /Add rate plan/);
    assert.doesNotMatch(workspace, /Add category/);
    assert.doesNotMatch(plans, /Add rate plan/);
    assert.doesNotMatch(plans, /Add category/);
    assert.doesNotMatch(plans, /setRatePlanActive/);
    assert.doesNotMatch(plans, /saveRatePlan/);
    assert.doesNotMatch(tabs, /function RatePlanDialog/);
  });

  it("G. pricing engine source stays on the 0016 contracts", () => {
    const fns = readRel("./rates.functions.ts");
    assert.match(fns, /rpc\("price_hotel_stay"/);
    assert.match(fns, /rpc\("reprice_hotel_reservation"/);
    const sql = readRel("../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_hotel_reservation_priced/);
  });

  it("H. route package guard and operational chrome still exist", () => {
    const route = readRel("../../../routes/restaurant/pms/rates-revenue.tsx");
    assert.match(route, /requireRoutePackage\("pms"\)/);
    assert.match(route, /hidePackageRail/);
    assert.match(route, /hideTopHeader/);
    const workspace = readRel("../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /RateRevenueChrome/);
    const chrome = readRel("../components/rates/rate-revenue-chrome.tsx");
    assert.match(chrome, /PmsCommandChrome/);
    assert.match(chrome, /Rates & Revenue/);
    assert.match(chrome, /usePropertyBusinessDate/);
    assert.match(chrome, /Rate search is not available yet/);
    assert.doesNotMatch(chrome, /Configuration · Rates/);
  });

  it("I. Room & Inventory files are not rewritten by this shell", () => {
    const rooms = readRel("../components/workspaces/rooms-workspace.tsx");
    const chrome = readRel("../components/rooms/room-inventory-chrome.tsx");
    const availability = readRel("../components/rooms/room-inventory-availability.tsx");
    const calendar = readRel("../components/rooms/room-inventory-calendar.tsx");
    assert.match(rooms, /RoomInventoryChrome/);
    assert.doesNotMatch(rooms, /RateRevenueChrome/);
    assert.match(chrome, /Rooms & Inventory/);
    assert.doesNotMatch(chrome, /RateRevenueChrome/);
    assert.match(availability, /Availability/);
    assert.match(calendar, /Calendar/);
  });

  it("J. Prompt 3 adds no database migration", () => {
    const migrations = readdirSync(join(here, "../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0100_pms_account_status_pending.sql"));
    assert.ok(!migrations.some((name) => /rate.revenue|revenue.workspace|prompt.?3/i.test(name)));
    const lib = readRel("./rate-revenue-workspace.ts");
    assert.doesNotMatch(lib, /CREATE TABLE/);
    assert.doesNotMatch(lib, /ALTER TABLE/);
  });

  it("maps UI-01–UI-40 onto workspace views without 40 routes", () => {
    assert.equal(REVENUE_UI_SCREEN_MAP.length, 40);
    assert.equal(REVENUE_UI_SCREEN_MAP[0]?.view, "control-center");
    assert.equal(REVENUE_UI_SCREEN_MAP[39]?.view, "export");
    assert.equal(REVENUE_UI_SCREEN_MAP[2]?.view, null);
    const workspace = readRel("../components/workspaces/rates-workspace.tsx");
    const lib = readRel("./rate-revenue-workspace.ts");
    assert.doesNotMatch(workspace, /TabsTrigger/);
    assert.match(workspace, /REVENUE_PRIMARY_SECTIONS/);
    assert.match(lib, /label: "Revenue Control"/);
    assert.match(lib, /label: "Demand & Forecast"/);
  });
});
