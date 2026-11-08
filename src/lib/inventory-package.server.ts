/**
 * Package gate for stock writes.
 *
 * Shared hotel inventory is a PMS/Core service. A write is allowed when the
 * property holds PMS. This gate never replaces membership, role, or Inventory
 * module checks — those run first.
 */
import { publicPackageAvailable } from "@/core/lib/public-package.server";
import { inventoryWritePackageAllowed } from "@/core/lib/shared-core-access";

const DENIED = "Inventory isn't available for this property.";

export async function inventoryWriteAllowed(restaurantId: string): Promise<boolean> {
  const pms = await publicPackageAvailable(restaurantId, "pms");
  return inventoryWritePackageAllowed({ pms });
}

export async function requireInventoryWritePackage(restaurantId: string): Promise<void> {
  if (!(await inventoryWriteAllowed(restaurantId))) throw new Error(DENIED);
}
