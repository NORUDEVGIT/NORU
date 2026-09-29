import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import {
  HISTORY_EMPTY_COPY,
  type RevenueControlActivity,
} from "@/packages/pms/lib/revenue/revenue-control";
import {
  serializeRevenueSearch,
  type RevenueContext,
} from "@/packages/pms/lib/revenue/revenue-context";

function actionLabel(actionType: string): string {
  if (actionType === "bulk_rate_change") return "Bulk Rate Change";
  if (actionType === "reset_override") return "Reset Override";
  if (actionType === "copy_rate") return "Copy Rate";
  return "Rate Change";
}

/**
 * Renders recent rate change events backed by `hotel_rate_change_events`.
 */
export function RecentRateActivity({
  activity,
  error,
  context,
  embedded = false,
}: {
  activity: RevenueControlActivity;
  error: string | null;
  context?: RevenueContext;
  embedded?: boolean;
}) {
  const visibleRows = (activity.rows ?? []).slice(0, 4);
  const historySearch = context ? serializeRevenueSearch("rate-history", context) : undefined;

  const content = error ? (
    <p className="text-sm text-destructive">{error}</p>
  ) : !activity.available || activity.empty || visibleRows.length === 0 ? (
    <div className="flex items-center justify-between gap-2.5 rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F5] px-3.5 py-3 text-sm font-medium text-[#5A4833]">
      <span>{activity.empty ? HISTORY_EMPTY_COPY : "No recent rate changes recorded."}</span>
      <Link
        to="/restaurant/pms/rates-revenue"
        search={historySearch}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#8A641A] hover:text-[#251605]"
      >
        <span>History</span>
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  ) : (
    <div className="space-y-2.5">
      <ul className="divide-y divide-[#EFECE6] rounded-lg border border-[#EFECE6] bg-[#FAF8F5]/50">
        {visibleRows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-[#FAF8F5]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#251605]">
                {actionLabel(row.actionType)}
                {row.ratePlanCode ? (
                  <span className="font-medium text-[#5A4833]"> · {row.ratePlanCode}</span>
                ) : null}
                {row.roomTypeName ? (
                  <span className="font-medium text-[#756A5B]"> · {row.roomTypeName}</span>
                ) : null}
              </p>
              <p className="mt-0.5 truncate text-xs font-medium text-[#756A5B]">
                {new Date(row.createdAt).toLocaleDateString()}{" "}
                {new Date(row.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {row.reason ? ` · ${row.reason}` : ""}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-[#EFECE6] px-2 py-1 text-xs font-bold text-[#5A4833]">
              {row.stayDate}
            </span>
          </li>
        ))}
      </ul>
      {embedded ? (
        <div className="flex justify-end">
          <Link
            to="/restaurant/pms/rates-revenue"
            search={historySearch}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A641A] hover:text-[#251605]"
          >
            <span>View Rate History</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : null}
    </div>
  );

  if (embedded) {
    return <div className="mt-3">{content}</div>;
  }

  return (
    <section className="flex flex-col rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-[#251605]">Recent Rate Activity</h2>
        <Link
          to="/restaurant/pms/rates-revenue"
          search={historySearch}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#8A641A] transition-colors hover:text-[#251605]"
        >
          <span>View Rate History</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {content}
    </section>
  );
}
