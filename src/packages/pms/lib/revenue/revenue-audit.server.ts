/**
 * Unified Revenue Audit Server Read Models (P8-STEP-02 & P8-STEP-02B).
 *
 * Implements globally ordered audit pagination across all 4 immutable source tables:
 * - hotel_rate_change_events
 * - hotel_rate_restriction_change_events
 * - hotel_commercial_change_events
 * - hotel_revenue_approval_events (joined with requests)
 *
 * Provides dedicated complete export reader loadUnifiedRevenueAuditForExport()
 * with 10,000 row safety bounds and zero silent truncation.
 */

import { rateError } from "../rates.server.ts";
import {
  filterAuditEntries,
  MAX_AUDIT_EXPORT_ROWS,
  normalizeApprovalEvent,
  normalizeCommercialEvent,
  normalizeRateEvent,
  normalizeRestrictionEvent,
  paginateAuditEntries,
  sortAuditEntriesGlobally,
  type AuditOperationDetail,
  type UnifiedRevenueAuditEntry,
  type UnifiedRevenueAuditFilter,
  type UnifiedRevenueAuditResult,
} from "./revenue-audit.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

async function loadActorLabels(
  db: DbClient,
  restaurantId: string,
  membershipIds: Array<string | null | undefined>,
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
        "Staff member",
    ]),
  );

  for (const member of (members.data ?? []) as Array<{ id: string; user_id: string }>) {
    names.set(member.id, byUser.get(member.user_id) ?? "Staff member");
  }
  return names;
}

