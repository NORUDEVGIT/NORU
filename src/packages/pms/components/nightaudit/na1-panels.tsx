import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

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
import { useRestaurantTime } from "@/core/state/property-format";

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
  runStatus?: "open" | "ready" | "closed" | "failed";
  rechecked?: boolean;
  rechecking?: boolean;
  onRecheck?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submitted = useRef(false);
  const dates = closeTargetDates(businessDate);
  const gate = closeGate({
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
    <aside className="rounded-2xl border border-border bg-card p-5" data-testid="night-audit-close-panel">
      <h2 className="font-display text-lg text-[#251605]">Close business date</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Current business date</p>
          <p className="font-medium">{formatNa1Date(dates.current)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Next business date</p>
          <p className="font-medium">{formatNa1Date(dates.next)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm font-medium text-[#251605]" data-testid="night-audit-close-gate">
        {financialGate === "blocked"
          ? `${financialBlockers} financial blocker(s) must be cleared in the owner module.`
          : operationalGate === "blocked"
            ? `${operationalBlockers} operational blocker(s) must be cleared in the owner module.`
            : gate.reason}
      </p>
      {warningCount > 0 && gate.enabled ? (
        <p className="mt-1 text-xs text-amber-800">{warningCount} warning(s) remain. Warnings do not block close.</p>
      ) : null}

      {phone ? <p className="mt-3 text-sm text-muted-foreground">{NA1_PHONE_CLOSE_COPY}</p> : null}

      {!phone && receptionist ? (
        <PermissionDeniedPanel
          className="mt-4"
          message="Front Office agents cannot close Night Audit. Ask an owner or manager to close."
        />
      ) : null}

      {showConfirm ? (
        <>
          <label className="mt-4 block text-xs text-muted-foreground" htmlFor="na1-close-note">
            Audit note
          </label>
          <Textarea
            id="na1-close-note"
            className="mt-1"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={NA1_NOTE_HINT}
          />
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full"
            disabled={rechecking || busy || !onRecheck}
            onClick={onRecheck}
            data-testid="night-audit-final-recheck"
          >
            <RefreshCw className={rechecking ? "size-4 animate-spin" : "size-4"} />
            {rechecking ? "Rechecking…" : rechecked ? "Final Recheck again" : "Final Recheck"}
          </Button>
          <Button
            type="button"
            className="mt-2 w-full"
            disabled={!gate.enabled}
            style={gate.enabled ? { backgroundColor: NA1_CONFIRM_GOLD, color: NA1_CHROME } : undefined}
            onClick={() => setConfirmOpen(true)}
            data-testid="night-audit-close-button"
          >
            {busy ? "Closing…" : NA1_CONFIRM_LABEL}
          </Button>
        </>
      ) : null}

      {closed ? <p className="mt-3 text-sm text-muted-foreground">This business date is closed.</p> : null}
      {notice ? (
        <p className="mt-3 text-sm text-amber-800" data-testid="night-audit-otb-notice">
          {notice}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !busy && setConfirmOpen(open)}>
        <AlertDialogContent data-testid="night-audit-close-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Close business date?</AlertDialogTitle>
            <AlertDialogDescription>{CLOSE_CONFIRM_COPY}</AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Current business date</dt>
              <dd className="font-medium">{formatNa1Date(dates.current)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Next business date</dt>
              <dd className="font-medium">{formatNa1Date(dates.next)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Financial blockers</dt>
              <dd className="font-medium">{financialBlockers}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Operational blockers</dt>
              <dd className="font-medium">{operationalBlockers}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Warnings</dt>
              <dd className="font-medium">{warningCount}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Audit note</dt>
              <dd className="whitespace-pre-wrap">{note.trim() || "—"}</dd>
            </div>
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !gate.enabled}
              onClick={(event) => {
                event.preventDefault();
                submit();
              }}
              data-testid="night-audit-close-confirm-submit"
            >
              {NA1_CONFIRM_LABEL}
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
    <section className="rounded-2xl border border-border bg-card p-5" data-testid="night-audit-close-result">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-5 text-emerald-700" />
        <h2 className="font-display text-lg text-[#251605]">{result.title}</h2>
      </div>
      {result.alreadyClosed ? (
        <p className="mt-1 text-sm text-muted-foreground" data-testid="night-audit-already-closed">
          {ALREADY_CLOSED_COPY} The close below is the original record; nothing was closed twice.
        </p>
      ) : null}
      {!result.alreadyClosed && result.noteSaved === false ? (
        <p className="mt-1 text-xs text-amber-800">The business date closed, but the audit note could not be saved.</p>
      ) : null}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <ResultItem label="Closed business date" value={formatNa1Date(result.closedBusinessDate)} />
        <ResultItem label="New business date" value={formatNa1Date(result.newBusinessDate)} />
        <ResultItem label="Closed by" value={result.closedBy ?? "—"} />
        <ResultItem label="Closed at" value={result.closedAt ? dateTime(result.closedAt) : "—"} />
        <ResultItem label="Financial" value={result.financialStatus ? domainStatusLabel(result.financialStatus) : "—"} />
        <ResultItem label="Operations" value={result.operationalStatus ? domainStatusLabel(result.operationalStatus) : "—"} />
        <ResultItem label="Warnings" value={result.warningCount == null ? "—" : String(result.warningCount)} />
        <ResultItem label="OTB snapshot" value={result.otb} />
      </dl>
      {result.otbNotice ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-amber-800" data-testid="night-audit-close-result-otb">
          <AlertTriangle className="size-4" />
          {result.otbNotice}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={onViewRun}>
          View Closed Run
        </Button>
        <Button asChild variant="outline">
          <Link to="/restaurant/pms/front-office">Go to Front Office</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/restaurant/pms/reports">Open Reports</Link>
        </Button>
        {result.otbFailed && onRetryOtb ? (
          <Button type="button" variant="outline" disabled={retryingOtb} onClick={onRetryOtb}>
            {retryingOtb ? "Retrying…" : "Retry OTB Snapshot"}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </section>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-[#251605]">{value}</dd>
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
    <section className="rounded-2xl border border-border bg-card p-5" data-testid="night-audit-close-summary">
      <h2 className="font-display text-lg text-[#251605]">{run ? "Close record" : "Last successful Night Audit"}</h2>
      <p className="mt-2 text-sm">
        {formatNa1Date(previous)} → {formatNa1Date(next)}
      </p>
      <p className="text-xs text-muted-foreground">
        {who ?? "—"}
        {when ? ` · ${dateTime(when)}` : ""}
      </p>
      {run ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Arrivals left</dt>
            <dd className="text-sm font-medium">{arrivals == null ? "—" : arrivals}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">In-house room units</dt>
            <dd className="text-sm font-medium">{summaryRoomUnitCount(run.summary) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Overstays</dt>
            <dd className="text-sm font-medium">
              {typeof run.summary?.overstays === "number" ? run.summary.overstays : overstays == null ? "—" : overstays}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Unpaid folios</dt>
            <dd className="text-sm font-medium">{unpaid == null ? "—" : unpaid}</dd>
          </div>
        </dl>
      ) : null}
      {typeof run?.summary?.financialBlockerCount === "number" ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-4" data-testid="night-audit-close-financial-summary">
          <SummaryItem label="Financial blockers" value={summaryCount(summary, "financialBlockerCount")} />
          <SummaryItem label="Financial warnings" value={summaryCount(summary, "financialWarningCount")} />
          <SummaryItem label="Open drawers" value={summaryCount(summary, "openDrawerCount")} />
          <SummaryItem label="Fiscal problems" value={summaryCount(summary, "fiscalProblemCount")} />
        </dl>
      ) : null}
      {typeof run?.summary?.operationalBlockerCount === "number" ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="night-audit-close-operational-summary">
          <SummaryItem label="Operational blockers" value={summaryCount(summary, "operationalBlockerCount")} />
          <SummaryItem label="Operational warnings" value={summaryCount(summary, "operationalWarningCount")} />
          <SummaryItem label="Unresolved arrivals" value={summaryCount(summary, "unresolvedArrivalCount")} />
          <SummaryItem label="Overstays" value={summaryCount(summary, "overstayCount")} />
          <SummaryItem label="Room conflicts" value={summaryCount(summary, "roomConflictCount")} />
          <SummaryItem label="Overbooking issues" value={summaryCount(summary, "overbookingIssueCount")} />
        </dl>
      ) : null}
      {run?.summary?.taxByCurrency && run.summary.taxByCurrency.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground" data-testid="night-audit-close-tax-summary">
          {run.summary.taxByCurrency.map((row) => (
            <li key={row.currency}>
              {row.currency} tax {row.tax.toFixed(2)} · service {row.serviceCharge.toFixed(2)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{formatSummaryCount(value)}</dd>
    </div>
  );
}
