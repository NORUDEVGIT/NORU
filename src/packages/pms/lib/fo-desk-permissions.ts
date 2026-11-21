/**
 * Front Office desk actions that write another module's records.
 * Each code's parent view is Front Office, so the grant does not open that module.
 * The owning module's own code still authorizes the same server function.
 */
import { PMS_PERMISSIONS, type PmsPermissionCode } from "./pms-permissions";

export function moduleOrDesk(
  moduleCode: PmsPermissionCode,
  deskCode: PmsPermissionCode,
): readonly [PmsPermissionCode, PmsPermissionCode] {
  return [moduleCode, deskCode];
}

/** Reading one stay folio from the desk. Does not include the Cashiering module. */
export const FO_STAY_FOLIO_READ: readonly PmsPermissionCode[] = [
  PMS_PERMISSIONS.CASHIERING_VIEW,
  PMS_PERMISSIONS.FRONT_OFFICE_CHARGE_POST,
  PMS_PERMISSIONS.FRONT_OFFICE_DEPOSIT_POST,
  PMS_PERMISSIONS.FRONT_OFFICE_PAYMENT_POST,
  PMS_PERMISSIONS.FRONT_OFFICE_FOLIO_AUTHORIZE,
  PMS_PERMISSIONS.FRONT_OFFICE_ADJUSTMENT_POST,
  PMS_PERMISSIONS.FRONT_OFFICE_DISCOUNT_POST,
  PMS_PERMISSIONS.FRONT_OFFICE_REFUND,
  PMS_PERMISSIONS.FRONT_OFFICE_INVOICE_AUTHORIZE,
];

/** Check-out screen balance. Check-out itself can read; posting still needs a payment grant. */
export const FO_CHECK_OUT_FOLIO_READ: readonly PmsPermissionCode[] = [
  PMS_PERMISSIONS.CASHIERING_VIEW,
  PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT,
  PMS_PERMISSIONS.CASHIERING_PAYMENT_POST,
  PMS_PERMISSIONS.FRONT_OFFICE_PAYMENT_POST,
  PMS_PERMISSIONS.CASHIERING_FOLIO_CLOSE,
  PMS_PERMISSIONS.FRONT_OFFICE_FOLIO_AUTHORIZE,
];

/** Check-in deposit screen. Check-in can read; posting still needs a deposit grant. */
export const FO_CHECK_IN_FOLIO_READ: readonly PmsPermissionCode[] = [
  PMS_PERMISSIONS.CASHIERING_VIEW,
  PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN,
  PMS_PERMISSIONS.CASHIERING_DEPOSIT_POST,
  PMS_PERMISSIONS.FRONT_OFFICE_DEPOSIT_POST,
  PMS_PERMISSIONS.CASHIERING_CHARGE_POST,
  PMS_PERMISSIONS.FRONT_OFFICE_CHARGE_POST,
];

/** Stay-list balances. Check-in and check-out can read; posting still needs its own grant. */
export const FO_DESK_BALANCE_READ: readonly PmsPermissionCode[] = [
  ...new Set<PmsPermissionCode>([
    ...FO_STAY_FOLIO_READ,
    ...FO_CHECK_IN_FOLIO_READ,
    ...FO_CHECK_OUT_FOLIO_READ,
  ]),
];

export function folioEntryPermissions(type: string): readonly PmsPermissionCode[] {
  switch (type) {
    case "payment":
      return moduleOrDesk(PMS_PERMISSIONS.CASHIERING_PAYMENT_POST, PMS_PERMISSIONS.FRONT_OFFICE_PAYMENT_POST);
    case "deposit":
      return moduleOrDesk(PMS_PERMISSIONS.CASHIERING_DEPOSIT_POST, PMS_PERMISSIONS.FRONT_OFFICE_DEPOSIT_POST);
    case "refund":
      return moduleOrDesk(PMS_PERMISSIONS.CASHIERING_REFUND, PMS_PERMISSIONS.FRONT_OFFICE_REFUND);
    case "adjustment":
      return moduleOrDesk(
        PMS_PERMISSIONS.CASHIERING_ADJUSTMENT_POST,
        PMS_PERMISSIONS.FRONT_OFFICE_ADJUSTMENT_POST,
      );
    case "discount":
      return moduleOrDesk(PMS_PERMISSIONS.CASHIERING_DISCOUNT_POST, PMS_PERMISSIONS.FRONT_OFFICE_DISCOUNT_POST);
    default:
      return moduleOrDesk(PMS_PERMISSIONS.CASHIERING_CHARGE_POST, PMS_PERMISSIONS.FRONT_OFFICE_CHARGE_POST);
  }
}
