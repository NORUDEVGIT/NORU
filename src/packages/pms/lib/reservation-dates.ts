/** Client-safe reservation date helpers and shared literals. */

export const RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "checked_in",
  "checked_out",
  "no_show",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Statuses a manager can set directly; operational ones go through Front Office actions. */
export const MANUAL_RESERVATION_STATUSES = ["pending", "confirmed", "cancelled"] as const;
export type ManualReservationStatus = (typeof MANUAL_RESERVATION_STATUSES)[number];

/**
 * Booking-side transitions for `setReservationStatus` only.
 * Front Office owns checked_in / checked_out / no_show via gated steppers.
 *
 * Cancellation split (do not unify):
 * - Front Office desk (fees, room clear, operational audit) → `completeFoCancel`
 * - Reservation pre-arrival pending/confirmed (no FO fee path) → `setReservationStatus`
 */
export const BOOKING_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled"],
  cancelled: ["pending", "confirmed"],
} as const satisfies Record<
  ManualReservationStatus,
  readonly ManualReservationStatus[]
>;

export function isManualReservationStatus(status: string): status is ManualReservationStatus {
  return (MANUAL_RESERVATION_STATUSES as readonly string[]).includes(status);
}

/** True when from → to is an allowed generic booking-status mutation (same-status is not a transition). */
export function isAllowedBookingStatusTransition(from: string, to: string): boolean {
  if (from === to) return true;
  if (!isManualReservationStatus(from) || !isManualReservationStatus(to)) return false;
  return (BOOKING_STATUS_TRANSITIONS[from] as readonly string[]).includes(to);
}

/** Date helpers live in shared; re-exported so PMS call sites are unchanged. */
export {
  propertyToday,
  nightsBetween,
  addDays,
  formatStayDate,
} from "@/shared/lib/property-dates";
