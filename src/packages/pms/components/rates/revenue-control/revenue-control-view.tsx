import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { getRevenueControlWorkspace } from "@/packages/pms/lib/revenue/revenue-control.functions";
import { REVENUE_CONTROL_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { serializeRevenueSearch } from "@/packages/pms/lib/revenue/revenue-context";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import { RateInventoryControl } from "./rate-inventory-control";
import { RecentRateActivity } from "./recent-rate-activity";
import { RestrictionAttention } from "./restriction-attention";
import { RevenueAttention } from "./revenue-attention";
import { RevenueControlKpis } from "./revenue-control-kpis";
import { RevenueControlRoomTypes } from "./revenue-control-room-types";
import { RevenueControlTrend } from "./revenue-control-trend";

function RevenueControlSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="h-56 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
        <div className="h-56 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
    </div>
  );
}

export function RevenueControlView({
  restaurantId,
  context,
  access,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
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

  const calendarSearch = serializeRevenueSearch("rate-calendar", context);
  const bulkSearch = serializeRevenueSearch("bulk-rate-change", context);
  const historySearch = serializeRevenueSearch("rate-history", context);
  const restrictionSearch = serializeRevenueSearch("restrictions", context);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-[#251605]">Revenue Control</h2>
          <p className="text-xs text-muted-foreground">
            Booked occupancy, snapshot revenue and operational rate attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.canViewRates ? (
            <>
              <Link
                to="/restaurant/pms/rates-revenue"
                search={calendarSearch}
                className="inline-flex h-8 items-center rounded-md bg-[#D3A13B] px-2.5 text-[10px] font-medium text-[#251605] hover:bg-[#BE8D2D]"
              >
                Open Rate Calendar
              </Link>
              <Link
                to="/restaurant/pms/rates-revenue"
                search={bulkSearch}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
              >
                Open Bulk Rate Change
              </Link>
              <Link
                to="/restaurant/pms/rates-revenue"
                search={historySearch}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
              >
                View Rate History
              </Link>
            </>
          ) : null}
          {access.canViewRestrictions ? (
            <Link
              to="/restaurant/pms/rates-revenue"
              search={restrictionSearch}
              className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
            >
              View Restrictions
            </Link>
          ) : null}
        </div>
      </div>

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
        <>
          <RevenueControlKpis data={query.data} money={money} />
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <RevenueControlTrend nightly={query.data.nightly} money={money} />
            <RevenueAttention alerts={query.data.alerts} />
          </div>
          <RateInventoryControl rows={query.data.controlRows} context={context} money={money} />
          <div className="grid gap-3 lg:grid-cols-3">
            <RestrictionAttention
              rows={query.data.restrictionAttention}
              error={query.data.restrictionsError}
              context={context}
            />
            <RevenueControlRoomTypes rows={query.data.roomTypes} money={money} />
            <RecentRateActivity activity={query.data.recentActivity} error={query.data.historyError} />
          </div>
        </>
      ) : null}
    </div>
  );
}
