import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import {
  NA1_CHROME,
  NA1_CONFIRM_GOLD,
  NA1_CONFIRM_LABEL,
  NA1_NOTE_HINT,
  NA1_PHONE_CLOSE_COPY,
  canConfirmNightAudit,
  formatNa1Date,
  liveCountFromSnapshot,
  remainingBlockerCount,
  summaryRoomUnitCount,
  type NaBlockerRow,
  type NaLastClosed,
} from "@/packages/pms/lib/na1";
import {
  ALREADY_CLOSED_COPY,
  CLOSE_CONFIRM_COPY,
  closeGate,
  closeTargetDates,
  domainStatusLabel,
  formatSummaryCount,
  summaryCount,
  type CloseResultView,
  type DomainStatus,
} from "@/packages/pms/lib/night-audit-workflow";
import type { NightAuditOverallStatus } from "@/packages/pms/lib/night-audit-operational";
import type { NightAuditRunRow } from "@/packages/pms/lib/nightaudit.functions";
import {
  OWNER_OUTSIDE_WINDOW_COPY,
  type NightAuditWindowState,
} from "@/packages/pms/lib/night-audit-window";
import { useLiveNightAuditWindow } from "@/packages/pms/components/nightaudit/use-live-night-audit-window";
import { useRestaurantTime } from "@/core/state/property-format";
import { cn } from "@/shared/lib/utils";

export function NightAuditWindowBadge({
  state,
  compact = false,
}: {
  state: NightAuditWindowState;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        state.open
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-100 text-slate-700",
      )}
      data-testid="night-audit-window-status"
    >
      {compact ? "Audit window" : "Night Audit window"} {state.label} ·{" "}
      {state.open ? "OPEN" : "CLOSED"}
    </span>
  );
}

