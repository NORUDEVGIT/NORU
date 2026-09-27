import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { InventoryMetric } from "@/packages/pms/components/rooms/room-inventory-shared";
import { PickupWindowSelector } from "@/packages/pms/components/rates/pickup-pace/pickup-window-selector";
import {
  PICKUP_DEFAULT_WINDOW_DAYS,
  PICKUP_MISSING_PRIOR,
  PICKUP_NO_SNAPSHOTS,
  PICKUP_REQUIRES_TWO_SNAPSHOTS,
  formatPickupPoints,
  pickupWindowUnavailableCopy,
  type PickupWindowDays,
} from "@/packages/pms/lib/revenue/pickup-pace";
import { getRevenuePickupPace } from "@/packages/pms/lib/revenue/pickup-pace.functions";
import { PICKUP_PACE_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";

export function DemandDetailPickup({
  restaurantId,
  stayDate,
  roomTypeId,
  money,
}: {
  restaurantId: string;
  stayDate: string;
  roomTypeId: string;
  money: (value: number) => string;
}) {
  const [windowDays, setWindowDays] = useState<PickupWindowDays>(PICKUP_DEFAULT_WINDOW_DAYS);
  const fetchPace = useServerFn(getRevenuePickupPace);
  const query = useQuery({
    queryKey: ["revenue-pickup-pace", restaurantId, windowDays, stayDate, stayDate, roomTypeId],
    queryFn: () =>
      fetchPace({
        data: {
          restaurantId,
          windowDays,
          fromDate: stayDate,
          toDate: stayDate,
          roomTypeId,
        },
      }),
    retry: false,
  });

  const data = query.data;
  const reasonCopy =
    data?.historyReason === "no_snapshots"
      ? PICKUP_NO_SNAPSHOTS
      : data?.historyReason === "single_snapshot"
        ? PICKUP_REQUIRES_TWO_SNAPSHOTS
        : data?.historyReason === "missing_prior_as_of"
          ? `${PICKUP_MISSING_PRIOR} ${pickupWindowUnavailableCopy(data.windowDays)}`
          : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Snapshot-to-snapshot pickup for this stay date and room type.
        </p>
        <PickupWindowSelector value={windowDays} onChange={setWindowDays} />
      </div>

      {query.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading pickup…</p>
      ) : query.isError ? (
        <p className="text-xs text-muted-foreground">{revenueUiError(query.error, PICKUP_PACE_LOAD_ERROR)}</p>
      ) : data && !data.historyAvailable ? (
        <p className="text-xs text-muted-foreground">{reasonCopy ?? pickupWindowUnavailableCopy(windowDays)}</p>
      ) : data?.summary.roomsPickup == null ? (
        <p className="text-xs text-muted-foreground">
          {windowDays}-day pickup is unavailable for this stay date. Missing snapshot pairs are not shown as zero.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <InventoryMetric
            label="Rooms pickup"
            value={data.summary.roomsPickup}
            detail="Current snapshot minus prior snapshot"
          />
          <InventoryMetric
            label="Revenue pickup"
            value={data.summary.revenuePickup == null ? "unavailable" : money(data.summary.revenuePickup)}
            detail="Snapshot booked revenue change"
          />
          <InventoryMetric
            label="Occupancy change"
            value={formatPickupPoints(data.summary.occupancyPointChange)}
            detail="Percentage points"
          />
          <InventoryMetric
            label="ADR change"
            value={data.summary.adrChange == null ? "unavailable" : money(data.summary.adrChange)}
            detail="Snapshot ADR change"
          />
        </div>
      )}
    </div>
  );
}
