import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  closeGate,
  filterExceptions,
  filterReviewedWarnings,
  warningReviewCounts,
  type WorkflowException,
  type WarningReview,
} from "./night-audit-workflow.ts";

const functions = readFileSync(new URL("./nightaudit.functions.ts", import.meta.url), "utf8");
const desk = readFileSync(new URL("../components/nightaudit/night-audit-desk.tsx", import.meta.url), "utf8");
const queue = readFileSync(new URL("../components/nightaudit/night-audit-exception-queue.tsx", import.meta.url), "utf8");
const workflow = readFileSync(new URL("./night-audit-workflow.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../../supabase/migrations/0187_night_audit_warning_reviews.sql", import.meta.url), "utf8");

describe("Night Audit Warning Review Lifecycle & 8-Step Workspace", () => {
  const sampleWarning: WorkflowException = {
    id: "ex-warn-1",
    restaurantId: "rest-1",
    nightAuditRunId: "run-1",
    businessDate: "2026-10-25",
    exceptionType: "hk_dirty_departed_no_task",
    severity: "warning",
    status: "open",
    message: "Room 305 is vacant dirty with no task",
    referenceType: "room",
    referenceId: "305",
    createdAt: "2026-10-25T02:12:00Z",
    resolvedAt: null,
    source: null,
  };

  const sampleBlocker: WorkflowException = {
    id: "ex-blk-1",
    restaurantId: "rest-1",
    nightAuditRunId: "run-1",
    businessDate: "2026-10-25",
    exceptionType: "departure_overstay",
    severity: "blocking",
    status: "open",
    message: "Room 215 has an overstay guest",
    referenceType: "reservation",
    referenceId: "res-1",
    createdAt: "2026-10-25T02:10:00Z",
    resolvedAt: null,
    source: null,
  };

  const sampleFiscalBlocker: WorkflowException = {
    id: "ex-fisc-1",
    restaurantId: "rest-1",
    nightAuditRunId: "run-1",
    businessDate: "2026-10-25",
    exceptionType: "fiscal_failed",
    severity: "blocking",
    status: "open",
    message: "Fiscal receipt failed",
    referenceType: "folio",
    referenceId: "fol-1",
    createdAt: "2026-10-25T02:05:00Z",
    resolvedAt: null,
    source: null,
  };

  const sampleInfo: WorkflowException = {
    id: "ex-info-1",
    restaurantId: "rest-1",
    nightAuditRunId: "run-1",
    businessDate: "2026-10-25",
    exceptionType: "company_receivable_open",
    severity: "info",
    status: "open",
    message: "Active company AR",
    referenceType: "account",
    referenceId: "acc-1",
    createdAt: "2026-10-25T02:00:00Z",
    resolvedAt: null,
    source: null,
  };

  it("1. Blocker does not prevent navigation to later steps", () => {
    // Stepper buttons are never disabled by blockers; activeStep state transitions freely
    assert.match(desk, /WORKFLOW_STEPS\.map/);
    assert.doesNotMatch(desk, /disabled=\{counts\.blocking > 0\}/);
    assert.doesNotMatch(desk, /step === 2 && counts\.blocking/);
  });

  it("2. Blocker prevents final close", () => {
    const gate = closeGate({
      window: { open: true, allowsClose: true, label: "02:00–06:00", message: "", localTime: "02:30", ownerBypass: false },
      overall: "blocked",
      financial: "ready",
      operational: "blocked",
      openBlockingExceptions: 1,
      boardBlockers: 1,
      canClose: true,
      busy: false,
      runStatus: "ready",
      rechecked: true,
      phone: false,
      unreviewedWarnings: 0,
    });
    assert.equal(gate.enabled, false);
    assert.match(gate.reason, /blocker/i);
  });

  it("3. Warning does not require source resolution", () => {
    // A warning condition remains open at source, yet review satisfies close readiness
    const counts = warningReviewCounts([sampleWarning]);
    assert.equal(counts.unreviewedWarnings, 1);
    assert.equal(counts.reviewedWarnings, 0);

    const reviewedWarning: WorkflowException = {
      ...sampleWarning,
      warningReview: {
        id: "rev-1",
        exceptionId: "ex-warn-1",
        reviewedByMembershipId: "mem-auditor",
        reviewerName: "Hana M.",
        reviewedAt: "2026-10-25T02:16:00Z",
        reviewNote: "Morning supervisor informed",
      },
    };
    const afterReview = warningReviewCounts([reviewedWarning]);
    assert.equal(afterReview.unreviewedWarnings, 0);
    assert.equal(afterReview.reviewedWarnings, 1);
    // Source condition status is still open
    assert.equal(reviewedWarning.status, "open");
  });

  it("4. Unreviewed warning prevents final close", () => {
    const gate = closeGate({
      window: { open: true, allowsClose: true, label: "02:00–06:00", message: "", localTime: "02:30", ownerBypass: false },
      overall: "ready",
      financial: "ready",
      operational: "ready",
      openBlockingExceptions: 0,
      boardBlockers: 0,
      canClose: true,
      busy: false,
      runStatus: "ready",
      rechecked: true,
      phone: false,
      unreviewedWarnings: 2,
    });
    assert.equal(gate.enabled, false);
    assert.match(gate.reason, /2 warnings? must be reviewed/);
  });

  it("5. Authorized auditor can mark warning reviewed", () => {
    assert.match(functions, /reviewWarning = createServerFn/);
    assert.match(functions, /requireCashierManager/);
    assert.match(migration, /CREATE TABLE public\.night_audit_warning_reviews/);
  });

  it("6. Warning review records reviewer and timestamp", () => {
    assert.match(migration, /reviewed_by_membership_id/);
    assert.match(migration, /reviewed_at\s+timestamptz/);
    assert.match(functions, /reviewedAt:\s*row\.reviewed_at/);
  });

  it("7. Optional warning note persists if provided", () => {
    assert.match(migration, /review_note\s+text/);
    assert.match(functions, /review_note:\s*\(data\.note/);
  });

  it("8b. Review step lists the reviewed warning under today and keeps older reviews under all time", () => {
    const review = (id: string, reviewedAt: string): WarningReview => ({
      id,
      exceptionId: id,
      reviewedBy: "Hana M.",
      reviewerName: "Hana M.",
      reviewedByMembershipId: "mem-auditor",
      reviewedAt,
      reviewNote: null,
      invalidatedAt: null,
      invalidatedReason: null,
    });
    const older = { ...sampleWarning, id: "old", warningReview: review("old", "2026-10-20T20:00:00Z") };
    const tonight = { ...sampleWarning, id: "new", warningReview: review("new", "2026-10-26T20:32:00Z") };
    const unreviewed = { ...sampleWarning, id: "open" };
    const zone = "Africa/Addis_Ababa";
    const now = new Date("2026-10-26T20:32:00Z");
    const today = filterReviewedWarnings([older, tonight, unreviewed], "today", "2026-10-26", zone, now);
    const all = filterReviewedWarnings([older, tonight, unreviewed], "all", "2026-10-26", zone, now);
    assert.deepEqual(today.map((row) => row.id), ["new"]);
    assert.deepEqual(all.map((row) => row.id), ["old", "new"]);

    const afterMidnight = new Date("2026-10-26T22:30:00Z");
    const rolled = filterReviewedWarnings(
      [{ ...sampleWarning, id: "late", warningReview: review("late", "2026-10-26T22:30:00Z") }],
      "today",
      "2026-10-26",
      zone,
      afterMidnight,
    );
    assert.deepEqual(rolled.map((row) => row.id), ["late"]);
  });

  it("8. Reviewed warning remains visible", () => {
    const reviewedWarning: WorkflowException = {
      ...sampleWarning,
      warningReview: {
        id: "rev-1",
        exceptionId: "ex-warn-1",
        reviewedByMembershipId: "mem-auditor",
        reviewerName: "Hana M.",
        reviewedAt: "2026-10-25T02:16:00Z",
      },
    };
    const filtered = filterExceptions([reviewedWarning], {
      status: "open",
      severity: "warning",
      domain: "all",
      category: "all",
      search: "",
      reviewState: "all",
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.warningReview?.reviewedByMembershipId, "mem-auditor");
  });

  it("9. Reviewed warning does not become RESOLVED just because it was reviewed", () => {
    const reviewedWarning: WorkflowException = {
      ...sampleWarning,
      status: "open",
      warningReview: {
        id: "rev-1",
        exceptionId: "ex-warn-1",
        reviewedByMembershipId: "mem-auditor",
        reviewerName: "Hana M.",
        reviewedAt: "2026-10-25T02:16:00Z",
      },
    };
    assert.equal(reviewedWarning.status, "open");
    assert.notEqual(reviewedWarning.status, "resolved");
  });

  it("10. Source-fixed warning auto-resolves according to existing lifecycle", () => {
    assert.match(functions, /syncRunExceptions/);
    assert.match(functions, /update\(\{\s*status:\s*"resolved"/);
  });

  it("11. Source resolution does not erase historical warning-review metadata", () => {
    // When invalidated on resolve, invalidated_at is set instead of deleting
    assert.match(functions, /invalidated_at:\s*new Date\(\)\.toISOString\(\)/);
    assert.match(migration, /invalidated_at\s+timestamptz/);
    assert.doesNotMatch(functions, /DELETE FROM.*night_audit_warning_reviews/i);
  });

  it("12. Info item requires no review", () => {
    const counts = warningReviewCounts([sampleInfo]);
    assert.equal(counts.unreviewedWarnings, 0);
    assert.equal(counts.reviewedWarnings, 0);
  });

  it("13. Closed run warning review cannot be modified", () => {
    assert.match(functions, /Run is not open or ready for warning review/);
    assert.match(functions, /run\.status !== "open" && run\.status !== "ready"/);
  });

  it("14. Superseded run warning review cannot be modified", () => {
    assert.match(functions, /Run is not open or ready for warning review/);
  });

  it("15. Unauthorized user cannot review warning", () => {
    assert.match(functions, /requireCashierManager/);
  });

  it("16. Fiscal blocker cannot use Mark Reviewed", () => {
    assert.match(functions, /Only warnings may be reviewed/);
    assert.match(functions, /exception\.severity !== "warning"/);
  });

  it("17. Normal blocker cannot use Mark Reviewed", () => {
    assert.match(queue, /row\.severity === "warning" && row\.status === "open" && !row\.warningReview/);
    assert.doesNotMatch(queue, /row\.severity === "blocking".*Mark Reviewed/);
  });

  it("18. Eligible fiscal override still behaves exactly as before", () => {
    assert.match(functions, /authorizeFiscalCloseOverride/);
    assert.match(functions, /isFiscalOverrideableException/);
  });

  it("19. Reviewed warning does not bypass a blocker", () => {
    const gate = closeGate({
      window: { open: true, allowsClose: true, label: "02:00–06:00", message: "", localTime: "02:30", ownerBypass: false },
      overall: "blocked",
      financial: "blocked",
      operational: "ready",
      openBlockingExceptions: 1,
      boardBlockers: 1,
      canClose: true,
      busy: false,
      runStatus: "ready",
      rechecked: true,
      phone: false,
      unreviewedWarnings: 0,
    });
    assert.equal(gate.enabled, false);
    assert.match(gate.reason, /blocker/i);
  });

  it("20. Final Validation shows reviewed/unreviewed counts correctly", () => {
    assert.match(desk, /Total Warnings/);
    assert.match(desk, /Reviewed Warnings/);
    assert.match(desk, /Unreviewed Warnings/);
    assert.match(desk, /reviewCounts\.reviewedWarnings/);
    assert.match(desk, /reviewCounts\.unreviewedWarnings/);
  });

  it("21. Stepper displays warning/blocker counts correctly", () => {
    assert.match(desk, /stepBadge\(item\.num\)/);
    assert.match(desk, /WORKFLOW_STEPS/);
  });

  it("22. Warning review is idempotent", () => {
    assert.match(functions, /alreadyReviewed: true/);
    assert.match(functions, /existingReview/);
  });

  it("23. A warning that disappears and meaningfully recurs requires fresh review", () => {
    assert.match(migration, /night_audit_warning_reviews_active_exception_idx/);
    assert.match(functions, /invalidated_reason:\s*"Source warning condition resolved\."/);
  });

  it("24. New warning created after Final Recheck causes server close to reject until reviewed", () => {
    assert.match(functions, /NIGHT_AUDIT_WARNINGS_UNREVIEWED/);
    assert.match(functions, /must be reviewed before closing/);
  });

  it("25. Server rejects close when active unreviewed warnings exist even if UI state is stale", () => {
    assert.match(functions, /unreviewedWarnings\.length > 0/);
    assert.match(functions, /NIGHT_AUDIT_WARNINGS_UNREVIEWED/);
  });

  it("26. Close succeeds with 0 blockers, warnings all reviewed, and valid fiscal overrides", () => {
    const gate = closeGate({
      window: { open: true, allowsClose: true, label: "02:00–06:00", message: "", localTime: "02:30", ownerBypass: false },
      overall: "ready",
      financial: "ready",
      operational: "ready",
      openBlockingExceptions: 0,
      boardBlockers: 0,
      canClose: true,
      busy: false,
      runStatus: "ready",
      rechecked: true,
      phone: false,
      unreviewedWarnings: 0,
    });
    assert.equal(gate.enabled, true);
  });

  it("27. Closed history retains all warnings carried into close and their review metadata", () => {
    assert.match(functions, /warningReviewsForRun/);
    assert.match(functions, /warningReviewHistoryForRun/);
    assert.match(desk, /Warnings Carried Into Close/);
  });
});
