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
  assertStayDates,
  nightsBetween,
  requireReservationManager,
  reservationError,
  type ReservationStatus,
} from "./reservations.server";
import { STAY_MUTATION_CONFLICT, stayMutationIsStale } from "./fo-mutation-freshness";
import {
  checkedInRoomIds,
  expandStayRooms,
  type FrontOfficeRoomTarget,
} from "./reservation-room-units";
import { isMissingSchemaError } from "./pms-set2-structure";

export type { FrontOfficeDashboard } from "@/integrations/cross-package/front-office-dashboard.functions";
export { getFrontOfficeDashboard } from "@/integrations/cross-package/front-office-dashboard.functions";

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
  guestEmail: string | null;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode?: string | null;
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
  guaranteeMethod?: string | null;
  overstay: boolean;
  walkInIncomplete?: boolean;
  expectedArrivalAt?: string | null;
  lateCheckoutGranted?: boolean;
  lateCheckoutUntil?: string | null;
  lateCheckoutNote?: string | null;
  updatedAt?: string | null;
  /** Present when Reservation Detail loaded room units. Pickers show only when there are two or more. */
  roomUnits?: FrontOfficeRoomTarget[];
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
  adults, children, status, special_requests, source, guarantee_method, updated_at,
  expected_arrival_at, late_checkout_granted, late_checkout_until, late_checkout_note,
  guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, email, vip_status ),
  room_types!hotel_reservations_type_same_property ( name, code ),
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
  source: string | null;
  guarantee_method: string | null;
  expected_arrival_at: string | null;
  late_checkout_granted: boolean | null;
  late_checkout_until: string | null;
  late_checkout_note: string | null;
  updated_at: string | null;
  guest_profiles: {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    vip_status: boolean;
  } | null;
  room_types: { name: string; code?: string | null } | null;
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
    guestEmail: guest?.email ?? null,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? "Room type",
    roomTypeCode: row.room_types?.code ?? null,
    roomId: row.room_id,
    roomNumber: row.hotel_rooms?.room_number ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nights: nightsBetween(row.arrival_date, row.departure_date),
    adults: row.adults,
    children: row.children,
    status: row.status as ReservationStatus,
    specialRequests: row.special_requests,
    source: row.source,
    guaranteeMethod: row.guarantee_method,
    overstay: row.status === "checked_in" && row.departure_date < businessDate,
    walkInIncomplete: false,
    expectedArrivalAt: row.expected_arrival_at ?? null,
    lateCheckoutGranted: row.late_checkout_granted === true,
    updatedAt: row.updated_at ?? null,
    lateCheckoutUntil: row.late_checkout_until ?? null,
    lateCheckoutNote: row.late_checkout_note ?? null,
  };
}

/* ----------------------------------------------------------------- listing */

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

