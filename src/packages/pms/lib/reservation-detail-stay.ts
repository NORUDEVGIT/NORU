import { shiftMoment } from "@/core/lib/workforce-rules";
import { addDays, nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { isGroupReservation } from "@/packages/pms/lib/reservation-detail-group";
import { NOTE_MAX } from "@/packages/pms/lib/reservation-detail-notes";
import {
  isClosedReservation,
  reservationMutationBlock,
} from "@/packages/pms/lib/reservation-lifecycle";
import type { StayAmendmentResult } from "@/packages/pms/lib/reservation-stay-amendment";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

/** Same ceiling as Internal Notes (`notes` max on amend). Not a database check. */
export const STAY_NOTES_MAX = NOTE_MAX;

export type ReservationStayDraft = {
  adults: number;
  children: number;
  infants: number;
  purposeOfStay: string;
  stayNotes: string;
  arrivalTransport: string;
  pickupNote: string;
};

export function clockFromInstant(iso: string | null | undefined): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/T(\d{2}:\d{2})/);
  if (match?.[1]) return match[1];
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function stayClockForInput(iso: string | null, timezone: string): string {
  if (!iso) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const hour = parts.find((part) => part.type === "hour")?.value ?? "12";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export function stayInstantFromClock(date: string, clock: string, timezone: string): string {
  return shiftMoment(date, clock, timezone).toISOString();
}

export function stayAmendmentCopy(
  result: StayAmendmentResult,
  money: (value: number) => string,
): string {
  const nights = `${result.previousNights} to ${result.nextNights} nights`;
  const party = `adults ${result.previousAdults} to ${result.nextAdults}, children ${result.previousChildren} to ${result.nextChildren}, infants ${result.previousInfants} to ${result.nextInfants}`;
  if (
    result.previousRoomSubtotal == null ||
    result.nextRoomSubtotal == null ||
    result.roomSubtotalDelta == null
  ) {
    return `${nights}. ${party}. Room subtotal was not returned.`;
  }
  return `${nights}. ${party}. Room subtotal ${money(result.previousRoomSubtotal)} to ${money(result.nextRoomSubtotal)} (${result.currency ?? ""} ${result.roomSubtotalDelta}).`;
}

export function stayNights(arrival: string, departure: string): number {
  if (!arrival || !departure || departure <= arrival) return 0;
  return nightsBetween(arrival, departure);
}

export const IN_HOUSE_STAY_OWNED_BY_FO =
  "This stay is currently in-house. Stay changes are managed from Front Office.";

export type StayCoreDraft = {
  arrival: string;
  departure: string;
  nights: number;
  rooms: number;
};

function unitIsActive(status: string | null | undefined): boolean {
  return status !== "cancelled" && status !== "no_show";
}

export function stayActiveRoomCount(reservation: ReservationDetail): number {
  const units = (reservation.rooms ?? []).filter((unit) => unitIsActive(unit.status));
  if (units.length > 0) return units.length;
  return Math.max(1, reservation.roomsRequested || 1);
}

export function stayHasInHouseUnit(reservation: ReservationDetail): boolean {
  if (reservation.status === "checked_in") return true;
  return (reservation.rooms ?? []).some((unit) => unit.status === "checked_in");
}

export function stayCoreAmendable(input: {
  reservation: ReservationDetail;
  businessDate: string;
  canManage: boolean;
}): boolean {
  const { reservation, businessDate, canManage } = input;
  if (!canManage) return false;
  if (isClosedReservation(reservation.status)) return false;
  if (stayHasInHouseUnit(reservation)) return false;
  if (reservation.status !== "pending" && reservation.status !== "confirmed") return false;
  return (
    reservationMutationBlock({
      status: reservation.status,
      arrivalDate: reservation.arrivalDate,
      businessDate,
    }) == null
  );
}

export function stayDatesAmendable(input: {
  reservation: ReservationDetail;
  businessDate: string;
  canManage: boolean;
}): boolean {
  if (!stayCoreAmendable(input)) return false;
  return stayActiveRoomCount(input.reservation) <= 1 && !isGroupReservation(input.reservation);
}

export function stayRoomsAmendable(input: {
  reservation: ReservationDetail;
  businessDate: string;
  canManage: boolean;
}): boolean {
  if (!stayCoreAmendable(input)) return false;
  return (input.reservation.rooms ?? []).every(
    (unit) =>
      !unitIsActive(unit.status) || unit.status === "pending" || unit.status === "confirmed",
  );
}

export function buildStayCoreDraft(reservation: ReservationDetail): StayCoreDraft {
  const nights = stayNights(reservation.arrivalDate, reservation.departureDate);
  return {
    arrival: reservation.arrivalDate,
    departure: reservation.departureDate,
    nights: Math.max(1, nights),
    rooms: stayActiveRoomCount(reservation),
  };
}

export function applyStayArrival(draft: StayCoreDraft, arrival: string): StayCoreDraft {
  if (!arrival) return draft;
  const nights = Math.max(1, draft.nights);
  return { ...draft, arrival, nights, departure: addDays(arrival, nights) };
}

export function applyStayDeparture(draft: StayCoreDraft, departure: string): StayCoreDraft {
  if (!departure || departure <= draft.arrival) {
    return { ...draft, departure: addDays(draft.arrival, 1), nights: 1 };
  }
  return {
    ...draft,
    departure,
    nights: Math.max(1, nightsBetween(draft.arrival, departure)),
  };
}

export function applyStayNights(draft: StayCoreDraft, nights: number): StayCoreDraft {
  const next = Math.max(1, Math.floor(nights) || 1);
  return { ...draft, nights: next, departure: addDays(draft.arrival, next) };
}

export function stayCoreDirty(original: StayCoreDraft, draft: StayCoreDraft): boolean {
  return (
    original.arrival !== draft.arrival ||
    original.departure !== draft.departure ||
    original.nights !== draft.nights ||
    original.rooms !== draft.rooms
  );
}

export function buildStayDraft(reservation: ReservationDetail): ReservationStayDraft {
  return {
    adults: reservation.adults,
    children: reservation.children,
    infants: reservation.infants ?? 0,
    purposeOfStay: reservation.purposeOfStay ?? "",
    stayNotes: reservation.notes ?? "",
    arrivalTransport: reservation.arrivalTransport ?? "",
    pickupNote: reservation.pickupNote ?? "",
  };
}
