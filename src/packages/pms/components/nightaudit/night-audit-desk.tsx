import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  MoreHorizontal,
  ShieldAlert,
} from "lucide-react";

import { NaClosePanel, NaCloseSummary } from "@/packages/pms/components/nightaudit/na1-panels";
import {
  formatNa1Date,
  remainingBlockerCount,
  type NaBlockerRow,
  type NaBlockerState,
} from "@/packages/pms/lib/na1";
import { paginateRows, NIGHT_AUDIT_TAB_COPY } from "@/packages/pms/lib/night-audit-shell";
import type { AuditException, NightAuditRunRow } from "@/packages/pms/lib/nightaudit.functions";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

const STATE_LABEL: Record<NaBlockerState, string> = {
  pass: "Completed",
  block: "Issues",
  na: "N/A",
  unavailable: "Unavailable",
};

function severityLabel(state: NaBlockerState): string {
  if (state === "block") return "High";
  if (state === "unavailable") return "Unavailable";
  if (state === "na") return "N/A";
  return "Low";
}

function KpiCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: "green" | "red" | "amber" | "slate";
}) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-800",
    red: "bg-red-50 text-red-800",
    amber: "bg-amber-50 text-amber-900",
    slate: "bg-slate-100 text-slate-800",
  }[tone];
  return (
    <article className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className={cn("flex size-7 items-center justify-center rounded-lg", toneClass)}>{icon}</span>
      </div>
      <p className="mt-2 font-display text-lg font-semibold text-[#251605]">{value}</p>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
    </article>
  );
}

function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span>
        Page {page} of {pages}
      </span>
      <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}

