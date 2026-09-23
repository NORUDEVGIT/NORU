/**
 * Card 8 Phase 5 — pure overall readiness composition.
 *
 * Validate is read-only. Programme completion is setup/governance readiness;
 * it is deliberately separate from restaurants.pms_set1_live.
 */
import {
  evaluateCard8OfflineReadiness,
  type Card8OfflineSnapshot,
} from "./pms-property-setup-card8-offline.ts";
import type { Card8ValidationReport } from "./pms-property-setup-card8-validation.ts";
import {
  card8GoliveReadinessInput,
  card8GoliveReady,
  type Card8GoliveSnapshot,
} from "./pms-property-setup-card8-golive.ts";
import type { Card8ActivationEligibility } from "./pms-property-setup-card8-activation.server.ts";
import {
  parsePropertySetupStatus,
  type PropertySetupCardStatus,
  type PropertySetupStatus,
} from "./pms-property-setup-card1.ts";
import { CARD8_PROGRAMME_CARD_ID } from "./pms-property-setup-card8.ts";

export type Card8Verdict = "PASS" | "PARTIAL" | "FAIL";

export type Card8ReadinessSlice = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export type Card8DomainReport = Card8ReadinessSlice & {
  verdict: Card8Verdict;
};

export type Card8ReadinessSnapshot = {
  offline: Card8OfflineSnapshot;
  validation: Card8ValidationReport;
  golive: Card8GoliveSnapshot;
  activation: Card8ActivationEligibility;
};

export type Card8ReadinessReport = {
  offline: Card8DomainReport;
  validation: Card8DomainReport;
  golive: Card8DomainReport;
  activation: Card8DomainReport;
  integrity: Card8DomainReport;
  overall: Card8DomainReport;
  canonicalLive: boolean;
  generatedAt: string;
};

export function card8Verdict(status: PropertySetupCardStatus): Card8Verdict {
  if (status === "complete") return "PASS";
  if (status === "in_progress") return "PARTIAL";
  return "FAIL";
}

export function withCard8Verdict(slice: Card8ReadinessSlice): Card8DomainReport {
  return { ...slice, verdict: card8Verdict(slice.status) };
}

export function evaluateCard8OfflineDomain(snapshot: Card8OfflineSnapshot): Card8ReadinessSlice {
  const readiness = evaluateCard8OfflineReadiness(snapshot);
  return {
    ready: readiness.ready,
    status: readiness.ready
      ? "complete"
      : readiness.status === "in_progress"
        ? "in_progress"
        : "not_started",
    blockers: readiness.blockers,
    warnings: readiness.warnings,
  };
}

export function evaluateCard8ValidationDomain(report: Card8ValidationReport): Card8ReadinessSlice {
  const adaptersSucceeded = report.summaries.every((summary) => summary.succeeded);
  const ready = report.ready && report.counts.critical === 0 && adaptersSucceeded;
  const blockers = report.issues
    .filter((issue) => issue.severity === "critical")
    .map((issue) => issue.message);
  if (!adaptersSucceeded && blockers.length === 0) {
    blockers.push("One or more Card 1–7 validation adapters could not run.");
  }
  return {
    ready,
    status: ready ? "complete" : report.summaries.length > 0 ? "in_progress" : "not_started",
    blockers,
    warnings: report.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
  };
}

export function evaluateCard8GoliveDomain(
  snapshot: Card8GoliveSnapshot,
  validationCritical: number,
): Card8ReadinessSlice {
  const input = card8GoliveReadinessInput(snapshot.plan, snapshot.tasks, validationCritical);
  const ready = card8GoliveReady(input);
  const blockers: string[] = [];
  if (validationCritical > 0) blockers.push("System Validation has critical issues.");
  if (!snapshot.businessDate) blockers.push("The authoritative business date is missing.");
  if (!input.businessDateConfirmed) blockers.push("Business date confirmation is incomplete.");
  if (!input.openingStateConfirmed) blockers.push("Opening state confirmation is incomplete.");
  if (!input.futureReservationsConfirmed) {
    blockers.push("Future reservations confirmation is incomplete.");
  }
  if (input.sandboxPosture !== "unavailable_acknowledged") {
    blockers.push("Sandbox runtime limitation is not acknowledged.");
  }
  if (input.cutoverLockPosture !== "unsupported_acknowledged") {
    blockers.push("Cutover-lock limitation is not acknowledged.");
  }
  if (input.incompleteRequiredTasks > 0) {
    blockers.push(
      `${input.incompleteRequiredTasks} required Go-Live ${
        input.incompleteRequiredTasks === 1 ? "task is" : "tasks are"
      } incomplete.`,
    );
  }
  const started =
    snapshot.plan.id !== null ||
    snapshot.plan.status !== "draft" ||
    snapshot.tasks.some((task) => task.status !== "not_started");
  return {
    ready,
    status: ready ? "complete" : started ? "in_progress" : "not_started",
    blockers,
    warnings: ["Sandbox and cutover lock are acknowledged limitations, not runtime capabilities."],
  };
}

