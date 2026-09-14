/**
 * Guest Profile Module — Wave 3 helpers (Stay History, honest KPIs, quick actions).
 *
 * Presentation + derivation only. Persistence stays on hotel_reservations /
 * guest_folios via guests.functions — no second stay store, no invented rows.
 */

import { nightsBetween } from "../../../shared/lib/property-dates.ts";
import type { ReservationStatus } from "./reservation-dates.ts";

export const GUEST_RESERVATIONS_HREF = "/restaurant/pms/reservations";
export const GUEST_FRONT_OFFICE_HREF = "/restaurant/pms/front-office";
export const GUEST_CASHIERING_HREF = "/restaurant/pms/cashiering";

export const WAVE3_STAY_HISTORY_EMPTY =
  "No stays yet for this guest. Stay history lists real reservations only — this card does not invent stays.";

export const WAVE3_DASHBOARD_CONTEXT = "This guest's overview";
export const WAVE3_STAY_HISTORY_CONTEXT = "This guest's stays";

export const WAVE3_PROFILE_HISTORY_COPY =
  "Profile activity for this guest. This is not stay history.";

export function wave3StayHistoryEmpty(fullName: string): string {
  const name = fullName.trim();
  return name
    ? `No stays yet for ${name}. Stay history lists real reservations only — this card does not invent stays.`
    : WAVE3_STAY_HISTORY_EMPTY;
}

export const WAVE3_KPI_NOT_AVAILABLE = "Not available";

export const WAVE3_RESERVATION_RLS_BLOCKED =
  "Guest Profile cannot read hotel_reservations under current RLS. Flag Abel — do not weaken RLS.";

export const WAVE3_ROOM_UNASSIGNED = "Unassigned";
export const WAVE3_QUOTED_ROOM_TOTAL_LABEL = "Quoted room total";
export const WAVE3_POSTED_FOLIO_LABEL = "Posted folio balance";

export const WAVE3_ACCEPTANCE_CRITERIA = [
  "AC-W3-1",
  "AC-W3-2",
  "AC-W3-3",
  "AC-W3-4",
  "AC-W3-5",
  "AC-W3-6",
  "AC-W3-7",
  "AC-W3-8",
  "AC-W3-9",
  "AC-W3-10",
  "AC-W3-11",
  "AC-W3-12",
  "AC-W3-13",
  "AC-W3-14",
  "AC-W3-15",
  "AC-W3-16",
  "AC-W3-17",
] as const;

export const OCCUPIED_STAY_STATUSES = ["checked_in", "checked_out"] as const;
export const UPCOMING_STAY_STATUSES = ["pending", "confirmed"] as const;

export type GuestStay = {
  id: string;
  confirmationNumber: string;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  status: ReservationStatus;
  roomId: string | null;
  roomTypeName: string;
  roomNumber: string | null;
  roomSubtotal: number | null;
  currency: string | null;
  folioId: string | null;
  folioNumber: string | null;
  folioBalance: number | null;
};

export type GuestStayAccess = {
  reservation: boolean;
  frontOffice: boolean;
  folio: boolean;
};

export type QuickActionState = "enabled" | "disabled" | "hidden";

export type KnownMoney = {
  amount: number;
  currency: string | null;
  fromCount: number;
};

export type GuestStayOverview = {
  stayCount: number;
  nightCount: number;
  lastStay: {
    confirmationNumber: string;
    arrivalDate: string;
    departureDate: string;
  } | null;
  inHouseCount: number;
  upcomingCount: number;
  roomTotal: KnownMoney | null;
  folioOutstanding: KnownMoney | null;
  featuredStay: GuestStay | null;
  access: GuestStayAccess;
};

export function reservationHref(reservationId: string): string {
  return `${GUEST_RESERVATIONS_HREF}/${reservationId}`;
}

export function frontOfficeHref(tab?: "arrivals" | "inhouse"): string {
  return tab ? `${GUEST_FRONT_OFFICE_HREF}?tab=${tab}` : GUEST_FRONT_OFFICE_HREF;
}

export function folioHref(folioNumber?: string | null): string {
  const path = `${GUEST_CASHIERING_HREF}?tab=folios`;
  return folioNumber ? `${path}&folio=${encodeURIComponent(folioNumber)}` : path;
}

export function isReservationRlsBlocked(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "42501" || error.code === "PGRST301") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("42501")
  );
}

export function isInHouseStay(status: ReservationStatus): boolean {
  return status === "checked_in";
}

export function isCompletedStay(status: ReservationStatus): boolean {
  return status === "checked_out";
}

export function isUpcomingStay(status: ReservationStatus, arrivalDate: string, today: string): boolean {
  return (UPCOMING_STAY_STATUSES as readonly string[]).includes(status) && arrivalDate >= today;
}

