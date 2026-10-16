/**
 * OTB snapshot capture and historical reads.
 * Capture is server/internal only — Night Audit calls it after a successful close.
 * Do not expose a browser write. Do not update existing snapshots.
 */

import { isMissingSchemaError } from "../pms-set2-structure";
import {
  clampDemandRange,
  snapshotStayRange,
  type DemandQuery,
} from "./demand";
import { loadRevenueDemandOverview } from "./demand.server";
import {
  workspaceToSnapshotRows,
  type OtbCaptureResult,
  type OtbSnapshotQuery,
  type OtbSnapshotRow,
} from "./demand-snapshot";

// Operational tables may be untyped until generated types catch 0103.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

function isUniqueViolation(message: string): boolean {
  return /duplicate key|23505/i.test(message);
}

export async function loadOtbSnapshotHistoryStart(
  db: DbClient,
  restaurantId: string,
): Promise<string | null> {
  const result = await db
    .from("hotel_revenue_otb_snapshots")
    .select("as_of_business_date")
    .eq("restaurant_id", restaurantId)
    .order("as_of_business_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    if (isMissingSchemaError(result.error)) return null;
    throw new Error(result.error.message);
  }
  const row = result.data as { as_of_business_date?: string } | null;
  return row?.as_of_business_date ?? null;
}

export async function loadLatestOtbSnapshotAsOf(
  db: DbClient,
  restaurantId: string,
): Promise<string | null> {
  const result = await db
    .from("hotel_revenue_otb_snapshots")
    .select("as_of_business_date")
    .eq("restaurant_id", restaurantId)
    .order("as_of_business_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    if (isMissingSchemaError(result.error)) return null;
    throw new Error(result.error.message);
  }
  const row = result.data as { as_of_business_date?: string } | null;
  return row?.as_of_business_date ?? null;
}

export async function otbSnapshotExistsForAsOf(
  db: DbClient,
  restaurantId: string,
  asOfBusinessDate: string,
): Promise<boolean> {
  const result = await db
    .from("hotel_revenue_otb_snapshots")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("as_of_business_date", asOfBusinessDate)
    .limit(1)
    .maybeSingle();
  if (result.error) {
    if (isMissingSchemaError(result.error)) return false;
    throw new Error(result.error.message);
  }
  return Boolean(result.data);
}

export async function listRevenueOtbSnapshots(
  db: DbClient,
  query: OtbSnapshotQuery,
): Promise<OtbSnapshotRow[]> {
  let request = db
    .from("hotel_revenue_otb_snapshots")
    .select(
      "restaurant_id, as_of_business_date, stay_date, room_type_id, rooms_on_books, rooms_available, rooms_remaining, booked_room_revenue, currency, occupancy_percent, adr, revpar, priced_rooms, priced_share",
    )
    .eq("restaurant_id", query.restaurantId)
    .order("as_of_business_date", { ascending: true })
    .order("stay_date", { ascending: true })
    .limit(5000);
  if (query.asOfFrom) request = request.gte("as_of_business_date", query.asOfFrom);
  if (query.asOfTo) request = request.lte("as_of_business_date", query.asOfTo);
  if (query.stayFrom) request = request.gte("stay_date", query.stayFrom);
  if (query.stayTo) request = request.lte("stay_date", query.stayTo);
  if (query.roomTypeId) request = request.eq("room_type_id", query.roomTypeId);
  const result = await request;
  if (result.error) throw new Error(result.error.message);
  return (
    (result.data ?? []) as {
      restaurant_id: string;
      as_of_business_date: string;
      stay_date: string;
      room_type_id: string;
      rooms_on_books: number;
      rooms_available: number;
      rooms_remaining: number;
      booked_room_revenue: number | string;
      currency: string | null;
      occupancy_percent: number | string;
      adr: number | string;
      revpar: number | string;
      priced_rooms: number;
      priced_share: number | string;
    }[]
  ).map((row) => ({
    restaurantId: row.restaurant_id,
    asOfBusinessDate: row.as_of_business_date,
    stayDate: row.stay_date,
    roomTypeId: row.room_type_id,
    roomsOnBooks: Number(row.rooms_on_books),
    roomsAvailable: Number(row.rooms_available),
    roomsRemaining: Number(row.rooms_remaining),
    bookedRoomRevenue: Number(row.booked_room_revenue),
    currency: row.currency ?? "",
    occupancyPercent: Number(row.occupancy_percent),
    adr: Number(row.adr),
    revpar: Number(row.revpar),
    pricedRooms: Number(row.priced_rooms),
    pricedShare: Number(row.priced_share),
  }));
}

