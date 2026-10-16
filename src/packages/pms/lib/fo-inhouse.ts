/**
 * FO Phase 3 — In-House operations helpers (pure).
 * Hints guide the desk. Canonical writers still enforce authority.
 */
import { FOLIO_ZERO_EPSILON } from "./fo-check-out.ts";
import { foLateCheckoutRequiresApproval, foRequiresApprovalLabel } from "./fo-approvals.ts";
import type { ReservationStatus } from "./reservation-dates.ts";
import type { LateCheckoutPolicy } from "./reservation-workspace/shared-read-models.ts";

export const FO_INHOUSE_EXCEPTION_KEYS = [
  "unassigned",
  "room_unavailable",
  "maintenance",
  "overstay",
  "folio_warning",
  "late_checkout_conflict",
  "special_request",
  "missing_stay_data",
] as const;

export type FoInHouseExceptionKey = (typeof FO_INHOUSE_EXCEPTION_KEYS)[number];

export const FO_INHOUSE_EXCEPTION_LABELS: Record<FoInHouseExceptionKey, string> = {
  unassigned: "Room unassigned",
  room_unavailable: "Room unavailable",
  maintenance: "Maintenance issue",
  overstay: "Overstay",
  folio_warning: "Folio / payment warning",
  late_checkout_conflict: "Late checkout conflict",
  special_request: "Special request",
  missing_stay_data: "Missing stay data",
};

export const FO_INHOUSE_BLOCKING_KEYS: FoInHouseExceptionKey[] = [
  "unassigned",
  "room_unavailable",
  "maintenance",
  "overstay",
  "missing_stay_data",
];

export type FoInHouseActionHints = {
  canMoveRoom: boolean;
  canAmendStay: boolean;
  canSetLateCheckout: boolean;
  canOpenFolio: boolean;
  canCheckOut: boolean;
  canOpenGuest: boolean;
  canOpenReservation: boolean;
  canAddService: boolean;
  canGuestRequest: boolean;
  hasOperationalException: boolean;
  lateCheckoutRequiresApproval: boolean;
};

export type FoInHouseHistoryItem = {
  eventType: string;
  notes: string | null;
  createdAt: string;
};

export function foInHouseBlockingKeys(keys: FoInHouseExceptionKey[]): FoInHouseExceptionKey[] {
  return keys.filter((key) => FO_INHOUSE_BLOCKING_KEYS.includes(key));
}

export function foInHouseExceptionKeys(params: {
  status: ReservationStatus;
  roomId: string | null;
  operationalStatus: string | null | undefined;
  maintenanceStatus: string | null | undefined;
  overstay: boolean;
  folioLane: "live" | "coming_soon" | "permission_denied";
  balance: number | null;
  specialRequests: string | null;
  lateCheckoutGranted: boolean;
  lateCheckoutUntil: string | null;
  lateCheckoutPolicy: LateCheckoutPolicy | null;
  arrivalDate: string | null;
  departureDate: string | null;
}): FoInHouseExceptionKey[] {
  const keys: FoInHouseExceptionKey[] = [];
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
  if (params.overstay) keys.push("overstay");
  if (
    params.folioLane === "live" &&
    params.balance != null &&
    Math.abs(params.balance) >= FOLIO_ZERO_EPSILON
  ) {
    keys.push("folio_warning");
  }
  if (params.lateCheckoutGranted) {
    if (params.lateCheckoutPolicy && params.lateCheckoutPolicy.allowed === false) {
      keys.push("late_checkout_conflict");
    } else if (!params.lateCheckoutUntil) {
      keys.push("late_checkout_conflict");
    }
  }
  if ((params.specialRequests ?? "").trim()) keys.push("special_request");
  if (!params.arrivalDate || !params.departureDate || params.arrivalDate >= params.departureDate) {
    keys.push("missing_stay_data");
  }
  return keys;
}

export function foInHouseActionHints(params: {
  status: ReservationStatus;
  assigned: boolean;
  folioId: string | null;
  guestId: string | null;
  blockingKeys: FoInHouseExceptionKey[];
  lateCheckoutNeedsApproval?: boolean;
  staffRole?: string;
}): FoInHouseActionHints {
  const inHouse = params.status === "checked_in";
  return {
    canMoveRoom: inHouse && params.assigned,
    canAmendStay: inHouse,
    canSetLateCheckout: inHouse,
    canOpenFolio: params.folioId != null,
    canCheckOut: inHouse,
    canOpenGuest: Boolean(params.guestId),
    canOpenReservation: true,
    canAddService: inHouse,
    canGuestRequest: inHouse,
    hasOperationalException: params.blockingKeys.length > 0,
    lateCheckoutRequiresApproval:
      inHouse && foLateCheckoutRequiresApproval(params.lateCheckoutNeedsApproval === true, params.staffRole ?? ""),
  };
}

export function inHouseMenuItems(hints: FoInHouseActionHints): { id: string; label: string }[] {
  if (!hints.canCheckOut && !hints.canMoveRoom && !hints.canAmendStay) {
    return hints.canOpenFolio ? [{ id: "open_folio", label: "Open Folio" }] : [];
  }
  const items: { id: string; label: string }[] = [];
  if (hints.canMoveRoom) items.push({ id: "room_move", label: "Room Move" });
  if (hints.canAmendStay) {
    items.push({ id: "amend_stay", label: "Amend Stay" });
    items.push({ id: "upgrade", label: "Room type change" });
    items.push({ id: "guests", label: "Occupancy" });
    items.push({ id: "special", label: "Special request" });
  }
  if (hints.canSetLateCheckout) {
    items.push({
      id: "late_checkout",
      label: foRequiresApprovalLabel("Late Checkout", hints.lateCheckoutRequiresApproval),
    });
  }
  if (hints.canAddService) items.push({ id: "add_service", label: "Add Service" });
  if (hints.canGuestRequest) items.push({ id: "guest_request", label: "Guest Request" });
  if (hints.canOpenGuest) items.push({ id: "open_guest", label: "Open Guest Profile" });
  if (hints.canOpenFolio) items.push({ id: "open_folio", label: "Open Folio" });
  if (hints.canCheckOut) items.push({ id: "check_out", label: "Check Out" });
  return items;
}

export function differentRoomTypeNeedsAmendment(currentTypeId: string, targetTypeId: string): boolean {
  return currentTypeId !== targetTypeId;
}
