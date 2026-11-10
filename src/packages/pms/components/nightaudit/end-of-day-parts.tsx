import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  LogIn,
  MoreHorizontal,
  ShieldAlert,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import {
  AUDIT_STATUS_LABEL,
  CHECK_STATUS_LABEL,
  STEP_STATUS_LABEL,
  UNAUTHORIZED_RESOLVE_COPY,
  blockerCountCopy,
  type EndOfDayAuditStatus,
  type EndOfDayCheck,
  type EndOfDayCondition,
  type EndOfDayStepId,
  type EndOfDayStepView,
} from "@/packages/pms/lib/night-audit-steps";
import { FISCAL_OVERRIDE_REASON_CATEGORIES } from "@/packages/pms/lib/night-audit-workflow";
import { PMS_PERMISSIONS, type PmsPermissionCode } from "@/packages/pms/lib/pms-permissions";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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

export type FiscalReasonCategory = (typeof FISCAL_OVERRIDE_REASON_CATEGORIES)[number];

const FISCAL_REASON_LABEL: Record<FiscalReasonCategory, string> = {
  fiscal_device_offline: "Fiscal device offline",
  hardware_failure: "Hardware failure",
  network_failure: "Network failure",
  fiscal_authority_unavailable: "Fiscal authority unavailable",
  integration_failure: "Integration failure",
  vendor_support_pending: "Vendor support pending",
  other: "Other",
};

/* ----------------------------------------------------------------- status */

const AUDIT_TONE: Record<EndOfDayAuditStatus, string> = {
  not_started: "border-border bg-muted/60 text-foreground",
  in_progress: "border-border bg-muted/60 text-foreground",
  blocked: "border-red-200 bg-red-50 text-red-800",
  ready_to_close: "border-emerald-200 bg-emerald-50 text-emerald-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-red-200 bg-red-50 text-red-800",
};

export function AuditStatusBadge({ status }: { status: EndOfDayAuditStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        AUDIT_TONE[status],
      )}
      data-testid="end-of-day-status"
    >
      {AUDIT_STATUS_LABEL[status]}
    </span>
  );
}

function StepIcon({
  step,
  locked,
  spinning,
}: {
  step: EndOfDayStepView;
  locked: boolean;
  spinning: boolean;
}) {
  if (spinning) return <Loader2 className="size-4 animate-spin text-[#8A641A]" aria-hidden />;
  if (locked) return <Lock className="size-4 text-muted-foreground" aria-hidden />;
  if (step.status === "completed")
    return <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />;
  if (step.status === "blocked") return <XCircle className="size-4 text-red-600" aria-hidden />;
  if (step.status === "in_progress")
    return <Loader2 className="size-4 text-foreground" aria-hidden />;
  return <Circle className="size-4 text-muted-foreground" aria-hidden />;
}

/* ------------------------------------------------------------------- rail */

