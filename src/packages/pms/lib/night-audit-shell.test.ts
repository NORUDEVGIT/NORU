import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  NIGHT_AUDIT_TABS,
  nightAuditSearch,
  paginateRows,
  resolveNightAuditTab,
} from "./night-audit-shell.ts";

const desk = readFileSync(
  new URL("../components/nightaudit/night-audit-desk.tsx", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../components/workspaces/night-audit-workspace.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../../../routes/restaurant/pms/night-audit.tsx", import.meta.url),
  "utf8",
);
const legacyIndex = readFileSync(
  new URL("../../../routes/restaurant/cashiering/night-audit/index.tsx", import.meta.url),
  "utf8",
);
const legacyRun = readFileSync(
  new URL("../../../routes/restaurant/cashiering/night-audit/$runId.tsx", import.meta.url),
  "utf8",
);

describe("Night Audit Phase 1 shell", () => {
  it("keeps four tabs and the canonical route", () => {
    assert.deepEqual(
      NIGHT_AUDIT_TABS.map((tab) => tab.label),
      ["Control Center", "Pre-Audit", "Reconciliation", "History"],
    );
    assert.equal(resolveNightAuditTab(undefined), "control");
    assert.equal(resolveNightAuditTab("summary"), "history");
    assert.equal(resolveNightAuditTab("not-a-tab"), "control");
    assert.deepEqual(nightAuditSearch("history", "run-1"), { tab: "history", run: "run-1" });
    assert.deepEqual(nightAuditSearch("control", "run-1"), { tab: "control" });
    assert.match(route, /\/restaurant\/pms\/night-audit/);
    assert.match(route, /hidePackageRail/);
    assert.match(legacyIndex, /to: "\/restaurant\/pms\/night-audit"/);
    assert.match(legacyRun, /tab: "history"/);
    assert.match(legacyRun, /run: params.runId/);
    assert.doesNotMatch(legacyRun, /getNightAuditRun/);
  });

  it("pages history without inventing rows", () => {
    const page = paginateRows(["a", "b", "c"], 1);
    assert.equal(page.pages, 1);
    assert.deepEqual(page.rows, ["a", "b", "c"]);
    const long = paginateRows(Array.from({ length: 12 }, (_, index) => index), 2);
    assert.equal(long.page, 2);
    assert.deepEqual(long.rows, [10, 11]);
  });

  it("does not mount legacy panels, retry, or fake ledgers", () => {
    assert.match(workspace, /getNightAuditRun/);
    assert.match(workspace, /runNightAudit/);
    assert.match(workspace, /closeBusinessDate/);
    assert.doesNotMatch(workspace, /updateException/);
    assert.doesNotMatch(desk, /ChecklistPanel|ExceptionsPanel|NoShowPanel|RevenuePanel/);
    assert.doesNotMatch(desk, /Run pre-audit|Retry|Ignore|Waive|City Ledger|Company Folios/i);
    assert.doesNotMatch(desk, /recharts|ResponsiveContainer/);
    assert.match(desk, /night-audit-reconciliation-hold/);
    assert.match(desk, /getNightAuditRun|runDetail/);
  });
});
