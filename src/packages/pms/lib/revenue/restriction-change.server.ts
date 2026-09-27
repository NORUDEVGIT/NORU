/**
 * Restriction Change server loaders — preview (read-only) and apply (atomic RPC).
 *
 * Does not write hotel_rate_restrictions from a JS loop. Apply uses
 * apply_hotel_rate_restrictions. Preview never mutates restriction rows.
 *
 * saveRateRestriction remains an unmounted compatibility writer.
 * UI-07/UI-08 route single-cell saves through applyRestrictionChanges.
 */

import type { Json } from "@/integrations/supabase/types";
import { rateError } from "../rates.server";
import {
  ABSENT_RESTRICTION_VERSION,
  RESTRICTION_HISTORY_DEFAULT_PAGE_SIZE,
  buildRestrictionChangePreview,
  decideAtomicRestrictionApply,
  normalizeReason,
  restrictionHistoryPageBounds,
  targetKey,
  type RestrictionActionType,
  type RestrictionChangeApplyResult,
  type RestrictionChangeExpectedVersion,
  type RestrictionChangePreview,
  type RestrictionChangeRequest,
  type RestrictionHistoryPage,
  type RestrictionHistoryQuery,
  type RestrictionHistoryRow,
  type RestrictionOperationDetail,
  type RestrictionPlanSnapshot,
  type RestrictionRowSnapshot,
} from "./restriction-change";

// Operational tables added in 0102 are not in generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

type PlanRow = {
  id: string;
  code: string;
  name: string;
  room_type_id: string;
  active: boolean;
  room_types: { name: string } | null;
};

type RestrictionRow = {
  rate_plan_id: string;
  restriction_date: string;
  min_stay: number | null;
  max_stay: number | null;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  stop_sell: boolean;
  updated_at: string;
};

type EventRow = {
  id: string;
  restaurant_id: string;
  operation_id: string;
  action_type: RestrictionActionType;
  rate_plan_id: string;
  room_type_id: string;
  stay_date: string;
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
  reason: string | null;
  actor_membership_id: string | null;
  source: string;
  created_at: string;
  hotel_rate_plans: { code: string; name: string } | null;
  room_types: { name: string } | null;
};

const EVENT_SELECT = `
  id, restaurant_id, operation_id, action_type, rate_plan_id, room_type_id, stay_date,
  previous_min_stay, new_min_stay, previous_max_stay, new_max_stay,
  previous_closed_to_arrival, new_closed_to_arrival,
  previous_closed_to_departure, new_closed_to_departure,
  previous_stop_sell, new_stop_sell, reason, actor_membership_id,
  source, created_at,
  hotel_rate_plans!hotel_rate_restriction_change_events_plan_same_property ( code, name ),
  room_types!hotel_rate_restriction_change_events_type_same_property ( name )
`;

function toPlan(row: PlanRow): RestrictionPlanSnapshot {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? "Room type",
    active: row.active,
  };
}

function mapEvent(row: EventRow): RestrictionHistoryRow {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    operationId: row.operation_id,
    actionType: row.action_type,
    ratePlanId: row.rate_plan_id,
    ratePlanCode: row.hotel_rate_plans?.code ?? null,
    ratePlanName: row.hotel_rate_plans?.name ?? null,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? null,
    stayDate: row.stay_date,
    previous: {
      minStay: row.previous_min_stay,
      maxStay: row.previous_max_stay,
      closedToArrival: row.previous_closed_to_arrival,
      closedToDeparture: row.previous_closed_to_departure,
      stopSell: row.previous_stop_sell,
    },
    next: {
      minStay: row.new_min_stay,
      maxStay: row.new_max_stay,
      closedToArrival: row.new_closed_to_arrival,
      closedToDeparture: row.new_closed_to_departure,
      stopSell: row.new_stop_sell,
    },
    reason: row.reason,
    actorMembershipId: row.actor_membership_id,
    actorName: null,
    source: row.source,
    createdAt: row.created_at,
  };
}