/**
 * Insert-once capture. Unique grain conflict is already_present — never an update.
 * Uses the same live demand composition as getRevenueDemandOverview.
 */
export async function captureRevenueOtbSnapshot(
  db: DbClient,
  input: { restaurantId: string; asOfBusinessDate: string },
): Promise<OtbCaptureResult> {
  const stay = snapshotStayRange(input.asOfBusinessDate);
  const existing = await db
    .from("hotel_revenue_otb_snapshots")
    .select("id")
    .eq("restaurant_id", input.restaurantId)
    .eq("as_of_business_date", input.asOfBusinessDate)
    .limit(1)
    .maybeSingle();
  if (existing.error && !isMissingSchemaError(existing.error)) {
    throw new Error(existing.error.message);
  }
  if (existing.data) {
    return {
      status: "already_present",
      rowCount: 0,
      asOfBusinessDate: input.asOfBusinessDate,
      stayFrom: stay.fromDate,
      stayTo: stay.toDate,
      error: null,
    };
  }

  const query: DemandQuery = {
    restaurantId: input.restaurantId,
    fromDate: stay.fromDate,
    toDate: stay.toDate,
  };
  const workspace = await loadRevenueDemandOverview(db, query, {
    asOfBusinessDate: input.asOfBusinessDate,
  });
  const clamped = clampDemandRange(stay.fromDate, stay.toDate);
  const rows = workspaceToSnapshotRows(input.restaurantId, {
    ...workspace,
    asOfBusinessDate: input.asOfBusinessDate,
    fromDate: clamped.fromDate,
    toDate: clamped.toDate,
  });

  if (rows.length === 0) {
    return {
      status: "captured",
      rowCount: 0,
      asOfBusinessDate: input.asOfBusinessDate,
      stayFrom: stay.fromDate,
      stayTo: stay.toDate,
      error: null,
    };
  }

  const inserted = await db.from("hotel_revenue_otb_snapshots").insert(
    rows.map((row) => ({
      restaurant_id: row.restaurantId,
      as_of_business_date: row.asOfBusinessDate,
      stay_date: row.stayDate,
      room_type_id: row.roomTypeId,
      rooms_on_books: row.roomsOnBooks,
      rooms_available: row.roomsAvailable,
      rooms_remaining: row.roomsRemaining,
      booked_room_revenue: row.bookedRoomRevenue,
      currency: row.currency,
      occupancy_percent: row.occupancyPercent,
      adr: row.adr,
      revpar: row.revpar,
      priced_rooms: row.pricedRooms,
      priced_share: row.pricedShare,
    })),
  );
  if (inserted.error) {
    if (isUniqueViolation(inserted.error.message)) {
      return {
        status: "already_present",
        rowCount: 0,
        asOfBusinessDate: input.asOfBusinessDate,
        stayFrom: stay.fromDate,
        stayTo: stay.toDate,
        error: null,
      };
    }
    throw new Error(inserted.error.message);
  }

  return {
    status: "captured",
    rowCount: rows.length,
    asOfBusinessDate: input.asOfBusinessDate,
    stayFrom: stay.fromDate,
    stayTo: stay.toDate,
    error: null,
  };
}

/** Night Audit wrapper: never throws. Close must not roll back if analytics fail. */
export async function captureOtbSnapshotAfterClose(
  db: DbClient,
  restaurantId: string,
  asOfBusinessDate: string,
): Promise<OtbCaptureResult> {
  try {
    return await captureRevenueOtbSnapshot(db, { restaurantId, asOfBusinessDate });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.error("[otb-snapshot]", message);
    const stay = snapshotStayRange(asOfBusinessDate);
    return {
      status: "failed",
      rowCount: 0,
      asOfBusinessDate,
      stayFrom: stay.fromDate,
      stayTo: stay.toDate,
      error: message || "OTB snapshot capture failed.",
    };
  }
}
