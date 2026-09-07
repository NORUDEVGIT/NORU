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

/** Date helpers live in shared; re-exported so PMS call sites are unchanged. */
export {
  propertyToday,
  nightsBetween,
  addDays,
  formatStayDate,
} from "@/shared/lib/property-dates";
