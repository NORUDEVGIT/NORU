/**
 * Travel Agency booking-rule and commission helpers.
 * Consumed by createReservation / amend / status changes.
 * Does not create a second reservation or inventory pool.
 */
import { isMissingSchemaError } from "./pms-set2-structure";
import { nightsBetween } from "./reservation-dates";
import { propertyToday } from "./reservations.server";
import { recordGuestAccountEvent } from "./guests.server";
import {
  calculateCommissionAmount,
  type TravelAgentCommissionPlanType,
  type TravelAgentNotificationEvent,
} from "./guest-travel-agent-detail-workspace";

type Db = { from: (table: string) => any };

function unavailable(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && isMissingSchemaError(error));
}

export type TravelAgentRuleMaster = {
  id: string;
  name: string;
  email: string | null;
  booking_access: string | null;
  max_advance_booking_days: number | null;
  min_stay_nights: number | null;
  max_stay_nights: number | null;
  group_bookings_allowed: boolean | null;
};

export async function loadTravelAgentRuleMaster(
  db: Db,
  restaurantId: string,
  agencyId: string,
): Promise<TravelAgentRuleMaster | null> {
  const result = await db
    .from("guest_account_masters")
    .select(
      "id, name, email, booking_access, max_advance_booking_days, min_stay_nights, max_stay_nights, group_bookings_allowed",
    )
    .eq("restaurant_id", restaurantId)
    .eq("id", agencyId)
    .eq("account_type", "travel_agent")
    .maybeSingle();
  if (unavailable(result.error)) return null;
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("That Travel Agency could not be found.");
  return result.data as TravelAgentRuleMaster;
}

export function assertTravelAgentStayRules(options: {
  master: TravelAgentRuleMaster;
  arrival: string;
  departure: string;
  today: string;
  roomCount?: number;
}): void {
  if (options.master.booking_access === "restricted") {
    throw new Error("This travel agency is restricted from new bookings.");
  }
  const nights = nightsBetween(options.arrival, options.departure);
  if (options.master.min_stay_nights && nights < options.master.min_stay_nights) {
    throw new Error(`This travel agency requires a minimum stay of ${options.master.min_stay_nights} nights.`);
  }
  if (options.master.max_stay_nights && nights > options.master.max_stay_nights) {
    throw new Error(`This travel agency allows a maximum stay of ${options.master.max_stay_nights} nights.`);
  }
  if (options.master.max_advance_booking_days != null) {
    const start = Date.parse(`${options.arrival}T00:00:00.000Z`);
    const today = Date.parse(`${options.today}T00:00:00.000Z`);
    const lead = Math.round((start - today) / 86_400_000);
    if (lead > options.master.max_advance_booking_days) {
      throw new Error(
        `This travel agency can book at most ${options.master.max_advance_booking_days} days in advance.`,
      );
    }
  }
  if (options.master.group_bookings_allowed === false && (options.roomCount ?? 1) > 1) {
    throw new Error("Group bookings are disabled for this travel agency.");
  }
}

export async function assertTravelAgentAllowedRoomType(
  db: Db,
  restaurantId: string,
  agencyId: string,
  roomTypeId: string,
): Promise<void> {
  const allowed = await db
    .from("pms_agency_allowed_room_types")
    .select("room_type_id")
    .eq("restaurant_id", restaurantId)
    .eq("agency_master_id", agencyId);
  if (unavailable(allowed.error)) return;
  if (allowed.error) throw new Error(allowed.error.message);
  const ids = ((allowed.data ?? []) as Array<{ room_type_id: string }>).map((row) => row.room_type_id);
  if (ids.length === 0) return;
  if (!ids.includes(roomTypeId)) {
    throw new Error("That room type is not allowed for this travel agency.");
  }
}

export async function assertTravelAgentAllotmentCeiling(options: {
  db: Db;
  restaurantId: string;
  agencyId: string;
  roomTypeId: string;
  arrival: string;
  departure: string;
  rooms?: number;
  excludeReservationId?: string | null;
}): Promise<void> {
  const allotments = await options.db
    .from("pms_agency_allotments")
    .select("id, allocated_qty, start_date, end_date, release_days, status")
    .eq("restaurant_id", options.restaurantId)
    .eq("agency_master_id", options.agencyId)
    .eq("room_type_id", options.roomTypeId)
    .eq("status", "active");
  if (unavailable(allotments.error)) return;
  if (allotments.error) throw new Error(allotments.error.message);
  const rows = (allotments.data ?? []) as Array<{
    allocated_qty: number;
    start_date: string;
    end_date: string;
    release_days: number;
  }>;
  const covering = rows.filter(
    (row) => row.start_date <= options.arrival && row.end_date >= options.departure,
  );
  if (covering.length === 0) return;
  const today = propertyToday("UTC");
  const arrivalMs = Date.parse(`${options.arrival}T00:00:00.000Z`);
  const todayMs = Date.parse(`${today}T00:00:00.000Z`);
  const daysUntilArrival = Math.round((arrivalMs - todayMs) / 86_400_000);
  const stillCapped = covering.filter((row) => daysUntilArrival > row.release_days);
  if (stillCapped.length === 0) return;
  const cap = Math.min(...stillCapped.map((row) => row.allocated_qty));
  let existing = options.db
    .from("hotel_reservations")
    .select("id")
    .eq("restaurant_id", options.restaurantId)
    .eq("travel_agent_master_id", options.agencyId)
    .eq("room_type_id", options.roomTypeId)
    .in("status", ["pending", "confirmed", "checked_in"])
    .lt("arrival_date", options.departure)
    .gt("departure_date", options.arrival);
  if (options.excludeReservationId) existing = existing.neq("id", options.excludeReservationId);
  const used = await existing;
  if (used.error) throw new Error(used.error.message);
  const count = (used.data ?? []).length + (options.rooms ?? 1);
  if (count > cap) {
    throw new Error(`This travel agency's allotment for that room type is ${cap} rooms.`);
  }
}

