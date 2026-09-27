import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { PICKUP_DEFAULT_WINDOW_DAYS, type PickupWindowDays } from "@/packages/pms/lib/revenue/pickup-pace";
import { getRevenuePickupPace } from "@/packages/pms/lib/revenue/pickup-pace.functions";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { PICKUP_PACE_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import { PickupByDateTable } from "./pickup-by-date-table";
import { PickupByRoomTypeTable } from "./pickup-by-room-type-table";
import { PickupHistoryStatus } from "./pickup-history-status";
import { PickupKpis } from "./pickup-kpis";
import { PickupOtbCompareChart } from "./pickup-otb-compare-chart";
import { PickupTrendChart } from "./pickup-trend-chart";
import { PickupWindowSelector } from "./pickup-window-selector";

function PickupPaceSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
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

export function PickupPaceView({
  restaurantId,
  context,
}: {
  restaurantId: string;
  context: RevenueContext;
}) {
  const money = useMoney();
  const [windowDays, setWindowDays] = useState<PickupWindowDays>(PICKUP_DEFAULT_WINDOW_DAYS);
  const fetchPace = useServerFn(getRevenuePickupPace);
  const query = useQuery({
    queryKey: [
      "revenue-pickup-pace",
      restaurantId,
      windowDays,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
    ],
    queryFn: () =>
      fetchPace({
        data: {
          restaurantId,
          windowDays,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
        },
      }),
    retry: false,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-[#251605]">Pickup & Pace</h2>
          <p className="text-xs text-muted-foreground">
            Change in on-the-books nights between two daily OTB snapshots.
          </p>
        </div>
        <PickupWindowSelector value={windowDays} onChange={setWindowDays} />
      </div>

      {query.isLoading ? (
        <PickupPaceSkeleton />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title={PICKUP_PACE_LOAD_ERROR}
          description={revenueUiError(query.error, PICKUP_PACE_LOAD_ERROR)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <>
          <PickupHistoryStatus data={query.data} />
          {query.data.historyAvailable ? (
            <>
              <PickupKpis data={query.data} money={money} />
              <div className="grid gap-3 lg:grid-cols-2">
                <PickupTrendChart dates={query.data.dates} />
                <PickupOtbCompareChart dates={query.data.dates} />
              </div>
              <PickupByRoomTypeTable rows={query.data.roomTypes} money={money} />
              <PickupByDateTable rows={query.data.dates} money={money} />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
