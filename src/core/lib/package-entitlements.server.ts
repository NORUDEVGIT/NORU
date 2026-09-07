/**
 * Phase 8B1 — the one authoritative server-side package entitlement resolver.
 *
 * Every package question goes through here; no route or component should
 * query restaurant_package_entitlements directly. Nothing in this phase calls
 * `requirePropertyPackage` — it exists ready for the later enforcement phase.
 */
import {
  PACKAGE_KEYS,
  PACKAGE_LABELS,
  packageFlags,
  resolvePackages,
  type PackageEntitlementRow,
  type PackageKey,
  type PackageState,
} from "./package-entitlements";

interface QueryClient {
  from: (table: string) => any;
}

async function loadRows(client: QueryClient, restaurantId: string): Promise<PackageEntitlementRow[]> {
  const { data } = await client
    .from("restaurant_package_entitlements")
    .select("package_key, enabled, activated_at, expires_at")
    .eq("restaurant_id", restaurantId);
  return (data ?? []) as PackageEntitlementRow[];
}

/** All four package states for a property, each tagged explicit vs default. */
export async function getPropertyPackageEntitlements(
  client: QueryClient,
  restaurantId: string,
  now: Date = new Date(),
): Promise<Record<PackageKey, PackageState>> {
  return resolvePackages(await loadRows(client, restaurantId), now);
}

export async function propertyHasPackage(
  client: QueryClient,
  restaurantId: string,
  packageKey: PackageKey,
  now: Date = new Date(),
): Promise<boolean> {
  const states = await getPropertyPackageEntitlements(client, restaurantId, now);
  return states[packageKey].enabled;
}

/**
 * Package gate for a later enforcement phase. Deliberately unused in 8B1.
 */
export async function requirePropertyPackage(
  client: QueryClient,
  restaurantId: string,
  packageKey: PackageKey,
): Promise<void> {
  if (!(await propertyHasPackage(client, restaurantId, packageKey))) {
    throw new Error(`${PACKAGE_LABELS[packageKey]} isn't enabled for this property.`);
  }
}

/**
 * Service-role read for the Phase 8B2 Platform Admin screen. Keeps the
 * explicit-vs-compatibility distinction so an admin can see whether a package
 * has actually been configured.
 */
export async function getPackageStatesForAdmin(restaurantId: string): Promise<PackageState[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const states = await getPropertyPackageEntitlements(supabaseAdmin as unknown as QueryClient, restaurantId);
  return PACKAGE_KEYS.map((key) => states[key]);
}

export { packageFlags };
