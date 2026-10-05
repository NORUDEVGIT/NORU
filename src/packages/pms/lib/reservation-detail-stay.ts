import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { isStayRangeValid } from "@/packages/pms/lib/create-reservation-phase1";
import {
  preferenceFlagFromRequests,
  REVIEW_DASH,
} from "@/packages/pms/lib/create-reservation-review";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

export const STAY_NOTES_MAX = 500;

export const STAY_OCCASION_OPTIONS = [
  { value: "", label: "None" },
  { value: "birthday", label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "honeymoon", label: "Honeymoon" },
  { value: "other", label: "Other" },
] as const;

export const STAY_PICKUP_OPTIONS = [
  { value: "not_required", label: "Not Required" },
  { value: "required", label: "Required" },
] as const;

export type StayExtensionDraft = {
  id: string;
  from: string;
  to: string;
  status: "unsaved";
};

export type ReservationStayDraft = {
  arrival: string;
  departure: string;
  rooms: number;
  adults: number;
  children: number;
  infants: number;
  purposeOfStay: string;
  marketSegment: string;
  specialOccasion: string;
  expectedArrivalTime: string;
  expectedDepartureTime: string;
  transportDetails: string;
  pickupService: string;
  flexibleDates: boolean;
  allowEarlyCheckIn: boolean;
  allowLateCheckOut: boolean;
  earlyArrivalRequested: boolean;
  lateDepartureRequested: boolean;
  stayNotes: string;
  extensions: StayExtensionDraft[];
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

export function stayNights(arrival: string, departure: string): number {
  if (!arrival || !departure || departure <= arrival) return 0;
  return nightsBetween(arrival, departure);
}

export function stayRangeOk(arrival: string, departure: string): boolean {
  return isStayRangeValid(arrival, departure);
}

export function requestStatusLabel(requested: boolean): string {
  return requested ? "Requested" : "Not Requested";
}

export function buildStayDraft(reservation: ReservationDetail): ReservationStayDraft {
  const earlyFromNotes =
    preferenceFlagFromRequests(reservation.specialRequests, "early check") === "Yes";
  const lateFromNotes =
    preferenceFlagFromRequests(reservation.specialRequests, "late check") === "Yes";
  return {
    arrival: reservation.arrivalDate,
    departure: reservation.departureDate,
    rooms: reservation.roomsRequested ?? 1,
    adults: reservation.adults,
    children: reservation.children,
    infants: reservation.infants ?? 0,
    purposeOfStay: reservation.purposeOfStay ?? "",
    marketSegment: reservation.marketSegment ?? "",
    specialOccasion: "",
    expectedArrivalTime: clockFromInstant(reservation.expectedArrivalAt),
    expectedDepartureTime: clockFromInstant(reservation.lateCheckoutUntil),
    transportDetails: "",
    pickupService: "not_required",
    flexibleDates: false,
    allowEarlyCheckIn: earlyFromNotes,
    allowLateCheckOut: reservation.lateCheckoutGranted === true || lateFromNotes,
    earlyArrivalRequested: Boolean(reservation.expectedArrivalAt) || earlyFromNotes,
    lateDepartureRequested: reservation.lateCheckoutGranted === true || lateFromNotes,
    stayNotes: reservation.notes ?? "",
    extensions: [],
  };
}

export function nextStayExtension(departure: string): StayExtensionDraft {
  const from = departure;
  const toDate = new Date(`${departure}T00:00:00Z`);
  toDate.setUTCDate(toDate.getUTCDate() + 1);
  const to = toDate.toISOString().slice(0, 10);
  return {
    id: `local-${Date.now()}`,
    from,
    to,
    status: "unsaved",
  };
}

export function stayExtensionNights(from: string, to: string): string {
  const nights = stayNights(from, to);
  return nights > 0 ? String(nights) : REVIEW_DASH;
}
