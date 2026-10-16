import { Link } from "@tanstack/react-router";

import type { RestrictionHistoryRow } from "@/packages/pms/lib/revenue/restriction-change";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { serializeRevenueSearch } from "@/packages/pms/lib/revenue/revenue-context";
import {
  RESTRICTION_CALENDAR_HISTORY_EMPTY,
  formatRestrictionFieldValue,
  restrictionActionLabel,
  restrictionActorLabel,
  restrictionChangedFields,
  restrictionSourceLabel,
} from "@/packages/pms/lib/revenue/restriction-calendar";

export function RestrictionDetailHistory({
  rows,
  error,
  context,
}: {
  rows: RestrictionHistoryRow[];
  error: string | null;
  context: RevenueContext;
}) {
  const search = serializeRevenueSearch("restriction-history", context);

  return (
    <div className="space-y-3">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {rows.length === 0 && !error ? (
        <p className="text-xs text-[#756A5B]">{RESTRICTION_CALENDAR_HISTORY_EMPTY}</p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((row) => {
            const changed = restrictionChangedFields(row.previous, row.next);
            return (
              <li
                key={row.id}
                className="rounded-lg border border-[#E8E1D7] border-l-4 border-l-[#C89933] bg-white p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[#756A5B]">
                  {restrictionActionLabel(row.actionType)} ·{" "}
                  {new Date(row.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 text-xs font-medium text-[#251605]">
                  {changed.length === 0
                    ? "No field changes"
                    : changed
                        .map(
                          (field) =>
                            `${field}: ${formatRestrictionFieldValue(field, row.previous[field])} → ${formatRestrictionFieldValue(field, row.next[field])}`,
                        )
                        .join(" · ")}
                </p>
                <p className="mt-1 text-xs text-[#756A5B]">
                  {restrictionActorLabel(row)} · {restrictionSourceLabel(row.source)}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      <Link
        to="/restaurant/pms/rates-revenue"
        search={search}
        className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#FAF6F0]"
      >
        View Full Restriction History
      </Link>
    </div>
  );
}