export function NaClosePanel({
  businessDate,
  rows,
  role,
  phone,
  closed,
  busy,
  note,
  onNoteChange,
  onConfirm,
  error,
  notice,
  financialGate = "ready",
  financialBlockers = 0,
  operationalGate = "ready",
  operationalBlockers = 0,
  overallStatus = null,
  openBlockingExceptions = 0,
  warningCount = 0,
  runStatus = "open",
  rechecked = false,
  rechecking = false,
  onRecheck,
  nightAuditWindow = null,
}: {
  businessDate: string;
  rows: NaBlockerRow[];
  role: string;
  phone: boolean;
  closed: boolean;
  busy: boolean;
  note: string;
  onNoteChange: (value: string) => void;
  onConfirm: () => void;
  error: string | null;
  notice?: string | null;
  financialGate?: DomainStatus;
  financialBlockers?: number;
  operationalGate?: DomainStatus;
  operationalBlockers?: number;
  /** Server status shared with closeBusinessDate. Null while the run loads. */
  overallStatus?: NightAuditOverallStatus | null;
  openBlockingExceptions?: number;
  warningCount?: number;
  runStatus?: "open" | "ready" | "closed" | "failed" | "superseded";
  rechecked?: boolean;
  rechecking?: boolean;
  onRecheck?: () => void;
  nightAuditWindow?: NightAuditWindowState | null;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submitted = useRef(false);
  const dates = closeTargetDates(businessDate);
  const liveWindow = useLiveNightAuditWindow(nightAuditWindow, role);
  const gate = closeGate({
    window: liveWindow,
    overall: overallStatus,
    financial: financialGate,
    operational: operationalGate,
    openBlockingExceptions,
    boardBlockers: remainingBlockerCount(rows),
    canClose: canConfirmNightAudit(role),
    busy: busy || rechecking,
    runStatus: closed ? "closed" : runStatus,
    rechecked,
    phone,
  });
  const showConfirm = !phone && canConfirmNightAudit(role) && !closed;
  const receptionist = role === "receptionist";

  function submit() {
    if (submitted.current || busy || !gate.enabled) return;
    submitted.current = true;
    setConfirmOpen(false);
    onConfirm();
  }
  useEffect(() => {
    if (!busy) submitted.current = false;
  }, [busy]);

  return (
    <aside
      className="sticky top-4 rounded-2xl border border-border/80 bg-card p-5 shadow-xs"
      data-testid="night-audit-close-panel"
    >
      <div className="flex items-center gap-2.5 border-b border-border/70 pb-3.5">
        <div className="flex size-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20">
          <Lock className="size-4" />
        </div>
        <div>
          <h2 className="font-display text-base font-bold text-foreground">Close business date</h2>
          <p className="text-[11px] text-muted-foreground">Final date roll gate & audit seal</p>
        </div>
      </div>

      <div className="mt-3.5 rounded-xl border border-border/70 bg-muted/20 p-3">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          <span>Current business date</span>
          <span>Next business date</span>
        </div>
        <div className="flex items-center justify-between font-display text-sm font-bold text-foreground">
          <span className="rounded-md bg-card border px-2 py-0.5 shadow-2xs">
            {formatNa1Date(dates.current)}
          </span>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span className="rounded-md bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 shadow-2xs font-semibold">
            {formatNa1Date(dates.next)}
          </span>
        </div>
      </div>

      {liveWindow ? (
        <div
          className="mt-2.5 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs"
          data-testid="night-audit-window"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">Night Audit window</span>
            <NightAuditWindowBadge state={liveWindow} compact />
          </div>
          <p className="mt-1 text-muted-foreground">
            {liveWindow.label} · Property time {liveWindow.localTime}
          </p>
          {!closed && !liveWindow.allowsClose ? (
            <p
              className="mt-1.5 font-medium text-foreground"
              data-testid="night-audit-window-closed"
            >
              {liveWindow.message}
            </p>
          ) : null}
          {!closed && liveWindow.ownerBypass ? (
            <p
              className="mt-1.5 rounded-md border border-amber-200/70 bg-amber-50/70 px-2 py-1 font-medium text-amber-900"
              data-testid="night-audit-window-owner-bypass"
            >
              {OWNER_OUTSIDE_WINDOW_COPY}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "mt-3.5 rounded-xl border p-3 text-xs leading-relaxed",
          gate.enabled
            ? "border-emerald-200/80 bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-300"
            : "border-red-200/80 bg-red-50/70 text-red-950 dark:bg-red-950/20 dark:text-red-300",
        )}
      >
        <div className="flex items-start gap-2">
          {gate.enabled ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
          ) : (
            <AlertTriangle className="size-4 shrink-0 text-red-600 mt-0.5" />
          )}
          <div>
            <p className="font-semibold">
              {gate.enabled ? "Ready to Roll Date" : "Close Gate Blocked"}
            </p>
            <p className="mt-0.5 font-medium" data-testid="night-audit-close-gate">
              {liveWindow && !liveWindow.allowsClose && !closed
                ? liveWindow.message
                : financialGate === "blocked"
                  ? `${financialBlockers} financial blocker(s) must be cleared in the owner module.`
                  : operationalGate === "blocked"
                    ? `${operationalBlockers} operational blocker(s) must be cleared in the owner module.`
                    : gate.reason}
            </p>
          </div>
        </div>
      </div>

      {warningCount > 0 && gate.enabled ? (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2.5 py-1.5 text-xs text-amber-900">
          <AlertCircle className="size-3.5 shrink-0 text-amber-600" />
          <span>{warningCount} warning(s) remain. Warnings do not block close.</span>
        </div>
      ) : null}

      {phone ? <p className="mt-3 text-xs text-muted-foreground">{NA1_PHONE_CLOSE_COPY}</p> : null}

      {!phone && receptionist ? (
        <PermissionDeniedPanel
          className="mt-4"
          message="Front Office agents cannot close Night Audit. Ask an owner or manager to close."
        />
      ) : null}

      {showConfirm ? (
        <>
          <div className="mt-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <label className="font-semibold text-foreground text-xs" htmlFor="na1-close-note">
                Audit note
              </label>
              <span className="font-mono text-[10px]">{note.length}/500</span>
            </div>
            <Textarea
              id="na1-close-note"
              className="resize-none text-xs shadow-2xs"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder={NA1_NOTE_HINT}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-3.5 h-9 w-full gap-2 text-xs font-semibold shadow-2xs hover:bg-muted/60"
            disabled={rechecking || busy || !onRecheck}
            onClick={onRecheck}
            data-testid="night-audit-final-recheck"
          >
            <RefreshCw className={rechecking ? "size-3.5 animate-spin text-primary" : "size-3.5"} />
            {rechecking ? "Rechecking…" : rechecked ? "Final Recheck again" : "Final Recheck"}
          </Button>
          <Button
            type="button"
            className="mt-2.5 h-10 w-full gap-2 text-xs font-bold tracking-wide uppercase transition-all shadow-sm"
            disabled={!gate.enabled}
            style={
              gate.enabled ? { backgroundColor: NA1_CONFIRM_GOLD, color: NA1_CHROME } : undefined
            }
            onClick={() => setConfirmOpen(true)}
            data-testid="night-audit-close-button"
          >
            <Lock className="size-3.5" />
            <span>{busy ? "Closing…" : NA1_CONFIRM_LABEL}</span>
          </Button>
        </>
      ) : null}

      {closed ? (
        <p className="mt-3 text-xs text-muted-foreground">This business date is closed.</p>
      ) : null}
      {notice ? (
        <p
          className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/70 p-2 text-xs text-amber-900"
          data-testid="night-audit-otb-notice"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200/70 bg-red-50/70 p-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !busy && setConfirmOpen(open)}>
        <AlertDialogContent className="sm:max-w-md" data-testid="night-audit-close-confirm">
          <AlertDialogHeader>
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 mb-1">
              <Lock className="size-5" />
            </div>
            <AlertDialogTitle className="font-display text-lg">
              Close business date?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              {CLOSE_CONFIRM_COPY}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {liveWindow?.ownerBypass ? (
            <p className="rounded-lg border border-amber-200/70 bg-amber-50/70 p-2 text-xs font-medium text-amber-900">
              {OWNER_OUTSIDE_WINDOW_COPY}
            </p>
          ) : null}
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                Current business date
              </dt>
              <dd className="mt-0.5 font-bold text-foreground">{formatNa1Date(dates.current)}</dd>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                Next business date
              </dt>
              <dd className="mt-0.5 font-bold text-foreground">{formatNa1Date(dates.next)}</dd>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                Financial blockers
              </dt>
              <dd className="mt-0.5 font-bold text-foreground">{financialBlockers}</dd>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                Operational blockers
              </dt>
              <dd className="mt-0.5 font-bold text-foreground">{operationalBlockers}</dd>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                Warnings
              </dt>
              <dd className="mt-0.5 font-bold text-foreground">{warningCount}</dd>
            </div>
            <div className="col-span-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                Audit note
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{note.trim() || "—"}</dd>
            </div>
          </dl>
          <AlertDialogFooter className="mt-2">
            <AlertDialogCancel disabled={busy} className="h-8.5 text-xs font-medium">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !gate.enabled}
              className="h-8.5 gap-1.5 text-xs font-semibold"
              onClick={(event) => {
                event.preventDefault();
                submit();
              }}
              data-testid="night-audit-close-confirm-submit"
            >
              <Lock className="size-3.5" />
              <span>{NA1_CONFIRM_LABEL}</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

/** Replaces the close form after a successful close. It does not depend on the next date's run. */
export function NaCloseResult({
  result,
  onViewRun,
  onRetryOtb,
  retryingOtb = false,
  onDone,
}: {
  result: CloseResultView & {
    closedBy: string | null;
    closedAt: string | null;
    financialStatus: DomainStatus | null;
    operationalStatus: DomainStatus | null;
    warningCount: number | null;
    noteSaved?: boolean;
  };
  onViewRun: () => void;
  onRetryOtb?: (() => void) | null;
  retryingOtb?: boolean;
  onDone: () => void;
}) {
  const { dateTime } = useRestaurantTime();
  return (
    <section
      className="rounded-2xl border border-emerald-200/80 bg-card p-6 shadow-xs"
      data-testid="night-audit-close-result"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 ring-1 ring-emerald-300">
          <CheckCircle2 className="size-6" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">{result.title}</h2>
          <p className="text-xs text-muted-foreground">
            Business date roll finalized and logged successfully.
          </p>
        </div>
      </div>
      {result.alreadyClosed ? (
        <p
          className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/70 p-2.5 text-xs text-amber-900"
          data-testid="night-audit-already-closed"
        >
          {ALREADY_CLOSED_COPY} The close below is the original record; nothing was closed twice.
        </p>
      ) : null}
      {!result.alreadyClosed && result.noteSaved === false ? (
        <p className="mt-2 text-xs text-amber-800">
          The business date closed, but the audit note could not be saved.
        </p>
      ) : null}
      <dl className="mt-5 grid gap-2.5 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <ResultItem label="Closed business date" value={formatNa1Date(result.closedBusinessDate)} />
        <ResultItem label="New business date" value={formatNa1Date(result.newBusinessDate)} />
        <ResultItem label="Closed by" value={result.closedBy ?? "—"} />
        <ResultItem label="Closed at" value={result.closedAt ? dateTime(result.closedAt) : "—"} />
        <ResultItem
          label="Financial"
          value={result.financialStatus ? domainStatusLabel(result.financialStatus) : "—"}
        />
        <ResultItem
          label="Operations"
          value={result.operationalStatus ? domainStatusLabel(result.operationalStatus) : "—"}
        />
        <ResultItem
          label="Warnings"
          value={result.warningCount == null ? "—" : String(result.warningCount)}
        />
        <ResultItem label="OTB snapshot" value={result.otb} />
      </dl>
      {result.otbNotice ? (
        <div
          className="mt-3.5 flex items-center gap-2 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2 text-xs text-amber-900"
          data-testid="night-audit-close-result-otb"
        >
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <span>{result.otbNotice}</span>
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2 pt-2 border-t border-border/70">
        <Button
          type="button"
          size="sm"
          className="h-8.5 gap-1.5 text-xs font-semibold"
          onClick={onViewRun}
        >
          View Closed Run
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8.5 text-xs font-medium">
          <Link to="/restaurant/pms/front-office">Go to Front Office</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8.5 text-xs font-medium">
          <Link to="/restaurant/pms/reports">Open Reports</Link>
        </Button>
        {result.otbFailed && onRetryOtb ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8.5 text-xs font-medium"
            disabled={retryingOtb}
            onClick={onRetryOtb}
          >
            {retryingOtb ? "Retrying…" : "Retry OTB Snapshot"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8.5 text-xs font-medium"
          onClick={onDone}
        >
          Done
        </Button>
      </div>
    </section>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-display text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

export function NaCloseSummary({
  run,
  lastClosed,
}: {
  run?: NightAuditRunRow | null;
  lastClosed?: NaLastClosed | null;
}) {
  const { dateTime } = useRestaurantTime();
  const previous = run?.summary?.previousBusinessDate ?? lastClosed?.previousBusinessDate;
  const next = run?.summary?.nextBusinessDate ?? lastClosed?.nextBusinessDate;
  const who = run?.closedBy ?? lastClosed?.who;
  const when = run?.closedAt ?? lastClosed?.when;
  const blockers = run?.summary?.blockers;
  if (!previous || !next) {
    return <p className="text-sm text-muted-foreground">No close has been recorded yet.</p>;
  }

  const arrivals = liveCountFromSnapshot(blockers, "arrivals_pending");
  const overstays = liveCountFromSnapshot(blockers, "overstays");
  const unpaid = liveCountFromSnapshot(blockers, "unpaid_folios");
  const summary = run?.summary ?? null;

  return (
    <section
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs"
      data-testid="night-audit-close-summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {run ? "Close record" : "Last successful Night Audit"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Audit record by <span className="font-medium text-foreground">{who ?? "—"}</span>
            {when ? ` · ${dateTime(when)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-1.5 text-xs font-semibold">
          <span className="font-mono text-foreground">{formatNa1Date(previous)}</span>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span className="font-mono text-primary">{formatNa1Date(next)}</span>
        </div>
      </div>
      {run ? (
        <dl className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryItem label="Arrivals left" value={arrivals == null ? null : arrivals} />
          <SummaryItem
            label="In-house room units"
            value={summaryRoomUnitCount(run.summary) ?? null}
          />
          <SummaryItem
            label="Overstays"
            value={
              typeof run.summary?.overstays === "number"
                ? run.summary.overstays
                : overstays == null
                  ? null
                  : overstays
            }
          />
          <SummaryItem label="Unpaid folios" value={unpaid == null ? null : unpaid} />
        </dl>
      ) : null}
      {typeof run?.summary?.financialBlockerCount === "number" ? (
        <div className="mt-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Financial Breakdown
          </h3>
          <dl
            className="grid gap-2.5 sm:grid-cols-4"
            data-testid="night-audit-close-financial-summary"
          >
            <SummaryItem
              label="Financial blockers"
              value={summaryCount(summary, "financialBlockerCount")}
            />
            <SummaryItem
              label="Financial warnings"
              value={summaryCount(summary, "financialWarningCount")}
            />
            <SummaryItem label="Open drawers" value={summaryCount(summary, "openDrawerCount")} />
            <SummaryItem
              label="Fiscal problems"
              value={summaryCount(summary, "fiscalProblemCount")}
            />
          </dl>
        </div>
      ) : null}
      {typeof run?.summary?.operationalBlockerCount === "number" ? (
        <div className="mt-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Operational Breakdown
          </h3>
          <dl
            className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
            data-testid="night-audit-close-operational-summary"
          >
            <SummaryItem
              label="Operational blockers"
              value={summaryCount(summary, "operationalBlockerCount")}
            />
            <SummaryItem
              label="Operational warnings"
              value={summaryCount(summary, "operationalWarningCount")}
            />
            <SummaryItem
              label="Unresolved arrivals"
              value={summaryCount(summary, "unresolvedArrivalCount")}
            />
            <SummaryItem label="Overstays" value={summaryCount(summary, "overstayCount")} />
            <SummaryItem
              label="Room conflicts"
              value={summaryCount(summary, "roomConflictCount")}
            />
            <SummaryItem
              label="Overbooking issues"
              value={summaryCount(summary, "overbookingIssueCount")}
            />
          </dl>
        </div>
      ) : null}
      {run?.summary?.taxByCurrency && run.summary.taxByCurrency.length > 0 ? (
        <ul
          className="mt-3.5 space-y-1.5 rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground"
          data-testid="night-audit-close-tax-summary"
        >
          {run.summary.taxByCurrency.map((row) => (
            <li key={row.currency} className="flex items-center justify-between">
              <span className="font-medium text-foreground">{row.currency}</span>
              <span>
                tax {row.tax.toFixed(2)} · service {row.serviceCharge.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-display text-sm font-semibold text-foreground">
        {formatSummaryCount(value)}
      </dd>
    </div>
  );
}
