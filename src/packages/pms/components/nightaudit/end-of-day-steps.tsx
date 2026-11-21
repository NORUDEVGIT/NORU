import { useState, type ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Lock, RefreshCw } from "lucide-react";

import {
  CheckList,
  ConditionList,
  Panel,
  UnresolvedDeparturesTable,
  type ArrivalStayActions,
  type ConditionPermissions,
  type FiscalOverrideControl,
} from "@/packages/pms/components/nightaudit/end-of-day-parts";
import { NightAuditCloseSummary } from "@/packages/pms/components/nightaudit/night-audit-close-summary";
import { formatNa1Date } from "@/packages/pms/lib/na1";
import {
  CHECK_STATUS_LABEL,
  blockerCountCopy,
  closeBlockedCopy,
  endOfDayStep,
  type EndOfDayStepId,
} from "@/packages/pms/lib/night-audit-steps";
import {
  CLOSE_CONFIRM_COPY,
  nightAuditReportLinks,
  otbStatusLabel,
  type OtbStatus,
} from "@/packages/pms/lib/night-audit-workflow";
import {
  WINDOW_OVERRIDE_COPY,
  type NightAuditWindowState,
} from "@/packages/pms/lib/night-audit-window";
import type { NightAuditWorkspaceData } from "@/packages/pms/lib/nightaudit.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

export type CloseOutcome = {
  runId: string;
  businessDate: string;
  nextBusinessDate: string;
  alreadyClosed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  otbSnapshotStatus: OtbStatus | null;
  noteSaved: boolean;
  groupBlockRelease: "released" | "none" | "failed";
};

export type StepContext = {
  data: NightAuditWorkspaceData;
  window: NightAuditWindowState | null;
  permissions: ConditionPermissions;
  fiscal: FiscalOverrideControl;
  dateTime: (value: string) => string;
  time: (value: string) => string;
  money: (value: number | null | undefined) => string;
  restaurantId: string;
  onSelectStep: (id: EndOfDayStepId) => void;
  notes: {
    value: string;
    editable: boolean;
    state: "idle" | "saving" | "saved" | "error";
    onChange: (value: string) => void;
  };
  close: {
    busy: boolean;
    error: string | null;
    onClose: (options?: { windowOverrideIntent?: boolean; windowOverrideReason?: string }) => void;
  };
  outcome: CloseOutcome | null;
  otb: { busy: boolean; onRetry: (runId: string) => void };
  arrival?: ArrivalStayActions;
};

const MAX_LISTED = 50;

function StepConditions({ ctx, step }: { ctx: StepContext; step: EndOfDayStepId }) {
  const blockers = ctx.data.conditions.filter((row) => row.step === step && row.kind === "blocker");
  return (
    <Panel
      title="Blockers"
      description={
        blockers.length === 0
          ? "Nothing in this step holds the business date."
          : "Each blocker must be fixed in its source module. Recheck afterwards."
      }
      testId={`end-of-day-${step}-blockers`}
    >
      <ConditionList
        conditions={blockers.slice(0, MAX_LISTED)}
        permissions={ctx.permissions}
        fiscal={ctx.fiscal}
          dateTime={ctx.dateTime}
          emptyCopy="No blockers."
          shiftClose={{
            restaurantId: ctx.restaurantId,
            businessDate: ctx.data.businessDate,
            money: (value) => ctx.money(value),
          }}
          {...(ctx.arrival ? { arrival: ctx.arrival } : {})}
        />
      {blockers.length > MAX_LISTED ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {MAX_LISTED} of {blockers.length}. Resolve these and recheck to see the rest.
        </p>
      ) : null}
    </Panel>
  );
}

function StepChecks({ ctx, step }: { ctx: StepContext; step: EndOfDayStepId }) {
  const view = ctx.data.steps.find((row) => row.id === step);
  if (!view || view.checks.length === 0) return null;
  return (
    <Panel title="Checks" testId={`end-of-day-${step}-checks`}>
      <CheckList checks={view.checks} />
    </Panel>
  );
}

/* ----------------------------------------------------------------- step 1 */

