/**
 * Card 7 Phase 3 — Reports & Analytics setup (pure helpers).
 * Configuration only: live queries, authz and scheduling remain elsewhere.
 */
import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD7_REPORTS_UNAVAILABLE =
  "Reports setup is unavailable until migration 0087 is applied.";
export const CARD7_REPORTS_SETUP_ONLY =
  "Report permissions and defaults are setup only. Live report authorization and execution are unchanged.";
export const CARD7_REPORTS_NO_SCHEDULER =
  "Schedule settings are defaults only; Card 7 does not run or email reports.";
export const CARD7_REPORTS_FISCAL_WARNING =
  "Fiscal-year reporting references Card 3 financial settings. Card 7 does not own fiscal dates.";
export const CARD7_REPORTS_AUDIT_SECTION = "card7-reports";
export const CARD7_REPORTS_CATALOGUE_AUDIT = "pms_card7_report_catalogue_updated";
export const CARD7_REPORTS_METRICS_AUDIT = "pms_card7_report_metrics_updated";
export const CARD7_REPORTS_PERMISSIONS_AUDIT = "pms_card7_report_permissions_updated";
export const CARD7_REPORTS_POLICY_AUDIT = "pms_card7_report_policy_updated";

export const CARD7_REQUIRED_REPORT_CODES = [
  "operational",
  "financial",
  "occupancy",
  "revenue",
  "management",
] as const;
export const CARD7_REQUIRED_METRIC_CODES = [
  "occupancy_range",
  "occupancy_in_house",
  "adr",
  "revpar",
] as const;
export const CARD7_REPORT_PERIOD_BASES = ["business_date", "fiscal_year"] as const;
export type Card7ReportPeriodBasis = (typeof CARD7_REPORT_PERIOD_BASES)[number];
export const CARD7_REPORT_CADENCES = ["daily", "weekly", "monthly"] as const;
export type Card7ReportCadence = (typeof CARD7_REPORT_CADENCES)[number];
export const CARD7_METRIC_UNITS = ["percent", "amount", "count"] as const;
export type Card7MetricUnit = (typeof CARD7_METRIC_UNITS)[number];

export type Card7ReportCategory = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
};

export type Card7ReportDefinition = {
  id: string;
  code: string;
  categoryId: string;
  name: string;
  description: string;
  queryKey: string;
  active: boolean;
};

export type Card7ReportDefinitionSetting = {
  id: string;
  definitionId: string;
  enabled: boolean;
};

export type Card7MetricDefinition = {
  id: string;
  code: string;
  name: string;
  description: string;
  formulaNotes: string;
  unit: Card7MetricUnit;
  queryKey: string;
  active: boolean;
};

export type Card7MetricSetting = {
  id: string;
  metricId: string;
  enabled: boolean;
  displayName: string;
};

export type Card7ReportPermission = {
  id: string;
  code: string;
  name: string;
  action: string;
  active: boolean;
};

export type Card7ReportPermissionMapping = {
  id: string;
  definitionId: string;
  permissionId: string;
};

export type Card7ReportPolicy = {
  exists: boolean;
  exportAllowed: boolean;
  exportCsv: boolean;
  exportPdf: boolean;
  maskGuestNames: boolean;
  ownerManagerExportOnly: boolean;
  defaultDateRangeDays: number;
  scheduleIntentEnabled: boolean;
  scheduleCadence: Card7ReportCadence | null;
  periodBasis: Card7ReportPeriodBasis;
  active: boolean;
};

export type Card7FiscalReference = {
  saved: boolean;
  startMonth: number;
  startDay: number;
};

export type Card7ReportsSnapshot = {
  categories: Card7ReportCategory[];
  definitions: Card7ReportDefinition[];
  definitionSettings: Card7ReportDefinitionSetting[];
  metrics: Card7MetricDefinition[];
  metricSettings: Card7MetricSetting[];
  permissions: Card7ReportPermission[];
  permissionMappings: Card7ReportPermissionMapping[];
  policy: Card7ReportPolicy;
  fiscalReference: Card7FiscalReference;
};

export type Card7ReportsReadiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export function parseMetricUnit(value: unknown): Card7MetricUnit {
  return (CARD7_METRIC_UNITS as readonly string[]).includes(String(value))
    ? (value as Card7MetricUnit)
    : "count";
}

export function parseReportPeriodBasis(value: unknown): Card7ReportPeriodBasis {
  return (CARD7_REPORT_PERIOD_BASES as readonly string[]).includes(String(value))
    ? (value as Card7ReportPeriodBasis)
    : "business_date";
}

export function parseReportCadence(value: unknown): Card7ReportCadence | null {
  if (value == null || value === "") return null;
  return (CARD7_REPORT_CADENCES as readonly string[]).includes(String(value))
    ? (value as Card7ReportCadence)
    : null;
}

export function emptyReportPolicy(partial?: Partial<Card7ReportPolicy>): Card7ReportPolicy {
  return {
    exists: partial?.exists === true,
    exportAllowed: partial?.exportAllowed === true,
    exportCsv: partial?.exportCsv === true,
    exportPdf: partial?.exportPdf === true,
    maskGuestNames: partial?.maskGuestNames !== false,
    ownerManagerExportOnly: partial?.ownerManagerExportOnly !== false,
    defaultDateRangeDays: partial?.defaultDateRangeDays ?? 30,
    scheduleIntentEnabled: partial?.scheduleIntentEnabled === true,
    scheduleCadence: partial?.scheduleCadence ?? null,
    periodBasis: partial?.periodBasis ?? "business_date",
    active: partial?.active !== false,
  };
}

