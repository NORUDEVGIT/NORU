/**
 * Phase 6E — Front Office operations.
 *
 * Arrivals, check-in, in-house, room moves, stay changes, departures, check-out,
 * no-shows. Every handler re-derives the caller's owner/manager membership from
 * restaurant_users; the browser's restaurant id only selects which membership
 * applies. Critical transitions run inside locked SECURITY DEFINER functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertDateOnly,
  nightsBetween,
  requireReservationManager,
  reservationError,
  type ReservationStatus,
} from "./reservations.server";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/* ------------------------------------------------------------------- types */

export interface FrontOfficeStay {
  id: string;
  confirmationNumber: string;
  guestId: string;
  guestName: string;
  guestVip: boolean;
  guestPhone: string | null;
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
  specialRequests: string | null;
  source?: string | null;
  overstay: boolean;
  walkInIncomplete?: boolean;
}

export interface FrontOfficeDashboard {
  today: string;
  arrivalsToday: number;
  departuresToday: number;
  inHouse: number;
  availableRooms: number;
  occupiedRooms: number;
  outOfOrder: number;
  outOfService: number;
}

export interface OccupancyRoom {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  floor: string | null;
  status: string;
  occupancy: "vacant" | "occupied";
  guestName: string | null;
  reservationId: string | null;
  departureDate: string | null;
}

const STAY_SELECT = `
  id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date,
  adults, children, status, special_requests,
  guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, vip_status ),
  room_types!hotel_reservations_type_same_property ( name ),
  hotel_rooms!hotel_reservations_room_same_type ( room_number )
`;

type StayRow = {
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
  special_requests: string | null;
  guest_profiles: {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    vip_status: boolean;
  } | null;
  room_types: { name: string } | null;
  hotel_rooms: { room_number: string } | null;
};

function toStay(row: StayRow, businessDate: string): FrontOfficeStay {
  const guest = row.guest_profiles;
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    guestName: [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim() || "Guest",
    guestVip: guest?.vip_status ?? false,
    guestPhone: guest?.phone ?? null,
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
    specialRequests: row.special_requests,
    overstay: row.status === "checked_in" && row.departure_date < businessDate,
    walkInIncomplete: false,
  };
}

/* --------------------------------------------------------------- dashboard */

export const getFrontOfficeDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, today: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FrontOfficeDashboard> => {
    await requireReservationManager(context as never, data.restaurantId);
    const today = assertDateOnly(data.today, "Business date");

    const reservations = () =>
      context.supabase
        .from("hotel_reservations")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", data.restaurantId);

    const rooms = (status: string) =>
      context.supabase
        .from("hotel_rooms")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", data.restaurantId)
        .eq("active", true)
        .eq("status", status);

    const [arrivals, departures, inHouse, available, ooo, oos] = await Promise.all([
      reservations().in("status", ["pending", "confirmed"]).eq("arrival_date", today),
      reservations().in("status", ["confirmed", "checked_in"]).eq("departure_date", today),
      reservations().eq("status", "checked_in"),
      rooms("available"),
      rooms("out_of_order"),
      rooms("out_of_service"),
    ]);

    // Occupancy is derived: a room is occupied while a checked-in stay holds it.
    const { data: occupiedRows } = await context.supabase
      .from("hotel_reservations")
      .select("room_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "checked_in")
      .not("room_id", "is", null);
    const occupiedRooms = new Set((occupiedRows ?? []).map((r) => r.room_id)).size;

    const availableRooms = available.count ?? 0;
    return {
      today,
      arrivalsToday: arrivals.count ?? 0,
      departuresToday: departures.count ?? 0,
      inHouse: inHouse.count ?? 0,
      availableRooms: Math.max(0, availableRooms - occupiedRooms),
      occupiedRooms,
      outOfOrder: ooo.count ?? 0,
      outOfService: oos.count ?? 0,
    };
  });

/* ----------------------------------------------------------------- listing */

