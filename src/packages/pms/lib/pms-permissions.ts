/**
 * PMS RBAC catalogue — client-safe constants and validators.
 *
 * Live authorization is resolved on the server from Owner bypass or
 * pms_membership_roles ∪ pms_role_permissions. Role names never authorize.
 * restaurant_users.hotel_role_id is legacy Card 7 setup and is not read here.
 */

export const PMS_PERMISSION_DENIED = "You don't have permission to do that.";
export const PMS_PERMISSION_UNKNOWN = "That permission is not in the PMS catalogue.";
export const PMS_PERMISSION_INACTIVE = "That permission is not active.";
export const PMS_PERMISSION_VIEW_REQUIRED =
  "A module action cannot be granted without its module View permission.";
export const PMS_PERMISSION_CROSS_TENANT = "That role does not belong to this property.";

export const PROFILE_MUST_CHANGE_PASSWORD_DEFAULT = false;

export const PMS_PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",

  RESERVATION_VIEW: "reservation.reservation.view",
  RESERVATION_CREATE: "reservation.reservation.create",
  RESERVATION_EDIT: "reservation.reservation.edit",
  RESERVATION_CANCEL: "reservation.reservation.cancel",
  RESERVATION_ASSIGNMENT_EDIT: "reservation.assignment.edit",
  RESERVATION_RATE_OVERRIDE: "reservation.rate.override",
  RESERVATION_GROUP_EDIT: "reservation.group.edit",
  RESERVATION_WAITLIST_EDIT: "reservation.waitlist.edit",
  RESERVATION_OVERBOOKING_AUTHORIZE: "reservation.overbooking.authorize",

  FRONT_OFFICE_VIEW: "front_office.desk.view",
  FRONT_OFFICE_CHECK_IN: "front_office.check_in.create",
  FRONT_OFFICE_CHECK_OUT: "front_office.check_out.create",
  FRONT_OFFICE_WALK_IN: "front_office.walk_in.create",
  FRONT_OFFICE_STAY_EDIT: "front_office.stay.edit",
  FRONT_OFFICE_NO_SHOW: "front_office.no_show.edit",
  FRONT_OFFICE_CANCEL: "front_office.cancel.cancel",
  FRONT_OFFICE_CHECK_IN_OVERRIDE: "front_office.check_in.override",
  FRONT_OFFICE_FEE_OVERRIDE: "front_office.fee.override",

  GUEST_PROFILE_VIEW: "guest.profile.view",
  GUEST_PROFILE_CREATE: "guest.profile.create",
  GUEST_PROFILE_EDIT: "guest.profile.edit",
  GUEST_PROFILE_ACTIVATE: "guest.profile.activate",
  GUEST_MERGE_AUTHORIZE: "guest.merge.authorize",
  GUEST_RESTRICTION_AUTHORIZE: "guest.restriction.authorize",
  GUEST_PRIVACY_EXPORT: "guest.privacy.export",
  GUEST_PRIVACY_DELETE: "guest.privacy.delete",

  GUEST_ACCOUNT_VIEW: "guest.account.view",
  GUEST_ACCOUNT_CREATE: "guest.account.create",
  GUEST_ACCOUNT_EDIT: "guest.account.edit",
  GUEST_ACCOUNT_ACTIVATE: "guest.account.activate",

  ROOM_INVENTORY_VIEW: "room.inventory.view",
  ROOM_BLOCK_EDIT: "room.block.edit",
  ROOM_RESTRICTION_EDIT: "room.restriction.edit",

  HOUSEKEEPING_VIEW: "housekeeping.board.view",
  HOUSEKEEPING_TASK_CREATE: "housekeeping.task.create",
  HOUSEKEEPING_TASK_EDIT: "housekeeping.task.edit",
  HOUSEKEEPING_TASK_CANCEL: "housekeeping.task.cancel",
  HOUSEKEEPING_INSPECTION_EDIT: "housekeeping.inspection.edit",

  MAINTENANCE_VIEW: "maintenance.view",
  MAINTENANCE_CREATE: "maintenance.work_order.create",
  MAINTENANCE_EDIT: "maintenance.work_order.edit",

  CASHIERING_VIEW: "cashiering.folio.view",
  CASHIERING_CHARGE_POST: "cashiering.charge.post",
  CASHIERING_PAYMENT_POST: "cashiering.payment.post",
  CASHIERING_DEPOSIT_POST: "cashiering.deposit.post",
  CASHIERING_REFUND: "cashiering.folio.refund",
  CASHIERING_ADJUSTMENT_POST: "cashiering.adjustment.post",
  CASHIERING_DISCOUNT_POST: "cashiering.discount.post",
  CASHIERING_TRANSFER_POST: "cashiering.transfer.post",
  CASHIERING_WRITE_OFF: "cashiering.write_off.authorize",
  CASHIERING_FOLIO_CLOSE: "cashiering.folio.authorize",
  CASHIERING_ALLOCATION_EDIT: "cashiering.allocation.edit",

  CASHIERING_SHIFT_VIEW: "cashiering.shift.view",
  CASHIERING_SHIFT_EDIT: "cashiering.shift.edit",
  CASHIERING_SHIFT_AUTHORIZE: "cashiering.shift.authorize",

  CASHIERING_INVOICE_VIEW: "cashiering.invoice.view",
  CASHIERING_INVOICE_EDIT: "cashiering.invoice.edit",
  CASHIERING_INVOICE_AUTHORIZE: "cashiering.invoice.authorize",

  FISCAL_VIEW: "fiscal.view",
  FISCAL_DOCUMENT_AUTHORIZE: "fiscal.document.authorize",

  NIGHT_AUDIT_VIEW: "night_audit.run.view",
  NIGHT_AUDIT_RUN: "night_audit.run.create",
  NIGHT_AUDIT_EXCEPTION_EDIT: "night_audit.exception.edit",
  NIGHT_AUDIT_CLOSE_DATE: "night_audit.business_date.activate",
  NIGHT_AUDIT_FISCAL_AUTHORIZE: "night_audit.fiscal.authorize",
  NIGHT_AUDIT_RECOVER_DATE: "night_audit.business_date.recover",

  RATES_VIEW: "rates.plan.view",
  RATES_CONFIGURE: "rates.plan.configure",
  RATES_ACTIVATE: "rates.plan.activate",
  RATES_CALENDAR_OVERRIDE: "rates.calendar.override",
  RATES_RESTRICTION_CONFIGURE: "rates.restriction.configure",

  REPORTS_VIEW: "reports.pms.view",
  REPORTS_EXPORT: "reports.pms.export",

  CONFIG_PROPERTY_VIEW: "configuration.property.view",
  CONFIG_PROPERTY_CONFIGURE: "configuration.property.configure",
  CONFIG_PROPERTY_ACTIVATE: "configuration.property.activate",
  CONFIG_ROOMS_OPS_VIEW: "configuration.rooms_ops.view",
  CONFIG_ROOMS_OPS_CONFIGURE: "configuration.rooms_ops.configure",
  CONFIG_FINANCIAL_VIEW: "configuration.financial.view",
  CONFIG_FINANCIAL_CONFIGURE: "configuration.financial.configure",
  CONFIG_GUEST_SETUP_VIEW: "configuration.guest_setup.view",
  CONFIG_GUEST_SETUP_CONFIGURE: "configuration.guest_setup.configure",
  CONFIG_ORGANIZATION_VIEW: "configuration.organization.view",
  CONFIG_ORGANIZATION_CONFIGURE: "configuration.organization.configure",
  CONFIG_INTEGRATION_VIEW: "configuration.integration.view",
  CONFIG_INTEGRATION_CONFIGURE: "configuration.integration.configure",

  STAFF_VIEW: "administration.staff.view",
  STAFF_CREATE: "administration.staff.create",
  STAFF_EDIT: "administration.staff.edit",
  STAFF_ACTIVATE: "administration.staff.activate",
  STAFF_ASSIGN_ROLES: "administration.staff.assign_roles",
  STAFF_RESET_ACCESS: "administration.staff.reset_access",

  ROLES_VIEW: "administration.roles.view",
  ROLES_CREATE: "administration.roles.create",
  ROLES_EDIT: "administration.roles.edit",
  ROLES_ACTIVATE: "administration.roles.activate",
  ROLES_ASSIGN_PERMISSIONS: "administration.roles.assign_permissions",
} as const;

