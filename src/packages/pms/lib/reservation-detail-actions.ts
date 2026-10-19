import { isUnarrivedPastStay } from "@/packages/pms/lib/reservation-lifecycle";
import { deskActionHints } from "@/packages/pms/lib/reservation-workspace/desk.server";
import { isDeskNoShowEligible } from "@/packages/pms/lib/reservation-noshow-workspace";
import {
  isAllowedBookingStatusTransition,
  type ReservationStatus,
} from "@/packages/pms/lib/reservation-dates";
import type {
  ReservationAction,
  ReservationActionId,
  ReservationActionInput,
  ReservationActionResult,
} from "@/packages/pms/lib/reservation-actions";

const DETAIL_ACTION_LABELS: Partial<Record<ReservationActionId, string>> = {
  confirm: "Confirm Reservation",
  copy: "Copy Stay",
  no_show: "Mark No-show",
};

export function reservationDetailActionInput(input: {
  status: ReservationStatus;
  businessDate: string;
  arrivalDate: string;
  departureDate: string;
  roomId: string | null;
  role: string;
}): ReservationActionInput {
  const desk = deskActionHints({ status: input.status, roomId: input.roomId });
  const pastUnarrived = isUnarrivedPastStay({
    status: input.status,
    arrivalDate: input.arrivalDate,
    businessDate: input.businessDate,
  });
  return {
    status: input.status,
    businessDate: input.businessDate,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    roomAssigned: input.roomId !== null,
    role: input.role,
    actionHints: {
      canEdit: !pastUnarrived,
      canAssignRoom: desk.canAssignRoom && !pastUnarrived,
      canChangeRoom: true,
      canConfirm: desk.canConfirm && !pastUnarrived,
      canCancel: desk.canCancel,
      canCheckIn: desk.canCheckIn && !pastUnarrived,
      canCheckOut: desk.canCheckOut,
      canNoShow: isDeskNoShowEligible(input.status, input.arrivalDate, input.businessDate),
      canReactivate:
        input.status === "cancelled" && isAllowedBookingStatusTransition(input.status, "pending"),
      canCopyStay: true,
      canOpenFolio: true,
      canPrint: true,
    },
  };
}

export function reservationDetailActionLabel(action: ReservationAction): string {
  return DETAIL_ACTION_LABELS[action.id] ?? action.label;
}

export function reservationDetailSecondaryActions(
  result: ReservationActionResult,
): ReservationAction[] {
  const primaryId = result.primaryAction?.id;
  return result.actions.filter(
    (action) => action.id !== "open" && action.id !== "print" && action.id !== primaryId,
  );
}

export function reservationDetailActionIsDestructive(id: ReservationActionId): boolean {
  return id === "cancel" || id === "no_show";
}