export async function fetchAndNormalizeUnifiedAudit(
  db: DbClient,
  query: UnifiedRevenueAuditFilter,
): Promise<UnifiedRevenueAuditEntry[]> {
  const restaurantId = query.restaurantId;
  const domainFilter = query.domain ?? "all";
  const fromIso = query.fromDate ? `${query.fromDate}T00:00:00.000Z` : null;
  const toIso = query.toDate ? `${query.toDate}T23:59:59.999Z` : null;

  const candidates: UnifiedRevenueAuditEntry[] = [];

  const shouldFetchRates = domainFilter === "all" || domainFilter === "rates";
  const shouldFetchRestrictions = domainFilter === "all" || domainFilter === "restrictions";
  const shouldFetchCommercial = domainFilter === "all" || domainFilter === "commercial";
  const shouldFetchApprovals = domainFilter === "all" || domainFilter === "approvals";

  const fetchTasks: Promise<void>[] = [];

  // 1. Fetch Rate Change Events
  if (shouldFetchRates) {
    fetchTasks.push(
      (async () => {
        let q = db
          .from("hotel_rate_change_events")
          .select(
            `
            id, restaurant_id, operation_id, action_type, rate_plan_id, room_type_id, stay_date,
            previous_effective_rate, new_effective_rate, currency, reason, actor_membership_id, created_at,
            hotel_rate_plans!hotel_rate_change_events_plan_same_property ( code, name ),
            room_types!hotel_rate_change_events_type_same_property ( name )
          `,
          )
          .eq("restaurant_id", restaurantId);

        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        if (query.actorMembershipId) q = q.eq("actor_membership_id", query.actorMembershipId);
        if (query.action) q = q.eq("action_type", query.action);

        const { data, error } = await q;
        if (error) throw rateError(error.message);

        for (const row of (data ?? []) as Parameters<typeof normalizeRateEvent>[0][]) {
          candidates.push(normalizeRateEvent(row));
        }
      })(),
    );
  }

  // 2. Fetch Restriction Change Events
  if (shouldFetchRestrictions) {
    fetchTasks.push(
      (async () => {
        let q = db
          .from("hotel_rate_restriction_change_events")
          .select(
            `
            id, restaurant_id, operation_id, action_type, rate_plan_id, room_type_id, stay_date,
            reason, actor_membership_id, created_at,
            hotel_rate_plans!hotel_rate_restriction_change_events_plan_same_property ( code, name ),
            room_types!hotel_rate_restriction_change_events_type_same_property ( name )
          `,
          )
          .eq("restaurant_id", restaurantId);

        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        if (query.actorMembershipId) q = q.eq("actor_membership_id", query.actorMembershipId);
        if (query.action) q = q.eq("action_type", query.action);

        const { data, error } = await q;
        if (error) throw rateError(error.message);

        for (const row of (data ?? []) as Parameters<typeof normalizeRestrictionEvent>[0][]) {
          candidates.push(normalizeRestrictionEvent(row));
        }
      })(),
    );
  }

  // 3. Fetch Commercial Change Events
  if (shouldFetchCommercial) {
    fetchTasks.push(
      (async () => {
        let q = db
          .from("hotel_commercial_change_events")
          .select(
            `
            id, restaurant_id, operation_id, entity_type, entity_id, master_id, action_type,
            reason, actor_membership_id, created_at
          `,
          )
          .eq("restaurant_id", restaurantId);

        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        if (query.actorMembershipId) q = q.eq("actor_membership_id", query.actorMembershipId);
        if (query.action) q = q.eq("action_type", query.action);

        const { data, error } = await q;
        if (error) throw rateError(error.message);

        for (const row of (data ?? []) as Parameters<typeof normalizeCommercialEvent>[0][]) {
          candidates.push(normalizeCommercialEvent(row));
        }
      })(),
    );
  }

  // 4. Fetch Approval Events (joined with requests)
  if (shouldFetchApprovals) {
    fetchTasks.push(
      (async () => {
        let q = db
          .from("hotel_revenue_approval_events")
          .select(
            `
            id, restaurant_id, approval_request_id, event_type, actor_id, reason, created_at,
            hotel_revenue_approval_requests!inner (
              domain, action_type, entity_type, entity_id, status, request_reason, review_reason,
              display_snapshot, applied_operation_id
            )
          `,
          )
          .eq("restaurant_id", restaurantId);

        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        if (query.actorMembershipId) q = q.eq("actor_id", query.actorMembershipId);
        if (query.action) q = q.eq("event_type", query.action);

        const { data, error } = await q;
        if (error) throw rateError(error.message);

        for (const row of (data ?? []) as Parameters<typeof normalizeApprovalEvent>[0][]) {
          candidates.push(normalizeApprovalEvent(row));
        }
      })(),
    );
  }

  await Promise.all(fetchTasks);

  const filtered = filterAuditEntries(candidates, {
    search: query.search,
    action: query.action,
    actorMembershipId: query.actorMembershipId,
  });

  return sortAuditEntriesGlobally(filtered);
}

export async function batchResolveAuditEntries(
  db: DbClient,
  restaurantId: string,
  entries: UnifiedRevenueAuditEntry[],
): Promise<UnifiedRevenueAuditEntry[]> {
  if (entries.length === 0) return entries;

  const actorIds = entries.map((e) => e.actorMembershipId);
  const operationIds = [
    ...new Set(entries.map((e) => e.operationId).filter((op): op is string => Boolean(op))),
  ];

  const [actorMap, linkedRequestsRes] = await Promise.all([
    loadActorLabels(db, restaurantId, actorIds),
    operationIds.length > 0
      ? db
          .from("hotel_revenue_approval_requests")
          .select("id, applied_operation_id")
          .eq("restaurant_id", restaurantId)
          .in("applied_operation_id", operationIds)
      : Promise.resolve({ data: [] }),
  ]);

  const opToApprovalMap = new Map<string, string>();
  for (const r of (linkedRequestsRes?.data ?? []) as Array<{
    id: string;
    applied_operation_id: string;
  }>) {
    if (r.applied_operation_id) {
      opToApprovalMap.set(r.applied_operation_id, r.id);
    }
  }

  for (const entry of entries) {
    if (entry.actorMembershipId) {
      entry.actorLabel = actorMap.get(entry.actorMembershipId) ?? "Staff member";
    }
    if (entry.operationId && !entry.approvalRequestId && opToApprovalMap.has(entry.operationId)) {
      entry.approvalRequestId = opToApprovalMap.get(entry.operationId)!;
      entry.linkedOperationId = entry.operationId;
    }
  }

  return entries;
}