export type PmsPermissionCode = (typeof PMS_PERMISSIONS)[keyof typeof PMS_PERMISSIONS];

export const PMS_PERMISSION_CODES = Object.values(PMS_PERMISSIONS) as PmsPermissionCode[];

export type PmsPermissionRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const RETIRED_PMS_PERMISSION_CODES = [
  "front_office.check_out.print",
  "reservation.reservation.print",
  "reservation.quote.view",
  "reservation.status.edit",
  "guest.vip.edit",
  "room.image.delete",
  "room.room_type.configure",
  "room.room.configure",
  "room.room_type.activate",
  "room.room.activate",
  "room.amenity.configure",
  "housekeeping.restriction.edit",
  "housekeeping.maintenance.edit",
  "administration.module_access.configure",
  "configuration.security.configure",
  "rates.quote.view",
] as const;

export type RetiredPmsPermissionCode = (typeof RETIRED_PMS_PERMISSION_CODES)[number];

/**
 * Duplicates of canonical codes. 0194 marks them inactive.
 * Live gates use the typed catalogue, never these strings.
 */
export const PHASE25_RETIRED_PMS_PERMISSION_CODES = [
  "cashiering.folio.create",
  "cashiering.room_charge.post",
  "front_office.fee.post",
  "front_office.guest_request.edit",
  "guest.document.edit",
  "housekeeping.discrepancy.edit",
  "reports.pms.print",
] as const;

