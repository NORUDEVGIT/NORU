/** Roles allowed to refund, adjust, discount, close a folio, or close any till. */
export const CASHIER_MANAGE_ROLES = ["owner", "manager"] as const;

export function canManageCashiering(role: string): boolean {
  return (CASHIER_MANAGE_ROLES as readonly string[]).includes(role);
}
