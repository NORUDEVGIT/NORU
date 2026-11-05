import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyPmsPermissions } from "./pms-permissions.functions";
import type { PmsPermissionCode } from "./pms-permissions";
import {
  pmsCan,
  pmsCanAll,
  pmsCanAny,
  pmsPermissionsQueryKey,
  type PmsAccessSnapshot,
} from "./pms-client-access";

const EMPTY: PmsAccessSnapshot = { isOwner: false, codes: [] };

export function invalidatePmsPermissions(queryClient: QueryClient, restaurantId: string) {
  return queryClient.invalidateQueries({ queryKey: pmsPermissionsQueryKey(restaurantId) });
}

/**
 * One cached permission snapshot per property.
 * Owner comes from the server payload. Role strings are not consulted.
 * While the query is in flight, can/canAny/canAll are false. Callers must
 * check isLoading before treating that as a denial redirect.
 */
export function usePmsPermissions(restaurantId: string | undefined) {
  const queryClient = useQueryClient();
  const fetchPermissions = useServerFn(getMyPmsPermissions);
  const query = useQuery({
    queryKey: restaurantId ? pmsPermissionsQueryKey(restaurantId) : ["pms-permissions", "none"],
    queryFn: () => fetchPermissions({ data: { restaurantId: restaurantId! } }),
    enabled: Boolean(restaurantId),
    retry: false,
    staleTime: 60_000,
  });

  const access: PmsAccessSnapshot = query.data
    ? { isOwner: query.data.isOwner, codes: query.data.codes }
    : EMPTY;

  const can = useCallback(
    (code: PmsPermissionCode) => pmsCan(access, code),
    [access.isOwner, access.codes],
  );
  const canAny = useCallback(
    (codes: readonly PmsPermissionCode[]) => pmsCanAny(access, codes),
    [access.isOwner, access.codes],
  );
  const canAll = useCallback(
    (codes: readonly PmsPermissionCode[]) => pmsCanAll(access, codes),
    [access.isOwner, access.codes],
  );

  return {
    isOwner: access.isOwner,
    permissions: access.codes,
    membershipId: query.data?.membershipId,
    can,
    canAny,
    canAll,
    isLoading: Boolean(restaurantId) && query.isPending,
    isError: query.isError,
    refetch: () => {
      if (!restaurantId) return Promise.resolve();
      return invalidatePmsPermissions(queryClient, restaurantId);
    },
  };
}
