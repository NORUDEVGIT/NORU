/**
 * UI-21 — Commercial History workspace compose.
 * Read-only. Groups events by operation_id and enriches actors/scopes.
 */

import type { CommercialActionType, CommercialEntityType } from "./commercial-engine.ts";
import {
  getCommercialOperationDetail,
  listCommercialChangeHistory,
  listCommercialHistoryActors,
} from "./commercial-history.server.ts";
import {
  composeCommercialHistoryOperationDetail,
  groupCommercialHistoryByOperation,
  toCommercialHistoryWorkspaceRow,
  type CommercialHistoryOperationDetailView,
  type CommercialHistoryWorkspace,
} from "./commercial-history-ui.ts";
import { sanitizeCommercialHistorySearch } from "./commercial-history.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type CommercialHistoryWorkspaceQuery = {
  restaurantId: string;
  fromDate?: string | null;
  toDate?: string | null;
  entityType?: CommercialEntityType;
  actionType?: CommercialActionType;
  actorId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

async function loadCatalogNames(db: DbClient, restaurantId: string) {
  const [rooms, plans] = await Promise.all([
    db.from("room_types").select("id, name").eq("restaurant_id", restaurantId),
    db.from("hotel_rate_plans").select("id, code, name").eq("restaurant_id", restaurantId),
  ]);
  if (rooms.error) throw new Error(rooms.error.message);
  if (plans.error) throw new Error(plans.error.message);
  const roomNames = new Map(
    ((rooms.data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
      row.id,
      row.name || "Room type",
    ]),
  );
  const planNames = new Map(
    ((plans.data ?? []) as Array<{ id: string; code: string; name: string | null }>).map((row) => [
      row.id,
      row.code || row.name || "Plan",
    ]),
  );
  return { roomNames, planNames };
}

export async function getCommercialHistoryWorkspace(
  db: DbClient,
  query: CommercialHistoryWorkspaceQuery,
): Promise<CommercialHistoryWorkspace> {
  const from = query.fromDate ?? undefined;
  const to = query.toDate ?? undefined;
  const search = sanitizeCommercialHistorySearch(query.search);
  const [page, actors] = await Promise.all([
    listCommercialChangeHistory(db, {
      restaurantId: query.restaurantId,
      from,
      to,
      entityType: query.entityType,
      actionType: query.actionType,
      actorId: query.actorId,
      search,
      page: query.page,
      pageSize: query.pageSize,
    }),
    listCommercialHistoryActors(db, {
      restaurantId: query.restaurantId,
      from,
      to,
      entityType: query.entityType,
    }),
  ]);
  const grouped = groupCommercialHistoryByOperation(page.rows);
  const counts = new Map<string, number>();
  for (const event of page.rows) {
    counts.set(event.operationId, (counts.get(event.operationId) ?? 0) + 1);
  }
  return {
    rows: grouped.map((row) => toCommercialHistoryWorkspaceRow(row, counts.get(row.operationId) ?? 1)),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    actors,
  };
}

export async function getCommercialHistoryOperationDetail(
  db: DbClient,
  query: { restaurantId: string; operationId: string },
): Promise<CommercialHistoryOperationDetailView | null> {
  const [detail, names] = await Promise.all([
    getCommercialOperationDetail(db, query),
    loadCatalogNames(db, query.restaurantId),
  ]);
  if (!detail) return null;
  return composeCommercialHistoryOperationDetail(detail, names);
}
