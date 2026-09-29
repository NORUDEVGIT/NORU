import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";

import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { serializeRevenueSearch } from "@/packages/pms/lib/revenue/revenue-context";
import type { RevenueControlRestrictionRow } from "@/packages/pms/lib/revenue/revenue-control";

export function RestrictionAttention({
  rows,
  error,
  context,
  embedded = false,
}: {
  rows: RevenueControlRestrictionRow[];
  error: string | null;
  context: RevenueContext;
  embedded?: boolean;
}) {
  const visibleRows = rows.slice(0, 5);
  const viewAllSearch = serializeRevenueSearch("restrictions", context);

  const content = error ? (
    <p className="text-sm text-destructive">{error}</p>
  ) : visibleRows.length === 0 ? (
    <div className="flex items-center justify-between gap-2.5 rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F5] px-3.5 py-3 text-sm font-medium text-[#5A4833]">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="size-4.5 shrink-0 text-emerald-600" />
        <span>No restrictions require attention for this range.</span>
      </div>
      <Link
        to="/restaurant/pms/rates-revenue"
        search={viewAllSearch}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#8A641A] hover:text-[#251605]"
      >
        <span>View All</span>
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  ) : (
    <div className="space-y-2.5">
      <div className="w-full overflow-hidden rounded-lg border border-[#EFECE6]">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-[#DDD4C5] bg-[#FAF6F0] text-xs font-bold text-[#5A4833]">
            <tr>
              <th className="h-9 w-[22%] px-3">Date</th>
              <th className="h-9 w-[32%] px-2.5">Room / Plan</th>
              <th className="h-9 w-[28%] px-2.5">Restriction</th>
              <th className="h-9 w-[18%] px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFECE6]">
            {visibleRows.map((row) => (
              <tr
                key={`${row.ratePlanId}-${row.date}`}
                className="transition-colors hover:bg-[#FAF6F0]/60"
              >
                <td className="h-10 px-3 font-semibold text-[#251605]">{row.date}</td>
                <td
                  className="h-10 truncate px-2.5 text-[#251605]"
                  title={`${row.roomTypeName} · ${row.ratePlanCode}`}
                >
                  <span className="font-semibold">{row.roomTypeName}</span>
                  <span className="font-medium text-[#756A5B]"> · {row.ratePlanCode}</span>
                </td>
                <td className="h-10 px-2.5">
                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    {row.label}
                  </span>
                </td>
                <td className="h-10 px-3 text-right">
                  <Link
                    to="/restaurant/pms/rates-revenue"
                    search={serializeRevenueSearch("restrictions", {
                      ...context,
                      fromDate: row.date,
                      toDate: row.date,
                      roomTypeId: row.roomTypeId || context.roomTypeId,
                      ratePlanId: row.ratePlanId,
                    })}
                    className="font-semibold text-[#8A641A] hover:underline"
                  >
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {embedded ? (
        <div className="flex justify-end">
          <Link
            to="/restaurant/pms/rates-revenue"
            search={viewAllSearch}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A641A] hover:text-[#251605]"
          >
            <span>View Restrictions</span>
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-[#251605]">
          Restrictions Requiring Attention
        </h2>
        <Link
          to="/restaurant/pms/rates-revenue"
          search={viewAllSearch}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#8A641A] transition-colors hover:text-[#251605]"
        >
          <span>View Restrictions</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {content}
    </section>
  );
}
