import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getNextNightAuditAction,
  getAuditHeaderStatus,
  type SmartActionInput,
} from "./night-audit-smart-action.ts";
import type { WorkflowException } from "./night-audit-workflow.ts";
import { closeGate } from "./night-audit-workflow.ts";

function createBaseInput(overrides: Partial<SmartActionInput> = {}): SmartActionInput {
  return {
    runStatus: "open",
    overall: "ready",
    financialStatus: "ready",
    operationalStatus: "ready",
    financialSummary: {
      status: "ready",
      blockerCount: 0,
      warningCount: 0,
      openDrawerCount: 0,
      fiscalProblemCount: 0,
      fiscalOverrideCount: 0,
    },
    operationalSummary: {
      status: "ready",
      blockerCount: 0,
      warningCount: 0,
      unresolvedArrivalCount: 0,
      overstayCount: 0,
      roomConflictCount: 0,
      overbookingIssueCount: 0,
    },
    exceptions: [],
    checkedAt: "2026-10-21T21:00:00Z",
    rechecked: true,
    rechecking: false,
    currentStep: 1,
    returnedFromSource: false,
    liveWindow: {
      open: true,
      label: "02:00–06:00",
      allowsClose: true,
      message: "",
    },
    role: "manager",
    ...overrides,
  };
}

