import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { getRevenueRateCalendar } from "@/packages/pms/lib/revenue/rate-calendar.functions";
import { RATE_CALENDAR_GROUP_PAGE_SIZE } from "@/packages/pms/lib/revenue/rate-calendar";
import {
  toRestrictionCalendar,
  type RestrictionCalendarCell,
  type RestrictionCalendarWorkspace,
} from "@/packages/pms/lib/revenue/restriction-calendar";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { RESTRICTION_CALENDAR_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import {
  RestrictionDetailDrawer,
  type RestrictionDrawerTab,
} from "../restriction-detail/restriction-detail-drawer";
import { RestrictionCalendarGrid } from "./restriction-calendar-grid";
import { RestrictionCalendarLegend } from "./restriction-calendar-legend";
import { RestrictionCalendarToolbar } from "./restriction-calendar-toolbar";

function CalendarSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
      <div className="h-72 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
    </div>
  );
}

function pageGroups(data: RestrictionCalendarWorkspace, page: number) {
  const start = page * RATE_CALENDAR_GROUP_PAGE_SIZE;
  return {
    ...data,
    groups: data.groups.slice(start, start + RATE_CALENDAR_GROUP_PAGE_SIZE),
  };
}

export function RestrictionCalendarView({
  restaurantId,
  context,
  access,
  businessDate,
  onRangeChange,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  businessDate: string;
  onRangeChange: (fromDate: string, toDate: string) => void;
}) {
  const fetchCalendar = useServerFn(getRevenueRateCalendar);
  const [selected, setSelected] = useState<RestrictionCalendarCell | null>(null);
  const [tab, setTab] = useState<RestrictionDrawerTab>("overview");
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: [
      "revenue-rate-calendar",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
    ],
    queryFn: () =>
      fetchCalendar({
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

  const calendar = useMemo(
    () => (query.data ? toRestrictionCalendar(query.data) : null),
    [query.data],
  );

  const paged = useMemo(() => {
    if (!calendar) return null;
    const maxPage = Math.max(0, Math.ceil(calendar.groupCount / RATE_CALENDAR_GROUP_PAGE_SIZE) - 1);
    return pageGroups(calendar, Math.min(page, maxPage));
  }, [calendar, page]);

  const selectedMeta = useMemo(() => {
    if (!selected || !calendar) return { plan: null, roomType: null };
    for (const group of calendar.groups) {
      const row = group.rows.find((item) => item.plan.id === selected.ratePlanId);
      if (row) return { plan: row.plan, roomType: group.roomType };
    }
    return { plan: null, roomType: null };
  }, [selected, calendar]);

  const selectedCell = useMemo(() => {
    if (!selected || !calendar) return selected;
    for (const group of calendar.groups) {
      for (const row of group.rows) {
        const match = row.cells.find(
          (cell) => cell.ratePlanId === selected.ratePlanId && cell.date === selected.date,
        );
        if (match) return match;
      }
    }
    return selected;
  }, [selected, calendar]);

  const pageCount = calendar ? Math.max(1, Math.ceil(calendar.groupCount / RATE_CALENDAR_GROUP_PAGE_SIZE)) : 1;

  return (
    <div className="space-y-3">
      <RestrictionCalendarToolbar
        context={context}
        businessDate={businessDate}
        rangeClamped={calendar?.rangeClamped === true}
        canViewRestrictions={access.canViewRestrictions}
        onRangeChange={onRangeChange}
      />

      {query.isLoading ? (
        <CalendarSkeleton />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title={RESTRICTION_CALENDAR_LOAD_ERROR}
          description={revenueUiError(query.error, RESTRICTION_CALENDAR_LOAD_ERROR)}
          onRetry={() => void query.refetch()}
        />
      ) : calendar && calendar.groups.length === 0 ? (
        <InventoryState
          state="empty"
          title="No rate plans are configured for this property."
          description="Configure room types and rate plans in Property Setup."
        />
      ) : paged ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-2">
          <RestrictionCalendarLegend />

            <RestrictionCalendarGrid
              data={paged}
              selected={selectedCell}
              onSelect={(cell) => {
                setSelected(cell);
                setTab("overview");
              }}
            />
            {pageCount > 1 ? (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <button
                  type="button"
                  disabled={page <= 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  className="rounded-md border border-[#DED7CD] bg-white px-2 py-1 disabled:opacity-50"
                >
                  Previous room types
                </button>
                <span>
                  {page + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-md border border-[#DED7CD] bg-white px-2 py-1 disabled:opacity-50"
                >
                  Next room types
                </button>
              </div>
            ) : null}
          </div>
          <RestrictionDetailDrawer
            restaurantId={restaurantId}
            cell={selectedCell}
            plan={selectedMeta.plan}
            roomType={selectedMeta.roomType}
            context={context}
            access={access}
            tab={tab}
            setTab={setTab}
            onClose={() => setSelected(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