async function attachFrontOfficeRoomUnits(
  supabase: WorkspaceClient,
  restaurantId: string,
  stays: FrontOfficeStay[],
): Promise<FrontOfficeStay[]> {
  if (stays.length === 0) return stays;
  const reservationIds = stays.map((stay) => stay.id);
  const unitsResult = await supabase
    .from("hotel_reservation_rooms")
    .select(
      "id, reservation_id, unit_sequence, room_type_id, room_id, arrival_date, departure_date, adults, children, infants, rate_plan_id, status",
    )
    .eq("restaurant_id", restaurantId)
    .in("reservation_id", reservationIds)
    .order("unit_sequence");
  if (unitsResult.error && !isMissingSchemaError(unitsResult.error)) {
    throw new Error(unitsResult.error.message);
  }
  if (unitsResult.error) return stays;
  const units = (unitsResult.data ?? []) as Array<{
    id: string;
    reservation_id: string;
    unit_sequence: number;
    room_type_id: string;
    room_id: string | null;
    arrival_date: string;
    departure_date: string;
    adults: number;
    children: number;
    infants: number;
    rate_plan_id: string | null;
    status: string | null;
  }>;
  const roomUnitIds = units.map((unit) => unit.id);
  const occupantsResult =
    roomUnitIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("hotel_reservation_room_guests")
          .select("reservation_room_id, guest_id, is_primary")
          .eq("restaurant_id", restaurantId)
          .in("reservation_room_id", roomUnitIds);
  if (occupantsResult.error && !isMissingSchemaError(occupantsResult.error)) {
    throw new Error(occupantsResult.error.message);
  }
  const occupantRows = (occupantsResult.data ?? []) as Array<{
    reservation_room_id: string;
    guest_id: string;
    is_primary: boolean;
  }>;
  const guestIds = [...new Set(occupantRows.map((occupant) => occupant.guest_id))];
  const typeIds = [...new Set(units.map((unit) => unit.room_type_id))];
  const roomIds = [
    ...new Set(units.map((unit) => unit.room_id).filter((id): id is string => Boolean(id))),
  ];
  const planIds = [
    ...new Set(units.map((unit) => unit.rate_plan_id).filter((id): id is string => Boolean(id))),
  ];
  const [guestResult, typeResult, roomResult, planResult] = await Promise.all([
    guestIds.length
      ? supabase
          .from("guest_profiles")
          .select("id, first_name, last_name")
          .eq("restaurant_id", restaurantId)
          .in("id", guestIds)
      : Promise.resolve({ data: [], error: null }),
    typeIds.length
      ? supabase
          .from("room_types")
          .select("id, name")
          .eq("restaurant_id", restaurantId)
          .in("id", typeIds)
      : Promise.resolve({ data: [], error: null }),
    roomIds.length
      ? supabase
          .from("hotel_rooms")
          .select("id, room_number")
          .eq("restaurant_id", restaurantId)
          .in("id", roomIds)
      : Promise.resolve({ data: [], error: null }),
    planIds.length
      ? supabase
          .from("hotel_rate_plans")
          .select("id, name")
          .eq("restaurant_id", restaurantId)
          .in("id", planIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [guestResult, typeResult, roomResult, planResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const guestNames = new Map(
    (guestResult.data ?? []).map((guest) => [
      guest.id,
      [guest.first_name, guest.last_name].filter(Boolean).join(" ").trim() || "Guest",
    ]),
  );
  const typeNames = new Map((typeResult.data ?? []).map((type) => [type.id, type.name]));
  const roomNumbers = new Map((roomResult.data ?? []).map((room) => [room.id, room.room_number]));
  const planNames = new Map((planResult.data ?? []).map((plan) => [plan.id, plan.name]));
  const byReservation = new Map<string, FrontOfficeRoomTarget[]>();
  for (const unit of units) {
    const targets = byReservation.get(unit.reservation_id) ?? [];
    targets.push({
      id: unit.id,
      unitSequence: unit.unit_sequence,
      roomTypeId: unit.room_type_id,
      roomId: unit.room_id,
      arrivalDate: unit.arrival_date,
      departureDate: unit.departure_date,
      adults: unit.adults,
      children: unit.children,
      infants: unit.infants,
      status: unit.status,
      roomTypeName: typeNames.get(unit.room_type_id) ?? null,
      roomNumber: unit.room_id ? (roomNumbers.get(unit.room_id) ?? null) : null,
      ratePlanName: unit.rate_plan_id ? (planNames.get(unit.rate_plan_id) ?? null) : null,
      occupants: occupantRows
        .filter((occupant) => occupant.reservation_room_id === unit.id)
        .map((occupant) => ({
          guestId: occupant.guest_id,
          name: guestNames.get(occupant.guest_id) ?? "Guest",
          isPrimary: occupant.is_primary,
        }))
        .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary)),
    });
    byReservation.set(unit.reservation_id, targets);
  }
  return stays.map((stay) => ({ ...stay, roomUnits: byReservation.get(stay.id) ?? [] }));
}

export async function loadFrontOfficeArrivals(
  supabase: WorkspaceClient,
  data: {
    restaurantId: string;
    date: string;
    status?: "pending" | "confirmed";
    roomTypeId?: string;
    assignment?: "assigned" | "unassigned";
  },
): Promise<FrontOfficeStay[]> {
  const date = assertDateOnly(data.date, "Arrival date");

  let query = supabase
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

  const { data: progressRows, error: progressError } = await supabase
    .from("fo_checkin_progress")
    .select("reservation_id, walk_in_incomplete")
    .eq("restaurant_id", data.restaurantId)
    .in(
      "reservation_id",
      stays.map((s) => s.id),
    )
    .eq("walk_in_incomplete", true);
  if (progressError) {
    return attachFrontOfficeRoomUnits(supabase, data.restaurantId, stays);
  }
  const incomplete = new Set(
    ((progressRows ?? []) as { reservation_id: string; walk_in_incomplete: boolean }[])
      .filter((p) => p.walk_in_incomplete)
      .map((p) => p.reservation_id),
  );
  return attachFrontOfficeRoomUnits(
    supabase,
    data.restaurantId,
    stays.map((s) => ({ ...s, walkInIncomplete: incomplete.has(s.id) })),
  );
}

export async function loadFrontOfficeStay(
  supabase: WorkspaceClient,
  data: { restaurantId: string; reservationId: string; today: string },
): Promise<FrontOfficeStay | null> {
  const today = assertDateOnly(data.today, "Business date");
  const { data: row, error } = await supabase
    .from("hotel_reservations")
    .select(STAY_SELECT)
    .eq("restaurant_id", data.restaurantId)
    .eq("id", data.reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const stay = toStay(row as unknown as StayRow, today);
  const { data: progress } = await supabase
    .from("fo_checkin_progress")
    .select("walk_in_incomplete")
    .eq("restaurant_id", data.restaurantId)
    .eq("reservation_id", data.reservationId)
    .maybeSingle();
  const [hydrated] = await attachFrontOfficeRoomUnits(supabase, data.restaurantId, [
    { ...stay, walkInIncomplete: progress?.walk_in_incomplete === true },
  ]);
  return hydrated ?? null;
}

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
    return loadFrontOfficeArrivals(context.supabase, data);
  });

export async function loadFrontOfficeInHouse(
  supabase: WorkspaceClient,
  data: { restaurantId: string; today: string; search?: string },
): Promise<FrontOfficeStay[]> {
  const today = assertDateOnly(data.today, "Business date");
  const { data: rows, error } = await supabase
    .from("hotel_reservations")
    .select(STAY_SELECT)
    .eq("restaurant_id", data.restaurantId)
    .eq("status", "checked_in")
    .order("departure_date");
  if (error) throw new Error(error.message);

  const stays = await attachFrontOfficeRoomUnits(
    supabase,
    data.restaurantId,
    ((rows ?? []) as unknown as StayRow[]).map((r) => toStay(r, today)),
  );
  const term = (data.search ?? "").trim().toLowerCase();
  if (!term) return stays;
  return stays.filter(
    (s) =>
      s.guestName.toLowerCase().includes(term) ||
      s.confirmationNumber.toLowerCase().includes(term) ||
      (s.roomNumber ?? "").toLowerCase().includes(term),
  );
}

export const listInHouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, today: dateSchema, search: z.string().max(120).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<FrontOfficeStay[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    return loadFrontOfficeInHouse(context.supabase, data);
  });

