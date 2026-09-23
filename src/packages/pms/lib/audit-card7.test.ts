import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CARD7_AUDIT_NO_ENFORCEMENT_COPY,
  CARD7_AUDIT_NO_PURGE_COPY,
  CARD7_AUDIT_VIEWER_LIMITATIONS,
  CARD7_DEFERRED_COVERAGE_WARNING,
  CARD7_REQUIRED_AUDIT_CATEGORY_CODES,
  categoryCodeForStaffAction,
  emptyAuditSnapshot,
  evaluateCard7AuditReadiness,
  filterFederatedEvents,
  type Card7AuditCategory,
  type Card7AuditEvent,
  type Card7AuditSensitivePermission,
  type Card7AuditSnapshot,
} from "./audit-card7.server.ts";
import {
  CARD7_PROGRAMME_CARD_ID,
  buildCard7ValidationReport,
  evaluateCard7Overall,
  mergeCard7Status,
} from "./card7-readiness.server.ts";
import { emptyHotelRoleDraft, emptySecuritySnapshot } from "./security-roles-card7.server.ts";
import { emptyPropertySetupStatus } from "./pms-property-setup-card1.ts";

function category(partial: Partial<Card7AuditCategory> & { id: string; code: string }): Card7AuditCategory {
  return {
    name: partial.name ?? partial.code,
    description: "",
    defaultSeverity: partial.defaultSeverity ?? "info",
    active: partial.active !== false,
    ...partial,
  };
}

function permission(
  partial: Partial<Card7AuditSensitivePermission> & { id: string; code: string },
): Card7AuditSensitivePermission {
  return {
    name: partial.name ?? partial.code,
    module: partial.module ?? "administration",
    active: partial.active !== false,
    ...partial,
  };
}

function readyAudit(): Card7AuditSnapshot {
  const categories = CARD7_REQUIRED_AUDIT_CATEGORY_CODES.map((code, index) =>
    category({
      id: `cat-${code}`,
      code,
      defaultSeverity: "critical",
    }),
  ).concat([
    category({ id: "cat-setup", code: "setup" }),
    category({ id: "cat-fo", code: "front_office", defaultSeverity: "warning" }),
    category({ id: "cat-rates", code: "rates", defaultSeverity: "warning" }),
    category({ id: "cat-dist", code: "distribution", defaultSeverity: "warning" }),
  ]);
  return emptyAuditSnapshot({
    policy: {
      exists: true,
      enabled: true,
      retentionDays: 365,
      maskIdNumbers: true,
      restrictGuestExport: false,
      active: true,
    },
    categories,
    categorySettings: categories.map((row) => ({
      id: `set-${row.id}`,
      categoryId: row.id,
      enabled: true,
      severity: row.defaultSeverity,
      critical: row.defaultSeverity === "critical",
    })),
    sensitivePermissions: [
      permission({ id: "p1", code: "administration.staff.edit" }),
      permission({ id: "p2", code: "cashiering.folio.refund" }),
    ],
    coverage: [
      { id: "c1", permissionId: "p1", coverage: "required", notes: "" },
      { id: "c2", permissionId: "p2", coverage: "deferred", notes: "folio_history unused" },
    ],
  });
}

function event(partial: Partial<Card7AuditEvent> & { id: string }): Card7AuditEvent {
  return {
    source: "staff_audit",
    createdAt: "2026-09-19T12:00:00.000Z",
    action: "role_changed",
    categoryCode: "iam",
    module: "iam",
    actorUserId: "user-1",
    actorName: "Ada",
    departmentId: null,
    severity: "critical",
    metadata: null,
    previousValues: null,
    newValues: null,
    notes: null,
    limitations: [],
    ...partial,
  };
}

