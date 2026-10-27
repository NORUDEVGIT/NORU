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
  earlyDeparturePenaltyType,
  earlyDeparturePolicyLine,
  stayDateChangeKind,
  stayDateFolioImpact,
  stayNights,
} from "./fo-stay-date-finance";
import { rateError } from "./rates.server";
import { projectOperationalStayRows, type FoSiblingUnit } from "./fo-unit-desk";
import {
  checkedInRoomIds,
  expandStayRooms,
  type FrontOfficeRoomTarget,
} from "./reservation-room-units";
import { isMissingSchemaError } from "./pms-set2-structure";
import { unitOccupantNames } from "./room-unit-guest-names";

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
  /** Set when this desk row is one reservation room. Absent on a header with no units. */
  reservationRoomId?: string | null;
  /** Other rooms on the same reservation, including a different lifecycle. */
  siblingUnits?: FoSiblingUnit[];
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
  /** Reservation-room unit occupying this physical room. Null when the room is vacant or the unit id is unknown. */
  reservationRoomId: string | null;
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

async function loadStayHeadersById(
  supabase: WorkspaceClient,
  restaurantId: string,
  reservationIds: string[],
  businessDate: string,
): Promise<FrontOfficeStay[]> {
  if (reservationIds.length === 0) return [];
  const { data, error } = await supabase
    .from("hotel_reservations")
    .select(STAY_SELECT)
    .eq("restaurant_id", restaurantId)
    .in("id", reservationIds);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as StayRow[]).map((row) => toStay(row, businessDate));
}

