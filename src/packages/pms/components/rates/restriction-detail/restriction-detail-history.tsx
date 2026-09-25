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
        <p className="text-xs text-muted-foreground">{RESTRICTION_CALENDAR_HISTORY_EMPTY}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row) => {
            const changed = restrictionChangedFields(row.previous, row.next);
            return (
              <li key={row.id} className="border-l-2 border-[#C89933]/50 pl-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {restrictionActionLabel(row.actionType)} · {new Date(row.createdAt).toLocaleString()}
                </p>
                <p className="text-xs text-[#251605]">
                  {changed.length === 0
                    ? "No field changes"
                    : changed
                        .map(
                          (field) =>
                            `${field}: ${formatRestrictionFieldValue(field, row.previous[field])} → ${formatRestrictionFieldValue(field, row.next[field])}`,
                        )
                        .join(" · ")}
                </p>
                <p className="text-[10px] text-muted-foreground">
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
        className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
      >
        View Full Restriction History
      </Link>
    </div>
  );
}
