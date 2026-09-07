/**
 * Phase 8E2 — PMS package enforcement at the server/mutation layer.
 *
 * Package entitlement is an ADDITIONAL authorization boundary, never a
 * replacement: every caller keeps its existing membership, module and role
 * checks. This file only answers "may this property act as a PMS property
 * right now?" and throws a neutral error when it may not.
 *
 * Expiry and the compatibility default (no explicit row = enabled) are not
 * reimplemented here — they come from the shared Phase 8B1 resolver via the
 * fail-closed, short-cached availability helper from Phase 8D2.
 */
import { publicPackageAvailable } from "./public-package.server";

/** Staff wording: the project's normal access-denied style. */
const PMS_DENIED = "You don't have access to this feature for this property.";
/** Guest wording: neutral, no package or billing hint. */
export const PUBLIC_PMS_UNAVAILABLE = "Online booking is currently unavailable.";

async function pmsAvailable(restaurantId: string): Promise<boolean> {
  // Fail-closed: the helper reports false on any lookup error and never
  // caches a failure.
  return publicPackageAvailable(restaurantId, "pms");
}

/**
 * Staff-facing gate. Call BEFORE the first state-changing write, after (or
 * alongside) the existing membership/role guard.
 */
export async function requirePmsPackage(restaurantId: string): Promise<void> {
  if (!(await pmsAvailable(restaurantId))) throw new Error(PMS_DENIED);
}

/**
 * Public (unauthenticated) gate. The property must already have been resolved
 * safely from its slug or reference.
 */
export async function requirePublicPms(restaurantId: string): Promise<void> {
  if (!(await pmsAvailable(restaurantId))) throw new Error(PUBLIC_PMS_UNAVAILABLE);
}

/** Boolean form for public callers that return a message rather than throw. */
export async function publicPmsAvailable(restaurantId: string): Promise<boolean> {
  return pmsAvailable(restaurantId);
}

/**
 * Wraps an existing membership/role guard so the PMS package is verified
 * immediately after it, before any caller performs its first write.
 */
export async function withPmsPackage<T>(restaurantId: string, guarded: Promise<T>): Promise<T> {
  const result = await guarded;
  await requirePmsPackage(restaurantId);
  return result;
}
