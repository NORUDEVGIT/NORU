import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PmsPropertySetupCard8Workspace } from "@/packages/pms/components/settings/pms-property-setup-card8-workspace";
import {
  CARD8_VALIDATION_HONESTY,
  CARD8_GOLIVE_HONESTY,
} from "@/packages/pms/lib/pms-property-setup-card8";
import {
  CARD8_SYSTEM_INFO_COPY,
  CARD8_VALIDATION_LIVE_RECOMPUTE,
  CARD8_VALIDATION_READY_RULE,
  type Card8ValidationIssue,
} from "@/packages/pms/lib/pms-property-setup-card8-validation";
import { getCard8Validation } from "@/packages/pms/lib/pms-property-setup-card8-validation.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

const CARD8_LIFECYCLE = ["Setup", "Validation", "Ready", "Go-Live", "Live"] as const;

function severityClass(severity: Card8ValidationIssue["severity"]) {
  if (severity === "critical") return "text-destructive";
  if (severity === "warning") return "text-[#9A6A12]";
  return "text-muted-foreground";
}

export function Card8ValidationTab({ restaurantId }: { restaurantId: string }) {
  const [issuesOpen, setIssuesOpen] = useState(false);
  const runValidation = useServerFn(getCard8Validation);
  const validation = useMutation({
    mutationFn: () => runValidation({ data: { restaurantId } }),
  });
  const report = validation.data;

  return (
    <>
      <PmsPropertySetupCard8Workspace
        lifecycle={
          <>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Property lifecycle
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {CARD8_LIFECYCLE.map((stage, index) => (
                <span
                  key={stage}
                  className={cn(
                    "inline-flex items-center gap-2 text-sm",
                    stage === "Validation" && report
                      ? "font-medium text-[#251605]"
                      : "text-muted-foreground",
                  )}
                >
                  {index > 0 ? <span aria-hidden="true">→</span> : null}
                  {stage}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This read-only result contributes to overall Card 8 readiness. It does not save,
              complete tasks or activate the property.
            </p>
          </>
        }
        validation={
          <section className="rounded-2xl border border-[#E6DCC8] bg-card p-5">
            <h3 className="font-display text-lg text-[#251605]">Validation results</h3>
            {!report ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Run Validation to recompute Cards 1–7 readiness.
              </p>
            ) : (
              <>
                <p
                  className={cn(
                    "mt-2 text-2xl font-semibold",
                    report.ready ? "text-emerald-700" : "text-destructive",
                  )}
                  data-testid="pms-card8-validation-readiness"
                >
                  {report.ready ? "READY" : "NOT READY"}
                </p>
                <p
                  className="mt-1 text-sm text-muted-foreground"
                  data-testid="pms-card8-validation-verdict"
                >
                  Aggregator: {report.verdict}
                  {report.reason ? ` — ${report.reason}` : ""}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Generated {new Date(report.generatedAt).toLocaleString()}
                </p>
              </>
            )}
          </section>
        }
        summary={
          <>
            <h3 className="font-display text-lg text-[#251605]">Status summary</h3>
            {!report ? (
              <p className="mt-2 text-sm text-muted-foreground">{CARD8_SYSTEM_INFO_COPY}</p>
            ) : (
              <dl className="mt-3 grid grid-cols-3 gap-3">
                {(
                  [
                    ["Critical", report.counts.critical],
                    ["Warnings", report.counts.warning],
                    ["Informational", report.counts.informational],
                  ] as const
                ).map(([label, count]) => (
                  <div key={label}>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 text-xl font-semibold text-[#251605]">{count}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{CARD8_VALIDATION_READY_RULE}</p>
          </>
        }
        status={
          <p className="text-sm text-muted-foreground">
            System Validation:{" "}
            {validation.isPending
              ? "Running…"
              : report
                ? `${report.verdict} · ${report.ready ? "READY" : "NOT READY"}`
                : "Not run"}
          </p>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {report ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIssuesOpen(true)}
                data-testid="pms-card8-view-issues"
              >
                View Issues ({report.issues.length})
              </Button>
            ) : null}
            <Button
              type="button"
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
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-[#D8CDBB] bg-card p-5">
            <p className="text-sm text-[#251605]">{CARD8_VALIDATION_HONESTY}</p>
            <p className="mt-2 text-sm text-muted-foreground">{CARD8_VALIDATION_LIVE_RECOMPUTE}</p>
            <p className="mt-2 text-sm text-muted-foreground">{CARD8_GOLIVE_HONESTY}</p>
          </div>

          {validation.isError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Validation failed:{" "}
              {validation.error instanceof Error
                ? validation.error.message
                : "Could not run System Validation."}
            </p>
          ) : null}

          {report ? (
            <div className="overflow-x-auto rounded-2xl border border-[#E6DCC8] bg-card">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="border-b border-[#E6DCC8] text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Card / Category</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">Critical</th>
                    <th className="px-4 py-3 font-medium">Warnings</th>
                    <th className="px-4 py-3 font-medium">Info</th>
                    <th className="px-4 py-3 font-medium">Configuration</th>
                  </tr>
                </thead>
                <tbody>
                  {report.summaries.map((summary) => (
                    <tr
                      key={summary.cardNumber}
                      className="border-b border-[#F0E8D8] last:border-0"
                    >
                      <td className="px-4 py-3">
                        Card {summary.cardNumber} · {summary.category.replace("_", " / ")}
                      </td>
                      <td className="px-4 py-3">
                        {summary.succeeded
                          ? summary.critical === 0
                            ? "PASS"
                            : "NEEDS ATTENTION"
                          : "UNAVAILABLE"}
                      </td>
                      <td className="px-4 py-3">{summary.critical}</td>
                      <td className="px-4 py-3">{summary.warning}</td>
                      <td className="px-4 py-3">{summary.informational}</td>
                      <td className="px-4 py-3">
                        {summary.href ? (
                          <a className="text-[#8A5A08] underline" href={summary.href}>
                            Fix Configuration
                          </a>
                        ) : (
                          <span className="text-muted-foreground">No safe destination</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </PmsPropertySetupCard8Workspace>

      <Sheet open={issuesOpen} onOpenChange={setIssuesOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>System Validation issues</SheetTitle>
            <SheetDescription>
              Live Card 1–7 blockers, warnings and informational notices.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            {report?.issues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No issues returned.</p>
            ) : (
              report?.issues.map((issue) => (
                <article key={issue.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-[#251605]">
                      Card {issue.cardNumber} · {issue.domain}
                    </p>
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wide",
                        severityClass(issue.severity),
                      )}
                    >
                      {issue.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{issue.message}</p>
                  {issue.href ? (
                    <Button asChild variant="outline" size="sm" className="mt-3">
                      <a href={issue.href}>Fix Configuration</a>
                    </Button>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
