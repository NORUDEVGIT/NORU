import { pmsCan, pmsCanAny, type PmsAccessSnapshot } from "./pms-client-access";
import { FO_STAY_FOLIO_READ } from "./fo-desk-permissions";
import { PMS_PERMISSIONS, type PmsPermissionCode } from "./pms-permissions";

/**
 * Client-side grants for Front Office desks.
 * A desk code or the owning module's code shows the action. Module View stays separate,
 * so Open Folio and Open Guest Profile still require that module's View.
 */
export type FrontOfficeDeskAccess = {
  canViewDesk: boolean;
  canWalkIn: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canStayEdit: boolean;
  canNoShow: boolean;
  canCancel: boolean;
  canAssignRoom: boolean;
  canEditReservation: boolean;
  canEditGuest: boolean;
  canGuestService: boolean;
  canCharge: boolean;
  canDeposit: boolean;
  canPayment: boolean;
  canAdjustment: boolean;
  canDiscount: boolean;
  canRefund: boolean;
  canCloseFolio: boolean;
  canIssueInvoice: boolean;
  canReadStayFolio: boolean;
  canOpenFolio: boolean;
  canViewGuest: boolean;
  canOpenReservation: boolean;
  canCreateHousekeepingTask: boolean;
  canEditHousekeepingTask: boolean;
  canCreateMaintenance: boolean;
  canCheckInOverride: boolean;
  canCheckOutOverride: boolean;
  canFeeOverride: boolean;
};

export function frontOfficeDeskAccess(snapshot: PmsAccessSnapshot): FrontOfficeDeskAccess {
  const can = (code: PmsPermissionCode) => pmsCan(snapshot, code);
  const either = (moduleCode: PmsPermissionCode, deskCode: PmsPermissionCode) =>
    can(moduleCode) || can(deskCode);
  const canStayEdit = can(PMS_PERMISSIONS.FRONT_OFFICE_STAY_EDIT);
  return {
    canViewDesk: can(PMS_PERMISSIONS.FRONT_OFFICE_VIEW) || can(PMS_PERMISSIONS.RESERVATION_VIEW),
    canWalkIn: can(PMS_PERMISSIONS.FRONT_OFFICE_WALK_IN),
    canCheckIn: can(PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN),
    canCheckOut: can(PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT),
    canStayEdit,
    canNoShow: can(PMS_PERMISSIONS.FRONT_OFFICE_NO_SHOW),
    canCancel: can(PMS_PERMISSIONS.FRONT_OFFICE_CANCEL),
    canAssignRoom: either(PMS_PERMISSIONS.RESERVATION_ASSIGNMENT_EDIT, PMS_PERMISSIONS.FRONT_OFFICE_ROOM_ASSIGN),
    canEditReservation: either(PMS_PERMISSIONS.RESERVATION_EDIT, PMS_PERMISSIONS.FRONT_OFFICE_RESERVATION_EDIT),
    canEditGuest: either(PMS_PERMISSIONS.GUEST_PROFILE_EDIT, PMS_PERMISSIONS.FRONT_OFFICE_GUEST_EDIT),
    canGuestService: either(PMS_PERMISSIONS.GUEST_PROFILE_EDIT, PMS_PERMISSIONS.FRONT_OFFICE_GUEST_SERVICE_CREATE),
    canCharge: either(PMS_PERMISSIONS.CASHIERING_CHARGE_POST, PMS_PERMISSIONS.FRONT_OFFICE_CHARGE_POST),
    canDeposit: either(PMS_PERMISSIONS.CASHIERING_DEPOSIT_POST, PMS_PERMISSIONS.FRONT_OFFICE_DEPOSIT_POST),
    canPayment: either(PMS_PERMISSIONS.CASHIERING_PAYMENT_POST, PMS_PERMISSIONS.FRONT_OFFICE_PAYMENT_POST),
    canAdjustment: either(PMS_PERMISSIONS.CASHIERING_ADJUSTMENT_POST, PMS_PERMISSIONS.FRONT_OFFICE_ADJUSTMENT_POST),
    canDiscount: either(PMS_PERMISSIONS.CASHIERING_DISCOUNT_POST, PMS_PERMISSIONS.FRONT_OFFICE_DISCOUNT_POST),
    canRefund: either(PMS_PERMISSIONS.CASHIERING_REFUND, PMS_PERMISSIONS.FRONT_OFFICE_REFUND),
    canCloseFolio: either(PMS_PERMISSIONS.CASHIERING_FOLIO_CLOSE, PMS_PERMISSIONS.FRONT_OFFICE_FOLIO_AUTHORIZE),
    canIssueInvoice: either(
      PMS_PERMISSIONS.CASHIERING_INVOICE_AUTHORIZE,
      PMS_PERMISSIONS.FRONT_OFFICE_INVOICE_AUTHORIZE,
    ),
    canReadStayFolio: pmsCanAny(snapshot, FO_STAY_FOLIO_READ),
    canOpenFolio: can(PMS_PERMISSIONS.CASHIERING_VIEW),
    canViewGuest: can(PMS_PERMISSIONS.GUEST_PROFILE_VIEW),
    canOpenReservation: can(PMS_PERMISSIONS.RESERVATION_VIEW),
    canCreateHousekeepingTask: either(
      PMS_PERMISSIONS.HOUSEKEEPING_TASK_CREATE,
      PMS_PERMISSIONS.FRONT_OFFICE_HOUSEKEEPING_TASK_CREATE,
    ),
    canEditHousekeepingTask: either(
      PMS_PERMISSIONS.HOUSEKEEPING_TASK_EDIT,
      PMS_PERMISSIONS.FRONT_OFFICE_HOUSEKEEPING_TASK_EDIT,
    ),
    canCreateMaintenance: either(PMS_PERMISSIONS.MAINTENANCE_CREATE, PMS_PERMISSIONS.FRONT_OFFICE_MAINTENANCE_CREATE),
    canCheckInOverride: can(PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN_OVERRIDE),
    canCheckOutOverride: can(PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT_OVERRIDE),
    canFeeOverride: can(PMS_PERMISSIONS.FRONT_OFFICE_FEE_OVERRIDE),
  };
}

