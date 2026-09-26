import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MANUAL_RESERVATION_STATUSES,
  RESERVATION_STATUSES,
  assertBookingStatusTransition,
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
import { callerMembership, displayName } from "@/core/lib/workforce.server";
import { assertCreateReservationPricing } from "./create-reservation-phase1-section5";
import { assertRoomTypeOccupancy } from "./create-reservation-phase1-section4";
import { stayFitsAllotment } from "./groups";
import {
  assertCreateReservationSection7,
  section7PersistApplied,
} from "./create-reservation-phase1-section7";
import {
  getAssignmentEligibilityCompat,
  getRoomTypeAvailabilityCompat,
  type AssignmentEligibilityResult,
} from "./room-inventory-compat";

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
  roomTypeCode?: string | null;
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
  ratePlanName: string | null;
  currency: string | null;
  roomSubtotal: number | null;
  nightlyRates: { date: string; rate: number }[];
  pricedAt: string | null;
  commercialBookingSource: string | null;
  marketSegment: string | null;
  externalReference: string | null;
  guaranteeMethod: string | null;
  companyMasterId: string | null;
  companyName: string | null;
  travelAgentMasterId: string | null;
  travelAgentName: string | null;
  groupAccountMasterId: string | null;
  groupName: string | null;
  roomOperationalStatus: string | null;
  housekeepingStatus: string | null;
}

type JsonValue = string | number | boolean | null;

export interface ReservationHistoryEntry {
  id: string;
  eventType: ReservationEventType;
  previousValues: Record<string, JsonValue> | null;
  newValues: Record<string, JsonValue> | null;
  notes: string | null;
  createdAt: string;
  actorName: string | null;
}

export { reservationHistoryChanges } from "./reservation-history-display";
export type { ReservationHistoryChange } from "./reservation-history-display";

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
  housekeepingStatus: string | null;
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
  commercial_booking_source, market_segment, external_reference, guarantee_method,
  company_master_id, travel_agent_master_id, group_account_master_id,
  created_at, updated_at,
  guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, email, vip_status ),
  room_types!hotel_reservations_type_same_property ( name, code ),
  hotel_rooms!hotel_reservations_room_same_type ( room_number, status, housekeeping_status ),
  rate_plan:hotel_rate_plans!hotel_reservations_rate_plan_same_property ( name ),
  company:guest_account_masters!hotel_reservations_company_master_same_property ( name ),
  travel_agent:guest_account_masters!hotel_reservations_travel_agent_master_same_property ( name ),
  group_account:guest_account_masters!hotel_reservations_group_account_master_same_property ( name )
