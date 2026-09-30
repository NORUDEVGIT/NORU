import { Link } from "@tanstack/react-router";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  History,
  Info,
  ShieldAlert,
} from "lucide-react";

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
    <div className="flex flex-col gap-3 rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-[#251605]">
            Restriction Calendar
          </h2>
          <p className="text-xs text-[#756A5B]">
            Operational restrictions by room type and rate plan.
          </p>
        </div>

        {rangeClamped ? (
          <span
            title={RATE_CALENDAR_CLAMP_NOTE}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8D5A7] bg-[#FBF6EA] px-3 py-1 text-xs font-medium text-[#6B4A0A]"
          >
            <Info className="size-3.5 shrink-0 text-[#8A641A]" />
            <span>Showing 14-day window</span>
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-[#DED7CD] bg-[#FAF6F0] p-0.5">
          <button
            type="button"
            title="Move window to previous period"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-[#251605] transition-colors hover:bg-white"
            onClick={() => {
              const next = shiftRateCalendarRange(context.fromDate, context.toDate, -week);
              onRangeChange(next.fromDate, next.toDate);
            }}
          >
            <ChevronLeft className="size-3.5 text-[#756A5B]" />
            <span>Previous Period</span>
          </button>
          <button
            type="button"
            title="Reset window to today"
            className="inline-flex h-8 items-center rounded-md border-x border-[#E8E1D7] px-3 text-xs font-semibold text-[#251605] transition-colors hover:bg-white"
            onClick={() => {
              const today = defaultRateCalendarRange(businessDate);
              onRangeChange(today.fromDate, today.toDate);
            }}
          >
            Today
          </button>
          <button
            type="button"
            title="Move window to next period"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-[#251605] transition-colors hover:bg-white"
            onClick={() => {
              const next = shiftRateCalendarRange(context.fromDate, context.toDate, week);
              onRangeChange(next.fromDate, next.toDate);
            }}
          >
            <span>Next Period</span>
            <ChevronRight className="size-3.5 text-[#756A5B]" />
          </button>
        </div>

        <button
          type="button"
          title="Expand window to compare 14 consecutive dates"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DED7CD] bg-white px-3 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#FAF6F0]"
          onClick={() =>
            onRangeChange(
              context.fromDate,
              shiftIsoDate(context.fromDate, RATE_CALENDAR_MAX_COLUMNS - 1),
            )
          }
        >
          <CalendarRange className="size-3.5 text-[#8A641A]" />
          <span>Compare Dates</span>
        </button>

        {canViewRestrictions ? (
          <>
            <Link
              to="/restaurant/pms/rates-revenue"
              search={historySearch}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DED7CD] bg-white px-3 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#FAF6F0]"
            >
              <History className="size-3.5 text-[#8A641A]" />
              <span>View Restriction History</span>
            </Link>
            <Link
              to="/restaurant/pms/rates-revenue"
              search={applySearch}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] shadow-sm transition-colors hover:bg-[#B5882D]"
            >
              <ShieldAlert className="size-3.5" />
              <span>Apply Restriction</span>
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
