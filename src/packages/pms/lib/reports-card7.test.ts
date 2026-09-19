import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CARD7_REPORTS_FISCAL_WARNING,
  CARD7_REPORTS_NO_SCHEDULER,
  CARD7_REPORTS_SETUP_ONLY,
  emptyReportsSnapshot,
  evaluateCard7ReportsReadiness,
  reportPolicyValid,
  type Card7ReportsSnapshot,
} from "./reports-card7.server.ts";
import { buildCard7ValidationReport } from "./card7-readiness.server.ts";
import { emptyAuditSnapshot } from "./audit-card7.server.ts";
import { emptySecuritySnapshot } from "./security-roles-card7.server.ts";

function readyReports(): Card7ReportsSnapshot {
  const categories = ["operational", "financial", "occupancy", "revenue", "management"].map(
    (code) => ({
      id: `category-${code}`,
      code,
      name: code,
      description: "",
      active: true,
    }),
  );
  const definitions = categories.map((category) => ({
    id: `definition-${category.code}`,
    code: category.code,
    categoryId: category.id,
    name: category.name,
    description: "",
    queryKey:
      category.code === "revenue"
        ? "getRevenueOverview"
        : category.code === "financial"
          ? "getCashieringDashboard"
          : category.code === "management"
            ? "listNightAuditRuns"
            : "getBookingsDashboard",
    active: true,
  }));
  const metricRows = [
    ["occupancy_range", "getRevenueOverview", "sold / available", "percent"],
    ["occupancy_in_house", "getBookingsDashboard", "staying / sellable", "percent"],
    ["adr", "getRevenueOverview", "revenue / sold", "amount"],
    ["revpar", "getRevenueOverview", "revenue / available", "amount"],
  ] as const;
  const metrics = metricRows.map(([code, queryKey, formulaNotes, unit]) => ({
    id: `metric-${code}`,
    code,
    name: code,
    description: "",
    queryKey,
    formulaNotes,
    unit: unit as "percent" | "amount",
    active: true,
  }));
  const permissions = [
    {
      id: "permission-view",
      code: "reports.pms.view",
      name: "View reports",
      action: "view",
      active: true,
    },
  ];
  return emptyReportsSnapshot({
    categories,
    definitions,
    definitionSettings: definitions.map((row) => ({
      id: `setting-${row.id}`,
      definitionId: row.id,
      enabled: true,
    })),
    metrics,
    metricSettings: metrics.map((row) => ({
      id: `setting-${row.id}`,
      metricId: row.id,
      enabled: true,
      displayName: "",
    })),
    permissions,
    permissionMappings: definitions.map((row) => ({
      id: `mapping-${row.id}`,
      definitionId: row.id,
      permissionId: "permission-view",
    })),
    policy: {
      exists: true,
      exportAllowed: true,
      exportCsv: true,
      exportPdf: false,
      maskGuestNames: true,
      ownerManagerExportOnly: true,
      defaultDateRangeDays: 30,
      scheduleIntentEnabled: false,
      scheduleCadence: null,
      periodBasis: "business_date",
      active: true,
    },
  });
}

describe("Card 7 Reports readiness", () => {
  it("starts incomplete without setup and describes non-enforcement", () => {
    const result = evaluateCard7ReportsReadiness(emptyReportsSnapshot());
    assert.equal(result.ready, false);
    assert.equal(result.status, "not_started");
    assert.ok(result.warnings.includes(CARD7_REPORTS_SETUP_ONLY));
    assert.ok(result.warnings.includes(CARD7_REPORTS_NO_SCHEDULER));
  });

  it("requires definitions, metrics, mappings and a valid policy", () => {
    const snapshot = readyReports();
    snapshot.definitionSettings = snapshot.definitionSettings.filter(
      (row) => row.definitionId !== "definition-revenue",
    );
    snapshot.metrics = snapshot.metrics.filter((row) => row.code !== "revpar");
    snapshot.permissionMappings = snapshot.permissionMappings.filter(
      (row) => row.definitionId !== "definition-financial",
    );
    snapshot.policy = { ...snapshot.policy, exportCsv: false };
    const result = evaluateCard7ReportsReadiness(snapshot);
    assert.equal(result.ready, false);
    assert.equal(result.status, "in_progress");
    assert.match(result.blockers.join(" "), /Configure report definition revenue/);
    assert.match(result.blockers.join(" "), /Required metric revpar is missing/);
    assert.match(result.blockers.join(" "), /Map at least one report permission to financial/);
    assert.match(result.blockers.join(" "), /Save valid export/);
  });

  it("passes Reports only and keeps whole Card 7 partial", () => {
    const reports = readyReports();
    const readiness = evaluateCard7ReportsReadiness(reports);
    assert.equal(readiness.ready, true);
    assert.equal(readiness.status, "complete");
    const validation = buildCard7ValidationReport({
      security: emptySecuritySnapshot(),
      audit: emptyAuditSnapshot(),
      reports,
    });
    assert.equal(validation.reports.verdict, "PASS");
    assert.equal(validation.importDomain.verdict, "FAIL");
    assert.equal(validation.overall.verdict, "PARTIAL");
  });

  it("references Card 3 fiscal year without requiring duplicate fields", () => {
    const snapshot = readyReports();
    snapshot.policy = { ...snapshot.policy, periodBasis: "fiscal_year" };
    const result = evaluateCard7ReportsReadiness(snapshot);
    assert.equal(result.ready, true);
    assert.ok(result.warnings.includes(CARD7_REPORTS_FISCAL_WARNING));
  });

  it("validates export and schedule defaults without executing them", () => {
    const policy = readyReports().policy;
    assert.equal(reportPolicyValid(policy), true);
    assert.equal(
      reportPolicyValid({ ...policy, scheduleIntentEnabled: true, scheduleCadence: null }),
      false,
    );
    assert.equal(
      reportPolicyValid({ ...policy, exportAllowed: true, exportCsv: false, exportPdf: false }),
      false,
    );
  });
});

describe("Card 7 Reports ownership", () => {
  it("does not call live report queries, scheduler, authz or Data Import", () => {
    const functions = readFileSync(new URL("./reports-card7.functions.ts", import.meta.url), "utf8");
    const set6Functions = readFileSync(
      new URL("./pms-set6-sales-distribution.functions.ts", import.meta.url),
      "utf8",
    );
    const set6Section = readFileSync(
      new URL("../components/settings/pms-set6-section.tsx", import.meta.url),
      "utf8",
    );
    const tab = readFileSync(
      new URL("../components/settings/pms-card7-reports-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(functions, /pms_reports_catalogue_posture/);
    assert.match(functions, /pms_reports_schedule_access_posture/);
    assert.match(functions, /restaurant_staff_audit_log/);
    assert.doesNotMatch(functions, /from\("hotel_reservations"\)|getRevenueOverview\(/);
    assert.doesNotMatch(functions, /staff_module_access|REPORTS_ROLES/);
    assert.doesNotMatch(functions, /cron|sendEmail|scheduleJob/);
    assert.doesNotMatch(tab, /from\("hotel_reservations"\)|getRevenueOverview\(/);
    assert.doesNotMatch(tab, /Data Import|Migration/);
    assert.match(tab, /Card 7 stores no SQL/);
    assert.match(set6Functions, /syncCard7DefinitionsFromSet6/);
    assert.match(set6Functions, /syncCard7PolicyFromSet6/);
    assert.match(set6Section, /set6-open-card7-reports/);
  });
});
