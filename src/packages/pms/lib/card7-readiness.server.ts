/**
 * Card 7 overall readiness. Phase 5 completes the card when all four domains are ready.
 * Validate is read-only. Programme status writes happen on domain saves only.
 */
import {
  evaluateCard7SecurityReadiness,
  emptySecuritySnapshot,
  type Card7SecurityReadiness,
  type Card7SecuritySnapshot,
} from "./security-roles-card7.server.ts";
import {
  emptyAuditSnapshot,
  evaluateCard7AuditReadiness,
  type Card7AuditSnapshot,
} from "./audit-card7.server.ts";
import {
  emptyReportsSnapshot,
  evaluateCard7ReportsReadiness,
  type Card7ReportsSnapshot,
} from "./reports-card7.server.ts";
import {
  CARD7_IMPORT_HANDLER_KEYS,
  CARD7_SUPPORTED_IMPORT_CODES,
  emptyImportSnapshot,
  evaluateCard7ImportReadiness,
  type Card7ImportSnapshot,
} from "./import-card7.server.ts";
import {
  parsePropertySetupStatus,
  type PropertySetupCardStatus,
  type PropertySetupStatus,
} from "./pms-property-setup-card1.ts";
import { CARD7_PROGRAMME_CARD_ID } from "./pms-property-setup-card7.ts";

export { CARD7_PROGRAMME_CARD_ID } from "./pms-property-setup-card7.ts";
export { card7FinishActivatesProperty } from "./pms-property-setup-card7.ts";

export type Card7Verdict = "PASS" | "PARTIAL" | "FAIL";

export type Card7ReadinessSlice = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export type Card7DomainReport = Card7ReadinessSlice & {
  verdict: Card7Verdict;
};

export type Card7ValidationSnapshot = {
  security: Card7SecuritySnapshot;
  audit: Card7AuditSnapshot;
  reports?: Card7ReportsSnapshot;
  importDomain?: Card7ImportSnapshot;
};

export type Card7ValidationReport = {
  security: Card7DomainReport;
  audit: Card7DomainReport;
  reports: Card7DomainReport;
  importDomain: Card7DomainReport;
  integrity: Card7DomainReport;
  overall: Card7DomainReport;
};

export function card7Verdict(status: PropertySetupCardStatus): Card7Verdict {
  if (status === "complete") return "PASS";
  if (status === "in_progress") return "PARTIAL";
  return "FAIL";
}

export function withCard7Verdict(slice: Card7ReadinessSlice): Card7DomainReport {
  return { ...slice, verdict: card7Verdict(slice.status) };
}

export const CARD7_LATER_TAB_BLOCKER = "Not configured in this phase.";
export const CARD7_OVERALL_INCOMPLETE_WARNING =
  "Card 7 is in progress until Security, Audit, Reports and Data Import are all ready.";
export const CARD7_INTEGRITY_COPY =
  "Card 7 is setup/governance only. Live authz, report execution, scheduling and import running stay in their domain modules.";
export const CARD7_REPORT_QUERY_KEYS = [
  "getBookingsDashboard",
  "getHousekeepingDashboard",
  "getCashieringDashboard",
  "getRevenueOverview",
  "listNightAuditRuns",
] as const;

export function laterCard7TabSlice(): Card7ReadinessSlice {
  return {
    ready: false,
    status: "not_started",
    blockers: [CARD7_LATER_TAB_BLOCKER],
    warnings: [],
  };
}

