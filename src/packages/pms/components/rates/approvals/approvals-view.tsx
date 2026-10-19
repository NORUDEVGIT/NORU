import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { RevenueAccessResolution } from "@/packages/pms/lib/revenue/revenue-access";
import type {
  RevenueApprovalDomain,
  RevenueApprovalStatus,
} from "@/packages/pms/lib/revenue/revenue-approval";
import {
  REVENUE_APPROVAL_DOMAINS,
  REVENUE_APPROVAL_TERMINAL_STATUSES,
} from "@/packages/pms/lib/revenue/revenue-approval";
import {
  approveRevenueApprovalRequestFn,
  cancelRevenueApprovalRequestFn,
  getRevenueApprovalMetricsFn,
  getRevenueApprovalRequestDetailFn,
  listRevenueApprovalActorsFn,
  listRevenueApprovalRequestsFn,
  rejectRevenueApprovalRequestFn,
  setRevenueApprovalPolicyFn,
} from "@/packages/pms/lib/revenue/revenue-approval.functions";
import type {
  RevenueApprovalDetail,
  RevenueApprovalListItem,
} from "@/packages/pms/lib/revenue/revenue-approval.server";
import {
  APPROVAL_APPLIED_TOAST,
  APPROVAL_DISABLED_EMPTY,
  APPROVAL_HISTORY_EMPTY,
  APPROVAL_MINE_EMPTY,
  APPROVAL_PENDING_EMPTY,
  APPROVAL_POLICY_DISABLE_CONFIRM,
  APPROVAL_POLICY_ENABLE_CONFIRM,
  REVENUE_APPROVAL_DEFAULT_PAGE_SIZE,
  REVENUE_APPROVAL_PAGE_SIZES,
  invalidateApprovalAffectedDomain,
  invalidateRevenueApprovals,
  parseApprovalTab,
  revenueApprovalActorsQueryKey,
  revenueApprovalDomainLabel,
  revenueApprovalMetricsQueryKey,
  revenueApprovalQueryKey,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";
import {
  serializeRevenueSearch,
  type RevenueApprovalTab,
  type RevenueContext,
} from "@/packages/pms/lib/revenue/revenue-context";
import { historyPaginationRange } from "@/packages/pms/lib/revenue/rate-history";
import { revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { ApprovalActionDialog, type ApprovalDialogKind } from "./approval-action-dialog";
import { ApprovalDetailDrawer } from "./approval-detail-drawer";
import { ApprovalPolicyControl } from "./approval-policy-control";
import { ApprovalTable } from "./approval-table";
import { ApprovalTabs } from "./approval-tabs";
import { useRevenueApprovalPolicy } from "./use-revenue-approval-policy";

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
  hint,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex min-w-0 flex-1 items-center gap-3.5 rounded-xl border bg-card p-4 text-left transition-all shadow-2xs hover:shadow-sm",
        active
          ? "border-[#C89933] ring-2 ring-[#C89933]/30 bg-[#FAF7F0]"
          : "border-[#E8E1D7] hover:border-[#D5C7B3] hover:bg-[#FAF8F4]/70",
      ].join(" ")}
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
          {label}
        </p>
        <p className="mt-0.5 font-display text-2xl font-bold leading-tight text-[#251605]">
          {value}
        </p>
        {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </button>
  );
}

function TableSkeleton() {
  return (
    <div
      className="h-64 animate-pulse rounded-xl border border-[#E8E1D7] bg-card"
      aria-busy="true"
    />
  );
}

type ApprovalTabFilters = {
  search: string;
  domain: RevenueApprovalDomain | "";
  status: RevenueApprovalStatus | "";
  requestedBy: string;
  reviewedBy: string;
  fromDate: string;
  toDate: string;
};

const DEFAULT_APPROVAL_TAB_FILTERS: ApprovalTabFilters = {
  search: "",
  domain: "",
  status: "",
  requestedBy: "",
  reviewedBy: "",
  fromDate: "",
  toDate: "",
};

function createInitialApprovalTabFilters(): Record<RevenueApprovalTab, ApprovalTabFilters> {
  return {
    pending: { ...DEFAULT_APPROVAL_TAB_FILTERS },
    mine: { ...DEFAULT_APPROVAL_TAB_FILTERS },
    history: { ...DEFAULT_APPROVAL_TAB_FILTERS },
  };
}

