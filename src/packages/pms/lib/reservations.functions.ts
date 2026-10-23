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
import { assertReservationCreateSourceChannel } from "./reservation-source-channel.server";
import { assertRoomTypeOccupancy } from "./create-reservation-phase1-section4";
import { buildStayAmendmentResult, type StayAmendmentResult } from "./reservation-stay-amendment";
import { propertyToday } from "@/shared/lib/property-dates";
import { assertReservationDetailEditable } from "@/packages/pms/lib/reservation-lifecycle.server";

async function assertExplicitOverbookingAllowed(
  db: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          maybeSingle: () => Promise<{
            data: {
              manager_approval_required?: boolean | null;
              overbooking_reason_required?: boolean | null;
            } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  },
  restaurantId: string,
  role: string,
  reason: string | null | undefined,
) {
  const loaded = await db
    .from("pms_inventory_rules")
    .select("manager_approval_required, overbooking_reason_required")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (loaded.error) throw new Error(loaded.error.message);
  const approvalRequired = loaded.data ? Boolean(loaded.data.manager_approval_required) : true;
  const reasonRequired = loaded.data ? Boolean(loaded.data.overbooking_reason_required) : true;
  if (approvalRequired && role !== "owner" && role !== "manager") {
    throw reservationError("OVERBOOKING_APPROVAL_REQUIRED");
  }
  if (reasonRequired && !reason?.trim()) {
    throw reservationError("OVERBOOKING_REASON_REQUIRED");
  }
}
import { stayFitsAllotment } from "./groups";
import {
  assertCreateReservationSection7,
  section7PersistApplied,
} from "./create-reservation-phase1-section7";
import {
  buildEarlyDeparturePolicySnapshot,
  type EarlyDeparturePolicyMaster,
} from "./early-departure-policy";
import {
  asDepositPolicyType,
  assertLinkedStayPolicyResolved,
  assertReservationTenderCode,
  buildNoShowPolicySnapshot,
  ratePlanStayPolicyWrite,
  type NoShowPolicyMaster,
} from "./create-reservation-step4";
import { DEPOSIT_POLICY_TYPE_LABELS, type DepositPolicyCard3Row } from "./payments-card3.server";
import { loadPolish1Snapshot } from "./pms-polish1-payment-admin.functions";
import { folioTenderFromCatalogue } from "./pms-polish1-payment-admin";
import { callPostFolioTransaction, requireCashierOperator } from "./cashiering.server";
import { isRoomReady, mapCashierShiftError } from "./fo-check-in";
import {
  createMoneyNeedsFolio,
  createReceiptShapeError,
  emptyCreateMoneyResult,
  normalizeCreateReceipt,
  type CreateMoneyPostResult,
  type CreateReceiptRequest,
} from "./reservation-create-money";
import { isMissingSchemaError } from "./pms-set2-structure";
import { resolveReservationMode, type ReservationMode } from "./reservation-mode";
import {
  attachRoomOccupants,
  createReservationRoomUnitPayload,
  projectReservationRoomUnits,
  type ReservationRoomUnit,
  type ReservationRoomUnitRow,
} from "./reservation-room-units";
import type { Json } from "@/integrations/supabase/types";
import {
  getAssignmentEligibilityCompat,
  getRoomTypeAvailabilityCompat,
  type AssignmentEligibilityResult,
} from "./room-inventory-compat";
import { signRoomImages } from "./rooms.server";
import { loadCard2HousekeepingSnapshot } from "./housekeeping-card2.functions";
import { assignmentIneligibilityReason } from "./fo-checkin-v2-model";

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
  infants: number | null;
  roomsRequested: number | null;
  purposeOfStay: string | null;
  salesChannel: string | null;
  depositRequirementSnapshot: unknown;
  noShowPolicyId: string | null;
  noShowPolicySnapshot: unknown;
  earlyDeparturePolicyId: string | null;
  earlyDeparturePolicySnapshot: unknown;
  cancellationPolicySnapshot: unknown;
  refundabilitySnapshot: unknown;
  createdByStaffMembershipId: string | null;
  createdByName: string | null;
  bookerGuestId: string | null;
  lateCheckoutGranted: boolean | null;
  expectedArrivalAt: string | null;
  lateCheckoutUntil: string | null;
  arrivalTransport?: string | null;
  pickupNote?: string | null;
  specialOccasion?: string | null;
  rateNotes?: string | null;
  notesPinned?: boolean;
  /** Room units from `hotel_reservation_rooms`. These own the operational room. */
  rooms?: ReservationRoomUnit[];
  /** Booking mode. Absent reads stay `single` until the column exists. */
  reservationMode: ReservationMode;
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
  coverUrl: string | null;
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

const RESERVATION_DETAIL_SELECT = RESERVATION_SELECT.replace(
  "created_at, updated_at,",
  `created_at, updated_at,
  infants, rooms_requested, purpose_of_stay, commercial_sales_channel,
  deposit_requirement_snapshot, cancellation_policy_snapshot, refundability_snapshot,
  created_by_staff_membership_id, booker_guest_id, late_checkout_granted,
  expected_arrival_at, late_checkout_until,
  arrival_transport, pickup_note, special_occasion,`,
);

const RESERVATION_DETAIL_POLICY_SELECT = RESERVATION_DETAIL_SELECT.replace(
  "deposit_requirement_snapshot, cancellation_policy_snapshot, refundability_snapshot,",
  `deposit_requirement_snapshot, cancellation_policy_snapshot, refundability_snapshot,
  no_show_policy_id, no_show_policy_snapshot,`,
);

const RESERVATION_DETAIL_EARLY_SELECT = RESERVATION_DETAIL_POLICY_SELECT.replace(
  "no_show_policy_id, no_show_policy_snapshot,",
  `no_show_policy_id, no_show_policy_snapshot,
  early_departure_policy_id, early_departure_policy_snapshot,`,
);

const RESERVATION_DETAIL_STAY_SELECT = RESERVATION_DETAIL_EARLY_SELECT.replace(
  "early_departure_policy_id, early_departure_policy_snapshot,",
  `early_departure_policy_id, early_departure_policy_snapshot,
  rate_notes, notes_pinned,`,
);

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
  infants?: number | null;
  rooms_requested?: number | null;
  purpose_of_stay?: string | null;
  commercial_sales_channel?: string | null;
  deposit_requirement_snapshot?: unknown;
  no_show_policy_id?: string | null;
  no_show_policy_snapshot?: unknown;
  early_departure_policy_id?: string | null;
  early_departure_policy_snapshot?: unknown;
  cancellation_policy_snapshot?: unknown;
  refundability_snapshot?: unknown;
  created_by_staff_membership_id?: string | null;
  booker_guest_id?: string | null;
  late_checkout_granted?: boolean | null;
  expected_arrival_at?: string | null;
  late_checkout_until?: string | null;
  arrival_transport?: string | null;
  pickup_note?: string | null;
  special_occasion?: string | null;
  rate_notes?: string | null;
  notes_pinned?: boolean | null;
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
    infants: row.infants == null ? null : Number(row.infants),
    roomsRequested: row.rooms_requested == null ? null : Number(row.rooms_requested),
    purposeOfStay: row.purpose_of_stay ?? null,
    salesChannel: row.commercial_sales_channel ?? null,
    depositRequirementSnapshot: row.deposit_requirement_snapshot ?? null,
    noShowPolicyId: row.no_show_policy_id ?? null,
    noShowPolicySnapshot: row.no_show_policy_snapshot ?? null,
    earlyDeparturePolicyId: row.early_departure_policy_id ?? null,
    earlyDeparturePolicySnapshot: row.early_departure_policy_snapshot ?? null,
    cancellationPolicySnapshot: row.cancellation_policy_snapshot ?? null,
    refundabilitySnapshot: row.refundability_snapshot ?? null,
    createdByStaffMembershipId: row.created_by_staff_membership_id ?? null,
    createdByName: null,
    bookerGuestId: row.booker_guest_id ?? null,
    lateCheckoutGranted: row.late_checkout_granted ?? null,
    expectedArrivalAt: row.expected_arrival_at ?? null,
    lateCheckoutUntil: row.late_checkout_until ?? null,
    arrivalTransport: row.arrival_transport ?? null,
    pickupNote: row.pickup_note ?? null,
    specialOccasion: row.special_occasion ?? null,
    rateNotes: row.rate_notes ?? null,
    notesPinned: row.notes_pinned === true,
    reservationMode: "single",
  };
}

async function resolveReservationActorNames(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
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
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
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
  .validator((input: unknown) =>
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

    const { data: images } = await context.supabase
      .from("room_type_images")
      .select("room_type_id, storage_path, is_cover, display_order")
      .eq("restaurant_id", data.restaurantId)
      .order("display_order");
    const coverPath = new Map<string, string>();
    for (const img of images ?? []) {
      if (!coverPath.has(img.room_type_id) || img.is_cover) {
        if (img.is_cover || !coverPath.has(img.room_type_id)) {
          coverPath.set(img.room_type_id, img.storage_path);
        }
      }
    }
    const signed = await signRoomImages([...coverPath.values()]);

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
        coverUrl: signed.get(coverPath.get(type.id) ?? "") ?? null,
      });
    }
    return out;
  });

export const listAssignableRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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

export type CheckInRoomCandidate = {
  id: string;
  roomNumber: string;
  floor: string | null;
  building: string | null;
  physicalStatus: string | null;
  housekeepingStatus: string | null;
  maintenanceStatus: string | null;
  eligible: boolean;
  ineligibilityReason: string | null;
  readyForCheckIn: boolean;
  readyReason: string | null;
};

