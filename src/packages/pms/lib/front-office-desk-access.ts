import { pmsCan, pmsCanAny, type PmsAccessSnapshot } from "./pms-client-access";
import { PMS_PERMISSIONS, type PmsPermissionCode } from "./pms-permissions";

/** Client-side grants for Front Office desks — mirrors server `requirePmsActor` on mutations. */
export type FrontOfficeDeskAccess = {
  canViewDesk: boolean;
  canWalkIn: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canStayEdit: boolean;
  canNoShow: boolean;
  canCancel: boolean;
  canAssignRoom: boolean;
};

export function frontOfficeDeskAccess(snapshot: PmsAccessSnapshot): FrontOfficeDeskAccess {
  const can = (code: PmsPermissionCode) => pmsCan(snapshot, code);
  const canStayEdit = can(PMS_PERMISSIONS.FRONT_OFFICE_STAY_EDIT);
  return {
    canViewDesk:
      can(PMS_PERMISSIONS.FRONT_OFFICE_VIEW) || can(PMS_PERMISSIONS.RESERVATION_VIEW),
    canWalkIn: can(PMS_PERMISSIONS.FRONT_OFFICE_WALK_IN),
    canCheckIn: can(PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN),
    canCheckOut: can(PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT),
    canStayEdit,
    canNoShow: can(PMS_PERMISSIONS.FRONT_OFFICE_NO_SHOW),
    canCancel: can(PMS_PERMISSIONS.FRONT_OFFICE_CANCEL),
    canAssignRoom:
      can(PMS_PERMISSIONS.RESERVATION_ASSIGNMENT_EDIT) || canStayEdit,
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
  ]);
}
