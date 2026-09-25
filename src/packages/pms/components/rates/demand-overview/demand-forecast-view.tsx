import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { getRevenueDemandOverview } from "@/packages/pms/lib/revenue/demand.functions";
import {
  collectDemandAttention,
  demandHasOtb,
  demandHasRoomTypes,
  DEMAND_EMPTY_NO_OTB,
  DEMAND_EMPTY_NO_ROOM_TYPES,
  rollupDemandRoomTypes,
} from "@/packages/pms/lib/revenue/demand-overview";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { DEMAND_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import { BookedRevenueChart } from "./booked-revenue-chart";
import { DemandAttentionTable } from "./demand-attention-table";
import { DemandOverviewKpis } from "./demand-overview-kpis";
import { DemandRoomTypeTable } from "./demand-room-type-table";
import { ForecastUnavailableCard } from "./forecast-unavailable-card";
import { ForwardOccupancyChart } from "./forward-occupancy-chart";
import { RecentBookingActivity } from "./recent-booking-activity";

function DemandForecastSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
        <div className="h-56 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
    </div>
  );
}

export function DemandForecastView({
  restaurantId,
  context,
}: {
  restaurantId: string;
  context: RevenueContext;
}) {
  const money = useMoney();
  const fetchOverview = useServerFn(getRevenueDemandOverview);
  const query = useQuery({
    queryKey: [
      "revenue-demand-overview",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
    ],
    queryFn: () =>
      fetchOverview({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
          ratePlanId: context.ratePlanId,
        },
      }),
    retry: false,
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight text-[#251605]">Demand & Forecast</h2>
        <p className="text-xs text-muted-foreground">
          Live on-the-books occupancy, booked revenue and restriction context.
        </p>
      </div>

      {query.isLoading ? (
        <DemandForecastSkeleton />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title={DEMAND_LOAD_ERROR}
          description={revenueUiError(query.error, DEMAND_LOAD_ERROR)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <>
          <ForecastUnavailableCard />
          {!demandHasRoomTypes(query.data) ? (
            <InventoryState
              state="empty"
              title="No room types"
              description={DEMAND_EMPTY_NO_ROOM_TYPES}
            />
          ) : (
            <>
              <DemandOverviewKpis data={query.data} money={money} />
              {!demandHasOtb(query.data) ? (
                <p className="text-xs text-muted-foreground">{DEMAND_EMPTY_NO_OTB}</p>
              ) : null}
              <div className="grid gap-3 lg:grid-cols-2">
                <ForwardOccupancyChart dates={query.data.dates} />
                <BookedRevenueChart dates={query.data.dates} money={money} />
              </div>
              <DemandRoomTypeTable rows={rollupDemandRoomTypes(query.data.dates)} money={money} />
              <div className="grid gap-3 lg:grid-cols-2">
                <DemandAttentionTable items={collectDemandAttention(query.data.dates)} context={context} />
                <RecentBookingActivity count={query.data.summary.recentBookings} />
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
