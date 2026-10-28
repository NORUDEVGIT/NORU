import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  FileText,
  Filter,
  Layers,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
} from "lucide-react";

import { NaCloseSummary } from "@/packages/pms/components/nightaudit/na1-panels";
import { formatNa1Date } from "@/packages/pms/lib/na1";
import {
  DEFAULT_HISTORY_FILTER,
  HISTORY_PAGE_SIZES,
  HISTORY_STATUSES,
  exceptionMeta,
  exceptionStatusLabel,
  historyFiltersActive,
  historyStatusLabel,
  nightAuditReportLinks,
  type HistoryFilter,
  type HistoryPageSize,
} from "@/packages/pms/lib/night-audit-workflow";
import type {
  AuditException,
  NightAuditHistoryPage,
  NightAuditOtbState,
  NightAuditRunRow,
} from "@/packages/pms/lib/nightaudit.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

export type NightAuditHistoryFilter = HistoryFilter;

const OTB_LABEL: Record<NightAuditOtbState, string> = {
  captured: "Captured",
  not_captured: "Not captured",
  unknown: "Unknown",
};

function statusTone(status: string): string {
  if (status === "closed") {
    return "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (status === "failed") {
    return "border-red-200/80 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300";
  }
  if (status === "superseded") {
    return "border-slate-200/80 bg-slate-100 text-slate-700 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-300";
  }
  if (status === "ready") {
    return "border-sky-200/80 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300";
  }
  return "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300";
}

function statusDot(status: string): string {
  if (status === "closed") return "bg-emerald-500";
  if (status === "failed") return "bg-red-500";
  if (status === "superseded") return "bg-slate-400";
  if (status === "ready") return "bg-sky-500";
  return "bg-amber-500";
}

function count(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "—";
}

