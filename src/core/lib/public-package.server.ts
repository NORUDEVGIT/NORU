/**
 * Phase 8D2 — the one public-safe package availability resolver.
 *
 * Public (unauthenticated) surfaces cannot use the membership-based
 * entitlement resolver, so this helper answers a single narrow question for a
 * property that has ALREADY been resolved safely from a public slug/token:
 * "is this package available right now?".
 *
 * It returns a bare boolean. No source, no activated_at, no expires_at, no
 * admin metadata ever crosses this boundary. Expiry and compatibility-default
 * semantics are not reimplemented here — they come from the shared resolver.
 */
import type { PackageKey } from "./package-entitlements";

interface CacheEntry {
  value: boolean;
  expiresAtMs: number;
}

/** Positive answers are safe to hold briefly. */
const TTL_MS = 30_000;
/**
 * Negative answers are held only for a moment: when a package is switched back
 * on (or a test row is removed) the property must recover almost immediately
 * instead of failing for another half-minute.
 */
const DENIED_TTL_MS = 3_000;
const cache = new Map<string, CacheEntry>();


/**
 * Availability for one already-resolved property. Fail-safe: any resolver or
 * connectivity error reports UNAVAILABLE and is never cached.
 */
export async function publicPackageAvailable(
  restaurantId: string,
  packageKey: PackageKey,
): Promise<boolean> {
  const key = `${restaurantId}:${packageKey}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAtMs > Date.now()) return hit.value;

  try {
    const { restaurantIsOperational } = await import("./restaurant-access.server");
    if (!(await restaurantIsOperational(restaurantId))) {
      cache.set(key, { value: false, expiresAtMs: Date.now() + DENIED_TTL_MS });
      return false;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { propertyHasPackage } = await import("./package-entitlements.server");
    const value = await propertyHasPackage(
      supabaseAdmin as unknown as { from: (t: string) => any },
      restaurantId,
      packageKey,
    );
    cache.set(key, { value, expiresAtMs: Date.now() + (value ? TTL_MS : DENIED_TTL_MS) });
    return value;
  } catch (error) {
    // Server-side only; nothing about this reaches the visitor.
    console.error("[publicPackageAvailable]", (error as Error).message);
    return false;
  }
}

/** Test/maintenance helper — drops the short-lived availability cache. */
export function clearPublicPackageCache(): void {
  cache.clear();
}
