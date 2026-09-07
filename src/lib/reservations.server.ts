/**
 * Reservation core — server-only helpers.
 *
 * Every helper re-derives the caller's membership from restaurant_users; a
 * restaurant id from the browser is only used to select which membership
 * applies. Reservations are owner/manager only in this phase.
 */
import { type AuthedCtx, type Membership } from "./workforce.server";
import { requireModuleRole } from "./module-access.server";
import { withPmsPackage } from "./pms-package.server";

/** Front Office operations: owners, managers and receptionists. */
export const RESERVATION_MANAGE_ROLES = ["owner", "manager", "receptionist"] as const;

export {
  RESERVATION_STATUSES,
  MANUAL_RESERVATION_STATUSES,
  nightsBetween,
  propertyToday,
} from "./reservation-dates";
export type { ReservationStatus } from "./reservation-dates";

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
  "no_show",
  "repriced",
] as const;
export type ReservationEventType = (typeof RESERVATION_EVENT_TYPES)[number];

export function canManageReservations(role: string): boolean {
  return (RESERVATION_MANAGE_ROLES as readonly string[]).includes(role);
}

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
  ROOM_NOT_ASSIGNABLE:
    "That room can't be used — check it is active, available and of the reserved type.",
  ROOM_ALREADY_BOOKED: "That room is already booked or occupied for part of those dates.",
  RESERVATION_NOT_FOUND: "Reservation not found for this property.",
  RESERVATION_CANCELLED: "This reservation is cancelled. Restore it before amending.",
  INVALID_STATUS: "Invalid reservation status.",
  INVALID_TRANSITION: "That action isn't allowed for this reservation's current status.",
  ROOM_REQUIRED: "Assign a room before completing check-in.",
  REASON_REQUIRED: "A reason is required for a room move.",
  SAME_ROOM: "The guest is already in that room.",
  DATES_UNCHANGED: "Pick a different departure date.",
  NOT_PAST_DUE: "Only past-due arrivals can be marked as a no-show.",
};

/** Turn RAISE EXCEPTION codes from the reservation functions into user-facing text. */
export function reservationError(message: string): Error {
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