describe("Card 7 Audit readiness", () => {
  it("stays not started until policy work exists", () => {
    const result = evaluateCard7AuditReadiness(emptyAuditSnapshot());
    assert.equal(result.status, "not_started");
    assert.equal(result.ready, false);
    assert.match(result.blockers.join(" "), /Save an audit policy/);
    assert.ok(result.warnings.includes(CARD7_AUDIT_NO_PURGE_COPY));
    assert.ok(result.warnings.includes(CARD7_AUDIT_NO_ENFORCEMENT_COPY));
  });

  it("requires retention, required categories, and sensitive coverage", () => {
    const snapshot = readyAudit();
    snapshot.policy = { ...snapshot.policy, retentionDays: null };
    snapshot.categorySettings = snapshot.categorySettings.filter((row) => row.categoryId !== "cat-iam");
    snapshot.coverage = snapshot.coverage.filter((row) => row.permissionId !== "p2");
    const result = evaluateCard7AuditReadiness(snapshot);
    assert.equal(result.status, "in_progress");
    assert.match(result.blockers.join(" "), /retention days/);
    assert.match(result.blockers.join(" "), /Configure category iam/);
    assert.match(result.blockers.join(" "), /cashiering\.folio\.refund/);
  });

  it("keeps Audit PARTIAL when coverage is deferred, without completing Card 7", () => {
    const audit = readyAudit();
    const result = evaluateCard7AuditReadiness(audit);
    assert.equal(result.ready, true);
    assert.equal(result.status, "in_progress");
    assert.ok(result.warnings.includes(CARD7_DEFERRED_COVERAGE_WARNING));
    assert.ok(result.warnings.includes(CARD7_AUDIT_VIEWER_LIMITATIONS[0]));
    const report = buildCard7ValidationReport({
      security: emptySecuritySnapshot(),
      audit,
    });
    assert.equal(report.audit.verdict, "PARTIAL");
    assert.equal(report.security.verdict, "FAIL");
    assert.equal(report.reports.verdict, "FAIL");
    assert.equal(report.importDomain.verdict, "FAIL");
    assert.equal(report.overall.verdict, "PARTIAL");
    const stored = mergeCard7Status(emptyPropertySetupStatus(), report.overall);
    assert.equal(stored.cards[CARD7_PROGRAMME_CARD_ID], "in_progress");
  });

  it("marks Audit complete only when sensitive coverage is not deferred", () => {
    const audit = readyAudit();
    audit.coverage = audit.coverage.map((row) => ({ ...row, coverage: "required" as const }));
    const result = evaluateCard7AuditReadiness(audit);
    assert.equal(result.ready, true);
    assert.equal(result.status, "complete");
    assert.equal(result.warnings.includes(CARD7_DEFERRED_COVERAGE_WARNING), false);
  });

  it("maps staff actions and filters federated rows without inventing department", () => {
    assert.equal(categoryCodeForStaffAction("pms_card7_audit_policy_updated", { section: "card7-audit" }), "setup");
    assert.equal(categoryCodeForStaffAction("role_changed", {}), "iam");
    const rows = [
      event({ id: "1", action: "role_changed", actorUserId: "user-1" }),
      event({ id: "2", action: "refund_posted", source: "folio_history", categoryCode: "cashiering", module: "cashiering" }),
    ];
    const filtered = filterFederatedEvents(rows, { source: "staff_audit", actorUserId: "user-1" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.departmentId, null);
  });
});

describe("Card 7 Audit ownership", () => {
  it("does not add writers for folio history, module access, or login", () => {
    const functions = readFileSync(new URL("./audit-card7.functions.ts", import.meta.url), "utf8");
    const tab = readFileSync(
      new URL("../components/settings/pms-card7-audit-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(functions, /from\("restaurant_staff_audit_log"\)\.insert/);
    assert.match(functions, /pms_audit_retention_posture/);
    assert.doesNotMatch(functions, /from\("folio_history"\)\.insert/);
    assert.doesNotMatch(functions, /from\("staff_module_access"\)/);
    assert.doesNotMatch(functions, /signInWithPassword|signOut/);
    assert.doesNotMatch(functions, /CREATE OR REPLACE FUNCTION public\.has_restaurant_role/);
    assert.doesNotMatch(tab, /from\("folio_history"\)\.insert/);
    const overall = evaluateCard7Overall(
      { ready: true, status: "complete", blockers: [], warnings: [] },
      { ready: true, status: "complete", blockers: [], warnings: [] },
    );
    assert.equal(overall.ready, false);
    assert.equal(overall.status, "in_progress");
    assert.match(overall.blockers.join(" "), /Not configured in this phase/);
  });
});

describe("Card 7 combined validation still accepts a security-only snapshot", () => {
  it("treats missing audit as FAIL", () => {
    const report = buildCard7ValidationReport({
      ...emptySecuritySnapshot(),
      roles: [emptyHotelRoleDraft({ id: "role-1", code: "FO", name: "Front office" })],
    });
    assert.equal(report.audit.verdict, "FAIL");
    assert.equal(report.overall.verdict, "PARTIAL");
  });
});
