/**
 * Unified Revenue Audit Types & Pure Domain Helpers (P8-STEP-02).
 * Normalizes 4 immutable source tables into a single globally ordered audit trail.
 */

export type UnifiedRevenueAuditDomain = "rates" | "restrictions" | "commercial" | "approvals";

export type UnifiedRevenueAuditEntry = {
  id: string;
  timestamp: string; // ISO string
  domain: UnifiedRevenueAuditDomain;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string;
  scopeLabel: string;
  actorMembershipId: string | null;
  actorLabel: string;
  reason: string | null;
  operationId: string | null;
  approvalRequestId: string | null;
  linkedOperationId: string | null;
  status: string;
  sourceTable: string;
  detailSupported: boolean;
};

export type UnifiedRevenueAuditFilter = {
  restaurantId: string;
  fromDate?: string | null;
  toDate?: string | null;
  domain?: UnifiedRevenueAuditDomain | "all" | "overrides" | null;
  action?: string | null;
  actorMembershipId?: string | null;
  search?: string | null;
  page?: number | null;
  pageSize?: number | null;
};

export type UnifiedRevenueAuditResult = {
  restaurantId: string;
  entries: UnifiedRevenueAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filter: {
    fromDate?: string | null;
    toDate?: string | null;
    domain: UnifiedRevenueAuditDomain | "all" | "overrides";
    actorMembershipId?: string | null;
    action?: string | null;
    search?: string | null;
  };
};

/**
 * P8-STEP-03 Amendment 1:
 * UI-39 Override Audit must include only events structurally identifiable as overrides/exceptions.
 * Does NOT treat every approval as an override.
 */
export function isOverrideAuditEvent(entry: UnifiedRevenueAuditEntry): boolean {
  const actionLower = entry.action.toLowerCase();
  const reasonLower = (entry.reason ?? "").toLowerCase();
  const labelLower = entry.entityLabel.toLowerCase();

  if (actionLower.includes("override") || actionLower === "manual_override") {
    return true;
  }
  if (actionLower.includes("exception")) {
    return true;
  }
  if (
    entry.domain === "rates" &&
    (reasonLower.includes("override") || reasonLower.includes("exception"))
  ) {
    return true;
  }
  if (
    entry.domain === "approvals" &&
    (actionLower.includes("override") ||
      reasonLower.includes("override") ||
      labelLower.includes("override"))
  ) {
    return true;
  }
  return false;
}

export type AuditOperationDetail = {
  entry: UnifiedRevenueAuditEntry;
  domain: UnifiedRevenueAuditDomain;
  operationId: string | null;
  approvalRequestId: string | null;
  batchCount: number;
  summary: string;
  changes: Array<Record<string, unknown>>;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  approvalLineage: {
    requestId: string;
    status: string;
    requestedBy: string;
    requestedAt: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewReason: string | null;
  } | null;
};

export const DEFAULT_AUDIT_PAGE_SIZE = 25;
export const MAX_AUDIT_PAGE_SIZE = 100;
export const MAX_AUDIT_EXPORT_ROWS = 10000;

export function sortAuditEntriesGlobally(
  entries: UnifiedRevenueAuditEntry[],
): UnifiedRevenueAuditEntry[] {
  return [...entries].sort((a, b) => {
    const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  });
}

export function filterAuditEntries(
  entries: UnifiedRevenueAuditEntry[],
  criteria: {
    search?: string | null;
    action?: string | null;
    actorMembershipId?: string | null;
  },
): UnifiedRevenueAuditEntry[] {
  let result = entries;

  if (criteria.action) {
    result = result.filter((e) => e.action === criteria.action);
  }

  if (criteria.actorMembershipId) {
    result = result.filter((e) => e.actorMembershipId === criteria.actorMembershipId);
  }

  if (criteria.search && criteria.search.trim()) {
    const s = criteria.search.trim().toLowerCase();
    result = result.filter((item) => {
      return (
        item.action.toLowerCase().includes(s) ||
        item.entityLabel.toLowerCase().includes(s) ||
        item.scopeLabel.toLowerCase().includes(s) ||
        (item.reason && item.reason.toLowerCase().includes(s)) ||
        (item.operationId && item.operationId.toLowerCase().includes(s)) ||
        (item.approvalRequestId && item.approvalRequestId.toLowerCase().includes(s))
      );
    });
  }

  return result;
}

