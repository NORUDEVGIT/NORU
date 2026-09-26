/**
 * P7-STEP-02 — Approval policy, lifecycle, and official apply branching.
 * Domain mutation stays in existing apply RPCs.
 */

import { rateError } from "../rates.server.ts";
import { applyStoredPackageActivation } from "./commercial-package-activation.server.ts";
import { applyStoredPromotionActivation } from "./commercial-promotion-activation.server.ts";
import { applyRateChanges } from "./rate-change.server.ts";
import { applyRestrictionChanges } from "./restriction-change.server.ts";
import {
  getRevenueApprovalAdapter,
  parseStoredApprovalProposal,
} from "./revenue-approval-adapters.ts";
import {
  canSelfApproveRevenueRequest,
  isStaleDomainError,
  isTerminalRevenueApprovalStatus,
  policyFromRow,
  revenueApprovalPageBounds,
  type PreparedRevenueApproval,
  type RevenueApprovalDisplaySnapshot,
  type RevenueApprovalDomain,
  type RevenueApprovalEventType,
  type RevenueApprovalPolicy,
  type RevenueApprovalStatus,
  type RevenueApprovalStaleResult,
  type RevenueMutationResult,
} from "./revenue-approval.ts";
import type { RateChangeApplyResult, RateChangeRequest } from "./rate-change.ts";
import type {
  RestrictionChangeApplyResult,
  RestrictionChangeRequest,
} from "./restriction-change.ts";
import type { PackageActivationPreviewInput } from "./commercial-package-activation.ts";
import type { PromotionActivationPreviewInput } from "./commercial-promotion-activation.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type RevenueApprovalActor = {
  membershipId: string;
  userId: string;
};

type ApprovalRequestRow = {
  id: string;
  restaurant_id: string;
  domain: RevenueApprovalDomain;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  status: RevenueApprovalStatus;
  requested_by: string;
  requested_at: string;
  request_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  proposal_payload: Record<string, unknown>;
  display_snapshot: RevenueApprovalDisplaySnapshot | null;
  expected_version: string | null;
  applied_operation_id: string | null;
  created_at: string;
  updated_at: string;
};