/**
 * Check-In room picker. Includes ineligible rooms and policy-aware readiness.
 * Assignment still goes through assignReservationRoom. This list does not assign.
 */
export const listCheckInRoomCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
        arrival: dateSchema,
        departure: dateSchema,
        excludeReservationId: idSchema.optional(),
        adults: z.number().int().min(0).max(20).optional(),
        children: z.number().int().min(0).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckInRoomCandidate[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { arrival, departure } = assertStayDates(data.arrival, data.departure);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rooms, error } = await supabaseAdmin
      .from("hotel_rooms")
      .select("id, room_number, floor, building, housekeeping_status, maintenance_status, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId)
      .eq("active", true)
      .order("room_number");
    if (error) throw new Error(error.message);

    const housekeeping = await loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId);
    const output: CheckInRoomCandidate[] = [];
    for (const room of rooms ?? []) {
      const eligibility = await getAssignmentEligibilityCompat(
        supabaseAdmin,
        {
          restaurantId: data.restaurantId,
          roomId: room.id,
          roomTypeId: data.roomTypeId,
          arrival,
          departure,
          excludeReservationId: data.excludeReservationId ?? null,
          adults: data.adults,
          children: data.children,
        },
        () => ({
          source: "legacy" as const,
          eligible: room.status === "available",
          blockers: room.status === "available" ? [] : [{ code: "ROOM_OPERATIONALLY_UNAVAILABLE" }],
          warnings: [],
          preferenceScore: 0,
          preferenceReasons: [],
        }),
      );
      const ready = isRoomReady(
        {
          status: room.status,
          housekeepingStatus: room.housekeeping_status,
          maintenanceStatus: room.maintenance_status,
        },
        housekeeping.settings,
      );
      output.push({
        id: room.id,
        roomNumber: room.room_number,
        floor: room.floor,
        building: room.building,
        physicalStatus: room.status,
        housekeepingStatus: room.housekeeping_status,
        maintenanceStatus: room.maintenance_status,
        eligible: eligibility.eligible,
        ineligibilityReason: assignmentIneligibilityReason(
          eligibility.eligible,
          eligibility.blockers,
        ),
        readyForCheckIn: ready.ready,
        readyReason: ready.reason,
      });
    }
    return output;
  });

/* -------------------------------------------------------------------- list */

export const listReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ reservation: ReservationDetail; history: ReservationHistoryEntry[] }> => {
      await requireReservationManager(context as never, data.restaurantId);

      const stayQuery = await context.supabase
        .from("hotel_reservations")
        .select(RESERVATION_DETAIL_STAY_SELECT)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.reservationId)
        .maybeSingle();
      const earlyQuery =
        stayQuery.error && isMissingSchemaError(stayQuery.error)
          ? await context.supabase
              .from("hotel_reservations")
              .select(RESERVATION_DETAIL_EARLY_SELECT)
              .eq("restaurant_id", data.restaurantId)
              .eq("id", data.reservationId)
              .maybeSingle()
          : stayQuery;
      const policyQuery =
        earlyQuery.error && isMissingSchemaError(earlyQuery.error)
          ? await context.supabase
              .from("hotel_reservations")
              .select(RESERVATION_DETAIL_POLICY_SELECT)
              .eq("restaurant_id", data.restaurantId)
              .eq("id", data.reservationId)
              .maybeSingle()
          : earlyQuery;
      const detailQuery =
        policyQuery.error && isMissingSchemaError(policyQuery.error)
          ? await context.supabase
              .from("hotel_reservations")
              .select(RESERVATION_DETAIL_SELECT)
              .eq("restaurant_id", data.restaurantId)
              .eq("id", data.reservationId)
              .maybeSingle()
          : policyQuery;
      const fallbackQuery =
        detailQuery.error && isMissingSchemaError(detailQuery.error)
          ? await context.supabase
              .from("hotel_reservations")
              .select(RESERVATION_SELECT)
              .eq("restaurant_id", data.restaurantId)
              .eq("id", data.reservationId)
              .maybeSingle()
          : null;
      const { data: row, error } = fallbackQuery ?? detailQuery;
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Reservation not found for this property.");

      const { data: events } = await context.supabase
        .from("hotel_reservation_history")
        .select(
          "id, event_type, previous_values, new_values, notes, created_at, actor_membership_id",
        )
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
      const reservation = toDetail(row as unknown as ReservationRow);
      const unitColumns =
        "id, unit_sequence, room_type_id, room_id, arrival_date, departure_date, adults, children, infants, rate_plan_id, currency, nightly_rate_snapshot, room_subtotal, priced_at";
      let unitsQuery = await context.supabase
        .from("hotel_reservation_rooms")
        .select(`${unitColumns}, status, assignment_notes`)
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", data.reservationId)
        .order("unit_sequence", { ascending: true });
      if (unitsQuery.error && isMissingSchemaError(unitsQuery.error)) {
        unitsQuery = await context.supabase
          .from("hotel_reservation_rooms")
          .select(`${unitColumns}, status`)
          .eq("restaurant_id", data.restaurantId)
          .eq("reservation_id", data.reservationId)
          .order("unit_sequence", { ascending: true });
      }
      if (
        unitsQuery.error &&
        isMissingSchemaError(unitsQuery.error) &&
        /status/i.test(unitsQuery.error.message ?? "")
      ) {
        unitsQuery = await context.supabase
          .from("hotel_reservation_rooms")
          .select(unitColumns)
          .eq("restaurant_id", data.restaurantId)
          .eq("reservation_id", data.reservationId)
          .order("unit_sequence", { ascending: true });
      }
      if (unitsQuery.error && !isMissingSchemaError(unitsQuery.error)) {
        throw new Error(unitsQuery.error.message);
      }
      const unitRows = (
        unitsQuery.error && isMissingSchemaError(unitsQuery.error) ? [] : (unitsQuery.data ?? [])
      ) as Array<ReservationRoomUnitRow & { assignment_notes?: string | null }>;
      reservation.rooms =
        unitRows.length === 0 && unitsQuery.error && isMissingSchemaError(unitsQuery.error)
          ? []
          : projectReservationRoomUnits(reservation, unitRows).map((unit) => {
              const stored = unitRows.find((row) => row.id === unit.id);
              return { ...unit, assignmentNotes: stored?.assignment_notes ?? null };
            });
      const occupantQuery = await context.supabase
        .from("hotel_reservation_room_guests")
        .select("reservation_room_id, guest_id, is_primary")
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", data.reservationId);
      if (occupantQuery.error && !isMissingSchemaError(occupantQuery.error)) {
        throw new Error(occupantQuery.error.message);
      }
      const occupantRows =
        occupantQuery.error || !occupantQuery.data
          ? []
          : (occupantQuery.data as Array<{
              reservation_room_id: string;
              guest_id: string;
              is_primary: boolean;
            }>);
      const guestIds = [...new Set(occupantRows.map((occupant) => occupant.guest_id))];
      const profileSelect = "id, first_name, last_name, phone, gender, id_document_number, notes";
      const richProfiles =
        guestIds.length === 0
          ? { data: [], error: null }
          : await context.supabase
              .from("guest_profiles")
              .select(profileSelect)
              .eq("restaurant_id", data.restaurantId)
              .in("id", guestIds);
      const profileQuery =
        richProfiles.error && isMissingSchemaError(richProfiles.error)
          ? await context.supabase
              .from("guest_profiles")
              .select("id, first_name, last_name")
              .eq("restaurant_id", data.restaurantId)
              .in("id", guestIds)
          : richProfiles;
      if (guestIds.length > 0 && profileQuery.error) throw new Error(profileQuery.error.message);
      const profiles = new Map(
        ((profileQuery.data ?? []) as Array<Record<string, string | null>>).map((profile) => [
          profile.id,
          profile,
        ]),
      );
      reservation.rooms = attachRoomOccupants(
        reservation.rooms,
        occupantRows.map((occupant) => {
          const profile = profiles.get(occupant.guest_id);
          return {
            reservationRoomId: occupant.reservation_room_id,
            guestId: occupant.guest_id,
            name:
              [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "Guest",
            isPrimary: occupant.is_primary,
            phone: profile?.phone ?? null,
            gender: profile?.gender ?? null,
            idDocumentNumber: profile?.id_document_number ?? null,
            notes: profile?.notes ?? null,
          };
        }),
      );
      const typeIds = [...new Set(reservation.rooms.map((unit) => unit.roomTypeId))];
      const physicalIds = [
        ...new Set(
          reservation.rooms.map((unit) => unit.roomId).filter((id): id is string => Boolean(id)),
        ),
      ];
      const planIds = [
        ...new Set(
          reservation.rooms
            .map((unit) => unit.ratePlanId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const [typeNames, physicalNumbers, planNames] = await Promise.all([
        typeIds.length === 0
          ? Promise.resolve(new Map<string, string>())
          : context.supabase
              .from("room_types")
              .select("id, name")
              .eq("restaurant_id", data.restaurantId)
              .in("id", typeIds)
              .then(({ data: rows, error: typeError }) => {
                if (typeError) throw new Error(typeError.message);
                return new Map((rows ?? []).map((row) => [row.id, row.name]));
              }),
        physicalIds.length === 0
          ? Promise.resolve(new Map<string, string>())
          : context.supabase
              .from("hotel_rooms")
              .select("id, room_number")
              .eq("restaurant_id", data.restaurantId)
              .in("id", physicalIds)
              .then(({ data: rows, error: roomError }) => {
                if (roomError) throw new Error(roomError.message);
                return new Map((rows ?? []).map((row) => [row.id, row.room_number]));
              }),
        planIds.length === 0
          ? Promise.resolve(new Map<string, string>())
          : context.supabase
              .from("hotel_rate_plans")
              .select("id, name")
              .eq("restaurant_id", data.restaurantId)
              .in("id", planIds)
              .then(({ data: rows, error: planError }) => {
                if (planError) throw new Error(planError.message);
                return new Map((rows ?? []).map((row) => [row.id, row.name]));
              }),
      ]);
      reservation.rooms = reservation.rooms.map((unit) => ({
        ...unit,
        roomTypeName: typeNames.get(unit.roomTypeId) ?? null,
        roomNumber: unit.roomId ? (physicalNumbers.get(unit.roomId) ?? null) : null,
        ratePlanName: unit.ratePlanId ? (planNames.get(unit.ratePlanId) ?? null) : null,
      }));
      const modeQuery = await context.supabase
        .from("hotel_reservations")
        .select("reservation_mode")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.reservationId)
        .maybeSingle();
      if (modeQuery.error && !isMissingSchemaError(modeQuery.error)) {
        throw new Error(modeQuery.error.message);
      }
      reservation.reservationMode =
        !modeQuery.error && modeQuery.data?.reservation_mode === "group" ? "group" : "single";
      const actorNames = await resolveReservationActorNames(context.supabase, data.restaurantId, [
        ...eventRows.map((event) => event.actor_membership_id),
        reservation.createdByStaffMembershipId,
      ]);

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

      return {
        reservation: {
          ...reservation,
          createdByName: reservation.createdByStaffMembershipId
            ? (actorNames.get(reservation.createdByStaffMembershipId) ?? null)
            : null,
        },
        history,
      };
    },
  );

/* ------------------------------------------------------------------ create */

function toDepositPolicyCard3(row: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  required: boolean | null;
  deposit_type: string;
  deposit_value: number | string;
  is_default: boolean | null;
  active: boolean | null;
}): DepositPolicyCard3Row {
  const depositType = asDepositPolicyType(row.deposit_type);
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    required: row.required === true,
    depositType,
    depositTypeLabel: DEPOSIT_POLICY_TYPE_LABELS[depositType],
    depositValue: Number(row.deposit_value ?? 0),
    isDefault: row.is_default === true,
    active: row.active !== false,
  };
}

