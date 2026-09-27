import { Link } from "@tanstack/react-router";

import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { serializeRevenueSearch } from "@/packages/pms/lib/revenue/revenue-context";
import {
  DEMAND_CALENDAR_CLAMP_NOTE,
  DEMAND_CALENDAR_JUMP_DAYS,
  defaultDemandCalendarRange,
} from "@/packages/pms/lib/revenue/demand-calendar";
import { shiftRateCalendarRange } from "@/packages/pms/lib/revenue/rate-calendar";

export function DemandCalendarToolbar({
  context,
  businessDate,
  rangeClamped,
  onRangeChange,
}: {
  context: RevenueContext;
  businessDate: string;
  rangeClamped: boolean;
  onRangeChange: (fromDate: string, toDate: string) => void;
}) {
  const pickupSearch = serializeRevenueSearch("pickup-pace", context);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-[#251605]">
            Demand Calendar
          </h2>
          <p className="text-xs text-muted-foreground">
            Live occupancy and inventory by stay date and room type.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
            onClick={() => {
              const next = shiftRateCalendarRange(context.fromDate, context.toDate, -DEMAND_CALENDAR_JUMP_DAYS);
              onRangeChange(next.fromDate, next.toDate);
            }}
          >
            Previous
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
            onClick={() => {
              const today = defaultDemandCalendarRange(businessDate);
              onRangeChange(today.fromDate, today.toDate);
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
            onClick={() => {
              const next = shiftRateCalendarRange(context.fromDate, context.toDate, DEMAND_CALENDAR_JUMP_DAYS);
              onRangeChange(next.fromDate, next.toDate);
            }}
          >
            Next
          </button>
          <Link
            to="/restaurant/pms/rates-revenue"
            search={pickupSearch}
            className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
          >
            View Pickup & Pace
          </Link>
        </div>
      </div>
      {rangeClamped ? <p className="text-[10px] text-[#6B4A0A]">{DEMAND_CALENDAR_CLAMP_NOTE}</p> : null}
    </div>
  );
}
