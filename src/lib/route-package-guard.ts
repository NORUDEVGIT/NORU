/**
 * Phase 8D1 — central authenticated route gate for package entitlements.
 *
 * Every guarded staff route calls `requireRoutePackage(key)` from its own
 * `beforeLoad`, immediately after the existing sign-in check. The entitlement
 * itself (explicit disable, expiry, compatibility default) is resolved once,
 * server-side, by the Phase 8B1 resolver — no route file repeats that logic.
 *
 * This gate can only take access away. Existing role/module permissions still
 * run afterwards exactly as before.
 */
import { redirect } from "@tanstack/react-router";
import { getMyRoutePackageAccess } from "./package-entitlements.functions";
import type { PackageKey } from "./package-entitlements";

const TTL_MS = 30_000;

const cache = new Map<PackageKey, { at: number; allowed: boolean }>();

/** Dropped on sign-out / property switch so a new session never inherits state. */
export function clearRoutePackageCache() {
  cache.clear();
}

async function isAllowed(packageKey: PackageKey): Promise<boolean> {
  const hit = cache.get(packageKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.allowed;

  try {
    const { allowed } = await getMyRoutePackageAccess({ data: { packageKey } });
    cache.set(packageKey, { at: Date.now(), allowed });
    return allowed;
  } catch {
    // Compatibility stance: a transient failure must never lock a working
    // property out of its own pages.
    return true;
  }
}

export async function requireRoutePackage(packageKey: PackageKey): Promise<void> {
  if (await isAllowed(packageKey)) return;
  throw redirect({ to: "/restaurant/home", search: { blocked: packageKey }, replace: true });
}
