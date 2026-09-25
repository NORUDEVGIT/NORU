/**
 * P5A-04 — Commercial history list/detail reads.
 * Property scoped. Actor names resolved in one batch.
 */

import type { CommercialActionType, CommercialEntityType } from "./commercial-engine.ts";
import {
  commercialHistoryChangedFields,
  commercialHistoryPageSize,
  type CommercialHistoryPage,
  type CommercialHistoryRow,
  type CommercialOperationDetail,
} from "./commercial-history.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const EVENT_SELECT =
  "id, restaurant_id, operation_id, entity_type, entity_id, master_id, action_type, before_state, after_state, reason, actor_membership_id, source, created_at";

type EventRow = {
  id: string;
  restaurant_id: string;
  operation_id: string;
  entity_type: CommercialEntityType;
  entity_id: string;
  master_id: string | null;
  action_type: CommercialActionType;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  reason: string | null;
  actor_membership_id: string | null;
  source: string;
  created_at: string;
};

function mapEvent(row: EventRow): CommercialHistoryRow {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    operationId: row.operation_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    masterId: row.master_id,
    actionType: row.action_type,
    beforeState: row.before_state,
    afterState: row.after_state,
    reason: row.reason,
    actorMembershipId: row.actor_membership_id,
    actorName: null,
    source: row.source,
    createdAt: row.created_at,
    changedFields: commercialHistoryChangedFields(row.before_state, row.after_state),
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
  const members = await db
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", unique);
  if (members.error) return names;
  const userIds = [...new Set((members.data ?? []).map((row: { user_id: string }) => row.user_id))];
  const profiles = userIds.length > 0
    ? await db.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
    : { data: [], error: null };
  if (profiles.error) return names;
  const byUser = new Map(
    ((profiles.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>).map((profile) => [
      profile.id,
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email || "Staff",
    ]),
  );
  for (const member of (members.data ?? []) as Array<{ id: string; user_id: string }>) {
    names.set(member.id, byUser.get(member.user_id) ?? "Staff");
  }
  return names;
}

async function attachActorNames(
  db: DbClient,
  restaurantId: string,
  rows: CommercialHistoryRow[],
): Promise<CommercialHistoryRow[]> {
  const names = await loadActorNames(db, restaurantId, rows.map((row) => row.actorMembershipId));
  return rows.map((row) => ({
    ...row,
    actorName: row.actorMembershipId ? names.get(row.actorMembershipId) ?? "Staff" : null,
  }));
}

export async function listCommercialChangeHistory(
  db: DbClient,
  query: {
    restaurantId: string;
    from?: string;
    to?: string;
    entityType?: CommercialEntityType;
    actionType?: CommercialActionType;
    masterId?: string;
    entityId?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<CommercialHistoryPage> {
  const page = query.page ?? 1;
  const pageSize = commercialHistoryPageSize(query.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let request = db
    .from("hotel_commercial_change_events")
    .select(EVENT_SELECT, { count: "exact" })
    .eq("restaurant_id", query.restaurantId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (query.from) request = request.gte("created_at", `${query.from}T00:00:00.000Z`);
  if (query.to) request = request.lte("created_at", `${query.to}T23:59:59.999Z`);
  if (query.entityType) request = request.eq("entity_type", query.entityType);
  if (query.actionType) request = request.eq("action_type", query.actionType);
  if (query.masterId) request = request.eq("master_id", query.masterId);
  if (query.entityId) request = request.eq("entity_id", query.entityId);
  const result = await request;
  if (result.error) throw new Error(result.error.message);
  return {
    rows: await attachActorNames(db, query.restaurantId, ((result.data ?? []) as EventRow[]).map(mapEvent)),
    page,
    pageSize,
    total: result.count ?? 0,
  };
}

export async function getCommercialOperationDetail(
  db: DbClient,
  query: { restaurantId: string; operationId: string },
): Promise<CommercialOperationDetail | null> {
  const result = await db
    .from("hotel_commercial_change_events")
    .select(EVENT_SELECT)
    .eq("restaurant_id", query.restaurantId)
    .eq("operation_id", query.operationId)
    .order("created_at", { ascending: true });
  if (result.error) throw new Error(result.error.message);
  const events = await attachActorNames(db, query.restaurantId, ((result.data ?? []) as EventRow[]).map(mapEvent));
  const first = events[0];
  if (!first) return null;
  return {
    operationId: query.operationId,
    actionType: first.actionType,
    entityType: first.entityType,
    source: first.source,
    reason: first.reason,
    actorMembershipId: first.actorMembershipId,
    actorName: first.actorName,
    createdAt: first.createdAt,
    restaurantId: query.restaurantId,
    events,
  };
}
