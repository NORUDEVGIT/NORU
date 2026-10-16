/**
 * FO Phase 4 — Departures helpers (pure).
 * Hints guide the desk. completeFoCheckOut remains authoritative.
 */
import { FOLIO_ZERO_EPSILON, isFolioSettled } from "./fo-check-out.ts";
import { foLateCheckoutRequiresApproval, foRequiresApprovalLabel } from "./fo-approvals.ts";
import type { ReservationStatus } from "./reservation-dates.ts";
import type { LateCheckoutPolicy } from "./reservation-workspace/shared-read-models.ts";

export const FO_DEPARTURE_EXCEPTION_KEYS = [
  "unsettled_folio",
  "missing_folio",
  "unassigned",
  "room_unavailable",
  "maintenance",
  "overdue_departure",
  "late_checkout_conflict",
  "missing_stay_data",
  "guest_request",
] as const;

export type FoDepartureExceptionKey = (typeof FO_DEPARTURE_EXCEPTION_KEYS)[number];

export const FO_DEPARTURE_EXCEPTION_LABELS: Record<FoDepartureExceptionKey, string> = {
  unsettled_folio: "Unsettled folio",
  missing_folio: "Missing folio",
  unassigned: "Invalid room assignment",
  room_unavailable: "Room unavailable",
  maintenance: "Maintenance issue",
  overdue_departure: "Overdue departure",
  late_checkout_conflict: "Late checkout conflict",
  missing_stay_data: "Stay data inconsistency",
  guest_request: "Guest / request issue",
};

export const FO_DEPARTURE_BLOCKING_KEYS: FoDepartureExceptionKey[] = [
  "unsettled_folio",
  "missing_folio",
  "unassigned",
  "missing_stay_data",
];

export type FoDepartureTiming = "due_now" | "late_checkout" | "overdue";

export type FoCheckoutReadiness = {
  canCheckOut: boolean;
  needsSettlement: boolean;
  hasBlockingException: boolean;
  canOpenFolio: boolean;
  missingFolio: boolean;
};

export type FoDepartureActionHints = FoCheckoutReadiness & {
  canSetLateCheckout: boolean;
  canAmendStay: boolean;
  canOpenGuest: boolean;
  canOpenReservation: boolean;
  lateCheckoutRequiresApproval: boolean;
};

export type FoDepartureHistoryItem = {
  eventType: string;
  notes: string | null;
  createdAt: string;
};

export function foDepartureBlockingKeys(keys: FoDepartureExceptionKey[]): FoDepartureExceptionKey[] {
  return keys.filter((key) => FO_DEPARTURE_BLOCKING_KEYS.includes(key));
}

export function foDepartureTiming(params: {
  departureDate: string;
  businessDate: string;
  overstay: boolean;
  lateCheckoutGranted: boolean;
}): FoDepartureTiming {
  if (params.overstay || params.departureDate < params.businessDate) return "overdue";
  if (params.lateCheckoutGranted) return "late_checkout";
  return "due_now";
}

export function foDepartureExceptionKeys(params: {
  status: ReservationStatus;
  roomId: string | null;
  operationalStatus: string | null | undefined;
  maintenanceStatus: string | null | undefined;
  overstay: boolean;
  folioLane: "live" | "coming_soon" | "permission_denied";
  folioId: string | null;
  balance: number | null;
  specialRequests: string | null;
  lateCheckoutGranted: boolean;
  lateCheckoutUntil: string | null;
  lateCheckoutPolicy: LateCheckoutPolicy | null;
  arrivalDate: string | null;
  departureDate: string | null;
}): FoDepartureExceptionKey[] {
  const keys: FoDepartureExceptionKey[] = [];
  if (params.status !== "checked_in") return keys;
  if (!params.roomId) keys.push("unassigned");
  const ops = (params.operationalStatus ?? "").trim();
  if (params.roomId && (ops === "out_of_order" || ops === "out_of_service")) {
    keys.push("room_unavailable");
  }
  const maintenance = (params.maintenanceStatus ?? "").trim();
  if (params.roomId && maintenance && maintenance !== "none" && maintenance !== "ok") {
    keys.push("maintenance");
  }
  if (params.overstay) keys.push("overdue_departure");
  if (params.folioLane === "live" && !params.folioId) keys.push("missing_folio");
  if (
    params.folioLane === "live" &&
    params.folioId &&
    params.balance != null &&
    Math.abs(params.balance) >= FOLIO_ZERO_EPSILON
  ) {
    keys.push("unsettled_folio");
  }
  if (params.lateCheckoutGranted) {
    if (params.lateCheckoutPolicy && params.lateCheckoutPolicy.allowed === false) {
      keys.push("late_checkout_conflict");
    } else if (!params.lateCheckoutUntil) {
      keys.push("late_checkout_conflict");
    }
  }
  if ((params.specialRequests ?? "").trim()) keys.push("guest_request");
  if (!params.arrivalDate || !params.departureDate || params.arrivalDate >= params.departureDate) {
    keys.push("missing_stay_data");
  }
  return keys;
}

export function foCheckoutReadiness(params: {
  status: ReservationStatus;
  assigned: boolean;
  folioId: string | null;
  folioLane: "live" | "coming_soon" | "permission_denied";
  balance: number | null;
  blockingKeys: FoDepartureExceptionKey[];
  datesValid: boolean;
}): FoCheckoutReadiness {
  const inHouse = params.status === "checked_in";
  const missingFolio = params.folioLane === "live" && !params.folioId;
  const needsSettlement =
    params.folioLane === "live" &&
    params.folioId != null &&
    params.balance != null &&
    !isFolioSettled(params.balance);
  return {
    canCheckOut: inHouse && params.assigned && params.datesValid,
    needsSettlement,
    hasBlockingException: params.blockingKeys.length > 0,
    canOpenFolio: params.folioId != null,
    missingFolio,
  };
}

export function foDepartureActionHints(params: {
  status: ReservationStatus;
  assigned: boolean;
  folioId: string | null;
  folioLane: "live" | "coming_soon" | "permission_denied";
  balance: number | null;
  guestId: string | null;
  blockingKeys: FoDepartureExceptionKey[];
  datesValid: boolean;
  lateCheckoutNeedsApproval?: boolean;
  staffRole?: string;
}): FoDepartureActionHints {
  const inHouse = params.status === "checked_in";
  const readiness = foCheckoutReadiness(params);
  return {
    ...readiness,
    canSetLateCheckout: inHouse,
    canAmendStay: inHouse,
    canOpenGuest: Boolean(params.guestId),
    canOpenReservation: true,
    lateCheckoutRequiresApproval:
      inHouse && foLateCheckoutRequiresApproval(params.lateCheckoutNeedsApproval === true, params.staffRole ?? ""),
  };
}

export function departureMenuItems(hints: FoDepartureActionHints): { id: string; label: string }[] {
  const items: { id: string; label: string }[] = [];
  if (hints.canOpenFolio) items.push({ id: "open_folio", label: "Open Folio" });
  if (hints.canSetLateCheckout) {
    items.push({
      id: "late_checkout",
      label: foRequiresApprovalLabel("Late Checkout", hints.lateCheckoutRequiresApproval),
    });
  }
  if (hints.canAmendStay) items.push({ id: "amend_stay", label: "Amend Stay" });
  if (hints.canOpenGuest) items.push({ id: "open_guest", label: "Open Guest Profile" });
  if (hints.canSetLateCheckout) items.push({ id: "check_out", label: "Check Out" });
  return items;
}
