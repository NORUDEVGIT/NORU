import {
  canManageReservations,
  isAllowedBookingStatusTransition,
  type ReservationStatus,
} from "./reservation-dates";

/**
 * Operational eligibility for an opened reservation.
 *
 * Desk and Quick View still render `getReservationContextActions`. This helper
 * does not execute commands. Hints stay authoritative: a date or status can
 * only hide an action the hint already refused.
 */
export type ReservationActionId =
  | "open"
  | "edit"
  | "copy"
  | "assign_room"
  | "change_room"
  | "confirm"
  | "cancel"
  | "check_in"
  | "check_out"
  | "no_show"
  | "reactivate"
  | "open_folio"
  | "print";

export type ReservationAction = {
  id: ReservationActionId;
  label: string;
};

export type ReservationActionHints = {
  canEdit: boolean;
  canAssignRoom: boolean;
  canChangeRoom: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canNoShow: boolean;
  canReactivate: boolean;
  canCopyStay: boolean;
  canOpenFolio: boolean;
  canPrint: boolean;
};

export type ReservationActionInput = {
  status: ReservationStatus;
  businessDate: string;
  arrivalDate: string;
  departureDate: string;
  roomAssigned: boolean;
  actionHints: ReservationActionHints;
  role: string;
};

export type ReservationActionResult = {
  primaryAction: ReservationAction | null;
  actions: ReservationAction[];
  editable: boolean;
  historical: boolean;
  warnings: string[];
};

const STALE_WARNING = "This reservation departed before the business date.";

export function isHistoricalReservation(input: {
  status: ReservationStatus;
  departureDate: string;
  businessDate: string;
}): boolean {
  if (input.status === "checked_in") return false;
  if (
    input.status === "checked_out" ||
    input.status === "cancelled" ||
    input.status === "no_show"
  ) {
    return true;
  }
  return input.departureDate < input.businessDate;
}

export function getReservationActions(input: ReservationActionInput): ReservationActionResult {
  const historical = isHistoricalReservation(input);
  const staleBooking =
    (input.status === "pending" || input.status === "confirmed") &&
    input.departureDate < input.businessDate;
  const canManage = canManageReservations(input.role);
  const editable =
    canManage &&
    input.actionHints.canEdit &&
    (input.status === "pending" || input.status === "confirmed") &&
    !historical;

  const actions: ReservationAction[] = [{ id: "open", label: "Open Reservation" }];
  if (editable) actions.push({ id: "edit", label: "Edit Reservation" });
  if (
    allowed(
      canManage,
      input.actionHints.canConfirm,
      input.status === "pending" && isAllowedBookingStatusTransition(input.status, "confirmed"),
      !staleBooking,
    )
  ) {
    actions.push({ id: "confirm", label: "Confirm" });
  }
  if (
    allowed(
      canManage,
      input.actionHints.canAssignRoom,
      input.status === "pending" || input.status === "confirmed",
      !staleBooking,
    )
  ) {
    actions.push({ id: "assign_room", label: "Assign Room" });
  }
  if (
    allowed(canManage, input.actionHints.canCheckIn, input.status === "confirmed", !staleBooking)
  ) {
    actions.push({ id: "check_in", label: "Check In" });
  }
  if (allowed(canManage, input.actionHints.canCheckOut, input.status === "checked_in", true)) {
    actions.push({ id: "check_out", label: "Check Out" });
  }
  if (
    allowed(
      canManage,
      input.actionHints.canChangeRoom,
      input.status === "checked_in" && input.roomAssigned,
      true,
    )
  ) {
    actions.push({ id: "change_room", label: "Change Room" });
  }
  if (
    allowed(
      canManage,
      input.actionHints.canCancel,
      (input.status === "pending" || input.status === "confirmed") &&
        isAllowedBookingStatusTransition(input.status, "cancelled"),
      !staleBooking,
    )
  ) {
    actions.push({ id: "cancel", label: "Cancel Reservation" });
  }
  if (
    allowed(
      canManage,
      input.actionHints.canNoShow,
      input.status === "confirmed" && input.arrivalDate <= input.businessDate,
      true,
    )
  ) {
    actions.push({ id: "no_show", label: "Mark No-Show" });
  }
  if (
    allowed(
      canManage,
      input.actionHints.canReactivate,
      input.status === "cancelled" && isAllowedBookingStatusTransition(input.status, "pending"),
      true,
    )
  ) {
    actions.push({ id: "reactivate", label: "Reactivate Reservation" });
  }
  if (allowed(canManage, input.actionHints.canCopyStay, true, !historical)) {
    actions.push({ id: "copy", label: "Copy stay" });
  }
  if (input.actionHints.canOpenFolio) {
    actions.push({ id: "open_folio", label: "Open Folio" });
  }
  if (input.actionHints.canPrint) {
    actions.push({ id: "print", label: "Print" });
  }

  return {
    primaryAction: primaryAction(actions),
    actions,
    editable,
    historical,
    warnings: staleBooking ? [STALE_WARNING] : [],
  };
}

function allowed(
  roleAllows: boolean,
  hintAllows: boolean,
  statusAllows: boolean,
  dateAllows: boolean,
): boolean {
  return roleAllows && hintAllows && statusAllows && dateAllows;
}

function primaryAction(actions: ReservationAction[]): ReservationAction | null {
  return (
    actions.find((action) => action.id === "confirm") ??
    actions.find((action) => action.id === "check_in") ??
    actions.find((action) => action.id === "check_out") ??
    null
  );
}
