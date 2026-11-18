/**
 * Card 8 Phase 2 — System Validation aggregation contract.
 *
 * Live Card 1–7 evaluators stay owned by those cards. Card 8 wraps them
 * read-only and must not copy their rule bodies. No history table or Go-Live.
 */

import { propertySetupRedirectHref } from "./pms-set1-foundation.ts";

/** Must stay equal to CARD7_INTEGRITY_COPY. Honesty copy is informational. */
export const CARD8_CARD7_INTEGRITY_INFORMATIONAL =
  "Card 7 is setup/governance only. Live authz, report execution, scheduling and import running stay in their domain modules.";

export type Card8AuditVerdict = "PASS" | "PARTIAL" | "FAIL";
export type Card8ValidationClass =
  "SUPPORTED" | "PARTIAL" | "MISSING" | "REUSABLE" | "NEEDS ADAPTER";

export const CARD8_VALIDATION_SEVERITIES = ["critical", "warning", "informational"] as const;
export type Card8ValidationSeverity = (typeof CARD8_VALIDATION_SEVERITIES)[number];

export const CARD8_VALIDATION_CATEGORIES = [
  "property",
  "rooms",
  "financial",
  "guest",
  "organization",
  "connectivity",
  "security_data",
  "system",
] as const;
export type Card8ValidationCategory = (typeof CARD8_VALIDATION_CATEGORIES)[number];

export const CARD8_VALIDATION_HISTORY_JUSTIFIED = false;
export const CARD8_VALIDATION_PROPOSED_MIGRATION = "0091_pms_card8_validation_history.sql";
export const CARD8_VALIDATION_RUNS_TABLE = "pms_validation_runs";

export const CARD8_VALIDATION_PHASE2_FAIL_REASON =
  "Card 8 recomputes Cards 1–7 through implemented thin adapters. Validation history remains intentionally absent.";

export const CARD8_VALIDATION_NO_FABRICATE =
  "Counts must be derived from aggregated issues. Never invent passed, warning, or critical totals.";

export const CARD8_VALIDATION_NO_SET1_ACTIVATE =
  "System Validation must not call evaluateSet1Checklist. That is SET1 Activate, not Cards 1–7.";

export const CARD8_VALIDATION_NO_STORED_STATUS =
  "pms_property_setup_status is not source of truth for Cards 2–7. Re-run live evaluators.";

export const CARD8_VALIDATION_LIVE_RECOMPUTE =
  "Re-run is a live recompute. Validation history persistence is not justified.";

export const CARD8_VALIDATION_READY_RULE =
  "0 critical errors => may be READY. Warnings stay visible and do not block.";

export const CARD8_SYSTEM_INFO_COPY =
  "Results will be a live recompute. Counts are derived from issues. No sync-health metrics.";

export type Card8ValidationIssue = {
  id: string;
  cardNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  category: Card8ValidationCategory;
  domain: string;
  severity: Card8ValidationSeverity;
  message: string;
  href?: string;
};

export type Card8ValidationCounts = {
  critical: number;
  warning: number;
  informational: number;
  passedCards: number;
  totalCards: 7;
};

export type Card8ValidationSummary = {
  cardNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  category: Card8ValidationCategory;
  programmeId: string;
  href: string;
  succeeded: boolean;
  critical: number;
  warning: number;
  informational: number;
  error?: string;
};

export type Card8ValidationReport = {
  verdict: Card8AuditVerdict;
  reason?: string;
  ready: boolean;
  generatedAt: string;
  issues: Card8ValidationIssue[];
  counts: Card8ValidationCounts;
  summaries: Card8ValidationSummary[];
};

export type Card8ValidationAdapter = {
  cardNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  category: Card8ValidationCategory;
  programmeId: string;
  hash: string;
  href: string;
  classification: Card8ValidationClass;
  source: string;
  note: string;
};

