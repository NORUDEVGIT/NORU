import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { addDays } from "@/packages/pms/lib/reservation-dates";
import { formatInclusiveRangeLabel } from "@/packages/pms/lib/reservation-workspace/section-week";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

/** Same square icon button used for Filter, Refresh and Export. */
export const PMS_ICON_BUTTON =
  "relative size-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]";

/**
 * Monday–Sunday week chosen in Front Office or Reservations.
 * Kept in memory for this browser tab only, so the other module can open on the same week.
 */
type SharedWeek = { restaurantId: string; weekStart: string };
let sharedWeek: SharedWeek | null = null;

/** Monday of the week that contains `isoDate` (YYYY-MM-DD). Weeks start on Monday. */
export function mondayOf(isoDate: string): string {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(isoDate, delta);
}

export function readSharedWeekStart(restaurantId: string): string | null {
  return sharedWeek?.restaurantId === restaurantId ? sharedWeek.weekStart : null;
}

export function writeSharedWeekStart(restaurantId: string, dateInWeek: string) {
  const weekStart = mondayOf(dateInWeek);
  if (sharedWeek?.restaurantId === restaurantId && sharedWeek.weekStart === weekStart) return;
  sharedWeek = { restaurantId, weekStart };
}

/** `2–8 Nov 2026`, or with the month repeated when the week crosses a month. */
export function formatWeekLabel(monday: string): string {
  return formatInclusiveRangeLabel(monday, addDays(monday, 6));
}

/**
 * Operational day to open on. A 7-day view keeps the property business date when it
 * sits inside the shared week, so single-day filters (arrivals, departures) stay on
 * that date while the grid shows the whole Monday–Sunday week.
 */
export function initialWeekFocusDate(input: {
  today: string;
  initialFocusDate?: string;
  sharedMonday: string | null;
  weekAligned: boolean;
}): string {
  if (!input.weekAligned) return input.initialFocusDate ?? input.sharedMonday ?? input.today;
  const monday = input.sharedMonday ?? mondayOf(input.initialFocusDate ?? input.today);
  const sunday = addDays(monday, 6);
  const contains = (date: string | undefined): date is string =>
    Boolean(date) && date! >= monday && date! <= sunday;
  if (contains(input.initialFocusDate) && mondayOf(input.initialFocusDate) === monday) {
    return input.initialFocusDate;
  }
  if (contains(input.today)) return input.today;
  return monday;
}

/** Compact `‹  2–8 Nov 2026  ›` control. Arrows move a full week. Any picked date snaps to its week. */
export function WeekRangeControl({
  weekStart,
  days = 7,
  onShiftWeek,
  onPickDate,
}: {
  /** First day of the visible range. Null while the property business date is still loading. */
  weekStart: string | null;
  /** 7 keeps a Monday–Sunday label. 1, 14, and 30 label that many days from `weekStart`. */
  days?: number;
  onShiftWeek: (direction: -1 | 1) => void;
  /** The date the person picked. Callers snap a 7-day range to that date's Monday. */
  onPickDate: (isoDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const week = days === 7;
  const label = !weekStart
    ? "Loading…"
    : week
      ? formatWeekLabel(weekStart)
      : formatInclusiveRangeLabel(weekStart, addDays(weekStart, days - 1));
  return (
    <div
      className="inline-flex h-9 shrink-0 items-center rounded-md border border-[#DDD4C5] bg-white"
      data-testid="pms-week-control"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-r-none"
        aria-label={week ? "Previous week" : "Previous period"}
        disabled={!weekStart}
        onClick={() => onShiftWeek(-1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-8 min-w-[8.75rem] px-1.5 text-xs font-semibold tabular-nums text-[#251605] disabled:opacity-60"
            aria-label={week ? "Week" : "Date range"}
            disabled={!weekStart}
          >
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            {week ? "Any date in the week" : "Range start"}
            <Input
              type="date"
              aria-label={week ? "Date in week" : "Range start"}
              className="h-9 w-40"
              value={weekStart ?? ""}
              onChange={(event) => {
                if (!event.target.value) return;
                onPickDate(event.target.value);
                setOpen(false);
              }}
            />
          </label>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-l-none"
        aria-label={week ? "Next week" : "Next period"}
        disabled={!weekStart}
        onClick={() => onShiftWeek(1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

export function DaysRangeSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[6.75rem]" aria-label="Days" data-testid="pms-days-select">
        <SelectValue placeholder="Days" />
      </SelectTrigger>
      <SelectContent>
        {options.map(([id, label]) => (
          <SelectItem key={id} value={id}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