export function evaluateCard8ActivationDomain(
  eligibility: Card8ActivationEligibility,
): Card8ReadinessSlice {
  const preconditionsReady =
    eligibility.set1ChecklistReady &&
    eligibility.validation.critical === 0 &&
    eligibility.golive.ready &&
    Boolean(eligibility.businessDate) &&
    eligibility.golive.businessDateConfirmed;
  const ready = eligibility.canonicalLive || preconditionsReady;
  const blockers = eligibility.blockers.filter(
    (blocker) =>
      blocker !== "Property is already active." &&
      blocker !== "Only the property owner can activate.",
  );
  return {
    ready,
    status: ready ? "complete" : "in_progress",
    blockers,
    warnings: [
      ...eligibility.warnings,
      "Owner authorization and explicit confirmation are enforced when Activate is requested.",
    ],
  };
}

export function evaluateCard8Integrity(snapshot: Card8ReadinessSnapshot): Card8ReadinessSlice {
  const blockers: string[] = [];
  if (
    snapshot.golive.businessDate !== null &&
    snapshot.activation.businessDate !== snapshot.golive.businessDate
  ) {
    blockers.push("Card 1 business date sources disagree.");
  }
  return {
    ready: blockers.length === 0,
    status: blockers.length === 0 ? "complete" : "in_progress",
    blockers,
    warnings: [
      "Cards 1–7 remain domain owners; Card 8 only composes their live evaluators.",
      "Offline, sandbox and cutover-lock runtime limitations remain explicit.",
      "activatePmsSet1 and pms_set1_live remain the canonical activation path and state.",
      "Card 7 permissions remain setup-only and the existing staff audit store is reused.",
    ],
  };
}

export function evaluateCard8Overall(domains: readonly Card8ReadinessSlice[]): Card8ReadinessSlice {
  const ready = domains.every((domain) => domain.ready);
  const started = domains.some((domain) => domain.status !== "not_started");
  return {
    ready,
    status: ready ? "complete" : started ? "in_progress" : "not_started",
    blockers: domains.flatMap((domain) => domain.blockers),
    warnings: domains.flatMap((domain) => domain.warnings),
  };
}

export function buildCard8ReadinessReport(snapshot: Card8ReadinessSnapshot): Card8ReadinessReport {
  const offline = evaluateCard8OfflineDomain(snapshot.offline);
  const validation = evaluateCard8ValidationDomain(snapshot.validation);
  const golive = evaluateCard8GoliveDomain(snapshot.golive, snapshot.validation.counts.critical);
  const activation = evaluateCard8ActivationDomain(snapshot.activation);
  const integrity = evaluateCard8Integrity(snapshot);
  const overall = evaluateCard8Overall([offline, validation, golive, activation, integrity]);
  return {
    offline: withCard8Verdict(offline),
    validation: withCard8Verdict(validation),
    golive: withCard8Verdict(golive),
    activation: withCard8Verdict(activation),
    integrity: withCard8Verdict(integrity),
    overall: withCard8Verdict(overall),
    canonicalLive: snapshot.activation.canonicalLive,
    generatedAt: snapshot.validation.generatedAt,
  };
}

export function mergeCard8Status(
  stored: unknown,
  overall: Card8ReadinessSlice,
): PropertySetupStatus {
  const parsed = parsePropertySetupStatus(stored);
  return {
    ...parsed,
    cards: {
      ...parsed.cards,
      [CARD8_PROGRAMME_CARD_ID]: overall.status,
    },
  };
}
