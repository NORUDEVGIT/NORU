import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contextFieldsForView,
  REVENUE_DEFAULT_VIEW,
} from "../rate-revenue-workspace.ts";
import {
  contextFromSearch,
  emptyRevenueContext,
  patchRevenueContext,
  sanitizeLoadedContext,
  sanitizeRevenueContext,
  serializeRevenueSearch,
  TECHNICAL_RESERVATION_SOURCES,
} from "./revenue-context.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const options = {
  roomTypes: [{ id: "rt-1" }, { id: "rt-2" }],
  ratePlans: [
    { id: "rp-a", roomTypeId: "rt-1" },
    { id: "rp-b", roomTypeId: "rt-2" },
  ],
  marketSegments: [{ id: "seg-1" }],
  bookingSources: [{ id: "src-1" }],
  salesChannels: [{ id: "ch-1" }],
};

describe("Rate & Revenue Phase 1 Prompt 4 — Settings adapters & context", () => {
  it("A. adapter is read-only and reuses Property Setup loaders", () => {
    const server = readRel("./revenue-config.server.ts");
    const fns = readRel("./revenue-config.functions.ts");
    assert.match(server, /READ ONLY/);
    assert.match(server, /loadCommercialCard3Snapshot/);
    assert.match(server, /loadMealsCard3Snapshot/);
    assert.match(server, /loadCorporateCard3Snapshot/);
    assert.match(server, /loadSet6Snapshot/);
    assert.match(server, /from\("room_types"\)/);
    assert.match(server, /from\("hotel_rate_plans"\)/);
    assert.match(server, /from\("hotel_rate_categories"\)/);
    assert.doesNotMatch(server, /\.insert\(/);
    assert.doesNotMatch(server, /\.update\(/);
    assert.doesNotMatch(server, /\.delete\(/);
    assert.doesNotMatch(server, /\.upsert\(/);
    assert.match(fns, /requireRateManager/);
    assert.doesNotMatch(fns, /saveRatePlan|saveRateCategory|setRatePlanActive/);
    assert.doesNotMatch(fns, /RevenueAccess/);
  });

  it("B. commercial catalogues fail independently", () => {
    const server = readRel("./revenue-config.server.ts");
    assert.match(server, /optionalLoad/);
    assert.match(server, /CARD3_COMMERCIAL_UNAVAILABLE/);
    assert.match(server, /CARD3_MEALS_UNAVAILABLE/);
    assert.match(server, /CARD3_CORPORATE_UNAVAILABLE/);
    assert.match(server, /available: false/);
  });

  it("C. restriction masters stay distinct from hotel_rate_restrictions", () => {
    const types = readRel("./revenue-config.types.ts");
    assert.match(types, /RevenueRestrictionMaster/);
    assert.match(types, /Not an applied hotel_rate_restrictions row/);
    const server = readRel("./revenue-config.server.ts");
    assert.doesNotMatch(server, /hotel_rate_restrictions/);
    assert.doesNotMatch(server, /pms_commercial_restrictions/);
  });

  it("D. technical reservation sources are not commercial masters", () => {
    assert.deepEqual([...TECHNICAL_RESERVATION_SOURCES], ["staff", "walk_in", "direct_booking"]);
    const context = readRel("./revenue-context.ts");
    assert.match(context, /Never treat these as commercial source-code masters/);
    const bar = readRel("../../components/rates/revenue-context-bar.tsx");
    assert.match(bar, /Commercial source/);
    assert.doesNotMatch(bar, /walk_in|direct_booking|staff/);
  });

  it("E. context sanitizes IDs and date order", () => {
    const cleaned = sanitizeRevenueContext(
      {
        fromDate: "2026-09-20",
        toDate: "2026-09-10",
        roomTypeId: "missing",
        ratePlanId: "missing-plan",
        marketSegmentId: "seg-1",
        commercialSourceId: "nope",
        salesChannelId: "ch-1",
      },
      options,
    );
    assert.equal(cleaned.fromDate, "2026-09-10");
    assert.equal(cleaned.toDate, "2026-09-20");
    assert.equal(cleaned.roomTypeId, null);
    assert.equal(cleaned.ratePlanId, null);
    assert.equal(cleaned.marketSegmentId, "seg-1");
    assert.equal(cleaned.commercialSourceId, null);
    assert.equal(cleaned.salesChannelId, "ch-1");

    const keepPlan = sanitizeRevenueContext(
      { ...emptyRevenueContext("2026-09-24"), roomTypeId: "missing", ratePlanId: "rp-a" },
      options,
    );
    assert.equal(keepPlan.roomTypeId, null);
    assert.equal(keepPlan.ratePlanId, "rp-a");
  });

  it("F. changing room type clears an incompatible rate plan", () => {
    const current = {
      ...emptyRevenueContext("2026-09-24"),
      roomTypeId: "rt-1",
      ratePlanId: "rp-a",
    };
    const next = patchRevenueContext(current, { roomTypeId: "rt-2" }, options);
    assert.equal(next.roomTypeId, "rt-2");
    assert.equal(next.ratePlanId, null);
    const keep = patchRevenueContext(current, { roomTypeId: "rt-1" }, options);
    assert.equal(keep.ratePlanId, "rp-a");
  });

  it("G. URL parse/serialize and loaded-context keep IDs until catalogues arrive", () => {
    const parsed = contextFromSearch(
      {
        from: "2026-10-01",
        to: "not-a-date",
        roomType: "rt-1",
        ratePlan: "rp-a",
        source: "src-1",
      },
      "2026-09-24",
    );
    assert.equal(parsed.fromDate, "2026-10-01");
    assert.equal(parsed.toDate, "2026-09-24");
    assert.equal(parsed.roomTypeId, "rt-1");

    const search = serializeRevenueSearch("rate-calendar", {
      ...emptyRevenueContext("2026-09-24"),
      roomTypeId: "rt-1",
      ratePlanId: "rp-a",
    });
    assert.equal(search.view, "rate-calendar");
    assert.equal(search.roomType, "rt-1");
    assert.equal(search.ratePlan, "rp-a");
    assert.equal(search.segment, undefined);

    const pending = sanitizeLoadedContext(
      { roomType: "rt-1", ratePlan: "rp-a", segment: "seg-1" },
      "2026-09-24",
      { roomTypes: [], ratePlans: [], marketSegments: [], bookingSources: [], salesChannels: [] },
      { base: false, catalogues: false },
    );
    assert.equal(pending.roomTypeId, "rt-1");
    assert.equal(pending.ratePlanId, "rp-a");
    assert.equal(pending.marketSegmentId, "seg-1");

    const ready = sanitizeLoadedContext(
      { roomType: "rt-1", ratePlan: "rp-a", segment: "missing" },
      "2026-09-24",
      options,
      { base: true, catalogues: true },
    );
    assert.equal(ready.roomTypeId, "rt-1");
    assert.equal(ready.ratePlanId, "rp-a");
    assert.equal(ready.marketSegmentId, null);
  });

  it("H. workspace wires shared context; Reports overview dates stay local", () => {
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    const tabs = readRel("../../components/rates/rates-tabs.tsx");
    const route = readRel("../../../../routes/restaurant/pms/rates-revenue.tsx");
    const bar = readRel("../../components/rates/revenue-context-bar.tsx");

    assert.match(workspace, /RevenueContextBar/);
    assert.match(workspace, /contextFieldsForView\(requestedView\)/);
    assert.match(workspace, /roomTypeId=\{context\.roomTypeId\}/);
    assert.match(workspace, /RateCalendarView/);
    assert.match(workspace, /fromDate: context\.fromDate/);
    assert.match(workspace, /ratePlanId: context\.ratePlanId/);
    assert.match(workspace, /RevenueControlView/);
    assert.match(workspace, /defaultControlCenterRange/);

    const overviewStart = tabs.indexOf("export function RevenueOverviewTab");
    const plansStart = tabs.indexOf("export function RatePlansTab");
    const overview = tabs.slice(overviewStart, plansStart);
    assert.match(overview, /addDays\(today, -29\)/);
    assert.doesNotMatch(overview, /context\?\.fromDate/);

    assert.match(tabs, /usingSharedRoomType \? roomTypeId \|\| ALL/);
    assert.match(tabs, /rangeFrom = context\?\.fromDate \?\? from/);
    assert.match(tabs, /No rate plans are configured for this property/);

    assert.match(route, /roomType/);
    assert.match(route, /ratePlan/);
    assert.match(route, /search=\{search\}/);

    assert.doesNotMatch(bar, /Add /);
    assert.match(bar, /CARD3_HREF/);
    assert.match(bar, /SET1_HUB_HREF/);
    assert.equal(contextFieldsForView(REVENUE_DEFAULT_VIEW).includes("dateRange"), true);
    assert.deepEqual([...contextFieldsForView("rate-plans-reference")], ["roomType"]);
    assert.deepEqual([...contextFieldsForView("rate-calendar")], ["dateRange", "roomType", "ratePlan"]);
  });

  it("I. Prompt 4 adds no migration, no KPI formula change, no Room & Inventory rewrite", () => {
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(!migrations.some((name) => /revenue.config|revenue.context|prompt.?4/i.test(name)));

    const ratesFns = readRel("../rates.functions.ts");
    assert.match(ratesFns, /rpc\("price_hotel_stay"/);
    assert.match(ratesFns, /rpc\("reprice_hotel_reservation"/);

    const rooms = readRel("../../components/workspaces/rooms-workspace.tsx");
    assert.doesNotMatch(rooms, /RevenueContextBar/);
    assert.doesNotMatch(rooms, /getRevenueBaseConfig/);
    assert.match(rooms, /RoomInventoryChrome/);

    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /getRevenueAccess/);
    assert.doesNotMatch(workspace, /Add rate plan/);
  });
});
