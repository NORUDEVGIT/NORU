import { useState, type ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, SlidersHorizontal, TriangleAlert } from "lucide-react";

import { addDays } from "@/packages/pms/lib/reservation-dates";
import {
  DEFAULT_CALENDAR_DISPLAY,
  type CalendarDensity,
  type CalendarDisplayOptions,
} from "@/packages/pms/lib/reservation-workspace/booking-calendar";
import { getReservationCalendar } from "@/packages/pms/lib/reservation-workspace/calendar.server";
import { getReservationExceptions } from "@/packages/pms/lib/reservation-workspace/exceptions.server";
import type {
  CalendarHorizon,
  CalendarMode,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

const PILL_BUTTON =
  "h-9 rounded-full border-[#e9dfd0] bg-white text-sm font-semibold text-[#4a2c1a] shadow-none hover:bg-[#f5ead0]";

const ICON_BUTTON =
  "relative size-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]";

function IconBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 justify-center rounded-full bg-[#C89933] px-1 text-[10px] font-semibold leading-4 text-[#251605]">
      {count}
    </span>
  );
}

/* ---------- Display options owned by the Reservation Desk ---------- */

/** How the Booking Calendar is drawn (set from the desk's Display menu). */
export type CalendarViewState = {
  mode: CalendarMode;
  density: CalendarDensity;
  display: CalendarDisplayOptions;
  showUnassigned: boolean;
  building: string;
};

export const DEFAULT_CALENDAR_VIEW: CalendarViewState = {
  mode: "room",
  density: "standard",
  display: DEFAULT_CALENDAR_DISPLAY,
  showUnassigned: true,
  building: "",
};

/** Which optional columns the reservation table shows. */
export type TableColumns = {
  nights: boolean;
  adults: boolean;
  children: boolean;
  source: boolean;
  ratePlan: boolean;
  total: boolean;
};

