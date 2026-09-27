/**
 * Revenue Control workspace loader — batched reads only.
 * Preview/apply stay on the rate-change domain. History degrades if 0101 is missing.
 */

import { parseSnapshot, REVENUE_STATUSES } from "../rates.server";
import { isMissingSchemaError } from "../pms-set2-structure";
import { listRateChangeHistory } from "./rate-change.server";
import { loadRevenueProperty } from "./revenue-config.server";
import { REVENUE_CONTROL_HISTORY_LIMIT } from "./revenue-control";
import {
  buildRevenueControlModel,
  clampRevenueControlRange,
  type ControlOverride,
  type ControlPlan,
  type ControlReservation,
  type ControlRestriction,
  type ControlRoom,
  type ControlRoomType,
  type RevenueControlWorkspace,
} from "./revenue-control";

// Operational / catalogue tables may be untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type RevenueControlQuery = {
  restaurantId: string;
  fromDate: string;
  toDate: string;
  roomTypeId?: string | null;
  ratePlanId?: string | null;
  marketSegmentId?: string | null;
  commercialSourceId?: string | null;
  salesChannelId?: string | null;
};

async function loadRooms(db: DbClient, restaurantId: string): Promise<ControlRoom[]> {
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

async function loadRoomTypes(db: DbClient, restaurantId: string): Promise<ControlRoomType[]> {
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
): Promise<ControlReservation[]> {
  const result = await db
    .from("hotel_reservations")
    .select("room_type_id, rate_plan_id, arrival_date, departure_date, nightly_rate_snapshot")
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
    }[]
  ).map((row) => ({
    roomTypeId: row.room_type_id,
    ratePlanId: row.rate_plan_id,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nightly: parseSnapshot(row.nightly_rate_snapshot),
  }));
}

async function loadPlans(db: DbClient, restaurantId: string): Promise<ControlPlan[]> {
  const result = await db
    .from("hotel_rate_plans")
    .select("id, code, name, room_type_id, base_rate, valid_from, valid_to, active")
    .eq("restaurant_id", restaurantId);
  if (result.error) throw new Error(result.error.message);
  return (
    (result.data ?? []) as {
      id: string;
      code: string;
      name: string;
      room_type_id: string;
      base_rate: number | string;
      valid_from: string | null;
      valid_to: string | null;
      active: boolean;
    }[]
  ).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    roomTypeId: row.room_type_id,
    baseRate: Number(row.base_rate),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    active: row.active,
  }));
}

async function loadOverrides(
  db: DbClient,
  restaurantId: string,
  fromDate: string,
  toDate: string,
): Promise<ControlOverride[]> {
  const result = await db
    .from("hotel_rate_calendar")
    .select("rate_plan_id, rate_date, nightly_rate")
    .eq("restaurant_id", restaurantId)
    .gte("rate_date", fromDate)
    .lte("rate_date", toDate);
  if (result.error) throw new Error(result.error.message);
  return (
    (result.data ?? []) as { rate_plan_id: string; rate_date: string; nightly_rate: number | string }[]
  ).map((row) => ({
    ratePlanId: row.rate_plan_id,
    date: row.rate_date,
    nightlyRate: Number(row.nightly_rate),
  }));
}

async function loadRestrictions(
  db: DbClient,
  restaurantId: string,
  fromDate: string,
  toDate: string,
): Promise<{ rows: ControlRestriction[]; error: string | null }> {
  const result = await db
    .from("hotel_rate_restrictions")
    .select("rate_plan_id, restriction_date, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell")
    .eq("restaurant_id", restaurantId)
    .gte("restriction_date", fromDate)
    .lte("restriction_date", toDate);
  if (result.error) return { rows: [], error: result.error.message };
  return {
    rows: (
      (result.data ?? []) as {
        rate_plan_id: string;
        restriction_date: string;
        min_stay: number | null;
        max_stay: number | null;
        closed_to_arrival: boolean;
        closed_to_departure: boolean;
        stop_sell: boolean;
      }[]
    ).map((row) => ({
      ratePlanId: row.rate_plan_id,
      date: row.restriction_date,
      minStay: row.min_stay,
      maxStay: row.max_stay,
      closedToArrival: row.closed_to_arrival,
      closedToDeparture: row.closed_to_departure,
      stopSell: row.stop_sell,
    })),
    error: null,
  };
}

async function loadHistory(db: DbClient, restaurantId: string) {
  try {
    const page = await listRateChangeHistory(db, {
      restaurantId,
      page: 1,
      pageSize: REVENUE_CONTROL_HISTORY_LIMIT,
    });
    return { rows: page.rows, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (isMissingSchemaError({ message })) {
      return { rows: null, error: null as string | null };
    }
    return { rows: null, error: message };
  }
}

/** Trusted-server read. Callers must already have run requireRateManager and pass supabaseAdmin. */
export async function loadRevenueControlWorkspace(
  db: DbClient,
  query: RevenueControlQuery,
): Promise<RevenueControlWorkspace> {
  const clamped = clampRevenueControlRange(query.fromDate, query.toDate);

  const [property, rooms, roomTypes, reservations, plans, overrides, restrictions, history] =
    await Promise.all([
      loadRevenueProperty(db, query.restaurantId, ""),
      loadRooms(db, query.restaurantId),
      loadRoomTypes(db, query.restaurantId),
      loadReservations(db, query.restaurantId, clamped.fromDate, clamped.toDate),
      loadPlans(db, query.restaurantId),
      loadOverrides(db, query.restaurantId, clamped.fromDate, clamped.toDate),
      loadRestrictions(db, query.restaurantId, clamped.fromDate, clamped.toDate),
      loadHistory(db, query.restaurantId),
    ]);

  return buildRevenueControlModel({
    fromDate: clamped.fromDate,
    toDate: clamped.toDate,
    requestedFrom: clamped.requestedFrom,
    requestedTo: clamped.requestedTo,
    rangeClamped: clamped.rangeClamped,
    roomTypeId: query.roomTypeId ?? null,
    ratePlanId: query.ratePlanId ?? null,
    marketSegmentId: query.marketSegmentId ?? null,
    commercialSourceId: query.commercialSourceId ?? null,
    salesChannelId: query.salesChannelId ?? null,
    asOfDate: property.businessDate ?? clamped.toDate,
    currency: property.currency,
    rooms,
    roomTypes,
    reservations,
    plans,
    overrides,
    restrictions: restrictions.rows,
    history: history.rows,
    restrictionsError: restrictions.error,
    historyError: history.error,
  });
}
