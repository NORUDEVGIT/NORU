/**
 * Pickup & Pace loader — snapshot vs snapshot only.
 * Does not read live reservations. Does not capture snapshots.
 */

import { isMissingSchemaError } from "../pms-set2-structure";
import { priorAsOfDate } from "./demand";
import {
  listRevenueOtbSnapshots,
  loadLatestOtbSnapshotAsOf,
  loadOtbSnapshotHistoryStart,
  otbSnapshotExistsForAsOf,
} from "./demand-snapshot.server";
import { buildPickupModel, resolvePickupStayRange, type PickupPaceQuery, type PickupWorkspace } from "./pickup-pace";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

async function loadRoomTypes(db: DbClient, restaurantId: string): Promise<Array<{ id: string; name: string }>> {
  const result = await db.from("room_types").select("id, name").eq("restaurant_id", restaurantId);
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as { id: string; name: string }[]).map((row) => ({
    id: row.id,
    name: row.name || "Room type",
  }));
}

export async function loadRevenuePickupPace(db: DbClient, query: PickupPaceQuery): Promise<PickupWorkspace> {
  const windowDays = query.windowDays;
  let currentAsOf: string | null = null;
  let snapshotHistoryStartsAt: string | null = null;
  try {
    currentAsOf = await loadLatestOtbSnapshotAsOf(db, query.restaurantId);
    snapshotHistoryStartsAt = await loadOtbSnapshotHistoryStart(db, query.restaurantId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (!isMissingSchemaError({ message })) throw error;
  }

  const range = resolvePickupStayRange(currentAsOf, query.fromDate, query.toDate);
  const priorAsOf = currentAsOf ? priorAsOfDate(currentAsOf, windowDays) : null;
  const priorAsOfExists = priorAsOf
    ? await otbSnapshotExistsForAsOf(db, query.restaurantId, priorAsOf)
    : false;

  const roomTypeId = query.roomTypeId ?? null;
  const [currentRows, priorRows, roomTypes] = await Promise.all([
    currentAsOf
      ? listRevenueOtbSnapshots(db, {
          restaurantId: query.restaurantId,
          asOfFrom: currentAsOf,
          asOfTo: currentAsOf,
          stayFrom: range.fromDate,
          stayTo: range.toDate,
          roomTypeId,
        })
      : Promise.resolve([]),
    priorAsOfExists && priorAsOf
      ? listRevenueOtbSnapshots(db, {
          restaurantId: query.restaurantId,
          asOfFrom: priorAsOf,
          asOfTo: priorAsOf,
          stayFrom: range.fromDate,
          stayTo: range.toDate,
          roomTypeId,
        })
      : Promise.resolve([]),
    loadRoomTypes(db, query.restaurantId),
  ]);

  return buildPickupModel({
    currentAsOf,
    priorAsOfExists,
    windowDays,
    fromDate: range.fromDate,
    toDate: range.toDate,
    requestedFrom: range.requestedFrom,
    requestedTo: range.requestedTo,
    rangeClamped: range.rangeClamped,
    currentRows,
    priorRows,
    roomTypes,
    snapshotHistoryStartsAt,
  });
}
