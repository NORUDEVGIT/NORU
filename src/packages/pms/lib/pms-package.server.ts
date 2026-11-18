/**
 * Phase 8E2 — PMS package enforcement at the server/mutation layer.
 *
 * Package entitlement is an ADDITIONAL authorization boundary, never a
 * replacement: every caller keeps its existing membership, module and role
 * checks. This file only answers "may this property act as a PMS property
 * right now?" and throws a neutral error when it may not.
 *
 * Expiry and missing-row compatibility are not reimplemented here — they
 * come from the shared resolver via the fail-closed availability helper.
 */
import { publicPackageAvailable } from "@/core/lib/public-package.server";

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
  const { assertRestaurantOperational } = await import("@/core/lib/restaurant-access.server");
  await assertRestaurantOperational(restaurantId);
  if (!(await pmsAvailable(restaurantId))) throw new Error(PMS_DENIED);
}

/** Staff wording when an approved property has not been activated yet. */
export const PMS_NOT_LIVE = "Operations open after this property is activated in Settings.";

/** Fail-closed read of the single go-live flag written by Activate. */
export async function pmsPropertyLive(restaurantId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("pms_set1_live")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) {
    console.error("[pmsPropertyLive]", error.message);
    return false;
  }
  return data?.pms_set1_live === true;
}

/**
 * Operational gate: approval and package (via `requirePmsPackage`), then go-live.
 * Settings / setup APIs must not call this; they stay on `requirePmsPackage`.
 */
export async function requirePmsLive(restaurantId: string): Promise<void> {
  await requirePmsPackage(restaurantId);
  if (!(await pmsPropertyLive(restaurantId))) throw new Error(PMS_NOT_LIVE);
}

/** `withPmsPackage` for operational guards: membership/role first, then live. */
export async function withPmsLive<T>(restaurantId: string, guarded: Promise<T>): Promise<T> {
  const result = await guarded;
  await requirePmsLive(restaurantId);
  return result;
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
