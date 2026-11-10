import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  NIGHT_AUDIT_TABS,
  nightAuditSearch,
  paginateRows,
  resolveNightAuditStep,
  resolveNightAuditTab,
} from "./night-audit-shell.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const workspace = read("../components/workspaces/night-audit-workspace.tsx");
const chrome = read("../components/nightaudit/night-audit-chrome.tsx");
const route = read("../../../routes/restaurant/pms/night-audit.tsx");
const legacyIndex = read("../../../routes/restaurant/cashiering/night-audit/index.tsx");
const legacyRun = read("../../../routes/restaurant/cashiering/night-audit/$runId.tsx");

describe("End of Day shell", () => {
  it("has two modes and resolves retired tab ids to the current End of Day", () => {
    assert.deepEqual(
      NIGHT_AUDIT_TABS.map((tab) => tab.label),
      ["Current End of Day", "History"],
    );
    assert.equal(resolveNightAuditTab(undefined), "current");
    assert.equal(resolveNightAuditTab("history"), "history");
    assert.equal(resolveNightAuditTab("summary"), "history");
    for (const retired of ["control", "financial", "operations", "exceptions", "close", "nope"]) {
      assert.equal(resolveNightAuditTab(retired), "current");
    }
    assert.equal(resolveNightAuditStep("cashier"), "cashier");
    assert.equal(resolveNightAuditStep("review"), null);
    assert.deepEqual(nightAuditSearch("history", { run: "run-1" }), { tab: "history", run: "run-1" });
    assert.deepEqual(nightAuditSearch("current", { step: "folios" }), { tab: "current", step: "folios" });
    assert.deepEqual(nightAuditSearch("current", { run: "run-1" }), { tab: "current" });
  });

  it("keeps the canonical route and the legacy redirects", () => {
    assert.match(route, /\/restaurant\/pms\/night-audit/);
    assert.match(route, /hidePackageRail/);
    assert.match(route, /search\["step"\]/);
    assert.doesNotMatch(route, /focus/);
    assert.match(legacyIndex, /to: "\/restaurant\/pms\/night-audit"/);
    assert.match(legacyRun, /tab: "history"/);
    assert.match(legacyRun, /run: params.runId/);
    assert.doesNotMatch(legacyRun, /getNightAuditRun/);
  });

  it("pages rows without inventing any", () => {
    const page = paginateRows(["a", "b", "c"], 1);
    assert.equal(page.pages, 1);
    assert.deepEqual(page.rows, ["a", "b", "c"]);
    const long = paginateRows(Array.from({ length: 12 }, (_, index) => index), 2);
    assert.equal(long.page, 2);
    assert.deepEqual(long.rows, [10, 11]);
  });

  it("mounts the nine-step workspace, not the retired desk and panels", () => {
    assert.match(workspace, /getNightAuditWorkspace/);
    assert.match(workspace, /startNightAudit/);
    assert.match(workspace, /saveNightAuditProgress/);
    assert.match(workspace, /closeBusinessDate/);
    assert.match(workspace, /StepRail/);
    assert.match(workspace, /EndOfDayStepPanel/);
    assert.doesNotMatch(workspace, /runNightAudit|reviewWarning|updateException|getNightAuditFinancials|getNightAuditOperations/);
    assert.doesNotMatch(chrome, /className="hidden"/);
    for (const removed of [
      "night-audit-desk.tsx",
      "night-audit-exception-queue.tsx",
      "night-audit-financial-panel.tsx",
      "night-audit-operational-panel.tsx",
      "na1-panels.tsx",
    ]) {
      assert.equal(existsSync(new URL(`../components/nightaudit/${removed}`, import.meta.url)), false, removed);
    }
  });
});