function BlockerQuickView({ row }: { row: NaBlockerRow }) {
  return (
    <div className="space-y-3 text-sm" data-testid="night-audit-blocker-quick-view">
      <p className="font-medium text-[#251605]">{row.label}</p>
      <p className="text-muted-foreground">{row.detail}</p>
      <p className="text-xs">
        Status {STATE_LABEL[row.state]}
        {row.count != null ? ` · ${row.count} open` : ""}
      </p>
      {row.clear.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {row.clear.map((link) => (
            <Button key={`${row.id}-${link.label}`} asChild size="sm" variant="outline">
              <Link to={link.to as never} search={link.search as never}>
                {link.label}
              </Link>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No owner action from Night Audit.</p>
      )}
    </div>
  );
}

function RunQuickView({
  run,
  exceptions,
  dateTime,
}: {
  run: NightAuditRunRow;
  exceptions: AuditException[];
  dateTime: (value: string) => string;
}) {
  return (
    <div className="space-y-4" data-testid="night-audit-run-quick-view">
      <div>
        <p className="text-xs text-muted-foreground">Business date</p>
        <p className="font-medium">{formatNa1Date(run.businessDate)}</p>
        <p className="text-xs capitalize text-muted-foreground">{run.status}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Started {dateTime(run.startedAt)}
          {run.startedBy ? ` · ${run.startedBy}` : ""}
        </p>
        {run.closedAt ? (
          <p className="text-xs text-muted-foreground">
            Closed {dateTime(run.closedAt)}
            {run.closedBy ? ` · ${run.closedBy}` : ""}
          </p>
        ) : null}
      </div>
      <NaCloseSummary run={run} />
      <div>
        <p className="text-xs font-medium text-[#251605]">Stored exceptions</p>
        {exceptions.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">None stored on this run.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {exceptions.map((row) => (
              <li key={row.id} className="rounded-lg border border-border px-2 py-1.5 text-xs">
                <span className="font-medium">{row.exceptionType}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {row.severity} · {row.status}
                </span>
                <p className="text-muted-foreground">{row.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function NightAuditDesk({
  tab,
  businessDate,
  blockers,
  warningCount,
  closed,
  role,
  phone,
  busy,
  note,
  closeError,
  onNoteChange,
  onConfirm,
  runs,
  selectedRunId,
  runDetail,
  runDetailLoading,
  dateTime,
  moduleSearch,
  onSelectRun,
}: {
  tab: "control" | "pre-audit" | "reconciliation" | "history";
  businessDate: string;
  blockers: NaBlockerRow[];
  warningCount: number;
  closed: boolean;
  role: string;
  phone: boolean;
  busy: boolean;
  note: string;
  closeError: string | null;
  onNoteChange: (value: string) => void;
  onConfirm: () => void;
  runs: NightAuditRunRow[];
  selectedRunId: string | null;
  runDetail: { run: NightAuditRunRow; exceptions: AuditException[] } | null;
  runDetailLoading: boolean;
  dateTime: (value: string) => string;
  moduleSearch: string;
  onSelectRun: (runId: string) => void;
}) {
  const [desktop, setDesktop] = useState(false);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<"all" | NaBlockerState>("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [tab, query, severity, status, moduleSearch]);

  const filteredBlockers = useMemo(() => {
    const needle = `${query} ${moduleSearch}`.trim().toLowerCase();
    return blockers.filter((row) => {
      if (severity !== "all" && row.state !== severity) return false;
      if (!needle) return true;
      return `${row.label} ${row.detail}`.toLowerCase().includes(needle);
    });
  }, [blockers, moduleSearch, query, severity]);

  const filteredRuns = useMemo(() => {
    const needle = `${query} ${moduleSearch}`.trim().toLowerCase();
    return runs.filter((run) => {
      if (status !== "all" && run.status !== status) return false;
      if (!needle) return true;
      return `${run.businessDate} ${run.closedBy ?? ""} ${run.startedBy ?? ""} ${run.id}`
        .toLowerCase()
        .includes(needle);
    });
  }, [moduleSearch, query, runs, status]);

  const blockerPage = paginateRows(filteredBlockers, page);
  const runPage = paginateRows(filteredRuns, page);
  const selectedBlocker = blockers.find((row) => row.id === selectedBlockerId) ?? null;
  const blocking = remainingBlockerCount(blockers);
  const liveChecks = blockers.filter((row) => row.state !== "unavailable");
  const passed = liveChecks.filter((row) => row.state === "pass" || row.state === "na").length;
  const openShift = blockers.find((row) => row.id === "open_shift");
  const closedRuns = runs.filter((run) => run.status === "closed").length;

  function selectBlocker(row: NaBlockerRow) {
    setSelectedBlockerId(row.id);
    setMobileOpen(true);
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
    />
  );

  const blockerRail = selectedBlocker ? <BlockerQuickView row={selectedBlocker} /> : null;

  return (
    <div className="space-y-4">
      {tab === "control" || tab === "pre-audit" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Business date"
            value={formatNa1Date(businessDate)}
            detail="Current business date"
            icon={<CalendarDays className="size-3.5" />}
            tone="slate"
          />
          <KpiCard
            label={tab === "control" ? "Close status" : "Live checks"}
            value={tab === "control" ? (closed ? "Closed" : blocking > 0 ? "Blocked" : "Open") : `${passed}/${liveChecks.length}`}
            detail={tab === "control" ? (closed ? "This date is closed" : "From the live blocker board") : "Pass or N/A of live rows"}
            icon={<ClipboardList className="size-3.5" />}
            tone={closed || blocking === 0 ? "green" : "amber"}
          />
          <KpiCard
            label="Blocking issues"
            value={String(blocking)}
            detail="Must be clear before close"
            icon={<ShieldAlert className="size-3.5" />}
            tone={blocking > 0 ? "red" : "green"}
          />
          <KpiCard
            label={tab === "control" ? "Warnings" : "Open hotel drawers"}
            value={
              tab === "control"
                ? String(warningCount)
                : openShift?.state === "na"
                  ? "N/A"
                  : String(openShift?.count ?? 0)
            }
            detail={tab === "control" ? "Stored warnings do not block close" : "Hotel drawer, not restaurant cash"}
            icon={<AlertTriangle className="size-3.5" />}
            tone="amber"
          />
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="Runs loaded"
            value={String(runs.length)}
            detail="Latest stored runs"
            icon={<CalendarDays className="size-3.5" />}
            tone="slate"
          />
          <KpiCard
            label="Closed"
            value={String(closedRuns)}
            detail="Status closed in this list"
            icon={<ClipboardList className="size-3.5" />}
            tone="green"
          />
          <KpiCard
            label="Not closed"
            value={String(runs.length - closedRuns)}
            detail="Open or ready rows"
            icon={<AlertTriangle className="size-3.5" />}
            tone="amber"
          />
        </div>
      ) : null}

      {tab === "reconciliation" ? (
        <section className="rounded-2xl border border-border bg-card p-5" data-testid="night-audit-reconciliation-hold">
          <h2 className="font-display text-lg text-[#251605]">Reconciliation</h2>
          <p className="mt-2 text-sm text-muted-foreground">{NIGHT_AUDIT_TAB_COPY.reconciliation}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Unpaid folios and open hotel drawers still block close from Control Center. They are not a company, city-ledger, or tax report.
          </p>
        </section>
      ) : null}

      {tab === "control" || tab === "pre-audit" || tab === "history" ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === "history" ? "Search date, person, or run" : "Search checks"}
                aria-label={tab === "history" ? "Search runs" : "Search checks"}
                className="h-9 min-w-40 flex-1 rounded-lg border border-input bg-background px-3 text-xs"
              />
              {tab === "history" ? (
                <select
                  aria-label="Run status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
                >
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="ready">Ready</option>
                  <option value="closed">Closed</option>
                </select>
              ) : (
                <select
                  aria-label="Check state"
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as "all" | NaBlockerState)}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
                >
                  <option value="all">All states</option>
                  <option value="block">Blocking</option>
                  <option value="pass">Pass</option>
                  <option value="na">N/A</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setSeverity("all");
                  setStatus("all");
                }}
              >
                Clear
              </Button>
            </div>
            <div className="overflow-x-auto">
              {tab === "history" ? (
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Business date</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Started</th>
                      <th className="px-3 py-2">Closed</th>
                      <th className="px-3 py-2">Closed by</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {runPage.rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-muted-foreground">
                          No audit history yet.
                        </td>
                      </tr>
                    ) : (
                      runPage.rows.map((run) => (
                        <tr
                          key={run.id}
                          className={cn(
                            "cursor-pointer border-t border-border hover:bg-muted/30",
                            selectedRunId === run.id && "bg-[#C89933]/10",
                          )}
                          onClick={() => onSelectRun(run.id)}
                        >
                          <td className="px-3 py-2 font-medium">{formatNa1Date(run.businessDate)}</td>
                          <td className="px-3 py-2 capitalize">{run.status}</td>
                          <td className="px-3 py-2">{dateTime(run.startedAt)}</td>
                          <td className="px-3 py-2">{run.closedAt ? dateTime(run.closedAt) : "—"}</td>
                          <td className="px-3 py-2">{run.closedBy ?? "—"}</td>
                          <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" className="rounded-md p-1 hover:bg-muted" aria-label={`Actions for ${run.businessDate}`}>
                                  <MoreHorizontal className="size-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => onSelectRun(run.id)}>View run</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Check</th>
                      <th className="px-3 py-2">Severity</th>
                      <th className="px-3 py-2">Open items</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {blockerPage.rows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={cn(
                          "cursor-pointer border-t border-border hover:bg-muted/30",
                          selectedBlockerId === row.id && "bg-[#C89933]/10",
                        )}
                        onClick={() => selectBlocker(row)}
                      >
                        <td className="px-3 py-2">
                          <span className="mr-2 text-muted-foreground">{(blockerPage.page - 1) * 10 + index + 1}</span>
                          {row.label}
                        </td>
                        <td className="px-3 py-2">{severityLabel(row.state)}</td>
                        <td className="px-3 py-2">{row.count == null ? "—" : row.count}</td>
                        <td className="px-3 py-2">{STATE_LABEL[row.state]}</td>
                        <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="rounded-md p-1 hover:bg-muted" aria-label={`Actions for ${row.label}`}>
                                <MoreHorizontal className="size-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => selectBlocker(row)}>View details</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <Pager
              page={tab === "history" ? runPage.page : blockerPage.page}
              pages={tab === "history" ? runPage.pages : blockerPage.pages}
              onPage={setPage}
            />
          </section>

          <aside className="hidden space-y-4 xl:block">
            {tab === "history" ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                {runDetailLoading ? <p className="text-sm text-muted-foreground">Loading run…</p> : null}
                {!runDetailLoading && runDetail ? (
                  <RunQuickView run={runDetail.run} exceptions={runDetail.exceptions} dateTime={dateTime} />
                ) : null}
                {!runDetailLoading && !runDetail ? (
                  <p className="text-sm text-muted-foreground">Select a run to view the stored record.</p>
                ) : null}
              </div>
            ) : (
              <>
                {blockerRail ? <div className="rounded-2xl border border-border bg-card p-4">{blockerRail}</div> : null}
                {tab === "control" ? closePanel : null}
              </>
            )}
          </aside>
        </div>
      ) : null}

      {tab === "control" ? <div className="xl:hidden">{closePanel}</div> : null}

      <Sheet open={!desktop && mobileOpen && tab !== "history"} onOpenChange={setMobileOpen}>
        <SheetContent className="xl:hidden">
          <SheetHeader>
            <SheetTitle>Check</SheetTitle>
          </SheetHeader>
          {selectedBlocker ? <BlockerQuickView row={selectedBlocker} /> : null}
        </SheetContent>
      </Sheet>

      <Sheet
        open={!desktop && tab === "history" && Boolean(selectedRunId)}
        onOpenChange={(open) => {
          if (!open) onSelectRun("");
        }}
      >
        <SheetContent className="xl:hidden">
          <SheetHeader>
            <SheetTitle>Night audit run</SheetTitle>
          </SheetHeader>
          {runDetailLoading ? <p className="text-sm text-muted-foreground">Loading run…</p> : null}
          {runDetail ? <RunQuickView run={runDetail.run} exceptions={runDetail.exceptions} dateTime={dateTime} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