export function emptyReportsSnapshot(
  partial?: Partial<Card7ReportsSnapshot>,
): Card7ReportsSnapshot {
  return {
    categories: partial?.categories ?? [],
    definitions: partial?.definitions ?? [],
    definitionSettings: partial?.definitionSettings ?? [],
    metrics: partial?.metrics ?? [],
    metricSettings: partial?.metricSettings ?? [],
    permissions: partial?.permissions ?? [],
    permissionMappings: partial?.permissionMappings ?? [],
    policy: partial?.policy ?? emptyReportPolicy(),
    fiscalReference: partial?.fiscalReference ?? {
      saved: false,
      startMonth: 1,
      startDay: 1,
    },
  };
}

export function reportSettingFor(
  snapshot: Card7ReportsSnapshot,
  definitionId: string,
): Card7ReportDefinitionSetting | null {
  return snapshot.definitionSettings.find((row) => row.definitionId === definitionId) ?? null;
}

export function metricSettingFor(
  snapshot: Card7ReportsSnapshot,
  metricId: string,
): Card7MetricSetting | null {
  return snapshot.metricSettings.find((row) => row.metricId === metricId) ?? null;
}

export function reportsWorkStarted(snapshot: Card7ReportsSnapshot): boolean {
  return (
    snapshot.policy.exists ||
    snapshot.definitionSettings.length > 0 ||
    snapshot.metricSettings.length > 0 ||
    snapshot.permissionMappings.length > 0
  );
}

export function reportPolicyValid(policy: Card7ReportPolicy): boolean {
  if (!policy.exists) return false;
  if (
    !Number.isInteger(policy.defaultDateRangeDays) ||
    policy.defaultDateRangeDays < 1 ||
    policy.defaultDateRangeDays > 365
  ) {
    return false;
  }
  if (policy.exportAllowed && !policy.exportCsv && !policy.exportPdf) return false;
  if (policy.scheduleIntentEnabled && !policy.scheduleCadence) return false;
  return true;
}

export function evaluateCard7ReportsReadiness(
  snapshot: Card7ReportsSnapshot,
): Card7ReportsReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [CARD7_REPORTS_SETUP_ONLY, CARD7_REPORTS_NO_SCHEDULER];
  const activeDefinitions = snapshot.definitions.filter((row) => row.active);
  const activeMetrics = snapshot.metrics.filter((row) => row.active);
  const settingByDefinition = new Map(
    snapshot.definitionSettings.map((row) => [row.definitionId, row]),
  );
  const metricSettingById = new Map(snapshot.metricSettings.map((row) => [row.metricId, row]));
  const permissionIds = new Set(snapshot.permissions.filter((row) => row.active).map((row) => row.id));
  const requiredDefinitions = new Set<string>(CARD7_REQUIRED_REPORT_CODES);
  const requiredMetrics = new Set<string>(CARD7_REQUIRED_METRIC_CODES);

  for (const code of CARD7_REQUIRED_REPORT_CODES) {
    if (!activeDefinitions.some((row) => row.code === code)) {
      blockers.push(`Required report definition ${code} is missing.`);
    }
  }
  for (const definition of activeDefinitions) {
    const setting = settingByDefinition.get(definition.id);
    if (!setting) {
      blockers.push(`Configure report definition ${definition.code}.`);
    } else if (requiredDefinitions.has(definition.code) && !setting.enabled) {
      blockers.push(`Required report definition ${definition.code} must be enabled.`);
    }
    if (!definition.queryKey.trim()) {
      blockers.push(`${definition.code} has no Reports-module query key.`);
    }
  }

  const metricCodes = new Set<string>();
  for (const metric of activeMetrics) {
    if (metricCodes.has(metric.code)) blockers.push(`Metric code ${metric.code} is duplicated.`);
    metricCodes.add(metric.code);
    if (!metric.queryKey.trim() || !metric.formulaNotes.trim()) {
      blockers.push(`${metric.code} needs a canonical query key and formula definition.`);
    }
    const setting = metricSettingById.get(metric.id);
    if (!setting) blockers.push(`Configure metric ${metric.code}.`);
  }
  for (const code of requiredMetrics) {
    if (!metricCodes.has(code)) blockers.push(`Required metric ${code} is missing.`);
  }

  for (const definition of activeDefinitions.filter(
    (row) => settingByDefinition.get(row.id)?.enabled,
  )) {
    const validMappings = snapshot.permissionMappings.filter(
      (row) => row.definitionId === definition.id && permissionIds.has(row.permissionId),
    );
    if (validMappings.length === 0) {
      blockers.push(`Map at least one report permission to ${definition.code}.`);
    }
  }
  if (snapshot.permissionMappings.some((row) => !permissionIds.has(row.permissionId))) {
    blockers.push("A report permission mapping references an inactive or unknown permission.");
  }

  if (!reportPolicyValid(snapshot.policy)) {
    blockers.push("Save valid export, filter, schedule and period defaults.");
  }
  if (snapshot.policy.periodBasis === "fiscal_year") {
    warnings.push(CARD7_REPORTS_FISCAL_WARNING);
    if (!snapshot.fiscalReference.saved) {
      warnings.push("Card 3 fiscal-year settings are not saved; fiscal reporting remains a reference only.");
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  return {
    ready: uniqueBlockers.length === 0,
    status:
      uniqueBlockers.length === 0
        ? "complete"
        : reportsWorkStarted(snapshot)
          ? "in_progress"
          : "not_started",
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
  };
}
