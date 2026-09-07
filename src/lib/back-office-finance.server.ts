/**
 * Phase 8G2E — Back Office · Accounting & Finance, server-only helpers.
 *
 * Back Office does NOT own any financial transaction. PMS keeps folios, hotel
 * payments, deposits, refunds, cashier shifts and night audit; Restaurant
 * Management keeps restaurant orders, payments and till shifts; Procurement
 * keeps purchase orders and receiving; Inventory keeps stock and cost inputs.
 *
 * This file only authorizes a narrow, READ-ONLY, high-level finance summary and
 * decides which source packages may be queried at all. It grants nothing: the
 * caller must already hold the existing Accounting & Finance module access, and
 * the Back Office package must be switched on for the property.
 */
import { requireModuleRole } from "./module-access.server";
import { publicPackageAvailable } from "./public-package.server";
import type { AuthedCtx, Membership } from "./workforce.server";
import type { PackageKey } from "./package-entitlements";

/** Roles allowed to read the property-level finance summary. */
export const FINANCE_READ_ROLES = ["owner", "manager", "accountant"] as const;

const NO_ACCESS = "You don't have access to Accounting & Finance for this property.";
const NO_BACK_OFFICE = "Back Office isn't available for this property.";

/**
 * Finance read gate. Order matters: existing module + role access first, then
 * the Back Office package. The package alone can never grant a finance read.
 */
export async function requireBackOfficeFinanceRead(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const membership = await requireModuleRole(
    context,
    restaurantId,
    "accounting_finance",
    FINANCE_READ_ROLES,
    NO_ACCESS,
  );
  if (!(await publicPackageAvailable(restaurantId, "back_office"))) {
    throw new Error(NO_BACK_OFFICE);
  }
  return membership;
}

/** Fail-closed availability for one source package. */
export async function sourceAvailable(
  restaurantId: string,
  key: PackageKey,
): Promise<boolean> {
  return publicPackageAvailable(restaurantId, key);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
