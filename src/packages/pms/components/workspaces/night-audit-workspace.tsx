import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { NightAuditChrome } from "@/packages/pms/components/nightaudit/night-audit-chrome";
import {
  NightAuditDesk,
  type CloseResultCard,
  type FinancialSummaryView,
  type OperationalSummaryView,
} from "@/packages/pms/components/nightaudit/night-audit-desk";
import { NightAuditFinancialPanel } from "@/packages/pms/components/nightaudit/night-audit-financial-panel";
import { NightAuditOperationalPanel } from "@/packages/pms/components/nightaudit/night-audit-operational-panel";
import {
  closeBusinessDate,
  authorizeFiscalCloseOverride,
  getNightAuditAccess,
  getNightAuditFinancials,
  getNightAuditOperations,
  getNightAuditRun,
  listNightAuditHistory,
  retryNightAuditOtbSnapshot,
  reviewWarning,
  runNightAudit,
} from "@/packages/pms/lib/nightaudit.functions";
import { formatNa1Date, nightAuditOtbNotice } from "@/packages/pms/lib/na1";
import {
  nightAuditSearch,
  resolveNightAuditTab,
  type NightAuditTabId,
} from "@/packages/pms/lib/night-audit-shell";
import {
  ALREADY_CLOSED_COPY,
  DEFAULT_HISTORY_FILTER,
  closeResultView,
  type HistoryFilter,
} from "@/packages/pms/lib/night-audit-workflow";
import { PROPERTY_BUSINESS_DATE_KEY } from "@/packages/pms/lib/use-property-business-date";
import { useRestaurantTime } from "@/core/state/property-format";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { Button } from "@/shared/components/ui/button";

