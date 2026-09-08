/**
 * Phase 8D1 — central authenticated route gate for package entitlements.
 *
 * Every guarded staff route calls `requireRoutePackage(key)` from its own
 * `beforeLoad`, immediately after the existing sign-in check. The entitlement
 * itself (explicit disable, expiry, compatibility default) is resolved once,
 * server-side, by the Phase 8B1 resolver — no route file repeats that logic.
 *
 * Phase 8D1 security patch: the gate is FAIL SAFE. A successful resolver
 * answer of "enabled" (explicit or compatibility default) allows access; a
 * failure to verify does NOT. An error is never cached and never treated as
 * a compatibility default.
 *
 * This gate can only take access away. Existing role/module permissions still
 * run afterwards exactly as before.
 */
import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyRestaurants } from "./restaurant.functions";
import { getMyRoutePackageAccess } from "./package-entitlements.functions";
import type { PackageKey } from "./package-entitlements";

const TTL_MS = 30_000;

type GuardResult = "allowed" | "blocked" | "unverified";

/** Keyed by `${userId}:${packageKey}` so no result can cross accounts. */
const cache = new Map<string, { at: number; allowed: boolean }>();
let lastUserId: string | null = null;

/** Dropped on sign-out / property switch so a new session never inherits state. */
export function clearRoutePackageCache() {
  cache.clear();
  lastUserId = null;
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function resolve(packageKey: PackageKey): Promise<GuardResult> {
  const userId = await currentUserId();

  // A different signed-in user must never read the previous one's results.
  if (userId !== lastUserId) {
    cache.clear();
    lastUserId = userId;
  }

  const cacheKey = userId ? `${userId}:${packageKey}` : null;
  if (cacheKey) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.allowed ? "allowed" : "blocked";
  }

  try {
    const { allowed } = await getMyRoutePackageAccess({ data: { packageKey } });
    // Only real answers are cached; errors below never reach this line.
    if (cacheKey) cache.set(cacheKey, { at: Date.now(), allowed });
    return allowed ? "allowed" : "blocked";
  } catch {
    // Fail safe: an unverifiable check is not a compatibility default.
    return "unverified";
  }
}

export async function requireRoutePackage(packageKey: PackageKey): Promise<void> {
  const result = await resolve(packageKey);
  if (result === "allowed") return;
  if (result === "blocked") {
    throw redirect({ to: "/restaurant/home", search: { blocked: packageKey }, replace: true });
  }
  throw redirect({ to: "/restaurant/home", search: { verify: "failed" }, replace: true });
}

/** Core operational routes: pending/suspended/rejected owners are sent home. */
export async function requireOperationalRestaurantRoute(): Promise<void> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw redirect({ to: "/restaurant/login" });
  }
  const memberships = await getMyRestaurants();
  const restaurant = memberships[0]?.restaurant;
  if (!restaurant || !restaurant.approved || !restaurant.active) {
    throw redirect({ to: "/restaurant/home", replace: true });
  }
}
