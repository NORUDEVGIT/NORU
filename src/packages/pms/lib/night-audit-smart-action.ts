/**
 * Smart top-right Night Audit Play / Continue action recommendation engine.
 *
 * Deterministically computes the next required Night Audit UI action:
 * "What should I deal with next?"
 *
 * Priority order:
 * 1. Required read unavailable
 * 2. Returned from source module (recheck required)
 * 3. Initial check required (Start Audit)
 * 4. Hard blockers (Step 2 -> Step 3 -> Step 4 -> Step 5)
 * 5. Eligible fiscal blockers
 * 6. Unreviewed warnings (Step 5/7 review loop)
 * 7. Final Validation (Step 6)
 * 8. Management Review (Step 7)
 * 9. Close Business Date navigation (Step 8)
 *
 * Pure presentation / navigation helper. Never mutates canonical domain data.
 */
import type { NightAuditOverallStatus } from "./night-audit-operational.ts";
import {
  exceptionMeta,
  isActiveWarningReview,
  type DomainStatus,
  type WorkflowException,
} from "./night-audit-workflow.ts";

export type SmartActionType =
  | "start"
  | "unavailable"
  | "recheck"
  | "blocker"
  | "fiscal_blocker"
  | "warning_review"
  | "final_validation"
  | "final_review"
  | "close_navigation"
  | "closed"
  | "superseded";

export type SmartActionRecommendation = {
  type: SmartActionType;
  /** Suggested target step number (1–8) */
  step: number;
  /** Sub-tab / focus area within the target step */
  focusTab?: string;
  /** Primary button text */
  buttonLabel: string;
  /** Compact description of why this action is recommended (e.g. 'Next issue: Room 504 · Occupied OOO') */
  nextSummary: string;
  /** Accessible ARIA label for screen readers */
  ariaLabel: string;
  /** ID of the specific exception to focus/highlight */
  targetExceptionId?: string;
  /** Reference ID (e.g. reservation ID, room ID) */
  targetReferenceId?: string;
  /** Button visual styling tone */
  tone: "gold" | "amber" | "green" | "neutral";
  /** Icon representation */
  icon: "play" | "refresh" | "alert" | "check" | "arrow" | "lock";
  /** Whether clicking should run a canonical recheck first */
  shouldRecheckFirst?: boolean;
};

export type SmartActionInput = {
  runStatus: "open" | "ready" | "closed" | "failed" | "superseded" | null;
  overall: NightAuditOverallStatus | null;
  financialStatus: DomainStatus;
  operationalStatus: DomainStatus;
  financialSummary: {
    status: DomainStatus;
    blockerCount: number;
    warningCount: number;
    openDrawerCount: number;
    fiscalProblemCount: number;
    fiscalOverrideCount: number;
  };
  operationalSummary: {
    status: DomainStatus;
    blockerCount: number;
    warningCount: number;
    unresolvedArrivalCount: number;
    overstayCount: number;
    roomConflictCount: number;
    overbookingIssueCount: number;
  };
  exceptions: readonly WorkflowException[];
  checkedAt?: string | null;
  rechecked?: boolean;
  rechecking?: boolean;
  currentStep?: number;
  returnedFromSource?: boolean;
  liveWindow?: {
    open: boolean;
    label: string;
    allowsClose: boolean;
    message: string;
    ownerBypass?: boolean;
  } | null;
  role?: string;
};

export type AuditHeaderStatus = {
  status:
    | "NOT_CHECKED"
    | "IN_PROGRESS"
    | "ACTION_REQUIRED"
    | "REVIEW_REQUIRED"
    | "READY_FOR_VALIDATION"
    | "READY_FOR_REVIEW"
    | "READY_TO_CLOSE"
    | "CLOSED"
    | "SUPERSEDED"
    | "UNAVAILABLE";
  label: string;
  tone: "red" | "amber" | "green" | "neutral" | "blue";
};