export function frontOfficeDeskCanOperate(snapshot: PmsAccessSnapshot): boolean {
  return pmsCanAny(snapshot, [
    PMS_PERMISSIONS.FRONT_OFFICE_WALK_IN,
    PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN,
    PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT,
    PMS_PERMISSIONS.FRONT_OFFICE_STAY_EDIT,
    PMS_PERMISSIONS.FRONT_OFFICE_NO_SHOW,
    PMS_PERMISSIONS.FRONT_OFFICE_CANCEL,
    PMS_PERMISSIONS.RESERVATION_ASSIGNMENT_EDIT,
    PMS_PERMISSIONS.FRONT_OFFICE_ROOM_ASSIGN,
  ]);
}

/** Rack and in-house menu ids. Status still decides whether the stay can take the action. */
export function foDeskMenuAllowed(access: FrontOfficeDeskAccess, id: string): boolean {
  switch (id) {
    case "check_in":
      return access.canCheckIn;
    case "assign_room":
    case "change_room":
    case "assign":
      return access.canAssignRoom;
    case "edit_stay":
    case "move_room":
    case "room_move":
    case "extend_stay":
    case "early_departure":
    case "amend_stay":
    case "upgrade":
    case "guests":
    case "special":
    case "late_checkout":
    case "guest_request":
      return access.canStayEdit;
    case "add_service":
      return access.canStayEdit && access.canCharge;
    case "upgrade_downgrade":
    case "add_remove_guest":
    case "amend_notes":
    case "add_special_request":
      return access.canStayEdit;
    case "unarrived":
      return access.canNoShow;
    case "open_reservation":
      return access.canOpenReservation;
    case "open_stay":
    case "show_on_rack":
      return true;
    case "no_show":
      return access.canNoShow;
    case "cancel":
    case "cancel_fees":
      return access.canCancel;
    case "check_out":
      return access.canCheckOut;
    case "open_folio":
    case "view_folio":
      return access.canOpenFolio;
    case "open_maintenance":
      return access.canCreateMaintenance;
    case "open_guest":
      return access.canViewGuest;
    case "view_details":
      return true;
    default:
      return false;
  }
}
