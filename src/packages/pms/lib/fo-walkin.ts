/**
 * FO Phase 5 — Walk-in desk helpers (pure).
 * Capture still uses createReservation + startWalkInCheckIn + FoCheckInStepper.
 */
import type { ReservationStatus } from "./reservation-dates.ts";
import type { FoArrivalActionHints } from "./fo-arrival.ts";

export const FO_WALKIN_EXCEPTION_KEYS = [
  "missing_guest_data",
  "unassigned",
  "room_not_ready",
  "room_unavailable",
  "pricing_unavailable",
  "payment_issue",
  "registration_incomplete",
  "check_in_blocker",
] as const;

export type FoWalkInExceptionKey = (typeof FO_WALKIN_EXCEPTION_KEYS)[number];

export const FO_WALKIN_EXCEPTION_LABELS: Record<FoWalkInExceptionKey, string> = {
  missing_guest_data: "Missing guest data",
  unassigned: "No assigned room",
  room_not_ready: "Room not ready",
  room_unavailable: "No eligible / unavailable room",
  pricing_unavailable: "Pricing unavailable",
  payment_issue: "Deposit outstanding",
  registration_incomplete: "Registration incomplete",
  check_in_blocker: "Check-in blocker",
};

export type FoWalkInActionId =
  | "open_reservation"
  | "assign"
  | "check_in"
  | "amend_stay"
  | "cancel"
  | "open_guest"
  | "open_folio";

export function foWalkInExceptionKeys(params: {
  missingGuest: boolean;
  assigned: boolean;
  roomEligible: boolean;
  roomReady: boolean;
  priced: boolean;
  depositOk: boolean;
  registrationOk: boolean;
  canComplete: boolean;
  status: ReservationStatus;
}): FoWalkInExceptionKey[] {
  const keys: FoWalkInExceptionKey[] = [];
  if (params.missingGuest) keys.push("missing_guest_data");
  if (!params.assigned) keys.push("unassigned");
  if (params.assigned && !params.roomEligible) keys.push("room_unavailable");
  if (params.assigned && params.roomEligible && !params.roomReady) keys.push("room_not_ready");
  if (!params.priced) keys.push("pricing_unavailable");
  if (!params.depositOk) keys.push("payment_issue");
  if (!params.registrationOk) keys.push("registration_incomplete");
  if (params.status === "confirmed" && !params.canComplete) keys.push("check_in_blocker");
  return keys;
}

export function walkInMenuItems(params: {
  status: ReservationStatus;
  hints: FoArrivalActionHints;
}): { id: FoWalkInActionId; label: string }[] {
  const items: { id: FoWalkInActionId; label: string }[] = [{ id: "open_reservation", label: "Open Reservation" }];
  if (params.status === "checked_in") {
    if (params.hints.canViewGuest) items.push({ id: "open_guest", label: "Open Guest Profile" });
    if (params.hints.canOpenFolio) items.push({ id: "open_folio", label: "Open Folio" });
    return items;
  }
  if (params.status === "pending" || params.status === "confirmed") {
    if (params.hints.canAssignRoom) items.push({ id: "assign", label: "Assign Room" });
    if (params.hints.canOpenCheckIn) items.push({ id: "check_in", label: "Check In" });
    items.push({ id: "amend_stay", label: "Amend Stay" });
    items.push({ id: "cancel", label: "Cancel" });
    if (params.hints.canViewGuest) items.push({ id: "open_guest", label: "Open Guest Profile" });
    if (params.hints.canOpenFolio) items.push({ id: "open_folio", label: "Open Folio" });
  }
  return items;
}

export function isOperationalWalkIn(params: {
  source: string | null | undefined;
  status: ReservationStatus;
  arrivalDate: string;
  businessDate: string;
}): boolean {
  if (params.source !== "walk_in") return false;
  if (params.status === "cancelled" || params.status === "no_show" || params.status === "checked_out") return false;
  if (params.status === "pending" || params.status === "confirmed") return true;
  return params.status === "checked_in" && params.arrivalDate === params.businessDate;
}
