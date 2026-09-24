import { Link } from "@tanstack/react-router";

import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { serializeRevenueSearch } from "@/packages/pms/lib/revenue/revenue-context";
import type { RevenueControlRestrictionRow } from "@/packages/pms/lib/revenue/revenue-control";

export function RestrictionAttention({
  rows,
  error,
  context,
}: {
  rows: RevenueControlRestrictionRow[];
  error: string | null;
  context: RevenueContext;
}) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Restrictions Requiring Attention</h2>
      <p className="text-[10px] text-muted-foreground">Read-only view of applied hotel_rate_restrictions.</p>
      {error ? (
        <p className="mt-3 text-xs text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No restrictions in this range.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[10px]">
            <thead className="border-b border-[#E8E1D7] bg-[#F8F5F0] text-[9px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-semibold">Date</th>
                <th className="px-2 py-2 font-semibold">Room type</th>
                <th className="px-2 py-2 font-semibold">Rate plan</th>
                <th className="px-2 py-2 font-semibold">Restriction</th>
                <th className="px-2 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.ratePlanId}-${row.date}`} className="border-b border-[#E8E1D7]/80">
                  <td className="px-2 py-2">{row.date}</td>
                  <td className="px-2 py-2">{row.roomTypeName}</td>
                  <td className="px-2 py-2">{row.ratePlanCode}</td>
                  <td className="px-2 py-2">{row.label}</td>
                  <td className="px-2 py-2">
                    <Link
                      to="/restaurant/pms/rates-revenue"
                      search={serializeRevenueSearch("restrictions", {
                        ...context,
                        fromDate: row.date,
                        toDate: row.date,
                        roomTypeId: row.roomTypeId || context.roomTypeId,
                        ratePlanId: row.ratePlanId,
                      })}
                      className="font-medium text-[#8B651D] hover:underline"
                    >
                      Review Restriction
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
