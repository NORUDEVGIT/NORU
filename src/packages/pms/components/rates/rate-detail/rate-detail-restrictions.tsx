import { Link } from "@tanstack/react-router";

import type { RateCalendarCell } from "@/packages/pms/lib/revenue/rate-calendar";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { serializeRevenueSearch } from "@/packages/pms/lib/revenue/revenue-context";

export function RateDetailRestrictions({
  cell,
  context,
}: {
  cell: RateCalendarCell;
  context: RevenueContext;
}) {
  const search = serializeRevenueSearch("restrictions", {
    ...context,
    fromDate: cell.date,
    toDate: cell.date,
    roomTypeId: cell.roomTypeId,
    ratePlanId: cell.ratePlanId,
  });

  return (
    <div className="space-y-4">
      <dl className="divide-y divide-[#E8E1D7] rounded-xl border border-[#DDD4C5] bg-white px-4 py-1 text-sm">
        <div className="flex justify-between gap-3 py-2.5">
          <dt className="text-xs font-medium text-[#756A5B]">Min stay</dt>
          <dd className="font-semibold text-[#251605]">{cell.restriction.minStay ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3 py-2.5">
          <dt className="text-xs font-medium text-[#756A5B]">Max stay</dt>
          <dd className="font-semibold text-[#251605]">{cell.restriction.maxStay ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3 py-2.5">
          <dt className="text-xs font-medium text-[#756A5B]">CTA</dt>
          <dd className="font-semibold text-[#251605]">
            {cell.restriction.closedToArrival ? "Yes" : "No"}
          </dd>
        </div>
        <div className="flex justify-between gap-3 py-2.5">
          <dt className="text-xs font-medium text-[#756A5B]">CTD</dt>
          <dd className="font-semibold text-[#251605]">
            {cell.restriction.closedToDeparture ? "Yes" : "No"}
          </dd>
        </div>
        <div className="flex justify-between gap-3 py-2.5">
          <dt className="text-xs font-medium text-[#756A5B]">Stop sell</dt>
          <dd className="font-semibold text-[#251605]">
            {cell.restriction.stopSell ? "Yes" : "No"}
          </dd>
        </div>
      </dl>
      <Link
        to="/restaurant/pms/rates-revenue"
        search={search}
        className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#FAF6F0]"
      >
        View Restrictions
      </Link>
    </div>
  );
}