export async function loadFrontOfficeDepartures(
  supabase: WorkspaceClient,
  data: { restaurantId: string; date: string },
): Promise<FrontOfficeStay[]> {
  const date = assertDateOnly(data.date, "Departure date");

  const [dueToday, overdue] = await Promise.all([
    supabase
      .from("hotel_reservations")
      .select(STAY_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .in("status", ["confirmed", "checked_in"])
      .eq("departure_date", date)
      .order("confirmation_number"),
    supabase
      .from("hotel_reservations")
      .select(STAY_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "checked_in")
      .lt("departure_date", date)
      .order("departure_date"),
  ]);
  if (dueToday.error) throw new Error(dueToday.error.message);
  if (overdue.error) throw new Error(overdue.error.message);

  const rows = [
    ...((overdue.data ?? []) as unknown as StayRow[]),
    ...((dueToday.data ?? []) as unknown as StayRow[]),
  ];
  return attachFrontOfficeRoomUnits(
    supabase,
    data.restaurantId,
    rows.map((r) => toStay(r, date)),
  );
}

export const listDepartures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, date: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FrontOfficeStay[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    return loadFrontOfficeDepartures(context.supabase, data);
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
        "id, room_id, arrival_date, departure_date, status, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "checked_in");

    type OccRow = {
      id: string;
      room_id: string | null;
      arrival_date: string;
      departure_date: string;
      status: string;
      guest_profiles: { first_name: string; last_name: string | null } | null;
    };
    const stayRows = (stays ?? []) as unknown as OccRow[];
    const unitResult =
      stayRows.length === 0
        ? { data: [], error: null }
        : await context.supabase
            .from("hotel_reservation_rooms")
            .select("reservation_id, room_id, status, arrival_date, departure_date, unit_sequence")
            .eq("restaurant_id", data.restaurantId)
            .in(
              "reservation_id",
              stayRows.map((stay) => stay.id),
            );
    if (unitResult.error && !isMissingSchemaError(unitResult.error)) {
      throw new Error(unitResult.error.message);
    }
    const unitRows =
      unitResult.error && isMissingSchemaError(unitResult.error)
        ? null
        : ((unitResult.data ?? []) as Array<{
            reservation_id: string;
            room_id: string | null;
            status: string | null;
            arrival_date: string;
            departure_date: string;
            unit_sequence: number;
          }>);
    const occupied = expandStayRooms(
      stayRows.map((stay) => ({
        id: stay.id,
        roomId: stay.room_id,
        status: stay.status,
        arrivalDate: stay.arrival_date,
        departureDate: stay.departure_date,
      })),
      unitRows
        ? unitRows.map((unit) => ({
            reservationId: unit.reservation_id,
            roomId: unit.room_id,
            status: unit.status,
            arrivalDate: unit.arrival_date,
            departureDate: unit.departure_date,
            unitSequence: unit.unit_sequence,
          }))
        : null,
    );
    const byId = new Map(stayRows.map((stay) => [stay.id, stay]));
    const byRoom = new Map<string, OccRow>();
    for (const roomId of checkedInRoomIds(occupied)) {
      const stay = occupied.find((room) => room.roomId === roomId && room.status === "checked_in");
      const row = stay ? byId.get(stay.reservationId) : undefined;
      if (!row || !stay) continue;
      byRoom.set(roomId, { ...row, room_id: roomId, departure_date: stay.departureDate });
    }

    return (
      (rooms ?? []) as unknown as Array<{
        id: string;
        room_number: string;
        floor: string | null;
        status: string;
        room_type_id: string;
        room_types: { name: string } | null;
      }>
    ).map((room) => {
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
          ? [stay.guest_profiles?.first_name, stay.guest_profiles?.last_name]
              .filter(Boolean)
              .join(" ")
              .trim() || "Guest"
          : null,
        reservationId: stay?.id ?? null,
        departureDate: stay?.departure_date ?? null,
      };
    });
  });