/** Seeded codes kept active but outside the UI catalogue. Not live gates. */
export const LEGACY_ACTIVE_PMS_PERMISSION_CODES = [
  "front_office.check_out.override",
  "cashiering.room_charge.override",
  "distribution.channel.view",
  "distribution.channel.activate",
  "distribution.mapping.configure",
  "distribution.direct_booking.configure",
  "configuration.reports.configure",
  "configuration.import.configure",
  "data.import_preview.view",
  "data.import.create",
] as const;

const TWO_PART_VIEWS = new Set<PmsPermissionCode>([
  PMS_PERMISSIONS.DASHBOARD_VIEW,
  PMS_PERMISSIONS.MAINTENANCE_VIEW,
  PMS_PERMISSIONS.FISCAL_VIEW,
]);

export function parentViewPermission(code: PmsPermissionCode): PmsPermissionCode {
  if (code === PMS_PERMISSIONS.DASHBOARD_VIEW) return PMS_PERMISSIONS.DASHBOARD_VIEW;
  if (code === PMS_PERMISSIONS.MAINTENANCE_VIEW || code.startsWith("maintenance.")) {
    return PMS_PERMISSIONS.MAINTENANCE_VIEW;
  }
  if (code === PMS_PERMISSIONS.FISCAL_VIEW || code.startsWith("fiscal.")) {
    return PMS_PERMISSIONS.FISCAL_VIEW;
  }
  if (code.startsWith("reservation.")) return PMS_PERMISSIONS.RESERVATION_VIEW;
  if (code.startsWith("front_office.")) return PMS_PERMISSIONS.FRONT_OFFICE_VIEW;
  if (
    code.startsWith("guest.profile.") ||
    code.startsWith("guest.merge.") ||
    code.startsWith("guest.restriction.") ||
    code.startsWith("guest.privacy.")
  ) {
    return PMS_PERMISSIONS.GUEST_PROFILE_VIEW;
  }
  if (code.startsWith("guest.account.")) return PMS_PERMISSIONS.GUEST_ACCOUNT_VIEW;
  if (code.startsWith("room.")) return PMS_PERMISSIONS.ROOM_INVENTORY_VIEW;
  if (code.startsWith("housekeeping.")) return PMS_PERMISSIONS.HOUSEKEEPING_VIEW;
  if (code.startsWith("cashiering.shift.")) return PMS_PERMISSIONS.CASHIERING_SHIFT_VIEW;
  if (code.startsWith("cashiering.invoice.")) return PMS_PERMISSIONS.CASHIERING_INVOICE_VIEW;
  if (code.startsWith("cashiering.")) return PMS_PERMISSIONS.CASHIERING_VIEW;
  if (code.startsWith("night_audit.")) return PMS_PERMISSIONS.NIGHT_AUDIT_VIEW;
  if (code.startsWith("rates.")) return PMS_PERMISSIONS.RATES_VIEW;
  if (code.startsWith("reports.")) return PMS_PERMISSIONS.REPORTS_VIEW;
  if (code.startsWith("configuration.property.")) return PMS_PERMISSIONS.CONFIG_PROPERTY_VIEW;
  if (code.startsWith("configuration.rooms_ops.")) return PMS_PERMISSIONS.CONFIG_ROOMS_OPS_VIEW;
  if (code.startsWith("configuration.financial.")) return PMS_PERMISSIONS.CONFIG_FINANCIAL_VIEW;
  if (code.startsWith("configuration.guest_setup.")) return PMS_PERMISSIONS.CONFIG_GUEST_SETUP_VIEW;
  if (code.startsWith("configuration.organization."))
    return PMS_PERMISSIONS.CONFIG_ORGANIZATION_VIEW;
  if (code.startsWith("configuration.integration.")) return PMS_PERMISSIONS.CONFIG_INTEGRATION_VIEW;
  if (code.startsWith("administration.staff.")) return PMS_PERMISSIONS.STAFF_VIEW;
  if (code.startsWith("administration.roles.")) return PMS_PERMISSIONS.ROLES_VIEW;
  return code;
}

