/**
 * Card 5 overall readiness. Domain evaluators stay the source of truth.
 * Card 5 complete does not Activate the property.
 */
import { evaluateCard5DepartmentsReadiness, type Card5DepartmentsSnapshot } from "./departments-card5.server.ts";
import { evaluateCard5FacilitiesReadiness, type Card5FacilitiesSnapshot } from "./outlets-card5.server.ts";
import { evaluateCard5SalesReadiness, type Card5SalesSnapshot } from "./sales-events-card5.server.ts";
import {
  parsePropertySetupStatus,
  type PropertySetupCardStatus,
  type PropertySetupStatus,
} from "./pms-property-setup-card1.ts";
import { CARD5_PROGRAMME_CARD_ID } from "./pms-property-setup-card5.ts";

export { CARD5_PROGRAMME_CARD_ID } from "./pms-property-setup-card5.ts";
export { card5FinishActivatesProperty } from "./pms-property-setup-card5.ts";

export type Card5Verdict = "PASS" | "PARTIAL" | "FAIL";

export type Card5ReadinessSlice = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export type Card5DomainReport = Card5ReadinessSlice & {
  verdict: Card5Verdict;
};

export type Card5ValidationReport = {
  departments: Card5DomainReport;
  facilities: Card5DomainReport;
  sales: Card5DomainReport;
  integrity: Card5DomainReport;
  overall: Card5DomainReport;
};

export function card5Verdict(status: PropertySetupCardStatus): Card5Verdict {
  if (status === "complete") return "PASS";
  if (status === "in_progress") return "PARTIAL";
  return "FAIL";
}

export function withCard5Verdict(slice: Card5ReadinessSlice): Card5DomainReport {
  return { ...slice, verdict: card5Verdict(slice.status) };
}

export function withCard5IntegrityVerdict(slice: Card5ReadinessSlice): Card5DomainReport {
  return {
    ...slice,
    verdict: slice.blockers.length === 0 ? "PASS" : "FAIL",
  };
}

export function evaluateCard5Integrity(
  departments: Card5DepartmentsSnapshot,
  facilities: Card5FacilitiesSnapshot,
  sales: Card5SalesSnapshot,
): Card5ReadinessSlice {
  const blockers: string[] = [];
  const departmentIds = new Set(departments.departments.map((row) => row.id));
  const facilityIds = new Set(facilities.facilities.map((row) => row.id));

  for (const row of facilities.facilities) {
    if (row.departmentId && !departmentIds.has(row.departmentId)) {
      blockers.push(`${row.name || row.code || "A facility"} department is not a Card 5 department.`);
    }
  }

  for (const row of sales.functionSpaces) {
    for (const outletId of row.outletIds) {
      if (!facilityIds.has(outletId)) {
        blockers.push(`${row.name} is mapped to a facility that is not in Card 5.`);
      }
    }
  }

  for (const row of sales.packageTemplates) {
    for (const outletId of row.outletIds) {
      if (!facilityIds.has(outletId)) {
        blockers.push(`${row.name} package is mapped to a facility that is not in Card 5.`);
      }
    }
  }

  const unique = [...new Set(blockers)];
  return {
    ready: unique.length === 0,
    status: unique.length === 0 ? "complete" : "in_progress",
    blockers: unique,
    warnings: [],
  };
}

export function evaluateCard5Overall(input: {
  departments: Card5ReadinessSlice;
  facilities: Card5ReadinessSlice;
  sales: Card5ReadinessSlice;
  integrity: Card5ReadinessSlice;
}): Card5ReadinessSlice {
  const statuses = [input.departments.status, input.facilities.status, input.sales.status];
  const blockers = [
    ...input.departments.blockers,
    ...input.facilities.blockers,
    ...input.sales.blockers,
    ...input.integrity.blockers,
  ];
  const warnings = [
    ...input.departments.warnings,
    ...input.facilities.warnings,
    ...input.sales.warnings,
    ...input.integrity.warnings,
  ];
  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  if (statuses.every((status) => status === "complete") && input.integrity.blockers.length === 0) {
    return {
      ready: true,
      status: "complete",
      blockers: uniqueBlockers,
      warnings: uniqueWarnings,
    };
  }
  if (statuses.every((status) => status === "not_started")) {
    return {
      ready: false,
      status: "not_started",
      blockers: uniqueBlockers,
      warnings: uniqueWarnings,
    };
  }
  return {
    ready: false,
    status: "in_progress",
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
  };
}

export function buildCard5ValidationReport(
  departments: Card5DepartmentsSnapshot,
  facilities: Card5FacilitiesSnapshot,
  sales: Card5SalesSnapshot,
): Card5ValidationReport {
  const departmentSlice = evaluateCard5DepartmentsReadiness(departments);
  const facilitySlice = evaluateCard5FacilitiesReadiness(facilities);
  const salesSlice = evaluateCard5SalesReadiness(sales);
  const integritySlice = evaluateCard5Integrity(departments, facilities, sales);
  const overallSlice = evaluateCard5Overall({
    departments: departmentSlice,
    facilities: facilitySlice,
    sales: salesSlice,
    integrity: integritySlice,
  });
  return {
    departments: withCard5Verdict(departmentSlice),
    facilities: withCard5Verdict(facilitySlice),
    sales: withCard5Verdict(salesSlice),
    integrity: withCard5IntegrityVerdict(integritySlice),
    overall: withCard5Verdict(overallSlice),
  };
}

export function mergeCard5Status(stored: unknown, overall: Card5ReadinessSlice): PropertySetupStatus {
  const parsed = parsePropertySetupStatus(stored);
  return {
    ...parsed,
    cards: {
      ...parsed.cards,
      [CARD5_PROGRAMME_CARD_ID]: overall.status,
    },
  };
}
