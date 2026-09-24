import type { ReservationStatus } from "@/packages/pms/lib/reservation-dates";
import type {
  QuickViewFinancialState,
  ReservationDeskActionHints,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";

export type ReservationContextActionId =
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
  | "open_folio";

export type ReservationContextActionGroup =
  "view_edit" | "reservation" | "front_office" | "cashiering";

export interface ReservationContextAction {
  id: ReservationContextActionId;
  label: string;
  group: ReservationContextActionGroup;
  destructive?: boolean;
}

export interface ReservationContextActionInput {
  status: ReservationStatus;
  roomId: string | null;
  arrivalDate: string;
  businessDate: string;
  hints: ReservationDeskActionHints;
  canManage: boolean;
  financial?: {
    state: QuickViewFinancialState;
    folioId: string | null;
  };
  /** Desk/Quick View omit folio until Cashiering can embed safely. */
  allowOpenFolio?: boolean;
}

/**
 * Presentation-only visibility model. Server commands remain authoritative and
 * revalidate every transition, permission, room assignment, and folio access.
 */
export function getReservationContextActions(
  input: ReservationContextActionInput,
): ReservationContextAction[] {
  const actions: ReservationContextAction[] = [
    { id: "open", label: "Open Reservation", group: "view_edit" },
  ];

  if (input.canManage && (input.status === "pending" || input.status === "confirmed")) {
    actions.push({ id: "edit", label: "Edit Reservation", group: "view_edit" });
  }

  if (input.canManage) {
    actions.push({ id: "copy", label: "Copy stay", group: "reservation" });
  }

  if (input.canManage && input.hints.canAssignRoom) {
    actions.push({ id: "assign_room", label: "Assign Room", group: "view_edit" });
  }

  if (input.canManage && input.status === "checked_in" && input.roomId) {
    actions.push({ id: "change_room", label: "Change Room", group: "front_office" });
  }

  if (input.canManage && input.hints.canConfirm) {
    actions.push({ id: "confirm", label: "Confirm Reservation", group: "reservation" });
  }

  if (input.canManage && input.hints.canCancel) {
    actions.push({
      id: "cancel",
      label: "Cancel Reservation",
      group: "reservation",
      destructive: true,
    });
  }

  if (input.canManage && input.hints.canCheckIn) {
    actions.push({ id: "check_in", label: "Check In", group: "front_office" });
  }

  if (input.canManage && input.hints.canCheckOut) {
    actions.push({ id: "check_out", label: "Check Out", group: "front_office" });
  }

  if (input.canManage && input.status === "confirmed" && input.arrivalDate <= input.businessDate) {
    actions.push({ id: "no_show", label: "Mark No-Show", group: "front_office" });
  }

  if (input.canManage && input.status === "cancelled") {
    actions.push({ id: "reactivate", label: "Reactivate Reservation", group: "reservation" });
  }

  if (input.allowOpenFolio && input.financial?.state === "available" && input.financial.folioId) {
    actions.push({ id: "open_folio", label: "Open Folio", group: "cashiering" });
  }

  return actions;
}
