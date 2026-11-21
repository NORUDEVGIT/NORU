import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";

import { PmsPropertySetupCard8Workspace } from "@/packages/pms/components/settings/pms-property-setup-card8-workspace";
import {
  CARD8_SYSTEM_INFO_COPY,
  CARD8_VALIDATION_READY_RULE,
  type Card8ValidationCategory,
  type Card8ValidationIssue,
  type Card8ValidationSeverity,
  type Card8ValidationSummary,
} from "@/packages/pms/lib/pms-property-setup-card8-validation";
import { getCard8Validation } from "@/packages/pms/lib/pms-property-setup-card8-validation.functions";
import { Button } from "@/shared/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

const CARD8_LIFECYCLE = ["Setup", "Validation", "Ready", "Go-Live", "Live"] as const;

const AREA_ORDER: readonly string[] = [
  "property",
  "rooms",
  "financial",
  "guest",
  "organization",
  "connectivity",
  "security_data",
  "system",
];

const AREA_LABELS: Record<Card8ValidationCategory, string> = {
  property: "Property",
  rooms: "Rooms",
  financial: "Financial",
  guest: "Guest",
  organization: "Organization",
  connectivity: "Connectivity",
  security_data: "Security & Data",
  system: "System",
};

type SeverityFilter = "all" | Card8ValidationSeverity;

const controlClass =
  "h-9 rounded-md border-[#D6CDBF] bg-white text-sm text-[#251605] shadow-none";

function areaLabel(category: string) {
  if (category in AREA_LABELS) return AREA_LABELS[category as Card8ValidationCategory];
  return category.replaceAll("_", " ");
}

function areaStatus(summary: Card8ValidationSummary) {
  if (!summary.succeeded) return "UNAVAILABLE";
  if (summary.critical === 0) return "Ready";
  return "NEEDS ATTENTION";
}

function statusClass(status: string) {
  if (status === "Ready") return "bg-emerald-50 text-emerald-800";
  if (status === "NEEDS ATTENTION") return "bg-red-50 text-red-800";
  return "bg-[#F4EDE0] text-[#9A6A12]";
}

function severityLabel(severity: Card8ValidationSeverity) {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Warning";
  return "Informational";
}

function severityBadgeClass(severity: Card8ValidationSeverity) {
  if (severity === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "warning") return "border-[#E6D3A8] bg-[#FBF6EA] text-[#9A6A12]";
  return "border-[#E6E1D8] bg-[#F7F4EE] text-[#5C5346]";
}

function issueCountLabel(count: number) {
  return `${count} ${count === 1 ? "issue" : "issues"}`;
}