describe("Smart Night Audit Play / Continue Navigation", () => {
  it("1. Initial state shows Start Audit", () => {
    const input = createBaseInput({
      checkedAt: null,
      overall: null,
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "start");
    assert.equal(action.buttonLabel, "▶ Start Audit");
    assert.equal(action.step, 1);
    assert.equal(getAuditHeaderStatus(input).label, "NOT CHECKED");
  });

  it("2. Start Audit runs/retrieves canonical checks", () => {
    const input = createBaseInput({
      checkedAt: null,
      overall: null,
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.shouldRecheckFirst, true);
  });

  it("3. Unavailable Financial/Operations takes priority over normal issues", () => {
    const blockerEx: WorkflowException = {
      id: "ex-1",
      exceptionType: "arrival_not_processed",
      severity: "blocking",
      status: "open",
      referenceType: "reservation",
      referenceId: "R-101",
      message: "Unprocessed arrival",
      resolvedAt: null,
    };
    const input = createBaseInput({
      operationalStatus: "unavailable",
      exceptions: [blockerEx],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "unavailable");
    assert.equal(action.buttonLabel, "↻ Recheck & Continue");
    assert.match(action.nextSummary, /Operations data unavailable/);
    assert.equal(action.shouldRecheckFirst, true);
    assert.equal(getAuditHeaderStatus(input).label, "UNAVAILABLE");
  });

  it("4. First active blocker directs to the correct step", () => {
    const overstayEx: WorkflowException = {
      id: "ex-overstay",
      exceptionType: "overstay",
      severity: "blocking",
      status: "open",
      referenceType: "reservation",
      referenceId: "RES-4882",
      message: "Departure due yesterday not checked out",
      resolvedAt: null,
    };
    const input = createBaseInput({
      overall: "blocked",
      exceptions: [overstayEx],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "blocker");
    assert.equal(action.step, 2);
    assert.equal(action.focusTab, "overstays");
    assert.equal(action.targetExceptionId, "ex-overstay");
    assert.equal(action.targetReferenceId, "RES-4882");
    assert.equal(action.buttonLabel, "▶ Continue Audit");
  });

  it("5. Multiple blockers use deterministic ordering", () => {
    const exA: WorkflowException = {
      id: "ex-a",
      exceptionType: "overstay",
      severity: "blocking",
      status: "open",
      referenceType: "reservation",
      referenceId: "RES-A",
      message: "Overstay A",
      createdAt: "2026-10-21T10:00:00Z",
      resolvedAt: null,
    };
    const exB: WorkflowException = {
      id: "ex-b",
      exceptionType: "arrival_not_processed",
      severity: "blocking",
      status: "open",
      referenceType: "reservation",
      referenceId: "RES-B",
      message: "Arrival B",
      createdAt: "2026-10-21T09:00:00Z",
      resolvedAt: null,
    };
    const input = createBaseInput({
      overall: "blocked",
      exceptions: [exA, exB],
    });
    const action = getNextNightAuditAction(input);
    // Arrivals before departures in Step 2
    assert.equal(action.targetExceptionId, "ex-b");
    assert.equal(action.step, 2);
    assert.equal(action.focusTab, "arrivals");
  });

  it("6. Blocker in Step 2 is chosen before blocker in Step 3", () => {
    const step2Ex: WorkflowException = {
      id: "ex-arrival",
      exceptionType: "arrival_not_processed",
      severity: "blocking",
      status: "open",
      referenceType: "reservation",
      referenceId: "RES-2",
      message: "Arrival pending",
      resolvedAt: null,
    };
    const step3Ex: WorkflowException = {
      id: "ex-room",
      exceptionType: "checked_in_without_room",
      severity: "blocking",
      status: "open",
      referenceType: "unit",
      referenceId: "U-3",
      message: "Checked in without room",
      resolvedAt: null,
    };
    const input = createBaseInput({
      overall: "blocked",
      exceptions: [step3Ex, step2Ex],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.step, 2);
    assert.equal(action.targetExceptionId, "ex-arrival");
  });

  it("7. User may manually navigate to Step 4 even while Step 2 has blockers", () => {
    const step2Ex: WorkflowException = {
      id: "ex-arrival",
      exceptionType: "arrival_not_processed",
      severity: "blocking",
      status: "open",
      referenceType: "reservation",
      referenceId: "RES-2",
      message: "Arrival pending",
      resolvedAt: null,
    };
    // The user has chosen currentStep = 4 manually
    const input = createBaseInput({
      overall: "blocked",
      currentStep: 4,
      exceptions: [step2Ex],
    });
    const action = getNextNightAuditAction(input);
    // Smart action recommends step 2 blocker, but does not block manual inspection of step 4
    assert.equal(action.type, "blocker");
    assert.equal(action.step, 2);
    assert.equal(input.currentStep, 4);
  });

  it("8. After source fix + recheck, resolved blocker is skipped", () => {
    const resolvedEx: WorkflowException = {
      id: "ex-resolved",
      exceptionType: "arrival_not_processed",
      severity: "blocking",
      status: "resolved",
      referenceType: "reservation",
      referenceId: "RES-FIXED",
      message: "Arrival was checked in",
      resolvedAt: "2026-10-21T22:00:00Z",
    };
    const nextBlocker: WorkflowException = {
      id: "ex-next",
      exceptionType: "room_double_occupancy",
      severity: "blocking",
      status: "open",
      referenceType: "unit",
      referenceId: "U-504",
      message: "Room 504 double occupancy",
      resolvedAt: null,
    };
    const input = createBaseInput({
      overall: "blocked",
      exceptions: [resolvedEx, nextBlocker],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.step, 3);
    assert.equal(action.targetExceptionId, "ex-next");
  });

  it("9. Recheck then routes to next blocker", () => {
    const remainingBlocker: WorkflowException = {
      id: "ex-room",
      exceptionType: "hk_conflict",
      severity: "blocking",
      status: "open",
      referenceType: "unit",
      referenceId: "U-102",
      message: "Housekeeping conflict on Room 102",
      resolvedAt: null,
    };
    const input = createBaseInput({
      overall: "blocked",
      exceptions: [remainingBlocker],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.step, 3);
    assert.equal(action.targetExceptionId, "ex-room");
  });

  it("10. No blockers + unreviewed warnings → Review Warnings", () => {
    const warnEx: WorkflowException = {
      id: "warn-1",
      exceptionType: "dirty_room_without_task",
      severity: "warning",
      status: "open",
      referenceType: "room",
      referenceId: "R-305",
      message: "Vacant dirty room without task",
      resolvedAt: null,
      warningReview: null,
    };
    const input = createBaseInput({
      overall: "warning",
      exceptions: [warnEx],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "warning_review");
    assert.equal(action.step, 5);
    assert.equal(action.focusTab, "warnings");
    assert.equal(action.buttonLabel, "⚠ Review Warnings");
    assert.equal(action.targetExceptionId, "warn-1");
    assert.equal(getAuditHeaderStatus(input).label, "REVIEW REQUIRED");
  });

  it("11. Reviewed warnings are skipped by smart navigation", () => {
    const reviewedWarn: WorkflowException = {
      id: "warn-reviewed",
      exceptionType: "dirty_room_without_task",
      severity: "warning",
      status: "open",
      referenceType: "room",
      referenceId: "R-305",
      message: "Vacant dirty room without task",
      resolvedAt: null,
      warningReview: {
        id: "rev-1",
        exceptionId: "warn-reviewed",
        reviewedByMembershipId: "mem-1",
        reviewerName: "Auditor Abebe",
        reviewedAt: "2026-10-21T21:30:00Z",
      },
    };
    const input = createBaseInput({
      overall: "ready",
      exceptions: [reviewedWarn],
    });
    const action = getNextNightAuditAction(input);
    // With 0 blockers and all warnings reviewed, routes to Final Validation
    assert.equal(action.type, "final_validation");
    assert.equal(action.step, 6);
  });

  it("12. Smart action selects the next unreviewed warning", () => {
    const warn1: WorkflowException = {
      id: "w-1",
      exceptionType: "dirty_room_without_task",
      severity: "warning",
      status: "open",
      referenceType: "room",
      referenceId: "R-1",
      message: "Dirty room",
      resolvedAt: null,
      warningReview: {
        id: "rev-1",
        exceptionId: "w-1",
        reviewedByMembershipId: "mem-1",
        reviewerName: "Auditor Abebe",
        reviewedAt: "2026-10-21T21:30:00Z",
      },
    };
    const warn2: WorkflowException = {
      id: "w-2",
      exceptionType: "departure_due_today",
      severity: "warning",
      status: "open",
      referenceType: "reservation",
      referenceId: "RES-2",
      message: "Departure due today",
      resolvedAt: null,
      warningReview: null,
    };
    const input = createBaseInput({
      overall: "warning",
      exceptions: [warn1, warn2],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "warning_review");
    assert.equal(action.targetExceptionId, "w-2");
  });

  it("13. All warnings reviewed → Final Validation", () => {
    const input = createBaseInput({
      overall: "ready",
      currentStep: 5,
      exceptions: [],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "final_validation");
    assert.equal(action.step, 6);
    assert.equal(action.buttonLabel, "✓ Final Validation");
  });

  it("14. Final Validation failure with new blocker returns action to Continue Audit", () => {
    const newBlocker: WorkflowException = {
      id: "ex-new",
      exceptionType: "arrival_not_processed",
      severity: "blocking",
      status: "open",
      referenceType: "reservation",
      referenceId: "R-NEW",
      message: "Late walk-in arrival not checked in",
      resolvedAt: null,
    };
    const input = createBaseInput({
      currentStep: 6,
      overall: "blocked",
      exceptions: [newBlocker],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "blocker");
    assert.equal(action.buttonLabel, "▶ Continue Audit");
    assert.equal(action.step, 2);
    assert.equal(getAuditHeaderStatus(input).label, "ACTION REQUIRED");
  });

  it("15. Final Validation with new warning returns action to Review Warnings", () => {
    const newWarning: WorkflowException = {
      id: "warn-new",
      exceptionType: "channel_sync_failed",
      severity: "warning",
      status: "open",
      referenceType: "channel",
      referenceId: "CH-1",
      message: "OTA sync delayed",
      resolvedAt: null,
    };
    const input = createBaseInput({
      currentStep: 6,
      overall: "warning",
      exceptions: [newWarning],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "warning_review");
    assert.equal(action.buttonLabel, "⚠ Review Warnings");
    assert.equal(action.step, 5);
    assert.equal(getAuditHeaderStatus(input).label, "REVIEW REQUIRED");
  });

  it("16. Successful Final Validation → Final Review", () => {
    const input = createBaseInput({
      currentStep: 6,
      rechecked: true,
      overall: "ready",
      exceptions: [],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "final_review");
    assert.equal(action.step, 7);
    assert.equal(action.buttonLabel, "✓ Final Review");
    assert.equal(getAuditHeaderStatus(input).label, "READY FOR REVIEW");
  });

  it("17. Final Review → Close Business Date navigation", () => {
    const input = createBaseInput({
      currentStep: 7,
      overall: "ready",
      exceptions: [],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "close_navigation");
    assert.equal(action.step, 8);
    assert.equal(action.buttonLabel, "→ Close Business Date");
    assert.equal(getAuditHeaderStatus(input).label, "READY TO CLOSE");
  });

  it("18. Header Close Business Date action only navigates to Step 8; it does not execute close", () => {
    const input = createBaseInput({
      currentStep: 7,
      overall: "ready",
      exceptions: [],
    });
    const action = getNextNightAuditAction(input);
    // Smart action recommendation targets Step 8 without running close
    assert.equal(action.step, 8);
    assert.notEqual(action.shouldRecheckFirst, true);
  });

  it("19. Manager outside Night Audit Window cannot bypass close", () => {
    const input = createBaseInput({
      currentStep: 7,
      role: "manager",
      liveWindow: {
        open: false,
        label: "02:00–06:00",
        allowsClose: false,
        message: "Outside configured window",
      },
    });
    const action = getNextNightAuditAction(input);
    assert.match(action.nextSummary, /Close window opens at 02:00–06:00/);

    // Verify canonical closeGate also holds
    const gate = closeGate({
      overall: "ready",
      financial: "ready",
      operational: "ready",
      openBlockingExceptions: 0,
      boardBlockers: 0,
      canClose: true,
      busy: false,
      runStatus: "ready",
      rechecked: true,
      window: input.liveWindow,
      unreviewedWarnings: 0,
    });
    assert.equal(gate.enabled, false);
    assert.equal(gate.reason, "Outside configured window");
  });

  it("20. Owner outside-window behavior remains unchanged", () => {
    const input = createBaseInput({
      currentStep: 7,
      role: "owner",
      liveWindow: {
        open: false,
        label: "02:00–06:00",
        allowsClose: true,
        message: "Owner access",
        ownerBypass: true,
      },
    });
    const action = getNextNightAuditAction(input);
    assert.match(action.nextSummary, /Owner access/);
  });

  it("21. Fiscal override behavior remains unchanged", () => {
    const fiscalEx: WorkflowException = {
      id: "f-1",
      exceptionType: "fiscal_device_offline",
      severity: "blocking",
      status: "open",
      referenceType: "fiscal_printer",
      referenceId: "FP-01",
      message: "Device offline",
      resolvedAt: null,
      fiscalOverride: {
        id: "ovr-1",
        exceptionId: "f-1",
        reason: "Hardware power board maintenance approved",
        authorizedByMembershipId: "mem-owner",
        authorizedAt: "2026-10-21T21:00:00Z",
      },
    };
    const input = createBaseInput({
      overall: "ready",
      exceptions: [fiscalEx],
    });
    const action = getNextNightAuditAction(input);
    // Authorized override does not block progression
    assert.equal(action.type, "final_validation");
  });

  it("22. Non-overrideable fiscal blocker remains actionable and blocking", () => {
    const unrecognizedFiscal: WorkflowException = {
      id: "f-unrec",
      exceptionType: "fiscal_unrecognized",
      severity: "blocking",
      status: "open",
      referenceType: "fiscal",
      referenceId: null,
      message: "Unrecognized fiscal discrepancy",
      resolvedAt: null,
    };
    const input = createBaseInput({
      overall: "blocked",
      exceptions: [unrecognizedFiscal],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "blocker");
    assert.equal(action.step, 5);
    assert.equal(action.targetExceptionId, "f-unrec");
  });

  it("23. INFO does not interrupt smart progression", () => {
    const infoItem: WorkflowException = {
      id: "info-1",
      exceptionType: "waitlist_pending",
      severity: "warning", // or info
      status: "resolved",
      referenceType: "reservation",
      referenceId: "WL-1",
      message: "Waitlist pending count",
      resolvedAt: "2026-10-21T20:00:00Z",
    };
    const input = createBaseInput({
      overall: "ready",
      exceptions: [infoItem],
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "final_validation");
  });

  it("24. Closed run disables smart audit progression", () => {
    const input = createBaseInput({
      runStatus: "closed",
      overall: "closed",
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "closed");
    assert.equal(action.buttonLabel, "View History");
    assert.equal(getAuditHeaderStatus(input).label, "CLOSED");
  });

  it("25. Superseded run disables smart audit progression", () => {
    const input = createBaseInput({
      runStatus: "superseded",
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "superseded");
    assert.equal(action.buttonLabel, "View History");
    assert.equal(getAuditHeaderStatus(input).label, "SUPERSEDED");
  });

  it("26. Returning from source module uses Recheck & Continue rather than assuming resolution", () => {
    const input = createBaseInput({
      returnedFromSource: true,
      currentStep: 2,
    });
    const action = getNextNightAuditAction(input);
    assert.equal(action.type, "recheck");
    assert.equal(action.buttonLabel, "↻ Recheck & Continue");
    assert.match(action.nextSummary, /Source record may have changed/);
    assert.equal(action.shouldRecheckFirst, true);
  });

  it("27. Stale client state cannot make the system skip server-side blocker checks", () => {
    // If a server blocker exists, closeGate strictly holds
    const gate = closeGate({
      overall: "blocked",
      financial: "ready",
      operational: "ready",
      openBlockingExceptions: 1,
      boardBlockers: 0,
      canClose: true,
      busy: false,
      runStatus: "ready",
      rechecked: true,
      unreviewedWarnings: 0,
    });
    assert.equal(gate.enabled, false);
    assert.match(gate.reason, /block/i);
  });
});