export async function enforceTravelAgentBooking(options: {
  db: Db;
  restaurantId: string;
  agencyId: string;
  arrival: string;
  departure: string;
  roomTypeId: string;
  rooms?: number;
  excludeReservationId?: string | null;
}): Promise<TravelAgentRuleMaster | null> {
  const master = await loadTravelAgentRuleMaster(options.db, options.restaurantId, options.agencyId);
  if (!master) return null;
  assertTravelAgentStayRules({
    master,
    arrival: options.arrival,
    departure: options.departure,
    today: propertyToday("UTC"),
    roomCount: options.rooms,
  });
  await assertTravelAgentAllowedRoomType(options.db, options.restaurantId, options.agencyId, options.roomTypeId);
  await assertTravelAgentAllotmentCeiling(options);
  return master;
}

export async function syncTravelAgentCommission(options: {
  db: Db;
  restaurantId: string;
  reservationId: string;
  actorMembershipId: string | null;
  voidEntry?: boolean;
}): Promise<void> {
  const reservation = await options.db
    .from("hotel_reservations")
    .select("id, travel_agent_master_id, room_subtotal, currency, arrival_date, status")
    .eq("restaurant_id", options.restaurantId)
    .eq("id", options.reservationId)
    .maybeSingle();
  if (unavailable(reservation.error) || !reservation.data) return;
  if (reservation.error) throw new Error(reservation.error.message);
  const agencyId = reservation.data.travel_agent_master_id as string | null;
  if (!agencyId) return;
  if (options.voidEntry || reservation.data.status === "cancelled" || reservation.data.status === "no_show") {
    const existing = await options.db
      .from("pms_agency_commission_entries")
      .select("id")
      .eq("restaurant_id", options.restaurantId)
      .eq("reservation_id", options.reservationId)
      .maybeSingle();
    if (unavailable(existing.error)) return;
    if (existing.data) {
      await options.db
        .from("pms_agency_commission_entries")
        .update({ status: "void" })
        .eq("id", existing.data.id)
        .eq("restaurant_id", options.restaurantId);
      await recordGuestAccountEvent({
        restaurantId: options.restaurantId,
        masterId: agencyId,
        eventType: "commission_updated",
        newValues: { reservationId: options.reservationId, status: "void" },
        actorMembershipId: options.actorMembershipId,
      });
    }
    return;
  }
  const plans = await options.db
    .from("pms_agency_commission_plans")
    .select("id, commission_type, rate_value, currency, effective_on, expires_on, active")
    .eq("restaurant_id", options.restaurantId)
    .eq("agency_master_id", agencyId)
    .eq("active", true)
    .order("effective_on", { ascending: false });
  if (unavailable(plans.error)) return;
  if (plans.error) throw new Error(plans.error.message);
  const stayDate = String(reservation.data.arrival_date);
  const plan = ((plans.data ?? []) as Array<{
    id: string;
    commission_type: TravelAgentCommissionPlanType;
    rate_value: number;
    currency: string;
    effective_on: string;
    expires_on: string | null;
  }>).find((row) => row.effective_on <= stayDate && (!row.expires_on || row.expires_on >= stayDate));
  if (!plan) return;
  const basis = Number(reservation.data.room_subtotal ?? 0);
  const amount = calculateCommissionAmount({
    type: plan.commission_type,
    rateValue: Number(plan.rate_value),
    basisAmount: basis,
  });
  const payload = {
    restaurant_id: options.restaurantId,
    agency_master_id: agencyId,
    reservation_id: options.reservationId,
    plan_id: plan.id,
    basis_amount: basis,
    amount,
    currency: String(reservation.data.currency || plan.currency || "ETB"),
    status: "calculated",
  };
  const existing = await options.db
    .from("pms_agency_commission_entries")
    .select("id, status")
    .eq("restaurant_id", options.restaurantId)
    .eq("reservation_id", options.reservationId)
    .maybeSingle();
  if (unavailable(existing.error)) return;
  if (existing.data?.status === "settled") return;
  if (existing.data) {
    await options.db
      .from("pms_agency_commission_entries")
      .update(payload)
      .eq("id", existing.data.id)
      .eq("restaurant_id", options.restaurantId);
  } else {
    await options.db.from("pms_agency_commission_entries").insert(payload);
  }
  await recordGuestAccountEvent({
    restaurantId: options.restaurantId,
    masterId: agencyId,
    eventType: existing.data ? "commission_updated" : "commission_calculated",
    newValues: { reservationId: options.reservationId, amount },
    actorMembershipId: options.actorMembershipId,
  });
}

export async function travelAgentNotificationEnabled(
  db: Db,
  restaurantId: string,
  agencyId: string,
  eventKey: TravelAgentNotificationEvent,
): Promise<boolean> {
  const pref = await db
    .from("pms_agency_notification_prefs")
    .select("enabled")
    .eq("restaurant_id", restaurantId)
    .eq("agency_master_id", agencyId)
    .eq("event_key", eventKey)
    .eq("channel", "email")
    .maybeSingle();
  if (unavailable(pref.error) || pref.error) return false;
  return Boolean(pref.data?.enabled);
}