export function ApprovalsView({
  restaurantId,
  access,
  context,
  approvalTab,
  approvalRequest,
}: {
  restaurantId: string;
  access: RevenueAccessResolution;
  context: RevenueContext;
  approvalTab?: string | undefined;
  approvalRequest?: string | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listRevenueApprovalRequestsFn);
  const detailFn = useServerFn(getRevenueApprovalRequestDetailFn);
  const approveFn = useServerFn(approveRevenueApprovalRequestFn);
  const rejectFn = useServerFn(rejectRevenueApprovalRequestFn);
  const cancelFn = useServerFn(cancelRevenueApprovalRequestFn);
  const setPolicyFn = useServerFn(setRevenueApprovalPolicyFn);
  const actorsFn = useServerFn(listRevenueApprovalActorsFn);
  const policyQuery = useRevenueApprovalPolicy(restaurantId);
  const metricsFn = useServerFn(getRevenueApprovalMetricsFn);

  const actorsQuery = useQuery({
    queryKey: revenueApprovalActorsQueryKey(restaurantId),
    queryFn: () => actorsFn({ data: { restaurantId } }),
  });

  const metricsQuery = useQuery({
    queryKey: revenueApprovalMetricsQueryKey(restaurantId, access.membershipId ?? undefined),
    queryFn: () =>
      metricsFn({
        data: {
          restaurantId,
          membershipId: access.membershipId ?? undefined,
        },
      }),
  });

  const tab = parseApprovalTab(approvalTab);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(REVENUE_APPROVAL_DEFAULT_PAGE_SIZE);
  const [tabFilters, setTabFilters] = useState<Record<RevenueApprovalTab, ApprovalTabFilters>>(
    createInitialApprovalTabFilters,
  );
  const [selectedId, setSelectedId] = useState<string | null>(approvalRequest ?? null);
  const [dialog, setDialog] = useState<ApprovalDialogKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [staleCopy, setStaleCopy] = useState(false);

  const currentFilters = tabFilters[tab] ?? DEFAULT_APPROVAL_TAB_FILTERS;

  useEffect(() => {
    setSelectedId(approvalRequest ?? null);
  }, [approvalRequest]);

  useEffect(() => {
    setPage(1);
  }, [tab, currentFilters, pageSize]);

  function writeApprovalSearch(nextTab: RevenueApprovalTab, nextRequest?: string | null) {
    void navigate({
      to: "/restaurant/pms/rates-revenue",
      search: serializeRevenueSearch("approvals", context, {
        approvalTab: nextTab,
        approvalRequest: nextRequest ?? undefined,
      }),
      replace: true,
    });
  }

  function updateFilter<K extends keyof ApprovalTabFilters>(key: K, value: ApprovalTabFilters[K]) {
    setTabFilters((prev) => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [key]: value,
      },
    }));
    setPage(1);
  }

  function clearFilters() {
    setTabFilters((prev) => ({
      ...prev,
      [tab]: { ...DEFAULT_APPROVAL_TAB_FILTERS },
    }));
    setPage(1);
  }

  function handleTabChange(nextTab: RevenueApprovalTab, overrides?: Partial<ApprovalTabFilters>) {
    setSelectedId(null);
    setPage(1);
    setTabFilters((prev) => ({
      ...prev,
      [nextTab]: overrides
        ? { ...DEFAULT_APPROVAL_TAB_FILTERS, ...overrides }
        : { ...DEFAULT_APPROVAL_TAB_FILTERS },
    }));
    writeApprovalSearch(nextTab, null);
  }

  const listQuery = useQuery({
    queryKey: revenueApprovalQueryKey(restaurantId, {
      tab,
      page,
      pageSize,
      historyStatus: currentFilters.status,
      historyDomain: currentFilters.domain,
      requestedBy: currentFilters.requestedBy,
      reviewedBy: currentFilters.reviewedBy,
      fromDate: currentFilters.fromDate,
      toDate: currentFilters.toDate,
    }),
    queryFn: () =>
      listFn({
        data: {
          restaurantId,
          page,
          pageSize,
          domain: currentFilters.domain || undefined,
          ...(tab === "pending"
            ? {
                status: "pending" as const,
                requestedBy: currentFilters.requestedBy || undefined,
              }
            : {}),
          ...(tab === "mine" && access.membershipId
            ? {
                requestedBy: access.membershipId,
                status: currentFilters.status || undefined,
              }
            : {}),
          ...(tab === "history"
            ? {
                statuses: currentFilters.status ? [currentFilters.status] : [...REVENUE_APPROVAL_TERMINAL_STATUSES],
                requestedBy: currentFilters.requestedBy || undefined,
                reviewedBy: currentFilters.reviewedBy || undefined,
                fromDate: currentFilters.fromDate || undefined,
                toDate: currentFilters.toDate || undefined,
              }
            : {}),
        },
      }),
    retry: false,
  });

  const filteredRows = useMemo(() => {
    const rows = listQuery.data?.rows ?? [];
    if (!currentFilters.search.trim()) return rows;
    const q = currentFilters.search.trim().toLowerCase();
    return rows.filter((row) => {
      const summaryMatch = row.summary.toLowerCase().includes(q);
      const reqReasonMatch = Boolean(
        row.requestReason && row.requestReason.toLowerCase().includes(q),
      );
      const revReasonMatch = Boolean(
        row.reviewReason && row.reviewReason.toLowerCase().includes(q),
      );
      const requesterMatch = row.requestedByLabel.toLowerCase().includes(q);
      const reviewerMatch = Boolean(
        row.reviewedByLabel && row.reviewedByLabel.toLowerCase().includes(q),
      );
      const scopeMatch = Boolean(
        row.displaySnapshot &&
          (row.displaySnapshot.roomTypeNames.some((n) => n.toLowerCase().includes(q)) ||
            row.displaySnapshot.ratePlanNames.some((n) => n.toLowerCase().includes(q))),
      );
      return (
        summaryMatch ||
        reqReasonMatch ||
        revReasonMatch ||
        requesterMatch ||
        reviewerMatch ||
        scopeMatch
      );
    });
  }, [listQuery.data?.rows, currentFilters.search]);

  const hasActiveFilters = Boolean(
    currentFilters.search.trim() ||
      currentFilters.domain ||
      currentFilters.status ||
      currentFilters.requestedBy ||
      currentFilters.reviewedBy ||
      currentFilters.fromDate ||
      currentFilters.toDate,
  );

  const activeFilterCount =
    (currentFilters.search.trim() ? 1 : 0) +
    (currentFilters.domain ? 1 : 0) +
    (currentFilters.status ? 1 : 0) +
    (currentFilters.requestedBy ? 1 : 0) +
    (currentFilters.reviewedBy ? 1 : 0) +
    (currentFilters.fromDate ? 1 : 0) +
    (currentFilters.toDate ? 1 : 0);

  const detailQuery = useQuery<RevenueApprovalDetail>({
    queryKey: ["revenue-approval-detail", restaurantId, selectedId],
    queryFn: async (): Promise<RevenueApprovalDetail> => {
      const res = await detailFn({
        data: { restaurantId, approvalRequestId: selectedId! },
      });
      return res as RevenueApprovalDetail;
    },
    enabled: Boolean(selectedId),
    retry: false,
  });

  const setPolicyMutation = useMutation({
    mutationFn: (enabled: boolean) => setPolicyFn({ data: { restaurantId, enabled } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["revenue-approval-policy", restaurantId] });
      setDialog(null);
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: () => approveFn({ data: { restaurantId, approvalRequestId: selectedId! } }),
    onSuccess: (result) => {
      setActionError(null);
      if (result.status === "stale") {
        setStaleCopy(true);
        void detailQuery.refetch();
        invalidateRevenueApprovals(queryClient, restaurantId);
        setDialog(null);
        return;
      }
      toast.success(APPROVAL_APPLIED_TOAST);
      setStaleCopy(false);
      setDialog(null);
      invalidateRevenueApprovals(queryClient, restaurantId);
      if (detailQuery.data) invalidateApprovalAffectedDomain(queryClient, detailQuery.data.domain);
      void detailQuery.refetch();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (reviewReason: string) =>
      rejectFn({ data: { restaurantId, approvalRequestId: selectedId!, reviewReason } }),
    onSuccess: () => {
      setActionError(null);
      setDialog(null);
      invalidateRevenueApprovals(queryClient, restaurantId);
      void detailQuery.refetch();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { restaurantId, approvalRequestId: id } }),
    onSuccess: () => {
      setActionError(null);
      setDialog(null);
      invalidateRevenueApprovals(queryClient, restaurantId);
      void detailQuery.refetch();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const actors = useMemo(() => {
    const list = actorsQuery.data ?? [];
    if (list.length > 0) return list;
    const map = new Map<string, string>();
    for (const row of listQuery.data?.rows ?? []) {
      map.set(row.requestedBy, row.requestedByLabel);
      if (row.reviewedBy) map.set(row.reviewedBy, row.reviewedByLabel ?? row.reviewedBy);
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [actorsQuery.data, listQuery.data?.rows]);

  const range = historyPaginationRange(
    listQuery.data?.page ?? page,
    pageSize,
    listQuery.data?.total ?? 0,
  );
  const policyEnabled = policyQuery.data?.enabled === true;
  const emptyCopy =
    tab === "mine"
      ? APPROVAL_MINE_EMPTY
      : tab === "history"
        ? APPROVAL_HISTORY_EMPTY
        : !policyEnabled
          ? `${APPROVAL_PENDING_EMPTY} ${APPROVAL_DISABLED_EMPTY}`
          : APPROVAL_PENDING_EMPTY;

  function openRow(row: RevenueApprovalListItem) {
    setStaleCopy(false);
    setActionError(null);
    setSelectedId(row.id);
    writeApprovalSearch(tab, row.id);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold text-[#251605]">Approvals</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review submitted Rate & Revenue changes before they are applied.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Clock}
          label="Pending Review"
          value={metricsQuery.isLoading ? "…" : (metricsQuery.data?.pending ?? 0)}
          tone="bg-amber-100 text-amber-900 border border-amber-200/80"
          hint="Requires manager review"
          active={tab === "pending"}
          onClick={() => handleTabChange("pending")}
        />
        <KpiCard
          icon={FileText}
          label="My Requests"
          value={metricsQuery.isLoading ? "…" : (metricsQuery.data?.mine ?? 0)}
          tone="bg-blue-100 text-blue-900 border border-blue-200/80"
          hint="Submitted by you"
          active={tab === "mine"}
          onClick={() => handleTabChange("mine")}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Approved & Applied"
          value={metricsQuery.isLoading ? "…" : (metricsQuery.data?.approved ?? 0)}
          tone="bg-emerald-100 text-emerald-900 border border-emerald-200/80"
          hint="Active in property rates"
          active={tab === "history" && currentFilters.status === "approved"}
          onClick={() => handleTabChange("history", { status: "approved" })}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Rejected / Stale"
          value={metricsQuery.isLoading ? "…" : (metricsQuery.data?.rejectedOrStale ?? 0)}
          tone="bg-rose-100 text-rose-900 border border-rose-200/80"
          hint="Unapplied changes"
          active={
            tab === "history" &&
            (currentFilters.status === "rejected" || currentFilters.status === "stale")
          }
          onClick={() => handleTabChange("history", { status: "rejected" })}
        />
      </div>

      <ApprovalPolicyControl
        enabled={policyEnabled}
        loading={policyQuery.isLoading}
        busy={setPolicyMutation.isPending}
        onRequestChange={(next) => {
          setActionError(null);
          setDialog(next ? "policy-enable" : "policy-disable");
        }}
      />

      <ApprovalTabs
        tab={tab}
        onChange={(next) => handleTabChange(next)}
      />

      {/* Unified Search and Filters Toolbar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-2xs">
        {/* Search Input */}
        <div className="min-w-64 flex-1">
          <label htmlFor="approval-search" className="block text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
            Search requests
          </label>
          <div className="relative mt-1.5 flex items-center">
            <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
            <input
              id="approval-search"
              type="text"
              value={currentFilters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              placeholder="Search summary, room, plan, reason, or staff…"
              className="flex h-10 w-full rounded-lg border border-[#DED7CD] bg-white pl-9 pr-8 text-sm text-[#251605] placeholder:text-muted-foreground/70 focus:border-[#C89933] focus:outline-hidden"
            />
            {currentFilters.search ? (
              <button
                type="button"
                onClick={() => updateFilter("search", "")}
                className="absolute right-2.5 text-muted-foreground hover:text-[#251605]"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Domain Filter (available across tabs) */}
        <label className="min-w-36 flex-1 sm:flex-none">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
            Domain
          </span>
          <select
            value={currentFilters.domain}
            onChange={(event) =>
              updateFilter("domain", event.target.value as RevenueApprovalDomain | "")
            }
            className="mt-1.5 flex h-10 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm text-[#251605] focus:border-[#C89933] focus:outline-hidden"
          >
            <option value="">All domains</option>
            {REVENUE_APPROVAL_DOMAINS.map((domain) => (
              <option key={domain} value={domain}>
                {revenueApprovalDomainLabel(domain)}
              </option>
            ))}
          </select>
        </label>

        {/* Status Filter */}
        {tab === "history" ? (
          <label className="min-w-36 flex-1 sm:flex-none">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
              Status
            </span>
            <select
              value={currentFilters.status}
              onChange={(event) =>
                updateFilter("status", event.target.value as RevenueApprovalStatus | "")
              }
              className="mt-1.5 flex h-10 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm text-[#251605] focus:border-[#C89933] focus:outline-hidden"
            >
              <option value="">All terminal</option>
              {REVENUE_APPROVAL_TERMINAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        ) : tab === "mine" ? (
          <label className="min-w-36 flex-1 sm:flex-none">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
              Status
            </span>
            <select
              value={currentFilters.status}
              onChange={(event) =>
                updateFilter("status", event.target.value as RevenueApprovalStatus | "")
              }
              className="mt-1.5 flex h-10 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm text-[#251605] focus:border-[#C89933] focus:outline-hidden"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              {REVENUE_APPROVAL_TERMINAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {/* Requested By Filter (History and Pending tabs) */}
        {tab !== "mine" ? (
          <label className="min-w-40 flex-1 sm:flex-none">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
              Requested By
            </span>
            <select
              value={currentFilters.requestedBy}
              onChange={(event) => updateFilter("requestedBy", event.target.value)}
              className="mt-1.5 flex h-10 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm text-[#251605] focus:border-[#C89933] focus:outline-hidden"
            >
              <option value="">Anyone</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {/* Reviewed By Filter (History tab) */}
        {tab === "history" ? (
          <label className="min-w-40 flex-1 sm:flex-none">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
              Reviewed By
            </span>
            <select
              value={currentFilters.reviewedBy}
              onChange={(event) => updateFilter("reviewedBy", event.target.value)}
              className="mt-1.5 flex h-10 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm text-[#251605] focus:border-[#C89933] focus:outline-hidden"
            >
              <option value="">Anyone</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {/* Date Range Filters (History tab) */}
        {tab === "history" ? (
          <>
            <label className="min-w-36 flex-1 sm:flex-none">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
                From
              </span>
              <input
                type="date"
                value={currentFilters.fromDate}
                onChange={(event) => updateFilter("fromDate", event.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm text-[#251605] focus:border-[#C89933] focus:outline-hidden"
              />
            </label>
            <label className="min-w-36 flex-1 sm:flex-none">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
                To
              </span>
              <input
                type="date"
                value={currentFilters.toDate}
                onChange={(event) => updateFilter("toDate", event.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm text-[#251605] focus:border-[#C89933] focus:outline-hidden"
              />
            </label>
          </>
        ) : null}

        {/* Clear Filters Action */}
        {hasActiveFilters ? (
          <div className="flex items-center">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#DED7CD] bg-white px-3.5 text-sm font-semibold text-[#251605] hover:bg-[#FAF8F4] transition-colors"
            >
              <RotateCcw className="size-3.5" />
              Clear ({activeFilterCount})
            </button>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 space-y-4">
        {listQuery.isLoading ? (
          <TableSkeleton />
        ) : listQuery.isError ? (
          <InventoryState
            state="error"
            title="Approvals could not be loaded."
            description={revenueUiError(listQuery.error, "Approvals could not be loaded.")}
            onRetry={() => void listQuery.refetch()}
          />
        ) : listQuery.data && listQuery.data.rows.length === 0 ? (
          <div className="rounded-xl border border-[#E8E1D7] bg-card px-4 py-12 text-center text-sm text-muted-foreground shadow-2xs">
            {emptyCopy}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-[#E8E1D7] bg-card px-4 py-12 text-center text-sm text-muted-foreground shadow-2xs space-y-3">
            <p className="font-medium text-[#251605]">No approvals match your current filters.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DED7CD] bg-white px-3 text-sm font-semibold text-[#251605] hover:bg-[#FAF8F4]"
            >
              <RotateCcw className="size-3.5" />
              Reset Filters
            </button>
          </div>
        ) : listQuery.data ? (
          <>
            <ApprovalTable
              rows={filteredRows}
              tab={tab}
              membershipId={access.membershipId}
              onReview={openRow}
              onCancel={(row) => {
                setSelectedId(row.id);
                setDialog("cancel");
              }}
            />
            <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8E1D7] bg-card px-4 py-3 shadow-2xs">
              <p className="text-sm text-muted-foreground">
                Showing {range.start}–{currentFilters.search.trim() ? Math.min(range.end, filteredRows.length) : range.end} of{" "}
                {currentFilters.search.trim() ? filteredRows.length : range.total}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3 text-sm font-medium text-[#251605] hover:bg-[#FAF8F4] transition-colors disabled:opacity-50"
                >
                  <ChevronLeft className="mr-1 size-4" />
                  Previous
                </button>
                <span className="grid size-9 place-items-center rounded-lg bg-[#C89933] text-sm font-semibold text-[#251605]">
                  {page}
                </span>
                <span className="px-1 text-sm text-muted-foreground">
                  of {range.pageCount}
                </span>
                <button
                  type="button"
                  disabled={page >= range.pageCount}
                  onClick={() => setPage((current) => current + 1)}
                  className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3 text-sm font-medium text-[#251605] hover:bg-[#FAF8F4] transition-colors disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="ml-1 size-4" />
                </button>
                {/* page sizes: 10, 25, 50 */}
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="ml-2 h-9 rounded-lg border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605] focus:border-[#C89933] focus:outline-hidden"
                  aria-label="Rows per page"
                >
                  {REVENUE_APPROVAL_PAGE_SIZES.map((size) => (
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

      <ApprovalDetailDrawer
        open={Boolean(selectedId)}
        detail={detailQuery.data ?? null}
        loading={detailQuery.isFetching}
        error={
          detailQuery.isError
            ? revenueUiError(detailQuery.error, "Request could not be loaded.")
            : null
        }
        applyError={actionError}
        staleCopy={staleCopy || detailQuery.data?.status === "stale"}
        access={access}
        busy={approveMutation.isPending || rejectMutation.isPending || cancelMutation.isPending}
        onClose={() => {
          setSelectedId(null);
          writeApprovalSearch(tab, null);
        }}
        onRetry={() => void detailQuery.refetch()}
        onApprove={() => {
          setActionError(null);
          setDialog("approve");
        }}
        onReject={() => {
          setActionError(null);
          setDialog("reject");
        }}
        onCancel={() => {
          setActionError(null);
          setDialog("cancel");
        }}
        onViewApplied={(view) => {
          void navigate({
            to: "/restaurant/pms/rates-revenue",
            search: serializeRevenueSearch(view, context),
          });
        }}
      />

      <ApprovalActionDialog
        open={dialog != null}
        kind={dialog ?? "approve"}
        title={
          dialog === "approve"
            ? "Approve & Apply"
            : dialog === "reject"
              ? "Reject request"
              : dialog === "cancel"
                ? "Cancel request"
                : "Approval workflow"
        }
        confirmCopy={
          dialog === "policy-enable"
            ? APPROVAL_POLICY_ENABLE_CONFIRM
            : dialog === "policy-disable"
              ? APPROVAL_POLICY_DISABLE_CONFIRM
              : dialog === "approve"
                ? "Approve and apply this requested change?"
                : dialog === "reject"
                  ? "Reject this approval request?"
                  : "Cancel this pending request?"
        }
        busy={
          approveMutation.isPending ||
          rejectMutation.isPending ||
          cancelMutation.isPending ||
          setPolicyMutation.isPending
        }
        error={actionError}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => {
          if (dialog === "policy-enable") {
            setPolicyMutation.mutate(true);
            return;
          }
          if (dialog === "policy-disable") {
            setPolicyMutation.mutate(false);
            return;
          }
          if (dialog === "approve") {
            approveMutation.mutate();
            return;
          }
          if (dialog === "reject" && reason) {
            rejectMutation.mutate(reason);
            return;
          }
          if (dialog === "cancel" && selectedId) {
            cancelMutation.mutate(selectedId);
          }
        }}
      />
    </div>
  );
}
