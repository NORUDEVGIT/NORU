import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { getRevenueRateCalendar } from "@/packages/pms/lib/revenue/rate-calendar.functions";
import {
  RATE_CALENDAR_GROUP_PAGE_SIZE,
  type RateCalendarCell,
  type RateCalendarWorkspace,
} from "@/packages/pms/lib/revenue/rate-calendar";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import {
  RATE_CALENDAR_LOAD_ERROR,
  revenueUiError,
} from "@/packages/pms/lib/revenue/revenue-read-error";
import { useMoney } from "@/core/state/property-format";
import { RateDetailDrawer, type DrawerTab } from "../rate-detail/rate-detail-drawer";
import { RateCalendarGrid } from "./rate-calendar-grid";
import { RateCalendarLegend } from "./rate-calendar-legend";
import { RateCalendarToolbar } from "./rate-calendar-toolbar";

function CalendarSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
      <div className="h-72 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
    </div>
  );
}

function pageGroups(data: RateCalendarWorkspace, page: number) {
  const start = page * RATE_CALENDAR_GROUP_PAGE_SIZE;
  return {
    ...data,
    groups: data.groups.slice(start, start + RATE_CALENDAR_GROUP_PAGE_SIZE),
  };
}

export function RateCalendarView({
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
  const money = useMoney();
  const fetchCalendar = useServerFn(getRevenueRateCalendar);
  const [selected, setSelected] = useState<RateCalendarCell | null>(null);
  const [selectedRowPlanId, setSelectedRowPlanId] = useState<string | null>(null);
  const [tab, setTab] = useState<DrawerTab>("overview");
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

  const paged = useMemo(() => {
    if (!query.data) return null;
    const maxPage = Math.max(
      0,
      Math.ceil(query.data.groupCount / RATE_CALENDAR_GROUP_PAGE_SIZE) - 1,
    );
    return pageGroups(query.data, Math.min(page, maxPage));
  }, [query.data, page]);

  const selectedMeta = useMemo(() => {
    if (!selected || !query.data) return { plan: null, roomType: null, cells: [] };
    for (const group of query.data.groups) {
      const row = group.rows.find((item) => item.plan.id === selected.ratePlanId);
      if (row) return { plan: row.plan, roomType: group.roomType, cells: row.cells };
    }
    return { plan: null, roomType: null, cells: [] };
  }, [selected, query.data]);

  const pageCount = query.data
    ? Math.max(1, Math.ceil(query.data.groupCount / RATE_CALENDAR_GROUP_PAGE_SIZE))
    : 1;

  return (
    <div className="space-y-3">
      <RateCalendarToolbar
        context={context}
        businessDate={businessDate}
        rangeClamped={query.data?.rangeClamped === true}
        currency={query.data?.currency ?? ""}
        mixedCurrency={query.data?.mixedCurrency === true}
        canViewRates={access.canViewRates}
        onRangeChange={onRangeChange}
      />

      {query.isLoading ? (
        <CalendarSkeleton />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title={RATE_CALENDAR_LOAD_ERROR}
          description={revenueUiError(query.error, RATE_CALENDAR_LOAD_ERROR)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data && query.data.groups.length === 0 ? (
        <InventoryState
          state="empty"
          title="No rate plans are configured for this property."
          description="Configure room types and rate plans in Property Setup."
        />
      ) : paged ? (
        <div className="min-w-0 space-y-3">
          <RateCalendarLegend />
          <RateCalendarGrid
            data={paged}
            selected={selected}
            selectedRowPlanId={selectedRowPlanId}
            onSelect={(cell) => {
              setSelected(cell);
              setSelectedRowPlanId(null);
              setTab("overview");
            }}
            onSelectRow={(row) => {
              if (row.cells[0]) {
                setSelected(row.cells[0]);
                setSelectedRowPlanId(row.plan.id);
                setTab("edit");
              }
            }}
          />
          {pageCount > 1 ? (
            <div className="flex items-center justify-between rounded-xl border border-[#DDD4C5] bg-white px-4 py-2.5 text-xs font-medium text-[#5A4833] shadow-sm">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-3 text-xs font-medium text-[#251605] hover:bg-[#F8F1E5] disabled:opacity-50"
              >
                Previous room types
              </button>
              <span>
                Page {page + 1} of {pageCount}
              </span>
              <button
                type="button"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((current) => current + 1)}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-3 text-xs font-medium text-[#251605] hover:bg-[#F8F1E5] disabled:opacity-50"
              >
                Next room types
              </button>
            </div>
          ) : null}

          <RateDetailDrawer
            restaurantId={restaurantId}
            cell={selected}
            plan={selectedMeta.plan}
            roomType={selectedMeta.roomType}
            rowCells={selectedMeta.cells}
            editScope={selectedRowPlanId ? "row" : "single"}
            context={context}
            access={access}
            tab={tab}
            setTab={setTab}
            onClose={() => {
              setSelected(null);
              setSelectedRowPlanId(null);
            }}
            money={money}
          />
        </div>
      ) : null}
    </div>
  );
}
