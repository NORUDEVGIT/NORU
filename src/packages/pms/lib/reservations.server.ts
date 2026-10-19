/**
 * Reservation core — server-only helpers.
 *
 * Every helper re-derives the caller's membership from restaurant_users; a
 * restaurant id from the browser is only used to select which membership
 * applies. Reservations are owner/manager only in this phase.
 */
import { type AuthedCtx, type Membership } from "@/core/lib/workforce.server";
import { requireModuleRole } from "@/core/lib/module-access.server";
import { withPmsPackage } from "./pms-package.server";
import { isAllowedBookingStatusTransition, RESERVATION_MANAGE_ROLES } from "./reservation-dates";

/** Front Office operations: owners, managers and receptionists. */
export {
  RESERVATION_STATUSES,
  MANUAL_RESERVATION_STATUSES,
  BOOKING_STATUS_TRANSITIONS,
  RESERVATION_MANAGE_ROLES,
  canManageReservations,
  isAllowedBookingStatusTransition,
  nightsBetween,
  propertyToday,
} from "./reservation-dates";
export type { ReservationStatus, ManualReservationStatus } from "./reservation-dates";

export const RESERVATION_EVENT_TYPES = [
  "created",
  "confirmed",
  "amended",
  "cancelled",
  "room_assigned",
  "room_changed",
  "status_changed",
  "check_in",
  "check_out",
  "room_moved",
  "stay_extended",
  "stay_shortened",
  "stay_dates_changed",
  "no_show",
  "repriced",
  "expected_arrival_updated",
  "late_checkout_updated",
  "room_guest_added",
  "room_guest_removed",
  "room_primary_guest_changed",
  "external_reservation_created",
  "external_reservation_modified",
  "external_reservation_cancelled",
  "overbooked",
  "package_applied",
  "package_removed",
  "promotion_applied",
  "note_pinned",
  "trace_created",
  "trace_updated",
  "assignment_notes_updated",
  "rate_notes_updated",
] as const;
export type ReservationEventType = (typeof RESERVATION_EVENT_TYPES)[number];

