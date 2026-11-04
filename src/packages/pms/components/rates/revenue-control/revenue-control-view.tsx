import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { getRevenueControlWorkspace } from "@/packages/pms/lib/revenue/revenue-control.functions";
import {
  REVENUE_CONTROL_LOAD_ERROR,
  revenueUiError,
} from "@/packages/pms/lib/revenue/revenue-read-error";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { useMoney } from "@/core/state/property-format";
import { RateInventoryControl } from "./rate-inventory-control";
import { RevenueControlTrend } from "./revenue-control-trend";

function RevenueControlSkeleton() {
  return (
    <div className="h-72 animate-pulse rounded-lg border border-[#DDD4C5] bg-white" aria-busy="true" />
  );
}

export function RevenueControlView({
  restaurantId,
  context,
  presentation = "table",
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  presentation?: "table" | "chart";
}) {
  const money = useMoney();
  const fetchWorkspace = useServerFn(getRevenueControlWorkspace);
  const query = useQuery({
    queryKey: [
      "revenue-control",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
      context.marketSegmentId,
      context.commercialSourceId,
      context.salesChannelId,
    ],
    queryFn: () =>
      fetchWorkspace({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
          ratePlanId: context.ratePlanId,
          marketSegmentId: context.marketSegmentId,
          commercialSourceId: context.commercialSourceId,
          salesChannelId: context.salesChannelId,
        },
      }),
    retry: false,
  });

  return (
    <div className="space-y-3">
      {query.isLoading ? (
        <RevenueControlSkeleton />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title={REVENUE_CONTROL_LOAD_ERROR}
          description={revenueUiError(query.error, REVENUE_CONTROL_LOAD_ERROR)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        presentation === "chart" ? (
          <RevenueControlTrend nightly={query.data.nightly} money={money} />
        ) : (
          <RateInventoryControl rows={query.data.controlRows} context={context} money={money} />
        )
      ) : null}
    </div>
  );
}
