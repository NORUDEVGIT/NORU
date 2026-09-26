import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  foundationRevenueViews,
  implementedRevenueViews,
  REVENUE_UI_SCREEN_MAP,
} from "../rate-revenue-workspace.ts";
import { resolveRevenueAccess } from "./revenue-access.ts";
import {
  APPROVAL_DISABLED_EMPTY,
  APPROVAL_HISTORY_EMPTY,
  APPROVAL_MINE_EMPTY,
  APPROVAL_PENDING_EMPTY,
  APPROVAL_POLICY_DISABLE_CONFIRM,
  APPROVAL_POLICY_ENABLE_CONFIRM,
  APPROVAL_STALE_COPY,
  APPROVAL_STALE_HELP,
  APPROVE_APPLY_LABEL,
  APPROVE_CONFIRM_COPY,
  BULK_RATE_SUBMITTED_TOAST,
  PACKAGE_SUBMITTED_TOAST,
  PROMOTION_SUBMITTED_TOAST,
  RATE_SUBMITTED_TOAST,
  REJECT_REASON_REQUIRED,
  RESTRICTION_SUBMITTED_TOAST,
  REVENUE_APPROVAL_ACTORS_QUERY_KEY,
  REVENUE_APPROVAL_QUERY_KEY,
  SELF_APPROVAL_BLOCKED_COPY,
  SUBMIT_FOR_APPROVAL_LABEL,
  commercialProposalActionLabel,
  handleRevenueMutationResult,
  historyViewForApprovalDomain,
  parseApprovalTab,
  revenueApprovalActorsQueryKey,
  revenueApprovalDomainLabel,
  revenueApprovalReasonLabel,
  revenueApprovalScopeLabel,
} from "./revenue-approval-ui.ts";
import { serializeRevenueSearch } from "./revenue-context.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("P7-STEP-03 approval UI", () => {
  it("enables the approvals workspace and mounts ApprovalsView", () => {
    assert.ok(implementedRevenueViews().includes("approvals"));
    assert.ok(!foundationRevenueViews().includes("approvals"));
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-26")?.view, "approvals");
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-27")?.view, null);
    assert.equal(
      REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-28")?.note?.includes("My Requests"),
      true,
    );
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-29")?.view, null);
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-30")?.view, "approvals");
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /case "approvals"/);
    assert.match(workspace, /<ApprovalsView/);
    assert.match(workspace, /approvalTab=\{search\.approvalTab\}/);
    assert.match(workspace, /approvalRequest=\{search\.approvalRequest\}/);
    assert.doesNotMatch(workspace, /<ApprovalsView[\s\S]*?search=\{search\}/);
    assert.doesNotMatch(workspace, /<ApprovalsView[\s\S]*?onNavigateView=\{selectView\}/);
    assert.ok(existsSync(join(here, "../../components/rates/approvals/approvals-view.tsx")));
    assert.ok(
      existsSync(join(here, "../../components/rates/approvals/approval-detail-drawer.tsx")),
    );
  });

  it("exposes pending, mine, and history tabs", () => {
    const tabs = readRel("../../components/rates/approvals/approval-tabs.tsx");
    const view = readRel("../../components/rates/approvals/approvals-view.tsx");
    assert.match(tabs, /Pending/);
    assert.match(tabs, /My Requests/);
    assert.match(tabs, /History/);
    assert.equal(parseApprovalTab(undefined), "pending");
    assert.equal(parseApprovalTab("mine"), "mine");
    assert.equal(parseApprovalTab("history"), "history");
    assert.match(view, /status: "pending"/);
    assert.match(view, /requestedBy: access.membershipId/);
    assert.match(view, /REVENUE_APPROVAL_TERMINAL_STATUSES/);
    assert.match(view, /APPROVAL_PENDING_EMPTY/);
    assert.match(view, /APPROVAL_MINE_EMPTY/);
    assert.match(view, /APPROVAL_HISTORY_EMPTY/);
    assert.equal(APPROVAL_PENDING_EMPTY, "No approvals are waiting for review.");
    assert.equal(APPROVAL_MINE_EMPTY, "You have not submitted any approval requests.");
    assert.equal(APPROVAL_HISTORY_EMPTY, "No reviewed approval requests yet.");
    assert.match(APPROVAL_DISABLED_EMPTY, /Approval workflow is currently disabled/);
  });

  it("renders drawer sections without raw JSON", () => {
    const drawer = readRel("../../components/rates/approvals/approval-detail-drawer.tsx");
    const rate = readRel("../../components/rates/approvals/approval-proposal-rate.tsx");
    const restriction = readRel(
      "../../components/rates/approvals/approval-proposal-restriction.tsx",
    );
    const promotion = readRel("../../components/rates/approvals/approval-proposal-promotion.tsx");
    const pkg = readRel("../../components/rates/approvals/approval-proposal-package.tsx");
    assert.match(drawer, /Proposed Change/);
    assert.match(drawer, /Current State \/ Warnings/);
    assert.match(drawer, /Events/);
    assert.match(drawer, /Approve & Apply|APPROVE_APPLY_LABEL/);
    assert.match(drawer, /Reject/);
    assert.match(drawer, /Cancel Request/);
    assert.match(drawer, /View Applied Change/);
    assert.match(drawer, /SELF_APPROVAL_BLOCKED_COPY/);
    assert.doesNotMatch(drawer, /JSON\.stringify/);
    assert.doesNotMatch(rate, /JSON\.stringify/);
    assert.doesNotMatch(restriction, /JSON\.stringify/);
    assert.doesNotMatch(promotion, /JSON\.stringify/);
    assert.doesNotMatch(pkg, /JSON\.stringify/);
    assert.match(rate, /SET_RATE/);
    assert.match(rate, /PERCENT_INCREASE/);
    assert.match(rate, /RESET_OVERRIDE/);
    assert.match(rate, /COPY_FROM_DATE/);
    assert.match(restriction, /Stop Sell/);
    assert.match(restriction, /CTA/);
    assert.match(restriction, /CTD/);
    assert.match(restriction, /Min Stay/);
    assert.match(promotion, /Reactivate Promotion|commercialProposalActionLabel/);
    assert.match(pkg, /Reactivate Package|commercialProposalActionLabel/);
    assert.equal(
      commercialProposalActionLabel({ kind: "promotion", reactivate: true }),
      "Reactivate Promotion",
    );
    assert.equal(
      commercialProposalActionLabel({ kind: "package", reactivate: true }),
      "Reactivate Package",
    );
    assert.equal(revenueApprovalDomainLabel("rate"), "Rates");
    assert.equal(revenueApprovalDomainLabel("restriction"), "Restrictions");
    assert.equal(revenueApprovalDomainLabel("promotion_activation"), "Promotion");
    assert.equal(revenueApprovalDomainLabel("package_activation"), "Package");
    assert.equal(
      revenueApprovalScopeLabel({
        summary: "x",
        operationLabel: "SET_RATE",
        roomTypeNames: ["Deluxe"],
        ratePlanNames: ["BAR"],
        dateFrom: "2026-10-01",
        dateTo: "2026-10-03",
      }),
      "2026-10-01 – 2026-10-03 · Deluxe · BAR",
    );
  });

  it("keeps Approve & Apply wording, reject reason, and stale copy", () => {
    const dialog = readRel("../../components/rates/approvals/approval-action-dialog.tsx");
    const drawer = readRel("../../components/rates/approvals/approval-detail-drawer.tsx");
    const policy = readRel("../../components/rates/approvals/approval-policy-control.tsx");
    assert.equal(APPROVE_APPLY_LABEL, "Approve & Apply");
    assert.equal(APPROVE_CONFIRM_COPY, "Approve and apply this requested change?");
    assert.match(dialog, /REJECT_REASON_REQUIRED|review reason/i);
    assert.equal(REJECT_REASON_REQUIRED.includes("required"), true);
    assert.match(drawer, /APPROVAL_STALE_COPY/);
    assert.match(drawer, /APPROVAL_STALE_HELP/);
    assert.equal(APPROVAL_STALE_COPY.includes("configuration changed after submission"), true);
    assert.equal(APPROVAL_STALE_HELP.includes("Create a new request"), true);
    assert.equal(
      SELF_APPROVAL_BLOCKED_COPY,
      "Another authorized approver must review this request.",
    );
    assert.match(policy, /APPROVAL_POLICY_ENABLED_HELP|Approval Workflow/);
    assert.equal(
      APPROVAL_POLICY_ENABLE_CONFIRM,
      "New Rate & Revenue changes will require approval before they are applied.",
    );
    assert.equal(
      APPROVAL_POLICY_DISABLE_CONFIRM,
      "New changes will apply immediately. Existing pending requests are not automatically applied.",
    );
  });

  it("history excludes pending and uses server pagination", () => {
    const view = readRel("../../components/rates/approvals/approvals-view.tsx");
    assert.match(view, /REVENUE_APPROVAL_TERMINAL_STATUSES/);
    assert.doesNotMatch(view.slice(view.indexOf('tab === "history"')), /status: "pending"/);
    assert.match(view, /Requested By/);
    assert.match(view, /Reviewed By/);
    assert.match(view, /REVENUE_APPROVAL_PAGE_SIZES/);
    assert.match(view, /10/);
    assert.match(view, /25/);
    assert.match(view, /50/);
    assert.match(view, /listRevenueApprovalRequestsFn/);
  });

  it("wires Submit for Approval mutation UX and query keys", () => {
    const rateEdit = readRel("../../components/rates/rate-detail/rate-edit-form.tsx");
    const bulk = readRel("../../components/rates/bulk-rate-change/bulk-rate-change-view.tsx");
    const restriction = readRel(
      "../../components/rates/restriction-detail/restriction-edit-form.tsx",
    );
    const promo = readRel(
      "../../components/rates/commercial-activation/promotion-activation-flow.tsx",
    );
    const pkg = readRel("../../components/rates/commercial-activation/package-activation-flow.tsx");
    const drawer = readRel("../../components/rates/approvals/approvals-view.tsx");
    assert.match(rateEdit, /SUBMIT_FOR_APPROVAL_LABEL/);
    assert.match(rateEdit, /handleRevenueMutationResult/);
    assert.match(rateEdit, /RATE_SUBMITTED_TOAST/);
    assert.match(rateEdit, /invalidateRevenueApprovals/);
    assert.match(bulk, /handleRevenueMutationResult/);
    assert.match(bulk, /invalidateRevenueApprovals/);
    assert.match(restriction, /RESTRICTION_SUBMITTED_TOAST/);
    assert.match(promo, /PROMOTION_SUBMITTED_TOAST/);
    assert.match(promo, /SUBMIT_FOR_APPROVAL_LABEL/);
    assert.match(pkg, /PACKAGE_SUBMITTED_TOAST/);
    assert.equal(SUBMIT_FOR_APPROVAL_LABEL, "Submit for Approval");
    assert.equal(RATE_SUBMITTED_TOAST, "Rate change submitted for approval.");
    assert.equal(BULK_RATE_SUBMITTED_TOAST, "Bulk rate change submitted for approval.");
    assert.equal(RESTRICTION_SUBMITTED_TOAST, "Restriction change submitted for approval.");
    assert.equal(PROMOTION_SUBMITTED_TOAST, "Promotion activation submitted for approval.");
    assert.equal(PACKAGE_SUBMITTED_TOAST, "Package activation submitted for approval.");
    const submitted = handleRevenueMutationResult({
      mode: "submitted_for_approval",
      approvalRequestId: "11111111-1111-4111-8111-111111111111",
      summary: "Set BAR",
    });
    assert.equal(submitted.submitted, true);
    assert.equal(submitted.invalidateApprovals, true);
    assert.equal(submitted.invalidateDomain, false);
    const applied = handleRevenueMutationResult({
      mode: "applied",
      operationId: "op",
      appliedCount: 1,
    } as never);
    assert.equal(applied.applied, true);
    assert.equal(applied.invalidateDomain, true);
    assert.equal(applied.invalidateApprovals, false);
    assert.equal(REVENUE_APPROVAL_QUERY_KEY, "revenue-approvals");
    assert.match(drawer, /invalidateApprovalAffectedDomain/);
    assert.match(drawer, /APPROVAL_APPLIED_TOAST/);
    assert.equal(historyViewForApprovalDomain("rate"), "rate-history");
    assert.equal(historyViewForApprovalDomain("restriction"), "restriction-history");
    assert.equal(historyViewForApprovalDomain("promotion_activation"), "commercial-history");
  });

  it("enables canApprove for owner and manager", () => {
    assert.equal(resolveRevenueAccess("owner").canApprove, true);
    assert.equal(resolveRevenueAccess("manager").canApprove, true);
    assert.equal(resolveRevenueAccess("accountant").canApprove, false);
    const server = readRel("./revenue-approval.server.ts");
    assert.match(server, /canReview/);
    assert.match(server, /selfApprovalBlocked/);
    assert.match(server, /canSelfApproveRevenueRequest/);
  });

  it("resolves history table reason preferring reviewReason over requestReason", () => {
    // Approved with review note
    const approved = { requestReason: "Increase BAR", reviewReason: "Approved for event weekend" };
    assert.equal(
      revenueApprovalReasonLabel(approved.reviewReason ?? approved.requestReason),
      "Approved for event weekend",
    );

    // Rejected with rejection reason
    const rejected = { requestReason: "Close OTA", reviewReason: "Inventory risk too high" };
    assert.equal(
      revenueApprovalReasonLabel(rejected.reviewReason ?? rejected.requestReason),
      "Inventory risk too high",
    );

    // Cancelled / no review reason -> fallback to requestReason
    const cancelled = { requestReason: "Close OTA", reviewReason: null };
    assert.equal(
      revenueApprovalReasonLabel(cancelled.reviewReason ?? cancelled.requestReason),
      "Close OTA",
    );

    // No reason provided
    const empty = { requestReason: null, reviewReason: null };
    assert.equal(
      revenueApprovalReasonLabel(empty.reviewReason ?? empty.requestReason),
      "No reason provided",
    );
  });

  it("exposes actors query key and wires actors filter in approvals-view", () => {
    assert.equal(REVENUE_APPROVAL_ACTORS_QUERY_KEY, "revenue-approval-actors");
    assert.deepEqual(revenueApprovalActorsQueryKey("rest-1"), [
      "revenue-approval-actors",
      "rest-1",
    ]);
    const view = readRel("../../components/rates/approvals/approvals-view.tsx");
    assert.match(view, /listRevenueApprovalActorsFn/);
    assert.match(view, /revenueApprovalActorsQueryKey/);
    const table = readRel("../../components/rates/approvals/approval-table.tsx");
    assert.match(table, /row\.reviewReason \?\? row\.requestReason/);
  });

  it("serializes approval params only when view is approvals", () => {
    const dummyContext = {
      fromDate: "2026-06-01",
      toDate: "2026-06-07",
      roomTypeId: null,
      ratePlanId: null,
      marketSegmentId: null,
      commercialSourceId: null,
      salesChannelId: null,
    };
    const approvalsSearch = serializeRevenueSearch("approvals", dummyContext, {
      approvalTab: "history",
      approvalRequest: "req-123",
    });
    assert.equal(approvalsSearch.view, "approvals");
    assert.equal(approvalsSearch.approvalTab, "history");
    assert.equal(approvalsSearch.approvalRequest, "req-123");

    const rateSearch = serializeRevenueSearch("rate-calendar", dummyContext, {
      approvalTab: "history",
      approvalRequest: "req-123",
    });
    assert.equal(rateSearch.view, "rate-calendar");
    assert.equal(rateSearch.approvalTab, undefined);
    assert.equal(rateSearch.approvalRequest, undefined);
  });
});
