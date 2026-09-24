/**
 * Rate Change server loaders — preview (read-only) and apply (atomic RPC).
 *
 * Does not write hotel_rate_calendar from a JS loop. Apply uses
 * apply_hotel_rate_changes. Preview never mutates calendar rows.
 *
 * saveRateOverride remains the Rate Calendar compatibility writer until UI-03
 * routes single-cell saves through applyRateChanges after migration 0101.
 */

import type { Json } from "@/integrations/supabase/types";
import { rateError } from "../rates.server";
import {
  ABSENT_CALENDAR_VERSION,
  RATE_CHANGE_HISTORY_PAGE_SIZE,
  buildRateChangePreview,
  decideAtomicRateChangeApply,
  historyDeltasForRow,
  normalizeReason,
  targetKey,
  type RateChangeActionType,
  type RateChangeApplyResult,
  type RateChangeExpectedVersion,
  type RateChangeHistoryPage,
  type RateChangeHistoryRow,
  type RateChangeOperationDetail,
  type RateChangeOverrideSnapshot,
  type RateChangePlanSnapshot,
  type RateChangePreview,
  type RateChangeRequest,
  type RateChangeRestrictionContext,
  type RateChangeRule,
  type RateChangeSource,
  type RateChangeTarget,
} from "./rate-change";

// Operational tables added in 0101 are not in generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

type PlanRow = {
  id: string;
  restaurant_id: string;
  code: string;
  name: string;
  room_type_id: string;
  currency: string;
  base_rate: number | string;
  valid_from: string | null;
  valid_to: string | null;
  active: boolean;
  room_types: { name: string } | null;
};

type CalendarRow = {
  rate_plan_id: string;
  rate_date: string;
  nightly_rate: number | string;
  updated_at: string;
};

type RestrictionRow = {
  rate_plan_id: string;
  restriction_date: string;
  min_stay: number | null;
  max_stay: number | null;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  stop_sell: boolean;
};

type EventRow = {
  id: string;
  restaurant_id: string;
  operation_id: string;
  action_type: RateChangeActionType;
  rate_plan_id: string;
  room_type_id: string;
  stay_date: string;
  previous_base_rate: number | string;
  previous_override_rate: number | string | null;
  previous_effective_rate: number | string;
  new_override_rate: number | string | null;
  new_effective_rate: number | string;
  currency: string;
  reason: string | null;
  actor_membership_id: string | null;
  source: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  hotel_rate_plans: { code: string; name: string } | null;
  room_types: { name: string } | null;
};

const EVENT_SELECT = `
  id, restaurant_id, operation_id, action_type, rate_plan_id, room_type_id, stay_date,
  previous_base_rate, previous_override_rate, previous_effective_rate,
  new_override_rate, new_effective_rate, currency, reason, actor_membership_id,
  source, created_at, metadata,
  hotel_rate_plans!hotel_rate_change_events_plan_same_property ( code, name ),
  room_types!hotel_rate_change_events_type_same_property ( name )
`;

function toPlan(row: PlanRow): RateChangePlanSnapshot {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    code: row.code,
    name: row.name,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? "Room type",
    currency: row.currency,
    baseRate: Number(row.base_rate),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    active: row.active,
  };
}

function mapEvent(row: EventRow): RateChangeHistoryRow {
  const previousEffectiveRate = Number(row.previous_effective_rate);
  const newEffectiveRate = Number(row.new_effective_rate);
  const deltas = historyDeltasForRow({ previousEffectiveRate, newEffectiveRate });
  return {
    id: row.id,
    operationId: row.operation_id,
    actionType: row.action_type,
    ratePlanId: row.rate_plan_id,
    ratePlanCode: row.hotel_rate_plans?.code ?? null,
    ratePlanName: row.hotel_rate_plans?.name ?? null,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? null,
    stayDate: row.stay_date,
    previousBaseRate: Number(row.previous_base_rate),
    previousOverrideRate: row.previous_override_rate == null ? null : Number(row.previous_override_rate),
    previousEffectiveRate,
    newOverrideRate: row.new_override_rate == null ? null : Number(row.new_override_rate),
    newEffectiveRate,
    absoluteDelta: deltas.absoluteDelta,
    percentageDelta: deltas.percentageDelta,
    currency: row.currency,
    reason: row.reason,
    actorMembershipId: row.actor_membership_id,
    source: row.source,
    createdAt: row.created_at,
    metadata: row.metadata ?? {},
  };
}

