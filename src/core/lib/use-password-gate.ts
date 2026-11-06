import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyPasswordGate } from "./password-lifecycle.functions";

export const passwordGateQueryKey = ["password-gate"] as const;

export function invalidatePasswordGate(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: passwordGateQueryKey });
}

export function usePasswordGate(enabled: boolean) {
  const fetchGate = useServerFn(getMyPasswordGate);
  return useQuery({
    queryKey: passwordGateQueryKey,
    queryFn: () => fetchGate(),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}
