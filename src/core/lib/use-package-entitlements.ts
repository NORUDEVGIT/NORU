/**
 * Phase 8C — the single client-side source of package entitlement state.
 *
 * Presentation only: this decides what a tenant user SEES, never what they
 * may do. Direct routes and server functions keep their own gates.
 * Missing-row visibility comes from `resolvePackages` / `packageCompatibilityDefault`.
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
    // Hide until loaded so a pending tenant never flashes package tiles.
    has: (key: PackageKey) => (packages ? packages[key] : false),
  };
}
