import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import {
  RATE_CALENDAR_DEFAULT_DAYS,
  defaultRateCalendarRange,
  shiftRateCalendarRange,
} from "@/packages/pms/lib/revenue/rate-calendar";
import type { RateRevenueExtraButtonGroup } from "../rate-revenue-shell-slots";

export function rateCalendarWindowGroup({
  context,
  businessDate,
  rangeClamped,
  onRangeChange,
}: {
  context: RevenueContext;
  businessDate: string;
  rangeClamped: boolean;
  onRangeChange: (fromDate: string, toDate: string) => void;
}): RateRevenueExtraButtonGroup {
  const week = RATE_CALENDAR_DEFAULT_DAYS;
  return {
    id: "rate-calendar-window",
    label: rangeClamped ? "Calendar Window · 14-day limit" : "Calendar Window",
    buttons: [
      {
        id: "previous",
        label: "Previous",
        onSelect: () => {
          const next = shiftRateCalendarRange(context.fromDate, context.toDate, -week);
          onRangeChange(next.fromDate, next.toDate);
        },
      },
      {
        id: "today",
        label: "Today",
        onSelect: () => {
          const today = defaultRateCalendarRange(businessDate);
          onRangeChange(today.fromDate, today.toDate);
        },
      },
      {
        id: "next",
        label: "Next",
        onSelect: () => {
          const next = shiftRateCalendarRange(context.fromDate, context.toDate, week);
          onRangeChange(next.fromDate, next.toDate);
        },
      },
    ],
  };
}
