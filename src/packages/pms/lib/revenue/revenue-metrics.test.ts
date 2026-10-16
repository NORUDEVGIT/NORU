import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeBookedRevenueOverview,
  REVENUE_METRIC_CLASS_NOTES,
  REVENUE_METRIC_DEFINITIONS,
  REVENUE_METRIC_KNOWN_GAPS,
  revenueMetricDefinition,
} from "./revenue-metrics.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("Rate & Revenue Phase 1 Prompt 5 — metric foundation", () => {
  it("preserves current getRevenueOverview arithmetic", () => {
    const metrics = computeBookedRevenueOverview({
      soldRoomNights: 10,
      availableRoomNights: 40,
      bookedRoomRevenue: 1250.4,
      pricedNights: 8,
    });
    assert.equal(metrics.occupancyPercent, 25);
    assert.equal(metrics.adr, 125.04);
    assert.equal(metrics.revPar, 31.26);
    assert.equal(metrics.roomRevenue, 1250.4);
    assert.equal(metrics.pricedShare, 80);
    assert.equal(metrics.soldRoomNights, 10);
    assert.equal(metrics.availableRoomNights, 40);

    const empty = computeBookedRevenueOverview({
      soldRoomNights: 0,
      availableRoomNights: 0,
      bookedRoomRevenue: 0,
      pricedNights: 0,
    });
    assert.equal(empty.occupancyPercent, 0);
    assert.equal(empty.adr, 0);
    assert.equal(empty.revPar, 0);
    assert.equal(empty.pricedShare, 0);

    const fns = readFileSync(join(here, "../rates.functions.ts"), "utf8");
    const overview = fns.slice(fns.indexOf("export const getRevenueOverview"));
    assert.match(overview, /computeBookedRevenueOverview/);
    assert.match(overview, /bookedRoomRevenue: revenue/);
    assert.match(overview, /reports_analytics/);
    assert.doesNotMatch(overview, /folio_transactions|posted revenue|collected/);
  });

  it("registers the current booked metrics without posted or forecast formulas", () => {
    assert.deepEqual(
      REVENUE_METRIC_DEFINITIONS.map((row) => row.key),
      [
        "occupancy",
        "adr",
        "revpar",
        "booked-room-revenue",
        "sold-room-nights",
        "available-room-nights",
        "priced-share",
      ],
    );
    assert.equal(revenueMetricDefinition("occupancy").formula, "soldRoomNights / availableRoomNights");
    assert.equal(revenueMetricDefinition("adr").formula, "bookedRoomRevenue / soldRoomNights");
    assert.equal(revenueMetricDefinition("revpar").formula, "bookedRoomRevenue / availableRoomNights");
    assert.equal(revenueMetricDefinition("booked-room-revenue").category, "booked");
    assert.match(revenueMetricDefinition("booked-room-revenue").source, /not folio\/posted/);
    assert.match(REVENUE_METRIC_CLASS_NOTES.booked, /snapshots/);
    assert.match(REVENUE_METRIC_CLASS_NOTES.posted, /Not calculated/);
    assert.match(REVENUE_METRIC_CLASS_NOTES.collected, /Not calculated/);
    assert.match(REVENUE_METRIC_CLASS_NOTES.forecast, /No forecast schema/);
    assert.ok(REVENUE_METRIC_KNOWN_GAPS.some((row) => /OOO\/OOS/.test(row)));
    assert.ok(REVENUE_METRIC_KNOWN_GAPS.some((row) => /unpriced/.test(row)));
  });

  it("Control Center copy names booked snapshot revenue honestly", () => {
    const tabs = readFileSync(join(here, "../../components/rates/rates-tabs.tsx"), "utf8");
    const overview = tabs.slice(
      tabs.indexOf("export function RevenueOverviewTab"),
      tabs.indexOf("export function RatePlansTab"),
    );
    assert.match(overview, /Booked room revenue/);
    assert.match(overview, /reservation pricing snapshots/);
    assert.doesNotMatch(overview, /realized revenue|posted revenue|collected revenue/);
  });
});
