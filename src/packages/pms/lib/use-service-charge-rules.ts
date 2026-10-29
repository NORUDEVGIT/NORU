import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getServiceChargeRules } from "@/packages/pms/lib/room-charge-guest-total.functions";

export function useServiceChargeRules(restaurantId: string | undefined, enabled = true) {
  const fetchRules = useServerFn(getServiceChargeRules);
  return useQuery({
    queryKey: ["service-charge-rules", restaurantId],
    queryFn: () => fetchRules({ data: { restaurantId: restaurantId! } }),
    enabled: Boolean(restaurantId) && enabled,
    retry: false,
    staleTime: 60_000,
  });
}
