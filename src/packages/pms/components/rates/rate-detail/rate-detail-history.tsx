import { Link } from "@tanstack/react-router";

import { RATE_CALENDAR_HISTORY_EMPTY } from "@/packages/pms/lib/revenue/rate-calendar";
import type { RateChangeHistoryRow } from "@/packages/pms/lib/revenue/rate-change";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { serializeRevenueSearch } from "@/packages/pms/lib/revenue/revenue-context";

export function RateDetailHistory({
  rows,
  error,
  context,
  money,
}: {
  rows: RateChangeHistoryRow[];
  error: string | null;
  context: RevenueContext;
  money: (value: number) => string;
}) {
  const search = serializeRevenueSearch("rate-history", context);

  return (
    <div className="space-y-3">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {rows.length === 0 && !error ? (
        <p className="text-xs text-muted-foreground">{RATE_CALENDAR_HISTORY_EMPTY}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="border-l-2 border-[#C89933]/50 pl-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {row.actionType.replaceAll("_", " ")} · {new Date(row.createdAt).toLocaleString()}
              </p>
              <p className="text-xs text-[#251605]">
                {money(row.previousEffectiveRate)} → {money(row.newEffectiveRate)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {row.source}
                {row.reason ? ` · ${row.reason}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
      <Link
        to="/restaurant/pms/rates-revenue"
        search={search}
        className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
      >
        View full Rate History
      </Link>
    </div>
  );
}