async function loadPlans(db: DbClient, restaurantId: string, planIds: string[]) {
  const unique = [...new Set(planIds)];
  const plans = new Map<string, RateChangePlanSnapshot>();
  if (unique.length === 0) return plans;
  const result = await db
    .from("hotel_rate_plans")
    .select(
      "id, restaurant_id, code, name, room_type_id, currency, base_rate, valid_from, valid_to, active, room_types!hotel_rate_plans_type_same_property ( name )",
    )
    .eq("restaurant_id", restaurantId)
    .in("id", unique);
  if (result.error) throw new Error(result.error.message);
  for (const row of (result.data ?? []) as PlanRow[]) {
    plans.set(row.id, toPlan(row));
  }
  return plans;
}

async function loadOverrides(
  db: DbClient,
  restaurantId: string,
  planIds: string[],
  dates: string[],
) {
  const overrides = new Map<string, RateChangeOverrideSnapshot>();
  if (planIds.length === 0 || dates.length === 0) return overrides;
  const result = await db
    .from("hotel_rate_calendar")
    .select("rate_plan_id, rate_date, nightly_rate, updated_at")
    .eq("restaurant_id", restaurantId)
    .in("rate_plan_id", [...new Set(planIds)])
    .in("rate_date", [...new Set(dates)]);
  if (result.error) throw new Error(result.error.message);
  for (const row of (result.data ?? []) as CalendarRow[]) {
    overrides.set(targetKey(row.rate_plan_id, row.rate_date), {
      nightlyRate: Number(row.nightly_rate),
      updatedAt: row.updated_at,
    });
  }
  return overrides;
}

async function loadRestrictions(
  db: DbClient,
  restaurantId: string,
  planIds: string[],
  dates: string[],
) {
  const restrictions = new Map<string, RateChangeRestrictionContext>();
  if (planIds.length === 0 || dates.length === 0) return restrictions;
  const result = await db
    .from("hotel_rate_restrictions")
    .select(
      "rate_plan_id, restriction_date, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell",
    )
    .eq("restaurant_id", restaurantId)
    .in("rate_plan_id", [...new Set(planIds)])
    .in("restriction_date", [...new Set(dates)]);
  if (result.error) throw new Error(result.error.message);
  for (const row of (result.data ?? []) as RestrictionRow[]) {
    restrictions.set(targetKey(row.rate_plan_id, row.restriction_date), {
      minStay: row.min_stay,
      maxStay: row.max_stay,
      closedToArrival: row.closed_to_arrival,
      closedToDeparture: row.closed_to_departure,
      stopSell: row.stop_sell,
    });
  }
  return restrictions;
}

function expectedVersionMap(versions: RateChangeExpectedVersion[] | undefined) {
  const map = new Map<string, string>();
  for (const item of versions ?? []) {
    map.set(targetKey(item.ratePlanId, item.date), item.expectedVersion);
  }
  return map;
}

function lookupDates(targets: RateChangeTarget[], rule: RateChangeRule): string[] {
  const dates = targets.map((target) => target.date);
  if (rule.type === "COPY_FROM_DATE") dates.push(rule.sourceDate);
  return dates;
}

export async function previewRateChanges(
  db: DbClient,
  request: RateChangeRequest,
): Promise<RateChangePreview> {
  const planIds = request.targets.map((target) => target.ratePlanId);
  const dates = lookupDates(request.targets, request.rule);
  const [plans, overrides, restrictions] = await Promise.all([
    loadPlans(db, request.restaurantId, planIds),
    loadOverrides(db, request.restaurantId, planIds, dates),
    loadRestrictions(db, request.restaurantId, planIds, dates),
  ]);

  return buildRateChangePreview({
    restaurantId: request.restaurantId,
    targets: request.targets,
    rule: request.rule,
    reason: request.reason ?? null,
    plans,
    overrides,
    restrictions,
    expectedVersions: expectedVersionMap(request.expectedVersions),
  });
}

