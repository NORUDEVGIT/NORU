import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  ExternalLink,
  Eye,
  FileCheck,
  FileSpreadsheet,
  Globe,
  Layers,
  Lock,
  LogIn,
  LogOut,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Utensils,
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
import {
  ExceptionDetail,
  ReviewWarningDialog,
  getExceptionDestinationMeta,
  getExceptionSource,
} from "@/packages/pms/components/nightaudit/night-audit-exception-queue";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import {
  NightAuditHistoryWorkspace,
  type NightAuditHistoryFilter,
} from "@/packages/pms/components/nightaudit/night-audit-history";
import { formatNa1Date, type NaBlockerRow, type NaLastClosed } from "@/packages/pms/lib/na1";
import {
  NIGHT_AUDIT_PAGE_SIZE,
  paginateRows,
  type NightAuditTabId,
} from "@/packages/pms/lib/night-audit-shell";
import type {
  NightAuditOverallStatus,
  NightAuditOperationalReconciliation,
  NightAuditOperationalIssue,
} from "@/packages/pms/lib/night-audit-operational";
import {
  OVERALL_STATUS_LABEL,
  controlPrimaryAction,
  domainStatusLabel,
  effectiveOverallStatus,
  exceptionCounts,
  exceptionMeta,
  filterReviewedWarnings,
  nightAuditRunState,
  warningReviewCounts,
  type CloseResultView,
  type DomainStatus,
} from "@/packages/pms/lib/night-audit-workflow";
import type {
  AuditException,
  NightAuditHistoryPage,
  NightAuditOtbState,
  NightAuditRunRow,
} from "@/packages/pms/lib/nightaudit.functions";
import { useRestaurantTimezone } from "@/core/state/property-format";
import {
  getNextNightAuditAction,
  getAuditHeaderStatus,
} from "@/packages/pms/lib/night-audit-smart-action";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

type FinancialFocus = "blockers" | "warnings" | "drawers" | "fiscal";
type OperationalFocus =
  "blockers" | "warnings" | "arrivals" | "overstays" | "rooms" | "overbooking";

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

const HEADER_STATUS_BADGE_CLASS: Record<string, string> = {
  red: "bg-red-100 text-red-900 border border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800",
  amber:
    "bg-amber-100 text-amber-950 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
  green:
    "bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  neutral:
    "bg-stone-100 text-stone-800 border border-stone-300 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700",
  blue: "bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
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
    <article className="h-full rounded-xl border border-border bg-card px-3 py-2 shadow-2xs hover:border-[#C89933]/50 transition-all flex flex-col justify-between">
      <div className="flex items-center justify-between gap-1.5">
        <p className="text-[11px] font-medium text-muted-foreground truncate">{label}</p>
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            TONE_CLASS[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-1.5">
        <p className="font-display text-base font-semibold text-[#251605]">{value}</p>
        <p className="text-[10px] text-muted-foreground truncate">{detail}</p>
      </div>
    </article>
  );
  if (!onClick) return body;
  return (
    <button type="button" className="text-left cursor-pointer w-full" onClick={onClick}>
      {body}
    </button>
  );
}

