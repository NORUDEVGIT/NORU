import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { getRevenueDemandCalendar } from "@/packages/pms/lib/revenue/demand-calendar.functions";
import {
  demandCalendarHasRoomTypes,
  type DemandCalendarCell,
} from "@/packages/pms/lib/revenue/demand-calendar";
import { DEMAND_EMPTY_NO_ROOM_TYPES } from "@/packages/pms/lib/revenue/demand-overview";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { DEMAND_CALENDAR_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import {
  DemandDetailDrawer,
  type DemandDrawerTab,
} from "../demand-detail/demand-detail-drawer";
import { DemandCalendarGrid } from "./demand-calendar-grid";
import { DemandCalendarLegend } from "./demand-calendar-legend";
import { DemandCalendarToolbar } from "./demand-calendar-toolbar";

function CalendarSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
      <div className="h-72 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
    </div>
  );
}

export function DemandCalendarView({
  restaurantId,
  context,
  businessDate,
  onRangeChange,
}: {
  restaurantId: string;
  context: RevenueContext;
  businessDate: string;
  onRangeChange: (fromDate: string, toDate: string) => void;
}) {
  const fetchCalendar = useServerFn(getRevenueDemandCalendar);
  const [selected, setSelected] = useState<DemandCalendarCell | null>(null);
  const [tab, setTab] = useState<DemandDrawerTab>("overview");

  const query = useQuery({
    queryKey: [
      "revenue-demand-calendar",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
    ],
    queryFn: () =>
      fetchCalendar({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
        },
      }),
    retry: false,
  });

  const selectedCell = useMemo(() => {
    if (!selected || !query.data) return selected;
    for (const row of query.data.rows) {
      const match = row.cells.find(
        (cell) => cell.roomTypeId === selected.roomTypeId && cell.date === selected.date,
      );
      if (match) return match;
    }
    return selected;
  }, [selected, query.data]);

  return (
    <div className="space-y-3">
      <DemandCalendarToolbar
        context={context}
        businessDate={businessDate}
        rangeClamped={query.data?.rangeClamped === true}
        onRangeChange={onRangeChange}
      />

      {query.isLoading ? (
        <CalendarSkeleton />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title={DEMAND_CALENDAR_LOAD_ERROR}
          description={revenueUiError(query.error, DEMAND_CALENDAR_LOAD_ERROR)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data && !demandCalendarHasRoomTypes(query.data) ? (
        <InventoryState
          state="empty"
          title="No room types"
          description={DEMAND_EMPTY_NO_ROOM_TYPES}
        />
      ) : query.data ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-2">
            <DemandCalendarLegend />
            {query.data.limitations.oooOosNote ? (
              <p className="text-[10px] text-muted-foreground">{query.data.limitations.oooOosNote}</p>
            ) : null}
            {query.data.limitations.unpricedNote ? (
              <p className="text-[10px] text-muted-foreground">{query.data.limitations.unpricedNote}</p>
            ) : null}
            <DemandCalendarGrid
              data={query.data}
              selected={selectedCell}
              onSelect={(cell) => {
                setSelected(cell);
                setTab("overview");
              }}
            />
          </div>
          <DemandDetailDrawer
            restaurantId={restaurantId}
            cell={selectedCell}
            asOfBusinessDate={query.data.asOfBusinessDate}
            tab={tab}
            setTab={setTab}
            onClose={() => setSelected(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