export const PMS_PERMISSION_PARENT_VIEW: Record<PmsPermissionCode, PmsPermissionCode> =
  Object.fromEntries(
    PMS_PERMISSION_CODES.map((code) => [code, parentViewPermission(code)]),
  ) as Record<PmsPermissionCode, PmsPermissionCode>;

const CRITICAL_CODES: PmsPermissionCode[] = [
  PMS_PERMISSIONS.RESERVATION_OVERBOOKING_AUTHORIZE,
  PMS_PERMISSIONS.GUEST_PRIVACY_DELETE,
  PMS_PERMISSIONS.CASHIERING_WRITE_OFF,
  PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE,
  PMS_PERMISSIONS.NIGHT_AUDIT_FISCAL_AUTHORIZE,
  PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE,
  PMS_PERMISSIONS.CONFIG_PROPERTY_ACTIVATE,
  PMS_PERMISSIONS.ROLES_CREATE,
  PMS_PERMISSIONS.ROLES_ASSIGN_PERMISSIONS,
];

const HIGH_CODES: PmsPermissionCode[] = [
  PMS_PERMISSIONS.RESERVATION_CANCEL,
  PMS_PERMISSIONS.RESERVATION_RATE_OVERRIDE,
  PMS_PERMISSIONS.RESERVATION_GROUP_EDIT,
  PMS_PERMISSIONS.RESERVATION_WAITLIST_EDIT,
  PMS_PERMISSIONS.FRONT_OFFICE_NO_SHOW,
  PMS_PERMISSIONS.FRONT_OFFICE_CANCEL,
  PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN_OVERRIDE,
  PMS_PERMISSIONS.FRONT_OFFICE_FEE_OVERRIDE,
  PMS_PERMISSIONS.GUEST_MERGE_AUTHORIZE,
  PMS_PERMISSIONS.GUEST_RESTRICTION_AUTHORIZE,
  PMS_PERMISSIONS.GUEST_PRIVACY_EXPORT,
  PMS_PERMISSIONS.ROOM_BLOCK_EDIT,
  PMS_PERMISSIONS.ROOM_RESTRICTION_EDIT,
  PMS_PERMISSIONS.CASHIERING_REFUND,
  PMS_PERMISSIONS.CASHIERING_ADJUSTMENT_POST,
  PMS_PERMISSIONS.CASHIERING_DISCOUNT_POST,
  PMS_PERMISSIONS.CASHIERING_TRANSFER_POST,
  PMS_PERMISSIONS.CASHIERING_FOLIO_CLOSE,
  PMS_PERMISSIONS.CASHIERING_SHIFT_AUTHORIZE,
  PMS_PERMISSIONS.CASHIERING_INVOICE_AUTHORIZE,
  PMS_PERMISSIONS.FISCAL_DOCUMENT_AUTHORIZE,
  PMS_PERMISSIONS.RATES_ACTIVATE,
  PMS_PERMISSIONS.RATES_CALENDAR_OVERRIDE,
  PMS_PERMISSIONS.STAFF_CREATE,
  PMS_PERMISSIONS.STAFF_ACTIVATE,
  PMS_PERMISSIONS.STAFF_ASSIGN_ROLES,
  PMS_PERMISSIONS.STAFF_RESET_ACCESS,
  PMS_PERMISSIONS.ROLES_EDIT,
  PMS_PERMISSIONS.ROLES_ACTIVATE,
];