export async function loadUnifiedRevenueAudit(
  db: DbClient,
  query: UnifiedRevenueAuditFilter,
): Promise<UnifiedRevenueAuditResult> {
  const sorted = await fetchAndNormalizeUnifiedAudit(db, query);
  const { pageEntries, total, page, pageSize, totalPages } = paginateAuditEntries(
    sorted,
    query.page,
    query.pageSize,
  );
  await batchResolveAuditEntries(db, query.restaurantId, pageEntries);

  return {
    restaurantId: query.restaurantId,
    entries: pageEntries,
    total,
    page,
    pageSize,
    totalPages,
    filter: {
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
      domain: query.domain ?? "all",
      actorMembershipId: query.actorMembershipId ?? null,
      action: query.action ?? null,
      search: query.search ?? null,
    },
  };
}

export async function loadUnifiedRevenueAuditForExport(
  db: DbClient,
  filter: UnifiedRevenueAuditFilter,
): Promise<UnifiedRevenueAuditEntry[]> {
  const sorted = await fetchAndNormalizeUnifiedAudit(db, filter);
  if (sorted.length > MAX_AUDIT_EXPORT_ROWS) {
    throw rateError("AUDIT_EXPORT_TOO_LARGE");
  }
  await batchResolveAuditEntries(db, filter.restaurantId, sorted);
  return sorted;
}