export const listArrivals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        date: dateSchema,
        status: z.enum(["pending", "confirmed"]).optional(),
        roomTypeId: idSchema.optional(),
        assignment: z.enum(["assigned", "unassigned"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<FrontOfficeStay[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const date = assertDateOnly(data.date, "Arrival date");

    let query = context.supabase
      .from("hotel_reservations")
      .select(STAY_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("arrival_date", date)
      .in("status", data.status ? [data.status] : ["pending", "confirmed"])
      .order("confirmation_number");

    if (data.roomTypeId) query = query.eq("room_type_id", data.roomTypeId);
    if (data.assignment === "assigned") query = query.not("room_id", "is", null);
    if (data.assignment === "unassigned") query = query.is("room_id", null);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const stays = ((rows ?? []) as unknown as StayRow[]).map((r) => toStay(r, date));
    if (stays.length === 0) return stays;

    const { data: progressRows, error: progressError } = await context.supabase
      .from("fo_checkin_progress")
      .select("reservation_id, walk_in_incomplete")
      .eq("restaurant_id", data.restaurantId)
      .in("reservation_id", stays.map((s) => s.id))
      .eq("walk_in_incomplete", true);
    if (progressError) return stays;
    const incomplete = new Set(
      ((progressRows ?? []) as { reservation_id: string; walk_in_incomplete: boolean }[])
        .filter((p) => p.walk_in_incomplete)
        .map((p) => p.reservation_id),
    );
    return stays.map((s) => ({ ...s, walkInIncomplete: incomplete.has(s.id) }));
  });

export const listInHouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, today: dateSchema, search: z.string().max(120).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<FrontOfficeStay[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const today = assertDateOnly(data.today, "Business date");

    const { data: rows, error } = await context.supabase
      .from("hotel_reservations")
      .select(STAY_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "checked_in")
      .order("departure_date");
    if (error) throw new Error(error.message);

    const stays = ((rows ?? []) as unknown as StayRow[]).map((r) => toStay(r, today));
    const term = (data.search ?? "").trim().toLowerCase();
    if (!term) return stays;
    return stays.filter(
      (s) =>
        s.guestName.toLowerCase().includes(term) ||
        s.confirmationNumber.toLowerCase().includes(term) ||
        (s.roomNumber ?? "").toLowerCase().includes(term),
    );
  });

export const listDepartures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, date: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FrontOfficeStay[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const date = assertDateOnly(data.date, "Departure date");

    const [dueToday, overdue] = await Promise.all([
      context.supabase
        .from("hotel_reservations")
        .select(STAY_SELECT)
        .eq("restaurant_id", data.restaurantId)
        .in("status", ["confirmed", "checked_in"])
        .eq("departure_date", date)
        .order("confirmation_number"),
      context.supabase
        .from("hotel_reservations")
        .select(STAY_SELECT)
        .eq("restaurant_id", data.restaurantId)
        .eq("status", "checked_in")
        .lt("departure_date", date)
        .order("departure_date"),
    ]);
    if (dueToday.error) throw new Error(dueToday.error.message);
    if (overdue.error) throw new Error(overdue.error.message);

    const rows = [...((overdue.data ?? []) as unknown as StayRow[]), ...((dueToday.data ?? []) as unknown as StayRow[])];
    return rows.map((r) => toStay(r, date));
  });

/** Room-level occupancy view; occupancy is derived from checked-in stays. */
export const listOccupancy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<OccupancyRoom[]> => {
    await requireReservationManager(context as never, data.restaurantId);

    const { data: rooms, error } = await context.supabase
      .from("hotel_rooms")
      .select("id, room_number, floor, status, room_type_id, room_types!inner ( name )")
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .order("room_number");
    if (error) throw new Error(error.message);

    const { data: stays } = await context.supabase
      .from("hotel_reservations")
      .select(
        "id, room_id, departure_date, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "checked_in")
      .not("room_id", "is", null);

    type OccRow = {
      id: string;
      room_id: string | null;
      departure_date: string;
      guest_profiles: { first_name: string; last_name: string | null } | null;
    };
    const byRoom = new Map<string, OccRow>();
    for (const s of (stays ?? []) as unknown as OccRow[]) {
      if (s.room_id) byRoom.set(s.room_id, s);
    }

    return ((rooms ?? []) as unknown as Array<{
      id: string;
      room_number: string;
      floor: string | null;
      status: string;
      room_type_id: string;
      room_types: { name: string } | null;
    }>).map((room) => {
      const stay = byRoom.get(room.id);
      return {
        id: room.id,
        roomNumber: room.room_number,
        roomTypeId: room.room_type_id,
        roomTypeName: room.room_types?.name ?? "Room type",
        floor: room.floor,
        status: room.status,
        occupancy: stay ? ("occupied" as const) : ("vacant" as const),
        guestName: stay
          ? [stay.guest_profiles?.first_name, stay.guest_profiles?.last_name].filter(Boolean).join(" ").trim() || "Guest"
          : null,
        reservationId: stay?.id ?? null,
        departureDate: stay?.departure_date ?? null,
      };
    });
  });

/* --------------------------------------------------------------- movements */

export const checkInReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, reservationId: idSchema, roomId: idSchema.nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: ReservationStatus }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("check_in_hotel_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _room_id: (data.roomId ?? null) as unknown as string,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId, status: "checked_in" };
  });

export const checkOutReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: ReservationStatus }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("check_out_hotel_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId, status: "checked_out" };
  });

export const moveReservationRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        roomId: idSchema,
        reason: z.string().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("move_hotel_reservation_room", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _room_id: data.roomId,
      _reason: data.reason,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId };
  });

export const changeStayDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema, departure: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; departure: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const departure = assertDateOnly(data.departure, "Departure date");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("change_hotel_stay_dates", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _departure: departure,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId, departure };
  });

export const markNoShow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema, today: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: ReservationStatus }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const today = assertDateOnly(data.today, "Business date");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("mark_hotel_reservation_no_show", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _business_date: today,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId, status: "no_show" };
  });
