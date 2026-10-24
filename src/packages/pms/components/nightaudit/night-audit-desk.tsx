import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, ClipboardList, Clock, RefreshCw, ShieldAlert } from "lucide-react";

import { NaClosePanel, NaCloseResult, NaCloseSummary } from "@/packages/pms/components/nightaudit/na1-panels";
import { NightAuditExceptionQueue } from "@/packages/pms/components/nightaudit/night-audit-exception-queue";
import {
  NightAuditHistoryWorkspace,
  type NightAuditHistoryFilter,
} from "@/packages/pms/components/nightaudit/night-audit-history";
import {
  formatNa1Date,
  remainingBlockerCount,
  type NaBlockerRow,
  type NaLastClosed,
} from "@/packages/pms/lib/na1";
import { NIGHT_AUDIT_TAB_COPY, type NightAuditTabId } from "@/packages/pms/lib/night-audit-shell";
import type { NightAuditOverallStatus } from "@/packages/pms/lib/night-audit-operational";
import {
  OVERALL_STATUS_LABEL,
  closeTargetDates,
  controlPrimaryAction,
  domainStatusLabel,
  effectiveOverallStatus,
  exceptionCounts,
  exceptionMeta,
  nightAuditRunState,
  type CloseResultView,
  type DomainStatus,
} from "@/packages/pms/lib/night-audit-workflow";
import type {
  AuditException,
  NightAuditHistoryPage,
  NightAuditOtbState,
  NightAuditRunRow,
} from "@/packages/pms/lib/nightaudit.functions";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

type FinancialFocus = "blockers" | "warnings" | "drawers" | "fiscal";
type OperationalFocus = "blockers" | "warnings" | "arrivals" | "overstays" | "rooms" | "overbooking";

export type FinancialSummaryView = {
  status: DomainStatus;
  blockerCount: number;
  warningCount: number;
  openDrawerCount: number;
  fiscalProblemCount: number;
};

export type OperationalSummaryView = {
  status: DomainStatus;
  blockerCount: number;
  warningCount: number;
  unresolvedArrivalCount: number;
  overstayCount: number;
  roomConflictCount: number;
  overbookingIssueCount: number;
};

export type CloseResultCard = CloseResultView & {
  runId: string;
  closedBy: string | null;
  closedAt: string | null;
  financialStatus: DomainStatus | null;
  operationalStatus: DomainStatus | null;
  warningCount: number | null;
  noteSaved?: boolean;
};

type Tone = "green" | "red" | "amber" | "slate";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-800",
  red: "bg-red-50 text-red-800",
  amber: "bg-amber-50 text-amber-900",
  slate: "bg-slate-100 text-slate-800",
};

function overallTone(status: NightAuditOverallStatus | null): Tone {
  if (status === "ready" || status === "closed") return "green";
  if (status === "warning") return "amber";
  if (status === "blocked" || status === "unavailable") return "red";
  return "slate";
}

function domainTone(status: DomainStatus): Tone {
  if (status === "ready") return "green";
  if (status === "warning") return "amber";
  if (status === "blocked" || status === "unavailable") return "red";
  return "slate";
}

function countText(status: DomainStatus, value: number): string {
  if (status === "loading") return "…";
  if (status === "unavailable") return "—";
  return String(value);
}

function KpiCard({
  label,
  value,
  detail,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: Tone;
  onClick?: () => void;
}) {
  const body = (
    <article className="h-full rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className={cn("flex size-7 items-center justify-center rounded-lg", TONE_CLASS[tone])}>{icon}</span>
      </div>
      <p className="mt-2 font-display text-lg font-semibold text-[#251605]">{value}</p>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
    </article>
  );
  if (!onClick) return body;
  return (
    <button type="button" className="text-left" onClick={onClick}>
      {body}
    </button>
  );
}

function ReadinessCard({
  label,
  status,
  blockers,
  warnings,
  onOpen,
}: {
  label: string;
  status: DomainStatus;
  blockers: number;
  warnings: number;
  onOpen?: () => void;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4" data-testid={`night-audit-readiness-${label.toLowerCase()}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#251605]">{label}</p>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE_CLASS[domainTone(status)])}>
          {domainStatusLabel(status)}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {status === "loading"
          ? "Checking…"
          : status === "unavailable"
            ? "Could not be read. Close stays blocked."
            : `${blockers} blocker(s) · ${warnings} warning(s)`}
      </p>
      {onOpen ? (
        <Button type="button" size="sm" variant="ghost" className="mt-2 px-0" onClick={onOpen}>
          Open {label}
        </Button>
      ) : null}
    </article>
  );
}

