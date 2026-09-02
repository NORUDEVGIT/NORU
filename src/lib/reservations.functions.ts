import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MANUAL_RESERVATION_STATUSES,
  RESERVATION_STATUSES,
  assertStayDates,
  blankToNull,
  canManageReservations,
  nightsBetween,
  recordReservationEvent,
  requireReservationManager,
  reservationError,
  type ReservationEventType,
  type ReservationStatus,
} from "./reservations.server";
import { parseSnapshot, rateError } from "./rates.server";
import { callerMembership } from "./workforce.server";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/* ------------------------------------------------------------------- types */

export interface ReservationSummary {
  id: string;
  confirmationNumber: string;
  guestId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestVip: boolean;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  adults: number;
  children: number;
  status: ReservationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationDetail extends ReservationSummary {
  specialRequests: string | null;
  notes: string | null;
  cancellationReason: string | null;
  source: string;
  ratePlanId: string | null;
  currency: string | null;
  roomSubtotal: number | null;
  nightlyRates: { date: string; rate: number }[];
  pricedAt: string | null;
}

type JsonValue = string | number | boolean | null;

export interface ReservationHistoryEntry {
  id: string;
  eventType: ReservationEventType;
  previousValues: Record<string, JsonValue> | null;
  newValues: Record<string, JsonValue> | null;
  notes: string | null;
  createdAt: string;
}

export interface RoomTypeAvailability {
  roomTypeId: string;
  code: string;
  name: string;
  maxOccupancy: number;
  adultCapacity: number;
  childCapacity: number;
  totalRooms: number;
  reserved: number;
  available: number;
}

export interface AssignableRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  building: string | null;
}

export interface BookingsDashboard {
  today: string;
  arrivalsToday: number;
  departuresToday: number;
  stayingToday: number;
  pending: number;
  upcoming: number;
  cancelledThisMonth: number;
  sellableRooms: number;
  occupancyPercent: number;
}

const RESERVATION_SELECT = `
  id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date,
  adults, children, status, source, special_requests, notes, cancellation_reason,
  rate_plan_id, currency, room_subtotal, nightly_rate_snapshot, priced_at,
  created_at, updated_at,
  guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, email, vip_status ),
  room_types!hotel_reservations_type_same_property ( name ),
  hotel_rooms!hotel_reservations_room_same_type ( room_number )
`;

type ReservationRow = {
  id: string;
  confirmation_number: string;
  guest_id: string;
  room_type_id: string;
  room_id: string | null;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  status: string;
  source: string;
  special_requests: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  rate_plan_id: string | null;
  currency: string | null;
  room_subtotal: number | string | null;
  nightly_rate_snapshot: unknown;
  priced_at: string | null;
  created_at: string;
  updated_at: string;
  guest_profiles: {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    vip_status: boolean;
  } | null;
  room_types: { name: string } | null;
  hotel_rooms: { room_number: string } | null;
};

function toDetail(row: ReservationRow): ReservationDetail {
  const guest = row.guest_profiles;
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    guestName: [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim() || "Guest",
    guestPhone: guest?.phone ?? null,
    guestEmail: guest?.email ?? null,
    guestVip: guest?.vip_status ?? false,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? "Room type",
    roomId: row.room_id,
    roomNumber: row.hotel_rooms?.room_number ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nights: nightsBetween(row.arrival_date, row.departure_date),
    adults: row.adults,
    children: row.children,
    status: row.status as ReservationStatus,
    source: row.source,
    specialRequests: row.special_requests,
    notes: row.notes,
    cancellationReason: row.cancellation_reason,
    ratePlanId: row.rate_plan_id,
    currency: row.currency,
    roomSubtotal: row.room_subtotal === null || row.room_subtotal === undefined ? null : Number(row.room_subtotal),
    nightlyRates: parseSnapshot(row.nightly_rate_snapshot),
    pricedAt: row.priced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ access */

export const getBookingsAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context as never, data.restaurantId);
    return { role: me.role, canManage: canManageReservations(me.role) };
  });

/* ------------------------------------------------------------ availability */

