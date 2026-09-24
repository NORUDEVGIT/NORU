import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { CARD3_HREF } from "./pms-property-setup-card3.ts";
import { SET3_RATES_HREF, SET3_RATES_REVENUE_HREF } from "./pms-set3-rates-guest.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Rate & Revenue Phase 1 Prompt 2 — responsibility split", () => {
  it("A. Rate & Revenue plans UI is a read-only operational reference", () => {
    const tabs = readRel("../components/rates/rates-tabs.tsx");
    const plansStart = tabs.indexOf("export function RatePlansTab");
    const plansEnd = tabs.indexOf("function usePlanPicker");
    const plans = tabs.slice(plansStart, plansEnd);
    assert.match(plans, /Rate plan masters are configured in/);
    assert.match(plans, /CARD3_HREF|PropertySetupRatesLink/);
    assert.doesNotMatch(plans, /Add rate plan/);
    assert.doesNotMatch(plans, /Add category/);
    assert.doesNotMatch(plans, /Edit rate plan/);
    assert.doesNotMatch(plans, /Deactivate/);
    assert.doesNotMatch(plans, /setRatePlanActive/);
    assert.doesNotMatch(plans, /saveRatePlan/);
    assert.doesNotMatch(plans, /saveRateCategory/);
    assert.doesNotMatch(tabs, /function RatePlanDialog/);
    assert.doesNotMatch(tabs, /function RateCategoryDialog/);
  });

  it("B. Rate Calendar still writes date-specific nightly overrides", () => {
    const tabs = readRel("../components/rates/rates-tabs.tsx");
    const calStart = tabs.indexOf("export function RateCalendarTab");
    const calEnd = tabs.indexOf("export function RateRestrictionsTab");
    const calendar = tabs.slice(calStart, calEnd);
    assert.match(calendar, /saveRateOverride/);
    assert.match(calendar, /nightlyRate/);
    assert.match(calendar, />\s*Save\s*</);
    const fns = readRel("./rates.functions.ts");
    const ovStart = fns.indexOf("export const saveRateOverride");
    const ovFn = fns.slice(ovStart, fns.indexOf("export const listRateRestrictions"));
    assert.match(ovFn, /from\("hotel_rate_calendar"\)/);
    assert.match(ovFn, /requireRateManager/);
  });

  it("C. Operational restrictions still write hotel_rate_restrictions", () => {
    const tabs = readRel("../components/rates/rates-tabs.tsx");
    const restStart = tabs.indexOf("export function RateRestrictionsTab");
    const rest = tabs.slice(restStart);
    assert.match(rest, /saveRateRestriction/);
    assert.match(rest, /closedToArrival/);
    assert.match(rest, /closedToDeparture/);
    assert.match(rest, /stopSell/);
    assert.match(rest, />\s*Save\s*</);
    const fns = readRel("./rates.functions.ts");
    const restFnStart = fns.indexOf("export const saveRateRestriction");
    const restFn = fns.slice(restFnStart, fns.indexOf("export const quoteStay"));
    assert.match(restFn, /from\("hotel_rate_restrictions"\)/);
    assert.doesNotMatch(restFn, /pms_commercial_restrictions/);
  });

  it("D. Pricing engine source and snapshot RPCs stay on the 0016 contracts", () => {
    const fns = readRel("./rates.functions.ts");
    assert.match(fns, /rpc\("price_hotel_stay"/);
    assert.match(fns, /rpc\("reprice_hotel_reservation"/);
    const sql = readRel("../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_hotel_reservation_priced/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.amend_hotel_reservation_priced/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reprice_hotel_reservation/);
    assert.match(sql, /hotel_rate_restrictions/);
    assert.doesNotMatch(sql, /pms_commercial_restrictions/);
  });

  it("E. Reservation create/amend still bind the priced RPCs", () => {
    const reservations = readRel("./reservations.functions.ts");
    assert.match(reservations, /create_hotel_reservation_priced/);
    assert.match(reservations, /amend_hotel_reservation_priced/);
  });

  it("F. Reports still reuse RevenueOverviewTab without Rate & Revenue shell copy", () => {
    const reports = readRel("../components/workspaces/pms-reports-workspace.tsx");
    assert.match(reports, /RevenueOverviewTab/);
    assert.doesNotMatch(reports, /PMS · Rate/);
    assert.doesNotMatch(reports, /Configuration · Rates/);
    const mixed = readRel("../../../core/components/workspaces/reports-workspace.tsx");
    assert.match(mixed, /RevenueOverviewTab/);
    const overviewStart = readRel("../components/rates/rates-tabs.tsx").indexOf(
      "export function RevenueOverviewTab",
    );
    const overview = readRel("../components/rates/rates-tabs.tsx").slice(
      overviewStart,
      readRel("../components/rates/rates-tabs.tsx").indexOf("export function RatePlansTab"),
    );
    assert.doesNotMatch(overview, /PMS · Rate/);
    assert.match(overview, /getRevenueOverview/);
  });

  it("G. Configure-rates deep-links go to Property Setup Card 3", () => {
    assert.equal(SET3_RATES_HREF, CARD3_HREF);
    assert.equal(SET3_RATES_HREF, "/restaurant/settings#financial-commercial");
    assert.equal(SET3_RATES_REVENUE_HREF, "/restaurant/pms/rates-revenue");
    const admin = readRel("../components/workspaces/pms-administration-workspace.tsx");
    assert.match(admin, /settings#financial-commercial/);
    assert.doesNotMatch(admin, /to="\/restaurant\/pms\/rates-revenue"/);
  });

  it("workspace identity is operational and defaults to overview", () => {
    const workspace = readRel("../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /PMS · Rate/);
    assert.doesNotMatch(workspace, /Configuration · Rates/);
    const route = readRel("../../../routes/restaurant/pms/rates-revenue.tsx");
    assert.match(route, /initialTab=\{searchTab \?\? "overview"\}/);
    assert.doesNotMatch(route, /searchTab \?\? "plans"/);
  });
});