async function assertStayMutationFreshness(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
  expected: {
    expectedRoomId?: string | null;
    expectedArrival?: string;
    expectedDeparture?: string;
    expectedUpdatedAt?: string | null;
  },
): Promise<void> {
  const hasExpectation =
    expected.expectedRoomId !== undefined ||
    expected.expectedArrival !== undefined ||
    expected.expectedDeparture !== undefined ||
    (expected.expectedUpdatedAt !== undefined &&
      expected.expectedUpdatedAt !== null &&
      expected.expectedUpdatedAt !== "");
  if (!hasExpectation) return;

  const { data, error } = await supabaseAdmin
    .from("hotel_reservations")
    .select("room_id, arrival_date, departure_date, updated_at")
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Reservation not found for this property.");
  const current = data as {
    room_id: string | null;
    arrival_date: string;
    departure_date: string;
    updated_at: string | null;
  };
  if (
    stayMutationIsStale(expected, {
      roomId: current.room_id,
      arrival: current.arrival_date,
      departure: current.departure_date,
      updatedAt: current.updated_at,
    })
  ) {
    throw new Error(STAY_MUTATION_CONFLICT);
  }
}

/* --------------------------------------------------------------- movements */

/**
 * @deprecated Ungated check-in. Front Office UI must use `completeFoCheckIn`.
 * Kept only so existing tests/internal callers can still name the RPC wrapper.
 */
export const checkInReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        roomId: idSchema.nullable().optional(),
      })
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

/**
 * @deprecated Ungated checkout. Front Office UI must use `completeFoCheckOut`.
 */
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
        reservationRoomId: idSchema.optional(),
        expectedRoomId: idSchema.nullable().optional(),
        expectedArrival: dateSchema.optional(),
        expectedDeparture: dateSchema.optional(),
        expectedUpdatedAt: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertStayMutationFreshness(supabaseAdmin, data.restaurantId, data.reservationId, {
      expectedRoomId: data.expectedRoomId,
      expectedArrival: data.expectedArrival,
      expectedDeparture: data.expectedDeparture,
      expectedUpdatedAt: data.expectedUpdatedAt,
    });
    const { error } = await supabaseAdmin.rpc("move_hotel_reservation_room", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _room_id: data.roomId,
      _reason: data.reason,
      _membership_id: me.id,
      ...(data.reservationRoomId ? { _reservation_room_id: data.reservationRoomId } : {}),
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId };
  });

export const changeStayDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        arrival: dateSchema,
        departure: dateSchema,
        expectedRoomId: idSchema.nullable().optional(),
        expectedArrival: dateSchema.optional(),
        expectedDeparture: dateSchema.optional(),
        expectedUpdatedAt: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({ data, context }): Promise<{ id: string; arrival: string; departure: string }> => {
      const me = await requireReservationManager(context as never, data.restaurantId);
      const { arrival, departure } = assertStayDates(data.arrival, data.departure);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await assertStayMutationFreshness(supabaseAdmin, data.restaurantId, data.reservationId, {
        expectedRoomId: data.expectedRoomId,
        expectedArrival: data.expectedArrival,
        expectedDeparture: data.expectedDeparture,
        expectedUpdatedAt: data.expectedUpdatedAt,
      });
      const { error } = await supabaseAdmin.rpc("change_hotel_stay_dates", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _arrival: arrival,
        _departure: departure,
        _membership_id: me.id,
      });
      if (error) throw reservationError(error.message);
      return { id: data.reservationId, arrival, departure };
    },
  );

/**
 * @deprecated Ungated no-show. Front Office UI must use `completeFoNoShow`.
 */
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
