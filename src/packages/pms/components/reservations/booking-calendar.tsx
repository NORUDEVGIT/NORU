import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";

import { ReservationContextMenu } from "@/packages/pms/components/reservations/reservation-context-menu";
import type { ReservationContextActionId } from "@/packages/pms/components/reservations/reservation-context-actions";
import { reservationBarPlacement } from "@/packages/pms/lib/front-office-shell";
import { addDays } from "@/packages/pms/lib/reservation-dates";
import { reservationAmendImpact } from "@/packages/pms/lib/reservation-amend-impact";
import {
  BOOKING_CALENDAR_DRAG_MIME,
  calendarBarIsSelected,
  calendarBarKey,
  calendarBarLabel,
  calendarBarToDeskRow,
  findCalendarBar,
  calendarDateColumns,
  calendarExceptionLabel,
  calendarMoveKind,
  calendarStatusBarClass,
  canDragCalendarBar,
  DEFAULT_CALENDAR_DISPLAY,
  densityRowPx,
  parseCalendarDragPayload,
  proposedStayFromDrop,
  resolveCalendarSearchFocus,
  type CalendarDensity,
  type CalendarDisplayOptions,
} from "@/packages/pms/lib/reservation-workspace/booking-calendar";
import { getReservationCalendar } from "@/packages/pms/lib/reservation-workspace/calendar.server";
import { getReservationExceptions } from "@/packages/pms/lib/reservation-workspace/exceptions.server";
import { listOperationalReservations } from "@/packages/pms/lib/reservation-workspace/search.server";
import type { ReservationStatus } from "@/packages/pms/lib/reservation-dates";
import type {
  CalendarBar,
  CalendarHorizon,
  CalendarMode,
  CalendarRead,
  CalendarRoom,
  ReservationDeskRow,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { amendReservation, getReservation } from "@/packages/pms/lib/reservations.functions";
import {
  useMoveEligibleRoomIds,
  type MoveDragStay,
} from "@/packages/pms/components/use-move-eligible-rooms";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import type { CalendarViewState } from "@/packages/pms/components/reservations/reservation-desk-toolbar-menu";

const HORIZONS: CalendarHorizon[] = [1, 7, 14, 30];

/** Max reservations the shared search can match against the calendar bars. */
const SHARED_SEARCH_LIMIT = 100;

const PILL_BUTTON =
  "h-9 rounded-full border-[#e9dfd0] bg-white text-sm font-semibold text-[#4a2c1a] shadow-none hover:bg-[#f5ead0]";

/**
 * Search + filters owned by the Reservation Desk. When passed to the calendar,
 * the calendar follows them and hides its own search, range, and filter fields
 * so there is only one set of controls.
 */
export type CalendarSharedFilters = {
  search: string;
  status: "all" | ReservationStatus;
  /** "all" or a room type id. */
  roomTypeId: string;
  /** "all" or a source key (staff, walk_in, ...). */
  source: string;
  /** "all" or a rate plan name. */
  ratePlan?: string;
  rangeStart: string | null;
  /** null keeps the calendar's own length. */
  horizon: number | null;
  /** Layout, density, building and what the bars show (from the desk's Display menu). */
  view: CalendarViewState;
};

type ProposedMove = {
  bar: CalendarBar;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeId: string;
  roomTypeName: string;
  arrivalDate: string;
  departureDate: string;
};

function formatShort(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatRangeLabel(start: string, horizon: number): string {
  if (horizon <= 1) {
    return new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  const end = addDays(start, horizon - 1);
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();

  const startLabel = startDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  const endLabel = endDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  if (startYear !== endYear) {
    return `${startLabel} ${startYear} – ${endLabel} ${endYear}`;
  }

  return `${startLabel} – ${endLabel} ${endYear}`;
}

/** Titled block inside the Filter menu. */
function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-b border-[#efe7d8] px-4 py-3 last:border-b-0">
      <p className="text-xs font-bold text-[#4a2c1a]">{title}</p>
      {children}
    </div>
  );
}

function ToggleRow({
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

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter ${label}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a24a] bg-[#f5ead0] py-0.5 pl-3 pr-2 text-xs font-bold text-[#4a2c1a]"
    >
      {label}
      <X className="size-3" />
    </button>
  );
}

export function BookingCalendarPanel({
  restaurantId,
  canManage,
  selectedId,
  selectedReservationRoomId = null,
  shared,
  onSelect,
  onOpen,
  onAction,
}: {
  restaurantId: string;
  canManage: boolean;
  selectedId: string | null;
  selectedReservationRoomId?: string | null;
  /** Search + filters from the Reservation Desk. When set, the calendar follows them. */
  shared?: CalendarSharedFilters;
  onSelect: (row: ReservationDeskRow) => void;
  onOpen: (reservationId: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
}) {
  const loadCalendar = useServerFn(getReservationCalendar);
  const loadSearch = useServerFn(listOperationalReservations);
  const loadExceptions = useServerFn(getReservationExceptions);

  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<CalendarHorizon>(7);
  const [localMode, setMode] = useState<CalendarMode>("room");
  const [localDensity, setDensity] = useState<CalendarDensity>("standard");
  const [localDisplay, setDisplay] = useState<CalendarDisplayOptions>(DEFAULT_CALENDAR_DISPLAY);
  const [roomTypeId, setRoomTypeId] = useState("all");
  const [status, setStatus] = useState<"all" | ReservationStatus>("all");
  const [localBuilding, setBuilding] = useState("");
  const [search, setSearch] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [localShowUnassigned, setShowUnassigned] = useState(true);
  const [proposed, setProposed] = useState<ProposedMove | null>(null);
  const [dragStay, setDragStay] = useState<MoveDragStay | null>(null);
  const [calendarDragging, setCalendarDragging] = useState(false);
  const dragActiveRef = useRef(false);
  const dragEligibleIds = useMoveEligibleRoomIds(restaurantId, dragStay);

  function beginCalendarDrag(bar: CalendarBar) {
    dragActiveRef.current = true;
    setDragStay({
      reservationId: bar.reservationId,
      reservationRoomId: bar.reservationRoomId,
      roomId: bar.roomId,
      roomTypeId: bar.roomTypeId,
      arrivalDate: bar.arrivalDate,
      departureDate: bar.departureDate,
    });
    window.requestAnimationFrame(() => {
      if (dragActiveRef.current) setCalendarDragging(true);
    });
  }

  function endCalendarDrag() {
    dragActiveRef.current = false;
    setCalendarDragging(false);
    setDragStay(null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") endCalendarDrag();
    }
    document.addEventListener("dragend", endCalendarDrag);
    document.addEventListener("drop", endCalendarDrag);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("dragend", endCalendarDrag);
      document.removeEventListener("drop", endCalendarDrag);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const [filterOpen, setFilterOpen] = useState(false);

  // With the desk in charge, the Display menu in the desk toolbar sets these.
  // If the desk does not pass `view` yet, fall back to the calendar's own options.
  const sharedView = shared?.view;
  const mode = sharedView ? sharedView.mode : localMode;
  const density = sharedView ? sharedView.density : localDensity;
  const display = sharedView ? sharedView.display : localDisplay;
  const building = sharedView ? sharedView.building : localBuilding;
  const showUnassigned = sharedView ? sharedView.showUnassigned : localShowUnassigned;

  /* Follow the Reservation Desk's status, room type and period. */
  useEffect(() => {
    if (!shared) return;
    setStatus(shared.status);
    setRoomTypeId(shared.roomTypeId);
    // null goes back to the calendar's default start (the business date).
    setRangeStart(shared.rangeStart);
    if (shared.horizon) setHorizon(shared.horizon as CalendarHorizon);
  }, [shared?.status, shared?.roomTypeId, shared?.rangeStart, shared?.horizon]);

  const calendarQuery = useQuery({
    queryKey: [
      "reservation-calendar",
      restaurantId,
      rangeStart,
      horizon,
      mode,
      roomTypeId,
      status,
      building,
    ],
    queryFn: () =>
      loadCalendar({
        data: {
          restaurantId,
          horizon,
          mode,
          ...(rangeStart
            ? {
                rangeStart,
                rangeEnd: addDays(rangeStart, horizon),
              }
            : {}),
          ...(roomTypeId !== "all" ? { roomTypeId } : {}),
          ...(status !== "all" ? { statuses: [status] } : {}),
          ...(building.trim() ? { building: building.trim() } : {}),
        },
      }),
    placeholderData: keepPreviousData,
  });

  const rawSnapshot = calendarQuery.data;

  /*
   * Desk search: ask the same search endpoint the table uses (guest,
   * confirmation, phone, email, room) and keep only the bars it returns.
   */
  const sharedSearch = shared?.search.trim() ?? "";
  const matchQuery = useQuery({
    queryKey: ["reservation-calendar-search", restaurantId, sharedSearch],
    queryFn: () =>
      loadSearch({
        data: {
          restaurantId,
          search: sharedSearch,
          page: 1,
          pageSize: SHARED_SEARCH_LIMIT,
        },
      }),
    enabled: sharedSearch.length >= 2,
    placeholderData: keepPreviousData,
  });

  const matchIds = useMemo(
    () =>
      sharedSearch.length >= 2 && matchQuery.data
        ? new Set(matchQuery.data.rows.map((row) => row.reservationId))
        : null,
    [sharedSearch, matchQuery.data],
  );

  /* The board the person sees: calendar data narrowed by the desk search and source. */
  const snapshot = useMemo(() => {
    if (!rawSnapshot || !shared) return rawSnapshot;

    const keep = (bar: CalendarBar) =>
      (!matchIds || matchIds.has(bar.reservationId)) &&
      (shared.source === "all" || bar.source === shared.source) &&
      (!shared.ratePlan || shared.ratePlan === "all" || bar.ratePlanName === shared.ratePlan);

    return {
      ...rawSnapshot,
      bars: rawSnapshot.bars.filter(keep),
      unassigned: rawSnapshot.unassigned.filter(keep),
    };
  }, [rawSnapshot, shared?.source, shared?.ratePlan, matchIds]);

  const searchNarrowing =
    shared !== undefined &&
    (sharedSearch.length >= 2 ||
      shared.source !== "all" ||
      (shared.ratePlan !== undefined && shared.ratePlan !== "all"));
  const visibleCount = (snapshot?.bars.length ?? 0) + (snapshot?.unassigned.length ?? 0);

  // Prefer the selected start date while the next query is loading.
  const effectiveStart = rangeStart ?? rawSnapshot?.range.start ?? null;

  useEffect(() => {
    if (rawSnapshot && rangeStart === null) {
      setRangeStart(rawSnapshot.range.start);
    }
  }, [rawSnapshot, rangeStart]);

  const exceptionsQuery = useQuery({
    queryKey: ["reservation-calendar-exceptions", restaurantId],
    queryFn: () => loadExceptions({ data: { restaurantId } }),
  });

  const searchMutation = useMutation({
    mutationFn: (query: string) =>
      loadSearch({
        data: {
          restaurantId,
          search: query,
          page: 1,
          pageSize: 5,
        },
      }),
    onSuccess: (page) => {
      const hit = page.rows[0];

      if (!hit) {
        toast.message("No reservation matched that search.");
        return;
      }

      const next = resolveCalendarSearchFocus({
        arrivalDate: hit.arrivalDate,
        reservationId: hit.reservationId,
        rangeStart: effectiveStart ?? hit.arrivalDate,
        horizon,
      });

      setRangeStart(next.rangeStart);
      setHighlightId(next.highlightId);

      const allBars = [...(snapshot?.bars ?? []), ...(snapshot?.unassigned ?? [])];

      const bar =
        allBars.find((item) => item.reservationId === hit.reservationId) ??
        ({
          reservationId: hit.reservationId,
          confirmationNumber: hit.confirmationNumber,
          guestId: hit.guestId,
          guestName: hit.guestName,
          guestVip: hit.guestVip,
          reservationRoomId: null,
          unitSequence: null,
          status: hit.status,
          roomTypeId: hit.roomTypeId,
          roomId: hit.roomId,
          arrivalDate: hit.arrivalDate,
          departureDate: hit.departureDate,
          adults: hit.adults,
          children: hit.children,
          updatedAt: hit.updatedAt,
          source: hit.source,
          ratePlanName: hit.ratePlanName,
          exceptionKeys: [],
        } satisfies CalendarBar);

      onSelect(calendarBarToDeskRow(bar, snapshot?.rooms ?? [], snapshot?.roomTypes ?? []));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const days = effectiveStart ? calendarDateColumns(effectiveStart, horizon) : [];

  const rowHeight = densityRowPx(density);

  /* Filter menu bookkeeping */
  const displayChanged = (
    Object.keys(DEFAULT_CALENDAR_DISPLAY) as Array<keyof CalendarDisplayOptions>
  ).some((key) => display[key] !== DEFAULT_CALENDAR_DISPLAY[key]);

  // With desk-owned filters, the menu only holds calendar display options.
  const activeFilterCount = sharedView
    ? 0
    : (roomTypeId !== "all" ? 1 : 0) +
      (status !== "all" ? 1 : 0) +
      (building.trim() ? 1 : 0) +
      (mode !== "room" ? 1 : 0) +
      (density !== "standard" ? 1 : 0) +
      (displayChanged || !showUnassigned ? 1 : 0);

  function resetFilters() {
    if (!shared) {
      setRoomTypeId("all");
      setStatus("all");
      setBuilding("");
    }
    setMode("room");
    setDensity("standard");
    setDisplay(DEFAULT_CALENDAR_DISPLAY);
    setShowUnassigned(true);
  }

  const roomTypeChipName =
    roomTypeId !== "all"
      ? (snapshot?.roomTypes.find((type) => type.roomTypeId === roomTypeId)?.roomTypeName ??
        "Room type")
      : null;

  function runSearch() {
    if (search.trim().length >= 2) {
      searchMutation.mutate(search.trim());
    }
  }

  function selectBar(bar: CalendarBar) {
    if (!snapshot) return;

    setHighlightId(bar.reservationId);

    onSelect(calendarBarToDeskRow(bar, snapshot.rooms, snapshot.roomTypes));
  }

  function handleDrop(bar: CalendarBar, target: { room: CalendarRoom; date: string }) {
    const dates = proposedStayFromDrop({
      arrivalDate: bar.arrivalDate,
      departureDate: bar.departureDate,
      dropDate: target.date,
    });

    const kind = calendarMoveKind({
      status: bar.status,
      currentRoomId: bar.roomId,
      proposedRoomId: target.room.roomId,
      currentArrival: bar.arrivalDate,
      proposedArrival: dates.arrivalDate,
      currentDeparture: bar.departureDate,
      proposedDeparture: dates.departureDate,
    });

    const row = calendarBarToDeskRow(bar, snapshot?.rooms ?? [], snapshot?.roomTypes ?? []);

    if (kind === "invalid") return;

    if (kind === "fo_room_move") {
      onSelect(row);
      onAction("change_room", row);
      return;
    }

    if (kind === "open_detail") {
      toast.message("In-house date changes open Reservation Detail for Front Office amend.");
      onOpen(bar.reservationId);
      return;
    }

    setProposed({
      bar,
      roomId: target.room.roomId,
      roomNumber: target.room.roomNumber,
      roomTypeId: target.room.roomTypeId,
      roomTypeName: target.room.roomTypeName,
      arrivalDate: dates.arrivalDate,
      departureDate: dates.departureDate,
    });
  }

  const isInitial = calendarQuery.isLoading && !snapshot;
  const exceptionCount = exceptionsQuery.data?.items.length ?? 0;

  /*
   * Date navigation lives in the range dropdown:
   * Yesterday / Today / Tomorrow are single-day presets on the business date,
   * Day / 7 / 14 / 30 days keep the current start date, and a specific start
   * date is picked in Filter → Start date.
   * (With desk-owned filters the desk's period navigator is used instead.)
   */
  function changeHorizon(nextHorizon: CalendarHorizon) {
    setHorizon(nextHorizon);
  }

  /* Range dropdown: Yesterday / Today / Tomorrow are single-day presets
     relative to the property's business date. */
  const PRESET_OFFSETS: Record<string, number> = {
    yesterday: -1,
    today: 0,
    tomorrow: 1,
  };

  const rangeValue = (() => {
    if (horizon === 1 && snapshot && effectiveStart) {
      if (effectiveStart === snapshot.businessDate) return "today";
      if (effectiveStart === addDays(snapshot.businessDate, -1)) return "yesterday";
      if (effectiveStart === addDays(snapshot.businessDate, 1)) return "tomorrow";
    }
    return String(horizon);
  })();

  function changeRange(value: string) {
    if (value in PRESET_OFFSETS) {
      if (!snapshot) return;
      setHorizon(1);
      setRangeStart(addDays(snapshot.businessDate, PRESET_OFFSETS[value]!));
      return;
    }
    changeHorizon(Number(value) as CalendarHorizon);
  }

  return (
    <div className="space-y-3" data-testid="reservation-booking-calendar">
      {/* Toolbar (hidden when the desk's period row holds the date, Display, Exceptions and Availability) */}
      {!sharedView ? (
        <section className="space-y-3 rounded-2xl border border-[#e9dfd0] bg-white p-3 shadow-sm">
          {/* Row 1: Date navigation and range selection */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold leading-tight text-[#4a2c1a]">
                {effectiveStart ? formatRangeLabel(effectiveStart, horizon) : "Loading…"}
              </p>

              {snapshot ? (
                <p className="text-[11px] text-[#7A6B58]">
                  Business date {formatShort(snapshot.businessDate)}
                  {searchNarrowing ? ` · ${visibleCount} matching` : ""}
                  {calendarQuery.isFetching || matchQuery.isFetching ? " · Updating…" : ""}
                </p>
              ) : null}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* The desk's period navigator replaces the range dropdown. */}
              {!shared ? (
                <Select value={rangeValue} onValueChange={changeRange}>
                  <SelectTrigger
                    className={cn(PILL_BUTTON, "w-[130px] px-4")}
                    aria-label="Calendar range"
                    data-testid="booking-calendar-range-select"
                  >
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent align="end">
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="tomorrow">Tomorrow</SelectItem>

                    {HORIZONS.map((item) => (
                      <SelectItem key={item} value={String(item)}>
                        {item === 1 ? "Day" : `${item} days`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Refresh calendar"
                onClick={() => {
                  void calendarQuery.refetch();
                  if (sharedSearch.length >= 2) void matchQuery.refetch();
                }}
                disabled={calendarQuery.isFetching}
              >
                <RefreshCw className={cn("size-4", calendarQuery.isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Row 2: Search, filters and quick information.
            Hidden when the desk owns the controls (its toolbar has them). */}
          {!shared?.view ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* The desk's search bar replaces the calendar's own search. */}
              {!shared ? (
                <div className="relative min-w-56 flex-1">
                  <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#c9a24a]" />

                  <Input
                    className="h-9 rounded-full border-[#c9a24a] bg-white pl-10 pr-20 text-sm font-medium"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search guest, confirmation, phone, email or room"
                    aria-label="Search calendar reservations"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") runSearch();
                    }}
                  />

                  <Button
                    type="button"
                    size="sm"
                    className="absolute right-1 top-1/2 h-7 -translate-y-1/2 rounded-full bg-[#C89933] px-3 text-xs font-bold text-[#251605] hover:bg-[#B98B2D]"
                    disabled={search.trim().length < 2 || searchMutation.isPending}
                    onClick={runSearch}
                  >
                    Find
                  </Button>
                </div>
              ) : (
                <div className="min-w-0 flex-1" />
              )}

              {/* Filter menu */}
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(PILL_BUTTON, "gap-2 px-4")}
                    data-testid="booking-calendar-filter-button"
                  >
                    <SlidersHorizontal className="size-4 text-[#c9a24a]" />
                    {shared ? "Display" : "Filter"}

                    {activeFilterCount > 0 ? (
                      <span className="rounded-full bg-[#c9a24a] px-2 text-[11px] font-extrabold text-[#2b1a10]">
                        {activeFilterCount}
                      </span>
                    ) : null}
                  </Button>
                </PopoverTrigger>

                <PopoverContent
                  align="end"
                  className="max-h-[75vh] w-[340px] overflow-y-auto rounded-2xl border-[#e9dfd0] p-0 shadow-[0_8px_24px_rgba(74,44,26,0.15)]"
                >
                  <div className="flex items-center justify-between border-b border-[#efe7d8] px-4 py-3">
                    <p className="text-sm font-bold text-[#4a2c1a]">
                      {shared ? "Calendar display" : "Filter calendar"}
                    </p>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-[#8C6D23]"
                      disabled={activeFilterCount === 0}
                      onClick={resetFilters}
                    >
                      Reset all
                    </Button>
                  </div>

                  {/* These filters live in the desk's Filter menu when the desk owns them. */}
                  {!shared ? (
                    <>
                      <FilterSection title="Start date">
                        <Input
                          type="date"
                          className="h-9"
                          value={effectiveStart ?? ""}
                          onChange={(event) => {
                            if (event.target.value) {
                              setRangeStart(event.target.value);
                            }
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                          aria-label="Start date"
                        />
                      </FilterSection>

                      <FilterSection title="Room type">
                        <Select value={roomTypeId} onValueChange={setRoomTypeId}>
                          <SelectTrigger className="h-9 w-full" aria-label="Room type filter">
                            <SelectValue placeholder="All room types" />
                          </SelectTrigger>

                          <SelectContent>
                            <SelectItem value="all">All room types</SelectItem>

                            {(snapshot?.roomTypes ?? []).map((type) => (
                              <SelectItem key={type.roomTypeId} value={type.roomTypeId}>
                                {type.roomTypeName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FilterSection>

                      <FilterSection title="Status">
                        <Select
                          value={status}
                          onValueChange={(value) => setStatus(value as "all" | ReservationStatus)}
                        >
                          <SelectTrigger className="h-9 w-full" aria-label="Status filter">
                            <SelectValue />
                          </SelectTrigger>

                          <SelectContent>
                            <SelectItem value="all">Default statuses</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="checked_in">Checked in</SelectItem>
                            <SelectItem value="checked_out">Checked out</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                            <SelectItem value="no_show">No-show</SelectItem>
                          </SelectContent>
                        </Select>
                      </FilterSection>
                    </>
                  ) : null}

                  {/* Building is calendar-only, so it stays available in both modes. */}
                  <FilterSection title="Building">
                    <Input
                      className="h-9"
                      value={building}
                      onChange={(event) => setBuilding(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                      placeholder="Optional"
                      aria-label="Building filter"
                    />
                  </FilterSection>

                  <FilterSection title="Layout">
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={mode}
                        onValueChange={(value) => setMode(value as CalendarMode)}
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
                        value={density}
                        onValueChange={(value) => setDensity(value as CalendarDensity)}
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
                  </FilterSection>

                  <FilterSection title="Show on calendar">
                    <div className="-mx-2">
                      <ToggleRow
                        label="Guest name"
                        checked={display.guestName}
                        onChange={(value) =>
                          setDisplay((current) => ({
                            ...current,
                            guestName: value,
                          }))
                        }
                      />

                      <ToggleRow
                        label="Confirmation number"
                        checked={display.confirmationNumber}
                        onChange={(value) =>
                          setDisplay((current) => ({
                            ...current,
                            confirmationNumber: value,
                          }))
                        }
                      />

                      <ToggleRow
                        label="Housekeeping status"
                        checked={display.housekeepingStatus}
                        onChange={(value) =>
                          setDisplay((current) => ({
                            ...current,
                            housekeepingStatus: value,
                          }))
                        }
                      />

                      <ToggleRow
                        label="Room status"
                        checked={display.roomStatus}
                        onChange={(value) =>
                          setDisplay((current) => ({
                            ...current,
                            roomStatus: value,
                          }))
                        }
                      />

                      <ToggleRow
                        label="Unassigned lane"
                        checked={showUnassigned}
                        onChange={setShowUnassigned}
                      />
                    </div>
                  </FilterSection>
                </PopoverContent>
              </Popover>

              {/* Exceptions */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className={cn(PILL_BUTTON, "gap-2 px-4")}>
                    <TriangleAlert className="size-4 text-[#c9a24a]" />
                    Exceptions
                    <span
                      className={cn(
                        "rounded-full px-2 text-[11px] font-extrabold tabular-nums",
                        exceptionCount > 0
                          ? "bg-[#c9a24a] text-[#2b1a10]"
                          : "bg-[#f1ede6] text-[#7A6B58]",
                      )}
                    >
                      {exceptionCount}
                    </span>
                  </Button>
                </PopoverTrigger>

                <PopoverContent align="end" className="w-80 rounded-2xl border-[#e9dfd0]">
                  <p className="text-sm font-bold text-[#4a2c1a]">Exceptions</p>

                  {exceptionsQuery.isError ? (
                    <p className="mt-2 text-xs text-destructive">Could not load exceptions.</p>
                  ) : exceptionCount === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No operational exceptions on the business date.
                    </p>
                  ) : (
                    <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                      {(exceptionsQuery.data?.items ?? []).slice(0, 12).map((item) => (
                        <li key={`${item.key}-${item.reservationId ?? item.summary}`}>
                          <button
                            type="button"
                            className="w-full rounded-lg border border-[#e9dfd0] px-2 py-1.5 text-left text-xs hover:bg-[#faf7f1]"
                            disabled={!item.reservationId}
                            onClick={() => {
                              if (!item.reservationId || !snapshot) return;

                              const found = [...snapshot.bars, ...snapshot.unassigned].find(
                                (bar) => bar.reservationId === item.reservationId,
                              );

                              if (found) {
                                selectBar(found);
                              } else {
                                onOpen(item.reservationId);
                              }
                            }}
                          >
                            <span className="font-medium text-foreground">{item.summary}</span>

                            <span className="mt-0.5 block text-muted-foreground">
                              {item.confirmationNumber ?? "Property"} ·{" "}
                              {item.key.replaceAll("_", " ")}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </PopoverContent>
              </Popover>

              {/* Availability */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className={cn(PILL_BUTTON, "px-4")}>
                    Availability
                  </Button>
                </PopoverTrigger>

                <PopoverContent align="end" className="w-72 rounded-2xl border-[#e9dfd0]">
                  <p className="text-sm font-bold text-[#4a2c1a]">Availability</p>

                  {snapshot?.availability?.length ? (
                    <ul className="mt-2 space-y-1 text-xs">
                      {snapshot.availability.slice(0, 8).map((type) => (
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
            </div>
          ) : null}

          {/* Active filter chips (the desk shows its own chips when it owns the filters) */}
          {!shared && (roomTypeChipName || status !== "all" || building.trim()) ? (
            <ul className="flex flex-wrap gap-2" data-testid="booking-calendar-filter-chips">
              {roomTypeChipName ? (
                <li>
                  <FilterChip label={roomTypeChipName} onRemove={() => setRoomTypeId("all")} />
                </li>
              ) : null}

              {status !== "all" ? (
                <li>
                  <FilterChip
                    label={status.replaceAll("_", " ")}
                    onRemove={() => setStatus("all")}
                  />
                </li>
              ) : null}

              {building.trim() ? (
                <li>
                  <FilterChip
                    label={`Building: ${building.trim()}`}
                    onRemove={() => setBuilding("")}
                  />
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>
      ) : null}

      {snapshot?.warnings.length ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {snapshot.truncated
            ? "This window is truncated. Filters run on the server — do not treat the board as a complete list."
            : snapshot.warnings.join(" · ")}
        </p>
      ) : null}

      {shared && sharedSearch.length >= 2 && matchQuery.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Could not apply the search to the calendar. Showing all bookings in this window.
        </p>
      ) : null}

      {shared && matchIds && matchIds.size >= SHARED_SEARCH_LIMIT ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          The search matched many reservations. Narrow it to see every match on the calendar.
        </p>
      ) : null}

      {calendarQuery.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            {calendarQuery.error instanceof Error
              ? calendarQuery.error.message
              : "Could not load the Booking Calendar."}
          </p>

          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void calendarQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : isInitial ? (
        <Skeleton className="h-72 w-full rounded-2xl" aria-label="Loading booking calendar" />
      ) : !snapshot?.rooms.length ? (
        <div className="grid min-h-72 place-items-center rounded-2xl border border-[#e9dfd0] bg-white text-center">
          <div>
            <p className="font-medium text-[#4a2c1a]">No rooms to display</p>

            {activeFilterCount > 0 ? (
              <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
                Reset filters
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {searchNarrowing && visibleCount === 0 ? (
            <p className="rounded-xl border border-[#e9dfd0] bg-white px-3 py-2 text-xs text-[#7A6B58]">
              No reservations in this window match the search and filters.
            </p>
          ) : null}

          <CalendarBoard
            snapshot={snapshot}
            days={days}
            rowHeight={rowHeight}
            mode={mode}
            display={display}
            showUnassigned={showUnassigned}
            selectedId={selectedId}
            selectedReservationRoomId={selectedReservationRoomId}
            highlightId={highlightId}
            canManage={canManage}
            onSelectBar={selectBar}
            onOpen={onOpen}
            onAction={onAction}
            onDrop={handleDrop}
            onRoomDragStart={beginCalendarDrag}
            dragStay={calendarDragging ? dragStay : null}
            eligibleRoomIds={calendarDragging ? dragEligibleIds : null}
          />
        </>
      )}

      {proposed && snapshot ? (
        <CalendarMoveReviewDialog
          restaurantId={restaurantId}
          snapshot={snapshot}
          proposed={proposed}
          onOpenChange={(open) => {
            if (!open) setProposed(null);
          }}
          onSaved={() => {
            setProposed(null);
            void calendarQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function CalendarBoard({
  snapshot,
  days,
  rowHeight,
  mode,
  display,
  showUnassigned,
  selectedId,
  selectedReservationRoomId,
  highlightId,
  canManage,
  onSelectBar,
  onOpen,
  onAction,
  onDrop,
  onRoomDragStart,
  dragStay,
  eligibleRoomIds,
}: {
  snapshot: CalendarRead;
  days: string[];
  rowHeight: number;
  mode: CalendarMode;
  display: CalendarDisplayOptions;
  showUnassigned: boolean;
  selectedId: string | null;
  selectedReservationRoomId: string | null;
  highlightId: string | null;
  canManage: boolean;
  onSelectBar: (bar: CalendarBar) => void;
  onOpen: (reservationId: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
  onDrop: (bar: CalendarBar, target: { room: CalendarRoom; date: string }) => void;
  onRoomDragStart: (bar: CalendarBar) => void;
  dragStay: MoveDragStay | null;
  eligibleRoomIds: Set<string> | null;
}) {
  const lanes: Array<{
    key: string;
    label: string;
    hint?: string;
    room: CalendarRoom | null;
    bars: CalendarBar[];
    dropHint: boolean;
  }> = (
    mode === "room_type"
      ? snapshot.roomTypes.map((type) => ({
          key: type.roomTypeId,
          label: type.roomTypeName,
          hint: `${type.available ?? "—"} available`,
          room: snapshot.rooms.find((room) => room.roomTypeId === type.roomTypeId) ?? null,
          bars: snapshot.bars.filter((bar) => bar.roomTypeId === type.roomTypeId),
          dropHint: false,
        }))
      : snapshot.rooms.map((room) => ({
          key: room.roomId,
          label: room.roomNumber,
          hint: [
            room.roomTypeName,
            display.roomStatus ? room.operationalStatus.replaceAll("_", " ") : null,
            display.housekeepingStatus ? room.housekeepingStatus.replaceAll("_", " ") : null,
          ]
            .filter(Boolean)
            .join(" · "),
          room,
          bars: snapshot.bars.filter((bar) => bar.roomId === room.roomId),
          dropHint: false,
        }))
  ).filter((lane) => {
    if (!dragStay || mode !== "room") return lane.bars.length > 0;
    if (!lane.room) return false;
    if (lane.room.roomId === dragStay.roomId) return true;
    return eligibleRoomIds?.has(lane.room.roomId) ?? false;
  }).map((lane) => ({
    ...lane,
    dropHint:
      mode === "room" &&
      Boolean(
        dragStay &&
          lane.room &&
          lane.room.roomId !== dragStay.roomId &&
          eligibleRoomIds?.has(lane.room.roomId),
      ),
  }));

  return (
    <div className="overflow-auto rounded-2xl border border-[#e9dfd0] bg-white shadow-sm">
      {showUnassigned ? (
        <div
          className={cn(
            "border-b border-amber-200 bg-amber-50/70",
            snapshot.unassigned.length === 0 ? "flex items-center px-3 py-1.5" : "p-2",
          )}
        >
          <p
            className={cn(
              "inline-flex items-center gap-1 text-xs font-bold text-amber-900",
              snapshot.unassigned.length === 0 ? "mr-2" : "mb-1",
            )}
          >
            <TriangleAlert className="size-3.5" />
            Unassigned
          </p>

          {snapshot.unassigned.length === 0 ? (
            <p className="inline-flex items-center gap-2 text-[11px] text-amber-900/80">
              None in this window
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {snapshot.unassigned.map((bar) => (
                <CalendarBarChip
                  key={calendarBarKey(bar)}
                  bar={bar}
                  snapshot={snapshot}
                  display={display}
                  selected={calendarBarIsSelected({
                    bar,
                    selectedReservationId: selectedId,
                    selectedReservationRoomId,
                    highlightReservationId: highlightId,
                  })}
                  canManage={canManage}
                  onSelectBar={onSelectBar}
                  onOpen={onOpen}
                  onAction={onAction}
                  onRoomDragStart={onRoomDragStart}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div
        className="grid min-w-[720px]"
        style={{
          gridTemplateColumns: `208px repeat(${days.length}, minmax(72px, 1fr))`,
        }}
      >
        <div className="sticky left-0 top-0 z-30 border-b border-border bg-[#faf7f1] px-3 py-2.5 text-xs font-bold text-[#4a2c1a]">
          {mode === "room" ? "Room" : "Room type"}
        </div>

        {days.map((day) => {
          const isToday = day === snapshot.businessDate;

          return (
            <div
              key={day}
              className={cn(
                "sticky top-0 z-20 border-b border-l border-border px-1 py-2 text-center text-[11px]",
                isToday
                  ? "bg-[#F4E9D0]/60 font-semibold text-[#251605]"
                  : "bg-[#faf7f1] font-medium text-[#7A6B58]",
              )}
            >
              {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              })}
            </div>
          );
        })}

        {lanes.length === 0 ? (
          <p className="col-span-full px-3 py-8 text-center text-sm text-[#7A6B58]">
            No rooms with guests in this range.
          </p>
        ) : (
          lanes.map((lane) => (
          <LaneRow
            key={lane.key}
            label={lane.label}
            hint={lane.hint}
            room={lane.room}
            allowDrop={mode === "room" && lane.room !== null && (!dragStay || lane.dropHint)}
            dropHint={lane.dropHint}
            bars={lane.bars}
            days={days}
            rangeStart={snapshot.range.start}
            horizon={snapshot.range.horizon}
            rowHeight={rowHeight}
            display={display}
            snapshot={snapshot}
            selectedId={selectedId}
            selectedReservationRoomId={selectedReservationRoomId}
            highlightId={highlightId}
            canManage={canManage}
            onSelectBar={onSelectBar}
            onOpen={onOpen}
            onAction={onAction}
            onDrop={onDrop}
            onRoomDragStart={onRoomDragStart}
          />
          ))
        )}
      </div>
    </div>
  );
}

function LaneRow({
  label,
  hint,
  room,
  allowDrop,
  dropHint,
  bars,
  days,
  rangeStart,
  horizon,
  rowHeight,
  display,
  snapshot,
  selectedId,
  selectedReservationRoomId,
  highlightId,
  canManage,
  onSelectBar,
  onOpen,
  onAction,
  onDrop,
  onRoomDragStart,
}: {
  label: string;
  hint?: string;
  room: CalendarRoom | null;
  allowDrop: boolean;
  dropHint: boolean;
  bars: CalendarBar[];
  days: string[];
  rangeStart: string;
  horizon: CalendarHorizon;
  rowHeight: number;
  display: CalendarDisplayOptions;
  snapshot: CalendarRead;
  selectedId: string | null;
  selectedReservationRoomId: string | null;
  highlightId: string | null;
  canManage: boolean;
  onSelectBar: (bar: CalendarBar) => void;
  onOpen: (reservationId: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
  onDrop: (bar: CalendarBar, target: { room: CalendarRoom; date: string }) => void;
  onRoomDragStart: (bar: CalendarBar) => void;
}) {
  return (
    <>
      <div
        className={cn(
          "sticky left-0 z-10 flex flex-col justify-center border-b border-border px-3 py-1",
          dropHint ? "bg-[#F4E9D0]/60" : "bg-white",
        )}
        style={{ minHeight: rowHeight }}
      >
        <p className="truncate text-sm font-semibold text-[#4a2c1a]">{label}</p>

        {hint ? <p className="truncate text-[10px] text-[#7A6B58]">{hint}</p> : null}
      </div>

      <div
        className={cn("relative border-b border-border", dropHint && "bg-[#F4E9D0]/40")}
        style={{
          gridColumn: `2 / span ${days.length}`,
          minHeight: rowHeight,
        }}
      >
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(72px, 1fr))`,
          }}
        >
          {days.map((day) => (
            <div
              key={day}
              className={cn(
                "border-l border-border/70",
                day === snapshot.businessDate && "bg-[#F4E9D0]/40",
              )}
              onDragOver={(event) => {
                if (!allowDrop || !room) return;

                if (event.dataTransfer.types.includes(BOOKING_CALENDAR_DRAG_MIME)) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                if (!allowDrop || !room) return;

                event.preventDefault();

                const payload = parseCalendarDragPayload(
                  event.dataTransfer.getData(BOOKING_CALENDAR_DRAG_MIME),
                );

                if (!payload) return;

                const bar = findCalendarBar([...snapshot.bars, ...snapshot.unassigned], payload);

                if (bar) {
                  onDrop(bar, { room, date: day });
                }
              }}
            />
          ))}
        </div>

        {bars.map((bar) => {
          const place = reservationBarPlacement(
            bar.arrivalDate,
            bar.departureDate,
            rangeStart,
            horizon,
          );

          if (!place) return null;

          return (
            <CalendarStayBar
              key={calendarBarKey(bar)}
              bar={bar}
              snapshot={snapshot}
              display={display}
              startCol={place.startCol}
              endCol={place.endCol}
              dayCount={days.length}
              clipped={place.clipped}
              selected={calendarBarIsSelected({
                bar,
                selectedReservationId: selectedId,
                selectedReservationRoomId,
                highlightReservationId: highlightId,
              })}
              canManage={canManage}
              onSelectBar={onSelectBar}
              onOpen={onOpen}
              onAction={onAction}
              onRoomDragStart={onRoomDragStart}
            />
          );
        })}
      </div>
    </>
  );
}

function CalendarStayBar({
  bar,
  snapshot,
  display,
  startCol,
  endCol,
  dayCount,
  clipped,
  selected,
  canManage,
  onSelectBar,
  onOpen,
  onAction,
  onRoomDragStart,
}: {
  bar: CalendarBar;
  snapshot: CalendarRead;
  display: CalendarDisplayOptions;
  startCol: number;
  endCol: number;
  dayCount: number;
  clipped: boolean;
  selected: boolean;
  canManage: boolean;
  onSelectBar: (bar: CalendarBar) => void;
  onOpen: (reservationId: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
  onRoomDragStart: (bar: CalendarBar) => void;
}) {
  const row = calendarBarToDeskRow(bar, snapshot.rooms, snapshot.roomTypes);

  return (
    <div
      className={cn(
        "absolute inset-y-1 z-[1] flex items-center overflow-hidden rounded-md border px-1.5 text-[11px] font-medium shadow-sm",
        calendarStatusBarClass(bar.status),
        selected && "ring-2 ring-[#C89933]",
        clipped && "opacity-90",
      )}
      style={{
        left: `${((startCol - 1) / dayCount) * 100}%`,
        width: `${((endCol - startCol) / dayCount) * 100}%`,
      }}
      draggable={canDragCalendarBar(bar.status)}
      onDragStart={(event) => {
        event.dataTransfer.setData(
          BOOKING_CALENDAR_DRAG_MIME,
          JSON.stringify({
            reservationId: bar.reservationId,
            reservationRoomId: bar.reservationRoomId,
          }),
        );
        event.dataTransfer.effectAllowed = "move";
        onRoomDragStart(bar);
      }}
      onClick={() => onSelectBar(bar)}
      onDoubleClick={() => onOpen(bar.reservationId)}
    >
      <span className="min-w-0 flex-1 truncate">{calendarBarLabel(bar, display)}</span>

      {bar.exceptionKeys.length > 0 ? (
        <span className="ml-1 shrink-0 rounded bg-white/70 px-1 text-[9px] uppercase">
          {calendarExceptionLabel(bar.exceptionKeys[0]!)}
        </span>
      ) : null}

      <span className="ml-1 shrink-0" onClick={(event) => event.stopPropagation()}>
        <ReservationContextMenu
          context={{
            status: row.status,
            roomId: row.roomId,
            arrivalDate: row.arrivalDate,
            businessDate: snapshot.businessDate,
            hints: row.hints,
            canManage,
          }}
          onAction={(actionId) => onAction(actionId, row)}
          triggerLabel={`Actions for reservation ${row.confirmationNumber}`}
        />
      </span>
    </div>
  );
}

function CalendarBarChip({
  bar,
  snapshot,
  display,
  selected,
  canManage,
  onSelectBar,
  onOpen,
  onAction,
  onRoomDragStart,
}: {
  bar: CalendarBar;
  snapshot: CalendarRead;
  display: CalendarDisplayOptions;
  selected: boolean;
  canManage: boolean;
  onSelectBar: (bar: CalendarBar) => void;
  onOpen: (reservationId: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
  onRoomDragStart: (bar: CalendarBar) => void;
}) {
  const row = calendarBarToDeskRow(bar, snapshot.rooms, snapshot.roomTypes);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
        calendarStatusBarClass(bar.status),
        selected && "ring-2 ring-[#C89933]",
      )}
      draggable={canDragCalendarBar(bar.status)}
      onDragStart={(event) => {
        event.dataTransfer.setData(
          BOOKING_CALENDAR_DRAG_MIME,
          JSON.stringify({
            reservationId: bar.reservationId,
            reservationRoomId: bar.reservationRoomId,
          }),
        );
        event.dataTransfer.effectAllowed = "move";
        onRoomDragStart(bar);
      }}
      onClick={() => onSelectBar(bar)}
      onDoubleClick={() => onOpen(bar.reservationId)}
    >
      {calendarBarLabel(bar, display)}

      <span onClick={(event) => event.stopPropagation()}>
        <ReservationContextMenu
          context={{
            status: row.status,
            roomId: row.roomId,
            arrivalDate: row.arrivalDate,
            businessDate: snapshot.businessDate,
            hints: row.hints,
            canManage,
          }}
          onAction={(actionId) => onAction(actionId, row)}
          triggerLabel={`Actions for reservation ${row.confirmationNumber}`}
        />
      </span>
    </div>
  );
}

function CalendarMoveReviewDialog({
  restaurantId,
  snapshot,
  proposed,
  onOpenChange,
  onSaved,
}: {
  restaurantId: string;
  snapshot: CalendarRead;
  proposed: ProposedMove;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const loadReservation = useServerFn(getReservation);
  const submitAmend = useServerFn(amendReservation);

  const [departure, setDeparture] = useState(proposed.departureDate);

  const detailQuery = useQuery({
    queryKey: ["reservation", restaurantId, proposed.bar.reservationId],
    queryFn: () =>
      loadReservation({
        data: {
          restaurantId,
          reservationId: proposed.bar.reservationId,
        },
      }),
  });

  const currentRoom = snapshot.rooms.find((room) => room.roomId === proposed.bar.roomId);

  const impact = useMemo(() => {
    const currentName = currentRoom?.roomNumber ?? "Unassigned";

    return reservationAmendImpact(
      {
        guestId: proposed.bar.guestId,
        guestName: proposed.bar.guestName,
        arrival: proposed.bar.arrivalDate,
        departure: proposed.bar.departureDate,
        adults: proposed.bar.adults,
        children: proposed.bar.children,
        roomTypeId: proposed.bar.roomTypeId,
        roomTypeName: currentRoom?.roomTypeName ?? proposed.roomTypeName,
        roomId: proposed.bar.roomId,
        roomNumber: currentName,
        specialRequests: "",
        notes: "",
        commercialBookingSource: "",
        marketSegment: "",
        externalReference: "",
        guaranteeMethod: "",
        available: null,
        currentTotal: null,
        proposedTotal: null,
      },
      {
        guestId: proposed.bar.guestId,
        guestName: proposed.bar.guestName,
        arrival: proposed.arrivalDate,
        departure,
        adults: proposed.bar.adults,
        children: proposed.bar.children,
        roomTypeId: proposed.roomTypeId,
        roomTypeName: proposed.roomTypeName,
        roomId: proposed.roomId,
        roomNumber: proposed.roomNumber,
        specialRequests: "",
        notes: "",
        commercialBookingSource: "",
        marketSegment: "",
        externalReference: "",
        guaranteeMethod: "",
        available: null,
        currentTotal: null,
        proposedTotal: null,
      },
    );
  }, [currentRoom, departure, proposed]);

  const save = useMutation({
    mutationFn: async () => {
      const detail = detailQuery.data?.reservation;

      if (!detail) {
        throw new Error("Reservation is still loading.");
      }

      return submitAmend({
        data: {
          restaurantId,
          reservationId: proposed.bar.reservationId,
          guestId: detail.guestId,
          roomTypeId: proposed.roomTypeId,
          roomId: proposed.roomId,
          arrival: proposed.arrivalDate,
          departure,
          adults: detail.adults,
          children: detail.children,
          specialRequests: detail.specialRequests,
          notes: detail.notes,
          ratePlanId: detail.ratePlanId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Stay updated after impact review.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="z-[70] max-w-lg">
        <DialogHeader>
          <DialogTitle>Review calendar move</DialogTitle>
          <DialogDescription>
            Current → Proposed. Availability is rechecked on save. This does not save on drop.
          </DialogDescription>
        </DialogHeader>

        <label className="grid gap-1 text-sm">
          Departure
          <Input
            type="date"
            value={departure}
            onChange={(event) => setDeparture(event.target.value)}
          />
        </label>

        {impact.changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No differences to review.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Field</th>
                <th>Current</th>
                <th>Proposed</th>
              </tr>
            </thead>

            <tbody>
              {impact.changes.map((change) => (
                <tr key={change.field} className="border-t border-border">
                  <td className="py-1 font-medium">{change.field}</td>
                  <td>{change.current}</td>
                  <td>{change.proposed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>

          <Button
            type="button"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
            disabled={save.isPending || detailQuery.isLoading}
            onClick={() => save.mutate()}
          >
            Confirm amendment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
