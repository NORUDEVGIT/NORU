import { Link } from "@tanstack/react-router";
import { FileText, RefreshCw } from "lucide-react";

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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

export type NightAuditHistoryFilter = HistoryFilter;

const OTB_LABEL: Record<NightAuditOtbState, string> = {
  captured: "Captured",
  not_captured: "Not captured",
  unknown: "Unknown",
};

function statusTone(status: string): string {
  if (status === "closed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-800";
  if (status === "ready") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-amber-200 bg-amber-50 text-amber-900";
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
  const set = (patch: Partial<NightAuditHistoryFilter>) => onFilter({ ...filter, page: 1, ...patch });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card" data-testid="night-audit-history">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <input
          value={filter.search}
          onChange={(event) => set({ search: event.target.value })}
          placeholder="Search date (2026-10) or closer"
          aria-label="Search runs"
          className="h-9 min-w-40 flex-1 rounded-lg border border-input bg-background px-3 text-xs"
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={filter.from}
            onChange={(event) => set({ from: event.target.value })}
            aria-label="From business date"
            className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={filter.to}
            onChange={(event) => set({ to: event.target.value })}
            aria-label="To business date"
            className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          />
        </label>
        <select
          aria-label="Run status"
          value={filter.status}
          onChange={(event) => set({ status: event.target.value as NightAuditHistoryFilter["status"] })}
          className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          data-testid="night-audit-history-status"
        >
          <option value="all">All statuses</option>
          {HISTORY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {historyStatusLabel(status)}
            </option>
          ))}
        </select>
        <select
          aria-label="Closed by"
          value={filter.closedBy}
          onChange={(event) => set({ closedBy: event.target.value })}
          className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
        >
          <option value="">Anyone</option>
          {(data?.closers ?? []).map((closer) => (
            <option key={closer.id} value={closer.id}>
              {closer.name}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" variant="outline" onClick={() => onFilter(DEFAULT_HISTORY_FILTER)}>
          Clear
        </Button>
      </div>

      {loading ? (
        <p className="px-5 py-6 text-sm text-muted-foreground" data-testid="night-audit-history-loading">
          Loading history…
        </p>
      ) : error ? (
        <div className="px-5 py-6" data-testid="night-audit-history-unavailable">
          <p className="text-sm font-medium text-destructive">History unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">This is not an empty history. The stored runs could not be read.</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : !data || data.rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground" data-testid="night-audit-history-empty">
          {historyFiltersActive(filter) ? "No runs match filters." : "No runs yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Business date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Closed</th>
                <th className="px-3 py-2">Closed by</th>
                <th className="px-3 py-2 text-right">Fin. blockers</th>
                <th className="px-3 py-2 text-right">Ops blockers</th>
                <th className="px-3 py-2 text-right">Warnings</th>
                <th className="px-3 py-2">OTB</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((run) => (
                <tr
                  key={run.id}
                  className={cn(
                    "cursor-pointer border-t border-border hover:bg-muted/30",
                    selectedRunId === run.id && "bg-[#C89933]/10",
                  )}
                  onClick={() => onSelectRun(run.id)}
                >
                  <td className="px-3 py-2 font-medium">{formatNa1Date(run.businessDate)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", statusTone(run.status))}>
                      {historyStatusLabel(run.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{dateTime(run.startedAt)}</td>
                  <td className="px-3 py-2">{run.closedAt ? dateTime(run.closedAt) : "—"}</td>
                  <td className="px-3 py-2">{run.closedBy ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{count(run.summary?.financialBlockerCount)}</td>
                  <td className="px-3 py-2 text-right">{count(run.summary?.operationalBlockerCount)}</td>
                  <td className="px-3 py-2 text-right">{count(run.summary?.warnings)}</td>
                  <td className="px-3 py-2">{run.otb ? OTB_LABEL[run.otb] : "—"}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-muted-foreground">{run.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && !error ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>{data.total} run(s)</span>
          <select
            aria-label="Rows per page"
            value={filter.pageSize}
            onChange={(event) => onFilter({ ...filter, page: 1, pageSize: Number(event.target.value) as HistoryPageSize })}
            className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
          >
            {HISTORY_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
          <span>
            Page {data.page} of {pages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={data.page <= 1}
            onClick={() => onFilter({ ...filter, page: data.page - 1 })}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={data.page >= pages}
            onClick={() => onFilter({ ...filter, page: data.page + 1 })}
          >
            Next
          </Button>
        </div>
      ) : null}

      <Sheet
        open={Boolean(selectedRunId)}
        onOpenChange={(open) => {
          if (!open) onSelectRun("");
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl" data-testid="night-audit-run-detail">
          <SheetHeader>
            <SheetTitle>Night Audit run</SheetTitle>
          </SheetHeader>
          {runDetailLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading run…</p> : null}
          {!runDetailLoading && runDetailError ? (
            <p className="mt-4 text-sm text-destructive">{runDetailError}</p>
          ) : null}
          {!runDetailLoading && !runDetailError && runDetail ? (
            <RunDetail run={runDetail.run} exceptions={runDetail.exceptions} dateTime={dateTime} />
          ) : null}
          {!runDetailLoading && !runDetailError && !runDetail ? (
            <p className="mt-4 text-sm text-muted-foreground">This run was not found for this property.</p>
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
    <div className="mt-4 space-y-4 text-sm" data-testid="night-audit-run-quick-view">
      <dl className="grid grid-cols-2 gap-3">
        <Item label="Business date" value={formatNa1Date(run.businessDate)} />
        <Item label="Status" value={historyStatusLabel(run.status)} />
        <Item label="Started" value={`${dateTime(run.startedAt)}${run.startedBy ? ` · ${run.startedBy}` : ""}`} />
        <Item label="Closed" value={run.closedAt ? dateTime(run.closedAt) : "—"} />
        <Item label="Closed by" value={run.closedBy ?? "—"} />
        <Item label="OTB snapshot" value={run.otb ? OTB_LABEL[run.otb] : "—"} />
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Audit note</dt>
          <dd className="whitespace-pre-wrap">{run.notes?.trim() || "—"}</dd>
        </div>
      </dl>

      {run.status === "closed" ? <NaCloseSummary run={run} /> : (
        <p className="text-xs text-muted-foreground">This run has not been closed. Summary counts are written at close.</p>
      )}

      <div>
        <p className="text-xs font-medium text-[#251605]">Exceptions on this run</p>
        <p className="text-xs text-muted-foreground">
          {open.length} open{run.status === "closed" ? " at close" : ""} · {resolved.length} resolved during run ·{" "}
          {warnings.length} warning(s)
        </p>
        {exceptions.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">None stored on this run.</p>
        ) : (
          <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {exceptions.map((row) => {
              const meta = exceptionMeta(row.exceptionType);
              return (
                <li key={row.id} className="rounded-lg border border-border px-2 py-1.5 text-xs">
                  <span className="font-medium">{meta.title}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {meta.domain === "financial" ? "Financial" : "Operations"} · {meta.categoryLabel} ·{" "}
                    {row.severity === "blocking" ? "Blocker" : "Warning"} · {exceptionStatusLabel(row.status)}
                  </span>
                  <p className="text-muted-foreground">{row.message}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {links.length > 0 ? (
        <div data-testid="night-audit-run-report-links">
          <p className="text-xs font-medium text-[#251605]">Reports for {formatNa1Date(run.businessDate)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {links.map((link) => (
              <Button key={link.id} asChild size="sm" variant="outline">
                <Link
                  to={link.to}
                  search={
                    ({
                      ...((link.search as Record<string, unknown> | undefined) ?? {}),
                      returnTo: "/restaurant/pms/night-audit",
                      returnToLabel: "Return to Night Audit",
                    }) as never
                  }
                >
                  <FileText className="size-3.5" />
                  {link.label}
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
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-[#251605]">{value}</dd>
    </div>
  );
}
