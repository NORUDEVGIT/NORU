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
  revenueApprovalStatusLabel,
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
import { ApprovalTable } from "./approval-table";
import { useRevenueApprovalPolicy } from "./use-revenue-approval-policy";
import { useRateRevenueExtras } from "../rate-revenue-shell-slots";

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
  searchQuery = "",
}: {
  restaurantId: string;
  access: RevenueAccessResolution;
  context: RevenueContext;
  approvalTab?: string | undefined;
  approvalRequest?: string | undefined;
  searchQuery?: string;
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
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
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
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.trim().toLowerCase();
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
  }, [listQuery.data?.rows, searchQuery]);

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
    mutationFn: (approvalRequestId: string) =>
      approveFn({ data: { restaurantId, approvalRequestId } }),
    onSuccess: (result) => {
      setActionError(null);
      if (result.status === "stale") {
        setStaleCopy(true);
        void detailQuery.refetch();
        invalidateRevenueApprovals(queryClient, restaurantId);
        setDialog(null);
        setActionTargetId(null);
        return;
      }
      toast.success(APPROVAL_APPLIED_TOAST);
      setStaleCopy(false);
      setDialog(null);
      setActionTargetId(null);
      invalidateRevenueApprovals(queryClient, restaurantId);
      if (detailQuery.data) invalidateApprovalAffectedDomain(queryClient, detailQuery.data.domain);
      void detailQuery.refetch();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      approvalRequestId,
      reviewReason,
    }: {
      approvalRequestId: string;
      reviewReason: string;
    }) =>
      rejectFn({ data: { restaurantId, approvalRequestId, reviewReason } }),
    onSuccess: () => {
      setActionError(null);
      setDialog(null);
      setActionTargetId(null);
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
      setActionTargetId(null);
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

  const statusOptions: ReadonlyArray<readonly [string, string]> =
    tab === "history"
      ? [
          ["all", "All terminal"],
          ...REVENUE_APPROVAL_TERMINAL_STATUSES.map(
            (status) => [status, revenueApprovalStatusLabel(status)] as const,
          ),
        ]
      : [
          ["all", "All statuses"],
          ["pending", "Pending"] as const,
          ...REVENUE_APPROVAL_TERMINAL_STATUSES.map(
            (status) => [status, revenueApprovalStatusLabel(status)] as const,
          ),
        ];
  const actorOptions = [
    ["all", "Anyone"] as const,
    ...actors.map((actor) => [actor.id, actor.label] as const),
  ];

  useRateRevenueExtras({
    searchPlaceholder: "Search summary, room, plan, reason, or staff…",
    filters: [
      {
        id: "approval-queue",
        label: "Queue",
        value: tab,
        current: tab === "pending" ? "Pending" : tab === "mine" ? "My Requests" : "History",
        options: [
          ["pending", "Pending"],
          ["mine", "My Requests"],
          ["history", "History"],
        ],
        onChange: (value) => handleTabChange(value as RevenueApprovalTab),
      },
      {
        id: "approval-domain",
        label: "Domain",
        value: currentFilters.domain || "all",
        current: currentFilters.domain ? revenueApprovalDomainLabel(currentFilters.domain) : "",
        options: [
          ["all", "All domains"] as const,
          ...REVENUE_APPROVAL_DOMAINS.map(
            (domain) => [domain, revenueApprovalDomainLabel(domain)] as const,
          ),
        ],
        onChange: (value) =>
          updateFilter("domain", value === "all" ? "" : (value as RevenueApprovalDomain)),
      },
      ...(tab === "pending"
        ? []
        : [
            {
              id: "approval-status",
              label: "Status",
              value: currentFilters.status || "all",
              current: currentFilters.status ? revenueApprovalStatusLabel(currentFilters.status) : "",
              options: statusOptions,
              onChange: (value: string) =>
                updateFilter("status", value === "all" ? "" : (value as RevenueApprovalStatus)),
            },
          ]),
      ...(tab === "mine"
        ? []
        : [
            {
              id: "approval-requested-by",
              label: "Requested By",
              value: currentFilters.requestedBy || "all",
              current: actors.find((actor) => actor.id === currentFilters.requestedBy)?.label ?? "",
              options: actorOptions,
              onChange: (value: string) => updateFilter("requestedBy", value === "all" ? "" : value),
            },
          ]),
      ...(tab === "history"
        ? [
            {
              id: "approval-reviewed-by",
              label: "Reviewed By",
              value: currentFilters.reviewedBy || "all",
              current: actors.find((actor) => actor.id === currentFilters.reviewedBy)?.label ?? "",
              options: actorOptions,
              onChange: (value: string) => updateFilter("reviewedBy", value === "all" ? "" : value),
            },
          ]
        : []),
    ],
    actions: [
      {
        id: "approval-policy",
        label: policyEnabled ? "Disable Approval Workflow" : "Enable Approval Workflow",
        disabled: policyQuery.isLoading || setPolicyMutation.isPending,
        onSelect: () => {
          setActionError(null);
          setDialog(policyEnabled ? "policy-disable" : "policy-enable");
        },
      },
    ],
    kpis: [
      {
        label: "Pending Review",
        value: metricsQuery.isLoading ? "…" : String(metricsQuery.data?.pending ?? 0),
        icon: Clock,
        tone: "bg-amber-50 text-amber-800",
      },
      {
        label: "My Requests",
        value: metricsQuery.isLoading ? "…" : String(metricsQuery.data?.mine ?? 0),
        icon: FileText,
        tone: "bg-sky-50 text-sky-700",
      },
      {
        label: "Approved & Applied",
        value: metricsQuery.isLoading ? "…" : String(metricsQuery.data?.approved ?? 0),
        icon: CheckCircle2,
        tone: "bg-emerald-50 text-emerald-700",
      },
      {
        label: "Rejected / Stale",
        value: metricsQuery.isLoading ? "…" : String(metricsQuery.data?.rejectedOrStale ?? 0),
        icon: AlertTriangle,
        tone: "bg-rose-50 text-rose-700",
      },
    ],
    onClear: clearFilters,
  });

  function openRow(row: RevenueApprovalListItem) {
    setStaleCopy(false);
    setActionError(null);
    setSelectedId(row.id);
    writeApprovalSearch(tab, row.id);
  }

  return (
    <div className="space-y-3">
      <div className="min-w-0 space-y-3">
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
                setActionTargetId(row.id);
                setDialog("cancel");
              }}
            />
            <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8E1D7] bg-card px-4 py-3 shadow-2xs">
              <p className="text-sm text-muted-foreground">
                Showing {range.start}–{searchQuery.trim() ? Math.min(range.end, filteredRows.length) : range.end} of{" "}
                {searchQuery.trim() ? filteredRows.length : range.total}
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
          if (dialog || actionTargetId) return;
          setSelectedId(null);
          writeApprovalSearch(tab, null);
        }}
        onRetry={() => void detailQuery.refetch()}
        onApprove={() => {
          setActionError(null);
          setActionTargetId(detailQuery.data?.id ?? selectedId);
          setDialog("approve");
        }}
        onReject={() => {
          setActionError(null);
          setActionTargetId(detailQuery.data?.id ?? selectedId);
          setDialog("reject");
        }}
        onCancel={() => {
          setActionError(null);
          setActionTargetId(detailQuery.data?.id ?? selectedId);
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
        onClose={() => {
          setDialog(null);
          setActionTargetId(null);
        }}
        onConfirm={(reason) => {
          if (dialog === "policy-enable") {
            setPolicyMutation.mutate(true);
            return;
          }
          if (dialog === "policy-disable") {
            setPolicyMutation.mutate(false);
            return;
          }
          if (dialog === "approve" && actionTargetId) {
            approveMutation.mutate(actionTargetId);
            return;
          }
          if (dialog === "reject" && reason && actionTargetId) {
            rejectMutation.mutate({
              approvalRequestId: actionTargetId,
              reviewReason: reason,
            });
            return;
          }
          if (dialog === "cancel" && actionTargetId) {
            cancelMutation.mutate(actionTargetId);
          }
        }}
      />
    </div>
  );
}