export function NightAuditHistoryWorkspace({
  data,
  loading,
  error,
  filter,
  onFilter,
  onRetry,
  selectedRunId,
  runDetail,
  runDetailLoading,
  runDetailError,
  onSelectRun,
  dateTime,
}: {
  data: NightAuditHistoryPage | null;
  loading: boolean;
  error: string | null;
  filter: NightAuditHistoryFilter;
  onFilter: (next: NightAuditHistoryFilter) => void;
  onRetry: () => void;
  selectedRunId: string | null;
  runDetail: { run: NightAuditRunRow; exceptions: AuditException[] } | null;
  runDetailLoading: boolean;
  runDetailError: string | null;
  onSelectRun: (runId: string) => void;
  dateTime: (value: string) => string;
}) {
  const set = (patch: Partial<NightAuditHistoryFilter>) =>
    onFilter({ ...filter, page: 1, ...patch });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const isFiltered = historyFiltersActive(filter);

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs"
      data-testid="night-audit-history"
    >
      {/* Top Filter Bar */}
      <div className="border-b border-border/70 bg-muted/20 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search box with Icon */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filter.search}
              onChange={(event) => set({ search: event.target.value })}
              placeholder="Search date (2026-10) or closer"
              aria-label="Search runs"
              className="h-9 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-xs placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          {/* Date Range: From */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-background px-2.5 py-1 text-xs">
            <Calendar className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] font-medium text-muted-foreground">From</span>
            <input
              type="date"
              value={filter.from}
              onChange={(event) => set({ from: event.target.value })}
              aria-label="From business date"
              className="bg-transparent text-xs text-foreground focus:outline-none"
            />
          </div>

          {/* Date Range: To */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-background px-2.5 py-1 text-xs">
            <Calendar className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] font-medium text-muted-foreground">To</span>
            <input
              type="date"
              value={filter.to}
              onChange={(event) => set({ to: event.target.value })}
              aria-label="To business date"
              className="bg-transparent text-xs text-foreground focus:outline-none"
            />
          </div>

          {/* Status Dropdown */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-background px-2.5 py-1 text-xs">
            <Filter className="size-3.5 text-muted-foreground shrink-0" />
            <select
              aria-label="Run status"
              value={filter.status}
              onChange={(event) =>
                set({ status: event.target.value as NightAuditHistoryFilter["status"] })
              }
              className="bg-transparent text-xs font-medium text-foreground focus:outline-none"
              data-testid="night-audit-history-status"
            >
              <option value="all">All statuses</option>
              {HISTORY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {historyStatusLabel(status)}
                </option>
              ))}
            </select>
          </div>

          {/* Closed by Dropdown */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-background px-2.5 py-1 text-xs">
            <User className="size-3.5 text-muted-foreground shrink-0" />
            <select
              aria-label="Closed by"
              value={filter.closedBy}
              onChange={(event) => set({ closedBy: event.target.value })}
              className="bg-transparent text-xs font-medium text-foreground focus:outline-none"
            >
              <option value="">Any closer</option>
              {(data?.closers ?? []).map((closer) => (
                <option key={closer.id} value={closer.id}>
                  {closer.name}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {isFiltered ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 rounded-xl border-dashed border-border px-3 text-xs font-medium text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
              onClick={() => onFilter(DEFAULT_HISTORY_FILTER)}
            >
              <RotateCcw className="size-3.5" />
              <span>Clear</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div
          className="flex flex-col items-center justify-center gap-2.5 px-5 py-16 text-center text-sm text-muted-foreground"
          data-testid="night-audit-history-loading"
        >
          <RefreshCw className="size-6 animate-spin text-primary" />
          <p className="font-medium text-foreground">Loading history…</p>
          <p className="text-xs text-muted-foreground">Retrieving stored Night Audit run records.</p>
        </div>
      ) : error ? (
        /* Error / Unavailable State */
        <div
          className="flex flex-col items-center justify-center px-5 py-16 text-center"
          data-testid="night-audit-history-unavailable"
        >
          <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20 mb-3">
            <AlertCircle className="size-6" />
          </div>
          <p className="font-display text-base font-bold text-destructive">History unavailable</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            This is not an empty history. The stored runs could not be read.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4 h-8.5 gap-1.5 rounded-xl text-xs font-semibold"
            onClick={onRetry}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : !data || data.rows.length === 0 ? (
        /* Empty State */
        <div
          className="flex flex-col items-center justify-center px-5 py-16 text-center"
          data-testid="night-audit-history-empty"
        >
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border mb-3">
            <Clock className="size-6" />
          </div>
          <p className="font-display text-base font-semibold text-foreground">
            {historyFiltersActive(filter) ? "No runs match filters." : "No runs yet."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {historyFiltersActive(filter)
              ? "Try adjusting your search criteria or clearing active date filters."
              : "Completed and in-progress Night Audit runs will appear here."}
          </p>
          {isFiltered ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4 h-8.5 gap-1.5 rounded-xl text-xs font-semibold"
              onClick={() => onFilter(DEFAULT_HISTORY_FILTER)}
            >
              <RotateCcw className="size-3.5" />
              Reset Filters
            </Button>
          ) : null}
        </div>
      ) : (
        /* Table of Runs */
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Business date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Closed</th>
                <th className="px-4 py-3">Closed by</th>
                <th className="px-4 py-3 text-right">Fin. blockers</th>
                <th className="px-4 py-3 text-right">Ops blockers</th>
                <th className="px-4 py-3 text-right">Warnings</th>
                <th className="px-4 py-3">OTB</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3 text-right" aria-label="Action" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.rows.map((run) => {
                const finBlockers = run.summary?.financialBlockerCount;
                const opsBlockers = run.summary?.operationalBlockerCount;
                const warnCount = run.summary?.warnings;

                return (
                  <tr
                    key={run.id}
                    className={cn(
                      "group cursor-pointer transition-colors hover:bg-muted/40",
                      selectedRunId === run.id && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                    )}
                    onClick={() => onSelectRun(run.id)}
                  >
                    {/* Business date */}
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{formatNa1Date(run.businessDate)}</span>
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
                          statusTone(run.status),
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", statusDot(run.status))} />
                        {historyStatusLabel(run.status)}
                      </span>
                    </td>

                    {/* Started timestamp */}
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {dateTime(run.startedAt)}
                    </td>

                    {/* Closed timestamp */}
                    <td className="px-4 py-3 text-foreground whitespace-nowrap">
                      {run.closedAt ? dateTime(run.closedAt) : "—"}
                    </td>

                    {/* Closer */}
                    <td className="px-4 py-3 font-medium text-foreground">
                      {run.closedBy ? (
                        <span className="inline-flex items-center gap-1.5">
                          <UserCheck className="size-3.5 text-muted-foreground" />
                          <span>{run.closedBy}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Financial Blockers */}
                    <td className="px-4 py-3 text-right font-mono">
                      {typeof finBlockers === "number" && finBlockers > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-700 dark:text-red-400">
                          {finBlockers}
                        </span>
                      ) : (
                        count(finBlockers)
                      )}
                    </td>

                    {/* Operational Blockers */}
                    <td className="px-4 py-3 text-right font-mono">
                      {typeof opsBlockers === "number" && opsBlockers > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-700 dark:text-red-400">
                          {opsBlockers}
                        </span>
                      ) : (
                        count(opsBlockers)
                      )}
                    </td>

                    {/* Warnings */}
                    <td className="px-4 py-3 text-right font-mono">
                      {typeof warnCount === "number" && warnCount > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-400">
                          {warnCount}
                        </span>
                      ) : (
                        count(warnCount)
                      )}
                    </td>

                    {/* OTB Snapshot */}
                    <td className="px-4 py-3">
                      {run.otb === "captured" ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <Check className="size-3" />
                          <span>{OTB_LABEL.captured}</span>
                        </span>
                      ) : run.otb === "not_captured" ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
                          <AlertCircle className="size-3" />
                          <span>{OTB_LABEL.not_captured}</span>
                        </span>
                      ) : run.otb ? (
                        OTB_LABEL[run.otb]
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Note */}
                    <td className="max-w-[180px] truncate px-4 py-3 text-muted-foreground font-mono text-[11px]">
                      {run.notes ?? ""}
                    </td>

                    {/* Action Arrow */}
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {data && !error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="font-semibold text-foreground">{data.rows.length}</strong> of{" "}
              <strong className="font-semibold text-foreground">{data.total}</strong> run(s)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium">Rows per page:</span>
              <select
                aria-label="Rows per page"
                value={filter.pageSize}
                onChange={(event) =>
                  onFilter({
                    ...filter,
                    page: 1,
                    pageSize: Number(event.target.value) as HistoryPageSize,
                  })
                }
                className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs font-medium text-foreground focus:outline-none"
              >
                {HISTORY_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="mr-2">
                Page <strong className="font-semibold text-foreground">{data.page}</strong> of{" "}
                <strong className="font-semibold text-foreground">{pages}</strong>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 rounded-lg px-2.5 text-xs font-medium"
                disabled={data.page <= 1}
                onClick={() => onFilter({ ...filter, page: data.page - 1 })}
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 rounded-lg px-2.5 text-xs font-medium"
                disabled={data.page >= pages}
                onClick={() => onFilter({ ...filter, page: data.page + 1 })}
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Slideover Run Detail Drawer */}
      <Sheet
        open={Boolean(selectedRunId)}
        onOpenChange={(open) => {
          if (!open) onSelectRun("");
        }}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-2xl border-l border-border/80 p-6 shadow-2xl"
          data-testid="night-audit-run-detail"
        >
          <SheetHeader className="border-b border-border/70 pb-4">
            <div className="flex items-center justify-between gap-2 pr-6">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Clock className="size-4.5" />
                </div>
                <div>
                  <SheetTitle className="font-display text-lg font-bold text-foreground">
                    {runDetail ? `Night Audit Run · ${formatNa1Date(runDetail.run.businessDate)}` : "Night Audit run"}
                  </SheetTitle>
                  <SheetDescription className="text-xs text-muted-foreground">
                    {runDetail
                      ? `Record ID: ${runDetail.run.id.slice(0, 12)}… · Started ${dateTime(runDetail.run.startedAt)}`
                      : "Detailed inspection of the audit run."}
                  </SheetDescription>
                </div>
              </div>

              {runDetail ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide",
                    statusTone(runDetail.run.status),
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", statusDot(runDetail.run.status))} />
                  {historyStatusLabel(runDetail.run.status)}
                </span>
              ) : null}
            </div>
          </SheetHeader>

          {runDetailLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <RefreshCw className="size-6 animate-spin text-primary" />
              <p className="font-medium text-foreground">Loading run…</p>
            </div>
          ) : null}

          {!runDetailLoading && runDetailError ? (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center">
              <p className="text-sm font-semibold text-destructive">{runDetailError}</p>
            </div>
          ) : null}

          {!runDetailLoading && !runDetailError && runDetail ? (
            <RunDetail run={runDetail.run} exceptions={runDetail.exceptions} dateTime={dateTime} />
          ) : null}

          {!runDetailLoading && !runDetailError && !runDetail ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              This run was not found for this property.
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function RunDetail({
  run,
  exceptions,
  dateTime,
}: {
  run: NightAuditRunRow;
  exceptions: AuditException[];
  dateTime: (value: string) => string;
}) {
  const open = exceptions.filter((row) => row.status === "open");
  const resolved = exceptions.filter((row) => row.status === "resolved");
  const warnings = exceptions.filter((row) => row.severity === "warning");
  const links = run.status === "closed" ? nightAuditReportLinks(run.businessDate.slice(0, 10)) : [];

  return (
    <div className="mt-5 space-y-5 text-sm" data-testid="night-audit-run-quick-view">
      {/* Run Metadata Grid */}
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Item label="Business date" value={formatNa1Date(run.businessDate)} />
        <Item label="Status" value={historyStatusLabel(run.status)} />
        <Item
          label="Started"
          value={`${dateTime(run.startedAt)}${run.startedBy ? ` · ${run.startedBy}` : ""}`}
        />
        <Item label="Closed" value={run.closedAt ? dateTime(run.closedAt) : "—"} />
        <Item label="Closed by" value={run.closedBy ?? "—"} />
        <Item label="OTB snapshot" value={run.otb ? OTB_LABEL[run.otb] : "—"} />

        {/* Outside Window Notice */}
        {run.summary?.nightAuditWindow?.outsideWindow ? (
          <div
            className="col-span-2 sm:col-span-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300"
            data-testid="night-audit-history-outside-window"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Clock className="size-4 text-amber-600 shrink-0" />
              <span>Night Audit window notice</span>
            </div>
            <dd className="mt-1 text-amber-900 dark:text-amber-200">
              Owner closed outside the configured window ({run.summary.nightAuditWindow.windowStart} –{" "}
              {run.summary.nightAuditWindow.windowEnd}, property time{" "}
              {run.summary.nightAuditWindow.localTime})
            </dd>
          </div>
        ) : null}

        {/* Superseded Notice */}
        {run.summary?.businessDateRecovery?.superseded ? (
          <div
            className="col-span-2 sm:col-span-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-xs text-slate-900 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-300"
            data-testid="night-audit-history-superseded"
          >
            <div className="flex items-center gap-2 font-semibold">
              <RefreshCw className="size-4 text-slate-600 shrink-0" />
              <span>Business Date recovery</span>
            </div>
            <dd className="mt-1 text-slate-700 dark:text-slate-400">
              Superseded for recovery to {run.summary.businessDateRecovery.newBusinessDate} ·{" "}
              {run.summary.businessDateRecovery.reason}
            </dd>
          </div>
        ) : null}

        {/* Audit Note */}
        <div className="col-span-2 sm:col-span-3 rounded-xl border border-border/70 bg-muted/20 p-3">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <FileText className="size-3.5 text-primary" />
            Audit note
          </dt>
          <dd className="mt-1.5 whitespace-pre-wrap font-mono text-xs text-foreground">
            {run.notes?.trim() || "—"}
          </dd>
        </div>
      </dl>

      {/* Close Summary Breakdown */}
      {run.status === "closed" ? (
        <NaCloseSummary run={run} />
      ) : (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-3.5 text-center text-xs text-muted-foreground">
          This run has not been closed. Summary counts are written at close.
        </div>
      )}

      {/* Stored Exceptions Section */}
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <h3 className="font-display text-sm font-bold text-foreground">Exceptions on this run</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {open.length} open{run.status === "closed" ? " at close" : ""} · {resolved.length} resolved during run ·{" "}
              {warnings.length} warning(s)
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {open.length > 0 ? (
              <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-400">
                {open.length} open
              </span>
            ) : null}
            {warnings.length > 0 ? (
              <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-400">
                {warnings.length} warning(s)
              </span>
            ) : null}
          </div>
        </div>

        {exceptions.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>None stored on this run.</span>
          </div>
        ) : (
          <ul className="mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-1">
            {exceptions.map((row) => {
              const meta = exceptionMeta(row.exceptionType);
              const isBlocking = row.severity === "blocking";
              const isResolved = row.status === "resolved";

              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs transition-colors hover:bg-muted/30"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2">
                      {isBlocking ? (
                        <ShieldAlert className="size-4 shrink-0 text-red-600" />
                      ) : (
                        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                      )}
                      <span className="font-semibold text-foreground">{meta.title}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {meta.domain === "financial" ? "Financial" : "Operations"}
                      </span>
                      <span className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {meta.categoryLabel}
                      </span>
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          isBlocking
                            ? "bg-red-500/10 text-red-700 dark:text-red-400"
                            : "bg-amber-500/10 text-amber-800 dark:text-amber-400",
                        )}
                      >
                        {isBlocking ? "Blocker" : "Warning"}
                      </span>
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                          isResolved
                            ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {exceptionStatusLabel(row.status)}
                      </span>
                    </div>
                  </div>

                  <p className="mt-1.5 text-muted-foreground leading-relaxed">{row.message}</p>

                  {/* Fiscal Override History */}
                  {row.fiscalOverrideHistory.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {row.fiscalOverrideHistory.map((override, index) => (
                        <div
                          key={override.id}
                          className="rounded-xl border border-amber-300/80 bg-amber-50/80 p-2.5 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-200"
                          data-testid="night-audit-fiscal-override"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">
                              Fiscal Override #{index + 1}
                              {override.invalidatedAt ? null : " (active at close)"}
                            </span>
                            <span className="rounded-md border border-amber-300 bg-amber-100/70 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-200">
                              status: {override.fiscalStatus}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed">
                            Authorized: {dateTime(override.overriddenAt)} by{" "}
                            <strong>{override.overriddenBy ?? "—"}</strong> · {override.reason}
                          </p>
                          {override.invalidatedAt ? (
                            <p className="mt-1 text-[11px] font-medium text-destructive">
                              Invalidated: {dateTime(override.invalidatedAt)}
                              {override.invalidatedReason ? ` · ${override.invalidatedReason}` : ""}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Official Reports Links */}
      {links.length > 0 ? (
        <div
          className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs"
          data-testid="night-audit-run-report-links"
        >
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-3.5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-foreground">
                Reports for {formatNa1Date(run.businessDate)}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                View or export official business date reports for this run.
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {links.map((link) => (
              <Button
                key={link.id}
                asChild
                size="sm"
                variant="outline"
                className="h-9 justify-between rounded-xl px-3 text-xs font-semibold hover:border-primary/50 hover:bg-primary/5"
              >
                <Link
                  to={link.to}
                  search={
                    {
                      ...((link.search as Record<string, unknown> | undefined) ?? {}),
                      returnTo: "/restaurant/pms/night-audit",
                      returnToLabel: "Return to Night Audit",
                    } as never
                  }
                >
                  <span className="flex items-center gap-2">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span>{link.label}</span>
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                </Link>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
