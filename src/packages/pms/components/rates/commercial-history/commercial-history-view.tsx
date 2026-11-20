import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { RevenueWorkspaceView } from "@/packages/pms/lib/rate-revenue-workspace";
import {
  COMMERCIAL_ACTION_TYPES,
  COMMERCIAL_ENTITY_TYPES,
} from "@/packages/pms/lib/revenue/commercial-engine";
import {
  COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE,
  COMMERCIAL_HISTORY_PAGE_SIZES,
  commercialHistoryActionLabel,
  commercialHistoryEntityTypeLabel,
  historyPaginationRange,
} from "@/packages/pms/lib/revenue/commercial-history";
import {
  getCommercialHistoryOperationDetail,
  getCommercialHistoryWorkspace,
} from "@/packages/pms/lib/revenue/commercial-history.functions";
import type { CommercialHistoryWorkspaceRow } from "@/packages/pms/lib/revenue/commercial-history-ui";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import {
  COMMERCIAL_HISTORY_LOAD_ERROR,
  revenueUiError,
} from "@/packages/pms/lib/revenue/revenue-read-error";
import { CommercialHistoryDetailDrawer } from "./commercial-history-detail-drawer";
import { CommercialHistoryEmptyState } from "./commercial-history-empty-state";
import { CommercialHistoryTable } from "./commercial-history-table";
import { useRateRevenueExtras } from "../rate-revenue-shell-slots";

function TableSkeleton() {
  return (
    <div
      className="h-64 animate-pulse rounded-xl border border-[#E8E1D7] bg-card"
      aria-busy="true"
    />
  );
}

export function CommercialHistoryView({
  restaurantId,
  context,
  searchQuery = "",
  onNavigateView,
}: {
  restaurantId: string;
  context: RevenueContext;
  searchQuery?: string;
  onContextChange?: (patch: Partial<RevenueContext>) => void;
  onNavigateView: (view: RevenueWorkspaceView) => void;
}) {
  const listFn = useServerFn(getCommercialHistoryWorkspace);
  const detailFn = useServerFn(getCommercialHistoryOperationDetail);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE);
  const [entityType, setEntityType] = useState<(typeof COMMERCIAL_ENTITY_TYPES)[number] | "">("");
  const [actionType, setActionType] = useState<(typeof COMMERCIAL_ACTION_TYPES)[number] | "">("");
  const [actorId, setActorId] = useState("");
  const searchInput = searchQuery;
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

  const range = historyPaginationRange(
    listQuery.data?.page ?? page,
    pageSize,
    listQuery.data?.total ?? 0,
  );

  const actors = listQuery.data?.actors ?? [];

  useRateRevenueExtras({
    searchPlaceholder: "Search name, code, reason, or operation",
    filters: [
      {
        id: "commercial-history-entity",
        label: "Commercial Type",
        value: entityType || "all",
        current: entityType ? commercialHistoryEntityTypeLabel(entityType) : "",
        options: [
          ["all", "All entities"] as const,
          ...COMMERCIAL_ENTITY_TYPES.map(
            (value) => [value, commercialHistoryEntityTypeLabel(value)] as const,
          ),
        ],
        onChange: (value) => {
          setEntityType(value === "all" ? "" : (value as typeof entityType));
          setSelected(null);
        },
      },
      {
        id: "commercial-history-action",
        label: "Action",
        value: actionType || "all",
        current: actionType ? commercialHistoryActionLabel(actionType) : "",
        options: [
          ["all", "All actions"] as const,
          ...COMMERCIAL_ACTION_TYPES.map(
            (value) => [value, commercialHistoryActionLabel(value)] as const,
          ),
        ],
        onChange: (value) => {
          setActionType(value === "all" ? "" : (value as typeof actionType));
          setSelected(null);
        },
      },
      {
        id: "commercial-history-actor",
        label: "Changed By",
        value: actorId || "all",
        current: actors.find((actor) => actor.id === actorId)?.name ?? "",
        options: [
          ["all", "Anyone"] as const,
          ...actors.map((actor) => [actor.id, actor.name] as const),
        ],
        onChange: (value) => {
          setActorId(value === "all" ? "" : value);
          setSelected(null);
        },
      },
    ],
    actions: [],
    onClear: () => {
      setEntityType("");
      setActionType("");
      setActorId("");
      setSelected(null);
      setPage(1);
    },
  });

  return (
    <div className="space-y-3">
      <div className="min-w-0 space-y-3">
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
            <footer className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E8E1D7] bg-card px-3.5 py-2.5">
              <p className="text-xs text-muted-foreground">
                Showing {range.start}–{range.end} of {range.total}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605] disabled:opacity-50"
                >
                  <ChevronLeft className="mr-1 size-3.5" />
                  Previous
                </button>
                <span className="grid size-8 place-items-center rounded-md bg-[#C89933] text-xs font-semibold text-[#251605]">
                  {page}
                </span>
                <span className="px-1 text-xs text-muted-foreground">of {range.pageCount}</span>
                <button
                  type="button"
                  disabled={page >= range.pageCount}
                  onClick={() => setPage((current) => current + 1)}
                  className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605] disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="ml-1 size-3.5" />
                </button>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="ml-2 h-8 rounded-md border border-[#DED7CD] bg-white px-2 text-xs text-[#251605]"
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
        error={
          detailQuery.isError
            ? revenueUiError(detailQuery.error, COMMERCIAL_HISTORY_LOAD_ERROR)
            : null
        }
        onClose={() => setSelected(null)}
        onRetry={() => void detailQuery.refetch()}
        onNavigateView={onNavigateView}
      />
    </div>
  );
}
