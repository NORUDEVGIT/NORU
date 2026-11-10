import { ArrowRight } from "lucide-react";

import { formatNa1Date, summaryRoomUnitCount } from "@/packages/pms/lib/na1";
import { formatSummaryCount, summaryCount } from "@/packages/pms/lib/night-audit-workflow";
import { endOfDayStep, isEndOfDayStepId } from "@/packages/pms/lib/night-audit-steps";
import type { AuditSummary } from "@/packages/pms/lib/nightaudit.functions";
import { formatMoney } from "@/shared/lib/property-time";

/**
 * What close stored for one business date. Nothing is recomputed: an older
 * summary shows only the fields it was written with.
 */
export function NightAuditCloseSummary({
  summary,
  closedBy,
  closedAt,
  dateTime,
  currency,
  title = "Close record",
}: {
  summary: AuditSummary | null;
  closedBy: string | null;
  closedAt: string | null;
  dateTime: (value: string) => string;
  currency: string | null;
  title?: string;
}) {
  const previous = summary?.previousBusinessDate;
  const next = summary?.nextBusinessDate;
  if (!summary || !previous || !next) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="night-audit-close-summary-empty">
        No close summary was stored for this run.
      </p>
    );
  }
  const eod = summary.endOfDay;
  const money = (value: number | null | undefined) =>
    typeof value === "number"
      ? formatMoney(value, currency ?? eod?.dayFinance?.currency ?? "USD")
      : "—";
  const legacyWarnings = summaryCount(summary, "warnings");

  return (
    <section
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs"
      data-testid="night-audit-close-summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Closed by <span className="font-medium text-foreground">{closedBy ?? "—"}</span>
            {closedAt ? ` · ${dateTime(closedAt)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-1.5 text-xs font-semibold">
          <span className="font-mono text-foreground">{formatNa1Date(previous)}</span>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span className="font-mono text-foreground">{formatNa1Date(next)}</span>
        </div>
      </div>

      <dl className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="In-house room units"
          value={formatSummaryCount(summaryRoomUnitCount(summary) ?? null)}
        />
        <Fact label="Overstays" value={formatSummaryCount(summaryCount(summary, "overstays"))} />
        <Fact
          label="Blockers resolved"
          value={formatSummaryCount(
            eod ? eod.blockersResolved : summaryCount(summary, "blockingResolved"),
          )}
        />
        {eod ? (
          <Fact label="Information items" value={String(eod.informationCount)} />
        ) : legacyWarnings != null && legacyWarnings > 0 ? (
          <Fact label="Legacy information" value={String(legacyWarnings)} />
        ) : (
          <Fact
            label="Fiscal overrides"
            value={formatSummaryCount(summaryCount(summary, "fiscalOverrideCount"))}
          />
        )}
      </dl>

      {eod ? (
        <>
          <div className="mt-4" data-testid="night-audit-close-steps">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Steps
            </h3>
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
              {eod.steps
                .filter((step) => isEndOfDayStepId(step.id))
                .map((step) => (
                  <li
                    key={step.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span className="text-foreground">
                      {endOfDayStep(step.id).number}. {endOfDayStep(step.id).title}
                    </span>
                    <span className="text-muted-foreground">
                      Completed
                      {step.informationCount > 0 ? ` · ${step.informationCount} information` : ""}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="mt-4" data-testid="night-audit-close-cashier">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cashier
            </h3>
            <dl className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <Fact label="Open shifts at close" value={String(eod.cashier.openShifts)} />
              <Fact label="Closed shifts" value={String(eod.cashier.closedShifts)} />
              <Fact label="Expected cash" value={money(eod.cashier.expected)} />
              <Fact label="Counted cash" value={money(eod.cashier.counted)} />
              <Fact label="Variance" value={money(eod.cashier.variance)} />
            </dl>
          </div>

          {eod.dayFinance ? (
            <div className="mt-4" data-testid="night-audit-close-finance">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Day postings
              </h3>
              <dl className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                <Fact label="Room / stay" value={money(eod.dayFinance.charges.room)} />
                <Fact label="Package" value={money(eod.dayFinance.charges.package)} />
                <Fact label="Other charges" value={money(eod.dayFinance.charges.other)} />
                <Fact label="Tax" value={money(eod.dayFinance.charges.tax)} />
                <Fact label="Service charge" value={money(eod.dayFinance.charges.serviceCharge)} />
                <Fact label="Payments" value={money(eod.dayFinance.payments)} />
                <Fact label="Deposits" value={money(eod.dayFinance.deposits)} />
                <Fact label="Refunds" value={money(eod.dayFinance.refunds)} />
              </dl>
            </div>
          ) : null}

          <p className="mt-4 text-xs text-muted-foreground">
            Policy: open cashier shifts{" "}
            {eod.policy.openCashierShifts === "block" ? "must be closed" : "do not block"}
            {" · "}Fiscal overrides used: {eod.fiscal.overrides}
          </p>
        </>
      ) : (
        <LegacyBreakdown summary={summary} />
      )}

      {summary.taxByCurrency && summary.taxByCurrency.length > 0 ? (
        <ul
          className="mt-4 space-y-1.5 rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground"
          data-testid="night-audit-close-tax-summary"
        >
          {summary.taxByCurrency.map((row) => (
            <li key={row.currency} className="flex items-center justify-between">
              <span className="font-medium text-foreground">{row.currency}</span>
              <span>
                Tax {formatMoney(row.tax, row.currency)} · Service{" "}
                {formatMoney(row.serviceCharge, row.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Pre-redesign counts, exactly as stored. */
function LegacyBreakdown({ summary }: { summary: AuditSummary }) {
  const financial = typeof summary.financialBlockerCount === "number";
  const operational = typeof summary.operationalBlockerCount === "number";
  if (!financial && !operational) return null;
  return (
    <dl
      className="mt-4 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4"
      data-testid="night-audit-close-legacy"
    >
      {financial ? (
        <>
          <Fact
            label="Open drawers"
            value={formatSummaryCount(summaryCount(summary, "openDrawerCount"))}
          />
          <Fact
            label="Fiscal problems"
            value={formatSummaryCount(summaryCount(summary, "fiscalProblemCount"))}
          />
        </>
      ) : null}
      {operational ? (
        <>
          <Fact
            label="Unresolved arrivals"
            value={formatSummaryCount(summaryCount(summary, "unresolvedArrivalCount"))}
          />
          <Fact
            label="Room conflicts"
            value={formatSummaryCount(summaryCount(summary, "roomConflictCount"))}
          />
        </>
      ) : null}
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-display text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
