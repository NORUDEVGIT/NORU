import { isUnarrivedPastStay } from "@/packages/pms/lib/reservation-lifecycle";
import { deskActionHints } from "@/packages/pms/lib/reservation-workspace/desk.server";
import { isDeskNoShowEligible } from "@/packages/pms/lib/reservation-noshow-workspace";
import {
  isAllowedBookingStatusTransition,
  type ReservationStatus,
} from "@/packages/pms/lib/reservation-dates";
import type {
  ReservationAction,
  ReservationActionAccess,
  ReservationActionId,
  ReservationActionInput,
  ReservationActionResult,
} from "@/packages/pms/lib/reservation-actions";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import type { PmsAccessSnapshot } from "@/packages/pms/lib/pms-client-access";

const DETAIL_ACTION_LABELS: Partial<Record<ReservationActionId, string>> = {
  confirm: "Confirm Reservation",
  copy: "Copy Stay",
  no_show: "Mark No-show",
};

export function reservationDetailActionAccess(access: PmsAccessSnapshot): ReservationActionAccess {
  const can = (code: string) => access.isOwner || access.codes.includes(code);
  return {
    edit: can(PMS_PERMISSIONS.RESERVATION_EDIT),
    confirm: can(PMS_PERMISSIONS.RESERVATION_EDIT),
    assignRoom: can(PMS_PERMISSIONS.RESERVATION_ASSIGNMENT_EDIT),
    changeRoom: can(PMS_PERMISSIONS.FRONT_OFFICE_STAY_EDIT),
    checkIn: can(PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN),
    checkOut: can(PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT),
    cancel: can(PMS_PERMISSIONS.RESERVATION_CANCEL),
    noShow: can(PMS_PERMISSIONS.FRONT_OFFICE_NO_SHOW),
    reactivate: can(PMS_PERMISSIONS.RESERVATION_EDIT),
    copy: can(PMS_PERMISSIONS.RESERVATION_CREATE),
    print: can(PMS_PERMISSIONS.RESERVATION_PRINT),
  };
}

export function reservationDetailActionInput(input: {
  status: ReservationStatus;
  businessDate: string;
  arrivalDate: string;
  departureDate: string;
  roomId: string | null;
  role: string;
  access?: ReservationActionAccess;
  canOpenFolio?: boolean;
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
    access: input.access,
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
      canOpenFolio: input.canOpenFolio ?? true,
      canPrint: input.access?.print ?? true,
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
