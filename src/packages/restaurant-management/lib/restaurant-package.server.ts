/**
 * Phase 8E1 — Restaurant Management package enforcement at the server layer.
 *
 * Package entitlement is an ADDITIONAL authorization boundary, never a
 * replacement: every caller keeps its existing membership, module and role
 * checks. This file only answers "may this property act as a Restaurant
 * Management property right now?" and throws a neutral error when it may not.
 *
 * Expiry and the compatibility default (no explicit row = enabled) are not
 * reimplemented here — they come from the shared Phase 8B1 resolver via the
 * fail-closed, short-cached availability helper introduced in Phase 8D2.
 */
import { publicPackageAvailable } from "@/core/lib/public-package.server";
import type { PackageKey } from "@/core/lib/package-entitlements";

/** Wording for signed-in staff: the project's normal access-denied style. */
const RM_DENIED = "You don't have access to Restaurant Management for this property.";
const PMS_DENIED = "You don't have access to this feature for this property.";
/** Wording for anonymous customers: neutral, no package or billing hint. */
export const PUBLIC_UNAVAILABLE = "This ordering service is currently unavailable.";

async function available(restaurantId: string, key: PackageKey): Promise<boolean> {
  // Fail-closed: the helper reports false on any lookup error and never
  // caches a failure.
  return publicPackageAvailable(restaurantId, key);
}

/**
 * Staff-facing gate. Call BEFORE the first state-changing write, after (or
 * alongside) the existing membership/role guard.
 */
export async function requireRestaurantManagement(restaurantId: string): Promise<void> {
  if (!(await available(restaurantId, "restaurant_management"))) throw new Error(RM_DENIED);
}

/**
 * Public (unauthenticated) ordering gate. The restaurant must already have
 * been resolved safely from its slug or QR token.
 */
export async function requirePublicRestaurantManagement(restaurantId: string): Promise<void> {
  if (!(await available(restaurantId, "restaurant_management"))) throw new Error(PUBLIC_UNAVAILABLE);
}

/** Boolean form for public callers that return a message rather than throw. */
export async function publicRestaurantManagementAvailable(restaurantId: string): Promise<boolean> {
  return available(restaurantId, "restaurant_management");
}

/**
 * Charge to Room is a cross-package bridge: a Restaurant Management order
 * posting onto a PMS folio. BOTH packages must be live.
 */
export async function requireRestaurantAndPms(restaurantId: string): Promise<void> {
  await requireRestaurantManagement(restaurantId);
  if (!(await available(restaurantId, "pms"))) throw new Error(PMS_DENIED);
}
