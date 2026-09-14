import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPmsSet1Foundation } from "./pms-set1-foundation.functions";

export function usePmsSet1Foundation(restaurantId: string) {
  const load = useServerFn(getPmsSet1Foundation);
  return useQuery({
    queryKey: ["pms-set1-foundation", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });
}