export function stayRoomNumberLabel(stay: Pick<GuestStay, "roomId" | "roomNumber">): string {
  return stay.roomId && stay.roomNumber ? stay.roomNumber : WAVE3_ROOM_UNASSIGNED;
}

export function mapReservationToStay(row: {
  id: string;
  confirmationNumber: string;
  arrivalDate: string;
  departureDate: string;
  status: ReservationStatus;
  roomId?: string | null;
  roomTypeName?: string | null;
  roomNumber?: string | null;
  roomSubtotal?: number | null;
  currency?: string | null;
  folioId?: string | null;
  folioNumber?: string | null;
  folioBalance?: number | null;
}): GuestStay {
  return {
    id: row.id,
    confirmationNumber: row.confirmationNumber,
    arrivalDate: row.arrivalDate,
    departureDate: row.departureDate,
    nights: nightsBetween(row.arrivalDate, row.departureDate),
    status: row.status,
    roomId: row.roomId ?? null,
    roomTypeName: row.roomTypeName?.trim() || "Room type",
    roomNumber: row.roomNumber ?? null,
    roomSubtotal:
      row.roomSubtotal === null || row.roomSubtotal === undefined ? null : Number(row.roomSubtotal),
    currency: row.currency ?? null,
    folioId: row.folioId ?? null,
    folioNumber: row.folioNumber ?? null,
    folioBalance:
      row.folioBalance === null || row.folioBalance === undefined ? null : Number(row.folioBalance),
  };
}

/** Sum only stored amounts. Missing values are omitted — never treated as 0. */
export function knownMoneyTotal(
  rows: Array<{ amount: number | null; currency?: string | null }>,
): KnownMoney | null {
  const known = rows.filter(
    (row): row is { amount: number; currency?: string | null } =>
      row.amount !== null && Number.isFinite(row.amount),
  );
  if (known.length === 0) return null;
  const currency = known.find((row) => row.currency)?.currency ?? null;
  const amount = Math.round(known.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  return { amount, currency, fromCount: known.length };
}

export function pickFeaturedStay(stays: GuestStay[], today: string): GuestStay | null {
  const inHouse = stays.filter((stay) => isInHouseStay(stay.status));
  if (inHouse.length > 0) {
    return [...inHouse].sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate))[0] ?? null;
  }
  const upcoming = stays.filter((stay) => isUpcomingStay(stay.status, stay.arrivalDate, today));
  if (upcoming.length === 0) return null;
  return [...upcoming].sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate))[0] ?? null;
}

export function deriveStayOverview(
  stays: GuestStay[],
  today: string,
  access: GuestStayAccess,
): GuestStayOverview {
  const nightCount = stays.reduce((sum, stay) => sum + stay.nights, 0);
  const completed = stays
    .filter((stay) => isCompletedStay(stay.status))
    .sort((a, b) => b.departureDate.localeCompare(a.departureDate));
  const last = completed[0] ?? null;
  const roomTotal = knownMoneyTotal(
    stays.map((stay) => ({ amount: stay.roomSubtotal, currency: stay.currency })),
  );
  const folioOutstanding = access.folio
    ? knownMoneyTotal(
        stays
          .filter((stay) => stay.folioId)
          .map((stay) => ({ amount: stay.folioBalance, currency: stay.currency })),
      )
    : null;

  return {
    stayCount: stays.length,
    nightCount,
    lastStay: last
      ? {
          confirmationNumber: last.confirmationNumber,
          arrivalDate: last.arrivalDate,
          departureDate: last.departureDate,
        }
      : null,
    inHouseCount: stays.filter((stay) => isInHouseStay(stay.status)).length,
    upcomingCount: stays.filter((stay) => isUpcomingStay(stay.status, stay.arrivalDate, today)).length,
    roomTotal,
    folioOutstanding,
    featuredStay: pickFeaturedStay(stays, today),
    access,
  };
}

export function stayQuickActions(
  stay: GuestStay,
  access: GuestStayAccess,
  today: string,
): { reservation: QuickActionState; frontOffice: QuickActionState; folio: QuickActionState } {
  const operational = isInHouseStay(stay.status) || isUpcomingStay(stay.status, stay.arrivalDate, today);
  return {
    reservation: access.reservation ? "enabled" : "hidden",
    frontOffice: access.frontOffice ? (operational ? "enabled" : "disabled") : "hidden",
    folio: access.folio ? (stay.folioId ? "enabled" : "disabled") : "hidden",
  };
}

export function frontOfficeTabForStay(stay: GuestStay): "arrivals" | "inhouse" {
  return isInHouseStay(stay.status) ? "inhouse" : "arrivals";
}