/** Global audit header status label */
export function getAuditHeaderStatus(input: SmartActionInput): AuditHeaderStatus {
  if (input.runStatus === "closed" || input.overall === "closed") {
    return { status: "CLOSED", label: "CLOSED", tone: "green" };
  }
  if (input.runStatus === "superseded") {
    return { status: "SUPERSEDED", label: "SUPERSEDED", tone: "neutral" };
  }
  if (
    input.financialStatus === "unavailable" ||
    input.operationalStatus === "unavailable" ||
    input.overall === "unavailable"
  ) {
    return { status: "UNAVAILABLE", label: "UNAVAILABLE", tone: "red" };
  }
  if (input.rechecking) {
    return { status: "IN_PROGRESS", label: "RECHECKING…", tone: "blue" };
  }
  if (!input.checkedAt && input.overall == null) {
    return { status: "NOT_CHECKED", label: "NOT CHECKED", tone: "neutral" };
  }

  const openList = input.exceptions.filter((e) => e.status === "open");
  const hardBlockers = openList.filter(
    (e) => e.severity === "blocking" && !e.fiscalOverride,
  ).length;
  const operationalBlockers =
    input.operationalSummary.blockerCount ||
    input.operationalSummary.unresolvedArrivalCount +
      input.operationalSummary.overstayCount +
      input.operationalSummary.roomConflictCount;
  const financialBlockers = input.financialSummary.blockerCount;

  if (
    hardBlockers > 0 ||
    operationalBlockers > 0 ||
    financialBlockers > 0 ||
    input.overall === "blocked"
  ) {
    return { status: "ACTION_REQUIRED", label: "ACTION REQUIRED", tone: "red" };
  }

  const unreviewedWarnings = openList.filter(
    (e) =>
      e.severity === "warning" && (!e.warningReview || !isActiveWarningReview(e.warningReview)),
  ).length;

  if (unreviewedWarnings > 0) {
    return { status: "REVIEW_REQUIRED", label: "REVIEW REQUIRED", tone: "amber" };
  }

  if ((input.currentStep ?? 1) < 6) {
    return { status: "READY_FOR_VALIDATION", label: "READY FOR VALIDATION", tone: "amber" };
  }
  if ((input.currentStep ?? 1) === 6) {
    return {
      status: input.rechecked ? "READY_FOR_REVIEW" : "READY_FOR_VALIDATION",
      label: input.rechecked ? "READY FOR REVIEW" : "READY FOR VALIDATION",
      tone: "green",
    };
  }
  return { status: "READY_TO_CLOSE", label: "READY TO CLOSE", tone: "green" };
}

/**
 * Deterministically find the highest-priority next item and recommend the smart action.
 */
