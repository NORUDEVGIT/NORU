import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import {
  getRestrictionOperationDetail,
  listRestrictionChangeHistory,
} from "@/packages/pms/lib/revenue/restriction-change.functions";
import type { RestrictionActionType, RestrictionHistoryRow } from "@/packages/pms/lib/revenue/restriction-change";
import {
  RESTRICTION_HISTORY_PAGE_SIZE,
  RESTRICTION_HISTORY_PAGE_SIZES,
  historyPaginationRange,
} from "@/packages/pms/lib/revenue/restriction-history";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { RESTRICTION_HISTORY_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { RestrictionHistoryDetailDrawer } from "./restriction-history-detail-drawer";
import { RestrictionHistoryEmptyState } from "./restriction-history-empty-state";
import { RestrictionHistoryFilters } from "./restriction-history-filters";
import { RestrictionHistoryTable } from "./restriction-history-table";

function TableSkeleton() {
  return (
    <div className="h-64 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" aria-busy="true" />
  );
}

export function RestrictionHistoryView({
  restaurantId,
  context,
}: {
  restaurantId: string;
  context: RevenueContext;
}) {
  const listFn = useServerFn(listRestrictionChangeHistory);
  const detailFn = useServerFn(getRestrictionOperationDetail);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(RESTRICTION_HISTORY_PAGE_SIZE);
  const [actionType, setActionType] = useState<RestrictionActionType | "">("");
  const [selected, setSelected] = useState<RestrictionHistoryRow | null>(null);

  useEffect(() => {
    setPage(1);
  }, [context.fromDate, context.toDate, context.roomTypeId, context.ratePlanId, actionType, pageSize]);

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

  const range = historyPaginationRange(listQuery.data?.page ?? page, pageSize, listQuery.data?.total ?? 0);

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-2">
        <RestrictionHistoryFilters
          actionType={actionType}
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
            <footer className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E8E1D7] bg-card px-3 py-2">
              <p className="text-[9px] text-muted-foreground">
                Showing {range.start}–{range.end} of {range.total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex h-7 items-center rounded-md border border-[#DED7CD] bg-white px-2 text-[9px] text-[#251605] disabled:opacity-50"
                >
                  <ChevronLeft className="mr-1 size-3" />
                  Previous
                </button>
                <span className="grid size-7 place-items-center rounded bg-[#C89933] text-[9px] font-semibold text-[#251605]">
                  {page}
                </span>
                <span className="px-1 text-[9px] text-muted-foreground">of {range.pageCount}</span>
                <button
                  type="button"
                  disabled={page >= range.pageCount}
                  onClick={() => setPage((current) => current + 1)}
                  className="inline-flex h-7 items-center rounded-md border border-[#DED7CD] bg-white px-2 text-[9px] text-[#251605] disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="ml-1 size-3" />
                </button>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="ml-2 h-7 rounded border border-[#DED7CD] bg-white px-2 text-[9px]"
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
      </div>

      <RestrictionHistoryDetailDrawer
        open={Boolean(selected)}
        detail={detailQuery.data ?? null}
        loading={detailQuery.isFetching}
        error={
          detailQuery.isError ? revenueUiError(detailQuery.error, RESTRICTION_HISTORY_LOAD_ERROR) : null
        }
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