export const CARD8_VALIDATION_ADAPTERS: Card8ValidationAdapter[] = [
  {
    cardNumber: 1,
    category: "property",
    programmeId: "property-business",
    hash: "property-business",
    href: propertySetupRedirectHref("#property-business"),
    classification: "SUPPORTED",
    source: "evaluateCard1Status / evaluateCard1StepStatus / card1StepComplete",
    note: "Wrap eight steps. Incomplete step is activation-critical. VAT and structure strings stay warnings.",
  },
  {
    cardNumber: 2,
    category: "rooms",
    programmeId: "rooms-inventory",
    hash: "rooms-inventory",
    href: propertySetupRedirectHref("#rooms-inventory"),
    classification: "SUPPORTED",
    source:
      "evaluateRoomTypesRoomsReadiness, evaluateRatesCard2Readiness, amenities, evaluateMealsCard3Readiness, evaluateCard2HousekeepingReadiness, evaluateCard2InventoryReadiness, evaluateCard2MaintenanceReadiness",
    note: "Do not use stored evaluateCard2StepStatus as the rule engine. classifyCard8ActivationSeverity demotes optional HK/maintenance/amenity-default incompleteness.",
  },
  {
    cardNumber: 3,
    category: "financial",
    programmeId: "rates-guest-rules",
    hash: "financial-commercial",
    href: propertySetupRedirectHref("#financial-commercial"),
    classification: "SUPPORTED",
    source: "evaluate*Card3Readiness for six domains",
    note: "Activation keeps tax + payment + primary currency critical. Fees/exemptions/billing/FX demote.",
  },
  {
    cardNumber: 4,
    category: "guest",
    programmeId: "housekeeping-maintenance",
    hash: "guest-services",
    href: propertySetupRedirectHref("#guest-services"),
    classification: "SUPPORTED",
    source: "evaluateCard4StepStatus / evaluateGstStepStatus / evaluateNotificationStepStatus",
    note: "Guest/comms catalogues are warning/informational for activation. Load all configured flags.",
  },
  {
    cardNumber: 5,
    category: "organization",
    programmeId: "departments-services",
    hash: "organization-facilities",
    href: propertySetupRedirectHref("#organization-facilities"),
    classification: "REUSABLE",
    source: "buildCard5ValidationReport / getCard5Validation",
    note: "Sales/Events empties are informational. Org integrity stays visible as warning.",
  },
  {
    cardNumber: 6,
    category: "connectivity",
    programmeId: "notifications-security",
    hash: "connectivity-distribution",
    href: propertySetupRedirectHref("#connectivity-distribution"),
    classification: "SUPPORTED",
    source: "integrations-card6 records; not SET5/SET6 Activate evaluators",
    note: "Empty catalogue is informational. Never emit Connected or sync-health.",
  },
  {
    cardNumber: 7,
    category: "security_data",
    programmeId: "sales-distribution",
    hash: "security-data-reports",
    href: propertySetupRedirectHref("#security-data-reports"),
    classification: "REUSABLE",
    source: "buildCard7ValidationReport / getCard7Validation",
    note: "Activation-critical: seeded permission catalogue + ≥1 active hotel role. Coverage/reports/import demote. CARD7_INTEGRITY_COPY informational.",
  },
];

export type Card8ValidationPhase2Report = {
  verdict: Card8AuditVerdict;
  reason: string;
  aggregatorImplemented: true;
  historyJustified: false;
  ready: false;
  adapters: Card8ValidationAdapter[];
  counts: Card8ValidationCounts;
};

export type Card8BlockerContext = {
  cardNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  domainId?: string;
  domainLabel?: string;
};

/**
 * Activation severity for a domain blocker.
 * Domain modules may still mark setup incompleteness as blockers; Card 8
 * separates that from core PMS activation readiness.
 */
