import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { RevenueWorkspaceView } from "@/packages/pms/lib/rate-revenue-workspace";
import { COMMERCIAL_ACTION_TYPES, COMMERCIAL_ENTITY_TYPES } from "@/packages/pms/lib/revenue/commercial-engine";
import {
  COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE,
  COMMERCIAL_HISTORY_PAGE_SIZES,
  historyPaginationRange,
} from "@/packages/pms/lib/revenue/commercial-history";
import {
  getCommercialHistoryOperationDetail,
  getCommercialHistoryWorkspace,
} from "@/packages/pms/lib/revenue/commercial-history.functions";
import type { CommercialHistoryWorkspaceRow } from "@/packages/pms/lib/revenue/commercial-history-ui";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { COMMERCIAL_HISTORY_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { CommercialHistoryDetailDrawer } from "./commercial-history-detail-drawer";
import { CommercialHistoryEmptyState } from "./commercial-history-empty-state";
import { CommercialHistoryFilters } from "./commercial-history-filters";
import { CommercialHistoryTable } from "./commercial-history-table";

function TableSkeleton() {
  return (
    <div className="h-64 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" aria-busy="true" />
  );
}

export function CommercialHistoryView({
  restaurantId,
  context,
  onNavigateView,
}: {
  restaurantId: string;
  context: RevenueContext;
  onNavigateView: (view: RevenueWorkspaceView) => void;
}) {
  const listFn = useServerFn(getCommercialHistoryWorkspace);
  const detailFn = useServerFn(getCommercialHistoryOperationDetail);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE);
  const [entityType, setEntityType] = useState<(typeof COMMERCIAL_ENTITY_TYPES)[number] | "">("");
  const [actionType, setActionType] = useState<(typeof COMMERCIAL_ACTION_TYPES)[number] | "">("");
  const [actorId, setActorId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CommercialHistoryWorkspaceRow | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [context.fromDate, context.toDate, entityType, actionType, actorId, search, pageSize]);

  const listQuery = useQuery({
    queryKey: [
      "commercial-change-history",
      restaurantId,
      context.fromDate,
      context.toDate,
      entityType || null,
      actionType || null,
      actorId || null,
      search || null,
      page,
      pageSize,
    ],
    queryFn: () =>
      listFn({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          entityType: entityType || undefined,
          actionType: actionType || undefined,
          actorId: actorId || undefined,
          search: search || undefined,
          page,
          pageSize,
        },
      }),
    retry: false,
  });

  const detailQuery = useQuery({
    queryKey: ["commercial-operation", restaurantId, selected?.operationId ?? null],
    queryFn: () =>
      detailFn({
        data: { restaurantId, operationId: selected?.operationId },
      }),
    enabled: Boolean(selected?.operationId),
    retry: false,
  });

  const range = historyPaginationRange(listQuery.data?.page ?? page, pageSize, listQuery.data?.total ?? 0);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#251605]">Commercial History</h2>
        <p className="mt-1 text-xs text-muted-foreground">Review promotion and package activation changes.</p>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="min-w-0 space-y-2">
          <CommercialHistoryFilters
            entityType={entityType}
            actionType={actionType}
            actorId={actorId}
            search={searchInput}
            actors={listQuery.data?.actors ?? []}
            onEntityTypeChange={(value) => {
              setEntityType(value);
              setSelected(null);
            }}
            onActionTypeChange={(value) => {
              setActionType(value);
              setSelected(null);
            }}
            onActorIdChange={(value) => {
              setActorId(value);
              setSelected(null);
            }}
            onSearchChange={setSearchInput}
          />

          {listQuery.isLoading ? (
            <TableSkeleton />
          ) : listQuery.isError ? (
            <InventoryState
              state="error"
              title={COMMERCIAL_HISTORY_LOAD_ERROR}
              description={revenueUiError(listQuery.error, COMMERCIAL_HISTORY_LOAD_ERROR)}
              onRetry={() => void listQuery.refetch()}
            />
          ) : listQuery.data && listQuery.data.rows.length === 0 ? (
            <CommercialHistoryEmptyState />
          ) : listQuery.data ? (
            <>
              <CommercialHistoryTable rows={listQuery.data.rows} onViewDetails={setSelected} />
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
                    {COMMERCIAL_HISTORY_PAGE_SIZES.map((size) => (
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

        <CommercialHistoryDetailDrawer
          open={Boolean(selected)}
          detail={detailQuery.data ?? null}
          loading={detailQuery.isFetching}
          error={detailQuery.isError ? revenueUiError(detailQuery.error, COMMERCIAL_HISTORY_LOAD_ERROR) : null}
          onClose={() => setSelected(null)}
          onRetry={() => void detailQuery.refetch()}
          onNavigateView={onNavigateView}
        />
      </div>
    </div>
  );
}