export async function loadAuditOperationDetail(
  db: DbClient,
  query: {
    restaurantId: string;
    eventId: string;
    sourceTable: string;
    operationId?: string | null;
  },
): Promise<AuditOperationDetail> {
  const { restaurantId, eventId, sourceTable } = query;

  if (sourceTable === "hotel_rate_change_events") {
    const eventRes = await db
      .from("hotel_rate_change_events")
      .select(
        `
        id, restaurant_id, operation_id, action_type, rate_plan_id, room_type_id, stay_date,
        previous_base_rate, previous_override_rate, previous_effective_rate,
        new_override_rate, new_effective_rate, currency, reason, actor_membership_id,
        created_at, metadata,
        hotel_rate_plans!hotel_rate_change_events_plan_same_property ( code, name ),
        room_types!hotel_rate_change_events_type_same_property ( name )
      `,
      )
      .eq("restaurant_id", restaurantId)
      .eq("id", eventId)
      .maybeSingle();

    if (eventRes.error) throw rateError(eventRes.error.message);
    if (!eventRes.data) throw rateError("AUDIT_EVENT_NOT_FOUND");
    const mainRow = eventRes.data;

    const opId = query.operationId || mainRow.operation_id;
    const batchRes = await db
      .from("hotel_rate_change_events")
      .select(
        `
        id, stay_date, previous_effective_rate, new_effective_rate, currency, action_type,
        hotel_rate_plans!hotel_rate_change_events_plan_same_property ( code, name ),
        room_types!hotel_rate_change_events_type_same_property ( name )
      `,
      )
      .eq("restaurant_id", restaurantId)
      .eq("operation_id", opId)
      .order("stay_date", { ascending: true });

    const batchRows = (batchRes.data ?? [mainRow]) as Array<{
      id: string;
      stay_date: string;
      previous_effective_rate: number | string;
      new_effective_rate: number | string;
      currency: string;
      action_type: string;
      hotel_rate_plans: { code: string; name: string } | null;
      room_types: { name: string } | null;
    }>;

    const approvalRes = await db
      .from("hotel_revenue_approval_requests")
      .select("id, status, requested_by, requested_at, reviewed_by, reviewed_at, review_reason")
      .eq("restaurant_id", restaurantId)
      .eq("applied_operation_id", opId)
      .maybeSingle();

    const approvalData = approvalRes?.data ?? null;

    const changes = batchRows.map((r) => ({
      eventId: r.id,
      stayDate: r.stay_date,
      planCode: r.hotel_rate_plans?.code ?? "",
      planName: r.hotel_rate_plans?.name ?? "",
      roomTypeName: r.room_types?.name ?? "",
      previousRate: Number(r.previous_effective_rate),
      newRate: Number(r.new_effective_rate),
      delta: Number(r.new_effective_rate) - Number(r.previous_effective_rate),
      currency: r.currency,
      actionType: r.action_type,
    }));

    const entry: UnifiedRevenueAuditEntry = {
      id: mainRow.id,
      timestamp: mainRow.created_at,
      domain: "rates",
      action: mainRow.action_type,
      entityType: "rate_plan",
      entityId: mainRow.rate_plan_id,
      entityLabel: mainRow.hotel_rate_plans?.name || "Rate Plan",
      scopeLabel: `${mainRow.stay_date} • ${mainRow.room_types?.name ?? "Room"}`,
      actorMembershipId: mainRow.actor_membership_id,
      actorLabel: "Staff member",
      reason: mainRow.reason,
      operationId: opId,
      approvalRequestId: approvalData?.id ?? null,
      linkedOperationId: opId,
      status: "applied",
      sourceTable,
      detailSupported: true,
    };

    return {
      entry,
      domain: "rates",
      operationId: opId,
      approvalRequestId: approvalData?.id ?? null,
      batchCount: changes.length,
      summary: `Rate update affecting ${changes.length} stay date(s)`,
      changes,
      beforeState: { previousRate: Number(mainRow.previous_effective_rate) },
      afterState: { newRate: Number(mainRow.new_effective_rate) },
      approvalLineage: approvalData
        ? {
            requestId: approvalData.id,
            status: approvalData.status,
            requestedBy: approvalData.requested_by,
            requestedAt: approvalData.requested_at,
            reviewedBy: approvalData.reviewed_by,
            reviewedAt: approvalData.reviewed_at,
            reviewReason: approvalData.review_reason,
          }
        : null,
    };
  }

  if (sourceTable === "hotel_rate_restriction_change_events") {
    const eventRes = await db
      .from("hotel_rate_restriction_change_events")
      .select(
        `
        id, restaurant_id, operation_id, action_type, rate_plan_id, room_type_id, stay_date,
        previous_min_stay, new_min_stay, previous_max_stay, new_max_stay,
        previous_closed_to_arrival, new_closed_to_arrival,
        previous_closed_to_departure, new_closed_to_departure,
        previous_stop_sell, new_stop_sell, reason, actor_membership_id, created_at,
        hotel_rate_plans!hotel_rate_restriction_change_events_plan_same_property ( code, name ),
        room_types!hotel_rate_restriction_change_events_type_same_property ( name )
      `,
      )
      .eq("restaurant_id", restaurantId)
      .eq("id", eventId)
      .maybeSingle();

    if (eventRes.error) throw rateError(eventRes.error.message);
    if (!eventRes.data) throw rateError("AUDIT_EVENT_NOT_FOUND");
    const mainRow = eventRes.data;

    const opId = query.operationId || mainRow.operation_id;
    const batchRes = await db
      .from("hotel_rate_restriction_change_events")
      .select(
        `
        id, stay_date, action_type,
        previous_min_stay, new_min_stay, previous_max_stay, new_max_stay,
        previous_closed_to_arrival, new_closed_to_arrival,
        previous_closed_to_departure, new_closed_to_departure,
        previous_stop_sell, new_stop_sell,
        hotel_rate_plans!hotel_rate_restriction_change_events_plan_same_property ( code, name ),
        room_types!hotel_rate_restriction_change_events_type_same_property ( name )
      `,
      )
      .eq("restaurant_id", restaurantId)
      .eq("operation_id", opId)
      .order("stay_date", { ascending: true });

    const batchRows = (batchRes.data ?? [mainRow]) as Array<{
      id: string;
      stay_date: string;
      action_type: string;
      previous_min_stay: number | null;
      new_min_stay: number | null;
      previous_max_stay: number | null;
      new_max_stay: number | null;
      previous_closed_to_arrival: boolean;
      new_closed_to_arrival: boolean;
      previous_closed_to_departure: boolean;
      new_closed_to_departure: boolean;
      previous_stop_sell: boolean;
      new_stop_sell: boolean;
      hotel_rate_plans: { code: string; name: string } | null;
      room_types: { name: string } | null;
    }>;

    const approvalRes = await db
      .from("hotel_revenue_approval_requests")
      .select("id, status, requested_by, requested_at, reviewed_by, reviewed_at, review_reason")
      .eq("restaurant_id", restaurantId)
      .eq("applied_operation_id", opId)
      .maybeSingle();

    const approvalData = approvalRes?.data ?? null;

    const changes = batchRows.map((r) => ({
      eventId: r.id,
      stayDate: r.stay_date,
      planCode: r.hotel_rate_plans?.code ?? "",
      planName: r.hotel_rate_plans?.name ?? "",
      roomTypeName: r.room_types?.name ?? "",
      actionType: r.action_type,
      minStay: { before: r.previous_min_stay, after: r.new_min_stay },
      maxStay: { before: r.previous_max_stay, after: r.new_max_stay },
      cta: { before: r.previous_closed_to_arrival, after: r.new_closed_to_arrival },
      ctd: { before: r.previous_closed_to_departure, after: r.new_closed_to_departure },
      stopSell: { before: r.previous_stop_sell, after: r.new_stop_sell },
    }));

    const entry: UnifiedRevenueAuditEntry = {
      id: mainRow.id,
      timestamp: mainRow.created_at,
      domain: "restrictions",
      action: mainRow.action_type,
      entityType: "rate_restriction",
      entityId: mainRow.rate_plan_id,
      entityLabel: mainRow.hotel_rate_plans?.name || "Restriction",
      scopeLabel: `${mainRow.stay_date} • ${mainRow.room_types?.name ?? "Room"}`,
      actorMembershipId: mainRow.actor_membership_id,
      actorLabel: "Staff member",
      reason: mainRow.reason,
      operationId: opId,
      approvalRequestId: approvalData?.id ?? null,
      linkedOperationId: opId,
      status: "applied",
      sourceTable,
      detailSupported: true,
    };

    return {
      entry,
      domain: "restrictions",
      operationId: opId,
      approvalRequestId: approvalData?.id ?? null,
      batchCount: changes.length,
      summary: `Restriction update affecting ${changes.length} stay date(s)`,
      changes,
      beforeState: {
        minStay: mainRow.previous_min_stay,
        maxStay: mainRow.previous_max_stay,
        stopSell: mainRow.previous_stop_sell,
      },
      afterState: {
        minStay: mainRow.new_min_stay,
        maxStay: mainRow.new_max_stay,
        stopSell: mainRow.new_stop_sell,
      },
      approvalLineage: approvalData
        ? {
            requestId: approvalData.id,
            status: approvalData.status,
            requestedBy: approvalData.requested_by,
            requestedAt: approvalData.requested_at,
            reviewedBy: approvalData.reviewed_by,
            reviewedAt: approvalData.reviewed_at,
            reviewReason: approvalData.review_reason,
          }
        : null,
    };
  }

  if (sourceTable === "hotel_commercial_change_events") {
    const eventRes = await db
      .from("hotel_commercial_change_events")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("id", eventId)
      .maybeSingle();

    if (eventRes.error) throw rateError(eventRes.error.message);
    if (!eventRes.data) throw rateError("AUDIT_EVENT_NOT_FOUND");
    const mainRow = eventRes.data;

    const opId = query.operationId || mainRow.operation_id;
    const approvalRes = await db
      .from("hotel_revenue_approval_requests")
      .select("id, status, requested_by, requested_at, reviewed_by, reviewed_at, review_reason")
      .eq("restaurant_id", restaurantId)
      .eq("applied_operation_id", opId)
      .maybeSingle();

    const approvalData = approvalRes?.data ?? null;

    const entry: UnifiedRevenueAuditEntry = {
      id: mainRow.id,
      timestamp: mainRow.created_at,
      domain: "commercial",
      action: mainRow.action_type,
      entityType: mainRow.entity_type,
      entityId: mainRow.entity_id,
      entityLabel: mainRow.master_id || mainRow.entity_id || "Commercial item",
      scopeLabel: mainRow.entity_type.replace(/_/g, " "),
      actorMembershipId: mainRow.actor_membership_id,
      actorLabel: "Staff member",
      reason: mainRow.reason,
      operationId: opId,
      approvalRequestId: approvalData?.id ?? null,
      linkedOperationId: opId,
      status: "applied",
      sourceTable,
      detailSupported: true,
    };

    return {
      entry,
      domain: "commercial",
      operationId: opId,
      approvalRequestId: approvalData?.id ?? null,
      batchCount: 1,
      summary: `Commercial ${mainRow.action_type} on ${mainRow.entity_type}`,
      changes: [{ beforeState: mainRow.before_state, afterState: mainRow.after_state }],
      beforeState: mainRow.before_state,
      afterState: mainRow.after_state,
      approvalLineage: approvalData
        ? {
            requestId: approvalData.id,
            status: approvalData.status,
            requestedBy: approvalData.requested_by,
            requestedAt: approvalData.requested_at,
            reviewedBy: approvalData.reviewed_by,
            reviewedAt: approvalData.reviewed_at,
            reviewReason: approvalData.review_reason,
          }
        : null,
    };
  }

  if (sourceTable === "hotel_revenue_approval_events") {
    const eventRes = await db
      .from("hotel_revenue_approval_events")
      .select(
        `
        id, restaurant_id, approval_request_id, event_type, actor_id, reason, created_at, metadata,
        hotel_revenue_approval_requests!inner (
          domain, action_type, entity_type, entity_id, status, request_reason, review_reason,
          proposal_payload, display_snapshot, applied_operation_id, requested_by, requested_at,
          reviewed_by, reviewed_at
        )
      `,
      )
      .eq("restaurant_id", restaurantId)
      .eq("id", eventId)
      .maybeSingle();

    if (eventRes.error) throw rateError(eventRes.error.message);
    if (!eventRes.data) throw rateError("AUDIT_EVENT_NOT_FOUND");
    const mainRow = eventRes.data;
    const req = mainRow.hotel_revenue_approval_requests;

    const entry: UnifiedRevenueAuditEntry = {
      id: mainRow.id,
      timestamp: mainRow.created_at,
      domain: "approvals",
      action: mainRow.event_type,
      entityType: req.entity_type || req.domain,
      entityId: req.entity_id || mainRow.approval_request_id,
      entityLabel: req.display_snapshot?.summary || req.action_type || "Approval Request",
      scopeLabel: `${req.domain} (${req.status})`,
      actorMembershipId: mainRow.actor_id,
      actorLabel: "Staff member",
      reason: mainRow.reason || req.review_reason || req.request_reason || null,
      operationId: req.applied_operation_id ?? null,
      approvalRequestId: mainRow.approval_request_id,
      linkedOperationId: req.applied_operation_id ?? null,
      status: req.status,
      sourceTable,
      detailSupported: true,
    };

    return {
      entry,
      domain: "approvals",
      operationId: req.applied_operation_id ?? null,
      approvalRequestId: mainRow.approval_request_id,
      batchCount: 1,
      summary: `Approval ${mainRow.event_type} event: ${entry.entityLabel}`,
      changes: [{ proposal: req.proposal_payload, display: req.display_snapshot }],
      beforeState: null,
      afterState: req.display_snapshot as Record<string, unknown> | null,
      approvalLineage: {
        requestId: mainRow.approval_request_id,
        status: req.status,
        requestedBy: req.requested_by,
        requestedAt: req.requested_at,
        reviewedBy: req.reviewed_by,
        reviewedAt: req.reviewed_at,
        reviewReason: req.review_reason,
      },
    };
  }

  throw rateError("UNKNOWN_AUDIT_SOURCE_TABLE");
}
