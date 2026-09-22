/**
 * Guest Profile — unified Stays & Reservations helpers.
 * Presentation only. Rows come from hotel_reservations via listGuestStays.
 */
import {
  OCCUPIED_STAY_STATUSES,
  pickFeaturedStay,
  type GuestStay,
  type GuestStayAccess,
  type QuickActionState,
} from "./guest-profile-wave3.ts";
import { RESERVATION_STATUSES, type ReservationStatus } from "./reservation-dates.ts";

export const GUEST_BOOKINGS_TITLE = "Stays & Reservations";
export const GUEST_BOOKINGS_COPY =
  "Show the guest's reservation and stay history at the property.";
export const GUEST_BOOKINGS_EMPTY = "No bookings yet";
export const GUEST_BOOKINGS_SELECT_EMPTY = "Select a reservation to view details.";
export const GUEST_BOOKINGS_ACTIVE_EMPTY = "No current or upcoming reservation";
export const GUEST_NEW_RESERVATION_PATH = "/restaurant/bookings/new";
export const GUEST_SERVICES_HREF = "/restaurant/pms/guest-services";
export const GUEST_BOOKINGS_PAGE_SIZE = 25;

export const BOOKING_TIMELINE_LABELS: Record<string, string> = {
  created: "Reservation Created",
  confirmed: "Confirmed",
  amended: "Amended",
  cancelled: "Cancelled",
  room_assigned: "Room Assigned",
  room_changed: "Room Changed",
  status_changed: "Status Changed",
  check_in: "Checked In",
  check_out: "Checked Out",
  room_moved: "Room Moved",
  stay_extended: "Stay Extended",
  stay_shortened: "Stay Shortened",
  stay_dates_changed: "Stay Dates Changed",
  no_show: "No Show",
  repriced: "Repriced",
};

export type GuestBookingHistoryEvent = {
  id: string;
  eventKind: string;
  label: string;
  createdAt: string;
  notes: string | null;
};

export type GuestBookingFilters = {
  search: string;
  status: ReservationStatus | "all";
  from: string;
  to: string;
};

export type BookingRowActions = {
  view: QuickActionState;
  modify: QuickActionState;
  checkIn: QuickActionState;
  checkOut: QuickActionState;
  cancel: QuickActionState;
  folio: QuickActionState;
};

export function pickActiveBooking(stays: GuestStay[], today: string): GuestStay | null {
  return pickFeaturedStay(stays, today);
}

export function stayNumberForBooking(stay: Pick<GuestStay, "confirmationNumber" | "status">): string {
  return (OCCUPIED_STAY_STATUSES as readonly string[]).includes(stay.status)
    ? stay.confirmationNumber
    : "";
}

export function bookingTimelineLabel(eventKind: string): string {
  return BOOKING_TIMELINE_LABELS[eventKind] ?? eventKind.replace(/_/g, " ");
}

export function isModifiableBooking(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed";
}

export function isCancellableBooking(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed";
}

export function isCheckInEligible(status: ReservationStatus): boolean {
  return status === "confirmed";
}

export function isCheckOutEligible(status: ReservationStatus): boolean {
  return status === "checked_in";
}

export function bookingRowActions(
  stay: GuestStay | null,
  access: GuestStayAccess,
): BookingRowActions {
  if (!stay) {
    return {
      view: "hidden",
      modify: "hidden",
      checkIn: "hidden",
      checkOut: "hidden",
      cancel: "hidden",
      folio: access.folio ? "disabled" : "hidden",
    };
  }

  const view: QuickActionState = access.reservation ? "enabled" : "hidden";
  const modify: QuickActionState = access.reservation
    ? isModifiableBooking(stay.status)
      ? "enabled"
      : "hidden"
    : "hidden";
  const checkIn: QuickActionState = access.frontOffice
    ? isCheckInEligible(stay.status)
      ? "enabled"
      : "hidden"
    : "hidden";
  const checkOut: QuickActionState = access.frontOffice
    ? isCheckOutEligible(stay.status)
      ? "enabled"
      : "hidden"
    : "hidden";
  const cancel: QuickActionState = access.frontOffice
    ? isCancellableBooking(stay.status)
      ? "enabled"
      : "hidden"
    : "hidden";
  const folio: QuickActionState = access.folio
    ? stay.folioId && stay.folioNumber
      ? "enabled"
      : "disabled"
    : "hidden";

  return { view, modify, checkIn, checkOut, cancel, folio };
}

function haystack(stay: GuestStay): string {
  return [
    stay.confirmationNumber,
    stay.roomNumber,
    stay.roomTypeName,
    stay.ratePlanName,
    stay.sourceLabel,
    stay.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function datesOverlap(stay: GuestStay, from: string, to: string): boolean {
  if (from && stay.departureDate < from) return false;
  if (to && stay.arrivalDate > to) return false;
  return true;
}

export function filterGuestBookings(stays: GuestStay[], filters: GuestBookingFilters): GuestStay[] {
  const search = filters.search.trim().toLowerCase();
  const status = filters.status;
  return stays.filter((stay) => {
    if (status !== "all" && stay.status !== status) return false;
    if (!datesOverlap(stay, filters.from, filters.to)) return false;
    if (search && !haystack(stay).includes(search)) return false;
    return true;
  });
}

export function paginateGuestBookings<T>(rows: T[], page: number, pageSize = GUEST_BOOKINGS_PAGE_SIZE): T[] {
  const start = Math.max(0, (page - 1) * pageSize);
  return rows.slice(start, start + pageSize);
}

export function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function guestBookingsCsv(stays: GuestStay[]): string {
  const header = [
    "id",
    "confirmation",
    "stay_no",
    "arrival",
    "departure",
    "nights",
    "room_type",
    "room",
    "rate_plan",
    "status",
    "source",
    "quoted_total",
    "currency",
  ].join(",");
  const lines = stays.map((stay) =>
    [
      csvCell(stay.id),
      csvCell(stay.confirmationNumber),
      csvCell(stayNumberForBooking(stay)),
      csvCell(stay.arrivalDate),
      csvCell(stay.departureDate),
      csvCell(stay.nights),
      csvCell(stay.roomTypeName),
      csvCell(stay.roomNumber),
      csvCell(stay.ratePlanName),
      csvCell(stay.status),
      csvCell(stay.sourceLabel),
      csvCell(stay.roomSubtotal),
      csvCell(stay.currency),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

export function newReservationHref(guestId: string): string {
  return `${GUEST_NEW_RESERVATION_PATH}?guestId=${encodeURIComponent(guestId)}`;
}

export function uniqueBookingIds(stays: GuestStay[]): string[] {
  return [...new Set(stays.map((stay) => stay.id))];
}

export { RESERVATION_STATUSES };
