/**
 * Phase 8C — the single client-side source of package entitlement state.
 *
 * Presentation only: this decides what a tenant user SEES, never what they
 * may do. Direct routes and server functions are unaffected in this phase.
 * A property with no explicit entitlement row resolves as enabled
 * (compatibility mode), so existing tenants see exactly what they saw before.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyPackageEntitlements } from "./package-entitlements.functions";
import type { PackageKey } from "./package-entitlements";

export interface PackageVisibility {
  /** True while the entitlements are still loading. */
  loading: boolean;
  /** Resolved flag per package; defaults to visible until we know otherwise. */
  has: (key: PackageKey) => boolean;
}

export function usePackageEntitlements(restaurantId: string | undefined): PackageVisibility {
  const fetchPackages = useServerFn(getMyPackageEntitlements);

  const query = useQuery({
    queryKey: ["my-packages", restaurantId],
    queryFn: () => fetchPackages({ data: { restaurantId: restaurantId! } }),
    enabled: !!restaurantId,
    retry: false,
    staleTime: 60_000,
  });

  const packages = query.data?.packages;

  return {
    loading: !!restaurantId && query.isLoading,
    // Until the answer arrives (or if it fails) we keep the compatibility
    // stance and show the package — hiding on an error would look like a
    // regression to an existing tenant.
    has: (key: PackageKey) => (packages ? packages[key] : true),
  };
}