export function NightAuditWorkspace({
  membership,
  initialTab,
  initialRunId,
  initialFocus,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
  initialRunId?: string | undefined;
  initialFocus?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dateTime, time } = useRestaurantTime();
  const tab = resolveNightAuditTab(initialTab);
  const [phone, setPhone] = useState(false);
  const [note, setNote] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeNotice, setCloseNotice] = useState<string | null>(null);
  const [closeResult, setCloseResult] = useState<CloseResultCard | null>(null);
  const [moduleSearch, setModuleSearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>(DEFAULT_HISTORY_FILTER);
  const [rechecking, setRechecking] = useState(false);
  const [recheckToken, setRecheckToken] = useState<string | null>(null);
  const closing = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (initialTab === tab && (tab !== "history" || !initialRunId || initialRunId.length > 0))
      return;
    void navigate({
      to: "/restaurant/pms/night-audit",
      search: nightAuditSearch(tab, initialRunId),
      replace: true,
    });
  }, [initialRunId, initialTab, navigate, tab]);

  const fetchAccess = useServerFn(getNightAuditAccess);
  const run = useServerFn(runNightAudit);
  const history = useServerFn(listNightAuditHistory);
  const close = useServerFn(closeBusinessDate);
  const authorizeFiscalOverride = useServerFn(authorizeFiscalCloseOverride);
  const retryOtb = useServerFn(retryNightAuditOtbSnapshot);
  const reviewWarningFn = useServerFn(reviewWarning);
  const fetchRun = useServerFn(getNightAuditRun);
  const fetchFinancials = useServerFn(getNightAuditFinancials);
  const fetchOperations = useServerFn(getNightAuditOperations);

  const accessQuery = useQuery({
    queryKey: ["night-audit-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const role = accessQuery.data?.role ?? membership.role;

  const auditQuery = useQuery({
    queryKey: ["night-audit", restaurantId],
    queryFn: () => run({ data: { restaurantId } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const financialQuery = useQuery({
    queryKey: ["night-audit-financial", restaurantId],
    queryFn: () => fetchFinancials({ data: { restaurantId } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const operationsQuery = useQuery({
    queryKey: ["night-audit-operations", restaurantId],
    queryFn: () => fetchOperations({ data: { restaurantId } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const historyQuery = useQuery({
    queryKey: ["night-audit-history", restaurantId, historyFilter],
    queryFn: () =>
      history({
        data: {
          restaurantId,
          page: historyFilter.page,
          pageSize: historyFilter.pageSize,
          status: historyFilter.status,
          ...(historyFilter.from ? { from: historyFilter.from } : {}),
          ...(historyFilter.to ? { to: historyFilter.to } : {}),
          ...(historyFilter.closedBy ? { closedBy: historyFilter.closedBy } : {}),
          ...(historyFilter.search.trim()
            ? { search: historyFilter.search.trim().slice(0, 80) }
            : {}),
        },
      }),
    enabled: tab === "history",
    placeholderData: keepPreviousData,
    retry: false,
  });
  const runQuery = useQuery({
    queryKey: ["night-audit-run", restaurantId, initialRunId],
    queryFn: () => fetchRun({ data: { restaurantId, runId: initialRunId ?? "" } }),
    enabled: tab === "history" && Boolean(initialRunId),
    retry: false,
  });

  function go(next: NightAuditTabId, runId?: string | null, focus?: string | null) {
    void navigate({
      to: "/restaurant/pms/night-audit",
      search: nightAuditSearch(next, runId, focus),
    });
  }

  /** Re-read only. Financial, Operations, exception sync and readiness all come from the server again. */
  async function recheck() {
    if (rechecking) return;
    setRechecking(true);
    try {
      const [audit, financial, operations] = await Promise.all([
        auditQuery.refetch(),
        financialQuery.refetch(),
        operationsQuery.refetch(),
      ]);
      const ok =
        Boolean(audit.data && financial.data && operations.data) &&
        !audit.isError &&
        !financial.isError &&
        !operations.isError;
      setRecheckToken(ok && audit.data ? audit.data.checkedAt : null);
    } finally {
      setRechecking(false);
    }
  }

  const refreshAfterClose = () => {
    void queryClient.invalidateQueries({ queryKey: ["night-audit", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["night-audit-financial", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["night-audit-operations", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["night-audit-history", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["night-audit-run", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: [PROPERTY_BUSINESS_DATE_KEY, restaurantId] });
  };

  const closeMutation = useMutation({
    mutationFn: (vars: { runId: string; businessDate: string }) =>
      close({
        data: {
          restaurantId,
          runId: vars.runId,
          expectedBusinessDate: vars.businessDate.slice(0, 10),
          ...(note.trim() ? { notes: note.trim() } : {}),
        },
      }),
    onSuccess: (result, vars) => {
      setRecheckToken(null);
      if (!result.ok) {
        setCloseNotice(null);
        setCloseError(result.message);
        toast.error(result.message);
        refreshAfterClose();
        return;
      }
      setCloseError(null);
      setNote("");
      const view = closeResultView(result);
      setCloseResult({
        ...view,
        runId: vars.runId,
        closedBy: result.closedBy,
        closedAt: result.closedAt,
        financialStatus: result.financialStatus,
        operationalStatus: result.operationalStatus,
        warningCount: result.warningCount,
        noteSaved: result.noteSaved,
      });
      const otbNotice = nightAuditOtbNotice(result.otbSnapshotStatus);
      if (result.alreadyClosed) {
        setCloseNotice(otbNotice);
        toast.info(ALREADY_CLOSED_COPY);
      } else if (otbNotice) {
        setCloseNotice(otbNotice);
        toast.warning(view.otbNotice ?? otbNotice);
      } else {
        setCloseNotice(null);
        toast.success(
          `Business date ${formatNa1Date(result.businessDate)} closed. Now on ${formatNa1Date(result.nextBusinessDate)}.`,
        );
      }
      refreshAfterClose();
    },
    onError: (error: Error) => {
      setCloseError(error.message);
      toast.error(error.message);
    },
    onSettled: () => {
      closing.current = false;
    },
  });

  const retryOtbMutation = useMutation({
    mutationFn: (runId: string) => retryOtb({ data: { restaurantId, runId } }),
    onSuccess: (result, runId) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setCloseResult((prev) =>
        prev && prev.runId === runId
          ? {
              ...prev,
              ...closeResultView({
                businessDate: prev.closedBusinessDate,
                nextBusinessDate: prev.newBusinessDate,
                alreadyClosed: prev.alreadyClosed,
                otbSnapshotStatus: result.status,
              }),
            }
          : prev,
      );
      if (result.status === "failed")
        toast.warning("OTB snapshot failed again. The close is unaffected.");
      else {
        setCloseNotice(null);
        toast.success("OTB snapshot captured.");
      }
      void queryClient.invalidateQueries({ queryKey: ["night-audit", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["night-audit-history", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const fiscalOverrideMutation = useMutation({
    mutationFn: (input: {
      exceptionId: string;
      reason: string;
      reasonCategory?:
        | "fiscal_device_offline"
        | "hardware_failure"
        | "network_failure"
        | "fiscal_authority_unavailable"
        | "integration_failure"
        | "vendor_support_pending"
        | "other";
    }) => authorizeFiscalOverride({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Fiscal close override authorized. The fiscal document remains unresolved.");
      void recheck();
      void queryClient.invalidateQueries({ queryKey: ["night-audit-financial", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reviewWarningMutation = useMutation({
    mutationFn: (input: { exceptionId: string; note?: string }) =>
      reviewWarningFn({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Warning reviewed.");
      void queryClient.invalidateQueries({ queryKey: ["night-audit", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["night-audit-financial", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["night-audit-operations", restaurantId] });
      void recheck();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleReviewWarning = async (exceptionId: string, note?: string) => {
    try {
      const result = await reviewWarningMutation.mutateAsync({ exceptionId, note });
      return result.ok;
    } catch {
      return false;
    }
  };

  if (auditQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Running night audit…</p>;
  if (auditQuery.isError || !auditQuery.data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">
          {auditQuery.isError ? (auditQuery.error as Error).message : "Night Audit is unavailable."}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void auditQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  const state = auditQuery.data;

  const financialSummary: FinancialSummaryView = financialQuery.isError
    ? {
        status: "unavailable",
        blockerCount: 0,
        warningCount: 0,
        openDrawerCount: 0,
        fiscalProblemCount: 0,
        fiscalOverrideCount: 0,
      }
    : financialQuery.data
      ? {
          status: financialQuery.data.status,
          blockerCount: financialQuery.data.summary.blockerCount,
          warningCount: financialQuery.data.summary.warningCount,
          openDrawerCount: financialQuery.data.summary.openDrawerCount,
          fiscalProblemCount: financialQuery.data.summary.fiscalProblemCount,
          fiscalOverrideCount: financialQuery.data.summary.fiscalOverrideCount ?? 0,
        }
      : {
          status: "loading",
          blockerCount: 0,
          warningCount: 0,
          openDrawerCount: 0,
          fiscalProblemCount: 0,
          fiscalOverrideCount: 0,
        };

  const operationalSummary: OperationalSummaryView = operationsQuery.isError
    ? {
        status: "unavailable",
        blockerCount: 0,
        warningCount: 0,
        unresolvedArrivalCount: 0,
        overstayCount: 0,
        roomConflictCount: 0,
        overbookingIssueCount: 0,
      }
    : operationsQuery.data
      ? {
          status: operationsQuery.data.status,
          blockerCount: operationsQuery.data.summary.blockerCount,
          warningCount: operationsQuery.data.summary.warningCount,
          unresolvedArrivalCount: operationsQuery.data.summary.unresolvedArrivalCount,
          overstayCount: operationsQuery.data.summary.overstayCount,
          roomConflictCount: operationsQuery.data.summary.roomConflictCount,
          overbookingIssueCount: operationsQuery.data.summary.overbookingIssueCount,
        }
      : {
          status: "loading",
          blockerCount: 0,
          warningCount: 0,
          unresolvedArrivalCount: 0,
          overstayCount: 0,
          roomConflictCount: 0,
          overbookingIssueCount: 0,
        };

  const rechecked =
    recheckToken != null &&
    recheckToken === state.checkedAt &&
    !auditQuery.isFetching &&
    !financialQuery.isFetching &&
    !operationsQuery.isFetching &&
    !financialQuery.isError &&
    !operationsQuery.isError;

  return (
    <NightAuditChrome
      membership={membership}
      active={tab}
      onNavigate={(id) => go(id)}
      onSearch={setModuleSearch}
    >
      <NightAuditDesk
        tab={tab}
        focus={initialFocus}
        propertyName={membership.restaurant.name}
        businessDate={state.businessDate}
        runId={state.run.id}
        runStatus={state.run.status}
        serverOverall={state.overallStatus ?? null}
        checkedAt={state.checkedAt}
        blockers={state.blockers}
        exceptions={state.exceptions}
        lastClosed={state.lastClosed}
        lastClosedRunId={state.lastClosedRunId}
        lastClosedOtb={state.lastClosedOtb}
        canRetryOtb={state.canRetryOtb}
        nightAuditWindow={state.nightAuditWindow ?? null}
        role={role}
        phone={phone}
        busy={closeMutation.isPending}
        note={note}
        closeError={closeError}
        closeNotice={closeNotice}
        onNoteChange={setNote}
        onConfirm={() => {
          if (closing.current || closeMutation.isPending) return;
          closing.current = true;
          setCloseError(null);
          closeMutation.mutate({ runId: state.run.id, businessDate: state.businessDate });
        }}
        rechecked={rechecked}
        rechecking={rechecking}
        onRecheck={() => void recheck()}
        closeResult={closeResult}
        onDismissResult={() => {
          setCloseResult(null);
          setCloseNotice(null);
        }}
        onRetryOtb={(runId) => retryOtbMutation.mutate(runId)}
        retryingOtb={retryOtbMutation.isPending}
        financialSummary={financialSummary}
        onOpenFinancial={(focus) => go("financial", null, focus)}
        operationalSummary={operationalSummary}
        onOpenOperations={(focus) => go("operations", null, focus)}
        onNavigate={(next, focus) => go(next, null, focus ?? null)}
        history={historyQuery.data ?? null}
        historyLoading={historyQuery.isLoading}
        historyError={historyQuery.isError ? (historyQuery.error as Error).message : null}
        historyFilter={historyFilter}
        onHistoryFilter={setHistoryFilter}
        onHistoryRetry={() => void historyQuery.refetch()}
        selectedRunId={initialRunId ?? null}
        runDetail={runQuery.data ?? null}
        runDetailLoading={runQuery.isLoading && Boolean(initialRunId)}
        runDetailError={runQuery.isError ? (runQuery.error as Error).message : null}
        onSelectRun={(runId) => go("history", runId || null)}
        dateTime={dateTime}
        time={time}
        moduleSearch={moduleSearch}
        authorizingFiscalOverride={fiscalOverrideMutation.isPending}
        onAuthorizeFiscalOverride={(exceptionId, reason, reasonCategory) =>
          fiscalOverrideMutation.mutate({
            exceptionId,
            reason,
            ...(reasonCategory ? { reasonCategory } : {}),
          })
        }
        onReviewWarning={handleReviewWarning}
        reviewingWarning={reviewWarningMutation.isPending}
        operationsResult={operationsQuery.data ?? null}
        operations={
          <NightAuditOperationalPanel
            loading={
              operationsQuery.isLoading || (operationsQuery.isFetching && !operationsQuery.data)
            }
            error={operationsQuery.isError ? (operationsQuery.error as Error).message : null}
            result={operationsQuery.data ?? null}
            focus={tab === "operations" ? initialFocus : undefined}
            onRefresh={() => void recheck()}
            allowedTabs={["arrivals", "departures"]}
            hideHero
            hideTabs
            exceptions={state.exceptions}
            onReviewWarning={handleReviewWarning}
            reviewingWarning={reviewWarningMutation.isPending}
            dateTime={dateTime}
            runClosed={state.run.status === "closed"}
          />
        }
        roomsOperations={
          <NightAuditOperationalPanel
            loading={
              operationsQuery.isLoading || (operationsQuery.isFetching && !operationsQuery.data)
            }
            error={operationsQuery.isError ? (operationsQuery.error as Error).message : null}
            result={operationsQuery.data ?? null}
            focus={tab === "operations" ? initialFocus : undefined}
            onRefresh={() => void recheck()}
            allowedTabs={["rooms", "housekeeping"]}
            hideHero
            hideTabs
            exceptions={state.exceptions}
            onReviewWarning={handleReviewWarning}
            reviewingWarning={reviewWarningMutation.isPending}
            dateTime={dateTime}
            runClosed={state.run.status === "closed"}
          />
        }
        otherOperations={
          <NightAuditOperationalPanel
            loading={
              operationsQuery.isLoading || (operationsQuery.isFetching && !operationsQuery.data)
            }
            error={operationsQuery.isError ? (operationsQuery.error as Error).message : null}
            result={operationsQuery.data ?? null}
            focus={tab === "operations" || tab === "exceptions" ? initialFocus : undefined}
            onRefresh={() => void recheck()}
            allowedTabs={["revenue", "overbooking", "distribution", "services"]}
            hideHero
            exceptions={state.exceptions}
            onReviewWarning={handleReviewWarning}
            reviewingWarning={reviewWarningMutation.isPending}
            dateTime={dateTime}
            runClosed={state.run.status === "closed"}
          />
        }
        financial={
          <NightAuditFinancialPanel
            loading={
              financialQuery.isLoading || (financialQuery.isFetching && !financialQuery.data)
            }
            error={financialQuery.isError ? (financialQuery.error as Error).message : null}
            result={financialQuery.data ?? null}
            focus={tab === "financial" ? initialFocus : undefined}
            onRefresh={() => void recheck()}
            hideHero
            exceptions={state.exceptions}
            role={role}
            businessDate={state.businessDate}
            authorizingFiscalOverride={fiscalOverrideMutation.isPending}
            onAuthorizeFiscalOverride={(exceptionId, reason, reasonCategory) =>
              fiscalOverrideMutation.mutate({
                exceptionId,
                reason,
                ...(reasonCategory ? { reasonCategory } : {}),
              })
            }
            onReviewWarning={handleReviewWarning}
            reviewingWarning={reviewWarningMutation.isPending}
            dateTime={dateTime}
            runClosed={state.run.status === "closed"}
          />
        }
      />
    </NightAuditChrome>
  );
}