function countPhrase(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function issueTally(issues: readonly Card8ValidationIssue[]) {
  let critical = 0;
  let warning = 0;
  let informational = 0;
  for (const issue of issues) {
    if (issue.severity === "critical") critical += 1;
    else if (issue.severity === "warning") warning += 1;
    else informational += 1;
  }
  const parts: { key: string; text: string; critical?: boolean }[] = [];
  if (critical > 0) {
    parts.push({ key: "critical", text: countPhrase(critical, "critical", "critical"), critical: true });
  }
  if (warning > 0) parts.push({ key: "warning", text: countPhrase(warning, "warning") });
  if (informational > 0) {
    parts.push({ key: "informational", text: countPhrase(informational, "informational", "informational") });
  }
  return parts;
}

function groupIssues(issues: readonly Card8ValidationIssue[]) {
  const buckets = new Map<string, Card8ValidationIssue[]>();
  for (const issue of issues) {
    const list = buckets.get(issue.category);
    if (list) list.push(issue);
    else buckets.set(issue.category, [issue]);
  }
  const known = AREA_ORDER.filter((key) => buckets.has(key));
  const extra = [...buckets.keys()].filter((key) => !AREA_ORDER.includes(key));
  return [...known, ...extra].map((key) => {
    const rows = buckets.get(key) ?? [];
    return {
      key,
      label: areaLabel(key),
      issues: rows,
      hasCritical: rows.some((issue) => issue.severity === "critical"),
    };
  });
}

export function Card8ValidationTab({ restaurantId }: { restaurantId: string }) {
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [area, setArea] = useState("all");
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const runValidation = useServerFn(getCard8Validation);
  const validation = useMutation({
    mutationFn: () => runValidation({ data: { restaurantId } }),
  });
  const report = validation.data;

  useEffect(() => {
    setGroupOpen({});
  }, [report?.generatedAt]);

  const areaOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];
    for (const summary of report?.summaries ?? []) {
      if (seen.has(summary.category)) continue;
      seen.add(summary.category);
      options.push({ value: summary.category, label: areaLabel(summary.category) });
    }
    for (const issue of report?.issues ?? []) {
      if (seen.has(issue.category)) continue;
      seen.add(issue.category);
      options.push({ value: issue.category, label: areaLabel(issue.category) });
    }
    return options;
  }, [report]);

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (report?.issues ?? []).filter((issue) => {
      if (severity !== "all" && issue.severity !== severity) return false;
      if (area !== "all" && issue.category !== area) return false;
      if (!query) return true;
      const haystack = `${issue.message} ${issue.domain} ${areaLabel(issue.category)} card ${issue.cardNumber}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [area, report?.issues, search, severity]);

  const groups = useMemo(() => {
    const visibleIds = new Set(filteredIssues.map((issue) => issue.id));
    return groupIssues(report?.issues ?? [])
      .map((group) => ({
        ...group,
        visible: group.issues.filter((issue) => visibleIds.has(issue.id)),
      }))
      .filter((group) => group.visible.length > 0);
  }, [filteredIssues, report?.issues]);

  const criticalCount = report?.counts.critical ?? 0;
  const clearOfCriticals = Boolean(report) && criticalCount === 0;

  return (
    <>
      <PmsPropertySetupCard8Workspace
        fullWidth
        lifecycle={
          <>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
              Property lifecycle
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {CARD8_LIFECYCLE.map((stage, index) => {
                const current = stage === "Validation";
                return (
                  <span
                    key={stage}
                    className={cn(
                      "inline-flex items-center gap-2 text-sm",
                      current ? "font-medium text-[#251605]" : "text-[#6B6458]",
                    )}
                  >
                    {index > 0 ? <span aria-hidden="true">→</span> : null}
                    <span className={current ? "border-b border-[#C89933] pb-px" : undefined}>
                      {stage}
                    </span>
                  </span>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-[#6B6458]">
              This read-only result contributes to overall Card 8 readiness. It does not save,
              complete tasks or activate the property.
            </p>
          </>
        }
        validation={
          report ? (
            <section
              className="flex overflow-hidden rounded-md border border-[#E6E1D8] bg-white"
              data-testid="pms-card8-validation-readiness"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "w-1 shrink-0",
                  criticalCount > 0 && "bg-red-700",
                  clearOfCriticals && report.ready && "bg-emerald-700",
                  clearOfCriticals && !report.ready && "bg-[#C89933]",
                )}
              />
              <div className="min-w-0 px-4 py-3">
                <h3
                  className={cn(
                    "text-sm font-semibold",
                    criticalCount > 0 && "text-red-800",
                    clearOfCriticals && report.ready && "text-emerald-800",
                    clearOfCriticals && !report.ready && "text-[#251605]",
                  )}
                >
                  {criticalCount > 0 ? "Action required" : "System ready for operation"}
                </h3>
                <p className="mt-0.5 text-sm text-[#5C5346]">
                  {criticalCount > 0
                    ? "Resolve critical validation issues before Go-Live."
                    : "No critical validation issues detected."}
                </p>
                <p className="mt-1.5 text-[11px] text-[#6B6458]" data-testid="pms-card8-validation-verdict">
                  Generated {new Date(report.generatedAt).toLocaleString()}
                  {" · "}
                  {report.verdict}
                  {report.reason ? ` — ${report.reason}` : ""}
                  {" · "}
                  {report.ready ? "READY" : "NOT READY"}
                </p>
                <p className="mt-1 text-[11px] text-[#8A8175]">{CARD8_VALIDATION_READY_RULE}</p>
              </div>
            </section>
          ) : (
            <section className="rounded-md border border-[#E6E1D8] bg-white px-4 py-3">
              <h3 className="text-sm font-semibold text-[#251605]">Awaiting validation</h3>
              <p className="mt-0.5 text-sm text-[#5C5346]">
                Run Validation to recompute Cards 1–7 readiness.
              </p>
              <p className="mt-1.5 text-[11px] text-[#6B6458]">{CARD8_SYSTEM_INFO_COPY}</p>
              <p className="mt-1 text-[11px] text-[#8A8175]">{CARD8_VALIDATION_READY_RULE}</p>
            </section>
          )
        }
        status={
          <p className="text-sm text-[#5C5346]">
            System Validation:{" "}
            {validation.isPending
              ? "Running…"
              : report
                ? `${report.verdict} · ${report.ready ? "READY" : "NOT READY"}`
                : "Not run"}
          </p>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {report ? (
              <Button
                type="button"
                variant="outline"
                className="border-[#D6CDBF] bg-white text-[#251605] shadow-none hover:bg-[#F7F4EE]"
                onClick={() => setIssuesOpen(true)}
                data-testid="pms-card8-view-issues"
              >
                View Issues ({report.issues.length})
              </Button>
            ) : null}
            <Button
              type="button"
              className="bg-[#C89933] font-medium text-[#251605] shadow-none hover:bg-[#C89933]/90"
              onClick={() => validation.mutate()}
              disabled={validation.isPending}
              data-testid="pms-card8-system-validation-action"
            >
              {validation.isPending
                ? "Running…"
                : report
                  ? "Run Validation Again"
                  : "Run Validation"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi
              label="Critical"
              value={report ? String(report.counts.critical) : "—"}
              tone={!report ? "neutral" : report.counts.critical > 0 ? "critical" : "ready"}
            />
            <Kpi
              label="Warnings"
              value={report ? String(report.counts.warning) : "—"}
              tone={report ? "warning" : "neutral"}
            />
            <Kpi
              label="Informational"
              value={report ? String(report.counts.informational) : "—"}
              tone="neutral"
            />
            <Kpi
              label="Last validated"
              value={report ? new Date(report.generatedAt).toLocaleString() : "Not run"}
              tone="neutral"
              compact
            />
          </dl>
          {validation.isError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              Validation failed:{" "}
              {validation.error instanceof Error
                ? validation.error.message
                : "Could not run System Validation."}
            </p>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[#251605]">Validation by area</h3>
            {report ? (
              <div className="overflow-x-auto rounded-md border border-[#E6E1D8] bg-white">
                <table
                  className="w-full min-w-[40rem] text-left text-sm"
                  data-testid="pms-card8-validation-areas"
                >
                  <thead className="border-b border-[#E6E1D8] bg-[#FBF8F2] text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Area</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Critical</th>
                      <th className="px-3 py-2 text-right font-medium">Warnings</th>
                      <th className="px-3 py-2 text-right font-medium">Info</th>
                      <th className="px-3 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.summaries.map((summary) => {
                      const status = areaStatus(summary);
                      return (
                        <tr key={summary.cardNumber} className="border-b border-[#F0EBE3] last:border-0">
                          <td className="px-3 py-2">
                            <div className="font-medium text-[#251605]">{areaLabel(summary.category)}</div>
                            <div className="text-[11px] text-[#8A8175]">Card {summary.cardNumber}</div>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "inline-flex items-center px-1.5 py-0.5 text-[11px] font-semibold tracking-wide",
                                statusClass(status),
                              )}
                            >
                              {status}
                            </span>
                            {summary.error ? (
                              <p className="mt-1 max-w-[16rem] text-[11px] text-[#6B6458]">{summary.error}</p>
                            ) : null}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right tabular-nums",
                              summary.critical > 0 ? "font-semibold text-red-800" : "text-[#5C5346]",
                            )}
                          >
                            {summary.critical}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right tabular-nums",
                              summary.warning > 0 ? "font-medium text-[#9A6A12]" : "text-[#5C5346]",
                            )}
                          >
                            {summary.warning}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#5C5346]">
                            {summary.informational}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {summary.href ? (
                              <a
                                className="inline-flex h-7 items-center border border-[#D6CDBF] bg-white px-2.5 text-xs font-medium text-[#251605] hover:border-[#C89933]"
                                href={summary.href}
                                title="Fix Configuration"
                              >
                                Review
                              </a>
                            ) : (
                              <span className="text-xs text-[#8A8175]">No safe destination</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-md border border-[#E6E1D8] bg-white px-4 py-6 text-sm text-[#5C5346]">
                Run Validation to recompute Cards 1–7 readiness.
              </div>
            )}
          </section>
        </div>
      </PmsPropertySetupCard8Workspace>

      <Sheet open={issuesOpen} onOpenChange={setIssuesOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden bg-[#F7F4EE] p-0 sm:max-w-xl">
          <SheetHeader className="space-y-3 border-b border-[#E6E1D8] bg-white px-4 py-4 pr-12 text-left">
            <div>
              <SheetTitle className="font-sans text-base font-semibold text-[#251605]">
                Validation issues
              </SheetTitle>
              <SheetDescription className="text-xs text-[#6B6458]">
                Current blockers, warnings and notices.
                {report
                  ? filteredIssues.length === report.issues.length
                    ? ` ${issueCountLabel(report.issues.length)}.`
                    : ` Showing ${filteredIssues.length} of ${issueCountLabel(report.issues.length)}.`
                  : ""}
              </SheetDescription>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_11rem]">
              <div>
                <label
                  htmlFor="card8-issue-search"
                  className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#6B6458]"
                >
                  Search
                </label>
                <Input
                  id="card8-issue-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search issues"
                  className={controlClass}
                />
              </div>
              <div>
                <label
                  htmlFor="card8-issue-severity"
                  className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#6B6458]"
                >
                  Severity
                </label>
                <Select value={severity} onValueChange={(value) => setSeverity(value as SeverityFilter)}>
                  <SelectTrigger id="card8-issue-severity" className={controlClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="informational">Informational</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label
                  htmlFor="card8-issue-area"
                  className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#6B6458]"
                >
                  Area
                </label>
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger id="card8-issue-area" className={controlClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {areaOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {!report || report.issues.length === 0 ? (
              <p className="rounded-md border border-[#E6E1D8] bg-white px-3 py-4 text-sm text-[#5C5346]">
                No issues returned.
              </p>
            ) : groups.length === 0 ? (
              <p className="rounded-md border border-[#E6E1D8] bg-white px-3 py-4 text-sm text-[#5C5346]">
                No issues match these filters.
              </p>
            ) : (
              groups.map((group) => {
                const open = group.key in groupOpen ? groupOpen[group.key] : group.hasCritical;
                const tally = issueTally(group.visible);
                const visibleCritical = group.visible.some((issue) => issue.severity === "critical");
                return (
                  <Collapsible
                    key={group.key}
                    open={open}
                    onOpenChange={(next) =>
                      setGroupOpen((current) => ({ ...current, [group.key]: next }))
                    }
                    className="overflow-hidden rounded-md border border-[#E6E1D8] bg-white"
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                        aria-label={`${open ? "Collapse" : "Expand"} ${group.label}`}
                      >
                        {visibleCritical ? (
                          <span aria-hidden="true" className="h-8 w-1 shrink-0 bg-red-700" />
                        ) : (
                          <span aria-hidden="true" className="h-8 w-1 shrink-0 bg-[#E6E1D8]" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-[#251605]">{group.label}</span>
                          <span className="mt-0.5 block text-xs text-[#6B6458]">
                            {tally.map((part, index) => (
                              <span key={part.key}>
                                {index > 0 ? " · " : null}
                                <span className={part.critical ? "font-medium text-red-800" : undefined}>
                                  {part.text}
                                </span>
                              </span>
                            ))}
                          </span>
                        </span>
                        <ChevronDown
                          className={cn("size-4 shrink-0 text-[#6B6458] transition-transform", open && "rotate-180")}
                          aria-hidden="true"
                        />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-t border-[#F0EBE3]">
                      <ul>
                        {group.visible.map((issue) => (
                          <li
                            key={issue.id}
                            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-[#F0EBE3] px-3 py-2 last:border-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-[#251605]">{issue.message}</p>
                              <p className="mt-0.5 text-[11px] text-[#6B6458]">
                                {issue.domain} · Card {issue.cardNumber}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  severityBadgeClass(issue.severity),
                                )}
                              >
                                {severityLabel(issue.severity)}
                              </span>
                              {issue.href ? (
                                <a
                                  href={issue.href}
                                  className="inline-flex h-7 items-center border border-[#D6CDBF] bg-white px-2 text-xs font-medium text-[#251605] hover:border-[#C89933]"
                                >
                                  Fix Configuration
                                </a>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Kpi({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string;
  value: string;
  tone: "critical" | "ready" | "warning" | "neutral";
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border border-[#E6E1D8] bg-white px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">{label}</dt>
      <dd
        className={cn(
          "mt-1 font-semibold tabular-nums",
          compact ? "break-words text-sm leading-snug text-[#251605]" : "text-lg",
          !compact && tone === "critical" && "text-red-800",
          !compact && tone === "ready" && "text-emerald-800",
          !compact && tone === "warning" && "text-[#9A6A12]",
          !compact && tone === "neutral" && "text-[#5C5346]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
