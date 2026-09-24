import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { REPORTS_ROLES } from "../../../../core/lib/module-access.ts";
import {
  canAccessRevenueView,
  firstAccessibleRevenueView,
  requiredCapabilityForView,
  viewsForRevenueSection,
  visibleRevenueSections,
} from "../rate-revenue-workspace.ts";
import {
  deniedRevenueAccess,
  REVENUE_OPERATE_ROLES,
  resolveRevenueAccess,
} from "./revenue-access.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Rate & Revenue Phase 1 Prompt 5 — access model", () => {
  it("maps owner and manager to current operational access without inventing approve", () => {
    assert.deepEqual([...REVENUE_OPERATE_ROLES], ["owner", "manager"]);
    assert.match(readRel("../rates.server.ts"), /RATE_MANAGE_ROLES = \["owner", "manager"\]/);
    for (const role of ["owner", "manager"] as const) {
      const access = resolveRevenueAccess(role);
      assert.equal(access.canView, true);
      assert.equal(access.canViewRates, true);
      assert.equal(access.canEditDailyRates, true);
      assert.equal(access.canViewRestrictions, true);
      assert.equal(access.canApplyRestrictions, true);
      assert.equal(access.canViewCommercial, true);
      assert.equal(access.canViewForecast, true);
      assert.equal(access.canViewApprovals, true);
      assert.equal(access.canApprove, false);
      assert.equal(access.canViewAnalytics, true);
      assert.equal(access.canViewAudit, true);
      assert.equal(access.canExport, true);
      assert.equal(firstAccessibleRevenueView(access), "control-center");
      assert.ok(canAccessRevenueView(access, "rate-calendar"));
      assert.ok(canAccessRevenueView(access, "restrictions"));
      assert.ok(visibleRevenueSections(access).includes("rates"));
    }
  });

  it("does not grant Rate & Revenue to receptionist or accountant", () => {
    for (const role of ["receptionist", "accountant", "cashier", "housekeeper"] as const) {
      const access = resolveRevenueAccess(role);
      assert.deepEqual(access, deniedRevenueAccess());
      assert.equal(firstAccessibleRevenueView(access), null);
      assert.equal(canAccessRevenueView(access, "control-center"), false);
      assert.equal(canAccessRevenueView(access, "export"), false);
      assert.deepEqual(visibleRevenueSections(access), []);
      assert.deepEqual(viewsForRevenueSection("rates", access), []);
    }
    assert.ok((REPORTS_ROLES as readonly string[]).includes("accountant"));
    const overview = readRel("../rates.functions.ts");
    assert.match(overview, /reports_analytics/);
    assert.match(overview, /REPORTS_ROLES/);
    assert.doesNotMatch(overview.slice(overview.indexOf("export const getRevenueOverview")), /requireRateManager/);
  });

  it("denies the workspace when the PMS package is off", () => {
    const access = resolveRevenueAccess("owner", { packageEnabled: false });
    assert.deepEqual(access, deniedRevenueAccess());
    const server = readRel("./revenue-access.server.ts");
    assert.match(server, /requirePmsPackage/);
    assert.match(server, /packageEnabled: false/);
  });

  it("keeps server mutations on requireRateManager", () => {
    const fns = readRel("../rates.functions.ts");
    const override = fns.slice(fns.indexOf("export const saveRateOverride"), fns.indexOf("export const listRateRestrictions"));
    const restriction = fns.slice(fns.indexOf("export const saveRateRestriction"), fns.indexOf("export const quoteStay"));
    assert.match(override, /requireRateManager/);
    assert.match(restriction, /requireRateManager/);
    const accessFns = readRel("./revenue-access.functions.ts");
    assert.doesNotMatch(accessFns, /saveRateOverride|saveRateRestriction/);
  });

  it("hides inaccessible views and disables mutation controls in UI", () => {
    assert.equal(requiredCapabilityForView("rate-calendar"), "canViewRates");
    assert.equal(requiredCapabilityForView("restrictions"), "canViewRestrictions");
    assert.equal(requiredCapabilityForView("approvals"), "canViewApprovals");
    assert.equal(requiredCapabilityForView("audit-control"), "canViewAudit");
    assert.equal(requiredCapabilityForView("export"), "canExport");
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    const tabs = readRel("../../components/rates/rates-tabs.tsx");
    assert.match(workspace, /getRevenueAccess/);
    assert.match(workspace, /!access\?\.canView/);
    assert.match(workspace, /canAccessRevenueView/);
    assert.match(workspace, /canEditDailyRates=\{access\?\.canEditDailyRates === true\}/);
    assert.match(workspace, /canApplyRestrictions=\{access\?\.canApplyRestrictions === true\}/);
    assert.doesNotMatch(workspace, /membership\.role === "owner"/);
    assert.match(tabs, /disabled=\{mutation\.isPending \|\| !canEditDailyRates\}/);
    assert.match(tabs, /disabled=\{mutation\.isPending \|\| !canApplyRestrictions\}/);
  });
});
