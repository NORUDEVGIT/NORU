import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  getRevenueApprovalRequestDetailFn,
  listRevenueApprovalRequestsFn,
  rejectRevenueApprovalRequestFn,
  setRevenueApprovalPolicyFn,
} from "@/packages/pms/lib/revenue/revenue-approval.functions";
import type { RevenueApprovalListItem } from "@/packages/pms/lib/revenue/revenue-approval.server";
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
  revenueApprovalDomainLabel,
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

function TableSkeleton() {
  return (
    <div
      className="h-64 animate-pulse rounded-xl border border-[#E8E1D7] bg-card"
      aria-busy="true"
    />
  );
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
  approvalTab?: string;
  approvalRequest?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listRevenueApprovalRequestsFn);
  const detailFn = useServerFn(getRevenueApprovalRequestDetailFn);
  const approveFn = useServerFn(approveRevenueApprovalRequestFn);
  const rejectFn = useServerFn(rejectRevenueApprovalRequestFn);
  const cancelFn = useServerFn(cancelRevenueApprovalRequestFn);
  const setPolicyFn = useServerFn(setRevenueApprovalPolicyFn);
  const policyQuery = useRevenueApprovalPolicy(restaurantId);

  const tab = parseApprovalTab(approvalTab);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(REVENUE_APPROVAL_DEFAULT_PAGE_SIZE);
  const [historyStatus, setHistoryStatus] = useState<RevenueApprovalStatus | "">("");
  const [historyDomain, setHistoryDomain] = useState<RevenueApprovalDomain | "">("");
  const [requestedBy, setRequestedBy] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(approvalRequest ?? null);
  const [dialog, setDialog] = useState<ApprovalDialogKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [staleCopy, setStaleCopy] = useState(false);

  useEffect(() => {
    setSelectedId(approvalRequest ?? null);
  }, [approvalRequest]);

  useEffect(() => {
    setPage(1);
  }, [tab, historyStatus, historyDomain, requestedBy, reviewedBy, fromDate, toDate, pageSize]);

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

  const listQuery = useQuery({
    queryKey: revenueApprovalQueryKey(restaurantId, {
      tab,
      page,
      pageSize,
      historyStatus,
      historyDomain,
      requestedBy,
      reviewedBy,
      fromDate,
      toDate,
    }),
    queryFn: () =>
      listFn({
        data: {
          restaurantId,
          page,
          pageSize,
          ...(tab === "pending" ? { status: "pending" as const } : {}),
          ...(tab === "mine" && access.membershipId ? { requestedBy: access.membershipId } : {}),
          ...(tab === "history"
            ? {
                statuses: historyStatus ? [historyStatus] : [...REVENUE_APPROVAL_TERMINAL_STATUSES],
                domain: historyDomain || undefined,
                requestedBy: requestedBy || undefined,
                reviewedBy: reviewedBy || undefined,
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
              }
            : {}),
        },
      }),
    retry: false,
  });

  const detailQuery = useQuery({
    queryKey: ["revenue-approval-detail", restaurantId, selectedId],
    queryFn: () =>
      detailFn({
        data: { restaurantId, approvalRequestId: selectedId! },
      }),
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
    const map = new Map<string, string>();
    for (const row of listQuery.data?.rows ?? []) {
      map.set(row.requestedBy, row.requestedByLabel);
      if (row.reviewedBy) map.set(row.reviewedBy, row.reviewedByLabel ?? row.reviewedBy);
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [listQuery.data?.rows]);

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
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#251605]">Approvals</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Review submitted Rate & Revenue changes before they are applied.
        </p>
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
        onChange={(next) => {
          setSelectedId(null);
          writeApprovalSearch(next, null);
        }}
      />

      {tab === "history" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#E8E1D7] bg-card px-3 py-2">
          <label className="min-w-32">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              From
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
            />
          </label>
          <label className="min-w-32">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              To
            </span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
            />
          </label>
          <label className="min-w-32">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </span>
            <select
              value={historyStatus}
              onChange={(event) =>
                setHistoryStatus(event.target.value as RevenueApprovalStatus | "")
              }
              className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
            >
              <option value="">All terminal</option>
              {REVENUE_APPROVAL_TERMINAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-32">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Domain
            </span>
            <select
              value={historyDomain}
              onChange={(event) =>
                setHistoryDomain(event.target.value as RevenueApprovalDomain | "")
              }
              className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
            >
              <option value="">All domains</option>
              {REVENUE_APPROVAL_DOMAINS.map((domain) => (
                <option key={domain} value={domain}>
                  {revenueApprovalDomainLabel(domain)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-36">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Requested By
            </span>
            <select
              value={requestedBy}
              onChange={(event) => setRequestedBy(event.target.value)}
              className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
            >
              <option value="">Anyone</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-36">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Reviewed By
            </span>
            <select
              value={reviewedBy}
              onChange={(event) => setReviewedBy(event.target.value)}
              className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
            >
              <option value="">Anyone</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="min-w-0 space-y-2">
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
            <div className="rounded-xl border border-[#E8E1D7] bg-card px-4 py-8 text-center text-[12px] text-muted-foreground">
              {emptyCopy}
            </div>
          ) : listQuery.data ? (
            <>
              <ApprovalTable
                rows={listQuery.data.rows}
                tab={tab}
                membershipId={access.membershipId}
                onReview={openRow}
                onCancel={(row) => {
                  setSelectedId(row.id);
                  setDialog("cancel");
                }}
              />
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
                  <span className="px-1 text-[9px] text-muted-foreground">
                    of {range.pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={page >= range.pageCount}
                    onClick={() => setPage((current) => current + 1)}
                    className="inline-flex h-7 items-center rounded-md border border-[#DED7CD] bg-white px-2 text-[9px] text-[#251605] disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="ml-1 size-3" />
                  </button>
                  {/* page sizes: 10, 25, 50 */}
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    className="ml-2 h-7 rounded border border-[#DED7CD] bg-white px-2 text-[9px]"
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
      </div>

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