export const getRoomTypeAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        arrival: dateSchema,
        departure: dateSchema,
        excludeReservationId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomTypeAvailability[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { arrival, departure } = assertStayDates(data.arrival, data.departure);

    const { data: types, error } = await context.supabase
      .from("room_types")
      .select("id, code, name, max_occupancy, adult_capacity, child_capacity")
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .eq("sellable", true)
      .order("name");
    if (error) throw new Error(error.message);

    const out: RoomTypeAvailability[] = [];
    for (const type of types ?? []) {
      const { data: total } = await context.supabase.rpc("count_sellable_rooms", {
        _restaurant_id: data.restaurantId,
        _room_type_id: type.id,
      });
      const { data: reserved } = await context.supabase.rpc("count_reserved_rooms", {
        _restaurant_id: data.restaurantId,
        _room_type_id: type.id,
        _arrival: arrival,
        _departure: departure,
        ...(data.excludeReservationId ? { _exclude_reservation_id: data.excludeReservationId } : {}),
      });
      const totalRooms = Number(total ?? 0);
      const reservedRooms = Number(reserved ?? 0);
      out.push({
        roomTypeId: type.id,
        code: type.code,
        name: type.name,
        maxOccupancy: type.max_occupancy,
        adultCapacity: type.adult_capacity,
        childCapacity: type.child_capacity,
        totalRooms,
        reserved: reservedRooms,
        available: Math.max(0, totalRooms - reservedRooms),
      });
    }
    return out;
  });

export const listAssignableRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
        arrival: dateSchema,
        departure: dateSchema,
        excludeReservationId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AssignableRoom[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { arrival, departure } = assertStayDates(data.arrival, data.departure);

    const { data: rooms, error } = await context.supabase
      .from("hotel_rooms")
      .select("id, room_number, floor, building")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId)
      .eq("active", true)
      .eq("status", "available")
      .order("room_number");
    if (error) throw new Error(error.message);

    let clashQuery = context.supabase
      .from("hotel_reservations")
      .select("room_id")
      .eq("restaurant_id", data.restaurantId)
      .in("status", ["pending", "confirmed", "checked_in"])
      .not("room_id", "is", null)
      .lt("arrival_date", departure)
      .gt("departure_date", arrival);
    if (data.excludeReservationId) clashQuery = clashQuery.neq("id", data.excludeReservationId);

    const { data: clashes } = await clashQuery;
    const taken = new Set((clashes ?? []).map((r: { room_id: string | null }) => r.room_id));

    return (rooms ?? [])
      .filter((r) => !taken.has(r.id))
      .map((r) => ({
        id: r.id,
        roomNumber: r.room_number,
        floor: r.floor,
        building: r.building,
      }));
  });

/* -------------------------------------------------------------------- list */