/** Owner/manager membership for this property, or a hard failure. */
export async function requireReservationManager(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "front_office",
      RESERVATION_MANAGE_ROLES,
      "You don't have access to Front Office for this property.",
    ),
  );
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Reservation dates are plain property-local calendar dates, never instants. */
export function assertDateOnly(value: string, label: string): string {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be a valid date.`);
  }
  return value;
}

export function assertStayDates(
  arrival: string,
  departure: string,
): { arrival: string; departure: string } {
  assertDateOnly(arrival, "Arrival date");
  assertDateOnly(departure, "Departure date");
  if (departure <= arrival) {
    throw new Error("Departure must be after arrival.");
  }
  return { arrival, departure };
}

const DB_ERROR_MESSAGES: Record<string, string> = {
  INVALID_DATES: "Departure must be after arrival.",
  NO_AVAILABILITY: "No rooms of that type are available for those dates.",
  OVERBOOKING_NOT_ALLOWED: "Overbooking is turned off for this property.",
  OVERBOOKING_APPROVAL_REQUIRED:
    "No physical availability. Overbooking requires Owner or Manager authorization.",
  OVERBOOKING_REASON_REQUIRED: "A reason is required to overbook.",
  OVERBOOKING_LIMIT_REACHED: "This room type's overbooking limit cannot cover this stay.",
  OVERBOOKING_CONFIGURATION_INVALID:
    "Overbooking is enabled without a maximum or percentage limit.",
  ROOM_NOT_ASSIGNABLE:
    "That room can't be used — check it is active, available and of the reserved type.",
  ROOM_ALREADY_BOOKED: "That room is already booked or occupied for part of those dates.",
  RESERVATION_NOT_FOUND: "Reservation not found for this property.",
  RESERVATION_CANCELLED: "This reservation is cancelled. Restore it before amending.",
  INVALID_STATUS: "Invalid reservation status.",
  INVALID_TRANSITION: "That action isn't allowed for this reservation's current status.",
  INVALID_ROOM_UNITS: "A reservation can include at most 20 rooms.",
  INVALID_RESERVATION_MODE: "Choose a single reservation or a group reservation.",
  SINGLE_RESERVATION_ROOM_LIMIT: "A single reservation can include only one room.",
  GUEST_NOT_FOUND: "Guest not found for this property.",
  ROOM_GUEST_PRIMARY_CONFLICT: "A room can have only one primary occupant.",
  ROOM_GUEST_DUPLICATE: "That guest is already on this room.",
  ROOM_GUEST_NOT_FOUND: "That guest is not on this room.",
  ROOM_GUEST_PRIMARY_REQUIRED: "Choose another primary occupant before removing this guest.",
  ROOM_GUEST_HISTORICAL:
    "Occupants on a cancelled, checked-out, or no-show room cannot be changed.",
  OCCUPANT_CAPACITY: "This room already has a named guest for every booked adult and child.",
  INVALID_ROOM_GUEST_ACTION: "That room occupant action is not available.",
  ROOM_UNIT_MASTER_MISMATCH: "The first room must match the reservation stay.",
  OCCUPANCY_EXCEEDED: "That room type cannot hold this many guests.",
  ROOM_TYPE_NOT_FOUND: "Room type not found for this property.",
  MULTI_ROOM_AMEND_UNSUPPORTED:
    "Dates, room, occupancy, and rate plan cannot be changed while this reservation has more than one room.",
  ROOM_UNIT_REQUIRED: "Choose which room this action applies to.",
  CHECKIN_PROGRESS_UNIT_REQUIRED: "Check-in progress for this stay has to be stored on a room.",
  CHECKIN_AGREEMENT_UNIT_REQUIRED:
    "The registration agreement for this stay has to be stored on a room.",
  AGREEMENT_REQUIRED: "Publish a registration agreement before this stay can be signed.",
  AGREEMENT_ACK_REQUIRED: "Confirm each required acknowledgement before signing.",
  AGREEMENT_DRAFT_REQUIRED: "Create a guest agreement draft before publishing.",
  AGREEMENT_DRAFT_EXISTS: "Finish or publish the open guest agreement draft first.",
  AGREEMENT_PLACEHOLDER_UNKNOWN: "This agreement uses a placeholder that cannot be resolved.",
  AGREEMENT_PROPERTY_TIME_MISSING:
    "Set the property check-in and check-out times before publishing this agreement.",
  AGREEMENT_CONFIG_INVALID: "The guest agreement draft is incomplete.",
  AGREEMENT_VERSION_MISMATCH: "Sign the agreement version that is currently shown.",
  AGREEMENT_ALREADY_SIGNED:
    "This agreement version is already signed. Start a new signature instead of editing it.",
  AGREEMENT_NOT_READY: "Save the agreement acknowledgements before capturing a signature.",
  AGREEMENT_OPEN_DRAFT: "An unsigned agreement is already open for this room.",
  AGREEMENT_NOT_SIGNED: "This agreement is not signed yet.",
  AGREEMENT_GUEST_MISMATCH: "Sign this agreement for the guest on this room.",
  AGREEMENT_INSTANCE_IMMUTABLE: "A signed agreement cannot be changed.",
  AGREEMENT_VERSION_IMMUTABLE:
    "This agreement version can no longer be edited. Publish a new version.",
  ROOM_UNIT_NOT_FOUND: "That room is not on this reservation.",
  ROOM_REQUIRED: "Assign a room before completing check-in.",
  REASON_REQUIRED: "A reason is required for a room move.",
  SAME_ROOM: "The guest is already in that room.",
  DATES_UNCHANGED: "Choose a new arrival or departure date.",
  NOT_PAST_DUE: "Only past-due arrivals can be marked as a no-show.",
  INVALID_COMPANY_MASTER: "That Company master is not valid for this property.",
  INVALID_TRAVEL_AGENT_MASTER: "That Travel Agency master is not valid for this property.",
  DUAL_COMPANY_TA_NOT_ALLOWED: "This create path cannot bind Company and Travel Agency together.",
  PACKAGE_ALREADY_RESERVATION_SCOPED: "That package is already applied to the whole reservation.",
  PACKAGE_ALREADY_ROOM_SCOPED: "That package is already applied to a room on this reservation.",
  PACKAGE_CHARGE_BASIS_UNSUPPORTED: "Only a per-stay package can be applied.",
  PACKAGE_PRICE_INVALID: "That package does not have a valid price.",
  PACKAGE_STAY_WINDOW_MISMATCH: "That package is outside this stay.",
  PACKAGE_ROOM_TYPE_MISMATCH: "That package does not apply to this room type.",
  PACKAGE_RATE_PLAN_MISMATCH: "That package does not apply to this rate plan.",
  PACKAGE_INACTIVE: "That package is not active.",
  PACKAGE_NOT_FOUND: "Package not found for this property.",
  PACKAGE_ACTIVATION_NOT_FOUND: "Package activation not found.",
  PACKAGE_WRONG_PROPERTY: "That package belongs to another property.",
};

/** Generic Reservation status writer — booking-side allowlist only (DB03-B01). */
export function assertBookingStatusTransition(from: string, to: string): void {
  if (isAllowedBookingStatusTransition(from, to)) return;
  throw reservationError("INVALID_TRANSITION");
}

/** Turn RAISE EXCEPTION codes from the reservation functions into user-facing text. */
export function reservationError(message: string): Error {
  const limitDetail = message.split("OVERBOOKING_LIMIT_REACHED:")[1]?.trim();
  if (limitDetail) {
    const [name, date] = limitDetail.split(" for ");
    if (name && date) {
      return new Error(`${name} overbooking limit has been reached for ${date}.`);
    }
  }
  for (const [code, text] of Object.entries(DB_ERROR_MESSAGES)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}

/** Append-only history write; runs with the service role inside a handler. */
export async function recordReservationEvent(params: {
  restaurantId: string;
  reservationId: string;
  eventType: ReservationEventType;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  notes?: string | null;
  actorMembershipId: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("hotel_reservation_history").insert({
    restaurant_id: params.restaurantId,
    reservation_id: params.reservationId,
    event_type: params.eventType,
    previous_values: (params.previousValues ?? null) as never,
    new_values: (params.newValues ?? null) as never,
    notes: params.notes ?? null,
    actor_membership_id: params.actorMembershipId,
  });
}
