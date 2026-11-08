import { pmsCan, type PmsAccessSnapshot } from "./pms-client-access";
import { PMS_PERMISSIONS } from "./pms-permissions";

/** Client grants for fiscal register / inspect — mirrors server `requirePmsActor` on fiscal handlers. */
export type FiscalDeskAccess = {
  canView: boolean;
  canRegister: boolean;
  canInspect: boolean;
};

export function fiscalDeskAccess(snapshot: PmsAccessSnapshot): FiscalDeskAccess {
  const canView = pmsCan(snapshot, PMS_PERMISSIONS.FISCAL_VIEW);
  const canRegister = pmsCan(snapshot, PMS_PERMISSIONS.FISCAL_DOCUMENT_AUTHORIZE);
  return {
    canView,
    canRegister,
    canInspect: canView,
  };
}
