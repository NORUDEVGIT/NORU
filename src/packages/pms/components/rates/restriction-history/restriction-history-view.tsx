import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import {
  getRestrictionOperationDetail,
  listRestrictionChangeHistory,
} from "@/packages/pms/lib/revenue/restriction-change.functions";
import type {
  RestrictionActionType,
  RestrictionHistoryRow,
} from "@/packages/pms/lib/revenue/restriction-change";
import {
  RESTRICTION_HISTORY_PAGE_SIZE,
  RESTRICTION_HISTORY_PAGE_SIZES,
  historyPaginationRange,
} from "@/packages/pms/lib/revenue/restriction-history";
import type {
  RevenueRatePlan,
  RevenueRoomType,
} from "@/packages/pms/lib/revenue/revenue-config.types";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import {
  RESTRICTION_HISTORY_LOAD_ERROR,
  revenueUiError,
} from "@/packages/pms/lib/revenue/revenue-read-error";
import { RestrictionHistoryDetailDrawer } from "./restriction-history-detail-drawer";
import { RestrictionHistoryEmptyState } from "./restriction-history-empty-state";
import { RestrictionHistoryFilters } from "./restriction-history-filters";
import { RestrictionHistoryTable } from "./restriction-history-table";

function TableSkeleton() {
  return (
    <div
      className="h-64 animate-pulse rounded-xl border border-[#E8E1D7] bg-card"
      aria-busy="true"
    />
  );
}

export function RestrictionHistoryView({
  restaurantId,
  context,
  roomTypes = [],
  ratePlans = [],
  onContextChange,
}: {
  restaurantId: string;
  context: RevenueContext;
  roomTypes?: RevenueRoomType[];
  ratePlans?: RevenueRatePlan[];
  onContextChange?: (patch: Partial<RevenueContext>) => void;
}) {
  const listFn = useServerFn(listRestrictionChangeHistory);
  const detailFn = useServerFn(getRestrictionOperationDetail);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(RESTRICTION_HISTORY_PAGE_SIZE);
  const [actionType, setActionType] = useState<RestrictionActionType | "">("");
  const [selected, setSelected] = useState<RestrictionHistoryRow | null>(null);

  useEffect(() => {
    setPage(1);
  }, [
    context.fromDate,
    context.toDate,
    context.roomTypeId,
    context.ratePlanId,
    actionType,
    pageSize,
  ]);

  const listQuery = useQuery({
    queryKey: [
      "restriction-change-history",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
      actionType || null,
      page,
      pageSize,
    ],
    queryFn: () =>
      listFn({
        data: {
          restaurantId,
          from: context.fromDate,
          to: context.toDate,
          roomTypeId: context.roomTypeId ?? undefined,
          ratePlanId: context.ratePlanId ?? undefined,
          actionType: actionType || undefined,
          page,
          pageSize,
        },
      }),
    retry: false,
  });

  const detailQuery = useQuery({
    queryKey: ["restriction-operation", restaurantId, selected?.operationId ?? null],
    queryFn: () =>
      detailFn({
        data: { restaurantId, operationId: selected?.operationId },
      }),
    enabled: Boolean(selected?.operationId),
    retry: false,
  });

  const range = historyPaginationRange(
    listQuery.data?.page ?? page,
    pageSize,
    listQuery.data?.total ?? 0,
  );

  return (
    <div className="min-w-0 space-y-3">
      <RestrictionHistoryFilters
        context={context}
        roomTypes={roomTypes}
        ratePlans={ratePlans}
        actionType={actionType}
        onContextChange={onContextChange}
        onActionTypeChange={(value) => {
          setActionType(value);
          setSelected(null);
        }}
      />

      {listQuery.isLoading ? (
        <TableSkeleton />
      ) : listQuery.isError ? (
        <InventoryState
          state="error"
          title={RESTRICTION_HISTORY_LOAD_ERROR}
          description={revenueUiError(listQuery.error, RESTRICTION_HISTORY_LOAD_ERROR)}
          onRetry={() => void listQuery.refetch()}
        />
      ) : listQuery.data && listQuery.data.rows.length === 0 ? (
        <RestrictionHistoryEmptyState />
      ) : listQuery.data ? (
        <>
          <RestrictionHistoryTable rows={listQuery.data.rows} onViewDetails={setSelected} />
          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-white px-4 py-2.5 text-xs text-[#5A4833] shadow-sm">
            <p className="text-xs font-medium text-[#5A4833]">
              Showing {range.start}–{range.end} of {range.total}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605] hover:bg-[#FAF6F0] disabled:opacity-50"
              >
                <ChevronLeft className="mr-1 size-3.5" />
                Previous
              </button>
              <span className="grid h-8 min-w-8 place-items-center rounded-md bg-[#C89933] px-2 text-xs font-semibold text-[#251605]">
                {page}
              </span>
              <span className="px-1 text-xs text-[#756A5B]">of {range.pageCount}</span>
              <button
                type="button"
                disabled={page >= range.pageCount}
                onClick={() => setPage((current) => current + 1)}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605] hover:bg-[#FAF6F0] disabled:opacity-50"
              >
                Next
                <ChevronRight className="ml-1 size-3.5" />
              </button>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="ml-2 h-8 rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605]"
                aria-label="Rows per page"
              >
                {RESTRICTION_HISTORY_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </select>
            </div>
          </footer>
        </>
      ) : null}

      <RestrictionHistoryDetailDrawer
        open={Boolean(selected)}
        detail={detailQuery.data ?? null}
        loading={detailQuery.isFetching}
        error={
          detailQuery.isError
            ? revenueUiError(detailQuery.error, RESTRICTION_HISTORY_LOAD_ERROR)
            : null
        }
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
