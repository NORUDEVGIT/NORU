import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  DoorOpen,
  History,
  House,
  LogIn,
  LogOut,
  Loader2,
  Menu,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { StepRail, type FiscalReasonCategory } from "@/packages/pms/components/nightaudit/end-of-day-parts";
import {
  PmsFilterPopover,
  PmsFilterSection,
  PmsFilterSelect,
} from "@/packages/pms/components/pms-filter-popover";
import {
  EndOfDayStepPanel,
  type CloseOutcome,
  type StepContext,
} from "@/packages/pms/components/nightaudit/end-of-day-steps";
import {
  EndOfDayInlineHost,
  type EndOfDayInlineAction,
} from "@/packages/pms/components/nightaudit/end-of-day-inline-actions";
import { EndOfDayProcessDialog } from "@/packages/pms/components/nightaudit/end-of-day-process-dialog";
import { NightAuditChrome } from "@/packages/pms/components/nightaudit/night-audit-chrome";
import { NightAuditHistoryWorkspace } from "@/packages/pms/components/nightaudit/night-audit-history";
import { useLiveNightAuditWindow } from "@/packages/pms/components/nightaudit/use-live-night-audit-window";
import { BusinessDateRecoveryDialog } from "@/packages/pms/components/settings/business-date-recovery-dialog";
import {
  authorizeFiscalCloseOverride,
  closeBusinessDate,
  getNightAuditRun,
  getNightAuditWorkspace,
  listNightAuditHistory,
  retryNightAuditOtbSnapshot,
  saveNightAuditProgress,
  startNightAudit,
} from "@/packages/pms/lib/nightaudit.functions";
import { formatNa1Date, nightAuditOtbNotice } from "@/packages/pms/lib/na1";
import {
  nightAuditSearch,
  resolveNightAuditStep,
  resolveNightAuditTab,
  type NightAuditTabId,
} from "@/packages/pms/lib/night-audit-shell";
import {
  END_OF_DAY_STEP_IDS,
  endOfDayStep,
  firstBlockedStep,
  type EndOfDayStepId,
} from "@/packages/pms/lib/night-audit-steps";
import {
  ALREADY_CLOSED_COPY,
  DEFAULT_HISTORY_FILTER,
  HISTORY_STATUSES,
  historyStatusLabel,
  type HistoryFilter,
} from "@/packages/pms/lib/night-audit-workflow";
import { PROPERTY_BUSINESS_DATE_KEY } from "@/packages/pms/lib/use-property-business-date";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
import { useRestaurantTime } from "@/core/state/property-format";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { SHELL_ICON_BUTTON, SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { ReservationCancelWorkspace } from "@/packages/pms/components/workspaces/reservation-cancel-workspace";
import { ReservationNoShowWorkspace } from "@/packages/pms/components/workspaces/reservation-noshow-workspace";
import { formatMoney } from "@/shared/lib/property-time";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

const WORKSPACE_KEY = "night-audit";
const NOTE_SAVE_DELAY_MS = 800;
const SCAN_BEAT_MS = 700;
/** Finalize stays locked until the date is closed, so the start walk stops before it. */
const SCAN_STEPS = END_OF_DAY_STEP_IDS.filter((id) => id !== "finalize");

type EndOfDayScan = {
  startedAt: number;
  index: number;
  phase: "waiting" | "showing";
};

export function NightAuditWorkspace({
  membership,
  initialTab,
  initialRunId,
  initialStep,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
  initialRunId?: string | undefined;
  initialStep?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dateTime, time } = useRestaurantTime();
  const permissions = usePmsPermissions(restaurantId);
  const tab = resolveNightAuditTab(initialTab);
  const urlStep = resolveNightAuditStep(initialStep);

  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>(DEFAULT_HISTORY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState({
    status: DEFAULT_HISTORY_FILTER.status,
    closedBy: DEFAULT_HISTORY_FILTER.closedBy,
  });
  const [closeError, setCloseError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CloseOutcome | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(Boolean(urlStep));
  const [stayAction, setStayAction] = useState<{
    kind: "no-show" | "cancel";
    reservationId: string;
  } | null>(null);
  const [inlineAction, setInlineAction] = useState<EndOfDayInlineAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scan, setScan] = useState<EndOfDayScan | null>(null);
  const closing = useRef(false);

  const fetchWorkspace = useServerFn(getNightAuditWorkspace);
  const start = useServerFn(startNightAudit);
  const saveProgress = useServerFn(saveNightAuditProgress);
  const close = useServerFn(closeBusinessDate);
  const authorizeFiscal = useServerFn(authorizeFiscalCloseOverride);
  const retryOtb = useServerFn(retryNightAuditOtbSnapshot);
  const history = useServerFn(listNightAuditHistory);
  const fetchRun = useServerFn(getNightAuditRun);

  const workspaceQuery = useQuery({
    queryKey: [WORKSPACE_KEY, restaurantId],
    queryFn: () => fetchWorkspace({ data: { restaurantId } }),
    enabled: true,
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
    enabled: true,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const runQuery = useQuery({
    queryKey: ["night-audit-run", restaurantId, initialRunId],
    queryFn: () => fetchRun({ data: { restaurantId, runId: initialRunId ?? "" } }),
    enabled: tab === "history" && Boolean(initialRunId),
    retry: false,
  });

  const data = workspaceQuery.data ?? null;
  const liveWindow = useLiveNightAuditWindow(data?.window, data?.access.canOverrideWindow ?? false);
  const runOpen = data?.run?.status === "open" || data?.run?.status === "ready";
  useEffect(() => {
    if (urlStep) setProcessOpen(true);
  }, [urlStep]);
  const runId = runOpen ? (data?.run?.id ?? null) : null;

  const activeStep: EndOfDayStepId =
    urlStep ??
    (outcome ? "finalize" : null) ??
    data?.run?.currentStep ??
    (data ? firstBlockedStep(data.steps) : null) ??
    "prepare";
  const shownStep: EndOfDayStepId = scan ? (SCAN_STEPS[scan.index] ?? "prepare") : activeStep;

  function go(
    next: NightAuditTabId,
    options: { run?: string | null; step?: EndOfDayStepId | null } = {},
  ) {
    void navigate({
      to: "/restaurant/pms/night-audit",
      search: nightAuditSearch(next, options) as never,
    });
  }

  /* ------------------------------------------------------------ progress */

  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const noteRunId = useRef<string | null>(null);
  const noteTimer = useRef<number | null>(null);
  useEffect(() => {
    // Load the stored note once per run; local edits win afterwards.
    if (data?.run && noteRunId.current !== data.run.id) {
      noteRunId.current = data.run.id;
      setNote(data.run.notes ?? "");
      setNoteState("idle");
    }
  }, [data?.run]);
  useEffect(
    () => () => {
      if (noteTimer.current) window.clearTimeout(noteTimer.current);
    },
    [],
  );

  const canStart = data?.access.canStart === true;

  function onNoteChange(value: string) {
    setNote(value);
    if (!runId || !canStart) return;
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    setNoteState("saving");
    const target = runId;
    noteTimer.current = window.setTimeout(() => {
      void saveProgress({ data: { restaurantId, runId: target, notes: value } })
        .then((result) => setNoteState(result.ok ? "saved" : "error"))
        .catch(() => setNoteState("error"));
    }, NOTE_SAVE_DELAY_MS);
  }

  function openProcess(step?: EndOfDayStepId) {
    setProcessOpen(true);
    go("current", { step: step ?? activeStep });
  }

  function closeProcess() {
    setScan(null);
    setStayAction(null);
    setInlineAction(null);
    setProcessOpen(false);
    go("history");
  }

  function finishStayAction() {
    setStayAction(null);
    void workspaceQuery.refetch();
  }

  function finishInlineAction() {
    setInlineAction(null);
    void workspaceQuery.refetch();
  }

  function openInline(
    action: EndOfDayInlineAction,
  ) {
    setInlineAction(action);
  }

  function openStayReservation(reservationId: string) {
    void navigate({
      to: "/restaurant/pms/reservations/$reservationId",
      params: { reservationId },
      search: {
        returnTo: "/restaurant/pms/night-audit",
        returnToLabel: "End of Day",
      } as never,
    });
  }

  function selectStep(step: EndOfDayStepId) {
    setScan(null);
    go("current", { step });
    if (runId && canStart && step !== data?.run?.currentStep) {
      void saveProgress({ data: { restaurantId, runId, currentStep: step } }).catch(
        () => undefined,
      );
    }
  }

  /* ----------------------------------------------------------- mutations */

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: [WORKSPACE_KEY, restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["night-audit-history", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["night-audit-run", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: [PROPERTY_BUSINESS_DATE_KEY, restaurantId] });
  };

  const startMutation = useMutation({
    mutationFn: () =>
      start({
        data: { restaurantId, ...(data ? { expectedBusinessDate: data.businessDate } : {}) },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        refreshAll();
        return;
      }
      setOutcome(null);
      toast.success(result.resumed ? "End of Day resumed." : "End of Day started.");
      if (!result.resumed) {
        setProcessOpen(true);
        setScan({ startedAt: Date.now(), index: 0, phase: "waiting" });
      }
      void queryClient.invalidateQueries({ queryKey: [WORKSPACE_KEY, restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const goRef = useRef(go);
  goRef.current = go;
  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;

  useEffect(() => {
    if (!scan) return;
    if (scan.phase === "waiting") {
      if (workspaceQuery.isFetching) return;
      if (workspaceQuery.dataUpdatedAt < scan.startedAt) return;
      const next = workspaceQuery.data;
      const live = next?.run?.status === "open" || next?.run?.status === "ready";
      if (!next?.run || next.evaluation.failed || !live) {
        setScan(null);
        return;
      }
      setScan((current) => (current ? { ...current, phase: "showing" } : current));
      return;
    }

    const stepId = SCAN_STEPS[scan.index];
    if (!stepId) {
      setScan(null);
      return;
    }
    if (urlStep !== stepId) goRef.current("current", { step: stepId });
    const status = data?.steps.find((step) => step.id === stepId)?.status;
    const timer = window.setTimeout(() => {
      const last = scan.index >= SCAN_STEPS.length - 1;
      if (status === "blocked" || last || !status) {
        setScan(null);
        goRef.current("current", { step: stepId });
        if (data?.run?.id && data.access.canStart && stepId !== data.run.currentStep) {
          void saveProgressRef
            .current({ data: { restaurantId, runId: data.run.id, currentStep: stepId } })
            .catch(() => undefined);
        }
        return;
      }
      setScan((current) =>
        current ? { ...current, index: current.index + 1, phase: "showing" } : current,
      );
    }, SCAN_BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [scan, workspaceQuery.isFetching, workspaceQuery.dataUpdatedAt, workspaceQuery.data, data, restaurantId]);

  const closeMutation = useMutation({
    mutationFn: (vars: { runId: string; businessDate: string }) => {
      if (noteTimer.current) window.clearTimeout(noteTimer.current);
      return close({
        data: {
          restaurantId,
          runId: vars.runId,
          expectedBusinessDate: vars.businessDate.slice(0, 10),
          ...(note.trim() ? { notes: note.trim() } : {}),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setCloseError(result.message);
        toast.error(result.message);
        void queryClient.invalidateQueries({ queryKey: [WORKSPACE_KEY, restaurantId] });
        return;
      }
      setCloseError(null);
      setOutcome({
        runId: result.runId,
        businessDate: result.businessDate,
        nextBusinessDate: result.nextBusinessDate,
        alreadyClosed: result.alreadyClosed,
        closedAt: result.closedAt,
        closedBy: result.closedBy,
        otbSnapshotStatus: result.otbSnapshotStatus ?? null,
        noteSaved: result.noteSaved,
        groupBlockRelease: result.groupBlockRelease,
      });
      const otbNotice = nightAuditOtbNotice(result.otbSnapshotStatus);
      if (result.alreadyClosed) toast.info(ALREADY_CLOSED_COPY);
      else if (otbNotice) toast.info(otbNotice);
      else
        toast.success(
          `Business date ${formatNa1Date(result.businessDate)} closed. Now on ${formatNa1Date(result.nextBusinessDate)}.`,
        );
      go("current", { step: "finalize" });
      refreshAll();
    },
    onError: (error: Error) => {
      setCloseError(error.message);
      toast.error(error.message);
    },
    onSettled: () => {
      closing.current = false;
    },
  });

  const fiscalMutation = useMutation({
    mutationFn: (input: {
      exceptionId: string;
      reason: string;
      reasonCategory?: FiscalReasonCategory;
    }) => authorizeFiscal({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Fiscal close override authorized. The fiscal document remains unresolved.");
      void queryClient.invalidateQueries({ queryKey: [WORKSPACE_KEY, restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const otbMutation = useMutation({
    mutationFn: (targetRunId: string) => retryOtb({ data: { restaurantId, runId: targetRunId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setOutcome((prev) => (prev ? { ...prev, otbSnapshotStatus: result.status } : prev));
      if (result.status === "failed")
        toast.info("OTB snapshot failed again. The close is unaffected.");
      else toast.success("OTB snapshot captured.");
      void queryClient.invalidateQueries({ queryKey: [WORKSPACE_KEY, restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["night-audit-history", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /* -------------------------------------------------------------- render */

  const lockedSteps = useMemo(() => {
    const locked = new Set<EndOfDayStepId>();
    if (!data) return locked;
    const completedView =
      outcome != null || (data.lastClosed?.nextBusinessDate === data.businessDate && !data.run);
    if (!completedView) locked.add("finalize");
    return locked;
  }, [data, outcome]);

  const money = (value: number | null | undefined) =>
    typeof value === "number" ? formatMoney(value, data?.currency) : "—";

  const activity = data?.dayActivity.state === "ok" ? data.dayActivity : null;
  const openShifts = data?.cashier
    ? data.cashier.shifts.filter((row) => row.state === "open").length
    : null;
  const completedToday = Boolean(
    data &&
      (outcome != null || (data.lastClosed?.nextBusinessDate === data.businessDate && !data.run)),
  );
  const primaryLabel = runOpen
    ? "Resume End of Day"
    : completedToday
      ? "View End of Day"
      : "Start End of Day";

  const ctx: StepContext | null = data
    ? {
        data,
        window: liveWindow,
        permissions: { canAny: permissions.canAny },
        fiscal: {
          canAuthorize: data.access.canAuthorizeFiscal,
          runStarted: runOpen,
          busy: fiscalMutation.isPending,
          onAuthorize: (exceptionId, reason, reasonCategory) =>
            fiscalMutation.mutate({
              exceptionId,
              reason,
              ...(reasonCategory ? { reasonCategory } : {}),
            }),
        },
        dateTime: (value) => dateTime(value),
        time: (value) => time(value),
        money,
        onSelectStep: selectStep,
        notes: {
          value: note,
          editable: runOpen && canStart,
          state: noteState,
          onChange: onNoteChange,
        },
        close: {
          busy: closeMutation.isPending,
          error: closeError,
          onClose: () => {
            if (closing.current || closeMutation.isPending || !data.run) return;
            closing.current = true;
            setCloseError(null);
            closeMutation.mutate({ runId: data.run.id, businessDate: data.businessDate });
          },
        },
        outcome,
        otb: { busy: otbMutation.isPending, onRetry: (target) => otbMutation.mutate(target) },
        arrival: {
          onCheckIn: (reservationId, reservationRoomId) =>
            openInline({
              kind: "check-in",
              reservationId,
              ...(reservationRoomId ? { reservationRoomId } : {}),
            }),
          onCheckOut: (reservationId, reservationRoomId) =>
            openInline({
              kind: "check-out",
              reservationId,
              ...(reservationRoomId ? { reservationRoomId } : {}),
            }),
          onAllocate: (folioId, paymentId) =>
            openInline({
              kind: "allocate",
              folioId,
              ...(paymentId ? { paymentId } : {}),
            }),
          onFiscal: (target) =>
            openInline({
              kind: "fiscal",
              sourceType: target.sourceType,
              sourceId: target.sourceId,
              scope: target.scope,
              ...(target.registrationId ? { registrationId: target.registrationId } : {}),
            }),
          onNoShow: (reservationId) => setStayAction({ kind: "no-show", reservationId }),
          onCancel: (reservationId) => setStayAction({ kind: "cancel", reservationId }),
        },
      }
    : null;

  const closers = historyQuery.data?.closers ?? [];
  const closerName =
    closers.find((closer) => closer.id === historyFilter.closedBy)?.name ?? historyFilter.closedBy;
  const dateFilterLabel = historyFilter.from && historyFilter.to
    ? `${formatNa1Date(historyFilter.from)} – ${formatNa1Date(historyFilter.to)}`
    : historyFilter.from
      ? `From ${formatNa1Date(historyFilter.from)}`
      : historyFilter.to
        ? `To ${formatNa1Date(historyFilter.to)}`
        : "";
  const activeFilterCount =
    (historyFilter.status !== "all" ? 1 : 0) + (historyFilter.closedBy ? 1 : 0);

  function openHistoryFilters(open: boolean) {
    setFilterOpen(open);
    if (!open) return;
    setFilterDraft({
      status: historyFilter.status,
      closedBy: historyFilter.closedBy,
    });
  }

  function applyHistoryFilters() {
    setHistoryFilter((current) => ({
      ...current,
      page: 1,
      status: filterDraft.status,
      closedBy: filterDraft.closedBy,
    }));
    setFilterOpen(false);
  }

  function clearHistoryFilters() {
    setFilterDraft({ status: "all", closedBy: "" });
    setHistoryFilter((current) => ({
      ...current,
      page: 1,
      status: "all",
      closedBy: "",
    }));
    setFilterOpen(false);
  }

  return (
    <NightAuditChrome
      membership={membership}
      onSearch={(value) => setHistoryFilter((current) => ({ ...current, page: 1, search: value }))}
    >
      <main className="min-w-0 w-full space-y-3 p-3 sm:p-4 lg:p-5">
        <section
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
          aria-label="End of Day KPIs"
          data-testid="end-of-day-kpis"
        >
          <KpiCard
            label="Blockers"
            value={data ? String(data.blockerCount) : null}
            loading={workspaceQuery.isLoading}
            icon={<ShieldAlert className="size-4" />}
            tone="bg-red-50 text-red-700"
          />
          <KpiCard
            label="Arrivals"
            value={activity ? String(activity.arrivals.pending) : null}
            loading={workspaceQuery.isLoading}
            icon={<LogIn className="size-4" />}
            tone="bg-blue-50 text-blue-700"
          />
          <KpiCard
            label="Departures"
            value={activity ? String(activity.departures.stillInHouse) : null}
            loading={workspaceQuery.isLoading}
            icon={<LogOut className="size-4" />}
            tone="bg-[#F4E9D0] text-[#8A641A]"
          />
          <KpiCard
            label="In-House"
            value={data?.inHouseCount != null ? String(data.inHouseCount) : null}
            loading={workspaceQuery.isLoading}
            icon={<House className="size-4" />}
            tone="bg-emerald-50 text-emerald-700"
          />
          <KpiCard
            label="Open Folios"
            value={data?.folios ? String(data.folios.open) : null}
            loading={workspaceQuery.isLoading}
            icon={<Wallet className="size-4" />}
            tone="bg-orange-50 text-orange-700"
          />
          <KpiCard
            label="Open Shifts"
            value={openShifts != null ? String(openShifts) : null}
            loading={workspaceQuery.isLoading}
            icon={<DoorOpen className="size-4" />}
            tone="bg-indigo-50 text-indigo-700"
          />
        </section>

        <section
          className="relative flex w-full min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-[#DDD4C5] bg-white py-1.5 pl-12 pr-2 shadow-sm"
          data-testid="end-of-day-toolbar"
        >
          <EndOfDayMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            processOpen={processOpen}
            canRecover={data?.access.canRecover === true}
            recheckLabel={workspaceQuery.isFetching ? "Checking…" : "Recheck"}
            onOpenProcess={() => openProcess()}
            onShowHistory={closeProcess}
            onRecheck={() => void workspaceQuery.refetch()}
            onRecover={() => setRecoveryOpen(true)}
          />
          <EndOfDayDateRange
            from={historyFilter.from}
            to={historyFilter.to}
            onChange={(from, to) =>
              setHistoryFilter((current) => ({ ...current, page: 1, from, to }))
            }
          />
          <span className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={historyFilter.search}
              onChange={(event) =>
                setHistoryFilter((current) => ({ ...current, page: 1, search: event.target.value }))
              }
              className="h-9 pl-8 pr-8 text-xs"
              placeholder="Search date or closer"
              aria-label="Search End of Day runs"
              data-testid="end-of-day-search"
            />
            {historyFilter.search ? (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setHistoryFilter((current) => ({ ...current, page: 1, search: "" }))}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </span>
          <PmsFilterPopover
            title="Filter End of Day"
            activeCount={activeFilterCount}
            open={filterOpen}
            onOpenChange={openHistoryFilters}
            onClear={clearHistoryFilters}
            onApply={applyHistoryFilters}
            buttonTestId="end-of-day-filter"
            menuTestId="end-of-day-filter-menu"
          >
            <PmsFilterSection title="Status">
              <PmsFilterSelect
                value={filterDraft.status}
                onValueChange={(value) =>
                  setFilterDraft((current) => ({
                    ...current,
                    status: value as HistoryFilter["status"],
                  }))
                }
                options={[
                  ["all", "All statuses"],
                  ...HISTORY_STATUSES.map((status) => [status, historyStatusLabel(status)] as const),
                ]}
                ariaLabel="Run status"
              />
            </PmsFilterSection>
            <PmsFilterSection title="Closed by">
              <PmsFilterSelect
                value={filterDraft.closedBy || "all"}
                onValueChange={(value) =>
                  setFilterDraft((current) => ({
                    ...current,
                    closedBy: value === "all" ? "" : value,
                  }))
                }
                options={[
                  ["all", "Any closer"],
                  ...closers.map((closer) => [closer.id, closer.name] as const),
                  ...(filterDraft.closedBy && !closers.some((closer) => closer.id === filterDraft.closedBy)
                    ? [[filterDraft.closedBy, filterDraft.closedBy] as const]
                    : []),
                ]}
                ariaLabel="Closed by"
              />
            </PmsFilterSection>
          </PmsFilterPopover>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={SHELL_ICON_BUTTON}
              aria-label={workspaceQuery.isFetching ? "Checking…" : "Recheck"}
              title={workspaceQuery.isFetching ? "Checking…" : "Recheck"}
              data-testid="end-of-day-recheck"
              disabled={workspaceQuery.isFetching}
              onClick={() => {
                void workspaceQuery.refetch();
                void historyQuery.refetch();
              }}
            >
              <RefreshCw className={cn("size-4", workspaceQuery.isFetching && "animate-spin")} />
            </Button>
            <Button
              type="button"
              className={SHELL_PRIMARY_BUTTON}
              data-testid="end-of-day-open"
              onClick={() => openProcess()}
            >
              <Play className="size-4" aria-hidden />
              {primaryLabel}
            </Button>
          </div>
        </section>

        {activeFilterCount > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="end-of-day-filter-chips">
            {dateFilterLabel ? (
              <FilterChip
                label={dateFilterLabel}
                onRemove={() =>
                  setHistoryFilter((current) => ({ ...current, page: 1, from: "", to: "" }))
                }
              />
            ) : null}
            {historyFilter.status !== "all" ? (
              <FilterChip
                label={historyStatusLabel(historyFilter.status)}
                onRemove={() =>
                  setHistoryFilter((current) => ({ ...current, page: 1, status: "all" }))
                }
              />
            ) : null}
            {historyFilter.closedBy ? (
              <FilterChip
                label={closerName}
                onRemove={() =>
                  setHistoryFilter((current) => ({ ...current, page: 1, closedBy: "" }))
                }
              />
            ) : null}
            <button
              type="button"
              onClick={() => {
                clearHistoryFilters();
                setHistoryFilter((current) => ({ ...current, page: 1, from: "", to: "" }));
              }}
              className="ml-1 text-xs font-semibold text-[#8C6D23] hover:underline"
            >
              Clear all
            </button>
          </div>
        ) : null}

        {data ? (
          <p className="px-1 text-xs text-muted-foreground" data-testid="end-of-day-business-date">
            Business date {formatNa1Date(data.businessDate)}
            {data.run
              ? ` · Started by ${data.run.startedBy ?? "staff"} · ${dateTime(data.run.startedAt)}`
              : ""}
            {" · "}Checked {time(data.checkedAt)}
          </p>
        ) : null}

        {workspaceQuery.isError || (data && data.evaluation.failed) ? (
          <div
            className="rounded-lg border border-red-200 bg-white p-3 text-xs"
            data-testid="end-of-day-failed"
          >
            <p className="font-semibold text-red-800">End of Day could not be evaluated.</p>
            <p className="mt-0.5 text-muted-foreground">
              {workspaceQuery.isError
                ? (workspaceQuery.error as Error).message
                : data
                  ? (data.evaluation.message ?? "Recheck to try again.")
                  : "Recheck to try again."}
            </p>
          </div>
        ) : null}

        <NightAuditHistoryWorkspace
          embedded
          data={historyQuery.data ?? null}
          loading={historyQuery.isLoading}
          error={historyQuery.isError ? (historyQuery.error as Error).message : null}
          filter={historyFilter}
          onFilter={setHistoryFilter}
          onRetry={() => void historyQuery.refetch()}
          selectedRunId={initialRunId ?? null}
          runDetail={runQuery.data ?? null}
          runDetailLoading={runQuery.isLoading && Boolean(initialRunId)}
          runDetailError={runQuery.isError ? (runQuery.error as Error).message : null}
          onSelectRun={(selected) => {
            setProcessOpen(false);
            go("history", { run: selected || null });
          }}
          dateTime={dateTime}
        />
      </main>

      <EndOfDayProcessDialog
        open={processOpen}
        onOpenChange={(next) => (next ? openProcess() : closeProcess())}
        businessDate={data?.businessDate ?? ""}
        status={data?.auditStatus ?? "not_started"}
        canStart={canStart}
        runOpen={runOpen}
        starting={startMutation.isPending}
        onStart={() => startMutation.mutate()}
      >
        {!ctx ? (
          <p className="text-sm text-muted-foreground">Checking End of Day…</p>
        ) : stayAction ? (
          <div className="flex min-h-[70vh] flex-col">
            {stayAction.kind === "cancel" ? (
              <ReservationCancelWorkspace
                membership={membership}
                reservationId={stayAction.reservationId}
                finishLabel="Return to End of Day"
                onBackToDesk={finishStayAction}
                onOpenReservation={openStayReservation}
              />
            ) : (
              <ReservationNoShowWorkspace
                membership={membership}
                reservationId={stayAction.reservationId}
                finishLabel="Return to End of Day"
                onBackToDesk={finishStayAction}
                onOpenReservation={openStayReservation}
              />
            )}
          </div>
        ) : (
          <div>
            {scan ? (
              <div className="mb-4" data-testid="end-of-day-scan">
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-[#251605]">
                  <span className="flex items-center gap-2 font-medium" aria-live="polite">
                    <Loader2 className="size-3.5 animate-spin text-[#8A641A]" aria-hidden />
                    Checking {endOfDayStep(shownStep).title}
                  </span>
                  <span className="text-muted-foreground">
                    {scan.index + 1} of {SCAN_STEPS.length}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#E8E2D6]">
                  {scan.phase === "waiting" ? (
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[#C89933]" />
                  ) : (
                    <div
                      className="h-full rounded-full bg-[#C89933] transition-[width] duration-500"
                      style={{ width: `${((scan.index + 1) / SCAN_STEPS.length) * 100}%` }}
                    />
                  )}
                </div>
              </div>
            ) : null}
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:gap-6">
              <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start">
                <StepRail
                  steps={ctx.data.steps}
                  active={shownStep}
                  locked={lockedSteps}
                  onSelect={selectStep}
                  {...(scan ? { scanning: { stepId: shownStep, through: scan.index } } : {})}
                />
              </aside>
              <div className="relative min-w-0">
                <EndOfDayStepPanel step={shownStep} ctx={ctx} />
                {scan?.phase === "waiting" ? (
                  <div className="absolute inset-0 grid place-items-center rounded-2xl bg-[#F7F4EE]/85">
                    <p className="flex items-center gap-2 text-sm text-[#251605]">
                      <Loader2 className="size-4 animate-spin text-[#8A641A]" aria-hidden />
                      Checking End of Day…
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </EndOfDayProcessDialog>

      {inlineAction && data ? (
        <EndOfDayInlineHost
          action={inlineAction}
          restaurantId={restaurantId}
          businessDate={data.businessDate}
          money={(value) => formatMoney(value, data.currency)}
          dateTime={dateTime}
          onClose={finishInlineAction}
          onRefresh={() => {
            void workspaceQuery.refetch();
          }}
        />
      ) : null}

      {recoveryOpen && data ? (
        <BusinessDateRecoveryDialog
          restaurantId={restaurantId}
          currentBusinessDate={data.persistedBusinessDate}
          onClose={() => {
            setRecoveryOpen(false);
            refreshAll();
          }}
        />
      ) : null}
    </NightAuditChrome>
  );
}

function EndOfDayDateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div
      className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-[#DDD4C5] bg-white px-1.5"
      data-testid="end-of-day-date-range"
    >
      <Input
        type="date"
        aria-label="From business date"
        value={from}
        onChange={(event) => onChange(event.target.value, to)}
        className="h-7 w-[8.75rem] border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
      />
      <span className="text-[11px] text-[#756A5B]">–</span>
      <Input
        type="date"
        aria-label="To business date"
        value={to}
        onChange={(event) => onChange(from, event.target.value)}
        className="h-7 w-[8.75rem] border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#E8E4DC] bg-white px-2 py-0.5 font-medium text-[#251605]">
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-[#7A6B58] hover:text-[#251605]"
        aria-label={`Remove filter ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function KpiCard({
  label,
  value,
  loading,
  icon,
  tone,
}: {
  label: string;
  value: string | null;
  loading: boolean;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className="flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 shadow-sm">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", tone)}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium text-[#756A5B]">{label}</p>
        {loading ? (
          <span className="mt-1 block h-5 w-10 animate-pulse rounded bg-[#E8E2D6]" />
        ) : (
          <p className="font-display text-lg font-semibold leading-tight tracking-tight text-[#251605]">
            {value ?? "—"}
          </p>
        )}
      </div>
    </div>
  );
}

function EndOfDayMenu({
  open,
  onOpenChange,
  processOpen,
  canRecover,
  recheckLabel,
  onOpenProcess,
  onShowHistory,
  onRecheck,
  onRecover,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processOpen: boolean;
  canRecover: boolean;
  recheckLabel: string;
  onOpenProcess: () => void;
  onShowHistory: () => void;
  onRecheck: () => void;
  onRecover: () => void;
}) {
  const items = [
    { id: "process", label: "End of Day", icon: Play, active: processOpen, onSelect: onOpenProcess },
    { id: "history", label: "History", icon: History, active: !processOpen, onSelect: onShowHistory },
    { id: "recheck", label: recheckLabel, icon: RefreshCw, active: false, onSelect: onRecheck },
    ...(canRecover
      ? [
          {
            id: "recovery",
            label: "Business Date Recovery",
            icon: CalendarClock,
            active: false,
            onSelect: onRecover,
          },
        ]
      : []),
  ];
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="End of Day options"
          title="End of Day options"
          data-testid="end-of-day-menu"
          className={cn(
            "absolute left-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-[#251605]",
            "opacity-50 transition-opacity hover:bg-[#F3EEE4] hover:opacity-100",
            "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
            "data-[state=open]:bg-[#F3EEE4] data-[state=open]:opacity-100",
          )}
        >
          <Menu className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-64 p-1.5"
        data-testid="end-of-day-menu-panel"
      >
        <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Night Audit
        </p>
        <div className="flex flex-col gap-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={
                  item.id === "recovery" ? "end-of-day-recovery" : `end-of-day-menu-${item.id}`
                }
                onClick={() => {
                  onOpenChange(false);
                  item.onSelect();
                }}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  item.active
                    ? "bg-[#F4E9D0] font-medium text-[#251605]"
                    : "text-foreground hover:bg-[#F7F4EE]",
                )}
              >
                <Icon className="size-4 shrink-0 text-[#8A6A24]" aria-hidden />
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