type ApprovalEventRow = {
  id: string;
  restaurant_id: string;
  approval_request_id: string;
  event_type: RevenueApprovalEventType;
  actor_id: string;
  reason: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type RevenueApprovalListItem = {
  id: string;
  restaurantId: string;
  domain: RevenueApprovalDomain;
  actionType: string;
  entityType: string;
  entityId: string | null;
  status: RevenueApprovalStatus;
  requestedBy: string;
  requestedByLabel: string;
  requestedAt: string;
  requestReason: string | null;
  reviewedBy: string | null;
  reviewedByLabel: string | null;
  reviewedAt: string | null;
  summary: string;
  expectedVersion: string | null;
  appliedOperationId: string | null;
  displaySnapshot: RevenueApprovalDisplaySnapshot | null;
};

export type RevenueApprovalDetail = RevenueApprovalListItem & {
  proposal: Record<string, unknown>;
  displaySnapshot: RevenueApprovalDisplaySnapshot | null;
  reviewReason: string | null;
  events: Array<{
    id: string;
    eventType: RevenueApprovalEventType;
    actorId: string;
    actorLabel: string;
    reason: string | null;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
  currentStateHint?: { changed: boolean; reason?: string };
  canReview: boolean;
  selfApprovalBlocked: boolean;
};

function rpcError(error: { message?: string } | null): never {
  throw rateError(error?.message ?? "REVENUE_APPROVAL_FORBIDDEN");
}

async function loadActorLabels(
  db: DbClient,
  restaurantId: string,
  membershipIds: Array<string | null>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(membershipIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return names;
  const members = await db
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", unique);
  if (members.error) return names;
  const userIds = [...new Set((members.data ?? []).map((row: { user_id: string }) => row.user_id))];
  const profiles =
    userIds.length > 0
      ? await db.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
      : { data: [], error: null };
  if (profiles.error) return names;
  const byUser = new Map(
    (
      (profiles.data ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>
    ).map((profile) => [
      profile.id,
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
        profile.email ||
        "Staff",
    ]),
  );
  for (const member of (members.data ?? []) as Array<{ id: string; user_id: string }>) {
    names.set(member.id, byUser.get(member.user_id) ?? "Staff");
  }
  return names;
}

function mapListItem(
  row: ApprovalRequestRow,
  labels: Map<string, string>,
): RevenueApprovalListItem {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    domain: row.domain,
    actionType: row.action_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    requestedBy: row.requested_by,
    requestedByLabel: labels.get(row.requested_by) ?? "Staff member",
    requestedAt: row.requested_at,
    requestReason: row.request_reason,
    reviewedBy: row.reviewed_by,
    reviewedByLabel: row.reviewed_by ? (labels.get(row.reviewed_by) ?? "Staff member") : null,
    reviewedAt: row.reviewed_at,
    summary: row.display_snapshot?.summary ?? row.action_type,
    expectedVersion: row.expected_version,
    appliedOperationId: row.applied_operation_id,
    displaySnapshot: row.display_snapshot ?? null,
  };
}

export async function getRevenueApprovalPolicy(
  db: DbClient,
  restaurantId: string,
): Promise<RevenueApprovalPolicy> {
  const result = await db
    .from("hotel_revenue_approval_policy")
    .select("enabled")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) throw rateError(result.error.message);
  return policyFromRow(result.data);
}

export async function setRevenueApprovalPolicy(
  db: DbClient,
  input: { restaurantId: string; enabled: boolean },
): Promise<RevenueApprovalPolicy> {
  const result = await db
    .from("hotel_revenue_approval_policy")
    .upsert(
      {
        restaurant_id: input.restaurantId,
        enabled: input.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id" },
    )
    .select("enabled")
    .maybeSingle();
  if (result.error) throw rateError(result.error.message);
  return policyFromRow(result.data ?? { enabled: input.enabled });
}

export async function countEligibleRevenueApprovers(
  db: DbClient,
  restaurantId: string,
): Promise<number> {
  const result = await db.rpc("count_eligible_revenue_approvers", {
    _restaurant_id: restaurantId,
  });
  if (result.error) throw rateError(result.error.message);
  return Number(result.data ?? 0);
}

async function insertSubmittedRequest(
  db: DbClient,
  prepared: PreparedRevenueApproval,
  actor: RevenueApprovalActor,
): Promise<{ id: string; summary: string }> {
  const result = await db.rpc("submit_hotel_revenue_approval", {
    _restaurant_id: prepared.restaurantId,
    _membership_id: actor.membershipId,
    _domain: prepared.domain,
    _action_type: prepared.actionType,
    _entity_type: prepared.entityType,
    _entity_id: prepared.entityId,
    _request_reason: prepared.requestReason,
    _proposal_payload: prepared.proposalPayload,
    _display_snapshot: prepared.displaySnapshot,
    _expected_version: prepared.expectedVersion,
  });
  if (result.error) rpcError(result.error);
  const payload = (result.data ?? {}) as { id?: string };
  if (!payload.id) throw rateError("REVENUE_APPROVAL_NOT_FOUND");
  return { id: payload.id, summary: prepared.summary };
}

export async function submitRevenueApprovalRequest(
  db: DbClient,
  input: {
    restaurantId: string;
    domain: RevenueApprovalDomain;
    proposal: unknown;
    requestReason?: string | null;
  },
  actor: RevenueApprovalActor,
): Promise<{ id: string; summary: string }> {
  const policy = await getRevenueApprovalPolicy(db, input.restaurantId);
  if (!policy.enabled) throw rateError("REVENUE_APPROVAL_DISABLED");
  const adapter = getRevenueApprovalAdapter(input.domain);
  const prepared = await adapter.prepareSubmit(db, input.proposal);
  if (prepared.restaurantId !== input.restaurantId)
    throw rateError("REVENUE_APPROVAL_WRONG_PROPERTY");
  if (input.requestReason) prepared.requestReason = input.requestReason;
  return insertSubmittedRequest(db, prepared, actor);
}

export async function cancelRevenueApprovalRequest(
  db: DbClient,
  input: { restaurantId: string; approvalRequestId: string },
  actor: RevenueApprovalActor,
): Promise<{ id: string; status: "cancelled" }> {
  const result = await db.rpc("transition_hotel_revenue_approval", {
    _restaurant_id: input.restaurantId,
    _request_id: input.approvalRequestId,
    _membership_id: actor.membershipId,
    _event_type: "cancelled",
    _reason: null,
  });
  if (result.error) rpcError(result.error);
  return { id: input.approvalRequestId, status: "cancelled" };
}

export async function rejectRevenueApprovalRequest(
  db: DbClient,
  input: { restaurantId: string; approvalRequestId: string; reviewReason: string },
  actor: RevenueApprovalActor,
): Promise<{ id: string; status: "rejected" }> {
  if (!input.reviewReason.trim()) throw rateError("REVENUE_APPROVAL_REVIEW_REASON_REQUIRED");
  const result = await db.rpc("transition_hotel_revenue_approval", {
    _restaurant_id: input.restaurantId,
    _request_id: input.approvalRequestId,
    _membership_id: actor.membershipId,
    _event_type: "rejected",
    _reason: input.reviewReason.trim(),
  });
  if (result.error) rpcError(result.error);
  return { id: input.approvalRequestId, status: "rejected" };
}

async function loadRequest(
  db: DbClient,
  restaurantId: string,
  approvalRequestId: string,
): Promise<ApprovalRequestRow> {
  const result = await db
    .from("hotel_revenue_approval_requests")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("id", approvalRequestId)
    .maybeSingle();
  if (result.error) throw rateError(result.error.message);
  if (!result.data) throw rateError("REVENUE_APPROVAL_NOT_FOUND");
  return result.data as ApprovalRequestRow;
}

export async function approveRevenueApprovalRequest(
  db: DbClient,
  input: { restaurantId: string; approvalRequestId: string; reviewReason?: string | null },
  actor: RevenueApprovalActor,
): Promise<
  | RevenueApprovalStaleResult
  | { status: "approved"; approvalRequestId: string; appliedOperationId: string }
> {
  const request = await loadRequest(db, input.restaurantId, input.approvalRequestId);
  if (request.status !== "pending") throw rateError("REVENUE_APPROVAL_NOT_PENDING");
  parseStoredApprovalProposal(request.domain, request.proposal_payload);
  const adapter = getRevenueApprovalAdapter(request.domain);
  const stale = await adapter.checkStale(db, request.proposal_payload);
  if (stale.stale) {
    const transition = await db.rpc("transition_hotel_revenue_approval", {
      _restaurant_id: input.restaurantId,
      _request_id: input.approvalRequestId,
      _membership_id: actor.membershipId,
      _event_type: "stale",
      _reason: stale.reason,
    });
    if (transition.error) rpcError(transition.error);
    return {
      status: "stale",
      reason: stale.reason,
      approvalRequestId: input.approvalRequestId,
    };
  }

  const result = await db.rpc("approve_hotel_revenue_approval", {
    _restaurant_id: input.restaurantId,
    _request_id: input.approvalRequestId,
    _membership_id: actor.membershipId,
    _review_reason: input.reviewReason ?? null,
  });
  if (result.error) {
    if (isStaleDomainError(result.error.message ?? "")) {
      return {
        status: "stale",
        reason: result.error.message ?? "COMMERCIAL_ACTIVATION_STALE",
        approvalRequestId: input.approvalRequestId,
      };
    }
    rpcError(result.error);
  }
  const payload = (result.data ?? {}) as {
    status?: string;
    reason?: string;
    appliedOperationId?: string;
    id?: string;
  };
  if (payload.status === "stale") {
    return {
      status: "stale",
      reason: payload.reason ?? "COMMERCIAL_ACTIVATION_STALE",
      approvalRequestId: payload.id ?? input.approvalRequestId,
    };
  }
  return {
    status: "approved",
    approvalRequestId: payload.id ?? input.approvalRequestId,
    appliedOperationId: payload.appliedOperationId ?? request.applied_operation_id ?? "",
  };
}

export async function listRevenueApprovalRequests(
  db: DbClient,
  query: {
    restaurantId: string;
    status?: RevenueApprovalStatus;
    statuses?: RevenueApprovalStatus[];
    domain?: RevenueApprovalDomain;
    requestedBy?: string;
    reviewedBy?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<{ rows: RevenueApprovalListItem[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize } = revenueApprovalPageBounds(query);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let request = db
    .from("hotel_revenue_approval_requests")
    .select("*", { count: "exact" })
    .eq("restaurant_id", query.restaurantId)
    .order("requested_at", { ascending: false })
    .range(from, to);
  if (query.status) request = request.eq("status", query.status);
  else if (query.statuses?.length) request = request.in("status", query.statuses);
  if (query.domain) request = request.eq("domain", query.domain);
  if (query.requestedBy) request = request.eq("requested_by", query.requestedBy);
  if (query.reviewedBy) request = request.eq("reviewed_by", query.reviewedBy);
  if (query.fromDate) request = request.gte("requested_at", `${query.fromDate}T00:00:00.000Z`);
  if (query.toDate) request = request.lte("requested_at", `${query.toDate}T23:59:59.999Z`);
  const result = await request;
  if (result.error) throw rateError(result.error.message);
  const rows = (result.data ?? []) as ApprovalRequestRow[];
  if (!query.status && !query.statuses?.length) {
    rows.sort((a, b) => {
      const pending = Number(a.status !== "pending") - Number(b.status !== "pending");
      if (pending !== 0) return pending;
      return b.requested_at.localeCompare(a.requested_at);
    });
  }
  const labels = await loadActorLabels(
    db,
    query.restaurantId,
    rows.flatMap((row) => [row.requested_by, row.reviewed_by]),
  );
  return {
    rows: rows.map((row) => mapListItem(row, labels)),
    total: result.count ?? rows.length,
    page,
    pageSize,
  };
}

export async function getRevenueApprovalRequestDetail(
  db: DbClient,
  input: { restaurantId: string; approvalRequestId: string },
  reviewer?: { membershipId: string },
): Promise<RevenueApprovalDetail> {
  const request = await loadRequest(db, input.restaurantId, input.approvalRequestId);
  const eventsResult = await db
    .from("hotel_revenue_approval_events")
    .select("*")
    .eq("restaurant_id", input.restaurantId)
    .eq("approval_request_id", input.approvalRequestId)
    .order("created_at", { ascending: true });
  if (eventsResult.error) throw rateError(eventsResult.error.message);
  const events = (eventsResult.data ?? []) as ApprovalEventRow[];
  const labels = await loadActorLabels(db, input.restaurantId, [
    request.requested_by,
    request.reviewed_by,
    ...events.map((event) => event.actor_id),
  ]);
  const item = mapListItem(request, labels);
  let currentStateHint: { changed: boolean; reason?: string } | undefined;
  if (request.status === "pending") {
    try {
      const stale = await getRevenueApprovalAdapter(request.domain).checkStale(
        db,
        request.proposal_payload,
      );
      currentStateHint = stale.stale ? { changed: true, reason: stale.reason } : { changed: false };
    } catch {
      currentStateHint = undefined;
    }
  }
  let canReview = false;
  let selfApprovalBlocked = false;
  if (request.status === "pending" && reviewer?.membershipId) {
    const eligible = await countEligibleRevenueApprovers(db, input.restaurantId);
    const allowed = canSelfApproveRevenueRequest(
      eligible,
      request.requested_by,
      reviewer.membershipId,
    );
    canReview = allowed;
    selfApprovalBlocked = !allowed && request.requested_by === reviewer.membershipId;
  }
  return {
    ...item,
    proposal: request.proposal_payload,
    displaySnapshot: request.display_snapshot,
    reviewReason: request.review_reason,
    events: events.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      actorId: event.actor_id,
      actorLabel: labels.get(event.actor_id) ?? "Staff member",
      reason: event.reason,
      createdAt: event.created_at,
      metadata: event.metadata,
    })),
    currentStateHint,
    canReview,
    selfApprovalBlocked,
  };
}

export async function executeOrSubmitRateChange(
  readDb: DbClient,
  writeDb: DbClient,
  request: RateChangeRequest,
  actor: RevenueApprovalActor,
): Promise<RevenueMutationResult<RateChangeApplyResult>> {
  const policy = await getRevenueApprovalPolicy(writeDb, request.restaurantId);
  if (!policy.enabled) {
    const applied = await applyRateChanges(readDb, writeDb, request, actor);
    return { mode: "applied", ...applied };
  }
  const submitted = await submitRevenueApprovalRequest(
    writeDb,
    {
      restaurantId: request.restaurantId,
      domain: "rate",
      proposal: request,
      requestReason: request.reason,
    },
    actor,
  );
  return {
    mode: "submitted_for_approval",
    approvalRequestId: submitted.id,
    summary: submitted.summary,
  };
}

export async function executeOrSubmitRestrictionChange(
  readDb: DbClient,
  writeDb: DbClient,
  request: RestrictionChangeRequest,
  actor: RevenueApprovalActor,
): Promise<RevenueMutationResult<RestrictionChangeApplyResult>> {
  const policy = await getRevenueApprovalPolicy(writeDb, request.restaurantId);
  if (!policy.enabled) {
    const applied = await applyRestrictionChanges(readDb, writeDb, request, actor);
    return { mode: "applied", ...applied };
  }
  const submitted = await submitRevenueApprovalRequest(
    writeDb,
    {
      restaurantId: request.restaurantId,
      domain: "restriction",
      proposal: request,
      requestReason: request.reason,
    },
    actor,
  );
  return {
    mode: "submitted_for_approval",
    approvalRequestId: submitted.id,
    summary: submitted.summary,
  };
}

export async function executeOrSubmitPromotionActivation(
  db: DbClient,
  input: PromotionActivationPreviewInput,
  actor: RevenueApprovalActor,
): Promise<
  RevenueMutationResult<{
    operationId: string;
    activationId: string;
    actionType: string;
    expectedVersion: string;
  }>
> {
  const policy = await getRevenueApprovalPolicy(db, input.restaurantId);
  if (!policy.enabled) {
    const applied = await applyStoredPromotionActivation(db, input, actor.membershipId);
    return {
      mode: "applied",
      operationId: applied.operationId,
      activationId: applied.activationId,
      actionType: applied.actionType,
      expectedVersion: applied.expectedVersion,
    };
  }
  const submitted = await submitRevenueApprovalRequest(
    db,
    {
      restaurantId: input.restaurantId,
      domain: "promotion_activation",
      proposal: input,
      requestReason: input.reason,
    },
    actor,
  );
  return {
    mode: "submitted_for_approval",
    approvalRequestId: submitted.id,
    summary: submitted.summary,
  };
}

export async function executeOrSubmitPackageActivation(
  db: DbClient,
  input: PackageActivationPreviewInput,
  actor: RevenueApprovalActor,
): Promise<
  RevenueMutationResult<{
    operationId: string;
    activationId: string;
    actionType: string;
    expectedVersion: string;
  }>
> {
  const policy = await getRevenueApprovalPolicy(db, input.restaurantId);
  if (!policy.enabled) {
    const applied = await applyStoredPackageActivation(db, input, actor.membershipId);
    return {
      mode: "applied",
      operationId: applied.operationId,
      activationId: applied.activationId,
      actionType: applied.actionType,
      expectedVersion: applied.expectedVersion,
    };
  }
  const submitted = await submitRevenueApprovalRequest(
    db,
    {
      restaurantId: input.restaurantId,
      domain: "package_activation",
      proposal: input,
      requestReason: input.reason,
    },
    actor,
  );
  return {
    mode: "submitted_for_approval",
    approvalRequestId: submitted.id,
    summary: submitted.summary,
  };
}

export function isTerminalApprovalStatus(status: string): boolean {
  return isTerminalRevenueApprovalStatus(status);
}