export const listReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        search: z.string().max(120).optional(),
        status: z.enum(RESERVATION_STATUSES).optional(),
        fromDate: dateSchema.optional(),
        toDate: dateSchema.optional(),
        page: z.number().int().min(1).max(500).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({ data, context }): Promise<{ rows: ReservationSummary[]; total: number; page: number; pageSize: number }> => {
      await requireReservationManager(context as never, data.restaurantId);

      const page = data.page ?? 1;
      const pageSize = data.pageSize ?? 25;
      const from = (page - 1) * pageSize;

      let query = context.supabase
        .from("hotel_reservations")
        .select(RESERVATION_SELECT, { count: "exact" })
        .eq("restaurant_id", data.restaurantId)
        .order("arrival_date", { ascending: false })
        .range(from, from + pageSize - 1);

      if (data.status) query = query.eq("status", data.status);
      if (data.fromDate) query = query.gte("departure_date", data.fromDate);
      if (data.toDate) query = query.lte("arrival_date", data.toDate);

      const term = (data.search ?? "").trim();
      if (term) query = query.ilike("confirmation_number", `%${term.replace(/[%,]/g, "")}%`);

      const { data: rows, error, count } = await query;
      if (error) throw new Error(error.message);

      let list = ((rows ?? []) as unknown as ReservationRow[]).map(toDetail);
      // Guest-name search is applied on the page result set; confirmation search is server-side.
      if (term && list.length === 0) {
        const like = `%${term.replace(/[%,]/g, "")}%`;
        const { data: guests } = await context.supabase
          .from("guest_profiles")
          .select("id")
          .eq("restaurant_id", data.restaurantId)
          .or(`first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
          .limit(50);
        const guestIds = (guests ?? []).map((g: { id: string }) => g.id);
        if (guestIds.length > 0) {
          let byGuest = context.supabase
            .from("hotel_reservations")
            .select(RESERVATION_SELECT, { count: "exact" })
            .eq("restaurant_id", data.restaurantId)
            .in("guest_id", guestIds)
            .order("arrival_date", { ascending: false })
            .range(from, from + pageSize - 1);
          if (data.status) byGuest = byGuest.eq("status", data.status);
          const { data: guestRows, count: guestCount } = await byGuest;
          list = ((guestRows ?? []) as unknown as ReservationRow[]).map(toDetail);
          return { rows: list, total: guestCount ?? list.length, page, pageSize };
        }
      }

      return { rows: list, total: count ?? list.length, page, pageSize };
    },
  );

/* ------------------------------------------------------------------ detail */

export const getReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ reservation: ReservationDetail; history: ReservationHistoryEntry[] }> => {
      await requireReservationManager(context as never, data.restaurantId);

      const { data: row, error } = await context.supabase
        .from("hotel_reservations")
        .select(RESERVATION_SELECT)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.reservationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Reservation not found for this property.");

      const { data: events } = await context.supabase
        .from("hotel_reservation_history")
        .select("id, event_type, previous_values, new_values, notes, created_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", data.reservationId)
        .order("created_at", { ascending: false })
        .limit(100);

      const history: ReservationHistoryEntry[] = (events ?? []).map((e) => ({
        id: e.id,
        eventType: e.event_type as ReservationEventType,
        previousValues: (e.previous_values ?? null) as Record<string, JsonValue> | null,
        newValues: (e.new_values ?? null) as Record<string, JsonValue> | null,
        notes: e.notes,
        createdAt: e.created_at,
      }));

      return { reservation: toDetail(row as unknown as ReservationRow), history };
    },
  );

/* ------------------------------------------------------------------ create */

const stayInputSchema = z.object({
  restaurantId: idSchema,
  guestId: idSchema,
  roomTypeId: idSchema,
  roomId: idSchema.nullable().optional(),
  arrival: dateSchema,
  departure: dateSchema,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  specialRequests: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const createReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    stayInputSchema.extend({ status: z.enum(["pending", "confirmed"]).optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; confirmationNumber: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { arrival, departure } = assertStayDates(data.arrival, data.departure);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.rpc("create_hotel_reservation", {
      _restaurant_id: data.restaurantId,
      _guest_id: data.guestId,
      _room_type_id: data.roomTypeId,
      _room_id: (data.roomId ?? null) as unknown as string,
      _arrival: arrival,
      _departure: departure,
      _adults: data.adults,
      _children: data.children,
      _special_requests: blankToNull(data.specialRequests) as unknown as string,
      _notes: blankToNull(data.notes) as unknown as string,
      _status: data.status ?? "pending",
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);

    const row = created as unknown as { id: string; confirmation_number: string };
    return { id: row.id, confirmationNumber: row.confirmation_number };
  });

/* ------------------------------------------------------------------- amend */

export const amendReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    stayInputSchema.extend({ reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { arrival, departure } = assertStayDates(data.arrival, data.departure);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin.rpc("amend_hotel_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _room_type_id: data.roomTypeId,
      _room_id: (data.roomId ?? null) as unknown as string,
      _arrival: arrival,
      _departure: departure,
      _adults: data.adults,
      _children: data.children,
      _special_requests: blankToNull(data.specialRequests) as unknown as string,
      _notes: blankToNull(data.notes) as unknown as string,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);

    return { id: (updated as unknown as { id: string }).id };
  });

/** Assign or clear a room without touching the rest of the stay. */
export const assignReservationRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        roomId: idSchema.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);

    const { data: existing, error: readError } = await context.supabase
      .from("hotel_reservations")
      .select("id, room_type_id, arrival_date, departure_date, adults, children, special_requests, notes, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Reservation not found for this property.");
    if (!["pending", "confirmed"].includes(existing.status)) {
      throw new Error("Rooms can only be assigned before check-in.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("amend_hotel_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _room_type_id: existing.room_type_id,
      _room_id: data.roomId as unknown as string,
      _arrival: existing.arrival_date,
      _departure: existing.departure_date,
      _adults: existing.adults,
      _children: existing.children,
      _special_requests: existing.special_requests as unknown as string,
      _notes: existing.notes as unknown as string,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId };
  });

/* ------------------------------------------------------------------ status */

export const setReservationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        status: z.enum(MANUAL_RESERVATION_STATUSES),
        reason: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: ReservationStatus }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);

    const { data: existing, error: readError } = await context.supabase
      .from("hotel_reservations")
      .select("id, status, room_type_id, room_id, arrival_date, departure_date")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Reservation not found for this property.");
    if (existing.status === data.status) return { id: existing.id, status: data.status };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Restoring a cancelled reservation has to win a capacity check again.
    if (existing.status === "cancelled") {
      const { error: capacityError } = await supabaseAdmin.rpc("assert_reservation_capacity", {
        _restaurant_id: data.restaurantId,
        _room_type_id: existing.room_type_id,
        _room_id: existing.room_id as unknown as string,
        _arrival: existing.arrival_date,
        _departure: existing.departure_date,
        _exclude_reservation_id: existing.id as string,
      });
      if (capacityError) throw reservationError(capacityError.message);
    }

    const { error } = await supabaseAdmin
      .from("hotel_reservations")
      .update({
        status: data.status,
        cancellation_reason: data.status === "cancelled" ? blankToNull(data.reason) : null,
      })
      .eq("id", data.reservationId)
      .eq("restaurant_id", data.restaurantId);
    if (error) throw new Error(error.message);

    const eventType: ReservationEventType =
      data.status === "cancelled" ? "cancelled" : data.status === "confirmed" ? "confirmed" : "status_changed";

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType,
      previousValues: { status: existing.status },
      newValues: { status: data.status },
      notes: data.status === "cancelled" ? blankToNull(data.reason) : null,
      actorMembershipId: me.id,
    });

    return { id: data.reservationId, status: data.status };
  });

/* --------------------------------------------------------------- dashboard */

export const getBookingsDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, today: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<BookingsDashboard> => {
    await requireReservationManager(context as never, data.restaurantId);
    const today = data.today;
    const monthStart = `${today.slice(0, 7)}-01`;

    const base = () =>
      context.supabase
        .from("hotel_reservations")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", data.restaurantId);

    const [arrivals, departures, staying, pending, upcoming, cancelled] = await Promise.all([
      base().in("status", ["pending", "confirmed"]).eq("arrival_date", today),
      base().in("status", ["confirmed", "checked_in"]).eq("departure_date", today),
      base().in("status", ["pending", "confirmed", "checked_in"]).lte("arrival_date", today).gt("departure_date", today),
      base().eq("status", "pending"),
      base().in("status", ["pending", "confirmed"]).gt("arrival_date", today),
      base().eq("status", "cancelled").gte("arrival_date", monthStart),
    ]);

    const { count: sellableRooms } = await context.supabase
      .from("hotel_rooms")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .eq("status", "available");

    const stayingToday = staying.count ?? 0;
    const rooms = sellableRooms ?? 0;

    return {
      today,
      arrivalsToday: arrivals.count ?? 0,
      departuresToday: departures.count ?? 0,
      stayingToday,
      pending: pending.count ?? 0,
      upcoming: upcoming.count ?? 0,
      cancelledThisMonth: cancelled.count ?? 0,
      sellableRooms: rooms,
      occupancyPercent: rooms > 0 ? Math.round((stayingToday / rooms) * 100) : 0,
    };
  });