function domainFromCounts(blockers: number, warnings: number): DomainStatus {
  if (blockers > 0) return "blocked";
  return warnings > 0 ? "warning" : "ready";
}

function WarningSummary({ exceptions }: { exceptions: AuditException[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of exceptions) {
      if (row.status !== "open" || row.severity !== "warning") continue;
      const meta = exceptionMeta(row.exceptionType);
      const key = `${meta.domain === "financial" ? "Financial" : "Operations"} · ${meta.categoryLabel}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [exceptions]);
  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-testid="night-audit-warning-summary">
      <h3 className="text-sm font-medium text-[#251605]">Warnings</h3>
      <p className="text-xs text-muted-foreground">Warnings never block close.</p>
      {groups.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No open warnings.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs">
          {groups.map(([key, value]) => (
            <li key={key} className="flex justify-between gap-2">
              <span>{key}</span>
              <span className="font-medium">{value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BlockerTable({
  exceptions,
  board,
  onOpenExceptions,
}: {
  exceptions: AuditException[];
  board: NaBlockerRow[];
  onOpenExceptions: () => void;
}) {
  const open = exceptions.filter((row) => row.status === "open" && row.severity === "blocking");
  const liveBoard = board.filter((row) => row.state === "block" || row.state === "unavailable");
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card" data-testid="night-audit-top-blockers">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="text-sm font-medium text-[#251605]">Top blockers</h3>
        <Button type="button" size="sm" variant="ghost" onClick={onOpenExceptions}>
          Review exceptions
        </Button>
      </div>
      {open.length === 0 && liveBoard.length === 0 ? (
        <p className="border-t border-border px-4 py-4 text-xs text-muted-foreground">No blockers for this business date.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Issue</th>
              <th className="px-3 py-2">Domain</th>
              <th className="px-3 py-2">Resolved in</th>
            </tr>
          </thead>
          <tbody>
            {liveBoard.slice(0, 3).map((row) => (
              <tr key={`board-${row.id}`} className="border-t border-border">
                <td className="px-3 py-2">
                  <span className="font-medium">{row.label}</span>
                  <p className="text-muted-foreground">{row.detail}</p>
                </td>
                <td className="px-3 py-2">Live board</td>
                <td className="px-3 py-2">{row.clear[0]?.label ?? "—"}</td>
              </tr>
            ))}
            {open.slice(0, 5).map((row) => {
              const meta = exceptionMeta(row.exceptionType);
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className="font-medium">{meta.title}</span>
                    <p className="text-muted-foreground">{row.message}</p>
                  </td>
                  <td className="px-3 py-2">
                    {meta.domain === "financial" ? "Financial" : "Operations"} · {meta.categoryLabel}
                  </td>
                  <td className="px-3 py-2">{meta.ownerModule}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function usePropertyClock(time: (iso: string) => string): string {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now ? time(now) : "—";
}

export function NightAuditDesk({
  tab,
  focus,
  propertyName,
  businessDate,
  runId,
  runStatus,
  serverOverall,
  checkedAt,
  blockers,
  exceptions,
  lastClosed,
  lastClosedRunId,
  lastClosedOtb,
  canRetryOtb,
  role,
  phone,
  busy,
  note,
  closeError,
  closeNotice = null,
  onNoteChange,
  onConfirm,
  rechecked,
  rechecking,
  onRecheck,
  closeResult,
  onDismissResult,
  onRetryOtb,
  retryingOtb,
  financial,
  financialSummary,
  onOpenFinancial,
  operations,
  operationalSummary,
  onOpenOperations,
  onNavigate,
  history,
  historyLoading,
  historyError,
  historyFilter,
  onHistoryFilter,
  onHistoryRetry,
  selectedRunId,
  runDetail,
  runDetailLoading,
  runDetailError,
  onSelectRun,
  dateTime,
  time,
  moduleSearch,
}: {
  tab: NightAuditTabId;
  focus?: string | undefined;
  propertyName: string;
  businessDate: string;
  runId: string;
  runStatus: NightAuditRunRow["status"];
  serverOverall: NightAuditOverallStatus | null;
  checkedAt: string | null;
  blockers: NaBlockerRow[];
  exceptions: AuditException[];
  lastClosed: NaLastClosed | null;
  lastClosedRunId: string | null;
  lastClosedOtb: NightAuditOtbState | null;
  canRetryOtb: boolean;
  role: string;
  phone: boolean;
  busy: boolean;
  note: string;
  closeError: string | null;
  closeNotice?: string | null;
  onNoteChange: (value: string) => void;
  onConfirm: () => void;
  rechecked: boolean;
  rechecking: boolean;
  onRecheck: () => void;
  closeResult: CloseResultCard | null;
  onDismissResult: () => void;
  onRetryOtb: ((runId: string) => void) | null;
  retryingOtb: boolean;
  financial?: ReactNode;
  financialSummary: FinancialSummaryView;
  onOpenFinancial?: (focus: FinancialFocus) => void;
  operations?: ReactNode;
  operationalSummary: OperationalSummaryView;
  onOpenOperations?: (focus: OperationalFocus) => void;
  onNavigate: (tab: NightAuditTabId, focus?: string | null) => void;
  history: NightAuditHistoryPage | null;
  historyLoading: boolean;
  historyError: string | null;
  historyFilter: NightAuditHistoryFilter;
  onHistoryFilter: (next: NightAuditHistoryFilter) => void;
  onHistoryRetry: () => void;
  selectedRunId: string | null;
  runDetail: { run: NightAuditRunRow; exceptions: AuditException[] } | null;
  runDetailLoading: boolean;
  runDetailError: string | null;
  onSelectRun: (runId: string) => void;
  dateTime: (value: string) => string;
  time: (value: string) => string;
  moduleSearch: string;
}) {
  const clock = usePropertyClock(time);
  const closed = runStatus === "closed";
  const overall = effectiveOverallStatus({
    server: serverOverall,
    financial: financialSummary.status,
    operational: operationalSummary.status,
  });
  const runState = nightAuditRunState({ runStatus, overall });
  const counts = exceptionCounts(exceptions);
  const boardBlockers = remainingBlockerCount(blockers);
  const primary = overall ? controlPrimaryAction(overall) : null;
  const dates = closeTargetDates(businessDate);
  const loadingChecks = financialSummary.status === "loading" || operationalSummary.status === "loading";

  function runPrimary() {
    if (!primary) return;
    if (primary.kind === "retry") return onRecheck();
    if (primary.kind === "view-run") {
      const target = closed ? runId : lastClosedRunId;
      if (target) onSelectRun(target);
      else onNavigate("history");
      return;
    }
    if (primary.kind === "review-blocker") {
      if (financialSummary.status === "blocked") return onOpenFinancial?.("blockers");
      if (operationalSummary.status === "blocked") return onOpenOperations?.("blockers");
      return onNavigate("exceptions", "blockers");
    }
    onNavigate("close");
  }

  const closePanel = (
    <NaClosePanel
      businessDate={businessDate}
      rows={blockers}
      role={role}
      phone={phone}
      closed={closed}
      busy={busy}
      note={note}
      onNoteChange={onNoteChange}
      onConfirm={onConfirm}
      error={closeError}
      notice={closeNotice}
      financialGate={financialSummary.status}
      financialBlockers={financialSummary.blockerCount}
      operationalGate={operationalSummary.status}
      operationalBlockers={operationalSummary.blockerCount}
      overallStatus={overall}
      openBlockingExceptions={counts.blocking}
      warningCount={counts.warnings}
      runStatus={runStatus}
      rechecked={rechecked}
      rechecking={rechecking}
      onRecheck={onRecheck}
    />
  );

  return (
    <div className="space-y-4">
      {tab === "financial" ? financial : null}

      {tab === "operations" ? (
        <div className="space-y-3" data-testid="night-audit-operations-tab">
          <p className="text-sm text-muted-foreground">{NIGHT_AUDIT_TAB_COPY.operations}</p>
          {operations}
        </div>
      ) : null}

      {tab === "exceptions" ? (
        <NightAuditExceptionQueue
          exceptions={exceptions}
          businessDate={businessDate}
          checkedAt={checkedAt}
          runClosed={closed}
          focus={focus}
          moduleSearch={moduleSearch}
          dateTime={dateTime}
        />
      ) : null}

      {tab === "control" ? (
        <div className="space-y-4" data-testid="night-audit-control-center">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{propertyName}</p>
                <h2 className="font-display text-xl text-[#251605]">{formatNa1Date(businessDate)}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" />
                    Property time {clock}
                  </span>
                  <span>Run {runState}</span>
                  {checkedAt ? <span>Last checked {dateTime(checkedAt)}</span> : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold", TONE_CLASS[overallTone(overall)])}
                  data-testid="night-audit-overall"
                >
                  {overall ? OVERALL_STATUS_LABEL[overall] : "Checking…"}
                </span>
                <Button type="button" variant="outline" size="sm" disabled={rechecking} onClick={onRecheck}>
                  <RefreshCw className={rechecking ? "size-4 animate-spin" : "size-4"} />
                  {rechecking ? "Rechecking…" : "Recheck"}
                </Button>
                {primary ? (
                  <Button type="button" size="sm" disabled={loadingChecks && primary.kind !== "view-run"} onClick={runPrimary}>
                    {primary.label}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="contents" data-testid="night-audit-financial-kpis">
              <KpiCard
                label="Financial blockers"
                value={financialSummary.status === "unavailable" ? "Unavailable" : countText(financialSummary.status, financialSummary.blockerCount)}
                detail="Opens Financial"
                icon={<ShieldAlert className="size-3.5" />}
                tone={financialSummary.status === "unavailable" || financialSummary.blockerCount > 0 ? "red" : "green"}
                onClick={() => onOpenFinancial?.("blockers")}
              />
              <KpiCard
                label="Financial warnings"
                value={countText(financialSummary.status, financialSummary.warningCount)}
                detail="Opens Financial"
                icon={<AlertTriangle className="size-3.5" />}
                tone={financialSummary.warningCount > 0 ? "amber" : "green"}
                onClick={() => onOpenFinancial?.("warnings")}
              />
            </div>
            <div className="contents" data-testid="night-audit-operations-kpis">
              {(
                [
                  ["blockers", "Operational blockers", operationalSummary.blockerCount, "red"],
                  ["warnings", "Operational warnings", operationalSummary.warningCount, "amber"],
                ] as const
              ).map(([focus, label, count, tone]) => (
                <KpiCard
                  key={focus}
                  label={label}
                  value={
                    operationalSummary.status === "unavailable" && focus === "blockers"
                      ? "Unavailable"
                      : countText(operationalSummary.status, count)
                  }
                  detail="Opens Operations"
                  icon={focus === "warnings" ? <AlertTriangle className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
                  tone={operationalSummary.status === "unavailable" ? "red" : count > 0 ? tone : "green"}
                  onClick={() => onOpenOperations?.(focus)}
                />
              ))}
            </div>
            <KpiCard
              label="Open exceptions"
              value={String(counts.open)}
              detail={`${counts.blocking} blocking · ${counts.warnings} warning(s)`}
              icon={<ClipboardList className="size-3.5" />}
              tone={counts.blocking > 0 ? "red" : counts.open > 0 ? "amber" : "green"}
              onClick={() => onNavigate("exceptions")}
            />
            <KpiCard
              label="Open drawers"
              value={countText(financialSummary.status, financialSummary.openDrawerCount)}
              detail="Hotel cashier drawers"
              icon={<CalendarDays className="size-3.5" />}
              tone={financialSummary.openDrawerCount > 0 ? "red" : "green"}
              onClick={() => onOpenFinancial?.("drawers")}
            />
          </div>

          <div className="flex flex-wrap gap-2 text-xs" data-testid="night-audit-secondary-kpis">
            {(
              [
                ["arrivals", "Arrivals", operationalSummary.unresolvedArrivalCount, "ops"],
                ["overstays", "Overstays", operationalSummary.overstayCount, "ops"],
                ["rooms", "Room conflicts", operationalSummary.roomConflictCount, "ops"],
                ["fiscal", "Fiscal", financialSummary.fiscalProblemCount, "fin"],
                ["overbooking", "Overbooking", operationalSummary.overbookingIssueCount, "ops"],
              ] as const
            ).map(([focus, label, count, domain]) => {
              const status = domain === "fin" ? financialSummary.status : operationalSummary.status;
              return (
                <button
                  key={focus}
                  type="button"
                  className="rounded-full border border-border bg-card px-3 py-1 hover:bg-muted/40"
                  onClick={() =>
                    domain === "fin" ? onOpenFinancial?.("fiscal") : onOpenOperations?.(focus as OperationalFocus)
                  }
                >
                  {label} <span className="font-semibold">{countText(status, count)}</span>
                </button>
              );
            })}
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="night-audit-readiness">
                <ReadinessCard
                  label="Financial"
                  status={financialSummary.status}
                  blockers={financialSummary.blockerCount}
                  warnings={financialSummary.warningCount}
                  onOpen={() => onNavigate("financial")}
                />
                <ReadinessCard
                  label="Operations"
                  status={operationalSummary.status}
                  blockers={operationalSummary.blockerCount}
                  warnings={operationalSummary.warningCount}
                  onOpen={() => onNavigate("operations")}
                />
                <ReadinessCard
                  label="Exceptions"
                  status={domainFromCounts(counts.blocking, counts.warnings)}
                  blockers={counts.blocking}
                  warnings={counts.warnings}
                  onOpen={() => onNavigate("exceptions")}
                />
                <ReadinessCard
                  label="Board"
                  status={blockers.some((row) => row.state === "unavailable") ? "unavailable" : domainFromCounts(boardBlockers, 0)}
                  blockers={boardBlockers}
                  warnings={0}
                />
              </div>
              <BlockerTable exceptions={exceptions} board={blockers} onOpenExceptions={() => onNavigate("exceptions", "blockers")} />
            </div>
            <aside className="space-y-4">
              <WarningSummary exceptions={exceptions} />
              <NaCloseSummary lastClosed={lastClosed} />
              {lastClosed ? (
                <p className="px-1 text-xs text-muted-foreground" data-testid="night-audit-last-close-otb">
                  OTB snapshot for the last close:{" "}
                  {lastClosedOtb === "captured" ? "Captured" : lastClosedOtb === "not_captured" ? "Not captured" : "Unknown"}
                  {canRetryOtb && lastClosedRunId && onRetryOtb ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      className="h-auto px-1 text-xs"
                      disabled={retryingOtb}
                      onClick={() => onRetryOtb(lastClosedRunId)}
                    >
                      {retryingOtb ? "Retrying…" : "Retry OTB Snapshot"}
                    </Button>
                  ) : null}
                </p>
              ) : null}
            </aside>
          </div>
        </div>
      ) : null}

      {tab === "close" ? (
        closeResult ? (
          <NaCloseResult
            result={closeResult}
            onViewRun={() => onSelectRun(closeResult.runId)}
            onRetryOtb={canRetryOtb && onRetryOtb ? () => onRetryOtb(closeResult.runId) : null}
            retryingOtb={retryingOtb}
            onDone={onDismissResult}
          />
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-4" data-testid="night-audit-close-readiness">
              <div className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-display text-lg text-[#251605]">Close readiness</h2>
                <p className="mt-1 text-sm text-muted-foreground">{NIGHT_AUDIT_TAB_COPY.close}</p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Current business date</dt>
                    <dd className="font-medium">{formatNa1Date(dates.current)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Next business date</dt>
                    <dd className="font-medium">{formatNa1Date(dates.next)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Overall</dt>
                    <dd className="font-medium">{overall ? OVERALL_STATUS_LABEL[overall] : "Checking…"}</dd>
                  </div>
                </dl>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <ReadinessCard
                  label="Financial"
                  status={financialSummary.status}
                  blockers={financialSummary.blockerCount}
                  warnings={financialSummary.warningCount}
                  onOpen={() => onNavigate("financial")}
                />
                <ReadinessCard
                  label="Operations"
                  status={operationalSummary.status}
                  blockers={operationalSummary.blockerCount}
                  warnings={operationalSummary.warningCount}
                  onOpen={() => onNavigate("operations")}
                />
                <ReadinessCard
                  label="Exceptions"
                  status={domainFromCounts(counts.blocking, counts.warnings)}
                  blockers={counts.blocking}
                  warnings={counts.warnings}
                  onOpen={() => onNavigate("exceptions")}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Open drawers {countText(financialSummary.status, financialSummary.openDrawerCount)} · Live board{" "}
                {boardBlockers > 0 ? `${boardBlockers} blocker(s)` : "clear"}
              </p>
              <BlockerTable exceptions={exceptions} board={blockers} onOpenExceptions={() => onNavigate("exceptions", "blockers")} />
              <WarningSummary exceptions={exceptions} />
              <p className="text-xs text-muted-foreground" data-testid="night-audit-otb-note">
                The on-the-books snapshot is captured after the close commits. If it fails, the close still stands and the
                failure is shown here.
              </p>
            </section>
            {closePanel}
          </div>
        )
      ) : null}

      {tab === "history" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{NIGHT_AUDIT_TAB_COPY.history}</p>
          <NightAuditHistoryWorkspace
            data={history}
            loading={historyLoading}
            error={historyError}
            filter={historyFilter}
            onFilter={onHistoryFilter}
            onRetry={onHistoryRetry}
            selectedRunId={selectedRunId}
            runDetail={runDetail}
            runDetailLoading={runDetailLoading}
            runDetailError={runDetailError}
            onSelectRun={onSelectRun}
            dateTime={dateTime}
          />
        </div>
      ) : null}
    </div>
  );
}
