/**
 * Rate Calendar workspace loader — batched reads only.
 * Callers must already have run requireRateManager and pass supabaseAdmin.
 */

import { REVENUE_STATUSES } from "../rates.server";
import { loadRevenueProperty } from "./revenue-config.server";
import {
  buildRateCalendarModel,
  clampRateCalendarRange,
  type CalendarOverride,
  type CalendarReservation,
  type CalendarRestriction,
  type CalendarRoom,
  type RateCalendarPlan,
  type RateCalendarRoomType,
  type RateCalendarWorkspace,
} from "./rate-calendar";

// Operational / catalogue tables may be untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type RateCalendarQuery = {
  restaurantId: string;
  fromDate: string;
  toDate: string;
  roomTypeId?: string | null;
  ratePlanId?: string | null;
};

async function loadRooms(db: DbClient, restaurantId: string): Promise<CalendarRoom[]> {
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

async function loadRoomTypes(db: DbClient, restaurantId: string): Promise<RateCalendarRoomType[]> {
  const result = await db
    .from("room_types")
    .select("id, code, name")
    .eq("restaurant_id", restaurantId);
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as { id: string; code: string | null; name: string }[]).map((row) => ({
    id: row.id,
    code: row.code ?? "",
    name: row.name || "Room type",
  }));
}

async function loadPlans(db: DbClient, restaurantId: string): Promise<RateCalendarPlan[]> {
  const result = await db
    .from("hotel_rate_plans")
    .select("id, code, name, room_type_id, currency, base_rate, valid_from, valid_to, active")
    .eq("restaurant_id", restaurantId);
  if (result.error) throw new Error(result.error.message);
  return (
    (result.data ?? []) as {
      id: string;
      code: string;
      name: string;
      room_type_id: string;
      currency: string | null;
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
    currency: row.currency ?? "",
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
): Promise<CalendarOverride[]> {
  const result = await db
    .from("hotel_rate_calendar")
    .select("rate_plan_id, rate_date, nightly_rate, updated_at")
    .eq("restaurant_id", restaurantId)
    .gte("rate_date", fromDate)
    .lte("rate_date", toDate);
  if (result.error) throw new Error(result.error.message);
  return (
    (result.data ?? []) as {
      rate_plan_id: string;
      rate_date: string;
      nightly_rate: number | string;
      updated_at: string | null;
    }[]
  ).map((row) => ({
    ratePlanId: row.rate_plan_id,
    date: row.rate_date,
    nightlyRate: Number(row.nightly_rate),
    updatedAt: row.updated_at,
  }));
}

async function loadRestrictions(
  db: DbClient,
  restaurantId: string,
  fromDate: string,
  toDate: string,
): Promise<CalendarRestriction[]> {
  const result = await db
    .from("hotel_rate_restrictions")
    .select("rate_plan_id, restriction_date, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell")
    .eq("restaurant_id", restaurantId)
    .gte("restriction_date", fromDate)
    .lte("restriction_date", toDate);
  if (result.error) throw new Error(result.error.message);
  return (
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
  }));
}

async function loadReservations(
  db: DbClient,
  restaurantId: string,
  fromDate: string,
  toDate: string,
): Promise<CalendarReservation[]> {
  const result = await db
    .from("hotel_reservations")
    .select("room_type_id, arrival_date, departure_date")
    .eq("restaurant_id", restaurantId)
    .in("status", REVENUE_STATUSES as unknown as string[])
    .lte("arrival_date", toDate)
    .gt("departure_date", fromDate);
  if (result.error) throw new Error(result.error.message);
  return (
    (result.data ?? []) as { room_type_id: string; arrival_date: string; departure_date: string }[]
  ).map((row) => ({
    roomTypeId: row.room_type_id,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
  }));
}

export async function loadRevenueRateCalendar(
  db: DbClient,
  query: RateCalendarQuery,
): Promise<RateCalendarWorkspace> {
  const clamped = clampRateCalendarRange(query.fromDate, query.toDate);

  const [property, rooms, roomTypes, plans, overrides, restrictions, reservations] = await Promise.all([
    loadRevenueProperty(db, query.restaurantId, ""),
    loadRooms(db, query.restaurantId),
    loadRoomTypes(db, query.restaurantId),
    loadPlans(db, query.restaurantId),
    loadOverrides(db, query.restaurantId, clamped.fromDate, clamped.toDate),
    loadRestrictions(db, query.restaurantId, clamped.fromDate, clamped.toDate),
    loadReservations(db, query.restaurantId, clamped.fromDate, clamped.toDate),
  ]);

  return buildRateCalendarModel({
    fromDate: clamped.fromDate,
    toDate: clamped.toDate,
    requestedFrom: clamped.requestedFrom,
    requestedTo: clamped.requestedTo,
    rangeClamped: clamped.rangeClamped,
    roomTypeId: query.roomTypeId ?? null,
    ratePlanId: query.ratePlanId ?? null,
    currency: property.currency,
    rooms,
    roomTypes,
    plans,
    overrides,
    restrictions,
    reservations,
  });
}