export const DEFAULT_TABLE_COLUMNS: TableColumns = {
  nights: true,
  adults: false,
  children: false,
  source: true,
  ratePlan: true,
  total: true,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-b border-[#efe7d8] px-4 py-3 last:border-b-0">
      <p className="text-xs font-bold text-[#4a2c1a]">{title}</p>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-[#4a2c1a] hover:bg-[#faf7f1]">
      {label}
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
    </label>
  );
}

/**
 * Display menu. Table layout: choose which columns show.
 * Calendar layout: building, room / room type rows, density, and what the bars show.
 */
export function DeskDisplayMenu({
  layout,
  calendarView,
  onCalendarViewChange,
  columns,
  onColumnsChange,
  iconOnly = false,
  quick,
}: {
  layout: "table" | "calendar";
  calendarView: CalendarViewState;
  onCalendarViewChange: (next: CalendarViewState) => void;
  columns: TableColumns;
  onColumnsChange: (next: TableColumns) => void;
  iconOnly?: boolean;
  /** Status and room type, so the toolbar can keep a single Filter button. */
  quick?: {
    status: string;
    onStatus: (value: string) => void;
    statusOptions: Array<[string, string]>;
    roomTypeId: string;
    onRoomType: (value: string) => void;
    roomTypeOptions: Array<[string, string]>;
  };
}) {
  const [open, setOpen] = useState(false);

  const displayChanged = (
    Object.keys(DEFAULT_CALENDAR_DISPLAY) as Array<keyof CalendarDisplayOptions>
  ).some((key) => calendarView.display[key] !== DEFAULT_CALENDAR_DISPLAY[key]);

  const calendarChanges =
    (calendarView.building.trim() ? 1 : 0) +
    (calendarView.mode !== "room" ? 1 : 0) +
    (calendarView.density !== "standard" ? 1 : 0) +
    (displayChanged || !calendarView.showUnassigned ? 1 : 0);

  const tableChanges = (Object.keys(DEFAULT_TABLE_COLUMNS) as Array<keyof TableColumns>).filter(
    (key) => columns[key] !== DEFAULT_TABLE_COLUMNS[key],
  ).length;

  const quickChanges = quick
    ? (quick.status !== "all" ? 1 : 0) + (quick.roomTypeId !== "all" ? 1 : 0)
    : 0;

  const changes = (layout === "calendar" ? calendarChanges : tableChanges) + quickChanges;

  function patchCalendar(patch: Partial<CalendarViewState>) {
    onCalendarViewChange({ ...calendarView, ...patch });
  }

  function patchColumn(key: keyof TableColumns, value: boolean) {
    onColumnsChange({ ...columns, [key]: value });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {iconOnly ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={ICON_BUTTON}
            aria-label={layout === "calendar" ? "Calendar filters and display" : "Table display"}
            title={layout === "calendar" ? "Calendar filters and display" : "Table display"}
            data-testid="reservation-desk-display-button"
          >
            <SlidersHorizontal className="size-4" />
            <IconBadge count={changes} />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className={cn(PILL_BUTTON, "gap-2 px-4")}
            data-testid="reservation-desk-display-button"
          >
            <SlidersHorizontal className="size-4 text-[#c9a24a]" />
            Display
            {changes > 0 ? (
              <span className="rounded-full bg-[#c9a24a] px-2 text-[11px] font-extrabold text-[#2b1a10]">
                {changes}
              </span>
            ) : null}
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="max-h-[75vh] w-[320px] overflow-y-auto rounded-2xl border-[#e9dfd0] p-0 shadow-[0_8px_24px_rgba(74,44,26,0.15)]"
      >
        <div className="flex items-center justify-between border-b border-[#efe7d8] px-4 py-3">
          <p className="text-sm font-bold text-[#4a2c1a]">
            {layout === "calendar" ? "Calendar display" : "Table display"}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-[#8C6D23]"
            disabled={changes === 0}
            onClick={() =>
              layout === "calendar"
                ? onCalendarViewChange(DEFAULT_CALENDAR_VIEW)
                : onColumnsChange(DEFAULT_TABLE_COLUMNS)
            }
          >
            Reset
          </Button>
        </div>

        {quick ? (
          <Section title="Reservation">
            <div className="grid gap-2">
              <Select value={quick.status} onValueChange={quick.onStatus}>
                <SelectTrigger className="h-9" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {quick.statusOptions.map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={quick.roomTypeId} onValueChange={quick.onRoomType}>
                <SelectTrigger className="h-9" aria-label="Room type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {quick.roomTypeOptions.map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>
        ) : null}

        {layout === "table" ? (
          <Section title="Columns">
            <div className="-mx-2">
              <Toggle
                label="Nights"
                checked={columns.nights}
                onChange={(value) => patchColumn("nights", value)}
              />
              <Toggle
                label="Adults"
                checked={columns.adults}
                onChange={(value) => patchColumn("adults", value)}
              />
              <Toggle
                label="Children"
                checked={columns.children}
                onChange={(value) => patchColumn("children", value)}
              />
              <Toggle
                label="Source"
                checked={columns.source}
                onChange={(value) => patchColumn("source", value)}
              />
              <Toggle
                label="Rate plan"
                checked={columns.ratePlan}
                onChange={(value) => patchColumn("ratePlan", value)}
              />
              <Toggle
                label="Total amount"
                checked={columns.total}
                onChange={(value) => patchColumn("total", value)}
              />
            </div>
          </Section>
        ) : (
          <>
            <Section title="Building">
              <Input
                className="h-9"
                value={calendarView.building}
                onChange={(event) => patchCalendar({ building: event.target.value })}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="Optional"
                aria-label="Building filter"
              />
            </Section>

            <Section title="Layout">
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={calendarView.mode}
                  onValueChange={(value) => patchCalendar({ mode: value as CalendarMode })}
                >
                  <SelectTrigger className="h-9" aria-label="Calendar mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="room">Room view</SelectItem>
                    <SelectItem value="room_type">Room type view</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={calendarView.density}
                  onValueChange={(value) => patchCalendar({ density: value as CalendarDensity })}
                >
                  <SelectTrigger className="h-9" aria-label="Calendar density">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="spacious">Spacious</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Section>

            <Section title="Show on calendar">
              <div className="-mx-2">
                <Toggle
                  label="Guest name"
                  checked={calendarView.display.guestName}
                  onChange={(value) =>
                    patchCalendar({ display: { ...calendarView.display, guestName: value } })
                  }
                />
                <Toggle
                  label="Confirmation number"
                  checked={calendarView.display.confirmationNumber}
                  onChange={(value) =>
                    patchCalendar({
                      display: { ...calendarView.display, confirmationNumber: value },
                    })
                  }
                />
                <Toggle
                  label="Housekeeping status"
                  checked={calendarView.display.housekeepingStatus}
                  onChange={(value) =>
                    patchCalendar({
                      display: { ...calendarView.display, housekeepingStatus: value },
                    })
                  }
                />
                <Toggle
                  label="Room status"
                  checked={calendarView.display.roomStatus}
                  onChange={(value) =>
                    patchCalendar({ display: { ...calendarView.display, roomStatus: value } })
                  }
                />
                <Toggle
                  label="Unassigned lane"
                  checked={calendarView.showUnassigned}
                  onChange={(value) => patchCalendar({ showUnassigned: value })}
                />
              </div>
            </Section>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Exceptions (works from the table and the calendar) ---------- */

export function DeskExceptionsMenu({
  restaurantId,
  onOpenReservation,
}: {
  restaurantId: string;
  onOpenReservation: (reservationId: string) => void;
}) {
  const loadExceptions = useServerFn(getReservationExceptions);

  const exceptionsQuery = useQuery({
    queryKey: ["reservation-calendar-exceptions", restaurantId],
    queryFn: () => loadExceptions({ data: { restaurantId } }),
  });

  const items = exceptionsQuery.data?.items ?? [];
  const count = items.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(PILL_BUTTON, "gap-2 px-4")}
          data-testid="reservation-desk-exceptions-button"
        >
          <TriangleAlert className="size-4 text-[#c9a24a]" />
          Exceptions
          <span
            className={cn(
              "rounded-full px-2 text-[11px] font-extrabold tabular-nums",
              count > 0 ? "bg-[#c9a24a] text-[#2b1a10]" : "bg-[#f1ede6] text-[#7A6B58]",
            )}
          >
            {count}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 rounded-2xl border-[#e9dfd0]">
        <p className="text-sm font-bold text-[#4a2c1a]">Exceptions</p>

        {exceptionsQuery.isError ? (
          <p className="mt-2 text-xs text-destructive">Could not load exceptions.</p>
        ) : count === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No operational exceptions on the business date.
          </p>
        ) : (
          <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {items.slice(0, 12).map((item) => (
              <li key={`${item.key}-${item.reservationId ?? item.summary}`}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-[#e9dfd0] px-2 py-1.5 text-left text-xs hover:bg-[#faf7f1]"
                  disabled={!item.reservationId}
                  onClick={() => {
                    if (item.reservationId) onOpenReservation(item.reservationId);
                  }}
                >
                  <span className="font-medium text-foreground">{item.summary}</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {item.confirmationNumber ?? "Property"} · {item.key.replaceAll("_", " ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Availability (works from the table and the calendar) ---------- */

export function DeskAvailabilityMenu({
  restaurantId,
  start,
  days,
  iconOnly = false,
}: {
  restaurantId: string;
  /** First day of the window (YYYY-MM-DD). */
  start: string;
  /** Window length in days (1, 7, 14 or 30). */
  days: number;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const loadCalendar = useServerFn(getReservationCalendar);

  const availabilityQuery = useQuery({
    queryKey: ["reservation-desk-availability", restaurantId, start, days],
    queryFn: () =>
      loadCalendar({
        data: {
          restaurantId,
          horizon: days as CalendarHorizon,
          mode: "room_type",
          rangeStart: start,
          rangeEnd: addDays(start, days),
        },
      }),
    enabled: open,
    staleTime: 60_000,
  });

  const rows = availabilityQuery.data?.availability ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {iconOnly ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={ICON_BUTTON}
            aria-label="Availability"
            title="Availability"
            data-testid="reservation-desk-availability-button"
          >
            <BedDouble className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className={cn(PILL_BUTTON, "px-4")}
            data-testid="reservation-desk-availability-button"
          >
            Availability
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 rounded-2xl border-[#e9dfd0]">
        <p className="text-sm font-bold text-[#4a2c1a]">Availability</p>

        {availabilityQuery.isLoading ? (
          <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
        ) : availabilityQuery.isError ? (
          <p className="mt-2 text-xs text-destructive">Could not load availability.</p>
        ) : rows.length ? (
          <ul className="mt-2 space-y-1 text-xs">
            {rows.slice(0, 8).map((type) => (
              <li key={type.roomTypeId} className="flex justify-between gap-2">
                <span className="truncate">{type.roomTypeName}</span>
                <span className="tabular-nums text-muted-foreground">
                  {type.available ?? "—"} avail
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            No availability rows for this window.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
