import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { formatNa1Date } from "@/packages/pms/lib/na1";
import { NIGHT_AUDIT_TAB_COPY, paginateRows } from "@/packages/pms/lib/night-audit-shell";
import {
  DEFAULT_EXCEPTION_FILTER,
  EXCEPTION_CATEGORY_LABEL,
  FINANCIAL_EXCEPTION_CATEGORIES,
  OPERATIONS_EXCEPTION_CATEGORIES,
  exceptionCounts,
  exceptionDefaultSource,
  exceptionFilterForFocus,
  exceptionMeta,
  exceptionStatusLabel,
  filterExceptions,
  type ExceptionFilter,
} from "@/packages/pms/lib/night-audit-workflow";
import type { AuditException } from "@/packages/pms/lib/nightaudit.functions";
import { Button } from "@/shared/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

function Kpi({ label, value, tone }: { label: string; value: number; tone: "red" | "amber" | "slate" | "green" }) {
  const toneClass = {
    red: "text-red-800",
    amber: "text-amber-900",
    slate: "text-[#251605]",
    green: "text-emerald-800",
  }[tone];
  return (
    <article className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-lg font-semibold", toneClass)}>{value}</p>
    </article>
  );
}

export function NightAuditExceptionQueue({
  exceptions,
  businessDate,
  checkedAt,
  runClosed,
  focus,
  moduleSearch,
  dateTime,
}: {
  exceptions: AuditException[];
  businessDate: string;
  checkedAt: string | null;
  runClosed: boolean;
  focus?: string | undefined;
  moduleSearch: string;
  dateTime: (value: string) => string;
}) {
  const [filter, setFilter] = useState<ExceptionFilter>(() => exceptionFilterForFocus(focus));
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => setFilter(exceptionFilterForFocus(focus)), [focus]);
  useEffect(() => setPage(1), [filter, moduleSearch]);

  const counts = exceptionCounts(exceptions);
  const rows = useMemo(
    () => filterExceptions(exceptions, { ...filter, search: `${filter.search} ${moduleSearch}`.trim() }),
    [exceptions, filter, moduleSearch],
  );
  const current = paginateRows(rows, page);
  const selected = exceptions.find((row) => row.id === selectedId) ?? null;
  const categories =
    filter.domain === "financial"
      ? FINANCIAL_EXCEPTION_CATEGORIES
      : filter.domain === "operations"
        ? OPERATIONS_EXCEPTION_CATEGORIES
        : [...FINANCIAL_EXCEPTION_CATEGORIES, ...OPERATIONS_EXCEPTION_CATEGORIES];
  const set = (patch: Partial<ExceptionFilter>) => setFilter((prev) => ({ ...prev, ...patch }));

  return (
    <div className="space-y-4" data-testid="night-audit-exceptions">
      <p className="text-sm text-muted-foreground">{NIGHT_AUDIT_TAB_COPY.exceptions}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="night-audit-exception-kpis">
        <Kpi label="Blocking" value={counts.blocking} tone={counts.blocking > 0 ? "red" : "green"} />
        <Kpi label="Warnings" value={counts.warnings} tone={counts.warnings > 0 ? "amber" : "green"} />
        <Kpi label="Open" value={counts.open} tone="slate" />
        <Kpi label="Resolved" value={counts.resolved} tone="slate" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <input
            value={filter.search}
            onChange={(event) => set({ search: event.target.value })}
            placeholder="Search exceptions"
            aria-label="Search exceptions"
            className="h-9 min-w-40 flex-1 rounded-lg border border-input bg-background px-3 text-xs"
          />
          <select
            aria-label="Status"
            value={filter.status}
            onChange={(event) => set({ status: event.target.value as ExceptionFilter["status"] })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All statuses</option>
          </select>
          <select
            aria-label="Severity"
            value={filter.severity}
            onChange={(event) => set({ severity: event.target.value as ExceptionFilter["severity"] })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="all">All severities</option>
            <option value="blocking">Blocker</option>
            <option value="warning">Warning</option>
          </select>
          <select
            aria-label="Domain"
            value={filter.domain}
            onChange={(event) => set({ domain: event.target.value as ExceptionFilter["domain"], category: "all" })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="all">All domains</option>
            <option value="financial">Financial</option>
            <option value="operations">Operations</option>
          </select>
          <select
            aria-label="Category"
            value={filter.category}
            onChange={(event) => set({ category: event.target.value as ExceptionFilter["category"] })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {EXCEPTION_CATEGORY_LABEL[category]}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="outline" onClick={() => setFilter(DEFAULT_EXCEPTION_FILTER)}>
            Clear
          </Button>
        </div>

        {exceptions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground" data-testid="night-audit-exceptions-none">
            No issues recorded for this business date.
          </p>
        ) : current.rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No exceptions match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Issue</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Opened</th>
                  <th className="px-3 py-2">Last checked</th>
                  <th className="px-3 py-2">Resolved at</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {current.rows.map((row) => {
                  const meta = exceptionMeta(row.exceptionType);
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "cursor-pointer border-t border-border hover:bg-muted/30",
                        selectedId === row.id && "bg-[#C89933]/10",
                      )}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            row.severity === "blocking"
                              ? "border-red-200 bg-red-50 text-red-800"
                              : "border-amber-200 bg-amber-50 text-amber-900",
                          )}
                        >
                          {row.severity === "blocking" ? "Blocker" : "Warning"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {meta.domain === "financial" ? "Financial" : "Operations"} · {meta.categoryLabel}
                      </td>
                      <td className="max-w-[320px] px-3 py-2">
                        <span className="font-medium">{meta.title}</span>
                        <p className="truncate text-muted-foreground">{row.message}</p>
                      </td>
                      <td className="px-3 py-2">{meta.ownerModule}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.referenceType ? `${row.referenceType.replaceAll("_", " ")}` : "—"}
                      </td>
                      <td className="px-3 py-2">{exceptionStatusLabel(row.status)}</td>
                      <td className="px-3 py-2">{row.createdAt ? dateTime(row.createdAt) : "—"}</td>
                      <td className="px-3 py-2">{checkedAt && !runClosed ? dateTime(checkedAt) : "—"}</td>
                      <td className="px-3 py-2">{row.resolvedAt ? dateTime(row.resolvedAt) : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedId(row.id)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {current.pages > 1 ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span>
              Page {current.page} of {current.pages}
            </span>
            <Button type="button" size="sm" variant="outline" disabled={current.page <= 1} onClick={() => setPage(current.page - 1)}>
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={current.page >= current.pages}
              onClick={() => setPage(current.page + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </section>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="night-audit-exception-detail">
          <SheetHeader>
            <SheetTitle>Exception</SheetTitle>
          </SheetHeader>
          {selected ? (
            <ExceptionDetail
              row={selected}
              businessDate={businessDate}
              checkedAt={runClosed ? null : checkedAt}
              dateTime={dateTime}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ExceptionDetail({
  row,
  businessDate,
  checkedAt,
  dateTime,
}: {
  row: AuditException;
  businessDate: string;
  checkedAt: string | null;
  dateTime: (value: string) => string;
}) {
  const meta = exceptionMeta(row.exceptionType);
  const source = row.status === "open" ? (row.source ?? exceptionDefaultSource(row.exceptionType, businessDate)) : null;
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2 py-0.5">
          {row.severity === "blocking" ? "Blocker" : "Warning"}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5">{exceptionStatusLabel(row.status)}</span>
      </div>
      <div>
        <p className="font-medium text-[#251605]">{meta.title}</p>
        <p className="mt-1 text-muted-foreground">{row.message}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <Field label="Business date" value={formatNa1Date(businessDate)} />
        <Field label="Source domain" value={`${meta.domain === "financial" ? "Financial" : "Operations"} · ${meta.categoryLabel}`} />
        <Field label="Source reference" value={row.referenceType ? row.referenceType.replaceAll("_", " ") : "—"} />
        <Field label="Detected at" value={row.createdAt ? dateTime(row.createdAt) : "—"} />
        <Field label="Last checked" value={checkedAt ? dateTime(checkedAt) : "—"} />
        <Field label="Resolved at" value={row.resolvedAt ? dateTime(row.resolvedAt) : "—"} />
        <Field label="Resolved in" value={meta.ownerModule} />
      </dl>
      {row.severity === "blocking" && row.status === "open" ? (
        <p className="text-xs text-muted-foreground">
          Blockers clear automatically once {meta.ownerModule} corrects the source record and Night Audit is rechecked.
        </p>
      ) : null}
      {source ? (
        <Button asChild>
          <Link to={source.route as never} search={(source.search ?? {}) as never}>
            <ExternalLink className="size-4" />
            Open Source
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-[#251605]">{value}</dd>
    </div>
  );
}