async function loadActorNames(
  db: DbClient,
  restaurantId: string,
  membershipIds: Array<string | null>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(membershipIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return names;
  try {
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
      ((profiles.data ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>).map((profile) => [
        profile.id,
        [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email || "Staff",
      ]),
    );
    for (const member of (members.data ?? []) as Array<{ id: string; user_id: string }>) {
      names.set(member.id, byUser.get(member.user_id) ?? "Staff");
    }
  } catch {
    return names;
  }
  return names;
}

async function attachHistoryActorNames(
  db: DbClient,
  restaurantId: string,
  rows: RestrictionHistoryRow[],
): Promise<RestrictionHistoryRow[]> {
  const names = await loadActorNames(
    db,
    restaurantId,
    rows.map((row) => row.actorMembershipId),
  );
  return rows.map((row) => ({
    ...row,
    actorName: row.actorMembershipId ? names.get(row.actorMembershipId) ?? "Staff" : null,
  }));
}

async function loadPlans(db: DbClient, restaurantId: string, planIds: string[]) {
  const unique = [...new Set(planIds)];
  const plans = new Map<string, RestrictionPlanSnapshot>();
  if (unique.length === 0) return plans;
  const result = await db
    .from("hotel_rate_plans")
    .select(
      "id, code, name, room_type_id, active, room_types!hotel_rate_plans_type_same_property ( name )",
    )
    .eq("restaurant_id", restaurantId)
    .in("id", unique);
  if (result.error) throw new Error(result.error.message);
  for (const row of (result.data ?? []) as PlanRow[]) {
    plans.set(row.id, toPlan(row));
  }
  return plans;
}

async function loadCurrentRestrictions(
  db: DbClient,
  restaurantId: string,
  planIds: string[],
  dates: string[],
) {
  const current = new Map<string, RestrictionRowSnapshot>();
  if (planIds.length === 0 || dates.length === 0) return current;
  const result = await db
    .from("hotel_rate_restrictions")
    .select(
      "rate_plan_id, restriction_date, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .in("rate_plan_id", [...new Set(planIds)])
    .in("restriction_date", [...new Set(dates)]);
  if (result.error) throw new Error(result.error.message);
  for (const row of (result.data ?? []) as RestrictionRow[]) {
    current.set(targetKey(row.rate_plan_id, row.restriction_date), {
      minStay: row.min_stay,
      maxStay: row.max_stay,
      closedToArrival: row.closed_to_arrival,
      closedToDeparture: row.closed_to_departure,
      stopSell: row.stop_sell,
      updatedAt: row.updated_at,
    });
  }
  return current;
}

function expectedVersionMap(versions: RestrictionChangeExpectedVersion[] | undefined) {
  const map = new Map<string, string>();
  for (const item of versions ?? []) {
    map.set(targetKey(item.ratePlanId, item.date), item.expectedVersion);
  }
  return map;
}

export async function previewRestrictionChanges(
  db: DbClient,
  request: RestrictionChangeRequest,
): Promise<RestrictionChangePreview> {
  const planIds = request.targets.map((target) => target.ratePlanId);
  const dates = request.targets.map((target) => target.date);
  const [plans, current] = await Promise.all([
    loadPlans(db, request.restaurantId, planIds),
    loadCurrentRestrictions(db, request.restaurantId, planIds, dates),
  ]);

  return buildRestrictionChangePreview({
    restaurantId: request.restaurantId,
    targets: request.targets,
    operation: request.operation,
    reason: request.reason ?? null,
    source: request.source,
    plans,
    current,
    expectedVersions: expectedVersionMap(request.expectedVersions),
  });
}

async function writeRestrictionChangeAuditPointer(
  db: DbClient,
  params: {
    restaurantId: string;
    actorUserId: string;
    operationId: string;
    actionType: RestrictionActionType;
    targetCount: number;
    source: string;
  },
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: params.restaurantId,
    actor_user_id: params.actorUserId,
    target_user_id: params.actorUserId,
    action: "restriction_change_applied",
    metadata: {
      section: "rate-revenue",
      operation_id: params.operationId,
      action_type: params.actionType,
      target_count: params.targetCount,
      source: params.source,
      when: new Date().toISOString(),
    } as unknown as Json,
  });
  if (result.error) console.error("[restriction-change] audit", result.error.message);
}

export async function applyRestrictionChanges(
  db: DbClient,
  rpc: DbClient,
  request: RestrictionChangeRequest,
  actor: { membershipId: string; userId: string },
): Promise<RestrictionChangeApplyResult> {
  const preview = await previewRestrictionChanges(db, request);
  const decision = decideAtomicRestrictionApply(preview);
  if (!decision.ok) throw rateError(decision.error);

  const operationId = crypto.randomUUID();
  const source = request.source ?? "rate_revenue";
  const targets = request.targets.map((target) => {
    const item = preview.items.find(
      (row) => row.ratePlanId === target.ratePlanId && row.date === target.date,
    );
    const submitted = request.expectedVersions?.find(
      (version) => version.ratePlanId === target.ratePlanId && version.date === target.date,
    );
    return {
      ratePlanId: target.ratePlanId,
      date: target.date,
      expectedVersion: submitted?.expectedVersion ?? item?.expectedVersion ?? ABSENT_RESTRICTION_VERSION,
    };
  });

  const result = await rpc.rpc("apply_hotel_rate_restrictions", {
    _restaurant_id: request.restaurantId,
    _membership_id: actor.membershipId,
    _operation_id: operationId,
    _source: source,
    _reason: normalizeReason(request.reason),
    _operation: request.operation,
    _targets: targets,
  });
  if (result.error) throw rateError(result.error.message);

  const payload = (result.data ?? {}) as {
    operationId?: string;
    actionType?: RestrictionActionType;
    appliedCount?: number;
    deletedCount?: number;
    upsertedCount?: number;
  };

  const applied: RestrictionChangeApplyResult = {
    operationId: payload.operationId ?? operationId,
    actionType: payload.actionType ?? decision.actionType,
    appliedCount: payload.appliedCount ?? 0,
    deletedCount: payload.deletedCount ?? 0,
    upsertedCount: payload.upsertedCount ?? 0,
  };

  await writeRestrictionChangeAuditPointer(rpc, {
    restaurantId: request.restaurantId,
    actorUserId: actor.userId,
    operationId: applied.operationId,
    actionType: applied.actionType,
    targetCount: applied.appliedCount,
    source,
  });

  return applied;
}

export async function listRestrictionChangeHistory(
  db: DbClient,
  query: RestrictionHistoryQuery,
): Promise<RestrictionHistoryPage> {
  const { page, pageSize } = restrictionHistoryPageBounds({
    page: query.page,
    pageSize: query.pageSize,
  });
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let request = db
    .from("hotel_rate_restriction_change_events")
    .select(EVENT_SELECT, { count: "exact" })
    .eq("restaurant_id", query.restaurantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (query.from) request = request.gte("created_at", `${query.from}T00:00:00.000Z`);
  if (query.to) request = request.lte("created_at", `${query.to}T23:59:59.999Z`);
  if (query.stayDate) request = request.eq("stay_date", query.stayDate);
  if (query.ratePlanId) request = request.eq("rate_plan_id", query.ratePlanId);
  if (query.roomTypeId) request = request.eq("room_type_id", query.roomTypeId);
  if (query.actionType) request = request.eq("action_type", query.actionType);
  if (query.actorMembershipId) request = request.eq("actor_membership_id", query.actorMembershipId);

  const result = await request;
  if (result.error) throw new Error(result.error.message);

  const rows = await attachHistoryActorNames(
    db,
    query.restaurantId,
    ((result.data ?? []) as EventRow[]).map(mapEvent),
  );

  return {
    rows,
    page,
    pageSize,
    total: result.count ?? 0,
  };
}

export async function getRestrictionOperationDetail(
  db: DbClient,
  query: { restaurantId: string; operationId?: string; eventId?: string },
): Promise<RestrictionOperationDetail | null> {
  let operationId = query.operationId ?? null;
  if (!operationId && query.eventId) {
    const lookup = await db
      .from("hotel_rate_restriction_change_events")
      .select("operation_id")
      .eq("restaurant_id", query.restaurantId)
      .eq("id", query.eventId)
      .maybeSingle();
    if (lookup.error) throw new Error(lookup.error.message);
    operationId = lookup.data?.operation_id ?? null;
  }
  if (!operationId) return null;

  const result = await db
    .from("hotel_rate_restriction_change_events")
    .select(EVENT_SELECT)
    .eq("restaurant_id", query.restaurantId)
    .eq("operation_id", operationId)
    .order("stay_date", { ascending: true });
  if (result.error) throw new Error(result.error.message);

  const events = await attachHistoryActorNames(
    db,
    query.restaurantId,
    ((result.data ?? []) as EventRow[]).map(mapEvent),
  );
  const first = events[0];
  if (!first) return null;

  return {
    operationId,
    actionType: first.actionType,
    createdAt: first.createdAt,
    reason: first.reason,
    source: first.source,
    actorMembershipId: first.actorMembershipId,
    actorName: first.actorName,
    restaurantId: query.restaurantId,
    events,
  };
}

export { RESTRICTION_HISTORY_DEFAULT_PAGE_SIZE };