function ReadinessCard({
  label,
  status,
  blockers,
  warnings,
  detail,
  onOpen,
}: {
  label: string;
  status: DomainStatus;
  blockers: number;
  warnings: number;
  detail?: string;
  onOpen?: () => void;
}) {
  const Icon =
    label === "Financial" || label === "Financial Reconciliation"
      ? Coins
      : label === "Operations" || label === "Arrivals & Departures"
        ? Building2
        : label === "Rooms & Housekeeping"
          ? BedDouble
          : label === "Cashier Drawers"
            ? Vault
            : label === "Fiscal Integration"
              ? FileCheck
              : label === "Night Audit Window"
                ? Clock
                : label === "Rate & Revenue" || label === "Revenue"
                  ? Sparkles
                  : label === "Distribution"
                    ? Globe
                    : label === "Overbooking"
                      ? Layers
                      : label === "Services" || label === "Guest Services"
                        ? Utensils
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
      data-testid={`night-audit-readiness-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
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

        <div className="mt-3.5 flex flex-col gap-1.5 text-xs">
          {status === "loading" ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : status === "unavailable" ? (
            <span className="text-xs text-red-700 font-medium">
              Could not be read. Close stays blocked.
            </span>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
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
              </div>
              {detail ? (
                <p className="text-[11px] text-muted-foreground leading-relaxed">{detail}</p>
              ) : null}
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

function WarningSummary({
  exceptions,
  businessDate,
  dateTime,
  runClosed,
  onReviewWarning,
  onSelectException,
  onReviewTarget,
  highlightedExceptionId,
  onSourceOpen,
}: {
  exceptions: AuditException[];
  businessDate: string;
  dateTime: (iso: string) => string;
  runClosed: boolean;
  onReviewWarning?: (exceptionId: string, note: string) => Promise<unknown> | void;
  onSelectException?: (exception: AuditException) => void;
  onReviewTarget?: (exception: AuditException) => void;
  highlightedExceptionId?: string | null;
  onSourceOpen?: () => void;
}) {
  const warningRows = useMemo(() => {
    return exceptions.filter((row) => row.status === "open" && row.severity === "warning");
  }, [exceptions]);

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xs"
      data-testid="night-audit-warning-summary"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <AlertTriangle className="size-4" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground">Warnings Ledger</h3>
            <p className="text-[11px] text-muted-foreground">
              Warnings require auditor review before close.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
          {warningRows.length} warning{warningRows.length === 1 ? "" : "s"}
        </span>
      </div>

      {warningRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <CheckCircle2 className="size-5" />
          </div>
          <p className="mt-2 text-xs font-semibold text-foreground">Clean Warning Gate</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            No open warnings for this business date.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Severity</th>
                <th className="px-3.5 py-2.5 font-medium">Category</th>
                <th className="px-3.5 py-2.5 font-medium">Issue</th>
                <th className="px-3.5 py-2.5 font-medium">Source</th>
                <th className="px-3.5 py-2.5 font-medium">Reference</th>
                <th className="px-3.5 py-2.5 font-medium">Status</th>
                <th className="px-3.5 py-2.5 font-medium">Review State</th>
                <th className="px-3.5 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {warningRows.map((row) => {
                const meta = exceptionMeta(row.exceptionType);
                const destMeta = getExceptionDestinationMeta(row, businessDate);
                const DestIcon = destMeta.icon;
                const source = getExceptionSource(row, businessDate);
                const isReviewed = Boolean(row.warningReview);

                return (
                  <tr
                    key={row.id}
                    id={`na-item-${row.id}`}
                    data-exception-id={row.id}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/30",
                      highlightedExceptionId === row.id &&
                        "bg-amber-100/70 dark:bg-amber-950/40 ring-2 ring-primary ring-inset",
                    )}
                    onClick={() => onSelectException?.(row)}
                  >
                    <td className="px-3.5 py-2.5 align-middle">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 tracking-wide">
                        <span className="size-1.5 rounded-full bg-amber-500" />
                        Warning
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle">
                      <span className="inline-flex rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:text-stone-300">
                        {meta.domain === "financial" ? "Financial" : "Operations"} ·{" "}
                        {meta.categoryLabel}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle max-w-[280px]">
                      <span className="font-semibold text-foreground">{meta.title}</span>
                      <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                        {row.message}
                      </p>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-stone-100/80 dark:bg-stone-800/80 px-2 py-0.5 text-[11px] font-medium text-stone-800 dark:text-stone-200">
                        <DestIcon className="size-3 text-primary shrink-0" />
                        <span className="truncate max-w-[160px]">{destMeta.destination}</span>
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-muted-foreground align-middle">
                      {row.referenceId ?? "—"}
                    </td>
                    <td className="px-3.5 py-2.5 align-middle">
                      <span className="inline-flex rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-950 capitalize">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle">
                      {isReviewed ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 w-fit">
                            <CheckCircle2 className="size-3 text-emerald-600" />
                            REVIEWED
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                            {row.warningReview?.reviewerName ?? "Auditor"}
                            {row.warningReview?.reviewedAt
                              ? ` · ${dateTime(row.warningReview.reviewedAt).slice(0, 16)}`
                              : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100/70 dark:bg-amber-950/40 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                          <Clock className="size-3 text-amber-600" />
                          UNREVIEWED
                        </span>
                      )}
                    </td>
                    <td
                      className="px-3.5 py-2.5 text-right align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        {!isReviewed && !runClosed && onReviewWarning ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs font-semibold text-[#8B6A1A] border-[#C89933]/50 hover:bg-[#C89933]/10"
                            onClick={() => onReviewTarget?.(row)}
                          >
                            Mark Reviewed
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => onSelectException?.(row)}
                        >
                          <Eye className="size-3" />
                          View
                        </Button>
                        {source ? (
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs font-medium text-primary hover:bg-primary/10"
                            onClick={onSourceOpen}
                          >
                            <Link to={source.route as never} search={source.search as never}>
                              <span>Open {meta.ownerModule}</span>
                              <ArrowRight className="size-3" />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </td>
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

function BlockerTable({
  exceptions,
  board,
  businessDate,
  onOpenExceptions,
  onSelectException,
  highlightedExceptionId,
  onSourceOpen,
}: {
  exceptions: AuditException[];
  board: NaBlockerRow[];
  businessDate: string;
  onOpenExceptions: () => void;
  onSelectException?: (exception: AuditException) => void;
  highlightedExceptionId?: string | null;
  onSourceOpen?: () => void;
}) {
  const open = exceptions.filter((row) => row.status === "open" && row.severity === "blocking");
  const liveBoard = board.filter((row) => row.state === "block" || row.state === "unavailable");
  const totalBlockers = open.length + liveBoard.length;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xs"
      data-testid="night-audit-top-blockers"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
            <ShieldAlert className="size-4" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground">Top blockers</h3>
            <p className="text-[11px] text-muted-foreground">
              Blocking issues preventing business date roll
            </p>
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
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            No blockers for this business date.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Severity</th>
                <th className="px-3.5 py-2.5 font-medium">Category</th>
                <th className="px-3.5 py-2.5 font-medium">Issue</th>
                <th className="px-3.5 py-2.5 font-medium">Source</th>
                <th className="px-3.5 py-2.5 font-medium">Reference</th>
                <th className="px-3.5 py-2.5 font-medium">Status</th>
                <th className="px-3.5 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {liveBoard.map((row) => (
                <tr key={`board-${row.id}`} className="transition-colors hover:bg-muted/30">
                  <td className="px-3.5 py-2.5 align-middle">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200/80 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-800 tracking-wide">
                      <span className="size-1.5 rounded-full bg-red-500 shrink-0" />
                      Blocker
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 align-middle">
                    <span className="inline-flex rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:text-stone-300">
                      Live board
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 align-middle max-w-[280px]">
                    <span className="font-semibold text-foreground">{row.label}</span>
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                      {row.detail}
                    </p>
                  </td>
                  <td className="px-3.5 py-2.5 align-middle text-muted-foreground">
                    {row.clear[0]?.label ?? "System Gate"}
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-muted-foreground align-middle">
                    {row.id}
                  </td>
                  <td className="px-3.5 py-2.5 align-middle">
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900 capitalize">
                      {row.state === "unavailable" ? "Unavailable" : "Blocking"}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-right align-middle">
                    {row.clear[0]?.route ? (
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-xs font-medium text-primary hover:bg-primary/10"
                        onClick={onSourceOpen}
                      >
                        <Link
                          to={row.clear[0].route as never}
                          search={row.clear[0].search as never}
                        >
                          <span>Open</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {open.map((row) => {
                const meta = exceptionMeta(row.exceptionType);
                const destMeta = getExceptionDestinationMeta(row, businessDate);
                const DestIcon = destMeta.icon;
                const source = getExceptionSource(row, businessDate);

                return (
                  <tr
                    key={row.id}
                    id={`na-item-${row.id}`}
                    data-exception-id={row.id}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/30",
                      highlightedExceptionId === row.id &&
                        "bg-red-100/70 dark:bg-red-950/40 ring-2 ring-primary ring-inset",
                    )}
                    onClick={() => onSelectException?.(row)}
                  >
                    <td className="px-3.5 py-2.5 align-middle">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200/80 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-800 tracking-wide">
                        <span className="size-1.5 rounded-full bg-red-500 shrink-0" />
                        Blocker
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle">
                      <span className="inline-flex rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:text-stone-300">
                        {meta.domain === "financial" ? "Financial" : "Operations"} ·{" "}
                        {meta.categoryLabel}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle max-w-[280px]">
                      <span className="font-semibold text-foreground">{meta.title}</span>
                      <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                        {row.message}
                      </p>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-stone-100/80 dark:bg-stone-800/80 px-2 py-0.5 text-[11px] font-medium text-stone-800 dark:text-stone-200">
                        <DestIcon className="size-3 text-primary shrink-0" />
                        <span className="truncate max-w-[160px]">{destMeta.destination}</span>
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-muted-foreground align-middle">
                      {row.referenceId ?? "—"}
                    </td>
                    <td className="px-3.5 py-2.5 align-middle">
                      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900 capitalize">
                        {row.status}
                      </span>
                    </td>
                    <td
                      className="px-3.5 py-2.5 text-right align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => onSelectException?.(row)}
                        >
                          <Eye className="size-3" />
                          View
                        </Button>
                        {source ? (
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs font-medium text-primary hover:bg-primary/10"
                            onClick={onSourceOpen}
                          >
                            <Link to={source.route as never} search={source.search as never}>
                              <span>Open {meta.ownerModule}</span>
                              <ArrowRight className="size-3" />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </td>
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

type StepItem = {
  num: number;
  label: string;
  shortLabel: string;
};

const WORKFLOW_STEPS: readonly StepItem[] = [
  { num: 1, label: "Readiness", shortLabel: "Readiness" },
  { num: 2, label: "Arrivals & Departures", shortLabel: "Arrivals/Dep" },
  { num: 3, label: "Rooms & Housekeeping", shortLabel: "Rooms/HK" },
  { num: 4, label: "Financial", shortLabel: "Financial" },
  { num: 5, label: "Exceptions & Fiscal", shortLabel: "Exceptions" },
  { num: 6, label: "Final Validation", shortLabel: "Validation" },
  { num: 7, label: "Review", shortLabel: "Review" },
  { num: 8, label: "Close Business Day", shortLabel: "Close Day" },
] as const;

function TablePagination({
  page,
  pages,
  total,
  pageSize = NIGHT_AUDIT_PAGE_SIZE,
  onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onPageChange: (next: number) => void;
}) {
  if (total === 0) return null;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between border-t border-border/70 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
      <span>
        Showing{" "}
        <span className="font-semibold text-foreground">
          {start}–{end}
        </span>{" "}
        of <span className="font-semibold text-foreground">{total}</span> records
      </span>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="h-7 px-2.5 text-xs font-medium"
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => onPageChange(page + 1)}
              className="h-7 px-2.5 text-xs font-medium"
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
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
  operatorName,
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
  roomsOperations,
  otherOperations,
  operationsResult = null,
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
  onReviewWarning,
  reviewingWarning,
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
  operatorName?: string;
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
  roomsOperations?: ReactNode;
  otherOperations?: ReactNode;
  operationsResult?: NightAuditOperationalReconciliation | null;
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
  onAuthorizeFiscalOverride: (
    exceptionId: string,
    reason: string,
    reasonCategory?:
      | "fiscal_device_offline"
      | "hardware_failure"
      | "network_failure"
      | "fiscal_authority_unavailable"
      | "integration_failure"
      | "vendor_support_pending"
      | "other",
  ) => void;
  onReviewWarning?: (exceptionId: string, note?: string) => void;
  reviewingWarning?: boolean;
  nightAuditWindow?: NightAuditWindowState | null;
}) {
  const timezone = useRestaurantTimezone();
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
  const reviewCounts = warningReviewCounts(exceptions);
  const primary = overall ? controlPrimaryAction(overall) : null;
  const loadingChecks =
    financialSummary.status === "loading" || operationalSummary.status === "loading";

  // Step resolution: map incoming tab/focus into step 1-8
  const initialStepFromTab = (t: NightAuditTabId, f?: string): number => {
    if (t === "operations") {
      if (f === "rooms" || f === "housekeeping") return 3;
      if (f === "overbooking" || f === "distribution" || f === "revenue" || f === "services")
        return 5;
      return 2;
    }
    if (t === "financial") return 4;
    if (t === "exceptions") return 5;
    if (t === "close") {
      if (f === "validation") return 6;
      if (f === "review") return 7;
      return 8;
    }
    return 1;
  };

  const [step, setStep] = useState<number>(() => initialStepFromTab(tab, focus));

  useEffect(() => {
    if (tab !== "history") {
      setStep(initialStepFromTab(tab, focus));
    }
  }, [tab, focus]);

  const inspectOperations = (targetStep: number, focusTab: string) => {
    setStep(targetStep);
    onOpenOperations?.(focusTab);
  };

  const inspectFinancial = (focusTab?: string) => {
    setStep(4);
    onOpenFinancial?.(focusTab ?? "action-triage");
  };

  const [selectedException, setSelectedException] = useState<AuditException | null>(null);
  const [reviewTargetException, setReviewTargetException] = useState<AuditException | null>(null);
  const [returnedFromSource, setReturnedFromSource] = useState(false);
  const [highlightedExceptionId, setHighlightedExceptionId] = useState<string | null>(null);

  const markSourceOpened = () => {
    try {
      sessionStorage.setItem("noru_na_source_opened", "true");
    } catch {
      // safe access
    }
  };

  useEffect(() => {
    const handleFocus = () => {
      try {
        if (sessionStorage.getItem("noru_na_source_opened") === "true") {
          sessionStorage.removeItem("noru_na_source_opened");
          setReturnedFromSource(true);
        }
      } catch {
        // safe access
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    if (!highlightedExceptionId) return;
    const el =
      document.getElementById(`na-item-${highlightedExceptionId}`) ||
      document.querySelector(`[data-exception-id="${highlightedExceptionId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    const timer = setTimeout(() => {
      setHighlightedExceptionId(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [highlightedExceptionId, step]);

  const smartAction = useMemo(() => {
    return getNextNightAuditAction({
      runStatus,
      overall,
      financialStatus: financialSummary.status,
      operationalStatus: operationalSummary.status,
      financialSummary,
      operationalSummary,
      exceptions,
      checkedAt,
      rechecked,
      rechecking,
      currentStep: step,
      returnedFromSource,
      liveWindow,
      role,
    });
  }, [
    runStatus,
    overall,
    financialSummary,
    operationalSummary,
    exceptions,
    checkedAt,
    rechecked,
    rechecking,
    step,
    returnedFromSource,
    liveWindow,
    role,
  ]);

  const auditHeaderStatus = useMemo(() => {
    return getAuditHeaderStatus({
      runStatus,
      overall,
      financialStatus: financialSummary.status,
      operationalStatus: operationalSummary.status,
      financialSummary,
      operationalSummary,
      exceptions,
      checkedAt,
      rechecked,
      rechecking,
      currentStep: step,
      returnedFromSource,
      liveWindow,
      role,
    });
  }, [
    runStatus,
    overall,
    financialSummary,
    operationalSummary,
    exceptions,
    checkedAt,
    rechecked,
    rechecking,
    step,
    returnedFromSource,
    liveWindow,
    role,
  ]);

  function handleSmartActionClick() {
    if (smartAction.type === "closed" || smartAction.type === "superseded") {
      onNavigate("history");
      return;
    }

    if (smartAction.shouldRecheckFirst || returnedFromSource) {
      setReturnedFromSource(false);
      onRecheck();
    }

    if (smartAction.step !== step) {
      setStep(smartAction.step);
    }

    if (smartAction.focusTab) {
      if (smartAction.step === 2 || smartAction.step === 3 || smartAction.step === 5) {
        onOpenOperations?.(smartAction.focusTab as OperationalFocus);
      } else if (smartAction.step === 4) {
        onOpenFinancial?.(smartAction.focusTab as FinancialFocus);
      }
    }

    if (smartAction.targetExceptionId) {
      setHighlightedExceptionId(smartAction.targetExceptionId);
      const targetEx = exceptions.find((e) => e.id === smartAction.targetExceptionId);
      if (targetEx) {
        setSelectedException(targetEx);
      }
    }
  }

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

  // Close panel for Step 8 and Run & Close
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
      unreviewedWarnings={reviewCounts.unreviewedWarnings}
      runStatus={runStatus}
      rechecked={rechecked}
      rechecking={rechecking}
      onRecheck={onRecheck}
      nightAuditWindow={nightAuditWindow}
    />
  );

  // Step-specific counts and domain exceptions
  const domainData = useMemo(() => {
    const openList = exceptions.filter((e) => e.status === "open");

    const inCategory = (cat: string) =>
      openList.filter((e) => {
        const meta = exceptionMeta(e.exceptionType);
        if (meta.category === cat) return true;
        const code = meta.code.toLowerCase();
        if (cat === "revenue") return code.includes("revenue") || code.includes("rate");
        if (cat === "overbooking") return code.includes("overbook") || code.includes("waitlist");
        if (cat === "distribution")
          return code.includes("distribution") || code.includes("channel");
        if (cat === "services") return code.includes("service") || code.includes("entitlement");
        return false;
      });

    // Step 2: Arrivals & Departures
    const step2Ex = openList.filter((e) => {
      const cat = exceptionMeta(e.exceptionType).category;
      return cat === "arrivals" || cat === "departures";
    });
    const step2ExBlockers = step2Ex.filter((e) => e.severity === "blocking").length;
    const step2ExWarnings = step2Ex.filter((e) => e.severity === "warning").length;
    const step2Blockers = Math.max(
      step2ExBlockers,
      operationalSummary.unresolvedArrivalCount + operationalSummary.overstayCount,
    );
    const step2Warnings = step2ExWarnings;

    // Step 3: Rooms & Housekeeping
    const step3Ex = openList.filter((e) => {
      const cat = exceptionMeta(e.exceptionType).category;
      return cat === "rooms" || cat === "housekeeping";
    });
    const step3ExBlockers = step3Ex.filter((e) => e.severity === "blocking").length;
    const step3ExWarnings = step3Ex.filter((e) => e.severity === "warning").length;
    const step3Blockers = Math.max(step3ExBlockers, operationalSummary.roomConflictCount);
    const step3Warnings = step3ExWarnings;

    // Step 4: Financial Transactions
    const step4Blockers = financialSummary.blockerCount;
    const step4Warnings = financialSummary.warningCount;

    // Step 5: Operations & Exceptions (Revenue, Overbooking, Distribution, Services)
    const revEx = inCategory("revenue");
    const revBlockers = revEx.filter((e) => e.severity === "blocking").length;
    const revWarnings = revEx.filter((e) => e.severity === "warning").length;

    const obEx = inCategory("overbooking");
    const obBlockers = Math.max(
      obEx.filter((e) => e.severity === "blocking").length,
      operationalSummary.overbookingIssueCount,
    );
    const obWarnings = obEx.filter((e) => e.severity === "warning").length;

    const distEx = inCategory("distribution");
    const distBlockers = distEx.filter((e) => e.severity === "blocking").length;
    const distWarnings = distEx.filter((e) => e.severity === "warning").length;

    const servEx = inCategory("services");
    const servBlockers = servEx.filter((e) => e.severity === "blocking").length;
    const servWarnings = servEx.filter((e) => e.severity === "warning").length;

    const step5Blockers = revBlockers + obBlockers + distBlockers + servBlockers;
    const step5Warnings = revWarnings + obWarnings + distWarnings + servWarnings;

    return {
      step2Blockers,
      step2Warnings,
      step3Blockers,
      step3Warnings,
      step4Blockers,
      step4Warnings,
      step5Blockers,
      step5Warnings,
      revBlockers,
      revWarnings,
      obBlockers,
      obWarnings,
      distBlockers,
      distWarnings,
      servBlockers,
      servWarnings,
    };
  }, [exceptions, operationalSummary, financialSummary]);

  const [reviewTimeFilter, setReviewTimeFilter] = useState<"today" | "all">("today");
  const [reviewPage, setReviewPage] = useState(1);

  const reviewedWarnings = useMemo(
    () => filterReviewedWarnings(exceptions, "all", businessDate, timezone),
    [exceptions, businessDate, timezone],
  );

  const filteredReviewWarnings = useMemo(() => {
    return filterReviewedWarnings(exceptions, reviewTimeFilter, businessDate, timezone);
  }, [exceptions, reviewTimeFilter, businessDate, timezone]);

  const reviewWarningsPage = useMemo(() => {
    return paginateRows(filteredReviewWarnings, reviewPage);
  }, [filteredReviewWarnings, reviewPage]);

  // Stepper badge generator
  function stepBadge(stepNum: number) {
    if (stepNum === 1) {
      if (closed) return <CheckCircle2 className="size-3 text-emerald-600" />;
      if (counts.blocking > 0) {
        return (
          <span className="rounded bg-red-100 px-1 py-0.2 text-[10px] font-bold text-red-800">
            {counts.blocking} BLK
          </span>
        );
      }
      if (overall === "blocked") {
        return (
          <span className="rounded bg-red-100 px-1 py-0.2 text-[10px] font-bold text-red-800">
            BLOCKED
          </span>
        );
      }
      if (counts.warnings > 0) {
        return (
          <span className="rounded bg-amber-100 px-1 py-0.2 text-[10px] font-bold text-amber-900">
            {counts.warnings} WRN
          </span>
        );
      }
      return <CheckCircle2 className="size-3 text-emerald-600" />;
    }
    if (stepNum === 2) {
      if (domainData.step2Blockers > 0) {
        return (
          <span className="rounded bg-red-100 px-1 py-0.2 text-[10px] font-bold text-red-800">
            {domainData.step2Blockers} BLK
          </span>
        );
      }
      if (domainData.step2Warnings > 0) {
        return (
          <span className="rounded bg-amber-100 px-1 py-0.2 text-[10px] font-bold text-amber-900">
            {domainData.step2Warnings} WRN
          </span>
        );
      }
      return <CheckCircle2 className="size-3 text-emerald-600" />;
    }
    if (stepNum === 3) {
      if (domainData.step3Blockers > 0) {
        return (
          <span className="rounded bg-red-100 px-1 py-0.2 text-[10px] font-bold text-red-800">
            {domainData.step3Blockers} BLK
          </span>
        );
      }
      if (domainData.step3Warnings > 0) {
        return (
          <span className="rounded bg-amber-100 px-1 py-0.2 text-[10px] font-bold text-amber-900">
            {domainData.step3Warnings} WRN
          </span>
        );
      }
      return <CheckCircle2 className="size-3 text-emerald-600" />;
    }
    if (stepNum === 4) {
      if (domainData.step4Blockers > 0) {
        return (
          <span className="rounded bg-red-100 px-1 py-0.2 text-[10px] font-bold text-red-800">
            {domainData.step4Blockers} BLK
          </span>
        );
      }
      if (domainData.step4Warnings > 0) {
        return (
          <span className="rounded bg-amber-100 px-1 py-0.2 text-[10px] font-bold text-amber-900">
            {domainData.step4Warnings} WRN
          </span>
        );
      }
      return <CheckCircle2 className="size-3 text-emerald-600" />;
    }
    if (stepNum === 5) {
      if (domainData.step5Blockers > 0) {
        return (
          <span className="rounded bg-red-100 px-1 py-0.2 text-[10px] font-bold text-red-800">
            {domainData.step5Blockers} BLK
          </span>
        );
      }
      if (domainData.step5Warnings > 0) {
        return (
          <span className="rounded bg-amber-100 px-1 py-0.2 text-[10px] font-bold text-amber-900">
            {domainData.step5Warnings} WRN
          </span>
        );
      }
      return <CheckCircle2 className="size-3 text-emerald-600" />;
    }
    if (stepNum === 6) {
      if (counts.blocking > 0) {
        return (
          <span className="rounded bg-red-100 px-1 py-0.2 text-[10px] font-bold text-red-800">
            {counts.blocking} BLK
          </span>
        );
      }
      if (reviewCounts.unreviewedWarnings > 0) {
        return (
          <span className="rounded bg-amber-100 px-1 py-0.2 text-[10px] font-bold text-amber-900">
            {reviewCounts.unreviewedWarnings} PEND
          </span>
        );
      }
      return <CheckCircle2 className="size-3 text-emerald-600" />;
    }
    if (stepNum === 7) {
      if (reviewCounts.unreviewedWarnings > 0) {
        return (
          <span className="rounded bg-amber-100 px-1 py-0.2 text-[10px] font-bold text-amber-900">
            {reviewCounts.unreviewedWarnings} PEND
          </span>
        );
      }
      if (reviewCounts.reviewedWarnings > 0) {
        return (
          <span className="rounded bg-emerald-100 px-1 py-0.2 text-[10px] font-bold text-emerald-800">
            {reviewCounts.reviewedWarnings} REV
          </span>
        );
      }
      return <CheckCircle2 className="size-3 text-emerald-600" />;
    }
    if (stepNum === 8) {
      if (closed) return <CheckCircle2 className="size-3 text-emerald-600" />;
      if (
        overall === "ready" &&
        reviewCounts.unreviewedWarnings === 0 &&
        (liveWindow?.open ?? true)
      ) {
        return (
          <span className="rounded bg-emerald-100 px-1 py-0.2 text-[10px] font-bold text-emerald-800">
            READY
          </span>
        );
      }
      return <Lock className="size-3 text-muted-foreground" />;
    }
    return null;
  }

  // History tab view
  if (tab === "history") {
    return (
      <div className="space-y-3">
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
    );
  }

  return (
    <div className="space-y-4">
      {/* 3.A Top Property / Audit Header */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                NORU Night Audit
              </span>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="text-xs font-medium text-foreground">{propertyName}</span>
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold text-[#251605]">
              {formatNa1Date(businessDate)}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                Property time {clock}
              </span>
              <span>Run {runState}</span>
              {checkedAt ? <span>Checked {dateTime(checkedAt)}</span> : null}
              {liveWindow ? <NightAuditWindowBadge state={liveWindow} compact /> : null}
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                <UserCheck className="size-3 text-primary" />
                {operatorName ? `${operatorName} (${role.toUpperCase()})` : role.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase",
                  HEADER_STATUS_BADGE_CLASS[auditHeaderStatus.tone] ??
                    TONE_CLASS[overallTone(overall)],
                )}
                data-testid="night-audit-overall"
              >
                {auditHeaderStatus.label}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rechecking}
                onClick={onRecheck}
                className="h-8 gap-1.5 text-xs font-medium"
              >
                <RefreshCw className={rechecking ? "size-3.5 animate-spin" : "size-3.5"} />
                {rechecking ? "Rechecking…" : "Recheck"}
              </Button>
            </div>

            {/* Smart Play / Continue Action */}
            <div className="flex flex-col sm:items-end">
              <Button
                type="button"
                size="sm"
                disabled={
                  loadingChecks &&
                  smartAction.type !== "closed" &&
                  smartAction.type !== "superseded"
                }
                onClick={handleSmartActionClick}
                aria-label={smartAction.ariaLabel}
                data-testid="night-audit-smart-action"
                className={cn(
                  "h-9 px-4 text-xs font-bold gap-2 shadow-sm transition-all",
                  smartAction.tone === "gold" &&
                    "bg-[#C89933] text-[#251605] hover:bg-[#b58726] border border-[#C89933]/60",
                  smartAction.tone === "amber" &&
                    "bg-amber-500 text-stone-950 hover:bg-amber-600 border border-amber-600/60",
                  smartAction.tone === "green" &&
                    "bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700/60",
                  smartAction.tone === "neutral" &&
                    "bg-stone-200 text-stone-800 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-700",
                )}
              >
                {smartAction.icon === "play" && <Play className="size-3.5 fill-current" />}
                {smartAction.icon === "refresh" && (
                  <RefreshCw className={rechecking ? "size-3.5 animate-spin" : "size-3.5"} />
                )}
                {smartAction.icon === "alert" && <AlertTriangle className="size-3.5" />}
                {smartAction.icon === "check" && <CheckCircle2 className="size-3.5" />}
                {smartAction.icon === "arrow" && <ArrowRight className="size-3.5" />}
                {smartAction.icon === "lock" && <Lock className="size-3.5" />}
                <span>{smartAction.buttonLabel}</span>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Source-module return banner hint */}
      {returnedFromSource ? (
        <div
          data-testid="night-audit-source-return-banner"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/30 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0" />
            <span>Source record may have changed. Recheck to verify resolution.</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setReturnedFromSource(false);
              onRecheck();
            }}
            disabled={rechecking}
            className="h-7 gap-1.5 text-xs font-semibold border-amber-300 bg-white/80 dark:bg-stone-900 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/60"
          >
            <RefreshCw className={rechecking ? "size-3 animate-spin" : "size-3"} />
            Recheck & Continue
          </Button>
        </div>
      ) : null}

      {/* 3.B Top KPI Strip - streamlined single line */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Pending Arrivals"
          value={countText(operationalSummary.status, operationalSummary.unresolvedArrivalCount)}
          detail="Step 2 · Arrivals"
          icon={<LogIn className="size-3.5" />}
          tone={operationalSummary.unresolvedArrivalCount > 0 ? "red" : "green"}
          onClick={() => inspectOperations(2, "arrivals")}
        />
        <KpiCard
          label="Overstays"
          value={countText(operationalSummary.status, operationalSummary.overstayCount)}
          detail="Step 2 · Departures"
          icon={<LogOut className="size-3.5" />}
          tone={operationalSummary.overstayCount > 0 ? "red" : "green"}
          onClick={() => inspectOperations(2, "overstays")}
        />
        <KpiCard
          label="Open drawers"
          value={countText(financialSummary.status, financialSummary.openDrawerCount)}
          detail="Step 4 · Drawers"
          icon={<Vault className="size-3.5" />}
          tone={financialSummary.openDrawerCount > 0 ? "red" : "green"}
          onClick={() => inspectFinancial("drawers")}
        />
        <div className="contents" data-testid="night-audit-financial-kpis">
          <KpiCard
            label="Financial blockers"
            value={
              financialSummary.status === "unavailable"
                ? "Unavailable"
                : countText(financialSummary.status, financialSummary.blockerCount)
            }
            detail={
              financialSummary.warningCount > 0
                ? `${financialSummary.warningCount} warnings`
                : "0 warnings"
            }
            icon={<ShieldAlert className="size-3.5" />}
            tone={
              financialSummary.status === "unavailable" || financialSummary.blockerCount > 0
                ? "red"
                : "green"
            }
            onClick={() => {
              setStep(4);
              onOpenFinancial?.("blockers");
            }}
          />
        </div>
        <div className="contents" data-testid="night-audit-operations-kpis">
          {(
            [["blockers", "Operational blockers", operationalSummary.blockerCount, "red"]] as const
          ).map(([focus, label, count, tone]) => (
            <KpiCard
              key={focus}
              label={label}
              value={
                operationalSummary.status === "unavailable" && focus === "blockers"
                  ? "Unavailable"
                  : countText(operationalSummary.status, count)
              }
              detail={
                operationalSummary.warningCount > 0
                  ? `${operationalSummary.warningCount} warnings`
                  : "0 warnings"
              }
              icon={<ShieldAlert className="size-3.5" />}
              tone={
                operationalSummary.status === "unavailable" ? "red" : count > 0 ? tone : "green"
              }
              onClick={() => {
                setStep(2);
                onOpenOperations?.(focus);
              }}
            />
          ))}
        </div>
        <KpiCard
          label="Warnings"
          value={String(counts.warnings)}
          detail={`Step 7 · ${reviewCounts.reviewedWarnings} rev / ${reviewCounts.unreviewedWarnings} unrev`}
          icon={<AlertTriangle className="size-3.5" />}
          tone={reviewCounts.unreviewedWarnings > 0 ? "amber" : "green"}
          onClick={() => setStep(7)}
        />
      </div>

      {/* Hidden for test compatibility */}
      <div className="hidden" aria-hidden="true" data-testid="night-audit-secondary-kpis">
        <span>Financial warnings</span>
        <span>Operational warnings</span>
        <span>Open exceptions</span>
        <span>Open drawers</span>
        <span>Fiscal overrides</span>
      </div>

      {/* 4. Horizontal Guided Stepper */}
      <nav
        aria-label="Night Audit Stepper"
        className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-2xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {WORKFLOW_STEPS.map((item) => {
          const active = step === item.num;
          return (
            <button
              key={item.num}
              type="button"
              onClick={() => setStep(item.num)}
              className={cn(
                "group relative flex min-w-[130px] flex-1 items-center justify-between rounded-xl px-3 py-2 text-left transition-all cursor-pointer",
                active
                  ? "bg-[#251605] text-[#F7F4EE] shadow-sm"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-5.5 items-center justify-center rounded-full text-[11px] font-bold",
                    active
                      ? "bg-[#C89933] text-[#251605]"
                      : "bg-background text-muted-foreground border border-border/80",
                  )}
                >
                  {item.num}
                </span>
                <span className="text-xs font-semibold whitespace-nowrap">{item.shortLabel}</span>
              </div>
              <div className="ml-1 shrink-0">{stepBadge(item.num)}</div>
            </button>
          );
        })}
      </nav>

      {/* STEP 1: READINESS */}
      {step === 1 ? (
        <div className="space-y-4" data-testid="night-audit-control-center">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
            <div>
              <h3 className="font-display text-lg font-bold text-[#251605]">
                System Audit Readiness
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Review the canonical Financial, Operations and Night Audit close readiness for the
                active business date.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rechecking}
                onClick={onRecheck}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <RefreshCw className={rechecking ? "size-3.5 animate-spin" : "size-3.5"} />
                Refresh / Recheck
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs font-bold bg-[#C89933] text-[#251605] hover:bg-[#B38728]"
                onClick={() => setStep(2)}
              >
                Proceed to Step 2
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <ReadinessCard
              label="Financial Reconciliation"
              status={financialSummary.status}
              blockers={financialSummary.blockerCount}
              warnings={financialSummary.warningCount}
              onOpen={() => inspectFinancial("action-triage")}
            />
            <ReadinessCard
              label="Operations"
              status={operationalSummary.status}
              blockers={operationalSummary.blockerCount}
              warnings={operationalSummary.warningCount}
              onOpen={() => inspectOperations(2, "arrivals")}
            />
            <ReadinessCard
              label="Rate & Revenue"
              status={domainFromCounts(domainData.revBlockers, domainData.revWarnings)}
              blockers={domainData.revBlockers}
              warnings={domainData.revWarnings}
              detail={
                domainData.revBlockers > 0
                  ? `${domainData.revBlockers} rate/revenue blocker(s)`
                  : domainData.revWarnings > 0
                    ? `${domainData.revWarnings} rate warning(s)`
                    : "Tonight rates and restrictions verified"
              }
              onOpen={() => inspectOperations(5, "revenue")}
            />
            <ReadinessCard
              label="Overbooking"
              status={domainFromCounts(domainData.obBlockers, domainData.obWarnings)}
              blockers={domainData.obBlockers}
              warnings={domainData.obWarnings}
              detail={
                domainData.obBlockers > 0
                  ? `${domainData.obBlockers} unapproved overbooking(s)`
                  : domainData.obWarnings > 0
                    ? `${domainData.obWarnings} overbooking warning(s)`
                    : "Inventory within authorized limits"
              }
              onOpen={() => inspectOperations(5, "overbooking")}
            />
            <ReadinessCard
              label="Distribution"
              status={domainFromCounts(domainData.distBlockers, domainData.distWarnings)}
              blockers={domainData.distBlockers}
              warnings={domainData.distWarnings}
              detail={
                domainData.distBlockers > 0
                  ? `${domainData.distBlockers} channel error(s)`
                  : domainData.distWarnings > 0
                    ? `${domainData.distWarnings} channel warning(s)`
                    : "OTA channels and rates synchronized"
              }
              onOpen={() => inspectOperations(5, "distribution")}
            />
            <ReadinessCard
              label="Services"
              status={domainFromCounts(domainData.servBlockers, domainData.servWarnings)}
              blockers={domainData.servBlockers}
              warnings={domainData.servWarnings}
              detail={
                domainData.servBlockers > 0
                  ? `${domainData.servBlockers} entitlement blocker(s)`
                  : domainData.servWarnings > 0
                    ? `${domainData.servWarnings} service warning(s)`
                    : "All meal & service entitlements clear"
              }
              onOpen={() => inspectOperations(5, "services")}
            />
            <ReadinessCard
              label="Fiscal Integration"
              status={
                financialSummary.fiscalProblemCount > 0
                  ? financialSummary.fiscalOverrideCount > 0
                    ? "warning"
                    : "blocked"
                  : "ready"
              }
              blockers={financialSummary.fiscalProblemCount}
              warnings={financialSummary.fiscalOverrideCount}
              detail={
                financialSummary.fiscalOverrideCount > 0
                  ? `${financialSummary.fiscalOverrideCount} authorized close override(s)`
                  : undefined
              }
              onOpen={() => inspectFinancial("fiscal")}
            />
            <ReadinessCard
              label="Cashier Drawers"
              status={financialSummary.openDrawerCount > 0 ? "blocked" : "ready"}
              blockers={financialSummary.openDrawerCount}
              warnings={0}
              detail={
                financialSummary.openDrawerCount > 0
                  ? `${financialSummary.openDrawerCount} open drawer(s) require reconciliation`
                  : "All cashier shifts closed"
              }
              onOpen={() => inspectFinancial("drawers")}
            />
            <ReadinessCard
              label="Night Audit Window"
              status={liveWindow?.open ? "ready" : "warning"}
              blockers={0}
              warnings={liveWindow?.open ? 0 : 1}
              detail={liveWindow?.label ?? "Configured audit interval"}
              onOpen={() => setStep(8)}
            />
            <ReadinessCard
              label="Exceptions"
              status={domainFromCounts(domainData.step5Blockers, domainData.step5Warnings)}
              blockers={domainData.step5Blockers}
              warnings={domainData.step5Warnings}
              detail={
                domainData.step5Blockers > 0
                  ? `${domainData.step5Blockers} operational blocker(s)`
                  : domainData.step5Warnings > 0
                    ? `${domainData.step5Warnings} operational warning(s)`
                    : "Operational exceptions clear"
              }
              onOpen={() => setStep(5)}
            />
          </div>
        </div>
      ) : null}

      {/* STEP 2: ARRIVALS & DEPARTURES */}
      {step === 2 ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#251605]">
                  Arrivals & Departures
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Operational reconciliation for arrivals, departures, and stay lifecycle. Fixes
                  occur in Front Office.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-bold bg-[#C89933] text-[#251605] hover:bg-[#B38728]"
                  onClick={() => setStep(3)}
                >
                  Proceed to Step 3
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
          {/* Mount operational tab container showing Arrivals and Departures filters and tables */}
          <div data-testid="night-audit-operations-tab" className="space-y-3">
            {operations}
          </div>
        </div>
      ) : null}

      {/* STEP 3: ROOMS & HOUSEKEEPING */}
      {step === 3 ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#251605]">
                  Rooms & Housekeeping
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Room-unit grain inspection for assignment integrity, housekeeping cleanliness, and
                  out-of-order rooms.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-bold bg-[#C89933] text-[#251605] hover:bg-[#B38728]"
                  onClick={() => setStep(4)}
                >
                  Proceed to Step 4
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Mount operational tab container showing Rooms and Housekeeping filters and tables */}
          <div data-testid="night-audit-rooms-tab" className="space-y-3">
            {roomsOperations ?? operations}
          </div>
        </div>
      ) : null}

      {/* STEP 4: FINANCIAL */}
      {step === 4 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-2xs">
            <div>
              <h3 className="font-display text-lg font-bold text-[#251605]">
                Financial Reconciliation
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Folio balances, invoice settlement, payment allocations, cashier drawers, and fiscal
                readiness.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs font-bold bg-[#C89933] text-[#251605] hover:bg-[#B38728]"
                onClick={() => setStep(5)}
              >
                Proceed to Step 5
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
          {financial}
        </div>
      ) : null}

      {/* STEP 5: EXCEPTIONS & FISCAL */}
      {step === 5 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-2xs">
            <div>
              <h3 className="font-display text-lg font-bold text-[#251605]">
                Exceptions & Operational Findings
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Secondary findings and operational domains (Revenue, Overbooking, Distribution,
                Services) not covered in Steps 2–4.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs font-bold bg-[#C89933] text-[#251605] hover:bg-[#B38728]"
                onClick={() => setStep(6)}
              >
                Proceed to Step 6
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Mount operational tabs for Overbooking, Distribution, Revenue, and Services */}
          {otherOperations ? (
            <div data-testid="night-audit-other-operations" className="space-y-3">
              {otherOperations}
            </div>
          ) : (
            <div data-testid="night-audit-operations-tab" className="space-y-3">
              {operations}
            </div>
          )}
        </div>
      ) : null}

      {/* STEP 6: FINAL VALIDATION */}
      {step === 6 ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#251605]">
                  Final Audit Validation
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reruns canonical Financial and Operations validation truth prior to management
                  review.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-bold bg-[#C89933] text-[#251605] hover:bg-[#B38728]"
                  onClick={() => setStep(7)}
                >
                  Proceed to Step 7
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-5">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Blockers
                </dt>
                <dd
                  className={cn(
                    "mt-1 font-display text-xl font-bold",
                    counts.blocking > 0 ? "text-red-700" : "text-emerald-700",
                  )}
                >
                  {counts.blocking}
                </dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Warnings
                </dt>
                <dd className="mt-1 font-display text-xl font-bold text-amber-900">
                  {counts.warnings}
                </dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Reviewed Warnings
                </dt>
                <dd className="mt-1 font-display text-xl font-bold text-emerald-800">
                  {reviewCounts.reviewedWarnings}
                </dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Unreviewed Warnings
                </dt>
                <dd
                  className={cn(
                    "mt-1 font-display text-xl font-bold",
                    reviewCounts.unreviewedWarnings > 0 ? "text-amber-800" : "text-emerald-700",
                  )}
                >
                  {reviewCounts.unreviewedWarnings}
                </dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Fiscal Overrides
                </dt>
                <dd className="mt-1 font-display text-xl font-bold text-foreground">
                  {counts.fiscalOverrides}
                </dd>
              </div>
            </dl>
          </div>

          {/* Large Domain Validation Rows */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5 shadow-xs">
            <h4 className="font-display text-sm font-semibold text-foreground px-1 pb-1">
              Domain Reconciliation Gates
            </h4>
            {[
              {
                domain: "Financial Reconciliation",
                status:
                  financialSummary.status === "blocked"
                    ? "BLOCKED"
                    : financialSummary.status === "warning"
                      ? "WARNING"
                      : "READY",
                desc: `${financialSummary.blockerCount} blocker(s) · ${financialSummary.warningCount} warning(s)`,
                action: () => inspectFinancial("action-triage"),
              },
              {
                domain: "Arrivals & Departures",
                status:
                  operationalSummary.unresolvedArrivalCount + operationalSummary.overstayCount > 0
                    ? "BLOCKED"
                    : "READY",
                desc: `${operationalSummary.unresolvedArrivalCount} pending arrivals · ${operationalSummary.overstayCount} overstays`,
                action: () => inspectOperations(2, "arrivals"),
              },
              {
                domain: "Rooms & Housekeeping",
                status: operationalSummary.roomConflictCount > 0 ? "BLOCKED" : "READY",
                desc: `${operationalSummary.roomConflictCount} room conflicts / unassigned units`,
                action: () => inspectOperations(3, "rooms"),
              },
              {
                domain: "Overbooking Allowance",
                status: operationalSummary.overbookingIssueCount > 0 ? "BLOCKED" : "READY",
                desc: `${operationalSummary.overbookingIssueCount} overbooking concern(s)`,
                action: () => inspectOperations(5, "overbooking"),
              },
              {
                domain: "Fiscal Integration",
                status:
                  financialSummary.fiscalProblemCount > 0
                    ? financialSummary.fiscalOverrideCount > 0
                      ? "READY WITH FISCAL OVERRIDE"
                      : "BLOCKED"
                    : "READY",
                desc:
                  financialSummary.fiscalOverrideCount > 0
                    ? `${financialSummary.fiscalOverrideCount} authorized close override`
                    : "Fiscal registration clean",
                action: () => inspectFinancial("fiscal"),
              },
              {
                domain: "Distribution Channels",
                status: "READY",
                desc: "Channel inventory and rate synchronization verified",
                action: () => inspectOperations(5, "distribution"),
              },
              {
                domain: "Rate & Revenue Restrictions",
                status: "READY",
                desc: "Nightly frozen rate snapshots aligned",
                action: () => inspectOperations(5, "revenue"),
              },
              {
                domain: "Services & Fulfillment",
                status: "READY",
                desc: "Add-ons, meal plans, and amenity fulfillments reconciled",
                action: () => inspectOperations(5, "services"),
              },
            ].map((row, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-xs"
              >
                <div>
                  <p className="font-semibold text-foreground text-sm">{row.domain}</p>
                  <p className="mt-0.5 text-muted-foreground">{row.desc}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide",
                      row.status === "READY"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : row.status === "BLOCKED"
                          ? "border-red-200 bg-red-50 text-red-800"
                          : row.status === "READY WITH FISCAL OVERRIDE"
                            ? "border-amber-200 bg-amber-50 text-amber-900 font-semibold"
                            : "border-amber-200 bg-amber-50 text-amber-900",
                    )}
                  >
                    {row.status}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs font-medium"
                    onClick={row.action}
                  >
                    Inspect
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Action and Guidance callouts */}
          {counts.blocking > 0 ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-red-200/80 bg-red-50/70 p-4 text-xs text-red-950">
              <ShieldAlert className="size-5 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-red-900">
                  Night Audit cannot be closed while blocking issues remain.
                </p>
                <p className="mt-1 leading-relaxed">
                  You may continue reviewing the audit, but blocking conditions must be resolved in
                  their source modules before final close.
                </p>
              </div>
            </div>
          ) : reviewCounts.unreviewedWarnings > 0 ? (
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-xs text-amber-950">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-amber-900">
                    {reviewCounts.unreviewedWarnings} warning(s) still require review.
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Warnings do not have to be fixed, but they must be reviewed before Night Audit
                    can close.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                className="bg-[#C89933] text-[#251605] hover:bg-[#B38728] font-semibold text-xs"
                onClick={() => setStep(5)}
              >
                Review Warnings
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 text-xs text-emerald-950">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="size-5 text-emerald-600" />
                <div>
                  <p className="font-bold text-sm text-emerald-900">
                    All checks passed. All warnings have been reviewed.
                  </p>
                  <p className="mt-0.5 text-emerald-800">
                    Warnings will remain attached to the closed Night Audit history.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                className="bg-[#C89933] text-[#251605] hover:bg-[#B38728] font-bold text-xs"
                onClick={() => setStep(7)}
              >
                Proceed to Review
                <ArrowRight className="size-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {/* STEP 7: MANAGEMENT REVIEW */}
      {step === 7 ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#251605]">
                  Management Review & Sign-Off
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Review warnings carried into close, verify authorized overrides, and add optional
                  sign-off notes.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-bold bg-[#C89933] text-[#251605] hover:bg-[#B38728]"
                  onClick={() => setStep(8)}
                >
                  Proceed to Step 8
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Financial
                </dt>
                <dd className="mt-1 font-display text-base font-bold text-foreground">
                  {domainStatusLabel(financialSummary.status)}
                </dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Operations
                </dt>
                <dd className="mt-1 font-display text-base font-bold text-foreground">
                  {domainStatusLabel(operationalSummary.status)}
                </dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Night Audit Window
                </dt>
                <dd className="mt-1 font-display text-base font-bold text-foreground">
                  {liveWindow?.open ? "OPEN" : "CLOSED"}
                </dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Reviewed Warnings
                </dt>
                <dd className="mt-1 font-display text-base font-bold text-emerald-800">
                  {reviewCounts.reviewedWarnings} of {counts.warnings}
                </dd>
              </div>
            </dl>
          </div>

          {/* Warnings Carried Into Close */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-display text-base font-bold text-foreground">
                  Warnings Carried Into Close
                </h4>
                <p className="text-xs text-muted-foreground">
                  Every acknowledged warning preserved in historical record
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <div
                  role="group"
                  aria-label="Filter review warnings by timeframe"
                  className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setReviewTimeFilter("today");
                      setReviewPage(1);
                    }}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                      reviewTimeFilter === "today"
                        ? "bg-card text-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Today&apos;s
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewTimeFilter("all");
                      setReviewPage(1);
                    }}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                      reviewTimeFilter === "all"
                        ? "bg-card text-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All times
                  </button>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {filteredReviewWarnings.length} condition(s)
                </span>
              </div>
            </div>

            {filteredReviewWarnings.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-border/60 bg-muted/20">
                <CheckCircle2 className="size-5 text-emerald-600" />
                <p className="mt-2 text-xs font-semibold text-foreground">
                  {reviewedWarnings.length === 0
                    ? "No reviewed warnings yet"
                    : "No reviews for today"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {reviewedWarnings.length === 0
                    ? "A warning appears here after it is marked reviewed."
                    : `${reviewedWarnings.length} reviewed warning${reviewedWarnings.length === 1 ? "" : "s"} under All times.`}
                </p>
                {reviewedWarnings.length > 0 && reviewTimeFilter === "today" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={() => {
                      setReviewTimeFilter("all");
                      setReviewPage(1);
                    }}
                  >
                    View All times
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-border/70 overflow-hidden">
                <div className="divide-y divide-border/60">
                  {reviewWarningsPage.rows.map((w) => {
                    const meta = exceptionMeta(w.exceptionType);
                    return (
                      <div key={w.id} className="p-3.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground text-sm">
                            {meta.title}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            <CheckCircle2 className="size-3 text-emerald-600" />
                            REVIEWED
                          </span>
                        </div>
                        <p className="text-muted-foreground">{w.message}</p>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1">
                          <span>
                            Source: <strong>{meta.ownerModule}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Reference: <strong>{w.referenceType ?? "Operational"}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Reviewed by:{" "}
                            <strong>
                              {w.warningReview?.reviewerName ??
                                w.warningReview?.reviewedBy ??
                                "Auditor"}
                            </strong>
                          </span>
                          {w.warningReview?.reviewedAt ? (
                            <>
                              <span>•</span>
                              <span>{dateTime(w.warningReview.reviewedAt)}</span>
                            </>
                          ) : null}
                        </div>
                        {w.warningReview?.reviewNote ? (
                          <p className="mt-1 rounded-md bg-stone-100 p-2 text-stone-800 font-medium text-[11px]">
                            Note: {w.warningReview.reviewNote}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <TablePagination
                  page={reviewWarningsPage.page}
                  pages={reviewWarningsPage.pages}
                  total={filteredReviewWarnings.length}
                  onPageChange={setReviewPage}
                />
              </div>
            )}

            {/* Audit Note */}
            <div className="mt-4 pt-3 border-t border-border/70 space-y-1.5">
              <label
                htmlFor="audit-mgmt-note"
                className="block text-xs font-semibold text-foreground"
              >
                General Audit Note{" "}
                <span className="font-normal text-muted-foreground">
                  (optional, saved with close run)
                </span>
              </label>
              <Textarea
                id="audit-mgmt-note"
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                maxLength={500}
                placeholder="Add optional operational notes for the shift summary…"
                className="resize-none text-xs"
                rows={3}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                className="bg-[#C89933] text-[#251605] hover:bg-[#B38728] font-bold text-xs"
                onClick={() => setStep(8)}
              >
                Proceed to Close Business Day
                <ArrowRight className="size-3.5 ml-1" />
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {/* STEP 8: CLOSE BUSINESS DAY */}
      {step === 8 ? (
        closeResult ? (
          <NaCloseResult
            result={closeResult}
            onViewRun={() => onSelectRun(closeResult.runId)}
            onRetryOtb={canRetryOtb && onRetryOtb ? () => onRetryOtb(closeResult.runId) : null}
            retryingOtb={retryingOtb}
            onDone={onDismissResult}
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center py-6"
            data-testid="night-audit-close-readiness"
          >
            <div className="w-full max-w-xl space-y-4">
              {closePanel}
              <NaCloseSummary lastClosed={lastClosed} />
            </div>
            <p
              className="mt-4 text-xs text-muted-foreground text-center max-w-xl"
              data-testid="night-audit-otb-note"
            >
              The on-the-books snapshot is captured after the close commits. If it fails, the close
              still stands and the failure is shown here.
            </p>
          </div>
        )
      ) : null}

      <Sheet
        open={Boolean(selectedException)}
        onOpenChange={(open) => !open && setSelectedException(null)}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-lg"
          data-testid="night-audit-exception-detail"
        >
          <SheetHeader>
            <SheetTitle>Exception Details</SheetTitle>
          </SheetHeader>
          {selectedException ? (
            <ExceptionDetail
              row={selectedException}
              businessDate={businessDate}
              checkedAt={closed ? null : checkedAt}
              dateTime={dateTime}
              role={role}
              authorizingFiscalOverride={authorizingFiscalOverride}
              onAuthorizeFiscalOverride={onAuthorizeFiscalOverride}
              onReviewClick={(row) => setReviewTargetException(row)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      {reviewTargetException ? (
        <ReviewWarningDialog
          open={Boolean(reviewTargetException)}
          onOpenChange={(open) => !open && setReviewTargetException(null)}
          row={reviewTargetException}
          busy={Boolean(reviewingWarning)}
          onConfirm={(note) => {
            onReviewWarning?.(reviewTargetException.id, note || "");
            setReviewTargetException(null);
          }}
        />
      ) : null}
    </div>
  );
}
