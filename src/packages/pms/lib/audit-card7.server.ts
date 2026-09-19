/**
 * Card 7 Phase 2 — Audit setup (pure helpers).
 * Policy / matrix / coverage / federated read model only.
 * Does not invent an event log, login engine, or live authz.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD7_AUDIT_AUDIT = "pms_card7_audit_policy_updated";
export const CARD7_AUDIT_CATEGORY_AUDIT = "pms_card7_audit_categories_updated";
export const CARD7_AUDIT_COVERAGE_AUDIT = "pms_card7_audit_coverage_updated";
export const CARD7_AUDIT_AUDIT_SECTION = "card7-audit";
export const CARD7_AUDIT_UNAVAILABLE =
  "Audit setup is unavailable until migration 0086 is applied.";
export const CARD7_AUDIT_NO_PURGE_COPY =
  "Retention is configuration only. Existing logs are not purged.";
export const CARD7_AUDIT_NO_ENFORCEMENT_COPY =
  "Masking, export restriction, severity and coverage are setup flags. They do not change live writers or authorization.";
export const CARD7_AUDIT_VIEWER_GATE_COPY =
  "The federated event viewer is owner/manager only, matching staff-audit RLS. Members can read setup policy.";
export const CARD7_DEFERRED_COVERAGE_WARNING =
  "Deferred sensitive coverage means operational writers are incomplete (module access, live activate, unused folio_history). Do not treat Audit as a complete product.";
export const CARD7_AUDIT_VIEWER_LIMITATIONS = [
  "No login, logout, failed-login, IP, device or session rows.",
  "Department is not stored on events, so that filter is not applied.",
  "Severity is derived from the category matrix, not stored on source rows.",
  "folio_history is federated but often empty because recordFolioEvent is unused.",
  "Housekeeping history is operational and is not a Card 7 category.",
] as const;

export const CARD7_AUDIT_SEVERITIES = ["info", "warning", "critical"] as const;
export type Card7AuditSeverity = (typeof CARD7_AUDIT_SEVERITIES)[number];

export const CARD7_AUDIT_COVERAGE_VALUES = ["required", "deferred", "noted"] as const;
export type Card7AuditCoverageValue = (typeof CARD7_AUDIT_COVERAGE_VALUES)[number];

export const CARD7_REQUIRED_AUDIT_CATEGORY_CODES = [
  "iam",
  "guest_privacy",
  "cashiering",
  "night_audit",
] as const;

export const CARD7_AUDIT_EVENT_SOURCES = [
  "staff_audit",
  "reservation_history",
  "guest_history",
  "folio_history",
  "night_audit",
  "housekeeping",
  "distribution",
] as const;
export type Card7AuditEventSource = (typeof CARD7_AUDIT_EVENT_SOURCES)[number];

export type Card7AuditCategory = {
  id: string;
  code: string;
  name: string;
  description: string;
  defaultSeverity: Card7AuditSeverity;
  active: boolean;
};

export type Card7AuditCategorySetting = {
  id: string;
  categoryId: string;
  enabled: boolean;
  severity: Card7AuditSeverity | null;
  critical: boolean;
};

export type Card7AuditCoverageRow = {
  id: string;
  permissionId: string;
  coverage: Card7AuditCoverageValue;
  notes: string;
};

export type Card7AuditPolicy = {
  exists: boolean;
  enabled: boolean;
  retentionDays: number | null;
  maskIdNumbers: boolean;
  restrictGuestExport: boolean;
  active: boolean;
};

export type Card7AuditSensitivePermission = {
  id: string;
  code: string;
  name: string;
  module: string;
  active: boolean;
};

export type Card7AuditSnapshot = {
  policy: Card7AuditPolicy;
  categories: Card7AuditCategory[];
  categorySettings: Card7AuditCategorySetting[];
  coverage: Card7AuditCoverageRow[];
  sensitivePermissions: Card7AuditSensitivePermission[];
};

export type Card7AuditReadiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export type Card7AuditEvent = {
  id: string;
  source: Card7AuditEventSource;
  createdAt: string;
  action: string;
  categoryCode: string | null;
  module: string;
  actorUserId: string | null;
  actorName: string;
  departmentId: string | null;
  severity: Card7AuditSeverity | null;
  metadata: Record<string, unknown> | null;
  previousValues: unknown;
  newValues: unknown;
  notes: string | null;
  limitations: string[];
};

export function parseAuditSeverity(value: unknown): Card7AuditSeverity {
  return (CARD7_AUDIT_SEVERITIES as readonly string[]).includes(String(value))
    ? (value as Card7AuditSeverity)
    : "info";
}

export function parseAuditSeverityOverride(value: unknown): Card7AuditSeverity | null {
  if (value == null || value === "") return null;
  return (CARD7_AUDIT_SEVERITIES as readonly string[]).includes(String(value))
    ? (value as Card7AuditSeverity)
    : null;
}

export function parseAuditCoverage(value: unknown): Card7AuditCoverageValue {
  return (CARD7_AUDIT_COVERAGE_VALUES as readonly string[]).includes(String(value))
    ? (value as Card7AuditCoverageValue)
    : "required";
}

export function emptyAuditPolicy(partial?: Partial<Card7AuditPolicy>): Card7AuditPolicy {
  return {
    exists: partial?.exists === true,
    enabled: partial?.enabled === true,
    retentionDays: partial?.retentionDays ?? null,
    maskIdNumbers: partial?.maskIdNumbers !== false,
    restrictGuestExport: partial?.restrictGuestExport === true,
    active: partial?.active !== false,
  };
}

export function emptyAuditSnapshot(partial?: Partial<Card7AuditSnapshot>): Card7AuditSnapshot {
  return {
    policy: partial?.policy ?? emptyAuditPolicy(),
    categories: partial?.categories ?? [],
    categorySettings: partial?.categorySettings ?? [],
    coverage: partial?.coverage ?? [],
    sensitivePermissions: partial?.sensitivePermissions ?? [],
  };
}

export function retentionDaysValid(value: number | null): boolean {
  return value != null && Number.isInteger(value) && value >= 1 && value <= 3650;
}

export function settingForCategory(
  snapshot: Card7AuditSnapshot,
  categoryId: string,
): Card7AuditCategorySetting | null {
  return snapshot.categorySettings.find((row) => row.categoryId === categoryId) ?? null;
}

export function coverageForPermission(
  snapshot: Card7AuditSnapshot,
  permissionId: string,
): Card7AuditCoverageRow | null {
  return snapshot.coverage.find((row) => row.permissionId === permissionId) ?? null;
}

export function resolvedCategorySeverity(
  category: Card7AuditCategory,
  setting: Card7AuditCategorySetting | null,
): Card7AuditSeverity {
  return setting?.severity ?? category.defaultSeverity;
}

export function auditWorkStarted(snapshot: Card7AuditSnapshot): boolean {
  if (snapshot.policy.enabled) return true;
  if (snapshot.policy.retentionDays != null) return true;
  if (snapshot.categorySettings.length > 0) return true;
  if (snapshot.coverage.length > 0) return true;
  return false;
}

export function evaluateCard7AuditReadiness(snapshot: Card7AuditSnapshot): Card7AuditReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [
    CARD7_AUDIT_NO_PURGE_COPY,
    CARD7_AUDIT_NO_ENFORCEMENT_COPY,
    CARD7_AUDIT_VIEWER_GATE_COPY,
    ...CARD7_AUDIT_VIEWER_LIMITATIONS,
  ];
  const activeCategories = snapshot.categories.filter((row) => row.active);
  const settingsByCategory = new Map(snapshot.categorySettings.map((row) => [row.categoryId, row]));
  const coverageByPermission = new Map(snapshot.coverage.map((row) => [row.permissionId, row]));
  const sensitive = snapshot.sensitivePermissions.filter((row) => row.active);
  const requiredCodes = new Set<string>(CARD7_REQUIRED_AUDIT_CATEGORY_CODES);

  if (!snapshot.policy.exists) {
    blockers.push("Save an audit policy for this property.");
  }

  if (!retentionDaysValid(snapshot.policy.retentionDays)) {
    blockers.push("Set retention days between 1 and 3650.");
  }

  if (activeCategories.length === 0) {
    blockers.push("Audit category catalogue is empty until 0086 is applied.");
  }

  for (const category of activeCategories) {
    const setting = settingsByCategory.get(category.id);
    if (!setting) {
      blockers.push(`Configure category ${category.code}.`);
      continue;
    }
    if (requiredCodes.has(category.code) && !setting.enabled) {
      blockers.push(`Required category ${category.code} must be enabled.`);
    }
  }

  if (sensitive.length === 0) {
    blockers.push("Sensitive permission catalogue is empty. Coverage cannot be completed.");
  }
  for (const permission of sensitive) {
    const row = coverageByPermission.get(permission.id);
    if (!row) {
      blockers.push(`Set coverage for ${permission.code}.`);
      continue;
    }
    if (!(CARD7_AUDIT_COVERAGE_VALUES as readonly string[]).includes(row.coverage)) {
      blockers.push(`${permission.code} has invalid coverage.`);
    }
  }

  if (snapshot.coverage.some((row) => row.coverage === "deferred")) {
    warnings.push(CARD7_DEFERRED_COVERAGE_WARNING);
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  const setupReady = uniqueBlockers.length === 0;
  const deferred = snapshot.coverage.some((row) => row.coverage === "deferred");
  const status: PropertySetupCardStatus = !setupReady
    ? auditWorkStarted(snapshot)
      ? "in_progress"
      : "not_started"
    : deferred
      ? "in_progress"
      : "complete";
  return {
    ready: setupReady,
    status,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
  };
}

export function categoryCodeForStaffAction(
  action: string,
  metadata: Record<string, unknown> | null,
): string {
  const section = String(metadata?.section ?? "");
  if (
    section.includes("card7") ||
    action.startsWith("pms_card7") ||
    action.startsWith("pms_set") ||
    section.includes("security-audit")
  ) {
    return "setup";
  }
  if (
    action.includes("role") ||
    action.includes("staff") ||
    action.includes("membership") ||
    action.includes("deactivat") ||
    action.includes("reactivat")
  ) {
    return "iam";
  }
  return "setup";
}

export function deriveEventSeverity(
  categoryCode: string | null,
  snapshot: Card7AuditSnapshot,
): Card7AuditSeverity | null {
  if (!categoryCode) return null;
  const category = snapshot.categories.find((row) => row.code === categoryCode);
  if (!category) return null;
  const setting = settingForCategory(snapshot, category.id);
  return resolvedCategorySeverity(category, setting);
}

export function filterFederatedEvents(
  events: Card7AuditEvent[],
  filters: {
    query?: string;
    source?: Card7AuditEventSource | "all";
    categoryCode?: string | "all";
    action?: string;
    actorUserId?: string | "all";
    severity?: Card7AuditSeverity | "all";
  },
): Card7AuditEvent[] {
  const query = (filters.query ?? "").trim().toLowerCase();
  const action = (filters.action ?? "").trim().toLowerCase();
  return events.filter((row) => {
    if (filters.source && filters.source !== "all" && row.source !== filters.source) return false;
    if (filters.categoryCode && filters.categoryCode !== "all" && row.categoryCode !== filters.categoryCode) {
      return false;
    }
    if (filters.severity && filters.severity !== "all" && row.severity !== filters.severity) return false;
    if (filters.actorUserId && filters.actorUserId !== "all" && row.actorUserId !== filters.actorUserId) {
      return false;
    }
    if (action && !row.action.toLowerCase().includes(action)) return false;
    if (!query) return true;
    return `${row.action} ${row.module} ${row.actorName} ${row.categoryCode ?? ""} ${row.notes ?? ""}`
      .toLowerCase()
      .includes(query);
  });
}