export function StepRail({
  steps,
  active,
  locked,
  onSelect,
  scanning,
}: {
  steps: readonly EndOfDayStepView[];
  active: EndOfDayStepId;
  locked: ReadonlySet<EndOfDayStepId>;
  onSelect: (id: EndOfDayStepId) => void;
  /** While End of Day is walking the checklist, later steps stay pending. */
  scanning?: { stepId: EndOfDayStepId; through: number } | null;
}) {
  return (
    <nav aria-label="End of Day steps" data-testid="end-of-day-step-rail">
      <ol className="space-y-1">
        {steps.map((step, index) => {
          const isLocked = locked.has(step.id);
          const isActive = step.id === active;
          const isScanning = scanning?.stepId === step.id;
          const pending = Boolean(scanning && index > scanning.through && !isLocked);
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={isActive ? "step" : undefined}
                aria-busy={isScanning || undefined}
                data-testid={`end-of-day-step-${step.id}`}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  isActive
                    ? "border-[#251605]/20 bg-white shadow-xs"
                    : "border-transparent hover:border-border hover:bg-white/70",
                )}
              >
                <span className="mt-0.5 shrink-0">
                  <StepIcon step={step} locked={isLocked} spinning={Boolean(isScanning)} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-snug text-foreground">
                    {step.number}. {step.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {isScanning
                      ? "Checking…"
                      : isLocked
                        ? "Locked"
                        : pending
                          ? STEP_STATUS_LABEL.not_started
                          : STEP_STATUS_LABEL[step.status]}
                    {!isScanning && !pending && step.blockerCount > 0
                      ? ` · ${blockerCountCopy(step.blockerCount)}`
                      : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------ cards */

export function Panel({
  title,
  description,
  actions,
  children,
  testId,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="rounded-2xl border border-border/70 bg-white p-4 shadow-xs sm:p-5"
      data-testid={testId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Metrics({
  items,
}: {
  items: Array<{ label: string; value: string; testId?: string }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-xl border border-border/60 bg-[#F7F4EE]/60 p-3"
          data-testid={item.testId}
        >
          <dt className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-1 truncate font-display text-base font-semibold text-foreground">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CheckList({ checks }: { checks: readonly EndOfDayCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <ul
      className="divide-y divide-border/60 rounded-xl border border-border/60"
      data-testid="end-of-day-checks"
    >
      {checks.map((check) => (
        <li key={check.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
          <span className="flex min-w-0 items-center gap-2 text-foreground">
            {check.status === "passed" ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
            ) : (
              <XCircle className="size-4 shrink-0 text-red-600" aria-hidden />
            )}
            <span className="min-w-0">{check.label}</span>
          </span>
          <span
            className={cn(
              "shrink-0 font-semibold",
              check.status === "passed" ? "text-emerald-700" : "text-red-700",
            )}
          >
            {CHECK_STATUS_LABEL[check.status]}
            {check.blockerCount > 0 ? ` · ${check.blockerCount}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export type ConditionPermissions = {
  canAny: (codes: readonly PmsPermissionCode[]) => boolean;
};

export type ArrivalStayActions = {
  onCheckIn: (reservationId: string, reservationRoomId?: string) => void;
  onCheckOut: (reservationId: string, reservationRoomId?: string) => void;
  onAllocate: (folioId: string, paymentId?: string) => void;
  onFiscal: (target: {
    sourceType: string;
    sourceId: string;
    registrationId?: string;
    scope: "guest" | "account";
  }) => void;
  onNoShow: (reservationId: string) => void;
  onCancel: (reservationId: string) => void;
};

function optionalId(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

function folioIdFromRoute(route: string): string | null {
  const match = /^\/restaurant\/pms\/cashiering\/folios\/([^/?#]+)$/.exec(route);
  return match?.[1] ?? null;
}

function inlineKind(code: string, label: string): "check-out" | "allocate" | null {
  if ((code === "overstay" || code === "departure_due_today") && label === "Check Out") {
    return "check-out";
  }
  if (
    (code === "folio_invoice_contradiction" ||
      code === "unallocated_guest_payment" ||
      code === "unallocated_guest_deposit") &&
    (label === "Open Folio" || label === "Allocate in Folio")
  ) {
    return "allocate";
  }
  return null;
}

export type FiscalOverrideControl = {
  canAuthorize: boolean;
  runStarted: boolean;
  busy: boolean;
  onAuthorize: (
    exceptionId: string,
    reason: string,
    category: FiscalReasonCategory | undefined,
  ) => void;
};

function arrivalReservationId(condition: EndOfDayCondition): string | null {
  for (const action of condition.actions) {
    const fromSearch = action.search?.reservationId;
    if (fromSearch) return fromSearch;
    const match = /^\/restaurant\/pms\/reservations\/([^/?#]+)$/.exec(action.route);
    if (match?.[1]) return match[1];
  }
  return null;
}

function ConditionActionMenu({
  condition,
  permissions,
  actions,
  arrival,
  fiscal,
  fiscalTarget,
  showFiscalOverride,
  onFiscalOverride,
}: {
  condition: EndOfDayCondition;
  permissions: ConditionPermissions;
  actions: EndOfDayCondition["actions"];
  arrival?: ArrivalStayActions;
  fiscal: FiscalOverrideControl;
  fiscalTarget: {
    sourceType: string;
    sourceId: string;
    registrationId?: string;
    scope: "guest" | "account";
  } | null;
  showFiscalOverride: boolean;
  onFiscalOverride: () => void;
}) {
  const reservationId = arrivalReservationId(condition);
  const reservationRoomId = optionalId(
    actions.find((action) => action.search?.reservationRoomId)?.search?.reservationRoomId,
  );
  const checkIn = arrival?.onCheckIn;
  const checkOut = arrival?.onCheckOut;
  const allocate = arrival?.onAllocate;
  const openFiscal = arrival?.onFiscal;
  const arrivalMenu = condition.code === "arrival_not_processed";
  const canNoShow = Boolean(
    arrivalMenu &&
      reservationId &&
      arrival &&
      permissions.canAny([PMS_PERMISSIONS.FRONT_OFFICE_NO_SHOW]),
  );
  const canCancel = Boolean(
    arrivalMenu &&
      reservationId &&
      arrival &&
      permissions.canAny([PMS_PERMISSIONS.FRONT_OFFICE_CANCEL, PMS_PERMISSIONS.RESERVATION_CANCEL]),
  );
  if (actions.length === 0 && !canNoShow && !canCancel && !fiscalTarget && !showFiscalOverride) {
    return null;
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Actions"
          data-testid={arrivalMenu ? "end-of-day-arrival-menu" : "end-of-day-action-menu"}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {actions.map((action) => {
          const kind = inlineKind(condition.code, action.label);
          const stayId = action.search?.reservationId ?? reservationId;
          const folioId = folioIdFromRoute(action.route);
          if (action.label === "Check In" && reservationId && checkIn) {
            return (
              <DropdownMenuItem
                key={`${action.label}:${action.route}`}
                data-testid="end-of-day-arrival-check-in"
                onSelect={() => checkIn(reservationId, reservationRoomId)}
              >
                <LogIn className="size-4" aria-hidden />
                Check In
              </DropdownMenuItem>
            );
          }
          if (kind === "check-out" && stayId && checkOut) {
            return (
              <DropdownMenuItem
                key={`${action.label}:${action.route}`}
                data-testid="end-of-day-check-out"
                onSelect={() => checkOut(stayId, optionalId(action.search?.reservationRoomId))}
              >
                Check Out
              </DropdownMenuItem>
            );
          }
          if (kind === "allocate" && folioId && allocate) {
            return (
              <DropdownMenuItem
                key={`${action.label}:${action.route}`}
                data-testid="end-of-day-allocate"
                onSelect={() => allocate(folioId, optionalId(action.search?.payment))}
              >
                Allocate
              </DropdownMenuItem>
            );
          }
          return (
            <DropdownMenuItem key={`${action.label}:${action.route}`} asChild>
              <Link to={action.route as never} search={(action.search ?? {}) as never}>
                <ExternalLink className="size-4" aria-hidden />
                {action.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
        {fiscalTarget && openFiscal ? (
          <DropdownMenuItem
            data-testid="end-of-day-fiscal"
            onSelect={() => openFiscal(fiscalTarget)}
          >
            {condition.code === "fiscal_not_registered" ? "Register" : "Register again"}
          </DropdownMenuItem>
        ) : null}
        {showFiscalOverride ? (
          <DropdownMenuItem
            data-testid="end-of-day-fiscal-override"
            disabled={!fiscal.runStarted || !condition.exceptionId || fiscal.busy}
            title={!fiscal.runStarted ? "Start End of Day to authorize an override." : undefined}
            onSelect={onFiscalOverride}
          >
            Authorize fiscal close override
          </DropdownMenuItem>
        ) : null}
        {actions.length > 0 && (canNoShow || canCancel) ? <DropdownMenuSeparator /> : null}
        {canNoShow ? (
          <DropdownMenuItem
            data-testid="end-of-day-arrival-no-show"
            onSelect={() => arrival?.onNoShow(reservationId!)}
          >
            <TriangleAlert className="size-4" aria-hidden />
            Mark No-Show
          </DropdownMenuItem>
        ) : null}
        {canCancel ? (
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            data-testid="end-of-day-arrival-cancel"
            onSelect={() => arrival?.onCancel(reservationId!)}
          >
            <XCircle className="size-4" aria-hidden />
            Cancel Reservation
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ConditionCard({
  condition,
  permissions,
  fiscal,
  dateTime,
  arrival,
}: {
  condition: EndOfDayCondition;
  permissions: ConditionPermissions;
  fiscal: FiscalOverrideControl;
  dateTime: (value: string) => string;
  arrival?: ArrivalStayActions;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const blocker = condition.kind === "blocker";
  const visibleActions = condition.actions.filter(
    (action) => action.permissions.length === 0 || permissions.canAny(action.permissions),
  );
  const canResolve =
    condition.resolvePermissions.length === 0 || permissions.canAny(condition.resolvePermissions);
  const openFiscal = arrival?.onFiscal;
  const fiscalTarget =
    condition.code.startsWith("fiscal_") &&
    condition.referenceId &&
    condition.referenceType &&
    openFiscal &&
    permissions.canAny([PMS_PERMISSIONS.FISCAL_VIEW, PMS_PERMISSIONS.FISCAL_DOCUMENT_AUTHORIZE])
      ? {
          sourceType: condition.referenceType,
          sourceId: condition.referenceId,
          scope: condition.actions.some((action) => action.route.includes("/accounts/"))
            ? ("account" as const)
            : ("guest" as const),
          ...(condition.fiscalRegistrationId
            ? { registrationId: condition.fiscalRegistrationId }
            : {}),
        }
      : null;
  const showFiscalOverride =
    blocker &&
    condition.fiscalOverrideable &&
    fiscal.canAuthorize &&
    condition.fiscalOverride == null;

  return (
    <li
      className={cn(
        "rounded-xl border p-3 text-xs",
        blocker && !condition.fiscalOverride
          ? "border-red-200 bg-red-50/40"
          : "border-border/70 bg-white",
      )}
      data-testid={blocker ? "end-of-day-blocker" : "end-of-day-information"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {blocker ? (
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{condition.title}</p>
            {condition.entity ? (
              <p className="mt-0.5 text-muted-foreground">{condition.entity}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {condition.sourceModule}
          </span>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
              blocker ? "bg-red-500/10 text-red-700" : "bg-muted text-muted-foreground",
            )}
          >
            {blocker
              ? condition.scope === "policy"
                ? "Blocker · Property policy"
                : "Blocker"
              : "Information"}
          </span>
          <ConditionActionMenu
            condition={condition}
            permissions={permissions}
            actions={visibleActions}
            fiscal={fiscal}
            fiscalTarget={fiscalTarget}
            showFiscalOverride={showFiscalOverride}
            onFiscalOverride={() => setOverrideOpen(true)}
            {...(arrival ? { arrival } : {})}
          />
        </div>
      </div>

      <p className="mt-2 leading-relaxed text-muted-foreground">{condition.explanation}</p>

      {condition.fiscalOverride ? (
        <p className="mt-2 rounded-lg border border-border/70 bg-muted/30 p-2 text-[11px] text-foreground">
          Fiscal close override authorized by {condition.fiscalOverride.overriddenBy ?? "staff"} ·{" "}
          {dateTime(condition.fiscalOverride.overriddenAt)} · {condition.fiscalOverride.reason}. The
          fiscal document is still unresolved.
        </p>
      ) : null}

      {blocker &&
      !condition.fiscalOverride &&
      !canResolve &&
      condition.code !== "source_unavailable" ? (
        <p
          className="mt-2 text-[11px] font-medium text-foreground"
          data-testid="end-of-day-unauthorized"
        >
          {UNAUTHORIZED_RESOLVE_COPY}
        </p>
      ) : null}

      {blocker && showFiscalOverride && !fiscal.runStarted ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Start End of Day to authorize an override.
        </p>
      ) : null}

      {overrideOpen && condition.exceptionId ? (
        <FiscalOverrideDialog
          condition={condition}
          busy={fiscal.busy}
          onClose={() => setOverrideOpen(false)}
          onSubmit={(reason, category) => {
            fiscal.onAuthorize(condition.exceptionId!, reason, category);
            setOverrideOpen(false);
          }}
        />
      ) : null}
    </li>
  );
}

function FiscalOverrideDialog({
  condition,
  busy,
  onClose,
  onSubmit,
}: {
  condition: EndOfDayCondition;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string, category: FiscalReasonCategory | undefined) => void;
}) {
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<FiscalReasonCategory | "">("");
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="night-audit-fiscal-override-dialog">
        <DialogHeader>
          <DialogTitle>Authorize fiscal close override</DialogTitle>
          <DialogDescription>
            This lets this business date close while the fiscal issue stays unresolved. It does not
            change fiscal registration.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Issue</dt>
            <dd className="font-semibold text-foreground">{condition.title}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Document</dt>
            <dd className="truncate font-mono text-xs text-foreground">
              {condition.entity ?? condition.referenceId ?? "—"}
            </dd>
          </div>
        </dl>
        <label className="block text-sm font-medium">
          Reason
          <Textarea
            className="mt-1 min-h-24"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why this business date must close with the fiscal issue open"
          />
        </label>
        <label className="block text-sm font-medium">
          Category
          <select
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={category}
            onChange={(event) => setCategory(event.target.value as FiscalReasonCategory | "")}
          >
            <option value="">Select a category</option>
            {FISCAL_OVERRIDE_REASON_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {FISCAL_REASON_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!reason.trim() || busy}
            onClick={() => onSubmit(reason.trim(), category || undefined)}
          >
            {busy ? "Authorizing…" : "Authorize override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConditionList({
  conditions,
  permissions,
  fiscal,
  dateTime,
  emptyCopy,
  arrival,
}: {
  conditions: readonly EndOfDayCondition[];
  permissions: ConditionPermissions;
  fiscal: FiscalOverrideControl;
  dateTime: (value: string) => string;
  emptyCopy: string;
  arrival?: ArrivalStayActions;
}) {
  if (conditions.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyCopy}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {conditions.map((condition) => (
        <ConditionCard
          key={condition.key}
          condition={condition}
          permissions={permissions}
          fiscal={fiscal}
          dateTime={dateTime}
          {...(arrival ? { arrival } : {})}
        />
      ))}
    </ul>
  );
}