export function getNextNightAuditAction(input: SmartActionInput): SmartActionRecommendation {
  // 1. Closed Run
  if (input.runStatus === "closed" || input.overall === "closed") {
    return {
      type: "closed",
      step: 8,
      buttonLabel: "View History",
      nextSummary: "Night Audit Complete",
      ariaLabel: "Night Audit is complete. View audit run history.",
      tone: "neutral",
      icon: "check",
    };
  }

  // 2. Superseded Run
  if (input.runStatus === "superseded") {
    return {
      type: "superseded",
      step: 1,
      buttonLabel: "View History",
      nextSummary: "Night Audit Superseded",
      ariaLabel: "This Night Audit run was superseded by date adjustment. View history.",
      tone: "neutral",
      icon: "lock",
    };
  }

  // 3. Required read unavailable (Highest operational priority)
  if (
    input.financialStatus === "unavailable" ||
    input.operationalStatus === "unavailable" ||
    input.overall === "unavailable"
  ) {
    if (input.operationalStatus === "unavailable") {
      return {
        type: "unavailable",
        step: 2,
        focusTab: "arrivals",
        buttonLabel: "↻ Recheck & Continue",
        nextSummary: "Operations data unavailable",
        ariaLabel: "Operational reconciliation is unavailable. Click to recheck.",
        tone: "neutral",
        icon: "refresh",
        shouldRecheckFirst: true,
      };
    }
    if (input.financialStatus === "unavailable") {
      return {
        type: "unavailable",
        step: 4,
        focusTab: "action-triage",
        buttonLabel: "↻ Recheck & Continue",
        nextSummary: "Financial data unavailable",
        ariaLabel: "Financial reconciliation is unavailable. Click to recheck.",
        tone: "neutral",
        icon: "refresh",
        shouldRecheckFirst: true,
      };
    }
    return {
      type: "unavailable",
      step: 1,
      buttonLabel: "↻ Recheck & Continue",
      nextSummary: "Reconciliation check unavailable",
      ariaLabel: "System reconciliation check unavailable. Click to recheck.",
      tone: "neutral",
      icon: "refresh",
      shouldRecheckFirst: true,
    };
  }

  // 4. Returned from source module
  if (input.returnedFromSource) {
    return {
      type: "recheck",
      step: input.currentStep ?? 1,
      buttonLabel: "↻ Recheck & Continue",
      nextSummary: "Source record may have changed",
      ariaLabel: "Source record may have changed. Click to recheck and continue Night Audit.",
      tone: "gold",
      icon: "refresh",
      shouldRecheckFirst: true,
    };
  }

  // 5. Initial check required
  if (!input.checkedAt && input.overall == null) {
    return {
      type: "start",
      step: 1,
      buttonLabel: "▶ Start Audit",
      nextSummary: "Run initial audit checks",
      ariaLabel: "Start Night Audit. Run initial checks.",
      tone: "gold",
      icon: "play",
      shouldRecheckFirst: true,
    };
  }

  // Filter open exceptions (ignoring resolved and info)
  const openExceptions = input.exceptions.filter((e) => e.status === "open");

  // 6. Hard Blockers (Ordered by Guided Step sequence: Step 2 -> 3 -> 4 -> 5)

  // Step 2: Arrivals & Departures
  const step2Blockers = openExceptions
    .filter((e) => {
      if (e.severity !== "blocking") return false;
      const meta = exceptionMeta(e.exceptionType);
      return (
        meta.category === "arrivals" ||
        meta.category === "departures" ||
        e.exceptionType.includes("arrival") ||
        e.exceptionType.includes("stay") ||
        e.exceptionType.includes("departure")
      );
    })
    .sort((a, b) => {
      const catA = exceptionMeta(a.exceptionType).category === "arrivals" ? 0 : 1;
      const catB = exceptionMeta(b.exceptionType).category === "arrivals" ? 0 : 1;
      if (catA !== catB) return catA - catB;
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

  if (step2Blockers.length > 0) {
    const ex = step2Blockers[0]!;
    const meta = exceptionMeta(ex.exceptionType);
    const isArrival = meta.category === "arrivals" || ex.exceptionType.includes("arrival");
    const summary = ex.referenceId
      ? `${isArrival ? "Arrival" : "Overstay"} · ${ex.referenceId}`
      : ex.message || "Arrival/departure blocker";
    return {
      type: "blocker",
      step: 2,
      focusTab: isArrival ? "arrivals" : "overstays",
      buttonLabel: "▶ Continue Audit",
      nextSummary: `Next issue: ${summary}`,
      ariaLabel: `Continue Night Audit. Next issue: ${summary} in Step 2.`,
      targetExceptionId: ex.id,
      targetReferenceId: ex.referenceId ?? undefined,
      tone: "gold",
      icon: "play",
    };
  }

  if (input.operationalSummary.unresolvedArrivalCount > 0) {
    const count = input.operationalSummary.unresolvedArrivalCount;
    return {
      type: "blocker",
      step: 2,
      focusTab: "arrivals",
      buttonLabel: "▶ Continue Audit",
      nextSummary: `Next issue: ${count} unresolved arrival${count > 1 ? "s" : ""}`,
      ariaLabel: `Continue Night Audit. Next issue: ${count} unresolved arrivals in Step 2.`,
      tone: "gold",
      icon: "play",
    };
  }

  if (input.operationalSummary.overstayCount > 0) {
    const count = input.operationalSummary.overstayCount;
    return {
      type: "blocker",
      step: 2,
      focusTab: "overstays",
      buttonLabel: "▶ Continue Audit",
      nextSummary: `Next issue: ${count} departure overstay${count > 1 ? "s" : ""}`,
      ariaLabel: `Continue Night Audit. Next issue: ${count} departure overstays in Step 2.`,
      tone: "gold",
      icon: "play",
    };
  }

  // Step 3: Rooms & Housekeeping
  const step3Blockers = openExceptions
    .filter((e) => {
      if (e.severity !== "blocking") return false;
      const meta = exceptionMeta(e.exceptionType);
      return (
        meta.category === "rooms" ||
        meta.category === "housekeeping" ||
        e.exceptionType.includes("room") ||
        e.exceptionType.includes("housekeeping") ||
        e.exceptionType.includes("hk_") ||
        e.exceptionType.includes("dirty")
      );
    })
    .sort((a, b) => {
      const catA = exceptionMeta(a.exceptionType).category === "rooms" ? 0 : 1;
      const catB = exceptionMeta(b.exceptionType).category === "rooms" ? 0 : 1;
      if (catA !== catB) return catA - catB;
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

  if (step3Blockers.length > 0) {
    const ex = step3Blockers[0]!;
    const meta = exceptionMeta(ex.exceptionType);
    const summary = ex.message || `${meta.title} · Action required`;
    return {
      type: "blocker",
      step: 3,
      focusTab: meta.category === "housekeeping" ? "housekeeping" : "rooms",
      buttonLabel: "▶ Continue Audit",
      nextSummary: `Next issue: ${summary}`,
      ariaLabel: `Continue Night Audit. Next issue: ${summary} in Step 3.`,
      targetExceptionId: ex.id,
      targetReferenceId: ex.referenceId ?? undefined,
      tone: "gold",
      icon: "play",
    };
  }

  if (input.operationalSummary.roomConflictCount > 0) {
    const count = input.operationalSummary.roomConflictCount;
    return {
      type: "blocker",
      step: 3,
      focusTab: "rooms",
      buttonLabel: "▶ Continue Audit",
      nextSummary: `Next issue: ${count} room conflict${count > 1 ? "s" : ""}`,
      ariaLabel: `Continue Night Audit. Next issue: ${count} room conflicts in Step 3.`,
      tone: "gold",
      icon: "play",
    };
  }

  // Step 4: Financial Transactions
  if (input.financialSummary.openDrawerCount > 0) {
    const count = input.financialSummary.openDrawerCount;
    return {
      type: "blocker",
      step: 4,
      focusTab: "drawers",
      buttonLabel: "▶ Continue Audit",
      nextSummary: `Next issue: ${count} open cashier drawer${count > 1 ? "s" : ""}`,
      ariaLabel: `Continue Night Audit. Next issue: ${count} open cashier drawers in Step 4.`,
      tone: "gold",
      icon: "play",
    };
  }

  const step4Blockers = openExceptions
    .filter((e) => {
      if (e.severity !== "blocking") return false;
      const meta = exceptionMeta(e.exceptionType);
      return meta.domain === "financial" && meta.category !== "fiscal";
    })
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

  if (step4Blockers.length > 0) {
    const ex = step4Blockers[0]!;
    const meta = exceptionMeta(ex.exceptionType);
    const summary = ex.message || `${meta.title} · Financial blocker`;
    return {
      type: "blocker",
      step: 4,
      focusTab: meta.category ?? "action-triage",
      buttonLabel: "▶ Continue Audit",
      nextSummary: `Next issue: ${summary}`,
      ariaLabel: `Continue Night Audit. Next issue: ${summary} in Step 4.`,
      targetExceptionId: ex.id,
      targetReferenceId: ex.referenceId ?? undefined,
      tone: "gold",
      icon: "play",
    };
  }

  if (input.financialSummary.blockerCount > 0) {
    const count = input.financialSummary.blockerCount;
    return {
      type: "blocker",
      step: 4,
      focusTab: "action-triage",
      buttonLabel: "▶ Continue Audit",
      nextSummary: `Next issue: ${count} financial blocker${count > 1 ? "s" : ""}`,
      ariaLabel: `Continue Night Audit. Next issue: ${count} financial blockers in Step 4.`,
      tone: "gold",
      icon: "play",
    };
  }

  // Step 5: Operations & Exceptions (Revenue, Overbooking, Distribution, Services)
  const step5HardBlockers = openExceptions
    .filter((e) => {
      if (e.severity !== "blocking") return false;
      const meta = exceptionMeta(e.exceptionType);
      if (meta.category === "fiscal") {
        // Non-overrideable fiscal blocker (e.g. unrecognized fiscal code)
        return meta.code === "fiscal_unrecognized";
      }
      return (
        meta.category === "revenue" ||
        meta.category === "overbooking" ||
        meta.category === "distribution" ||
        meta.category === "services"
      );
    })
    .sort((a, b) => {
      const catOrder: Record<string, number> = {
        revenue: 1,
        overbooking: 2,
        distribution: 3,
        services: 4,
        fiscal: 5,
      };
      const catA = catOrder[exceptionMeta(a.exceptionType).category ?? ""] ?? 99;
      const catB = catOrder[exceptionMeta(b.exceptionType).category ?? ""] ?? 99;
      if (catA !== catB) return catA - catB;
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

  if (step5HardBlockers.length > 0) {
    const ex = step5HardBlockers[0]!;
    const meta = exceptionMeta(ex.exceptionType);
    const summary = ex.message || `${meta.title} · Operational blocker`;
    return {
      type: "blocker",
      step: 5,
      focusTab: meta.category ?? "revenue",
      buttonLabel: "▶ Continue Audit",
      nextSummary: `Next issue: ${summary}`,
      ariaLabel: `Continue Night Audit. Next issue: ${summary} in Step 5.`,
      targetExceptionId: ex.id,
      targetReferenceId: ex.referenceId ?? undefined,
      tone: "gold",
      icon: "play",
    };
  }

  if (input.operationalSummary.overbookingIssueCount > 0) {
    const count = input.operationalSummary.overbookingIssueCount;
    return {
      type: "blocker",
      step: 5,
      focusTab: "overbooking",
      buttonLabel: "▶ Continue Audit",
      nextSummary: `Next issue: ${count} overbooking issue${count > 1 ? "s" : ""}`,
      ariaLabel: `Continue Night Audit. Next issue: ${count} overbooking issues in Step 5.`,
      tone: "gold",
      icon: "play",
    };
  }

  // 7. Eligible Fiscal Blockers (can be authorized for close override)
  const eligibleFiscalBlockers = openExceptions.filter((e) => {
    if (e.severity !== "blocking") return false;
    const meta = exceptionMeta(e.exceptionType);
    return meta.category === "fiscal" && !e.fiscalOverride;
  });

  if (eligibleFiscalBlockers.length > 0) {
    const ex = eligibleFiscalBlockers[0]!;
    return {
      type: "fiscal_blocker",
      step: 5,
      focusTab: "fiscal",
      buttonLabel: "▶ Continue Audit",
      nextSummary: "Next issue: Fiscal blocker · Override required",
      ariaLabel: "Fiscal blocker requires management override in Step 5.",
      targetExceptionId: ex.id,
      tone: "gold",
      icon: "play",
    };
  }

  // 8. Unreviewed Warnings (Step 5 / Step 7 warning loop)
  const unreviewedWarnings = openExceptions
    .filter((e) => {
      if (e.severity !== "warning") return false;
      return !e.warningReview || !isActiveWarningReview(e.warningReview);
    })
    .sort((a, b) => {
      // Step order of categories: arrivals/dep -> rooms/hk -> financial -> revenue/ob/dist/services -> other
      const catOrder: Record<string, number> = {
        arrivals: 1,
        departures: 2,
        rooms: 3,
        housekeeping: 4,
        drawers: 5,
        folios: 6,
        invoices: 7,
        payments: 8,
        accounts: 9,
        tax: 10,
        revenue: 11,
        overbooking: 12,
        distribution: 13,
        services: 14,
        fiscal: 15,
      };
      const catA = catOrder[exceptionMeta(a.exceptionType).category ?? ""] ?? 99;
      const catB = catOrder[exceptionMeta(b.exceptionType).category ?? ""] ?? 99;
      if (catA !== catB) return catA - catB;
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

  if (unreviewedWarnings.length > 0) {
    const count = unreviewedWarnings.length;
    const firstWarn = unreviewedWarnings[0]!;
    return {
      type: "warning_review",
      step: 5,
      focusTab: "warnings",
      buttonLabel: "⚠ Review Warnings",
      nextSummary: `${count} warning${count > 1 ? "s" : ""} need review`,
      ariaLabel: `${count} unreviewed warnings. Click to review next warning in Step 5.`,
      targetExceptionId: firstWarn.id,
      targetReferenceId: firstWarn.referenceId ?? undefined,
      tone: "amber",
      icon: "alert",
    };
  }

  // 9. All Blockers Clear + All Warnings Reviewed!
  const currentStep = input.currentStep ?? 1;

  if (currentStep < 6) {
    return {
      type: "final_validation",
      step: 6,
      buttonLabel: "✓ Final Validation",
      nextSummary: "All checks complete",
      ariaLabel: "All blockers clear and warnings reviewed. Click to run Final Validation.",
      tone: "gold",
      icon: "check",
    };
  }

  if (currentStep === 6) {
    if (!input.rechecked) {
      return {
        type: "final_validation",
        step: 6,
        buttonLabel: "✓ Final Validation",
        nextSummary: "Ready for final validation",
        ariaLabel: "Click to run final canonical reconciliation on Step 6.",
        tone: "gold",
        icon: "check",
        shouldRecheckFirst: true,
      };
    }
    return {
      type: "final_review",
      step: 7,
      buttonLabel: "✓ Final Review",
      nextSummary: "Validation passed · Ready for review",
      ariaLabel: "Final validation passed. Click to proceed to Management Review.",
      tone: "gold",
      icon: "arrow",
    };
  }

  if (currentStep === 7) {
    const windowClosed = input.liveWindow && !input.liveWindow.allowsClose;
    const windowMsg = windowClosed
      ? `Ready · Close window opens at ${input.liveWindow!.label}`
      : input.liveWindow?.ownerBypass
        ? "Ready to close · Owner access"
        : "Ready to close";

    return {
      type: "close_navigation",
      step: 8,
      buttonLabel: "→ Close Business Date",
      nextSummary: windowMsg,
      ariaLabel: "Management review complete. Click to proceed to Step 8 Close Business Day.",
      tone: "gold",
      icon: "arrow",
    };
  }

  // On Step 8:
  return {
    type: "close_navigation",
    step: 8,
    buttonLabel: "→ Close Business Date",
    nextSummary: "Ready to close business day",
    ariaLabel: "Ready to close business day in Step 8.",
    tone: "gold",
    icon: "arrow",
  };
}

