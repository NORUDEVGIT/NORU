import { pmsCan, type PmsAccessSnapshot } from "./pms-client-access";
import { PMS_PERMISSIONS } from "./pms-permissions";

/** Company, group, and travel-agent directories (commercial masters). */
export type GuestAccountAccess = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canActivate: boolean;
};

export function guestAccountAccess(snapshot: PmsAccessSnapshot): GuestAccountAccess {
  const can = (code: (typeof PMS_PERMISSIONS)[keyof typeof PMS_PERMISSIONS]) => pmsCan(snapshot, code);
  return {
    canView: can(PMS_PERMISSIONS.GUEST_ACCOUNT_VIEW),
    canCreate: can(PMS_PERMISSIONS.GUEST_ACCOUNT_CREATE),
    canEdit: can(PMS_PERMISSIONS.GUEST_ACCOUNT_EDIT),
    canActivate: can(PMS_PERMISSIONS.GUEST_ACCOUNT_ACTIVATE),
  };
}