function PrepareStep({ ctx }: { ctx: StepContext }) {
  const { data } = ctx;
  const blockedSteps = data.steps.filter(
    (step) => step.blockerCount > 0 && step.id !== "business_date" && step.id !== "finalize",
  );
  return (
    <>
      <Panel title="Readiness by area" testId="end-of-day-domains">
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data.domains.map((domain) => (
            <li
              key={domain.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-[#F7F4EE]/60 px-3 py-2 text-xs"
            >
              <span className="font-medium text-foreground">{domain.label}</span>
              <span
                className={cn(
                  "font-semibold",
                  domain.status === "passed" ? "text-emerald-700" : "text-red-700",
                )}
              >
                {domain.status === "passed"
                  ? CHECK_STATUS_LABEL.passed
                  : blockerCountCopy(domain.blockerCount)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title={
          data.blockerCount === 0
            ? "No blockers remain"
            : `${blockerCountCopy(data.blockerCount)} remain`
        }
        description={
          data.blockerCount === 0
            ? "Every step passes on this check. Review the steps, then close the business date."
            : "Open a step to see what holds the business date and where to fix it."
        }
        testId="end-of-day-prepare-remaining"
      >
        {blockedSteps.length > 0 ? (
          <ul className="space-y-1.5">
            {blockedSteps.map((step) => (
              <li key={step.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-left text-xs hover:bg-muted/40"
                  onClick={() => ctx.onSelectStep(step.id)}
                >
                  <span className="font-medium text-foreground">
                    {step.number}. {step.title}
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-red-700">
                    {blockerCountCopy(step.blockerCount)}
                    <ArrowRight className="size-3" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel
        title="End of Day note"
        description="Optional. Saved with this run and shown in History."
        testId="end-of-day-note"
      >
        <Textarea
          value={ctx.notes.value}
          maxLength={500}
          rows={3}
          disabled={!ctx.notes.editable}
          placeholder={
            ctx.notes.editable
              ? "Handover notes for this business date"
              : "Start End of Day to add a note."
          }
          onChange={(event) => ctx.notes.onChange(event.target.value)}
          aria-label="End of Day note"
        />
        <p className="mt-1 text-[11px] text-muted-foreground" aria-live="polite">
          {ctx.notes.state === "saving"
            ? "Saving…"
            : ctx.notes.state === "saved"
              ? "Saved"
              : ctx.notes.state === "error"
                ? "Could not save the note. It will retry on the next change."
                : `${ctx.notes.value.length}/500`}
        </p>
      </Panel>

      <StepConditions ctx={ctx} step="prepare" />
    </>
  );
}

/* ------------------------------------------------------------- steps 2-4 */

function ArrivalsStep({ ctx }: { ctx: StepContext }) {
  return (
    <>
      <StepChecks ctx={ctx} step="arrivals" />
      <StepConditions ctx={ctx} step="arrivals" />
    </>
  );
}

function DeparturesStep({ ctx }: { ctx: StepContext }) {
  const unresolved = ctx.data.conditions.filter(
    (row) =>
      row.step === "departures" &&
      row.kind === "blocker" &&
      (row.code === "overstay" || row.code === "departure_overdue" || row.code === "source_unavailable"),
  );
  const lateCheckoutInfo = ctx.data.conditions.filter(
    (row) => row.step === "departures" && row.kind === "information",
  );
  return (
    <>
      <StepChecks ctx={ctx} step="departures" />
      <Panel
        title="Unresolved departures"
        description={
          unresolved.length === 0
            ? "Every departure-day guest has checked out or is still within the approved checkout time."
            : "Check out the guest or extend the stay before closing the business date."
        }
        testId="end-of-day-departures-unresolved"
      >
        <UnresolvedDeparturesTable
          conditions={unresolved}
          permissions={ctx.permissions}
          fiscal={ctx.fiscal}
          money={ctx.money}
          {...(ctx.arrival ? { arrival: ctx.arrival } : {})}
        />
      </Panel>
      {lateCheckoutInfo.length > 0 ? (
        <Panel
          title="Approved late checkout"
          description="These guests may remain in-house until the approved late checkout time."
          testId="end-of-day-departures-late-checkout"
        >
          <ConditionList
            conditions={lateCheckoutInfo.slice(0, MAX_LISTED)}
            permissions={ctx.permissions}
            fiscal={ctx.fiscal}
            dateTime={ctx.dateTime}
            emptyCopy="No approved late checkouts."
            {...(ctx.arrival ? { arrival: ctx.arrival } : {})}
          />
        </Panel>
      ) : null}
    </>
  );
}

function InHouseStep({ ctx }: { ctx: StepContext }) {
  return (
    <>
      <StepChecks ctx={ctx} step="in_house" />
      <StepConditions ctx={ctx} step="in_house" />
    </>
  );
}

/* ------------------------------------------------------------- steps 5-7 */

function FoliosStep({ ctx }: { ctx: StepContext }) {
  return (
    <>
      <StepChecks ctx={ctx} step="folios" />
      <StepConditions ctx={ctx} step="folios" />
    </>
  );
}

function CashierStep({ ctx }: { ctx: StepContext }) {
  return (
    <>
      <StepChecks ctx={ctx} step="cashier" />
      <StepConditions ctx={ctx} step="cashier" />
    </>
  );
}

function ReconcileStep({ ctx }: { ctx: StepContext }) {
  return (
    <>
      <StepChecks ctx={ctx} step="reconcile" />
      <StepConditions ctx={ctx} step="reconcile" />
    </>
  );
}

/* ----------------------------------------------------------------- step 8 */

function BusinessDateStep({ ctx }: { ctx: StepContext }) {
  const { data } = ctx;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const runOpen = data.run?.status === "open" || data.run?.status === "ready";
  const sourceProblem = data.evaluation.failed || data.evaluation.unavailable.length > 0;
  const phase = ctx.window?.phase;
  const normalWindowOk = phase === "open" || phase === "after_end";
  const beforeWindow = phase === "before_start";
  const baseBlockReason = !data.run
    ? "Start End of Day before closing the business date."
    : !runOpen
      ? "This End of Day run cannot be closed."
      : sourceProblem
        ? "A source module could not be read. Recheck before closing."
        : data.blockerCount > 0
          ? closeBlockedCopy(data.blockerCount)
          : null;
  const normalCloseReason =
    baseBlockReason ??
    (ctx.window && !normalWindowOk ? (ctx.window.message ?? "Night Audit window unknown") : null);
  const overrideReady =
    beforeWindow &&
    ctx.window?.canOfferEarlyOverride === true &&
    baseBlockReason == null &&
    data.access.canClose;
  const statusLabel = ctx.window?.statusLabel ?? "Night Audit window";
  const windowGateLabel =
    phase === "open"
      ? `Inside the Night Audit window (${ctx.window?.label})`
      : phase === "after_end"
        ? `End of Day overdue · window was ${ctx.window?.label}`
        : phase === "before_start"
          ? (ctx.window?.message ?? "Night Audit window has not started")
          : (ctx.window?.message ?? "Night Audit window unknown");

  return (
    <>
      <Panel title="Close the business date" testId="end-of-day-close">
        <div
          className="mb-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2"
          data-testid="end-of-day-window-status"
          data-phase={phase ?? "unknown"}
        >
          <p className="text-sm font-semibold text-foreground">{statusLabel}</p>
          <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
            <div>
              <dt className="font-medium text-foreground/80">Business date</dt>
              <dd className="font-mono">{formatNa1Date(data.businessDate)}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground/80">Property time</dt>
              <dd className="font-mono">
                {ctx.window?.localTime ?? "—"}
                {ctx.window?.timezone ? ` · ${ctx.window.timezone}` : ""}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground/80">Night Audit window</dt>
              <dd className="font-mono">{ctx.window?.label ?? "—"}</dd>
            </div>
          </dl>
          {phase === "after_end" ? (
            <p className="mt-2 text-xs text-muted-foreground">{ctx.window?.message}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className="font-mono text-foreground">{formatNa1Date(data.businessDate)}</span>
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-mono text-foreground">{formatNa1Date(data.nextBusinessDate)}</span>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs">
          <GateRow ok={Boolean(data.run)} label="End of Day started" />
          <GateRow ok={!sourceProblem} label="All source modules read" />
          <GateRow
            ok={data.blockerCount === 0}
            label={data.blockerCount === 0 ? "No blockers" : closeBlockedCopy(data.blockerCount)}
          />
          <GateRow ok={Boolean(normalWindowOk)} label={windowGateLabel} />
        </ul>
        {ctx.close.error ? (
          <p
            className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800"
            role="alert"
          >
            {ctx.close.error}
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          {data.access.canClose ? (
            <>
              <Button
                type="button"
                disabled={normalCloseReason != null || ctx.close.busy}
                onClick={() => setConfirmOpen(true)}
                data-testid="end-of-day-close-button"
              >
                {ctx.close.busy ? "Closing…" : "Close Business Date"}
              </Button>
              {normalCloseReason ? (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="end-of-day-close-reason"
                >
                  {normalCloseReason}
                </p>
              ) : null}
              {overrideReady ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                  <p className="text-xs text-amber-950" data-testid="end-of-day-override-hint">
                    {WINDOW_OVERRIDE_COPY}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2"
                    disabled={ctx.close.busy}
                    onClick={() => {
                      setOverrideReason("");
                      setOverrideOpen(true);
                    }}
                    data-testid="end-of-day-close-outside-window"
                  >
                    Close Outside Window
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <p
              className="text-xs font-medium text-foreground"
              data-testid="end-of-day-close-unauthorized"
            >
              Closing the business date must be done by an authorized staff member.
            </p>
          )}
        </div>
      </Panel>
      {confirmOpen ? (
        <Dialog open onOpenChange={(next) => !next && setConfirmOpen(false)}>
          <DialogContent className="sm:max-w-md" data-testid="end-of-day-close-confirm">
            <DialogHeader>
              <DialogTitle>Close {formatNa1Date(data.businessDate)}?</DialogTitle>
              <DialogDescription>{CLOSE_CONFIRM_COPY}</DialogDescription>
            </DialogHeader>
            <p className="text-sm">
              New business date: <strong>{formatNa1Date(data.nextBusinessDate)}</strong>
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={ctx.close.busy}
                onClick={() => {
                  setConfirmOpen(false);
                  ctx.close.onClose();
                }}
              >
                Close Business Date
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {overrideOpen ? (
        <Dialog open onOpenChange={(next) => !next && setOverrideOpen(false)}>
          <DialogContent className="sm:max-w-md" data-testid="end-of-day-override-confirm">
            <DialogHeader>
              <DialogTitle>Close Outside Window</DialogTitle>
              <DialogDescription>{WINDOW_OVERRIDE_COPY}</DialogDescription>
            </DialogHeader>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Business date</dt>
                <dd className="font-mono font-medium">{formatNa1Date(data.businessDate)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Property time</dt>
                <dd className="font-mono font-medium">{ctx.window?.localTime ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Night Audit window</dt>
                <dd className="font-mono font-medium">{ctx.window?.label ?? "—"}</dd>
              </div>
            </dl>
            <div className="space-y-1.5">
              <label htmlFor="na-window-override-reason" className="text-sm font-medium">
                Reason for override
              </label>
              <Textarea
                id="na-window-override-reason"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Why must this business date close before the Night Audit window?"
                data-testid="end-of-day-override-reason"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOverrideOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={ctx.close.busy || overrideReason.trim().length === 0}
                onClick={() => {
                  const reason = overrideReason.trim();
                  if (!reason) return;
                  setOverrideOpen(false);
                  ctx.close.onClose({
                    windowOverrideIntent: true,
                    windowOverrideReason: reason,
                  });
                }}
                data-testid="end-of-day-override-submit"
              >
                Confirm Close Outside Window
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function GateRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <Lock className="size-4 shrink-0 text-red-600" aria-hidden />
      )}
      <span className={ok ? "text-foreground" : "text-red-800"}>{label}</span>
    </li>
  );
}

/* ----------------------------------------------------------------- step 9 */

function FinalizeStep({ ctx }: { ctx: StepContext }) {
  const { data, outcome } = ctx;
  const last = data.lastClosed;
  // Completed view: this session's close, or the close that opened today's business date.
  const completed =
    last &&
    (outcome
      ? outcome.runId === last.runId
      : last.nextBusinessDate === data.businessDate && !data.run)
      ? last
      : null;
  if (!completed && !outcome) {
    return (
      <Panel title="Locked" testId="end-of-day-finalize-locked">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="size-4" aria-hidden />
          Available after the business date is closed.
        </p>
      </Panel>
    );
  }
  const runId = completed?.runId ?? outcome!.runId;
  const previous = completed?.businessDate ?? outcome!.businessDate;
  const next = completed?.nextBusinessDate ?? outcome!.nextBusinessDate;
  const otbFailed = outcome?.otbSnapshotStatus === "failed" || completed?.otb === "not_captured";
  const links = nightAuditReportLinks(previous.slice(0, 10));
  return (
    <>
      <Panel title="End of Day Complete" testId="end-of-day-complete">
        <p className="text-sm text-foreground">
          {formatNa1Date(previous)} is closed. The business date is now {formatNa1Date(next)}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Completed by {completed?.closedBy ?? outcome?.closedBy ?? "—"}
          {(completed?.closedAt ?? outcome?.closedAt)
            ? ` · ${ctx.dateTime((completed?.closedAt ?? outcome?.closedAt)!)}`
            : ""}
          {" · "}Run {runId.slice(0, 8)}
        </p>
        {outcome?.alreadyClosed ? (
          <p className="mt-3 text-xs text-muted-foreground">
            This business date was already closed.
          </p>
        ) : null}
        {outcome && !outcome.noteSaved && ctx.notes.value.trim() ? (
          <p className="mt-2 text-xs text-muted-foreground">
            The note could not be saved with the close.
          </p>
        ) : null}
        {outcome?.groupBlockRelease === "failed" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Expired group allotments could not be released automatically. Release them from Groups.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            OTB snapshot:{" "}
            <strong className="text-foreground">
              {outcome?.otbSnapshotStatus
                ? otbStatusLabel(outcome.otbSnapshotStatus)
                : completed?.otb === "captured"
                  ? "Captured"
                  : completed?.otb === "not_captured"
                    ? "Not captured"
                    : "Unknown"}
            </strong>
          </span>
          {otbFailed && (completed?.canRetryOtb || data.access.canRetryOtb) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              disabled={ctx.otb.busy}
              onClick={() => ctx.otb.onRetry(runId)}
              data-testid="end-of-day-otb-retry"
            >
              <RefreshCw className="size-3" aria-hidden />
              Retry OTB snapshot
            </Button>
          ) : null}
        </div>
        {otbFailed ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            The business date closed successfully. The OTB snapshot is analytics only.
          </p>
        ) : null}
      </Panel>

      {completed ? (
        <NightAuditCloseSummary
          summary={completed.summary}
          closedBy={completed.closedBy}
          closedAt={completed.closedAt}
          dateTime={ctx.dateTime}
          currency={data.currency}
          title="End of Day summary"
        />
      ) : null}

      {links.length > 0 ? (
        <Panel title={`Reports for ${formatNa1Date(previous)}`} testId="end-of-day-report-links">
          <div className="grid gap-2 sm:grid-cols-2">
            {links.map((link) => (
              <Button
                key={link.id}
                asChild
                size="sm"
                variant="outline"
                className="h-9 justify-between text-xs"
              >
                <Link
                  to={link.to}
                  search={
                    {
                      ...link.search,
                      returnTo: "/restaurant/pms/night-audit",
                      returnToLabel: "Return to End of Day",
                    } as never
                  }
                >
                  <span>{link.label}</span>
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            A packaged End of Day report is a planned enhancement. These are the current reports for
            the closed date.
          </p>
        </Panel>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ panel */

const STEP_BODY: Record<EndOfDayStepId, ComponentType<{ ctx: StepContext }>> = {
  prepare: PrepareStep,
  arrivals: ArrivalsStep,
  departures: DeparturesStep,
  in_house: InHouseStep,
  folios: FoliosStep,
  cashier: CashierStep,
  reconcile: ReconcileStep,
  business_date: BusinessDateStep,
  finalize: FinalizeStep,
};

export function EndOfDayStepPanel({ step, ctx }: { step: EndOfDayStepId; ctx: StepContext }) {
  const meta = endOfDayStep(step);
  const Body = STEP_BODY[step];
  return (
    <div className="min-w-0 space-y-4" data-testid={`end-of-day-panel-${step}`}>
      <h2 className="sr-only">{meta.title}</h2>
      <Body ctx={ctx} />
    </div>
  );
}
