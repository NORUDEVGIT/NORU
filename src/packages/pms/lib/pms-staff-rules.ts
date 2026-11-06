/** Stored on restaurant_users.role for PMS-created staff. Not a PMS authorization grant. */
export const PMS_STAFF_MEMBERSHIP_CATEGORY = "receptionist" as const;

export function assertActivePmsStaffHasRole(active: boolean, roleIds: readonly string[]): void {
  if (active && new Set(roleIds.filter((id) => id.length > 0)).size < 1) {
    throw new Error("Active hotel staff need at least one role.");
  }
}