type RatePlanStayPolicies = {
  schemaReady: boolean;
  deposit: DepositPolicyCard3Row | null;
  noShow: NoShowPolicyMaster | null;
  earlyDeparture: EarlyDeparturePolicyMaster | null;
};

async function loadRatePlanStayPolicies(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  ratePlanId: string | null,
): Promise<RatePlanStayPolicies> {
  if (!ratePlanId) {
    return { schemaReady: true, deposit: null, noShow: null, earlyDeparture: null };
  }
  const plan = await supabaseAdmin
    .from("hotel_rate_plans")
    .select("deposit_policy_id, no_show_policy_id")
    .eq("id", ratePlanId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (plan.error) {
    if (isMissingSchemaError(plan.error)) {
      return { schemaReady: false, deposit: null, noShow: null, earlyDeparture: null };
    }
    throw new Error(plan.error.message);
  }
  if (!plan.data) throw new Error("That rate plan doesn't belong to this property.");

  const depositId = plan.data.deposit_policy_id ?? null;
  const noShowId = plan.data.no_show_policy_id ?? null;
  let deposit: DepositPolicyCard3Row | null = null;
  if (depositId) {
    const row = await supabaseAdmin
      .from("pms_deposit_policies")
      .select(
        "id, code, name, description, required, deposit_type, deposit_value, is_default, active",
      )
      .eq("id", depositId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (row.error) throw new Error(row.error.message);
    assertLinkedStayPolicyResolved("deposit", depositId, Boolean(row.data));
    deposit = toDepositPolicyCard3(row.data as Parameters<typeof toDepositPolicyCard3>[0]);
  }

  let noShow: NoShowPolicyMaster | null = null;
  if (noShowId) {
    const row = await supabaseAdmin
      .from("pms_no_show_policies")
      .select("id, code, name, description, penalty_type, penalty_value, release_hour, active")
      .eq("id", noShowId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (row.error) throw new Error(row.error.message);
    assertLinkedStayPolicyResolved("no-show", noShowId, Boolean(row.data));
    const master = row.data as {
      id: string;
      code: string | null;
      name: string | null;
      description: string | null;
      penalty_type: string | null;
      penalty_value: number | string | null;
      release_hour: number | null;
      active: boolean | null;
    };
    noShow = {
      id: master.id,
      code: String(master.code ?? ""),
      name: String(master.name ?? ""),
      description: master.description,
      penaltyType: String(master.penalty_type ?? ""),
      penaltyValue: Number(master.penalty_value ?? 0),
      releaseHour: Number(master.release_hour ?? 0),
      active: master.active !== false,
    };
    buildNoShowPolicySnapshot(noShow);
  }

  let earlyDeparture: EarlyDeparturePolicyMaster | null = null;
  const earlyPlan = await supabaseAdmin
    .from("hotel_rate_plans")
    .select("early_departure_policy_id")
    .eq("id", ratePlanId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (earlyPlan.error) {
    if (!isMissingSchemaError(earlyPlan.error)) throw new Error(earlyPlan.error.message);
  } else {
    const earlyId = earlyPlan.data?.early_departure_policy_id ?? null;
    if (earlyId) {
      const row = await supabaseAdmin
        .from("pms_early_departure_policies")
        .select("id, code, name, description, penalty_type, penalty_value")
        .eq("id", earlyId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (row.error) throw new Error(row.error.message);
      assertLinkedStayPolicyResolved("early-departure", earlyId, Boolean(row.data));
      const master = row.data as {
        id: string;
        code: string | null;
        name: string | null;
        description: string | null;
        penalty_type: string | null;
        penalty_value: number | string | null;
      };
      earlyDeparture = {
        id: master.id,
        code: String(master.code ?? ""),
        name: String(master.name ?? ""),
        description: master.description,
        penaltyType: String(master.penalty_type ?? ""),
        penaltyValue: Number(master.penalty_value ?? 0),
      };
      buildEarlyDeparturePolicySnapshot(earlyDeparture);
    }
  }

  return { schemaReady: true, deposit, noShow, earlyDeparture };
}

async function persistDepositRequirementSnapshot(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  input: {
    restaurantId: string;
    reservationId: string;
    stayPolicies: RatePlanStayPolicies;
    depositTenderCode: string | null;
    guaranteeMethod: string | null;
    roomSubtotal: number | null;
    currency: string | null;
    nightly: Array<{ date: string; rate: number }>;
  },
): Promise<void> {
  const polish = await loadPolish1Snapshot(supabaseAdmin, input.restaurantId);
  const activeTenderCodes = polish.paymentMethodsAvailable
    ? polish.paymentMethods.filter((row) => row.active).map((row) => row.code)
    : null;
  if (input.guaranteeMethod) assertReservationTenderCode(input.guaranteeMethod, activeTenderCodes);
  if (input.depositTenderCode)
    assertReservationTenderCode(input.depositTenderCode, activeTenderCodes);

  const write = ratePlanStayPolicyWrite({
    deposit: input.stayPolicies.deposit,
    noShow: input.stayPolicies.noShow,
    earlyDeparture: input.stayPolicies.earlyDeparture,
    quote: {
      subtotal: input.roomSubtotal,
      nightly: input.nightly,
      currency: input.currency,
    },
    currency: input.currency ?? "",
    intendedTenderCode: input.depositTenderCode,
  });
  if (!input.stayPolicies.schemaReady) {
    if (write.early_departure_policy_id) {
      throw new Error(
        "The rate plan early departure policy could not be stored on this reservation.",
      );
    }
    return;
  }
  const stayColumns = {
    deposit_policy_id: write.deposit_policy_id,
    deposit_requirement_snapshot: write.deposit_requirement_snapshot as unknown as Json,
    no_show_policy_id: write.no_show_policy_id,
    no_show_policy_snapshot: write.no_show_policy_snapshot as unknown as Json,
  };
  const { error } = await supabaseAdmin
    .from("hotel_reservations")
    .update({
      ...stayColumns,
      early_departure_policy_id: write.early_departure_policy_id,
      early_departure_policy_snapshot: write.early_departure_policy_snapshot as unknown as Json,
    })
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.reservationId);
  if (!error) return;
  if (!isMissingSchemaError(error)) throw new Error(error.message);
  if (write.early_departure_policy_id) {
    throw new Error(
      "The rate plan early departure policy could not be stored on this reservation.",
    );
  }
  const retry = await supabaseAdmin
    .from("hotel_reservations")
    .update(stayColumns)
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.reservationId);
  if (!retry.error) return;
  if (isMissingSchemaError(retry.error) && !write.deposit_policy_id && !write.no_show_policy_id) {
    return;
  }
  throw new Error(retry.error.message);
}

const stayInputSchema = z.object({
  restaurantId: idSchema,
  guestId: idSchema,
  roomTypeId: idSchema,
  roomId: idSchema.nullable().optional(),
  arrival: dateSchema,
  departure: dateSchema,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  infants: z.number().int().min(0).max(20).optional(),
  rooms: z.number().int().min(1).max(20).optional(),
  quoteCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  specialRequests: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Pricing is re-derived server-side from this plan; browser totals are ignored. */
  ratePlanId: idSchema.nullable().optional(),
  roomUnits: z
    .array(
      z.object({
        roomTypeId: idSchema,
        adults: z.number().int().min(1).max(20),
        children: z.number().int().min(0).max(20),
        infants: z.number().int().min(0).max(20),
        ratePlanId: idSchema.nullable().optional(),
        pmsGroupBlockId: idSchema.nullable().optional(),
      }),
    )
    .max(20)
    .optional(),
  overbookingRequested: z.boolean().optional(),
  overbookingReason: z.string().trim().max(500).nullable().optional(),
});

async function postCreateReservationMoney(
  context: unknown,
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  input: {
    restaurantId: string;
    reservationId: string;
    payment: CreateReceiptRequest;
    guestDeposit: CreateReceiptRequest;
  },
): Promise<CreateMoneyPostResult> {
  const result = emptyCreateMoneyResult();
  if (!createMoneyNeedsFolio(input.payment, input.guestDeposit)) return result;

  let folioId = "";
  let membershipId = "";
  try {
    const cashier = await requireCashierOperator(context as never, input.restaurantId);
    membershipId = cashier.id;
    const opened = await supabaseAdmin.rpc("open_folio_for_reservation", {
      _restaurant_id: input.restaurantId,
      _reservation_id: input.reservationId,
      _membership_id: cashier.id,
    });
    if (opened.error) throw new Error(opened.error.message);
    folioId = (opened.data as { id: string }).id;
    result.folioOpened = true;
  } catch (error) {
    const message = mapCashierShiftError(
      error instanceof Error ? error.message : "Payment could not be posted.",
    );
    if (input.payment.amount != null) result.paymentError = message;
    if (input.guestDeposit.amount != null) result.guestDepositError = message;
    return result;
  }

  const polish = await loadPolish1Snapshot(supabaseAdmin, input.restaurantId);
  const catalogue = polish.paymentMethodsAvailable ? polish.paymentMethods : null;
  const postLine = async (receipt: CreateReceiptRequest, type: "payment" | "deposit") => {
    if (receipt.amount == null || !receipt.tender || !receipt.idempotencyKey) return;
    const tender = folioTenderFromCatalogue(receipt.tender, catalogue);
    if (!tender.ok) throw new Error(tender.message);
    const reference = receipt.reference;
    const label = type === "payment" ? "Reservation payment" : "Guest deposit";
    const description = reference
      ? `${label} (${tender.stored}) · ${reference}`
      : `${label} (${tender.stored})`;
    if (type === "payment") {
      await callPostFolioTransaction({
        restaurantId: input.restaurantId,
        folioId,
        type: "payment",
        category: "payment",
        description,
        amount: receipt.amount,
        membershipId,
        paymentMethod: tender.stored,
        idempotencyKey: receipt.idempotencyKey,
      });
      return;
    }
    await callPostFolioTransaction({
      restaurantId: input.restaurantId,
      folioId,
      type: "deposit",
      category: "deposit",
      description,
      amount: receipt.amount,
      membershipId,
      paymentMethod: tender.stored,
      idempotencyKey: receipt.idempotencyKey,
    });
  };

  if (input.payment.amount != null) {
    try {
      await postLine(input.payment, "payment");
      result.paymentPosted = true;
    } catch (error) {
      result.paymentError = mapCashierShiftError(
        error instanceof Error ? error.message : "Payment could not be posted.",
      );
    }
  }
  if (input.guestDeposit.amount != null) {
    try {
      await postLine(input.guestDeposit, "deposit");
      result.guestDepositPosted = true;
    } catch (error) {
      result.guestDepositError = mapCashierShiftError(
        error instanceof Error ? error.message : "Guest deposit could not be posted.",
      );
    }
  }
  return result;
}

export const createReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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
        promotionActivationId: idSchema.optional(),
        packageActivationIds: z.array(idSchema).optional(),
        /** Channel origin on hotel_reservations.source — not commercial_booking_source. */
        source: z.enum(["walk_in"]).optional(),
        commercialSalesChannel: z.string().max(40).nullable().optional(),
        purposeOfStay: z.string().max(40).nullable().optional(),
        billingRuleId: idSchema.nullable().optional(),
        companyContactId: idSchema.nullable().optional(),
        travelAgentContactId: idSchema.nullable().optional(),
        bookerGuestId: idSchema.nullable().optional(),
        depositTenderCode: z.string().max(80).nullable().optional(),
        paymentReceivedAmount: z
          .number()
          .finite()
          .nonnegative()
          .max(999999999)
          .nullable()
          .optional(),
        paymentReceivedTender: z.string().max(80).nullable().optional(),
        paymentReceivedReference: z.string().max(80).nullable().optional(),
        paymentReceivedIdempotencyKey: z.string().max(80).nullable().optional(),
        guestDepositAmount: z.number().finite().nonnegative().max(999999999).nullable().optional(),
        guestDepositTender: z.string().max(80).nullable().optional(),
        guestDepositReference: z.string().max(80).nullable().optional(),
        guestDepositIdempotencyKey: z.string().max(80).nullable().optional(),
        reservationMode: z.enum(["single", "group"]).optional(),
        roomGuestAssignments: z
          .array(
            z.object({
              unitSequence: z.number().int().min(1).max(20),
              guestId: idSchema,
              isPrimary: z.boolean(),
            }),
          )
          .max(40)
          .optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      id: string;
      confirmationNumber: string;
      roomSubtotal: number | null;
      promotionDiscount: number;
      roomSubtotalAfterPromotion: number | null;
      packagesSubtotal: number;
      grandCommercialSubtotal: number | null;
      reservationMode: ReservationMode;
      paymentPosted: boolean;
      paymentError: string | null;
      guestDepositPosted: boolean;
      guestDepositError: string | null;
      folioOpened: boolean;
    }> => {
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
      const paymentReceipt = normalizeCreateReceipt({
        amount: data.paymentReceivedAmount,
        tender: data.paymentReceivedTender,
        reference: data.paymentReceivedReference,
        idempotencyKey: data.paymentReceivedIdempotencyKey,
      });
      const guestDepositReceipt = normalizeCreateReceipt({
        amount: data.guestDepositAmount,
        tender: data.guestDepositTender,
        reference: data.guestDepositReference,
        idempotencyKey: data.guestDepositIdempotencyKey,
      });
      const paymentShape = createReceiptShapeError(paymentReceipt);
      if (paymentShape) throw new Error(paymentShape);
      const depositShape = createReceiptShapeError(guestDepositReceipt);
      if (depositShape) throw new Error(depositShape);
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
      const roomUnitPayload = createReservationRoomUnitPayload({
        roomTypeId: data.roomTypeId,
        adults: data.adults,
        children: data.children,
        infants: data.infants ?? 0,
        ratePlanId: data.ratePlanId ?? null,
        roomsRequested: data.rooms ?? 1,
        extraUnits: (data.roomUnits ?? []).slice(1).map((unit) => ({
          roomTypeId: unit.roomTypeId,
          adults: unit.adults,
          children: unit.children,
          infants: unit.infants,
          ratePlanId: unit.ratePlanId ?? null,
        })),
      });
      if (roomUnitPayload.roomUnits && roomUnitPayload.roomUnits.length > 1) {
        const first = data.roomUnits?.[0];
        if (
          !first ||
          first.roomTypeId !== data.roomTypeId ||
          first.adults !== data.adults ||
          first.children !== data.children ||
          first.infants !== (data.infants ?? 0) ||
          (first.ratePlanId ?? null) !== (data.ratePlanId ?? null)
        ) {
          throw new Error("The first room must match the reservation stay.");
        }
        for (const unit of roomUnitPayload.roomUnits.slice(1)) {
          const { data: extraType, error: extraTypeError } = await context.supabase
            .from("room_types")
            .select("max_occupancy")
            .eq("restaurant_id", data.restaurantId)
            .eq("id", unit.roomTypeId)
            .maybeSingle();
          if (extraTypeError) throw new Error(extraTypeError.message);
          if (!extraType) throw new Error("Room type not found for this property.");
          assertRoomTypeOccupancy(unit.adults, unit.children, extraType.max_occupancy);
        }
      }
      let reservationMode: ReservationMode;
      try {
        reservationMode = resolveReservationMode({
          requested: data.reservationMode ?? null,
          roomUnitCount: roomUnitPayload.roomUnits?.length ?? 1,
        });
      } catch (error) {
        throw reservationError(error instanceof Error ? error.message : "INVALID_RESERVATION_MODE");
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (createMoneyNeedsFolio(paymentReceipt, guestDepositReceipt)) {
        const polish = await loadPolish1Snapshot(supabaseAdmin, data.restaurantId);
        const activeTenderCodes = polish.paymentMethodsAvailable
          ? polish.paymentMethods.filter((row) => row.active).map((row) => row.code)
          : null;
        if (paymentReceipt.tender)
          assertReservationTenderCode(paymentReceipt.tender, activeTenderCodes);
        if (guestDepositReceipt.tender)
          assertReservationTenderCode(guestDepositReceipt.tender, activeTenderCodes);
      }
      let groupLink: {
        groupId: string;
        blockId: string | null;
        unitBlockIds: Array<string | null>;
      } | null = null;
      const plannedGroupUnits = (
        data.roomUnits && data.roomUnits.length > 0
          ? data.roomUnits
          : Array.from({ length: roomUnitPayload.rooms }, () => ({
              roomTypeId: data.roomTypeId,
              pmsGroupBlockId: data.pmsGroupBlockId ?? null,
            }))
      ).map((unit) => ({
        roomTypeId: unit.roomTypeId,
        blockId: unit.pmsGroupBlockId ?? data.pmsGroupBlockId ?? null,
        proposed: {
          arrivalDate: arrival,
          departureDate: departure,
          status,
        },
      }));
      if (
        data.pmsGroupBlockId ||
        data.pmsGroupId ||
        plannedGroupUnits.some((unit) => unit.blockId)
      ) {
        const { assertGroupUnitsPickup } = await import("./groups.functions");
        groupLink = await assertGroupUnitsPickup(supabaseAdmin, {
          restaurantId: data.restaurantId,
          pmsGroupId: data.pmsGroupId ?? null,
          units: plannedGroupUnits,
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
      const stayPolicies = await loadRatePlanStayPolicies(
        supabaseAdmin,
        data.restaurantId,
        data.ratePlanId ?? null,
      );
      const sourceChannel = await assertReservationCreateSourceChannel({
        restaurantId: data.restaurantId,
        commercialBookingSource: blankToNull(data.commercialBookingSource),
        commercialSalesChannel: blankToNull(data.commercialSalesChannel),
      });
      const pricedArgs = {
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
        // rooms_requested is a compatibility projection. Room units are authoritative.
        _rooms: roomUnitPayload.roomUnits?.length ?? roomUnitPayload.rooms,
        _infants: data.infants ?? 0,
        ...(data.reservationMode ? { _reservation_mode: reservationMode } : {}),
        ...(data.roomGuestAssignments
          ? {
              _room_guest_assignments: data.roomGuestAssignments.map((assignment) => ({
                unit_sequence: assignment.unitSequence,
                guest_id: assignment.guestId,
                is_primary: assignment.isPrimary,
              })),
            }
          : {}),
        ...(roomUnitPayload.roomUnits
          ? {
              _room_units: roomUnitPayload.roomUnits.map((unit) => ({
                room_type_id: unit.roomTypeId,
                adults: unit.adults,
                children: unit.children,
                infants: unit.infants,
                rate_plan_id: unit.ratePlanId,
              })),
            }
          : {}),
        _quote_currency: (data.quoteCurrency ?? null) as unknown as string,
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
      };
      const hasCommercialSelection =
        Boolean(data.promotionActivationId) || (data.packageActivationIds?.length ?? 0) > 0;
      if (data.overbookingRequested) {
        await assertExplicitOverbookingAllowed(
          supabaseAdmin as never,
          data.restaurantId,
          me.role,
          data.overbookingReason,
        );
      }
      const overbookingRpc = supabaseAdmin as never as {
        rpc: (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      const { data: created, error } = data.overbookingRequested
        ? await overbookingRpc.rpc("create_hotel_reservation_overbooking", {
            ...pricedArgs,
            _overbooking_reason: data.overbookingReason,
            _promotion_activation_id: data.promotionActivationId ?? null,
            _package_activation_ids: data.packageActivationIds ?? null,
          })
        : hasCommercialSelection
          ? await overbookingRpc.rpc("create_hotel_reservation_priced_commercial", {
              ...pricedArgs,
              _promotion_activation_id: data.promotionActivationId ?? null,
              _package_activation_ids: data.packageActivationIds ?? null,
            })
          : await supabaseAdmin.rpc("create_hotel_reservation_priced", pricedArgs);
      if (error) throw rateError(reservationError(error.message).message);

      const row = created as unknown as {
        id: string;
        confirmation_number: string;
        room_subtotal: number | string | null;
        currency: string | null;
        nightly_rate_snapshot: unknown;
      };
      if (groupLink) {
        const { attachReservationToGroup } = await import("./groups.functions");
        await attachReservationToGroup(supabaseAdmin, me.id, {
          restaurantId: data.restaurantId,
          reservationId: row.id,
          groupId: groupLink.groupId,
          blockId: groupLink.blockId,
          unitBlockIds: groupLink.unitBlockIds.map((blockId, index) => ({
            unitSequence: index + 1,
            blockId,
          })),
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
      const step3Patch: Record<string, string | null> = {};
      if (sourceChannel.commercialSalesChannel)
        step3Patch.commercial_sales_channel = sourceChannel.commercialSalesChannel;
      if (data.purposeOfStay) step3Patch.purpose_of_stay = data.purposeOfStay;
      if (data.billingRuleId) step3Patch.billing_rule_id = data.billingRuleId;
      if (data.companyContactId) step3Patch.company_contact_id = data.companyContactId;
      if (data.travelAgentContactId) step3Patch.travel_agent_contact_id = data.travelAgentContactId;
      if (data.bookerGuestId) step3Patch.booker_guest_id = data.bookerGuestId;
      if (Object.keys(step3Patch).length > 0) {
        const { error: step3Error } = await supabaseAdmin
          .from("hotel_reservations")
          .update(step3Patch)
          .eq("restaurant_id", data.restaurantId)
          .eq("id", row.id);
        if (step3Error && !/column|schema cache|does not exist/i.test(step3Error.message)) {
          throw new Error(step3Error.message);
        }
      }
      await persistDepositRequirementSnapshot(supabaseAdmin, {
        restaurantId: data.restaurantId,
        reservationId: row.id,
        stayPolicies,
        depositTenderCode: blankToNull(data.depositTenderCode),
        guaranteeMethod: persistApplied ? blankToNull(data.guaranteeMethod) : null,
        roomSubtotal: row.room_subtotal == null ? null : Number(row.room_subtotal),
        currency: row.currency,
        nightly: parseSnapshot(row.nightly_rate_snapshot),
      });
      const money = await postCreateReservationMoney(context, supabaseAdmin, {
        restaurantId: data.restaurantId,
        reservationId: row.id,
        payment: paymentReceipt,
        guestDeposit: guestDepositReceipt,
      });
      if (data.travelAgentMasterId) {
        const { syncTravelAgentCommission } = await import("./guest-travel-agent-booking");
        const { notifyTravelAgentBookingEvent } =
          await import("./guest-travel-agent-detail.functions");
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
      const roomSubtotal = row.room_subtotal == null ? null : Number(row.room_subtotal);
      const { getReservationCommercialAttribution } =
        await import("./revenue/commercial-package.server");
      const commercial = await getReservationCommercialAttribution(supabaseAdmin, {
        restaurantId: data.restaurantId,
        reservationId: row.id,
        roomSubtotal,
      });
      return {
        id: row.id,
        confirmationNumber: row.confirmation_number,
        roomSubtotal,
        promotionDiscount: commercial.promotionDiscount,
        roomSubtotalAfterPromotion: commercial.roomSubtotalAfterPromotion,
        packagesSubtotal: commercial.packagesSubtotal,
        grandCommercialSubtotal: commercial.grandCommercialSubtotal,
        reservationMode,
        paymentPosted: money.paymentPosted,
        paymentError: money.paymentError,
        guestDepositPosted: money.guestDepositPosted,
        guestDepositError: money.guestDepositError,
        folioOpened: money.folioOpened,
      };
    },
  );

export const copyReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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

type EditQueryResult<T> = Promise<{ data: T; error: { message: string } | null }>;
type EditFilter = EditQueryResult<unknown> & {
  eq: (column: string, value: string) => EditFilter;
  order: (column: string, options: { ascending: boolean }) => EditFilter;
  maybeSingle: () => EditQueryResult<unknown>;
};
type EditDb = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => EditFilter;
    update: (values: Record<string, string | number | null>) => EditFilter;
  };
};

async function applyUnitScopedReservationEdit(input: {
  supabaseAdmin: EditDb;
  membershipId: string;
  restaurantId: string;
  reservationId: string;
  reservationRoomId: string | null;
  guestId: string;
  roomTypeId: string;
  roomId: string | null;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  specialRequests: string | null;
  notes: string | null;
  ratePlanId: string | null;
  commercialBookingSource: string | null | undefined;
  marketSegment: string | null | undefined;
  externalReference: string | null | undefined;
  guaranteeMethod: string | null | undefined;
}): Promise<{ id: string; amendment: StayAmendmentResult | null }> {
  const db = input.supabaseAdmin;
  const { arrival, departure } = assertStayDates(input.arrival, input.departure);
  const stayRead = await db
    .from("hotel_reservations")
    .select(
      "id, guest_id, room_type_id, room_id, status, arrival_date, departure_date, adults, children, infants, room_subtotal, currency, rate_plan_id, special_requests, notes, commercial_booking_source, market_segment, external_reference, guarantee_method, updated_at",
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.reservationId)
    .maybeSingle();
  if (stayRead.error) throw new Error(stayRead.error.message);
  if (!stayRead.data) throw reservationError("RESERVATION_NOT_FOUND");
  const master = stayRead.data as {
    guest_id: string;
    room_type_id: string;
    room_id: string | null;
    status: string;
    arrival_date: string;
    departure_date: string;
    adults: number;
    children: number;
    infants: number | null;
    room_subtotal: number | string | null;
    currency: string | null;
    rate_plan_id: string | null;
    special_requests: string | null;
    notes: string | null;
    commercial_booking_source: string | null;
    market_segment: string | null;
    external_reference: string | null;
    guarantee_method: string | null;
    updated_at: string | null;
  };
  const unitsRead = await db
    .from("hotel_reservation_rooms")
    .select(
      "id, unit_sequence, room_type_id, room_id, arrival_date, departure_date, adults, children, rate_plan_id, status, room_subtotal",
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId)
    .order("unit_sequence", { ascending: true });
  if (unitsRead.error) throw new Error(unitsRead.error.message);
  const units = (unitsRead.data ?? []) as Array<{
    id: string;
    unit_sequence: number;
    room_type_id: string;
    room_id: string | null;
    arrival_date: string;
    departure_date: string;
    adults: number;
    children: number;
    rate_plan_id: string | null;
    status: string | null;
    room_subtotal: number | string | null;
  }>;
  const multi = units.length > 1;
  const unit = input.reservationRoomId
    ? units.find((row) => row.id === input.reservationRoomId)
    : units.length === 1
      ? units[0]
      : undefined;
  if (input.reservationRoomId && !unit) throw reservationError("ROOM_UNIT_NOT_FOUND");
  if (multi && !unit) {
    const roomFieldsDiffer =
      master.room_type_id !== input.roomTypeId ||
      (master.room_id ?? null) !== input.roomId ||
      master.arrival_date !== arrival ||
      master.departure_date !== departure ||
      master.adults !== input.adults ||
      master.children !== input.children ||
      (master.rate_plan_id ?? null) !== input.ratePlanId;
    if (roomFieldsDiffer) throw reservationError("ROOM_UNIT_REQUIRED");
  }

  const scope = unit ?? {
    id: input.reservationRoomId,
    room_type_id: master.room_type_id,
    room_id: master.room_id,
    arrival_date: master.arrival_date,
    departure_date: master.departure_date,
    adults: master.adults,
    children: master.children,
    rate_plan_id: master.rate_plan_id,
    status: master.status,
    room_subtotal: master.room_subtotal,
  };
  const datesChanging = scope.arrival_date !== arrival || scope.departure_date !== departure;
  const occupancyChanging = scope.adults !== input.adults || scope.children !== input.children;
  const stayChanged = datesChanging || occupancyChanging;
  const roomTypeChanged = scope.room_type_id !== input.roomTypeId;
  const assignmentChanged = (scope.room_id ?? null) !== input.roomId;
  const rateChanged = (scope.rate_plan_id ?? null) !== input.ratePlanId;
  const notesChanged = (master.notes ?? null) !== input.notes;
  const requestsChanged = (master.special_requests ?? null) !== input.specialRequests;
  const masterOnly = units.length === 0;
  if (multi && (stayChanged || roomTypeChanged)) {
    throw reservationError("MULTI_ROOM_AMEND_UNSUPPORTED");
  }
  if (assignmentChanged && scope.status === "checked_in") {
    throw reservationError(
      "In-house room changes use the Front Office room move. Direct assign and unassign are not available after check-in.",
    );
  }
  if (datesChanging && scope.status !== "pending" && scope.status !== "confirmed") {
    throw reservationError("INVALID_TRANSITION");
  }
  if (datesChanging && (scope.status === "pending" || scope.status === "confirmed")) {
    const propertyRead = await db
      .from("restaurants")
      .select("timezone, business_date")
      .eq("id", input.restaurantId)
      .maybeSingle();
    if (propertyRead.error) throw new Error(propertyRead.error.message);
    const property = propertyRead.data as {
      business_date?: string | null;
      timezone?: string | null;
    } | null;
    const businessDate = property?.business_date ?? propertyToday(property?.timezone || "UTC");
    if ((scope.departure_date ?? "") < businessDate) {
      throw reservationError("INVALID_TRANSITION");
    }
  }
  const roomTypeRead = await db
    .from("room_types")
    .select("max_occupancy")
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.roomTypeId)
    .maybeSingle();
  if (roomTypeRead.error) throw new Error(roomTypeRead.error.message);
  const roomType = roomTypeRead.data as { max_occupancy?: number | null } | null;
  if (!roomType) throw new Error("Room type not found for this property.");
  assertRoomTypeOccupancy(input.adults, input.children, roomType.max_occupancy ?? null);

  if (datesChanging || roomTypeChanged) {
    const { assertExistingReservationGroupPickup } = await import("./groups.functions");
    await assertExistingReservationGroupPickup(input.supabaseAdmin, {
      restaurantId: input.restaurantId,
      reservationId: input.reservationId,
      overlay: {
        reservationRoomId: unit?.id ?? input.reservationRoomId,
        roomTypeId: input.roomTypeId,
        arrivalDate: arrival,
        departureDate: departure,
        status: scope.status ?? master.status,
      },
    });
  }

  const commercialMoneyChange = stayChanged || roomTypeChanged || rateChanged;
  const unitId = unit?.id ?? null;
  if (commercialMoneyChange && unitId) {
    const gate = await db.rpc("assert_reservation_unit_room_charge_reconcilable", {
      _restaurant_id: input.restaurantId,
      _reservation_id: input.reservationId,
      _reservation_room_id: unitId,
    });
    if (gate.error) throw reservationError(gate.error.message);
  }

  const pricedRoomId = masterOnly || roomTypeChanged ? input.roomId : (scope.room_id ?? null);
  const pricedRatePlanId = scope.rate_plan_id;
  const needPriced =
    (!multi && (stayChanged || roomTypeChanged || (masterOnly && assignmentChanged))) ||
    notesChanged ||
    requestsChanged;
  if (needPriced) {
    const priced = await db.rpc("amend_hotel_reservation_priced", {
      _restaurant_id: input.restaurantId,
      _reservation_id: input.reservationId,
      _room_type_id: multi ? master.room_type_id : input.roomTypeId,
      _room_id: (multi ? master.room_id : pricedRoomId) as unknown as string,
      _arrival: multi ? master.arrival_date : arrival,
      _departure: multi ? master.departure_date : departure,
      _adults: multi ? master.adults : input.adults,
      _children: multi ? master.children : input.children,
      _special_requests: input.specialRequests as unknown as string,
      _notes: input.notes as unknown as string,
      _rate_plan_id: (multi ? master.rate_plan_id : pricedRatePlanId) as unknown as string,
      _membership_id: input.membershipId,
      _infants: null,
    });
    if (priced.error) throw rateError(reservationError(priced.error.message).message);
  }
  if (assignmentChanged && !roomTypeChanged && unitId) {
    const assigned = await db.rpc("assign_hotel_reservation_room_unit", {
      _restaurant_id: input.restaurantId,
      _reservation_id: input.reservationId,
      _room_id: input.roomId as unknown as string,
      _membership_id: input.membershipId,
      _reservation_room_id: unitId,
      _expected_room_id: scope.room_id,
      _expected_updated_at: master.updated_at,
    });
    if (assigned.error) throw assignmentWriteError(assigned.error);
  }
  if (rateChanged && input.ratePlanId && unitId) {
    const repriced = await db.rpc("reprice_hotel_reservation_room", {
      _restaurant_id: input.restaurantId,
      _reservation_id: input.reservationId,
      _reservation_room_id: unitId,
      _rate_plan_id: input.ratePlanId,
      _membership_id: input.membershipId,
    });
    if (repriced.error) throw rateError(reservationError(repriced.error.message).message);
  } else if (rateChanged && input.ratePlanId && masterOnly) {
    const repriced = await db.rpc("reprice_hotel_reservation", {
      _restaurant_id: input.restaurantId,
      _reservation_id: input.reservationId,
      _rate_plan_id: input.ratePlanId,
      _membership_id: input.membershipId,
    });
    if (repriced.error) throw rateError(reservationError(repriced.error.message).message);
  }
  if (commercialMoneyChange && unitId) {
    const reconciled = await db.rpc("reconcile_reservation_unit_room_charge", {
      _restaurant_id: input.restaurantId,
      _reservation_id: input.reservationId,
      _reservation_room_id: unitId,
      _membership_id: input.membershipId,
    });
    if (reconciled.error) throw reservationError(reconciled.error.message);
  }

  const commercialPatch: Record<string, string | null> = {};
  if (input.guestId !== master.guest_id) commercialPatch.guest_id = input.guestId;
  if (
    input.commercialBookingSource !== undefined &&
    input.commercialBookingSource !== master.commercial_booking_source
  ) {
    commercialPatch.commercial_booking_source = input.commercialBookingSource;
  }
  if (input.marketSegment !== undefined && input.marketSegment !== master.market_segment) {
    commercialPatch.market_segment = input.marketSegment;
  }
  if (
    input.externalReference !== undefined &&
    input.externalReference !== master.external_reference
  ) {
    commercialPatch.external_reference = input.externalReference;
  }
  if (input.guaranteeMethod !== undefined && input.guaranteeMethod !== master.guarantee_method) {
    commercialPatch.guarantee_method = input.guaranteeMethod;
  }
  if (Object.keys(commercialPatch).length > 0) {
    const patched = await db
      .from("hotel_reservations")
      .update(commercialPatch)
      .eq("id", input.reservationId)
      .eq("restaurant_id", input.restaurantId);
    if (patched.error) throw new Error(patched.error.message);
    await recordReservationEvent({
      restaurantId: input.restaurantId,
      reservationId: input.reservationId,
      eventType: "amended",
      previousValues: {
        guest_id: master.guest_id,
        commercial_booking_source: master.commercial_booking_source,
        market_segment: master.market_segment,
        external_reference: master.external_reference,
        guarantee_method: master.guarantee_method,
      },
      newValues: {
        guest_id: commercialPatch.guest_id ?? master.guest_id,
        commercial_booking_source:
          commercialPatch.commercial_booking_source ?? master.commercial_booking_source,
        market_segment: commercialPatch.market_segment ?? master.market_segment,
        external_reference: commercialPatch.external_reference ?? master.external_reference,
        guarantee_method: commercialPatch.guarantee_method ?? master.guarantee_method,
      },
      actorMembershipId: input.membershipId,
    });
  }

  const afterRead = await db
    .from("hotel_reservations")
    .select("arrival_date, departure_date, adults, children, infants, room_subtotal, currency")
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.reservationId)
    .maybeSingle();
  if (afterRead.error) throw new Error(afterRead.error.message);
  const updated = (afterRead.data ?? null) as {
    arrival_date?: string;
    departure_date?: string;
    adults?: number;
    children?: number;
    infants?: number | null;
    room_subtotal?: number | string | null;
    currency?: string | null;
  } | null;
  if (datesChanging || roomTypeChanged) {
    const { resyncGroupBlockInventoryForReservation } = await import("./groups.functions");
    await resyncGroupBlockInventoryForReservation(
      input.supabaseAdmin,
      input.membershipId,
      input.restaurantId,
      input.reservationId,
    );
  }
  return {
    id: input.reservationId,
    amendment: buildStayAmendmentResult({
      previousArrival: master.arrival_date,
      nextArrival: updated?.arrival_date ?? arrival,
      previousDeparture: master.departure_date,
      nextDeparture: updated?.departure_date ?? departure,
      previousAdults: Number(master.adults),
      nextAdults: Number(updated?.adults ?? input.adults),
      previousChildren: Number(master.children),
      nextChildren: Number(updated?.children ?? input.children),
      previousInfants: Number(master.infants ?? 0),
      nextInfants: Number(updated?.infants ?? master.infants ?? 0),
      currency: updated?.currency ?? master.currency,
      previousRoomSubtotal: master.room_subtotal,
      nextRoomSubtotal: updated?.room_subtotal,
    }),
  };
}

export const amendReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    stayInputSchema
      .extend({
        reservationId: idSchema,
        commercialBookingSource: z.string().max(120).nullable().optional(),
        marketSegment: z.string().max(120).nullable().optional(),
        externalReference: z.string().max(120).nullable().optional(),
        guaranteeMethod: z.string().max(80).nullable().optional(),
        purposeOfStay: z.string().max(40).nullable().optional(),
        reservationRoomId: idSchema.nullable().optional(),
        arrivalTransport: z.string().max(200).nullable().optional(),
        pickupNote: z.string().max(200).nullable().optional(),
        specialOccasion: z.string().max(80).nullable().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({ data, context }): Promise<{ id: string; amendment: StayAmendmentResult | null }> => {
      const me = await requireReservationManager(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
      if (data.reservationRoomId !== undefined) {
        return applyUnitScopedReservationEdit({
          supabaseAdmin: supabaseAdmin as unknown as EditDb,
          membershipId: me.id,
          restaurantId: data.restaurantId,
          reservationId: data.reservationId,
          reservationRoomId: data.reservationRoomId,
          guestId: data.guestId,
          roomTypeId: data.roomTypeId,
          roomId: data.roomId ?? null,
          arrival: data.arrival,
          departure: data.departure,
          adults: data.adults,
          children: data.children,
          specialRequests: blankToNull(data.specialRequests),
          notes: blankToNull(data.notes),
          ratePlanId: data.ratePlanId ?? null,
          commercialBookingSource:
            data.commercialBookingSource !== undefined
              ? blankToNull(data.commercialBookingSource)
              : undefined,
          marketSegment:
            data.marketSegment !== undefined ? blankToNull(data.marketSegment) : undefined,
          externalReference:
            data.externalReference !== undefined ? blankToNull(data.externalReference) : undefined,
          guaranteeMethod:
            data.guaranteeMethod !== undefined ? blankToNull(data.guaranteeMethod) : undefined,
        });
      }
      const { arrival, departure } = assertStayDates(data.arrival, data.departure);
      const { data: existing, error: readError } = await supabaseAdmin
        .from("hotel_reservations")
        .select(
          "id, guest_id, room_type_id, status, arrival_date, departure_date, adults, children, infants, room_subtotal, currency, commercial_booking_source, market_segment, external_reference, guarantee_method, travel_agent_master_id, purpose_of_stay, arrival_transport, pickup_note, special_occasion, pms_group_id, pms_group_block_id",
        )
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.reservationId)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!existing) throw new Error("Reservation not found for this property.");

      const stayRow = existing as {
        status?: string;
        arrival_date?: string;
        departure_date?: string;
        adults?: number;
        children?: number;
        infants?: number | null;
        room_subtotal?: number | string | null;
        currency?: string | null;
      };
      const datesChanging =
        stayRow.arrival_date !== arrival || stayRow.departure_date !== departure;
      const occupancyChanging =
        stayRow.adults !== data.adults ||
        stayRow.children !== data.children ||
        (data.infants !== undefined && data.infants !== Number(stayRow.infants ?? 0));
      if (datesChanging || occupancyChanging) {
        if (
          stayRow.status === "checked_out" ||
          stayRow.status === "cancelled" ||
          stayRow.status === "no_show"
        ) {
          throw reservationError("INVALID_TRANSITION");
        }
        if (datesChanging && stayRow.status !== "pending" && stayRow.status !== "confirmed") {
          throw reservationError("INVALID_TRANSITION");
        }
        const { data: property, error: propertyError } = await supabaseAdmin
          .from("restaurants")
          .select("timezone, business_date")
          .eq("id", data.restaurantId)
          .maybeSingle();
        if (propertyError) throw new Error(propertyError.message);
        const businessDate =
          (property as { business_date?: string | null } | null)?.business_date ??
          propertyToday((property as { timezone?: string | null } | null)?.timezone || "UTC");
        if (
          (stayRow.status === "pending" || stayRow.status === "confirmed") &&
          (stayRow.departure_date ?? "") < businessDate
        ) {
          throw reservationError("INVALID_TRANSITION");
        }
      }

      const { data: roomType, error: occupancyError } = await supabaseAdmin
        .from("room_types")
        .select("max_occupancy")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.roomTypeId)
        .maybeSingle();
      if (occupancyError) throw new Error(occupancyError.message);
      if (!roomType) throw new Error("Room type not found for this property.");
      assertRoomTypeOccupancy(data.adults, data.children, roomType.max_occupancy);

      const typeChanging = existing.room_type_id !== data.roomTypeId;
      if (datesChanging || typeChanging) {
        const { assertExistingReservationGroupPickup } = await import("./groups.functions");
        await assertExistingReservationGroupPickup(supabaseAdmin, {
          restaurantId: data.restaurantId,
          reservationId: data.reservationId,
          overlay: {
            roomTypeId: data.roomTypeId,
            arrivalDate: arrival,
            departureDate: departure,
            status: stayRow.status,
          },
        });
      }

      const travelAgentMasterId = (existing as { travel_agent_master_id?: string | null })
        .travel_agent_master_id;
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
      if (data.overbookingRequested) {
        await assertExplicitOverbookingAllowed(
          supabaseAdmin as never,
          data.restaurantId,
          me.role,
          data.overbookingReason,
        );
      }
      const amendArgs = {
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
        _infants: data.infants ?? null,
      };
      const { data: updated, error } = data.overbookingRequested
        ? await (
            supabaseAdmin as never as {
              rpc: (
                name: string,
                args: Record<string, unknown>,
              ) => Promise<{ data: unknown; error: { message: string } | null }>;
            }
          ).rpc("amend_hotel_reservation_overbooking", {
            ...amendArgs,
            _overbooking_reason: data.overbookingReason,
          })
        : await supabaseAdmin.rpc("amend_hotel_reservation_priced", amendArgs);
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

      const storedMeta = existing as {
        purpose_of_stay?: string | null;
        infants?: number | null;
        arrival_transport?: string | null;
        pickup_note?: string | null;
        special_occasion?: string | null;
      };
      const storedPurpose = storedMeta.purpose_of_stay ?? null;
      const storedInfants = Number(storedMeta.infants ?? 0);
      const storedTransport = storedMeta.arrival_transport ?? null;
      const storedPickup = storedMeta.pickup_note ?? null;
      const storedOccasion = storedMeta.special_occasion ?? null;
      const nextPurpose =
        data.purposeOfStay !== undefined ? blankToNull(data.purposeOfStay) : undefined;
      if (nextPurpose && nextPurpose !== storedPurpose) {
        const { data: purposeRow, error: purposeError } = await supabaseAdmin
          .from("pms_purpose_of_stay")
          .select("code")
          .eq("restaurant_id", data.restaurantId)
          .eq("code", nextPurpose)
          .eq("active", true)
          .maybeSingle();
        if (purposeError) throw new Error(purposeError.message);
        if (!purposeRow) throw new Error("That purpose of stay is not available.");
      }
      const nextInfants = data.infants;
      const stayMetaPatch: Record<string, string | number | null> = {};
      if (nextPurpose !== undefined && nextPurpose !== storedPurpose) {
        stayMetaPatch.purpose_of_stay = nextPurpose;
      }
      if (nextInfants !== undefined && nextInfants !== storedInfants) {
        stayMetaPatch.infants = nextInfants;
      }
      const nextTransport =
        data.arrivalTransport !== undefined ? blankToNull(data.arrivalTransport) : undefined;
      const nextPickup = data.pickupNote !== undefined ? blankToNull(data.pickupNote) : undefined;
      const nextOccasion =
        data.specialOccasion !== undefined ? blankToNull(data.specialOccasion) : undefined;
      if (nextTransport !== undefined && nextTransport !== storedTransport) {
        stayMetaPatch.arrival_transport = nextTransport;
      }
      if (nextPickup !== undefined && nextPickup !== storedPickup) {
        stayMetaPatch.pickup_note = nextPickup;
      }
      if (nextOccasion !== undefined && nextOccasion !== storedOccasion) {
        stayMetaPatch.special_occasion = nextOccasion;
      }
      const reservationPatch = { ...commercialPatch, ...stayMetaPatch };

      if (Object.keys(reservationPatch).length > 0) {
        const { error: patchError } = await supabaseAdmin
          .from("hotel_reservations")
          .update(reservationPatch)
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
            purpose_of_stay: storedPurpose,
            infants: storedInfants,
            arrival_transport: storedTransport,
            pickup_note: storedPickup,
            special_occasion: storedOccasion,
          },
          newValues: {
            guest_id: commercialPatch.guest_id ?? existing.guest_id,
            commercial_booking_source:
              commercialPatch.commercial_booking_source ?? existing.commercial_booking_source,
            market_segment: commercialPatch.market_segment ?? existing.market_segment,
            external_reference: commercialPatch.external_reference ?? existing.external_reference,
            guarantee_method: commercialPatch.guarantee_method ?? existing.guarantee_method,
            purpose_of_stay:
              stayMetaPatch.purpose_of_stay !== undefined
                ? stayMetaPatch.purpose_of_stay
                : storedPurpose,
            infants: stayMetaPatch.infants !== undefined ? stayMetaPatch.infants : storedInfants,
            arrival_transport:
              stayMetaPatch.arrival_transport !== undefined
                ? stayMetaPatch.arrival_transport
                : storedTransport,
            pickup_note:
              stayMetaPatch.pickup_note !== undefined ? stayMetaPatch.pickup_note : storedPickup,
            special_occasion:
              stayMetaPatch.special_occasion !== undefined
                ? stayMetaPatch.special_occasion
                : storedOccasion,
          },
          actorMembershipId: me.id,
        });
      }

      const updatedRow = (updated ?? null) as {
        id?: string;
        arrival_date?: string;
        departure_date?: string;
        adults?: number;
        children?: number;
        infants?: number | null;
        room_subtotal?: number | string | null;
        currency?: string | null;
      } | null;
      const amendment = buildStayAmendmentResult({
        previousArrival: stayRow.arrival_date ?? arrival,
        nextArrival: updatedRow?.arrival_date ?? arrival,
        previousDeparture: stayRow.departure_date ?? departure,
        nextDeparture: updatedRow?.departure_date ?? departure,
        previousAdults: Number(stayRow.adults ?? data.adults),
        nextAdults: Number(updatedRow?.adults ?? data.adults),
        previousChildren: Number(stayRow.children ?? data.children),
        nextChildren: Number(updatedRow?.children ?? data.children),
        previousInfants: Number(stayRow.infants ?? 0),
        nextInfants: Number(updatedRow?.infants ?? data.infants ?? stayRow.infants ?? 0),
        currency: updatedRow?.currency ?? stayRow.currency ?? null,
        previousRoomSubtotal: stayRow.room_subtotal,
        nextRoomSubtotal: updatedRow?.room_subtotal,
      });

      const amendedId = (updated as unknown as { id: string }).id;
      if (datesChanging || typeChanging) {
        const { resyncGroupBlockInventoryForReservation } = await import("./groups.functions");
        await resyncGroupBlockInventoryForReservation(
          supabaseAdmin,
          me.id,
          data.restaurantId,
          amendedId,
        );
      }
      if (travelAgentMasterId) {
        const { syncTravelAgentCommission } = await import("./guest-travel-agent-booking");
        const { notifyTravelAgentBookingEvent } =
          await import("./guest-travel-agent-detail.functions");
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
      return { id: amendedId, amendment };
    },
  );

export const ROOM_ASSIGNMENT_UNAVAILABLE =
  "This room is no longer available. Select another eligible room.";
export const ROOM_ASSIGNMENT_STALE =
  "This room assignment changed. Refresh room availability and try again.";

function assignmentWriteError(error: { message: string }): Error {
  const mapped = reservationError(error.message);
  if (/ASSIGNMENT_STALE/i.test(`${error.message} ${mapped.message}`)) {
    return new Error(ROOM_ASSIGNMENT_STALE);
  }
  if (
    /ROOM_NOT_ASSIGNABLE|ROOM_ALREADY_BOOKED|NO_AVAILABILITY|eligible|available|booked|occupied|blocked/i.test(
      `${error.message} ${mapped.message}`,
    )
  ) {
    return new Error(ROOM_ASSIGNMENT_UNAVAILABLE);
  }
  return mapped;
}

/** Assign or clear a room without touching the rest of the stay. */
export const assignReservationRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        roomId: idSchema.nullable(),
        reservationRoomId: idSchema.optional(),
        expectedRoomId: idSchema.nullable().optional(),
        expectedUpdatedAt: z.string().min(1).nullable().optional(),
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const units = await supabaseAdmin
      .from("hotel_reservation_rooms")
      .select("id, status, room_type_id, arrival_date, departure_date, adults, children")
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId)
      .order("unit_sequence", { ascending: true });
    if (units.error && !isMissingSchemaError(units.error)) throw new Error(units.error.message);
    const unitRows = units.error ? [] : (units.data ?? []);
    const targetUnit = data.reservationRoomId
      ? unitRows.find((unit) => unit.id === data.reservationRoomId)
      : unitRows.length === 1
        ? unitRows[0]
        : undefined;
    if (unitRows.length > 0 && !targetUnit) throw reservationError("ROOM_UNIT_REQUIRED");
    const assignmentStatus = targetUnit
      ? String(targetUnit.status ?? existing.status)
      : String(existing.status);
    if (assignmentStatus === "checked_in") {
      throw reservationError(
        "In-house room changes use the Front Office room move. Direct assign and unassign are not available after check-in.",
      );
    }
    if (!["pending", "confirmed"].includes(assignmentStatus)) {
      throw new Error("Rooms can only be assigned before check-in.");
    }
    if (data.roomId) {
      const { getAssignmentEligibilityCompat } = await import("./room-inventory-compat");
      const eligibility = await getAssignmentEligibilityCompat(
        context.supabase,
        {
          restaurantId: data.restaurantId,
          roomId: data.roomId,
          roomTypeId: targetUnit?.room_type_id ?? existing.room_type_id,
          arrival: targetUnit?.arrival_date ?? existing.arrival_date,
          departure: targetUnit?.departure_date ?? existing.departure_date,
          excludeReservationId: data.reservationId,
          adults: targetUnit?.adults ?? existing.adults,
          children: targetUnit?.children ?? existing.children,
        },
        () => ({
          source: "legacy" as const,
          eligible: true,
          blockers: [],
          warnings: [],
          preferenceScore: 0,
          preferenceReasons: [],
        }),
      );
      if (!eligibility.eligible) throw new Error(ROOM_ASSIGNMENT_UNAVAILABLE);
    }
    if (targetUnit) {
      const { error: assignError } = await supabaseAdmin.rpc("assign_hotel_reservation_room_unit", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _room_id: data.roomId as unknown as string,
        _membership_id: me.id,
        _reservation_room_id: targetUnit.id,
        _expected_room_id: data.expectedRoomId as unknown as string,
        _expected_updated_at: data.expectedUpdatedAt as unknown as string,
      });
      if (assignError) throw assignmentWriteError(assignError);
      return { id: data.reservationId };
    }

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
    if (error) throw assignmentWriteError(error);
    return { id: data.reservationId };
  });