async function reservationIdsForUnits(
  supabase: WorkspaceClient,
  query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
): Promise<string[] | null> {
  const result = await query;
  if (result.error && isMissingSchemaError(result.error)) return null;
  if (result.error) throw new Error(result.error.message);
  return [
    ...new Set(
      ((result.data ?? []) as Array<{ reservation_id: string }>).map((row) => row.reservation_id),
    ),
  ];
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
  let stays = ((rows ?? []) as unknown as StayRow[]).map((r) => toStay(r, date));
  const unitIds = await reservationIdsForUnits(
    supabase,
    supabase
      .from("hotel_reservation_rooms")
      .select("reservation_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("arrival_date", date)
      .in("status", data.status ? [data.status] : ["pending", "confirmed"]),
  );
  if (unitIds) {
    const known = new Set(stays.map((stay) => stay.id));
    stays = stays.concat(
      await loadStayHeadersById(
        supabase,
        data.restaurantId,
        unitIds.filter((id) => !known.has(id)),
        date,
      ),
    );
  }
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
  const incomplete = progressError
    ? null
    : new Set(
        ((progressRows ?? []) as { reservation_id: string; walk_in_incomplete: boolean }[])
          .filter((p) => p.walk_in_incomplete)
          .map((p) => p.reservation_id),
      );
  const hydrated = await attachFrontOfficeRoomUnits(
    supabase,
    data.restaurantId,
    incomplete ? stays.map((s) => ({ ...s, walkInIncomplete: incomplete.has(s.id) })) : stays,
  );
  let projected = projectOperationalStayRows(hydrated, "arrivals", date);
  if (data.roomTypeId) projected = projected.filter((stay) => stay.roomTypeId === data.roomTypeId);
  if (data.assignment === "assigned") projected = projected.filter((stay) => stay.roomId);
  if (data.assignment === "unassigned") projected = projected.filter((stay) => !stay.roomId);
  return projected;
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
  .validator((input: unknown) =>
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

  let stays = ((rows ?? []) as unknown as StayRow[]).map((r) => toStay(r, today));
  const unitIds = await reservationIdsForUnits(
    supabase,
    supabase
      .from("hotel_reservation_rooms")
      .select("reservation_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "checked_in"),
  );
  if (unitIds) {
    const known = new Set(stays.map((stay) => stay.id));
    stays = stays.concat(
      await loadStayHeadersById(
        supabase,
        data.restaurantId,
        unitIds.filter((id) => !known.has(id)),
        today,
      ),
    );
  }
  const hydrated = await attachFrontOfficeRoomUnits(supabase, data.restaurantId, stays);
  const projected = projectOperationalStayRows(hydrated, "in_house", today);
  const term = (data.search ?? "").trim().toLowerCase();
  if (!term) return projected;
  return projected.filter(
    (s) =>
      s.guestName.toLowerCase().includes(term) ||
      s.confirmationNumber.toLowerCase().includes(term) ||
      (s.roomNumber ?? "").toLowerCase().includes(term),
  );
}

export const listInHouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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

  let stays = [
    ...((overdue.data ?? []) as unknown as StayRow[]),
    ...((dueToday.data ?? []) as unknown as StayRow[]),
  ].map((row) => toStay(row, date));
  const unitIds = await reservationIdsForUnits(
    supabase,
    supabase
      .from("hotel_reservation_rooms")
      .select("reservation_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "checked_in")
      .lte("departure_date", date),
  );
  if (unitIds) {
    const known = new Set(stays.map((stay) => stay.id));
    stays = stays.concat(
      await loadStayHeadersById(
        supabase,
        data.restaurantId,
        unitIds.filter((id) => !known.has(id)),
        date,
      ),
    );
  }
  const hydrated = await attachFrontOfficeRoomUnits(supabase, data.restaurantId, stays);
  return projectOperationalStayRows(hydrated, "departures", date);
}

export const listDepartures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, date: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FrontOfficeStay[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    return loadFrontOfficeDepartures(context.supabase, data);
  });

/** Room-level occupancy view; occupancy is derived from checked-in stays. */
export const listOccupancy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
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
            .select(
              "id, reservation_id, room_id, status, arrival_date, departure_date, unit_sequence",
            )
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
            id: string;
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
            id: unit.id,
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
    const byRoom = new Map<string, { stay: OccRow; reservationRoomId: string | null }>();
    for (const roomId of checkedInRoomIds(occupied)) {
      const stay = occupied.find((room) => room.roomId === roomId && room.status === "checked_in");
      const row = stay ? byId.get(stay.reservationId) : undefined;
      if (!row || !stay) continue;
      byRoom.set(roomId, {
        stay: { ...row, room_id: roomId, departure_date: stay.departureDate },
        reservationRoomId: stay.reservationRoomId,
      });
    }
    const unitGuestNames = await unitOccupantNames(
      context.supabase,
      data.restaurantId,
      [...byRoom.values()]
        .map((row) => row.reservationRoomId)
        .filter((id): id is string => Boolean(id)),
    );

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
      const occupiedRoom = byRoom.get(room.id);
      const stay = occupiedRoom?.stay;
      return {
        id: room.id,
        roomNumber: room.room_number,
        roomTypeId: room.room_type_id,
        roomTypeName: room.room_types?.name ?? "Room type",
        floor: room.floor,
        status: room.status,
        occupancy: stay ? ("occupied" as const) : ("vacant" as const),
        guestName: stay
          ? (occupiedRoom?.reservationRoomId
              ? unitGuestNames.get(occupiedRoom.reservationRoomId)
              : undefined) ||
            [stay.guest_profiles?.first_name, stay.guest_profiles?.last_name]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            "Guest"
          : null,
        reservationId: stay?.id ?? null,
        reservationRoomId: occupiedRoom?.reservationRoomId ?? null,
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
    reservationRoomId?: string | null;
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
  let roomId = current.room_id;
  let arrival = current.arrival_date;
  let departure = current.departure_date;
  if (expected.reservationRoomId) {
    const unitRead = await supabaseAdmin
      .from("hotel_reservation_rooms")
      .select("room_id, arrival_date, departure_date")
      .eq("restaurant_id", restaurantId)
      .eq("reservation_id", reservationId)
      .eq("id", expected.reservationRoomId)
      .maybeSingle();
    if (unitRead.error) throw new Error(unitRead.error.message);
    if (!unitRead.data) throw new Error("ROOM_UNIT_NOT_FOUND");
    const unit = unitRead.data as {
      room_id: string | null;
      arrival_date: string;
      departure_date: string;
    };
    roomId = unit.room_id;
    arrival = unit.arrival_date;
    departure = unit.departure_date;
  }
  if (
    stayMutationIsStale(expected, {
      roomId,
      arrival,
      departure,
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
  .validator((input: unknown) =>
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
  .validator((input: unknown) =>
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
  .validator((input: unknown) =>
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
      reservationRoomId: data.reservationRoomId,
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
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        arrival: dateSchema,
        departure: dateSchema,
        reservationRoomId: idSchema.optional(),
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
      if (data.reservationRoomId) {
        const units = await supabaseAdmin
          .from("hotel_reservation_rooms")
          .select("id, status")
          .eq("restaurant_id", data.restaurantId)
          .eq("reservation_id", data.reservationId);
        if (units.error) throw new Error(units.error.message);
        const openUnits = (
          (units.data ?? []) as Array<{ id: string; status: string | null }>
        ).filter(
          (unit) =>
            unit.status == null ||
            (unit.status !== "cancelled" &&
              unit.status !== "no_show" &&
              unit.status !== "checked_out"),
        );
        if (openUnits.length > 1) {
          throw new Error(
            "This room is one of several on the reservation. This desk will not change every room from this row.",
          );
        }
      }
      await assertStayMutationFreshness(supabaseAdmin, data.restaurantId, data.reservationId, {
        expectedRoomId: data.expectedRoomId,
        expectedArrival: data.expectedArrival,
        expectedDeparture: data.expectedDeparture,
        expectedUpdatedAt: data.expectedUpdatedAt,
        reservationRoomId: data.reservationRoomId,
      });
      const stayRead = await supabaseAdmin
        .from("hotel_reservations")
        .select("status")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.reservationId)
        .maybeSingle();
      if (stayRead.error) throw new Error(stayRead.error.message);
      const stay = stayRead.data as { status?: string } | null;
      const { assertExistingReservationGroupPickup, resyncGroupBlockInventoryForReservation } =
        await import("./groups.functions");
      await assertExistingReservationGroupPickup(supabaseAdmin, {
        restaurantId: data.restaurantId,
        reservationId: data.reservationId,
        overlay: {
          arrivalDate: arrival,
          departureDate: departure,
          status: stay?.status,
        },
      });
      const { error } = await supabaseAdmin.rpc("apply_inhouse_stay_date_change", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _arrival: arrival,
        _departure: departure,
        _membership_id: me.id,
      });
      if (error) throw reservationError(error.message);
      await resyncGroupBlockInventoryForReservation(
        supabaseAdmin,
        me.id,
        data.restaurantId,
        data.reservationId,
      );
      return { id: data.reservationId, arrival, departure };
    },
  );

/**
 * @deprecated Ungated no-show. Front Office UI must use `completeFoNoShow`.
 */
export const markNoShow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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
    const { resyncGroupBlockInventoryForReservation } = await import("./groups.functions");
    await resyncGroupBlockInventoryForReservation(
      supabaseAdmin,
      me.id,
      data.restaurantId,
      data.reservationId,
    );
    return { id: data.reservationId, status: "no_show" };
  });

export type InHouseStayQuote = {
  kind: ReturnType<typeof stayDateChangeKind>;
  previousNights: number;
  nextNights: number;
  previousSubtotal: number;
  quotedSubtotal: number;
  currency: string | null;
  penaltyType: string;
  penaltyPosted: false;
  policyLine: string;
  impact: string[];
};

/** Read-only quote. price_hotel_stay is the only price. Nothing is written. */
export const quoteInHouseStayChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        arrival: dateSchema,
        departure: dateSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<InHouseStayQuote> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { arrival, departure } = assertStayDates(data.arrival, data.departure);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stayRead = await supabaseAdmin
      .from("hotel_reservations")
      .select(
        "arrival_date, departure_date, room_subtotal, currency, early_departure_policy_snapshot, status",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (stayRead.error) throw new Error(stayRead.error.message);
    const stay = stayRead.data as {
      arrival_date: string;
      departure_date: string;
      room_subtotal: number | string | null;
      currency: string | null;
      early_departure_policy_snapshot: unknown;
      status: string;
    } | null;
    if (!stay) throw reservationError("RESERVATION_NOT_FOUND");
    if (!["pending", "confirmed", "checked_in"].includes(stay.status)) {
      throw reservationError("INVALID_TRANSITION");
    }

    const unitsRead = await supabaseAdmin
      .from("hotel_reservation_rooms")
      .select(
        "id, arrival_date, departure_date, rate_plan_id, room_type_id, adults, children, infants, currency, status",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId);
    if (unitsRead.error) throw new Error(unitsRead.error.message);
    const units = (unitsRead.data ?? []) as Array<{
      id: string;
      arrival_date: string;
      departure_date: string;
      rate_plan_id: string | null;
      room_type_id: string;
      adults: number;
      children: number;
      infants: number | null;
      currency: string | null;
      status: string;
    }>;
    const active = units.filter(
      (unit) => !["cancelled", "no_show", "checked_out"].includes(unit.status),
    );
    if (
      active.some(
        (unit) =>
          unit.arrival_date !== stay.arrival_date || unit.departure_date !== stay.departure_date,
      )
    ) {
      throw reservationError("UNIT_DATES_DIVERGED");
    }
    if (active.some((unit) => !unit.rate_plan_id)) throw reservationError("RATE_PLAN_REQUIRED");

    let quoted = 0;
    let currency = stay.currency;
    for (const unit of active) {
      const priced = await supabaseAdmin.rpc("price_hotel_stay", {
        _restaurant_id: data.restaurantId,
        _rate_plan_id: unit.rate_plan_id as string,
        _room_type_id: unit.room_type_id,
        _arrival: arrival,
        _departure: departure,
        _rooms: 1,
        _adults: unit.adults,
        _children: unit.children,
        _infants: unit.infants ?? 0,
        _quote_currency: unit.currency ?? stay.currency ?? undefined,
      });
      if (priced.error) throw rateError(priced.error.message);
      const row = priced.data as { subtotal?: number | string; currency?: string } | null;
      quoted += Number(row?.subtotal ?? 0);
      currency = row?.currency ?? currency;
    }
    if (active.length === 0) quoted = Number(stay.room_subtotal ?? 0);

    const kind = stayDateChangeKind(stay.arrival_date, stay.departure_date, arrival, departure);
    const penaltyType = earlyDeparturePenaltyType(stay.early_departure_policy_snapshot);
    return {
      kind,
      previousNights: stayNights(stay.arrival_date, stay.departure_date),
      nextNights: stayNights(arrival, departure),
      previousSubtotal: Number(stay.room_subtotal ?? 0),
      quotedSubtotal: Math.round(quoted * 100) / 100,
      currency,
      penaltyType,
      penaltyPosted: false,
      policyLine: earlyDeparturePolicyLine(stay.early_departure_policy_snapshot),
      impact: stayDateFolioImpact(kind, penaltyType),
    };
  });
