/**
 * P7-STEP-03 — Approval UI copy, labels, and mutation result handling.
 */

import type { QueryClient } from "@tanstack/react-query";

import type { RevenueApprovalTab } from "./revenue-context";
import type {
  RevenueApprovalDomain,
  RevenueApprovalStatus,
  RevenueMutationResult,
} from "./revenue-approval";
import type { RevenueApprovalDisplaySnapshot } from "./revenue-approval";

export const REVENUE_APPROVAL_QUERY_KEY = "revenue-approvals";
export const REVENUE_APPROVAL_POLICY_QUERY_KEY = "revenue-approval-policy";
export const REVENUE_APPROVAL_PAGE_SIZES = [10, 25, 50] as const;
export const REVENUE_APPROVAL_DEFAULT_PAGE_SIZE = 25;

export const APPROVAL_STAFF_FALLBACK = "Staff member";
export const APPROVAL_REASON_EMPTY = "No reason provided";

export const APPROVAL_PENDING_EMPTY = "No approvals are waiting for review.";
export const APPROVAL_MINE_EMPTY = "You have not submitted any approval requests.";
export const APPROVAL_HISTORY_EMPTY = "No reviewed approval requests yet.";
export const APPROVAL_DISABLED_EMPTY =
  "Approval workflow is currently disabled. Operational changes apply immediately.";

export const APPROVAL_POLICY_ENABLED_HELP =
  "Operational Rate & Revenue changes are submitted for approval before they are applied.";
export const APPROVAL_POLICY_DISABLED_HELP =
  "Rate, restriction, promotion, and package changes apply immediately.";
export const APPROVAL_POLICY_ENABLE_CONFIRM =
  "New Rate & Revenue changes will require approval before they are applied.";
export const APPROVAL_POLICY_DISABLE_CONFIRM =
  "New changes will apply immediately. Existing pending requests are not automatically applied.";

export const APPROVE_APPLY_LABEL = "Approve & Apply";
export const APPROVE_CONFIRM_COPY = "Approve and apply this requested change?";
export const REJECT_REASON_REQUIRED = "A review reason is required to reject this request.";
export const REJECT_CONFIRM_COPY = "Reject this approval request?";
export const CANCEL_CONFIRM_COPY = "Cancel this pending request?";
export const CANCEL_CONFIRM_HELP = "The proposed change will not be applied.";
export const SELF_APPROVAL_BLOCKED_COPY = "Another authorized approver must review this request.";
export const APPROVAL_STALE_COPY =
  "This request is stale because the underlying configuration changed after submission.";
export const APPROVAL_STALE_HELP = "Create a new request from the current Rate & Revenue workflow.";
export const APPROVAL_APPLIED_TOAST = "Approval applied";
export const APPROVAL_CURRENT_STATE_CHANGED = "Current state changed";

export const RATE_SUBMITTED_TOAST = "Rate change submitted for approval.";
export const BULK_RATE_SUBMITTED_TOAST = "Bulk rate change submitted for approval.";
export const RESTRICTION_SUBMITTED_TOAST = "Restriction change submitted for approval.";
export const PROMOTION_SUBMITTED_TOAST = "Promotion activation submitted for approval.";
export const PACKAGE_SUBMITTED_TOAST = "Package activation submitted for approval.";

export const SUBMIT_FOR_APPROVAL_LABEL = "Submit for Approval";

export function approvalRequestSearch(approvalRequestId: string) {
  return {
    view: "approvals" as const,
    approvalTab: "mine" as const,
    approvalRequest: approvalRequestId,
  };
}

export function parseApprovalTab(value?: string | null): RevenueApprovalTab {
  if (value === "mine" || value === "history") return value;
  return "pending";
}

export function revenueApprovalDomainLabel(domain: RevenueApprovalDomain | string): string {
  if (domain === "rate") return "Rates";
  if (domain === "restriction") return "Restrictions";
  if (domain === "promotion_activation") return "Promotion";
  if (domain === "package_activation") return "Package";
  return domain;
}

export function revenueApprovalStatusLabel(status: RevenueApprovalStatus | string): string {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "cancelled") return "Cancelled";
  if (status === "stale") return "Stale";
  return status;
}

export function revenueApprovalRequesterLabel(label?: string | null): string {
  const trimmed = (label ?? "").trim();
  return trimmed || APPROVAL_STAFF_FALLBACK;
}