/** Apply one per-stay package to one room unit. Does not copy it to sibling rooms. */
export const applyReservationRoomPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema,
        packageActivationId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const { data: packageId, error } = await supabaseAdmin.rpc(
      "apply_hotel_reservation_room_package",
      {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _reservation_room_id: data.reservationRoomId,
        _package_activation_id: data.packageActivationId,
        _membership_id: me.id,
      },
    );
    if (error) throw reservationError(error.message);
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "package_applied",
      newValues: {
        package_activation_id: data.packageActivationId,
        reservation_room_id: data.reservationRoomId,
        package_row_id: packageId == null ? null : String(packageId),
      },
      actorMembershipId: me.id,
    });
    return { id: String(packageId) };
  });

/* ------------------------------------------------------------------ status */

/** Add, remove, or change the primary occupant of one room unit. */
export const manageReservationRoomGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema,
        guestId: idSchema,
        action: z.enum(["add", "remove", "set_primary"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const { error } = await supabaseAdmin.rpc("manage_reservation_room_guest", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _reservation_room_id: data.reservationRoomId,
      _action: data.action,
      _guest_id: data.guestId,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId };
  });

/**
 * Reservation-owned pending/confirmed/cancelled only.
 * Front Office operational cancel (fees + room clear) must use `completeFoCancel`.
 * Do not call this from Front Office UI with status cancelled.
 */
export const setReservationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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

    const unitStatus = await supabaseAdmin
      .from("hotel_reservation_rooms")
      .update({ status: data.status })
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId);
    if (unitStatus.error && !isMissingSchemaError(unitStatus.error)) {
      throw new Error(unitStatus.error.message);
    }

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
    const agencyId = (bound.data as { travel_agent_master_id?: string | null } | null)
      ?.travel_agent_master_id;
    if (
      data.status === "cancelled" ||
      data.status === "confirmed" ||
      existing.status === "cancelled"
    ) {
      const { resyncGroupBlockInventoryForReservation } = await import("./groups.functions");
      await resyncGroupBlockInventoryForReservation(
        supabaseAdmin,
        me.id,
        data.restaurantId,
        data.reservationId,
      );
    }

    if (agencyId) {
      const { syncTravelAgentCommission } = await import("./guest-travel-agent-booking");
      const { notifyTravelAgentBookingEvent } =
        await import("./guest-travel-agent-detail.functions");
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
  .validator((input: unknown) =>
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
  .validator((input: unknown) =>
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