export function permissionRisk(code: PmsPermissionCode): PmsPermissionRisk {
  if (CRITICAL_CODES.includes(code)) return "CRITICAL";
  if (HIGH_CODES.includes(code)) return "HIGH";
  if (code === parentViewPermission(code)) return "LOW";
  return "MEDIUM";
}

export const PMS_PERMISSION_RISK: Record<PmsPermissionCode, PmsPermissionRisk> = Object.fromEntries(
  PMS_PERMISSION_CODES.map((code) => [code, permissionRisk(code)]),
) as Record<PmsPermissionCode, PmsPermissionRisk>;

export function isPmsPermissionCode(value: string): value is PmsPermissionCode {
  return (PMS_PERMISSION_CODES as readonly string[]).includes(value);
}

export function isRetiredPmsPermissionCode(value: string): boolean {
  return (
    (RETIRED_PMS_PERMISSION_CODES as readonly string[]).includes(value) ||
    (PHASE25_RETIRED_PMS_PERMISSION_CODES as readonly string[]).includes(value)
  );
}

export function isModuleViewPermission(code: PmsPermissionCode): boolean {
  return parentViewPermission(code) === code;
}

export function parsePermissionCodeParts(code: string): {
  module: string;
  functionKey: string;
  action: string;
} {
  const parts = code.split(".");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { module: parts[0], functionKey: parts[1], action: parts[1] };
  }
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return { module: parts[0], functionKey: parts[1], action: parts[2] };
  }
  throw new Error(PMS_PERMISSION_UNKNOWN);
}

export function normalizePermissionCodes(values: readonly string[]): PmsPermissionCode[] {
  return [...new Set(values.filter(isPmsPermissionCode))];
}

export function unionPermissionCodes(...groups: Array<Iterable<string>>): PmsPermissionCode[] {
  const codes = new Set<PmsPermissionCode>();
  for (const group of groups) {
    for (const value of group) {
      if (isPmsPermissionCode(value)) codes.add(value);
    }
  }
  return [...codes];
}

export function roleGrantErrors(codes: readonly string[]): string[] {
  const errors: string[] = [];
  const unique = [...new Set(codes)];
  const active = new Set<PmsPermissionCode>();
  for (const code of unique) {
    if (isRetiredPmsPermissionCode(code) || !isPmsPermissionCode(code)) {
      errors.push(`${code}: ${PMS_PERMISSION_UNKNOWN}`);
      continue;
    }
    active.add(code);
  }
  for (const code of active) {
    const view = parentViewPermission(code);
    if (code !== view && !active.has(view)) {
      errors.push(`${code}: ${PMS_PERMISSION_VIEW_REQUIRED}`);
    }
  }
  return errors;
}

export function assertRolePermissionGrants(codes: readonly string[]): PmsPermissionCode[] {
  const errors = roleGrantErrors(codes);
  if (errors.length) throw new Error(errors[0] ?? PMS_PERMISSION_VIEW_REQUIRED);
  return normalizePermissionCodes(codes);
}

export function actorMayGrantPermissions(
  actor: { isOwner: boolean; codes: Iterable<string> },
  grants: readonly string[],
): boolean {
  if (actor.isOwner) {
    return roleGrantErrors(grants).length === 0;
  }
  const have = new Set(normalizePermissionCodes([...actor.codes]));
  return (
    normalizePermissionCodes(grants).every((code) => have.has(code)) &&
    roleGrantErrors(grants).length === 0
  );
}

export function actorMayAssignRole(
  actor: { isOwner: boolean; codes: Iterable<string> },
  roleGrants: readonly string[],
): boolean {
  return actorMayGrantPermissions(actor, roleGrants);
}

/** PMS staff permissions never manage an Owner membership. */
export function assertOwnerMembershipUntouched(actorIsOwner: boolean, targetRole: string): void {
  if (targetRole === "owner" && !actorIsOwner) throw new Error(PMS_PERMISSION_DENIED);
}

export function criticalPermissionCodes(): PmsPermissionCode[] {
  return [...CRITICAL_CODES];
}

export function twoPartPermissionCodes(): PmsPermissionCode[] {
  return [...TWO_PART_VIEWS];
}

export function mustChangePasswordFromProfile(
  row: { must_change_password?: boolean | null } | null | undefined,
): boolean {
  return row?.must_change_password === true;
}
