import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  REPORT_CATALOGUE,
  REPORT_CATEGORIES,
  filterReports,
  reportByCode,
  reportsReaderDate,
  reportsSearch,
  resolveReportsView,
} from "./reports-shell.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Reports Phase 0 shell", () => {
  it("lists only the five live readers", () => {
    assert.deepEqual(
      REPORT_CATALOGUE.map((row) => row.code),
      ["operational", "financial", "rooms", "revenue", "management"],
    );
    assert.deepEqual(
      REPORT_CATEGORIES.map((row) => row.id),
      ["operational", "financial", "rooms", "revenue", "management"],
    );
    assert.equal(reportByCode("government"), null);
    assert.equal(reportByCode("invoices"), null);
    assert.equal(reportByCode("city-ledger"), null);
    assert.equal(reportByCode("custom"), null);
    assert.equal(reportByCode("scheduled"), null);
    assert.equal(reportByCode("occupancy"), null);
    assert.equal(resolveReportsView({ tab: "occupancy" }).tab, "report");
    assert.equal(
      resolveReportsView({ tab: "occupancy" }).tab === "report"
        ? resolveReportsView({ tab: "occupancy" }).report
        : null,
      "operational",
    );
    assert.deepEqual(reportsSearch({ tab: "center" }), { tab: "center" });
    assert.deepEqual(reportsSearch({ tab: "report", report: "rooms" }), {
      tab: "report",
      report: "rooms",
    });
    assert.deepEqual(filterReports("folio", null).map((row) => row.code), []);
    assert.deepEqual(filterReports("getCashieringDashboard", "financial").map((row) => row.code), [
      "financial",
    ]);
  });

  it("sends the supplied house date and does not invent one", () => {
    assert.equal(reportsReaderDate("2026-09-28"), "2026-09-28");
    assert.throws(() => reportsReaderDate("today"), /house business date/);
  });

  it("captions financial activity as posted_at UTC and rooms as point-in-time", () => {
    const financial = REPORT_CATALOGUE.find((row) => row.code === "financial");
    const rooms = REPORT_CATALOGUE.find((row) => row.code === "rooms");
    assert.match(financial?.caption ?? "", /posted_at|UTC/);
    assert.doesNotMatch(rooms?.caption ?? "", /business date/i);
    const desk = read("../components/reports/reports-desk.tsx");
    const roomsFn = desk.slice(desk.indexOf("function RoomsReport"), desk.indexOf("function ManagementReport"));
    assert.doesNotMatch(roomsFn, /business date/i);
    assert.match(desk, /posted_at UTC day/);
  });

  it("uses the shared chrome, the house date, and no export or schedule", () => {
    const shell = read("./reports-shell.ts");
    const chrome = read("../components/reports/reports-chrome.tsx");
    const desk = read("../components/reports/reports-desk.tsx");
    const workspace = read("../components/workspaces/pms-reports-workspace.tsx");
    const route = read("../../../routes/restaurant/pms/reports.tsx");
    const joined = [shell, chrome, desk, workspace].join("\n");
    assert.match(chrome, /RoomInventoryChrome/);
    assert.match(chrome, /activeModule="Reports"/);
    assert.match(route, /hidePackageRail/);
    assert.match(route, /hideTopHeader/);
    assert.match(route, /\/restaurant\/pms\/reports/);
    assert.match(workspace, /getPropertyBusinessDate/);
    assert.match(workspace, /reportsReaderDate/);
    assert.match(workspace, /RevenueOverviewTab/);
    assert.doesNotMatch(workspace, /propertyToday/);
    assert.doesNotMatch(desk, /propertyToday/);
    assert.doesNotMatch(joined, /from ["'][^"']*(jspdf|xlsx|exportRevenue|pg_cron)/);
    assert.doesNotMatch(chrome + desk + workspace, /Export CSV|Schedule report|Government report|Submit report/i);
    assert.doesNotMatch(chrome, /MoreHorizontal/);
  });
});
