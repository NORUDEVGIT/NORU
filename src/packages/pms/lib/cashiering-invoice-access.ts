import { pmsCan, type PmsAccessSnapshot } from "./pms-client-access";
import { PMS_PERMISSIONS } from "./pms-permissions";

/** Client grants for invoice / credit-debit note flows — mirrors credit & debit note server handlers. */
export type CashieringInvoiceAccess = {
  canView: boolean;
  canEdit: boolean;
  canAuthorize: boolean;
};

export function cashieringInvoiceAccess(snapshot: PmsAccessSnapshot): CashieringInvoiceAccess {
  return {
    canView: pmsCan(snapshot, PMS_PERMISSIONS.CASHIERING_INVOICE_VIEW),
    canEdit: pmsCan(snapshot, PMS_PERMISSIONS.CASHIERING_INVOICE_EDIT),
    canAuthorize: pmsCan(snapshot, PMS_PERMISSIONS.CASHIERING_INVOICE_AUTHORIZE),
  };
}
