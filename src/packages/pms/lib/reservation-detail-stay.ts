import { shiftMoment } from "@/core/lib/workforce-rules";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { NOTE_MAX } from "@/packages/pms/lib/reservation-detail-notes";
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
