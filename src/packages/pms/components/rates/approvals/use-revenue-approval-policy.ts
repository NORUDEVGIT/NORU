import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getRevenueApprovalPolicyFn } from "@/packages/pms/lib/revenue/revenue-approval.functions";
import { REVENUE_APPROVAL_POLICY_QUERY_KEY } from "@/packages/pms/lib/revenue/revenue-approval-ui";

export function useRevenueApprovalPolicy(restaurantId: string) {
  const policyFn = useServerFn(getRevenueApprovalPolicyFn);
  return useQuery({
    queryKey: [REVENUE_APPROVAL_POLICY_QUERY_KEY, restaurantId],
    queryFn: () => policyFn({ data: { restaurantId } }),
    staleTime: 15_000,
    retry: false,
  });
}