export function paginateAuditEntries(
  entries: UnifiedRevenueAuditEntry[],
  requestedPage?: number | null,
  requestedPageSize?: number | null,
): {
  pageEntries: UnifiedRevenueAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const page = Math.max(1, Number(requestedPage) || 1);
  const pageSize = Math.min(
    MAX_AUDIT_PAGE_SIZE,
    Math.max(1, Number(requestedPageSize) || DEFAULT_AUDIT_PAGE_SIZE),
  );
  const total = entries.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const offset = (page - 1) * pageSize;
  const pageEntries = entries.slice(offset, offset + pageSize);

  return {
    pageEntries,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function normalizeRateEvent(row: {
  id: string;
  created_at: string;
  action_type: string;
  rate_plan_id: string;
  room_type_id: string;
  stay_date: string;
  previous_effective_rate: number | string;
  new_effective_rate: number | string;
  currency: string;
  reason: string | null;
  actor_membership_id: string | null;
  operation_id: string;
  hotel_rate_plans?: { code: string; name: string } | null;
  room_types?: { name: string } | null;
}): UnifiedRevenueAuditEntry {
  const planLabel = row.hotel_rate_plans?.name || row.hotel_rate_plans?.code || "Rate Plan";
  const roomLabel = row.room_types?.name ? ` • ${row.room_types.name}` : "";
  const prev = Number(row.previous_effective_rate);
  const next = Number(row.new_effective_rate);
  const deltaStr = prev !== next ? ` (${prev} → ${next} ${row.currency})` : "";

  return {
    id: row.id,
    timestamp: row.created_at,
    domain: "rates",
    action: row.action_type,
    entityType: "rate_plan",
    entityId: row.rate_plan_id,
    entityLabel: planLabel,
    scopeLabel: `${row.stay_date}${roomLabel}${deltaStr}`,
    actorMembershipId: row.actor_membership_id,
    actorLabel: "Staff member",
    reason: row.reason,
    operationId: row.operation_id,
    approvalRequestId: null,
    linkedOperationId: null,
    status: "applied",
    sourceTable: "hotel_rate_change_events",
    detailSupported: true,
  };
}

export function normalizeRestrictionEvent(row: {
  id: string;
  created_at: string;
  action_type: string;
  rate_plan_id: string;
  room_type_id: string;
  stay_date: string;
  reason: string | null;
  actor_membership_id: string | null;
  operation_id: string;
  hotel_rate_plans?: { code: string; name: string } | null;
  room_types?: { name: string } | null;
}): UnifiedRevenueAuditEntry {
  const planLabel = row.hotel_rate_plans?.name || row.hotel_rate_plans?.code || "Restriction";
  const roomLabel = row.room_types?.name ? ` • ${row.room_types.name}` : "";

  return {
    id: row.id,
    timestamp: row.created_at,
    domain: "restrictions",
    action: row.action_type,
    entityType: "rate_restriction",
    entityId: row.rate_plan_id,
    entityLabel: planLabel,
    scopeLabel: `${row.stay_date}${roomLabel}`,
    actorMembershipId: row.actor_membership_id,
    actorLabel: "Staff member",
    reason: row.reason,
    operationId: row.operation_id,
    approvalRequestId: null,
    linkedOperationId: null,
    status: "applied",
    sourceTable: "hotel_rate_restriction_change_events",
    detailSupported: true,
  };
}

export function normalizeCommercialEvent(row: {
  id: string;
  created_at: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  master_id: string | null;
  reason: string | null;
  actor_membership_id: string | null;
  operation_id: string;
}): UnifiedRevenueAuditEntry {
  const entityLabel = row.master_id || row.entity_id || "Commercial item";
  const scopeLabel = row.entity_type.replace(/_/g, " ");

  return {
    id: row.id,
    timestamp: row.created_at,
    domain: "commercial",
    action: row.action_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel,
    scopeLabel,
    actorMembershipId: row.actor_membership_id,
    actorLabel: "Staff member",
    reason: row.reason,
    operationId: row.operation_id,
    approvalRequestId: null,
    linkedOperationId: null,
    status: "applied",
    sourceTable: "hotel_commercial_change_events",
    detailSupported: true,
  };
}

export function normalizeApprovalEvent(row: {
  id: string;
  created_at: string;
  event_type: string;
  actor_id: string;
  reason: string | null;
  approval_request_id: string;
  hotel_revenue_approval_requests: {
    domain: string;
    action_type: string;
    entity_type: string;
    entity_id: string | null;
    status: string;
    request_reason: string | null;
    review_reason: string | null;
    display_snapshot: { summary?: string } | null;
    applied_operation_id: string | null;
  };
}): UnifiedRevenueAuditEntry {
  const req = row.hotel_revenue_approval_requests;
  const label = req?.display_snapshot?.summary || req?.action_type || "Approval Request";
  const scopeLabel = `${req?.domain ?? "Revenue"} (${req?.status ?? "unknown"})`;

  return {
    id: row.id,
    timestamp: row.created_at,
    domain: "approvals",
    action: row.event_type,
    entityType: req?.entity_type || req?.domain || "approval_request",
    entityId: req?.entity_id || row.approval_request_id,
    entityLabel: label,
    scopeLabel,
    actorMembershipId: row.actor_id,
    actorLabel: "Staff member",
    reason: row.reason || req?.review_reason || req?.request_reason || null,
    operationId: req?.applied_operation_id ?? null,
    approvalRequestId: row.approval_request_id,
    linkedOperationId: req?.applied_operation_id ?? null,
    status: req?.status ?? "unknown",
    sourceTable: "hotel_revenue_approval_events",
    detailSupported: true,
  };
}
