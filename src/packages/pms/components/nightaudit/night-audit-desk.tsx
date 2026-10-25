import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Layers,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Vault,
} from "lucide-react";

import {
  NaClosePanel,
  NaCloseResult,
  NaCloseSummary,
  NightAuditWindowBadge,
} from "@/packages/pms/components/nightaudit/na1-panels";
import { useLiveNightAuditWindow } from "@/packages/pms/components/nightaudit/use-live-night-audit-window";
import type { NightAuditWindowState } from "@/packages/pms/lib/night-audit-window";
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
  fiscalOverrideCount: number;
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
  const Icon =
    label === "Financial"
      ? Coins
      : label === "Operations"
        ? Building2
        : ShieldAlert;

  const tone = domainTone(status);

  return (
    <article
      className={cn(
        "group relative flex flex-col justify-between rounded-2xl border p-4.5 shadow-2xs transition-all",
        tone === "green"
          ? "border-emerald-200/70 bg-emerald-50/20 hover:border-emerald-300 dark:bg-emerald-950/10"
          : tone === "red"
            ? "border-red-200/80 bg-red-50/20 hover:border-red-300 dark:bg-red-950/10"
            : tone === "amber"
              ? "border-amber-200/70 bg-amber-50/20 hover:border-amber-300 dark:bg-amber-950/10"
              : "border-border/70 bg-card hover:border-border",
      )}
      data-testid={`night-audit-readiness-${label.toLowerCase()}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-lg shadow-2xs",
                tone === "green"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                  : tone === "red"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                    : tone === "amber"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                      : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
            <p className="font-display text-sm font-semibold text-foreground">{label}</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide capitalize",
              tone === "green"
                ? "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                : tone === "red"
                  ? "border-red-200/80 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                  : tone === "amber"
                    ? "border-amber-200/80 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
                    : "border-border bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                tone === "green"
                  ? "bg-emerald-500"
                  : tone === "red"
                    ? "bg-red-500"
                    : tone === "amber"
                      ? "bg-amber-500"
                      : "bg-muted-foreground",
              )}
            />
            {domainStatusLabel(status)}
          </span>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 text-xs">
          {status === "loading" ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : status === "unavailable" ? (
            <span className="text-xs text-red-700 font-medium">Could not be read. Close stays blocked.</span>
          ) : (
            <>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold text-[11px]",
                  blockers > 0
                    ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                    : "bg-emerald-100/70 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                )}
              >
                {blockers} blocker(s)
              </span>
              <span className="text-muted-foreground text-[10px]">•</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-[11px]",
                  warnings > 0
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {warnings} warning(s)
              </span>
            </>
          )}
        </div>
      </div>

      {onOpen ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-3 h-7.5 w-full justify-between rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          onClick={onOpen}
        >
          <span>Open {label}</span>
          <ArrowRight className="size-3" />
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
    <section className="rounded-2xl border border-border/70 bg-card p-4.5 shadow-2xs" data-testid="night-audit-warning-summary">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <AlertTriangle className="size-3.5" />
          </div>
          <h3 className="font-display text-sm font-semibold text-foreground">Warnings</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">Warnings never block close.</span>
      </div>

      {groups.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No open warnings.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {groups.map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs"
            >
              <span className="text-muted-foreground font-medium">{key}</span>
              <span className="rounded-md bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 font-mono text-xs font-semibold text-amber-900 dark:text-amber-200">
                {value}
              </span>
            </div>
          ))}
        </div>
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
  const totalBlockers = open.length + liveBoard.length;

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xs" data-testid="night-audit-top-blockers">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
            <ShieldAlert className="size-4" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground">Top blockers</h3>
            <p className="text-[11px] text-muted-foreground">Blocking issues preventing business date roll</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenExceptions}
          className="h-7.5 gap-1.5 text-xs font-medium"
        >
          <span>Review exceptions</span>
          <ArrowRight className="size-3" />
        </Button>
      </div>
      {totalBlockers === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <CheckCircle2 className="size-5" />
          </div>
          <p className="mt-2 text-xs font-semibold text-foreground">Clean Roll Gate</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">No blockers for this business date.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Issue</th>
                <th className="px-3.5 py-2.5 font-medium">Domain</th>
                <th className="px-3.5 py-2.5 font-medium">Resolved in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {liveBoard.slice(0, 3).map((row) => (
                <tr key={`board-${row.id}`} className="transition-colors hover:bg-muted/30">
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-red-500 shrink-0" />
                      <span className="font-semibold text-foreground">{row.label}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{row.detail}</p>
                  </td>
                  <td className="px-3.5 py-2.5 align-middle">
                    <span className="inline-flex rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:text-stone-300">
                      Live board
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-muted-foreground align-middle">{row.clear[0]?.label ?? "—"}</td>
                </tr>
              ))}
              {open.slice(0, 5).map((row) => {
                const meta = exceptionMeta(row.exceptionType);
                return (
                  <tr key={row.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-red-500 shrink-0" />
                        <span className="font-semibold text-foreground">{meta.title}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{row.message}</p>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle">
                      <span className="inline-flex rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:text-stone-300">
                        {meta.domain === "financial" ? "Financial" : "Operations"} · {meta.categoryLabel}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-muted-foreground align-middle">{meta.ownerModule}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
  authorizingFiscalOverride,
  onAuthorizeFiscalOverride,
  nightAuditWindow = null,
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
  authorizingFiscalOverride: boolean;
  onAuthorizeFiscalOverride: (exceptionId: string, reason: string, reasonCategory?: "fiscal_device_offline" | "hardware_failure" | "network_failure" | "fiscal_authority_unavailable" | "integration_failure" | "vendor_support_pending" | "other") => void;
  nightAuditWindow?: NightAuditWindowState | null;
}) {
  const clock = usePropertyClock(time);
  const liveWindow = useLiveNightAuditWindow(nightAuditWindow, role);
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
      nightAuditWindow={nightAuditWindow}
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
          role={role}
          authorizingFiscalOverride={authorizingFiscalOverride}
          onAuthorizeFiscalOverride={onAuthorizeFiscalOverride}
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
                  {liveWindow ? <NightAuditWindowBadge state={liveWindow} compact /> : null}
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
            <KpiCard
              label="Fiscal overrides"
              value={countText(financialSummary.status, financialSummary.fiscalOverrideCount)}
              detail="Authorized for this close only"
              icon={<ShieldAlert className="size-3.5" />}
              tone={financialSummary.fiscalOverrideCount > 0 ? "amber" : "green"}
              onClick={() => onNavigate("exceptions")}
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
              <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-bold text-foreground">Close readiness</h2>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide",
                          overallTone(overall) === "green"
                            ? "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : overallTone(overall) === "red"
                              ? "border-red-200/80 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                              : overallTone(overall) === "amber"
                                ? "border-amber-200/80 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
                                : "border-border bg-muted text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            overallTone(overall) === "green"
                              ? "bg-emerald-500"
                              : overallTone(overall) === "red"
                                ? "bg-red-500"
                                : overallTone(overall) === "amber"
                                  ? "bg-amber-500"
                                  : "bg-muted-foreground",
                          )}
                        />
                        {overall ? OVERALL_STATUS_LABEL[overall] : "Checking…"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{NIGHT_AUDIT_TAB_COPY.close}</p>
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Current business date</dt>
                    <dd className="mt-1 font-display text-base font-bold text-foreground">{formatNa1Date(dates.current)}</dd>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Next business date</dt>
                    <dd className="mt-1 font-display text-base font-bold text-foreground">{formatNa1Date(dates.next)}</dd>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Overall</dt>
                    <dd className="mt-1 font-display text-base font-bold text-foreground">{overall ? OVERALL_STATUS_LABEL[overall] : "Checking…"}</dd>
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

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Vault className="size-3.5 text-primary" />
                    Open drawers {countText(financialSummary.status, financialSummary.openDrawerCount)}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Layers className="size-3.5 text-primary" />
                    Live board {boardBlockers > 0 ? `${boardBlockers} blocker(s)` : "clear"}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">Snapshot updated live</span>
              </div>

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
