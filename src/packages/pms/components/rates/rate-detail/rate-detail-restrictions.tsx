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
    <div className="space-y-3">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Min stay</dt>
          <dd className="font-medium text-[#251605]">{cell.restriction.minStay ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Max stay</dt>
          <dd className="font-medium text-[#251605]">{cell.restriction.maxStay ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">CTA</dt>
          <dd className="font-medium text-[#251605]">{cell.restriction.closedToArrival ? "Yes" : "No"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">CTD</dt>
          <dd className="font-medium text-[#251605]">{cell.restriction.closedToDeparture ? "Yes" : "No"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Stop sell</dt>
          <dd className="font-medium text-[#251605]">{cell.restriction.stopSell ? "Yes" : "No"}</dd>
        </div>
      </dl>
      <Link
        to="/restaurant/pms/rates-revenue"
        search={search}
        className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
      >
        Open Restrictions
      </Link>
    </div>
  );
}