export function revenueApprovalReasonLabel(reason?: string | null): string {
  const trimmed = (reason ?? "").trim();
  return trimmed || APPROVAL_REASON_EMPTY;
}

export function revenueApprovalScopeLabel(
  snapshot?: RevenueApprovalDisplaySnapshot | null,
): string {
  if (!snapshot) return "—";
  const dates =
    snapshot.dateFrom && snapshot.dateTo
      ? snapshot.dateFrom === snapshot.dateTo
        ? snapshot.dateFrom
        : `${snapshot.dateFrom} – ${snapshot.dateTo}`
      : snapshot.dateFrom || snapshot.dateTo || null;
  const rooms = snapshot.roomTypeNames.length ? snapshot.roomTypeNames.join(", ") : null;
  const plans = snapshot.ratePlanNames.length ? snapshot.ratePlanNames.join(", ") : null;
  return [dates, rooms, plans].filter(Boolean).join(" · ") || "—";
}

export function commercialProposalActionLabel(input: {
  operation?: string | null;
  kind: "promotion" | "package";
  reactivate?: boolean;
}): string {
  if (input.reactivate) {
    return input.kind === "package" ? "Reactivate Package" : "Reactivate Promotion";
  }
  if (input.operation === "CREATE")
    return input.kind === "package" ? "Activate Package" : "Activate Promotion";
  if (input.operation === "DEACTIVATE")
    return input.kind === "package" ? "Deactivate Package" : "Deactivate Promotion";
  return input.kind === "package" ? "Edit Package" : "Edit Promotion";
}

export function isRevenueMutationSubmitted(
  result: { mode?: string } | null | undefined,
): result is { mode: "submitted_for_approval"; approvalRequestId: string; summary: string } {
  return result?.mode === "submitted_for_approval";
}

export function handleRevenueMutationResult<TApplied>(result: RevenueMutationResult<TApplied>): {
  submitted: boolean;
  applied: boolean;
  approvalRequestId: string | null;
  invalidateApprovals: boolean;
  invalidateDomain: boolean;
} {
  if (isRevenueMutationSubmitted(result)) {
    return {
      submitted: true,
      applied: false,
      approvalRequestId: result.approvalRequestId,
      invalidateApprovals: true,
      invalidateDomain: false,
    };
  }
  return {
    submitted: false,
    applied: true,
    approvalRequestId: null,
    invalidateApprovals: false,
    invalidateDomain: true,
  };
}

export function revenueApprovalQueryKey(restaurantId: string, extra?: unknown) {
  return extra === undefined
    ? [REVENUE_APPROVAL_QUERY_KEY, restaurantId]
    : [REVENUE_APPROVAL_QUERY_KEY, restaurantId, extra];
}

export function invalidateRevenueApprovals(queryClient: QueryClient, restaurantId?: string) {
  void queryClient.invalidateQueries({
    queryKey: restaurantId
      ? [REVENUE_APPROVAL_QUERY_KEY, restaurantId]
      : [REVENUE_APPROVAL_QUERY_KEY],
  });
}

export function domainQueryKeysForApproval(domain: RevenueApprovalDomain | string): string[][] {
  if (domain === "rate") {
    return [["revenue-rate-calendar"], ["revenue-control"], ["rate-change-history"]];
  }
  if (domain === "restriction") {
    return [
      ["revenue-rate-calendar"],
      ["revenue-control"],
      ["restriction-change-history"],
      ["rate-restrictions"],
    ];
  }
  if (domain === "promotion_activation") {
    return [
      ["commercial-overview"],
      ["commercial-promotions"],
      ["commercial-change-history"],
      ["commercial-activation-history"],
    ];
  }
  if (domain === "package_activation") {
    return [
      ["commercial-overview"],
      ["commercial-packages"],
      ["commercial-change-history"],
      ["commercial-activation-history"],
    ];
  }
  return [];
}

export function invalidateApprovalAffectedDomain(
  queryClient: QueryClient,
  domain: RevenueApprovalDomain | string,
) {
  for (const queryKey of domainQueryKeysForApproval(domain)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

export function historyViewForApprovalDomain(
  domain: RevenueApprovalDomain | string,
): "rate-history" | "restriction-history" | "commercial-history" {
  if (domain === "rate") return "rate-history";
  if (domain === "restriction") return "restriction-history";
  return "commercial-history";
}
