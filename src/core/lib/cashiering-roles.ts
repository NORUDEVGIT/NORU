/** Roles allowed to refund, adjust, discount, close a folio, or close any till. */
export const CASHIER_MANAGE_ROLES = ["owner", "manager"] as const;

/**
 * Payment allocation classifies an existing account payment against issued
 * invoices. It does not post cash, refund, write off, or close an account.
 */
export const CASHIER_ALLOCATE_ROLES = ["owner", "manager", "accountant"] as const;

export function canManageCashiering(role: string): boolean {
  return (CASHIER_MANAGE_ROLES as readonly string[]).includes(role);
}

export function canAllocateAccountPayments(role: string): boolean {
  return (CASHIER_ALLOCATE_ROLES as readonly string[]).includes(role);
}