async function writeRateChangeAuditPointer(
  db: DbClient,
  params: {
    restaurantId: string;
    actorUserId: string;
    operationId: string;
    actionType: RateChangeActionType;
    targetCount: number;
    source: RateChangeSource | string;
  },
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: params.restaurantId,
    actor_user_id: params.actorUserId,
    target_user_id: params.actorUserId,
    action: "rate_change_applied",
    metadata: {
      section: "rate-revenue",
      operation_id: params.operationId,
      action_type: params.actionType,
      target_count: params.targetCount,
      source: params.source,
      when: new Date().toISOString(),
    } as unknown as Json,
  });
  if (result.error) console.error("[rate-change] audit", result.error.message);
}

export async function applyRateChanges(
  db: DbClient,
  rpc: DbClient,
  request: RateChangeRequest,
  actor: { membershipId: string; userId: string },
): Promise<RateChangeApplyResult> {
  const preview = await previewRateChanges(db, request);
  const decision = decideAtomicRateChangeApply(preview);
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
      expectedVersion: submitted?.expectedVersion ?? item?.expectedVersion ?? ABSENT_CALENDAR_VERSION,
    };
  });

  const result = await rpc.rpc("apply_hotel_rate_changes", {
    _restaurant_id: request.restaurantId,
    _membership_id: actor.membershipId,
    _operation_id: operationId,
    _source: source,
    _reason: normalizeReason(request.reason),
    _rule: request.rule,
    _targets: targets,
  });
  if (result.error) throw rateError(result.error.message);

  const payload = (result.data ?? {}) as {
    operationId?: string;
    actionType?: RateChangeActionType;
    appliedCount?: number;
  };

  const applied: RateChangeApplyResult = {
    operationId: payload.operationId ?? operationId,
    actionType: payload.actionType ?? decision.actionType,
    appliedCount: payload.appliedCount ?? targets.length,
  };

  await writeRateChangeAuditPointer(rpc, {
    restaurantId: request.restaurantId,
    actorUserId: actor.userId,
    operationId: applied.operationId,
    actionType: applied.actionType,
    targetCount: applied.appliedCount,
    source,
  });

  return applied;
}

export async function listRateChangeHistory(
  db: DbClient,
  query: {
    restaurantId: string;
    from?: string;
    to?: string;
    stayDate?: string;
    ratePlanId?: string;
    roomTypeId?: string;
    actionType?: RateChangeActionType;
    actorMembershipId?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<RateChangeHistoryPage> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? RATE_CHANGE_HISTORY_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let request = db
    .from("hotel_rate_change_events")
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

  return {
    rows: ((result.data ?? []) as EventRow[]).map(mapEvent),
    page,
    pageSize,
    total: result.count ?? 0,
  };
}

export async function getRateChangeOperationDetail(
  db: DbClient,
  query: { restaurantId: string; operationId?: string; eventId?: string },
): Promise<RateChangeOperationDetail | null> {
  let operationId = query.operationId ?? null;
  if (!operationId && query.eventId) {
    const lookup = await db
      .from("hotel_rate_change_events")
      .select("operation_id")
      .eq("restaurant_id", query.restaurantId)
      .eq("id", query.eventId)
      .maybeSingle();
    if (lookup.error) throw new Error(lookup.error.message);
    operationId = lookup.data?.operation_id ?? null;
  }
  if (!operationId) return null;

  const result = await db
    .from("hotel_rate_change_events")
    .select(EVENT_SELECT)
    .eq("restaurant_id", query.restaurantId)
    .eq("operation_id", operationId)
    .order("stay_date", { ascending: true });
  if (result.error) throw new Error(result.error.message);

  const events = ((result.data ?? []) as EventRow[]).map(mapEvent);
  const first = events[0];
  if (!first) return null;

  return {
    operationId,
    actionType: first.actionType,
    source: first.source,
    reason: first.reason,
    actorMembershipId: first.actorMembershipId,
    createdAt: first.createdAt,
    restaurantId: query.restaurantId,
    events,
    affectedDates: [...new Set(events.map((event) => event.stayDate))],
    affectedRatePlanIds: [...new Set(events.map((event) => event.ratePlanId))],
    affectedRoomTypeIds: [...new Set(events.map((event) => event.roomTypeId))],
  };
}
