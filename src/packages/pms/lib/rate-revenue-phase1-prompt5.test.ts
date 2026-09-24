import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEGACY_REVENUE_TAB_MAP,
  REVENUE_DEFAULT_VIEW,
  REVENUE_PRIMARY_SECTIONS,
  foundationRevenueViews,
  implementedRevenueViews,
  normalizeRevenueView,
} from "./rate-revenue-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Rate & Revenue Phase 1 Prompt 5 — completion locks", () => {
  it("Prompt 2–4 foundation files are present", () => {
    assert.ok(existsSync(join(here, "../components/rates/rate-revenue-chrome.tsx")));
    assert.ok(existsSync(join(here, "../components/rates/revenue-context-bar.tsx")));
    assert.ok(existsSync(join(here, "./revenue/revenue-config.server.ts")));
    assert.ok(existsSync(join(here, "./revenue/revenue-context.ts")));
    assert.ok(existsSync(join(here, "../../../../docs/pms/rate-revenue-responsibility.md")));
    assert.ok(existsSync(join(here, "../../../../docs/pms/rate-revenue-workspace.md")));
    assert.ok(existsSync(join(here, "../../../../docs/pms/rate-revenue-source-of-truth.md")));
  });

  it("workspace is operational with control-center default and foundation leftovers", () => {
    assert.equal(REVENUE_DEFAULT_VIEW, "control-center");
    assert.equal(normalizeRevenueView("not-real"), "control-center");
    assert.equal(LEGACY_REVENUE_TAB_MAP.plans, "rate-plans-reference");
    assert.deepEqual(
      REVENUE_PRIMARY_SECTIONS.map((section) => section.label),
      ["Revenue Control", "Rates", "Restrictions", "Demand & Forecast", "Commercial", "More"],
    );
    assert.deepEqual(implementedRevenueViews(), [
      "control-center",
      "rate-plans-reference",
      "rate-calendar",
      "bulk-rate-change",
      "rate-history",
      "restrictions",
    ]);
    assert.ok(foundationRevenueViews().includes("demand-forecast"));
    assert.ok(foundationRevenueViews().includes("approvals"));
    const workspace = readRel("../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /Rate & Revenue/);
    assert.doesNotMatch(workspace, /Configuration · Rates/);
    assert.doesNotMatch(workspace, /Add rate plan/);
    assert.doesNotMatch(workspace, /TabsTrigger/);
  });

  it("adapter stays read-only and context bar does not create masters", () => {
    const server = readRel("./revenue/revenue-config.server.ts");
    const bar = readRel("../components/rates/revenue-context-bar.tsx");
    const context = readRel("./revenue/revenue-context.ts");
    assert.doesNotMatch(server, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    assert.match(server, /loadSet6Snapshot/);
    assert.match(bar, /CARD3_HREF/);
    assert.doesNotMatch(bar, /Add /);
    assert.match(context, /TECHNICAL_RESERVATION_SOURCES/);
    assert.match(context, /staff.*walk_in.*direct_booking/);
  });

  it("restriction masters stay distinct from applied hotel_rate_restrictions", () => {
    const types = readRel("./revenue/revenue-config.types.ts");
    const restFn = readRel("./rates.functions.ts");
    assert.match(types, /Not an applied hotel_rate_restrictions row/);
    const save = restFn.slice(restFn.indexOf("export const saveRateRestriction"), restFn.indexOf("export const quoteStay"));
    assert.match(save, /hotel_rate_restrictions/);
    assert.doesNotMatch(save, /pms_commercial_restrictions/);
  });

  it("pricing engine and snapshots stay on the 0016 contracts", () => {
    const fns = readRel("./rates.functions.ts");
    const sql = readRel("../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(fns, /rpc\("price_hotel_stay"/);
    assert.match(fns, /rpc\("reprice_hotel_reservation"/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_hotel_reservation_priced/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.amend_hotel_reservation_priced/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reprice_hotel_reservation/);
  });

  it("Phase 1 added no forecast/approval/competitor migrations", () => {
    const migrations = readdirSync(join(here, "../../../../drizzle/migrations"));
    assert.ok(!migrations.some((name) => /forecast|approval|competitor|rate.shopping|prompt.?[2-5]/i.test(name)));
    const rooms = readRel("../components/workspaces/rooms-workspace.tsx");
    assert.match(rooms, /RoomInventoryChrome/);
    assert.doesNotMatch(rooms, /getRevenueAccess|RevenueContextBar/);
  });
});