`;

type NameRelation = { name: string; code?: string | null } | null;
type GuestRelation = {
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  vip_status: boolean;
};
type RoomRelation = {
  room_number: string;
  status?: string | null;
  housekeeping_status?: string | null;
};

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
  commercial_booking_source: string | null;
  market_segment: string | null;
  external_reference: string | null;
  guarantee_method: string | null;
  company_master_id: string | null;
  travel_agent_master_id: string | null;
  group_account_master_id: string | null;
  created_at: string;
  updated_at: string;
  guest_profiles: GuestRelation | GuestRelation[] | null;
  room_types: NameRelation | NameRelation[];
  hotel_rooms: RoomRelation | RoomRelation[] | null;
  rate_plan: NameRelation | NameRelation[];
  company: NameRelation | NameRelation[];
  travel_agent: NameRelation | NameRelation[];
  group_account: NameRelation | NameRelation[];
};

function oneRel<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toDetail(row: ReservationRow): ReservationDetail {
  const guest = oneRel(row.guest_profiles);
  const room = oneRel(row.hotel_rooms);
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    guestName: [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim() || "Guest",
    guestPhone: guest?.phone ?? null,
    guestEmail: guest?.email ?? null,
    guestVip: guest?.vip_status ?? false,
    roomTypeId: row.room_type_id,
    roomTypeName: oneRel(row.room_types)?.name ?? "Room type",
    roomTypeCode: oneRel(row.room_types)?.code ?? null,
    roomId: row.room_id,
    roomNumber: room?.room_number ?? null,
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
    ratePlanName: oneRel(row.rate_plan)?.name ?? null,
    currency: row.currency,
    roomSubtotal:
      row.room_subtotal === null || row.room_subtotal === undefined
        ? null
        : Number(row.room_subtotal),
    nightlyRates: parseSnapshot(row.nightly_rate_snapshot),
    pricedAt: row.priced_at,
    commercialBookingSource: row.commercial_booking_source,
    marketSegment: row.market_segment,
    externalReference: row.external_reference,
    guaranteeMethod: row.guarantee_method,
    companyMasterId: row.company_master_id,
    companyName: oneRel(row.company)?.name ?? null,
    travelAgentMasterId: row.travel_agent_master_id,
    travelAgentName: oneRel(row.travel_agent)?.name ?? null,
    groupAccountMasterId: row.group_account_master_id,
    groupName: oneRel(row.group_account)?.name ?? null,
    roomOperationalStatus: room?.status ?? null,
    housekeepingStatus: room?.housekeeping_status ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveReservationActorNames(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => PromiseLike<{ data: unknown }>;
        };
        in: (column: string, values: string[]) => PromiseLike<{ data: unknown }>;
      };
    };
  },
  restaurantId: string,
  membershipIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const actorNames = new Map<string, string>();
  const actorIds = [...new Set(membershipIds.filter((id): id is string => !!id))];
  if (actorIds.length === 0) return actorNames;

  const { data: members } = await supabase
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", actorIds);
  const memberRows = (members ?? []) as Array<{ id: string; user_id: string }>;
  const userIds = [...new Set(memberRows.map((member) => member.user_id))];
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
      : { data: [] };
  const profileByUser = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>
    ).map((profile) => [
      profile.id,
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
        profile.email ||
        "Staff member",
    ]),
  );
  for (const member of memberRows) {
    actorNames.set(member.id, profileByUser.get(member.user_id) ?? "Staff member");
  }
  return actorNames;
}

/* ------------------------------------------------------------------ access */

export const getBookingsAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context as never, data.restaurantId);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      role: me.role,
      canManage: canManageReservations(me.role),
      actorName: displayName(profile) ?? profile?.email ?? "Current user",
      membershipId: me.id,
    };
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
      const availability = await getRoomTypeAvailabilityCompat(context.supabase, {
        restaurantId: data.restaurantId,
        roomTypeId: type.id,
        arrival,
        departure,
        excludeReservationId: data.excludeReservationId ?? null,
      });
      const totalRooms = availability.physicalCapacity;
      const reservedRooms =
        availability.reserved ?? Math.max(0, totalRooms - availability.available);
      out.push({
        roomTypeId: type.id,
        code: type.code,
        name: type.name,
        maxOccupancy: type.max_occupancy,
        adultCapacity: type.adult_capacity,
        childCapacity: type.child_capacity,
        totalRooms,
        reserved: reservedRooms,
        available: availability.available,
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
      .select("id, room_number, floor, building, housekeeping_status, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId)
      .eq("active", true)
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

    const { data: clashes, error: clashError } = await clashQuery;
    if (clashError) throw new Error(clashError.message);
    const taken = new Set((clashes ?? []).map((r: { room_id: string | null }) => r.room_id));

    const candidates = (rooms ?? []).map((r) => ({
      id: r.id,
      roomNumber: r.room_number,
      floor: r.floor,
      building: r.building,
      housekeepingStatus:
        (r as { housekeeping_status?: string | null }).housekeeping_status ?? null,
      status: r.status,
    }));

    const output: AssignableRoom[] = [];
    let canonicalSupported = true;
    for (const room of candidates) {
      const legacyResult = (): AssignmentEligibilityResult => ({
        source: "legacy",
        eligible: room.status === "available" && !taken.has(room.id),
        blockers: [],
        warnings: [],
        preferenceScore: 0,
        preferenceReasons: [],
      });
      const eligibility = canonicalSupported
        ? await getAssignmentEligibilityCompat(
            context.supabase,
            {
              restaurantId: data.restaurantId,
              roomId: room.id,
              roomTypeId: data.roomTypeId,
              arrival,
              departure,
              excludeReservationId: data.excludeReservationId ?? null,
            },
            legacyResult,
          )
        : legacyResult();
      if (eligibility.source === "legacy") canonicalSupported = false;
      if (eligibility.eligible) {
        output.push({
          id: room.id,
          roomNumber: room.roomNumber,
          floor: room.floor,
          building: room.building,
          housekeepingStatus: room.housekeepingStatus,
        });
      }
    }
    return output;
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
        pageSize: z.number().int().min(1).max(500).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ rows: ReservationDetail[]; total: number; page: number; pageSize: number }> => {
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
          .or(
            `first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`,
          )
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
        .select("id, event_type, previous_values, new_values, notes, created_at, actor_membership_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", data.reservationId)
        .order("created_at", { ascending: false })
        .limit(100);

      const eventRows = (events ?? []) as Array<{
        id: string;
        event_type: string;
        previous_values: Record<string, JsonValue> | null;
        new_values: Record<string, JsonValue> | null;
        notes: string | null;
        created_at: string;
        actor_membership_id: string | null;
      }>;
      const actorNames = await resolveReservationActorNames(
        context.supabase,
        data.restaurantId,
        eventRows.map((event) => event.actor_membership_id),
      );

      const history: ReservationHistoryEntry[] = eventRows.map((event) => ({
        id: event.id,
        eventType: event.event_type as ReservationEventType,
        previousValues: event.previous_values ?? null,
        newValues: event.new_values ?? null,
        notes: event.notes,
        createdAt: event.created_at,
        actorName: event.actor_membership_id
          ? (actorNames.get(event.actor_membership_id) ?? null)
          : null,
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
  /** Pricing is re-derived server-side from this plan; browser totals are ignored. */
  ratePlanId: idSchema.nullable().optional(),
});

export const createReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    stayInputSchema
      .extend({
        status: z.enum(["pending", "confirmed"]).optional(),
        companyMasterId: idSchema.nullable().optional(),
        travelAgentMasterId: idSchema.nullable().optional(),
        groupAccountMasterId: idSchema.nullable().optional(),
        commercialBookingSource: z.string().max(120).nullable().optional(),
        marketSegment: z.string().max(120).nullable().optional(),
        externalReference: z.string().max(120).nullable().optional(),
        guaranteeMethod: z.string().max(80).nullable().optional(),
        requireGuarantee: z.boolean().optional(),
        reservationType: z.enum(["individual", "corporate", "travel_agency"]).optional(),
        pmsGroupId: idSchema.nullable().optional(),
        pmsGroupBlockId: idSchema.nullable().optional(),
        /** Channel origin on hotel_reservations.source — not commercial_booking_source. */
        source: z.enum(["walk_in"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; confirmationNumber: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const status = data.status ?? "pending";
    assertCreateReservationPricing({
      role: me.role,
      status,
      ratePlanId: data.ratePlanId ?? null,
    });
    const persistApplied = section7PersistApplied();
    assertCreateReservationSection7({
      status,
      requireGuarantee: data.requireGuarantee === true,
      guaranteeMethod: data.guaranteeMethod ?? null,
      commercialBookingSource: data.commercialBookingSource ?? null,
      marketSegment: data.marketSegment ?? null,
      persistApplied,
      reservationType: data.reservationType ?? null,
      companyMasterId: data.companyMasterId ?? null,
      travelAgentMasterId: data.travelAgentMasterId ?? null,
    });
    const { arrival, departure } = assertStayDates(data.arrival, data.departure);

    const { data: roomType, error: occupancyError } = await context.supabase
      .from("room_types")
      .select("max_occupancy")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.roomTypeId)
      .maybeSingle();
    if (occupancyError) throw new Error(occupancyError.message);
    if (!roomType) throw new Error("Room type not found for this property.");
    assertRoomTypeOccupancy(data.adults, data.children, roomType.max_occupancy);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let groupLink: { groupId: string; blockId: string | null } | null = null;
    if (data.pmsGroupBlockId || data.pmsGroupId) {
      const { assertGroupStayPickup } = await import("./groups.functions");
      groupLink = await assertGroupStayPickup(supabaseAdmin, {
        restaurantId: data.restaurantId,
        pmsGroupId: data.pmsGroupId ?? null,
        pmsGroupBlockId: data.pmsGroupBlockId ?? null,
        roomTypeId: data.roomTypeId,
        proposed: {
          arrivalDate: arrival,
          departureDate: departure,
          status,
        },
      });
    }
    if (data.travelAgentMasterId) {
      const { enforceTravelAgentBooking } = await import("./guest-travel-agent-booking");
      await enforceTravelAgentBooking({
        db: supabaseAdmin as never,
        restaurantId: data.restaurantId,
        agencyId: data.travelAgentMasterId,
        arrival,
        departure,
        roomTypeId: data.roomTypeId,
      });
    }
    const { data: created, error } = await supabaseAdmin.rpc("create_hotel_reservation_priced", {
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
      _status: status,
      _rate_plan_id: (data.ratePlanId ?? null) as unknown as string,
      _membership_id: me.id,
      ...(data.companyMasterId ? { _company_master_id: data.companyMasterId } : {}),
      ...(data.travelAgentMasterId ? { _travel_agent_master_id: data.travelAgentMasterId } : {}),
      ...(persistApplied
        ? {
            _commercial_booking_source: blankToNull(
              data.commercialBookingSource,
            ) as unknown as string,
            _market_segment: blankToNull(data.marketSegment) as unknown as string,
            _external_reference: blankToNull(data.externalReference) as unknown as string,
            _guarantee_method: blankToNull(data.guaranteeMethod) as unknown as string,
          }
        : {}),
    });
    if (error) throw rateError(reservationError(error.message).message);

    const row = created as unknown as { id: string; confirmation_number: string };
    if (groupLink) {
      const { attachReservationToGroup } = await import("./groups.functions");
      await attachReservationToGroup(supabaseAdmin, me.id, {
        restaurantId: data.restaurantId,
        reservationId: row.id,
        groupId: groupLink.groupId,
        blockId: groupLink.blockId,
      });
    }
    if (data.source === "walk_in") {
      const { error: sourceError } = await supabaseAdmin
        .from("hotel_reservations")
        .update({ source: "walk_in" })
        .eq("restaurant_id", data.restaurantId)
        .eq("id", row.id);
      if (sourceError) throw new Error(sourceError.message);
    }
    if (data.groupAccountMasterId) {
      const { error: groupError } = await supabaseAdmin
        .from("hotel_reservations")
        .update({ group_account_master_id: data.groupAccountMasterId })
        .eq("restaurant_id", data.restaurantId)
        .eq("id", row.id);
      if (groupError) throw new Error(groupError.message);
    }
    if (data.travelAgentMasterId) {
      const { syncTravelAgentCommission } = await import("./guest-travel-agent-booking");
      const { notifyTravelAgentBookingEvent } = await import("./guest-travel-agent-detail.functions");
      await syncTravelAgentCommission({
        db: supabaseAdmin as never,
        restaurantId: data.restaurantId,
        reservationId: row.id,
        actorMembershipId: me.id,
      });
      await notifyTravelAgentBookingEvent({
        restaurantId: data.restaurantId,
        agencyId: data.travelAgentMasterId,
        eventKey: "booking_confirmation",
        body: `Reservation ${row.confirmation_number} was created for this travel agency.`,
      });
    }
    return { id: row.id, confirmationNumber: row.confirmation_number };
  });

export const copyReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; confirmationNumber: string }> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { data: row, error } = await context.supabase
      .from("hotel_reservations")
      .select(
        "guest_id, room_type_id, arrival_date, departure_date, adults, children, special_requests, notes, rate_plan_id, commercial_booking_source, market_segment, external_reference, guarantee_method, company_master_id, travel_agent_master_id",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Reservation not found for this property.");

    return createReservation({
      data: {
        restaurantId: data.restaurantId,
        guestId: row.guest_id,
        roomTypeId: row.room_type_id,
        roomId: null,
        arrival: row.arrival_date,
        departure: row.departure_date,
        adults: row.adults,
        children: row.children,
        specialRequests: row.special_requests,
        notes: row.notes,
        ratePlanId: row.rate_plan_id,
        status: "pending",
        companyMasterId: row.company_master_id,
        travelAgentMasterId: row.travel_agent_master_id,
        commercialBookingSource: row.commercial_booking_source,
        marketSegment: row.market_segment,
        externalReference: row.external_reference,
        guaranteeMethod: row.guarantee_method,
        requireGuarantee: false,
      },
    });
  });

/* ------------------------------------------------------------------- amend */

export const amendReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    stayInputSchema
      .extend({
        reservationId: idSchema,
        commercialBookingSource: z.string().max(120).nullable().optional(),
        marketSegment: z.string().max(120).nullable().optional(),
        externalReference: z.string().max(120).nullable().optional(),
        guaranteeMethod: z.string().max(80).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { arrival, departure } = assertStayDates(data.arrival, data.departure);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: readError } = await supabaseAdmin
      .from("hotel_reservations")
      .select(
        "id, guest_id, room_type_id, commercial_booking_source, market_segment, external_reference, guarantee_method, travel_agent_master_id",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Reservation not found for this property.");

    const { data: roomType, error: occupancyError } = await supabaseAdmin
      .from("room_types")
      .select("max_occupancy")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.roomTypeId)
      .maybeSingle();
    if (occupancyError) throw new Error(occupancyError.message);
    if (!roomType) throw new Error("Room type not found for this property.");
    assertRoomTypeOccupancy(data.adults, data.children, roomType.max_occupancy);

    const travelAgentMasterId = (
      existing as { travel_agent_master_id?: string | null }
    ).travel_agent_master_id;
    if (travelAgentMasterId) {
      const { enforceTravelAgentBooking } = await import("./guest-travel-agent-booking");
      await enforceTravelAgentBooking({
        db: supabaseAdmin as never,
        restaurantId: data.restaurantId,
        agencyId: travelAgentMasterId,
        arrival,
        departure,
        roomTypeId: data.roomTypeId,
        excludeReservationId: data.reservationId,
      });
    }
    const { data: updated, error } = await supabaseAdmin.rpc("amend_hotel_reservation_priced", {
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
      _rate_plan_id: (data.ratePlanId ?? null) as unknown as string,
      _membership_id: me.id,
    });
    if (error) throw rateError(reservationError(error.message).message);

    const nextGuestId = data.guestId !== existing.guest_id ? data.guestId : null;
    const nextSource =
      data.commercialBookingSource !== undefined
        ? blankToNull(data.commercialBookingSource)
        : undefined;
    const nextSegment =
      data.marketSegment !== undefined ? blankToNull(data.marketSegment) : undefined;
    const nextReference =
      data.externalReference !== undefined ? blankToNull(data.externalReference) : undefined;
    const nextGuarantee =
      data.guaranteeMethod !== undefined ? blankToNull(data.guaranteeMethod) : undefined;

    const commercialPatch: Record<string, string | null> = {};
    if (nextGuestId) commercialPatch.guest_id = nextGuestId;
    if (nextSource !== undefined && nextSource !== existing.commercial_booking_source) {
      commercialPatch.commercial_booking_source = nextSource;
    }
    if (nextSegment !== undefined && nextSegment !== existing.market_segment) {
      commercialPatch.market_segment = nextSegment;
    }
    if (nextReference !== undefined && nextReference !== existing.external_reference) {
      commercialPatch.external_reference = nextReference;
    }
    if (nextGuarantee !== undefined && nextGuarantee !== existing.guarantee_method) {
      commercialPatch.guarantee_method = nextGuarantee;
    }

    if (Object.keys(commercialPatch).length > 0) {
      const { error: patchError } = await supabaseAdmin
        .from("hotel_reservations")
        .update(commercialPatch)
        .eq("id", data.reservationId)
        .eq("restaurant_id", data.restaurantId);
      if (patchError) throw new Error(patchError.message);
      await recordReservationEvent({
        restaurantId: data.restaurantId,
        reservationId: data.reservationId,
        eventType: "amended",
        previousValues: {
          guest_id: existing.guest_id,
          commercial_booking_source: existing.commercial_booking_source,
          market_segment: existing.market_segment,
          external_reference: existing.external_reference,
          guarantee_method: existing.guarantee_method,
        },
        newValues: {
          guest_id: commercialPatch.guest_id ?? existing.guest_id,
          commercial_booking_source:
            commercialPatch.commercial_booking_source ?? existing.commercial_booking_source,
          market_segment: commercialPatch.market_segment ?? existing.market_segment,
          external_reference: commercialPatch.external_reference ?? existing.external_reference,
          guarantee_method: commercialPatch.guarantee_method ?? existing.guarantee_method,
        },
        actorMembershipId: me.id,
      });
    }

    return { id: (updated as unknown as { id: string }).id };
    const amendedId = (updated as unknown as { id: string }).id;
    if (travelAgentMasterId) {
      const { syncTravelAgentCommission } = await import("./guest-travel-agent-booking");
      const { notifyTravelAgentBookingEvent } = await import("./guest-travel-agent-detail.functions");
      await syncTravelAgentCommission({
        db: supabaseAdmin as never,
        restaurantId: data.restaurantId,
        reservationId: amendedId,
        actorMembershipId: me.id,
      });
      await notifyTravelAgentBookingEvent({
        restaurantId: data.restaurantId,
        agencyId: travelAgentMasterId,
        eventKey: "booking_modification",
        body: `Reservation ${amendedId} was modified for this travel agency.`,
      });
    }
    return { id: amendedId };
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
      .select(
        "id, room_type_id, arrival_date, departure_date, adults, children, special_requests, notes, status",
      )
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

/**
 * Reservation-owned pending/confirmed/cancelled only.
 * Front Office operational cancel (fees + room clear) must use `completeFoCancel`.
 * Do not call this from Front Office UI with status cancelled.
 */
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
    if (existing.status === data.status)
      return { id: existing.id, status: data.status as ReservationStatus };

    assertBookingStatusTransition(existing.status, data.status);

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
      data.status === "cancelled"
        ? "cancelled"
        : data.status === "confirmed"
          ? "confirmed"
          : "status_changed";

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType,
      previousValues: { status: existing.status },
      newValues: { status: data.status },
      notes: data.status === "cancelled" ? blankToNull(data.reason) : null,
      actorMembershipId: me.id,
    });

    const bound = await supabaseAdmin
      .from("hotel_reservations")
      .select("travel_agent_master_id, confirmation_number")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    const agencyId = (bound.data as { travel_agent_master_id?: string | null } | null)?.travel_agent_master_id;
    if (agencyId) {
      const { syncTravelAgentCommission } = await import("./guest-travel-agent-booking");
      const { notifyTravelAgentBookingEvent } = await import("./guest-travel-agent-detail.functions");
      await syncTravelAgentCommission({
        db: supabaseAdmin as never,
        restaurantId: data.restaurantId,
        reservationId: data.reservationId,
        actorMembershipId: me.id,
        voidEntry: data.status === "cancelled" || data.status === "no_show",
      });
      if (data.status === "cancelled") {
        await notifyTravelAgentBookingEvent({
          restaurantId: data.restaurantId,
          agencyId,
          eventKey: "booking_cancellation",
          body: `Reservation ${(bound.data as { confirmation_number?: string } | null)?.confirmation_number ?? data.reservationId} was cancelled.`,
        });
      }
    }

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
      base()
        .in("status", ["pending", "confirmed", "checked_in"])
        .lte("arrival_date", today)
        .gt("departure_date", today),
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

/* -------------------------------------------------------------- amendments */

export interface ReservationAmendmentRow {
  id: string;
  reservationId: string;
  confirmationNumber: string;
  guestName: string;
  eventType: ReservationEventType;
  notes: string | null;
  createdAt: string;
  actorName: string | null;
  previousValues: Record<string, JsonValue> | null;
  newValues: Record<string, JsonValue> | null;
}

/**
 * Phase 7D.2F1 — read-only feed of the reservation change history that is
 * already recorded by the reservation write paths. No new records are created.
 */
export const listReservationAmendments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, limit: z.number().int().min(1).max(200).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationAmendmentRow[]> => {
    await requireReservationManager(context as never, data.restaurantId);

    const { data: events, error } = await context.supabase
      .from("hotel_reservation_history")
      .select(
        "id, reservation_id, event_type, notes, created_at, actor_membership_id, previous_values, new_values",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);

    const rows = (events ?? []) as {
      id: string;
      reservation_id: string;
      event_type: string;
      notes: string | null;
      created_at: string;
      actor_membership_id: string | null;
      previous_values: Record<string, JsonValue> | null;
      new_values: Record<string, JsonValue> | null;
    }[];
    const ids = [...new Set(rows.map((r) => r.reservation_id))];
    const meta = new Map<string, { confirmationNumber: string; guestName: string }>();
    const actorNames = await resolveReservationActorNames(
      context.supabase,
      data.restaurantId,
      rows.map((r) => r.actor_membership_id),
    );

    if (ids.length > 0) {
      const { data: reservations } = await context.supabase
        .from("hotel_reservations")
        .select(
          "id, confirmation_number, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )",
        )
        .eq("restaurant_id", data.restaurantId)
        .in("id", ids);

      for (const r of (reservations ?? []) as unknown as {
        id: string;
        confirmation_number: string;
        guest_profiles: { first_name: string | null; last_name: string | null } | null;
      }[]) {
        meta.set(r.id, {
          confirmationNumber: r.confirmation_number,
          guestName:
            [r.guest_profiles?.first_name, r.guest_profiles?.last_name]
              .filter(Boolean)
              .join(" ")
              .trim() || "Guest",
        });
      }
    }

    return rows.map((r) => ({
      id: r.id,
      reservationId: r.reservation_id,
      confirmationNumber: meta.get(r.reservation_id)?.confirmationNumber ?? "—",
      guestName: meta.get(r.reservation_id)?.guestName ?? "Guest",
      eventType: r.event_type as ReservationEventType,
      notes: r.notes,
      createdAt: r.created_at,
      actorName: r.actor_membership_id ? (actorNames.get(r.actor_membership_id) ?? null) : null,
      previousValues: r.previous_values ?? null,
      newValues: r.new_values ?? null,
    }));
  });
