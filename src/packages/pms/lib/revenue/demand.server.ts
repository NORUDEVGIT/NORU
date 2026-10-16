/**
 * Live Demand workspace loader — batched reads only.
 * Callers must already have run requireRateManager and pass supabaseAdmin.
 * Reads stored nightly_rate_snapshot values. Does not write snapshots.
 */

import { parseSnapshot, REVENUE_STATUSES } from "../rates.server";
import { loadRevenueProperty } from "./revenue-config.server";
import { isMissingSchemaError } from "../pms-set2-structure";
import {
  buildDemandModel,
  clampDemandRange,
  defaultDemandRange,
  type DemandOverride,
  type DemandPlan,
  type DemandQuery,
  type DemandReservation,
  type DemandRestriction,
  type DemandRoom,
  type DemandRoomType,
  type DemandWorkspace,
} from "./demand";

// Operational / catalogue tables may be untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

async function loadRooms(db: DbClient, restaurantId: string): Promise<DemandRoom[]> {
  const result = await db
    .from("hotel_rooms")
    .select("id, room_type_id")
    .eq("restaurant_id", restaurantId)
    .eq("active", true);
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as { id: string; room_type_id: string }[]).map((row) => ({
    id: row.id,
    roomTypeId: row.room_type_id,
  }));
}

async function loadRoomTypes(db: DbClient, restaurantId: string): Promise<DemandRoomType[]> {
  const result = await db
    .from("room_types")
    .select("id, name")
    .eq("restaurant_id", restaurantId);
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as { id: string; name: string }[]).map((row) => ({
    id: row.id,
    name: row.name || "Room type",
  }));
}

async function loadReservations(
  db: DbClient,
  restaurantId: string,
  fromDate: string,
  toDate: string,
): Promise<DemandReservation[]> {
  const result = await db
    .from("hotel_reservations")
    .select("room_type_id, rate_plan_id, arrival_date, departure_date, nightly_rate_snapshot, created_at")
    .eq("restaurant_id", restaurantId)
    .in("status", REVENUE_STATUSES as unknown as string[])
    .lte("arrival_date", toDate)
    .gt("departure_date", fromDate);
  if (result.error) throw new Error(result.error.message);
  return (
    (result.data ?? []) as {
      room_type_id: string;
      rate_plan_id: string | null;
      arrival_date: string;
      departure_date: string;
      nightly_rate_snapshot: unknown;
      created_at: string;
    }[]
  ).map((row) => ({
    roomTypeId: row.room_type_id,
    ratePlanId: row.rate_plan_id,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nightly: parseSnapshot(row.nightly_rate_snapshot),
    createdAt: row.created_at,
  }));
}

async function loadPlans(db: DbClient, restaurantId: string): Promise<DemandPlan[]> {
  const result = await db
    .from("hotel_rate_plans")
    .select("id, room_type_id")
    .eq("restaurant_id", restaurantId);
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as { id: string; room_type_id: string }[]).map((row) => ({
    id: row.id,
    roomTypeId: row.room_type_id,
  }));
}

async function loadOverrides(
  db: DbClient,
  restaurantId: string,
  fromDate: string,
  toDate: string,
): Promise<DemandOverride[]> {
  const result = await db
    .from("hotel_rate_calendar")
    .select("rate_plan_id, rate_date")
    .eq("restaurant_id", restaurantId)
    .gte("rate_date", fromDate)
    .lte("rate_date", toDate);
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as { rate_plan_id: string; rate_date: string }[]).map((row) => ({
    ratePlanId: row.rate_plan_id,
    date: row.rate_date,
  }));
}

async function loadRestrictions(
  db: DbClient,
  restaurantId: string,
  fromDate: string,
  toDate: string,
): Promise<DemandRestriction[]> {
  const result = await db
    .from("hotel_rate_restrictions")
    .select("rate_plan_id, restriction_date")
    .eq("restaurant_id", restaurantId)
    .gte("restriction_date", fromDate)
    .lte("restriction_date", toDate);
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as { rate_plan_id: string; restriction_date: string }[]).map((row) => ({
    ratePlanId: row.rate_plan_id,
    date: row.restriction_date,
  }));
}

async function loadSnapshotHistoryStart(db: DbClient, restaurantId: string): Promise<string | null> {
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

/** Trusted-server read. Callers must already have run requireRateManager and pass supabaseAdmin. */
export async function loadRevenueDemandOverview(
  db: DbClient,
  query: DemandQuery,
  options?: { asOfBusinessDate?: string },
): Promise<DemandWorkspace> {
  const property = await loadRevenueProperty(db, query.restaurantId, "");
  const asOfBusinessDate = options?.asOfBusinessDate ?? property.businessDate;
  const fallback = defaultDemandRange(asOfBusinessDate);
  const requestedFrom = query.fromDate ?? fallback.fromDate;
  const requestedTo = query.toDate ?? fallback.toDate;
  const clamped = clampDemandRange(requestedFrom, requestedTo);

  const [rooms, roomTypes, reservations, plans, overrides, restrictions, snapshotHistoryStartsAt] =
    await Promise.all([
      loadRooms(db, query.restaurantId),
      loadRoomTypes(db, query.restaurantId),
      loadReservations(db, query.restaurantId, clamped.fromDate, clamped.toDate),
      loadPlans(db, query.restaurantId),
      loadOverrides(db, query.restaurantId, clamped.fromDate, clamped.toDate),
      loadRestrictions(db, query.restaurantId, clamped.fromDate, clamped.toDate),
      loadSnapshotHistoryStart(db, query.restaurantId),
    ]);

  return buildDemandModel({
    asOfBusinessDate,
    fromDate: clamped.fromDate,
    toDate: clamped.toDate,
    requestedFrom: clamped.requestedFrom,
    requestedTo: clamped.requestedTo,
    rangeClamped: clamped.rangeClamped,
    timezone: property.timezone,
    currency: property.currency,
    roomTypeId: query.roomTypeId ?? null,
    ratePlanId: query.ratePlanId ?? null,
    rooms,
    roomTypes,
    reservations,
    plans,
    overrides,
    restrictions,
    snapshotHistoryStartsAt,
  });
}
