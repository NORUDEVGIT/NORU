import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPackageChargeRules } from "@/packages/pms/lib/room-charge-guest-total.functions";

export function usePackageChargeRules(restaurantId: string | undefined, enabled = true) {
  const fetchRules = useServerFn(getPackageChargeRules);
  return useQuery({
    queryKey: ["package-charge-rules", restaurantId],
    queryFn: () => fetchRules({ data: { restaurantId: restaurantId! } }),
    enabled: Boolean(restaurantId) && enabled,
    retry: false,
    staleTime: 60_000,
  });
}
