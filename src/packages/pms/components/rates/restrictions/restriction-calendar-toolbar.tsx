import { Link } from "@tanstack/react-router";

import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { serializeRevenueSearch } from "@/packages/pms/lib/revenue/revenue-context";
import {
  RATE_CALENDAR_CLAMP_NOTE,
  RATE_CALENDAR_DEFAULT_DAYS,
  RATE_CALENDAR_MAX_COLUMNS,
  defaultRateCalendarRange,
  shiftIsoDate,
  shiftRateCalendarRange,
} from "@/packages/pms/lib/revenue/rate-calendar";

export function RestrictionCalendarToolbar({
  context,
  businessDate,
  rangeClamped,
  canViewRestrictions,
  onRangeChange,
}: {
  context: RevenueContext;
  businessDate: string;
  rangeClamped: boolean;
  canViewRestrictions: boolean;
  onRangeChange: (fromDate: string, toDate: string) => void;
}) {
  const week = RATE_CALENDAR_DEFAULT_DAYS;
  const applySearch = serializeRevenueSearch("apply-restriction", context);
  const historySearch = serializeRevenueSearch("restriction-history", context);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-[#251605]">
            Restriction Calendar
          </h2>
          <p className="text-xs text-muted-foreground">
            Operational restrictions by room type and rate plan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
            onClick={() => {
              const next = shiftRateCalendarRange(context.fromDate, context.toDate, -week);
              onRangeChange(next.fromDate, next.toDate);
            }}
          >
            Previous
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
            onClick={() => {
              const today = defaultRateCalendarRange(businessDate);
              onRangeChange(today.fromDate, today.toDate);
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
            onClick={() => {
              const next = shiftRateCalendarRange(context.fromDate, context.toDate, week);
              onRangeChange(next.fromDate, next.toDate);
            }}
          >
            Next
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
            onClick={() =>
              onRangeChange(context.fromDate, shiftIsoDate(context.fromDate, RATE_CALENDAR_MAX_COLUMNS - 1))
            }
          >
            Compare Dates
          </button>
          {canViewRestrictions ? (
            <>
              <Link
                to="/restaurant/pms/rates-revenue"
                search={applySearch}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
              >
                Apply Restriction
              </Link>
              <Link
                to="/restaurant/pms/rates-revenue"
                search={historySearch}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
              >
                Restriction History
              </Link>
            </>
          ) : null}
        </div>
      </div>
      {rangeClamped ? <p className="text-[10px] text-[#6B4A0A]">{RATE_CALENDAR_CLAMP_NOTE}</p> : null}
    </div>
  );
}
