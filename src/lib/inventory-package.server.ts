/**
 * Phase 8G2C — package gate for stock writes.
 *
 * Inventory is reachable from two entitled packages: Restaurant Management
 * (operational restaurant stock) and Back Office (central inventory /
 * warehouse). A write is allowed when the PROPERTY holds at least one of them.
 *
 * The package is resolved server-side from the property's entitlements through
 * the shared fail-closed resolver. The browser never supplies a package name,
 * so no caller can widen its own access, and this gate never replaces the
 * existing membership, role and Inventory module checks — those run first.
 */
import { publicPackageAvailable } from "./public-package.server";

const DENIED = "Inventory isn't available for this property.";

export async function inventoryWriteAllowed(restaurantId: string): Promise<boolean> {
  const [rm, bo] = await Promise.all([
    publicPackageAvailable(restaurantId, "restaurant_management"),
    publicPackageAvailable(restaurantId, "back_office"),
  ]);
  return rm || bo;
}

export async function requireInventoryWritePackage(restaurantId: string): Promise<void> {
  if (!(await inventoryWriteAllowed(restaurantId))) throw new Error(DENIED);
}