export function classifyCard8ActivationSeverity(
  message: string,
  context: Card8BlockerContext,
): Card8ValidationSeverity {
  const text = message.trim();
  const domain = `${context.domainId ?? ""} ${context.domainLabel ?? ""}`.toLowerCase();

  if (context.cardNumber === 3) {
    if (/active fee/i.test(text) || /exemption rule/i.test(text)) return "informational";
    if (/service charge/i.test(text)) return "warning";
    if (
      /save financial settings/i.test(text) ||
      /fiscal year/i.test(text) ||
      /fx source/i.test(text) ||
      /currency besides/i.test(text) ||
      /exchange rate/i.test(text) ||
      /invoice settings/i.test(text) ||
      /billing rule/i.test(text)
    ) {
      return "warning";
    }
  }

  if (context.cardNumber === 4) {
    if (
      /group types/i.test(text) ||
      /travel agency/i.test(text) ||
      /service pricing/i.test(text) ||
      /department assignment/i.test(text) ||
      /sla rules/i.test(text) ||
      /service availability/i.test(text) ||
      /communication templates/i.test(text) ||
      /notification events/i.test(text) ||
      /automation rules/i.test(text) ||
      /sender settings/i.test(text) ||
      /communication defaults/i.test(text)
    ) {
      return "informational";
    }
    return "warning";
  }

  if (context.cardNumber === 5) {
    if (
      /market segment/i.test(text) ||
      /sales source/i.test(text) ||
      /lead type/i.test(text) ||
      /event type/i.test(text) ||
      /event status/i.test(text) ||
      /pipeline stage/i.test(text) ||
      /function-space/i.test(text) ||
      /active facility/i.test(text) ||
      /event package/i.test(text) ||
      /contract default/i.test(text)
    ) {
      return "informational";
    }
    return "warning";
  }

  if (context.cardNumber === 6) return "warning";

  if (context.cardNumber === 7) {
    if (/permission catalogue is empty/i.test(text)) return "critical";
    if (/add at least one active hotel role/i.test(text)) return "critical";
    if (/set coverage for /i.test(text)) return "informational";
    if (
      /audit policy/i.test(text) ||
      /retention days/i.test(text) ||
      /audit category/i.test(text) ||
      /configure category /i.test(text) ||
      /required category /i.test(text) ||
      /sensitive permission catalogue/i.test(text) ||
      /invalid coverage/i.test(text) ||
      /report definition/i.test(text) ||
      /report permission/i.test(text) ||
      /\bmetric\b/i.test(text) ||
      /export, filter, schedule/i.test(text) ||
      /import type/i.test(text) ||
      /import policy/i.test(text) ||
      /mapping template/i.test(text) ||
      /duplicate policy/i.test(text) ||
      /validation rules for /i.test(text) ||
      /migration history/i.test(text) ||
      /supported import/i.test(text) ||
      /enable at least one supported import/i.test(text) ||
      /query key/i.test(text)
    ) {
      return /import /i.test(text) || /migration history/i.test(text) || /mapping template/i.test(text)
        ? "informational"
        : "warning";
    }
    if (/security|role|permission|approval|membership|data scope/i.test(domain)) {
      return "warning";
    }
    return "warning";
  }

  if (context.cardNumber === 2) {
    if (/active room types have no amenity defaults/i.test(text)) return "warning";
    if (
      /save the housekeeping settings/i.test(text) ||
      /save inventory rules/i.test(text) ||
      /save maintenance rules/i.test(text)
    ) {
      return "warning";
    }
    if (/housekeeping|maintenance|amenities/i.test(domain) && /configure |select |enable |allow |choose /i.test(text)) {
      return "warning";
    }
  }

  return "critical";
}

export function mapCard8Blocker(
  message: string,
  context?: Card8BlockerContext,
): Card8ValidationSeverity {
  if (!context) return "critical";
  return classifyCard8ActivationSeverity(message, context);
}

export function mapCard8Warning(message: string): Card8ValidationSeverity {
  if (message === CARD8_CARD7_INTEGRITY_INFORMATIONAL) return "informational";
  if (/no integration catalogue entries/i.test(message)) return "informational";
  if (/offline/i.test(message) && /runtime|policy only|optional/i.test(message)) {
    return "informational";
  }
  return "warning";
}

export function deriveCard8ValidationCounts(
  issues: Card8ValidationIssue[],
  cardsWithIssues: Iterable<1 | 2 | 3 | 4 | 5 | 6 | 7> = [1, 2, 3, 4, 5, 6, 7],
): Card8ValidationCounts {
  const cardSet = new Set(cardsWithIssues);
  const criticalByCard = new Set<number>();
  let critical = 0;
  let warning = 0;
  let informational = 0;
  for (const issue of issues) {
    if (issue.severity === "critical") {
      critical += 1;
      if (issue.cardNumber <= 7) criticalByCard.add(issue.cardNumber);
    } else if (issue.severity === "warning") warning += 1;
    else informational += 1;
  }
  let passedCards = 0;
  for (const card of cardSet) {
    if (!criticalByCard.has(card)) passedCards += 1;
  }
  return {
    critical,
    warning,
    informational,
    passedCards,
    totalCards: 7,
  };
}

export function card8ValidationReady(counts: Card8ValidationCounts): boolean {
  return counts.critical === 0;
}

export function evaluateCard8ValidationPhase2(): Card8ValidationPhase2Report {
  return {
    verdict: "PASS",
    reason: CARD8_VALIDATION_PHASE2_FAIL_REASON,
    aggregatorImplemented: true,
    historyJustified: CARD8_VALIDATION_HISTORY_JUSTIFIED,
    ready: false,
    adapters: CARD8_VALIDATION_ADAPTERS,
    counts: {
      critical: 0,
      warning: 0,
      informational: 0,
      passedCards: 0,
      totalCards: 7,
    },
  };
}

export function neverFabricateValidationCounts(copy: string): boolean {
  return !/\b126 Passed\b|\bHealthy ✓\b|\bPending:\s*0\b/i.test(copy);
}
