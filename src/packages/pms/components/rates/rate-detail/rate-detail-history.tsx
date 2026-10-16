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
    <div className="space-y-4">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {rows.length === 0 && !error ? (
        <p className="text-xs text-[#756A5B]">{RATE_CALENDAR_HISTORY_EMPTY}</p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-[#DDD4C5] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8A641A]">
                {row.actionType.replaceAll("_", " ")} · {new Date(row.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#251605]">
                {money(row.previousEffectiveRate)} → {money(row.newEffectiveRate)}
              </p>
              <p className="mt-0.5 text-xs text-[#756A5B]">
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
        className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#FAF6F0]"
      >
        View Rate History
      </Link>
    </div>
  );
}