export function evaluateCard7Integrity(
  reports: Card7ReportsSnapshot,
  importDomain: Card7ImportSnapshot,
): Card7ReadinessSlice {
  const blockers: string[] = [];
  const warnings: string[] = [CARD7_INTEGRITY_COPY];
  const allowedQueries = new Set<string>(CARD7_REPORT_QUERY_KEYS);
  const allowedImportCodes = new Set<string>(CARD7_SUPPORTED_IMPORT_CODES);
  const allowedHandlers = new Set<string>(CARD7_IMPORT_HANDLER_KEYS);

  for (const definition of reports.definitions) {
    if (definition.queryKey && !allowedQueries.has(definition.queryKey)) {
      blockers.push(`Report ${definition.code} uses an unsupported query key.`);
    }
  }
  for (const metric of reports.metrics) {
    if (metric.queryKey && !allowedQueries.has(metric.queryKey)) {
      blockers.push(`Metric ${metric.code} uses an unsupported query key.`);
    }
  }
  for (const type of importDomain.types) {
    if (!allowedImportCodes.has(type.code)) {
      blockers.push(`Import type ${type.code} is not a supported Card 7 handler.`);
    }
    if (type.handlerKey && !allowedHandlers.has(type.handlerKey)) {
      blockers.push(`Import type ${type.code} must not invent a generic writer.`);
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    ready: uniqueBlockers.length === 0,
    status: uniqueBlockers.length === 0 ? "complete" : "in_progress",
    blockers: uniqueBlockers,
    warnings: [...new Set(warnings)],
  };
}

export function evaluateCard7Overall(
  security: Card7SecurityReadiness,
  audit: Card7ReadinessSlice = laterCard7TabSlice(),
  reports: Card7ReadinessSlice = laterCard7TabSlice(),
  importDomain: Card7ReadinessSlice = laterCard7TabSlice(),
): Card7ReadinessSlice {
  const domains = [security, audit, reports, importDomain];
  const blockers = [...new Set(domains.flatMap((row) => row.blockers))];
  const warnings = [...new Set(domains.flatMap((row) => row.warnings))];
  if (domains.every((row) => row.ready)) {
    return {
      ready: true,
      status: "complete",
      blockers,
      warnings,
    };
  }
  if (domains.every((row) => row.status === "not_started" && !row.ready)) {
    return {
      ready: false,
      status: "not_started",
      blockers,
      warnings,
    };
  }
  return {
    ready: false,
    status: "in_progress",
    blockers,
    warnings: warnings.length > 0 ? warnings : [CARD7_OVERALL_INCOMPLETE_WARNING],
  };
}

export function buildCard7ValidationReport(
  snapshot: Card7SecuritySnapshot | Card7ValidationSnapshot,
  auditSnapshot?: Card7AuditSnapshot,
  reportsSnapshot?: Card7ReportsSnapshot,
  importSnapshot?: Card7ImportSnapshot,
): Card7ValidationReport {
  const securitySnapshot = "roles" in snapshot ? snapshot : snapshot.security;
  const auditData =
    "roles" in snapshot ? (auditSnapshot ?? emptyAuditSnapshot()) : snapshot.audit;
  const reportsData =
    "roles" in snapshot
      ? (reportsSnapshot ?? emptyReportsSnapshot())
      : (snapshot.reports ?? emptyReportsSnapshot());
  const importData =
    "roles" in snapshot
      ? (importSnapshot ?? emptyImportSnapshot())
      : (snapshot.importDomain ?? emptyImportSnapshot());
  const security = evaluateCard7SecurityReadiness(securitySnapshot);
  const audit = evaluateCard7AuditReadiness(auditData);
  const reports = evaluateCard7ReportsReadiness(reportsData);
  const importDomain = evaluateCard7ImportReadiness(importData);
  const integrity = evaluateCard7Integrity(reportsData, importData);
  let overall = evaluateCard7Overall(security, audit, reports, importDomain);
  if (!integrity.ready) {
    overall = {
      ready: false,
      status: "in_progress",
      blockers: [...new Set([...overall.blockers, ...integrity.blockers])],
      warnings: overall.warnings,
    };
  }
  return {
    security: withCard7Verdict(security),
    audit: withCard7Verdict(audit),
    reports: withCard7Verdict(reports),
    importDomain: withCard7Verdict(importDomain),
    integrity: withCard7Verdict(integrity),
    overall: withCard7Verdict(overall),
  };
}

export function mergeCard7Status(stored: unknown, overall: Card7ReadinessSlice): PropertySetupStatus {
  const parsed = parsePropertySetupStatus(stored);
  return {
    ...parsed,
    cards: {
      ...parsed.cards,
      [CARD7_PROGRAMME_CARD_ID]: overall.status,
    },
  };
}

export function emptyCard7ValidationReport(): Card7ValidationReport {
  return buildCard7ValidationReport({
    security: emptySecuritySnapshot(),
    audit: emptyAuditSnapshot(),
    reports: emptyReportsSnapshot(),
    importDomain: emptyImportSnapshot(),
  });
}
