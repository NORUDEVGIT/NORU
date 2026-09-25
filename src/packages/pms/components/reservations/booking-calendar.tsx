import { useEffect, useMemo, useState } from "react";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";

import { ReservationContextMenu } from "@/packages/pms/components/reservations/reservation-context-menu";
import type { ReservationContextActionId } from "@/packages/pms/components/reservations/reservation-context-actions";
import { reservationBarPlacement } from "@/packages/pms/lib/front-office-shell";
import { addDays } from "@/packages/pms/lib/reservation-dates";
import { reservationAmendImpact } from "@/packages/pms/lib/reservation-amend-impact";
import {
  BOOKING_CALENDAR_DRAG_MIME,
  calendarBarLabel,
  calendarBarToDeskRow,
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
import { Button } from "@/shared/components/ui/button";
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

const HORIZONS: CalendarHorizon[] = [1, 7, 14, 30];

type ProposedMove = {
  bar: CalendarBar;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeId: string;
  roomTypeName: string;
  arrivalDate: string;
  departureDate: string;
};

export function BookingCalendarPanel({
  restaurantId,
  canManage,
  selectedId,
  onSelect,
  onOpen,
  onAction,
}: {
  restaurantId: string;
  canManage: boolean;
  selectedId: string | null;
  onSelect: (row: ReservationDeskRow) => void;
  onOpen: (reservationId: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
}) {
  const loadCalendar = useServerFn(getReservationCalendar);
  const loadSearch = useServerFn(listOperationalReservations);
  const loadExceptions = useServerFn(getReservationExceptions);

  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<CalendarHorizon>(7);
  const [mode, setMode] = useState<CalendarMode>("room");
  const [density, setDensity] = useState<CalendarDensity>("standard");
  const [display, setDisplay] = useState<CalendarDisplayOptions>(DEFAULT_CALENDAR_DISPLAY);
  const [roomTypeId, setRoomTypeId] = useState("all");
  const [status, setStatus] = useState<"all" | ReservationStatus>("all");
  const [building, setBuilding] = useState("");
  const [search, setSearch] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [proposed, setProposed] = useState<ProposedMove | null>(null);

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
          ...(rangeStart ? { rangeStart, rangeEnd: addDays(rangeStart, horizon) } : {}),
          ...(roomTypeId !== "all" ? { roomTypeId } : {}),
          ...(status !== "all" ? { statuses: [status] } : {}),
          ...(building.trim() ? { building: building.trim() } : {}),
        },
      }),
    placeholderData: keepPreviousData,
  });

  const snapshot = calendarQuery.data;
  const effectiveStart = snapshot?.range.start ?? rangeStart;

  useEffect(() => {
    if (snapshot && rangeStart === null) {
      setRangeStart(snapshot.range.start);
    }
  }, [snapshot, rangeStart]);

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

  return (
    <div className="space-y-3" data-testid="reservation-booking-calendar">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => snapshot && setRangeStart(addDays(snapshot.range.start, -horizon))}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => snapshot && setRangeStart(snapshot.businessDate)}
        >
          Today
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => snapshot && setRangeStart(addDays(snapshot.range.start, horizon))}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
        <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
          Start date
          <Input
            type="date"
            className="h-9 w-40"
            value={effectiveStart ?? ""}
            onChange={(event) => {
              if (event.target.value) setRangeStart(event.target.value);
            }}
          />
        </label>
        <div className="flex gap-1">
          {HORIZONS.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={horizon === item ? "default" : "outline"}
              className={horizon === item ? "bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]" : ""}
              onClick={() => setHorizon(item)}
            >
              {item === 1 ? "Day" : `${item} Days`}
            </Button>
          ))}
        </div>
        <Select value={mode} onValueChange={(value) => setMode(value as CalendarMode)}>
          <SelectTrigger className="h-9 w-36" aria-label="Calendar mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="room">Room view</SelectItem>
            <SelectItem value="room_type">Room type view</SelectItem>
          </SelectContent>
        </Select>
        <Select value={density} onValueChange={(value) => setDensity(value as CalendarDensity)}>
          <SelectTrigger className="h-9 w-36" aria-label="Calendar density">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="compact">Compact</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="comfortable">Comfortable</SelectItem>
            <SelectItem value="spacious">Spacious</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roomTypeId} onValueChange={setRoomTypeId}>
          <SelectTrigger className="h-9 w-44" aria-label="Room type filter">
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
        <Select value={status} onValueChange={(value) => setStatus(value as "all" | ReservationStatus)}>
          <SelectTrigger className="h-9 w-40" aria-label="Status filter">
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
        <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
          Building
          <Input
            className="h-9 w-32"
            value={building}
            onChange={(event) => setBuilding(event.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="grid min-w-52 flex-1 gap-1 text-[11px] font-medium text-muted-foreground">
          Search
          <span className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Confirmation, guest, phone, email or room"
              aria-label="Search calendar reservations"
              onKeyDown={(event) => {
                if (event.key === "Enter" && search.trim().length >= 2) {
                  searchMutation.mutate(search.trim());
                }
              }}
            />
          </span>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={search.trim().length < 2 || searchMutation.isPending}
          onClick={() => searchMutation.mutate(search.trim())}
        >
          Find
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Refresh calendar"
          onClick={() => void calendarQuery.refetch()}
          disabled={calendarQuery.isFetching}
        >
          <RefreshCw className={cn("size-4", calendarQuery.isFetching && "animate-spin")} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="inline-flex items-center gap-1.5">
          <Checkbox
            checked={display.guestName}
            onCheckedChange={(value) => setDisplay((current) => ({ ...current, guestName: value === true }))}
          />
          Guest name
        </label>
        <label className="inline-flex items-center gap-1.5">
          <Checkbox
            checked={display.confirmationNumber}
            onCheckedChange={(value) =>
              setDisplay((current) => ({ ...current, confirmationNumber: value === true }))
            }
          />
          Confirmation
        </label>
        <label className="inline-flex items-center gap-1.5">
          <Checkbox
            checked={display.housekeepingStatus}
            onCheckedChange={(value) =>
              setDisplay((current) => ({ ...current, housekeepingStatus: value === true }))
            }
          />
          Housekeeping
        </label>
        <label className="inline-flex items-center gap-1.5">
          <Checkbox
            checked={display.roomStatus}
            onCheckedChange={(value) => setDisplay((current) => ({ ...current, roomStatus: value === true }))}
          />
          Room status
        </label>
        <label className="inline-flex items-center gap-1.5">
          <Checkbox checked={showUnassigned} onCheckedChange={(value) => setShowUnassigned(value === true)} />
          Unassigned lane
        </label>
        {snapshot ? (
          <span>
            Business date {snapshot.businessDate}
            {calendarQuery.isFetching ? " · Updating…" : ""}
          </span>
        ) : null}
      </div>

      {snapshot?.warnings.length ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {snapshot.truncated
            ? "This window is truncated. Filters run on the server — do not treat the board as a complete list."
            : snapshot.warnings.join(" · ")}
        </p>
      ) : null}

      {calendarQuery.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            {calendarQuery.error instanceof Error
              ? calendarQuery.error.message
              : "Could not load the Booking Calendar."}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void calendarQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : isInitial ? (
        <Skeleton className="h-72 w-full" aria-label="Loading booking calendar" />
      ) : !snapshot?.rooms.length ? (
        <div className="grid min-h-72 place-items-center rounded-xl border border-[#DDD4C5] bg-white text-center">
          <p className="font-medium">No rooms to display</p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
          <CalendarBoard
            snapshot={snapshot}
            days={days}
            rowHeight={rowHeight}
            mode={mode}
            display={display}
            showUnassigned={showUnassigned}
            selectedId={selectedId}
            highlightId={highlightId}
            canManage={canManage}
            onSelectBar={selectBar}
            onOpen={onOpen}
            onAction={onAction}
            onDrop={handleDrop}
          />
          <aside className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Exceptions
            </p>
            {exceptionsQuery.isError ? (
              <p className="mt-2 text-xs text-destructive">Could not load exceptions.</p>
            ) : (exceptionsQuery.data?.items.length ?? 0) === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No operational exceptions on the business date.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(exceptionsQuery.data?.items ?? []).slice(0, 12).map((item) => (
                  <li key={`${item.key}-${item.reservationId ?? item.summary}`}>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-[#DDD4C5] px-2 py-1.5 text-left text-xs hover:bg-[#F7F4EE]"
                      disabled={!item.reservationId}
                      onClick={() => {
                        if (!item.reservationId) return;
                        const found = [...snapshot.bars, ...snapshot.unassigned].find(
                          (bar) => bar.reservationId === item.reservationId,
                        );
                        if (found) selectBar(found);
                        else onOpen(item.reservationId);
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
            {snapshot.availability?.length ? (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Availability
                </p>
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
              </div>
            ) : null}
          </aside>
        </div>
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
  highlightId,
  canManage,
  onSelectBar,
  onOpen,
  onAction,
  onDrop,
}: {
  snapshot: CalendarRead;
  days: string[];
  rowHeight: number;
  mode: CalendarMode;
  display: CalendarDisplayOptions;
  showUnassigned: boolean;
  selectedId: string | null;
  highlightId: string | null;
  canManage: boolean;
  onSelectBar: (bar: CalendarBar) => void;
  onOpen: (reservationId: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
  onDrop: (bar: CalendarBar, target: { room: CalendarRoom; date: string }) => void;
}) {
  const lanes: Array<{ key: string; label: string; hint?: string; room: CalendarRoom | null; bars: CalendarBar[] }> =
    mode === "room_type"
      ? snapshot.roomTypes.map((type) => ({
          key: type.roomTypeId,
          label: type.roomTypeName,
          hint: `${type.available ?? "—"} available`,
          room: snapshot.rooms.find((room) => room.roomTypeId === type.roomTypeId) ?? null,
          bars: snapshot.bars.filter((bar) => bar.roomTypeId === type.roomTypeId),
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
        }));

  return (
    <div className="overflow-auto rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
      {showUnassigned ? (
        <div className="border-b border-amber-200 bg-amber-50/70 p-2">
          <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900">
            <TriangleAlert className="size-3.5" />
            Unassigned
          </p>
          {snapshot.unassigned.length === 0 ? (
            <p className="text-xs text-muted-foreground">No unassigned pending or confirmed stays in this window.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {snapshot.unassigned.map((bar) => (
                <CalendarBarChip
                  key={bar.reservationId}
                  bar={bar}
                  snapshot={snapshot}
                  display={display}
                  selected={selectedId === bar.reservationId || highlightId === bar.reservationId}
                  canManage={canManage}
                  onSelectBar={onSelectBar}
                  onOpen={onOpen}
                  onAction={onAction}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div
        className="grid min-w-[720px]"
        style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(72px, 1fr))` }}
      >
        <div className="sticky left-0 z-10 border-b border-border bg-[#F7F4EE] px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {mode === "room" ? "Room" : "Room type"}
        </div>
        {days.map((day) => (
          <div
            key={day}
            className="border-b border-l border-border px-1 py-2 text-center text-[11px] font-medium"
          >
            {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            })}
          </div>
        ))}

        {lanes.map((lane) => (
          <LaneRow
            key={lane.key}
            label={lane.label}
            hint={lane.hint}
            room={lane.room}
            allowDrop={mode === "room" && lane.room !== null}
            bars={lane.bars}
            days={days}
            rangeStart={snapshot.range.start}
            horizon={snapshot.range.horizon}
            rowHeight={rowHeight}
            display={display}
            snapshot={snapshot}
            selectedId={selectedId}
            highlightId={highlightId}
            canManage={canManage}
            onSelectBar={onSelectBar}
            onOpen={onOpen}
            onAction={onAction}
            onDrop={onDrop}
          />
        ))}
      </div>
    </div>
  );
}

function LaneRow({
  label,
  hint,
  room,
  allowDrop,
  bars,
  days,
  rangeStart,
  horizon,
  rowHeight,
  display,
  snapshot,
  selectedId,
  highlightId,
  canManage,
  onSelectBar,
  onOpen,
  onAction,
  onDrop,
}: {
  label: string;
  hint?: string;
  room: CalendarRoom | null;
  allowDrop: boolean;
  bars: CalendarBar[];
  days: string[];
  rangeStart: string;
  horizon: CalendarHorizon;
  rowHeight: number;
  display: CalendarDisplayOptions;
  snapshot: CalendarRead;
  selectedId: string | null;
  highlightId: string | null;
  canManage: boolean;
  onSelectBar: (bar: CalendarBar) => void;
  onOpen: (reservationId: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
  onDrop: (bar: CalendarBar, target: { room: CalendarRoom; date: string }) => void;
}) {
  return (
    <>
      <div
        className="sticky left-0 z-10 border-b border-border bg-white px-2 py-1"
        style={{ minHeight: rowHeight }}
      >
        <p className="truncate text-sm font-medium">{label}</p>
        {hint ? <p className="truncate text-[10px] text-muted-foreground">{hint}</p> : null}
      </div>
      <div
        className="relative border-b border-border"
        style={{
          gridColumn: `2 / span ${days.length}`,
          minHeight: rowHeight,
        }}
      >
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(72px, 1fr))` }}
        >
          {days.map((day) => (
            <div
              key={day}
              className="border-l border-border/70"
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
                const bar = [...snapshot.bars, ...snapshot.unassigned].find(
                  (item) => item.reservationId === payload.reservationId,
                );
                if (bar) onDrop(bar, { room, date: day });
              }}
            />
          ))}
        </div>
        {bars.map((bar) => {
          const place = reservationBarPlacement(bar.arrivalDate, bar.departureDate, rangeStart, horizon);
          if (!place) return null;
          return (
            <CalendarStayBar
              key={bar.reservationId}
              bar={bar}
              snapshot={snapshot}
              display={display}
              startCol={place.startCol}
              endCol={place.endCol}
              dayCount={days.length}
              clipped={place.clipped}
              selected={selectedId === bar.reservationId || highlightId === bar.reservationId}
              canManage={canManage}
              onSelectBar={onSelectBar}
              onOpen={onOpen}
              onAction={onAction}
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
}) {
  const row = calendarBarToDeskRow(bar, snapshot.rooms, snapshot.roomTypes);
  return (
    <div
      className={cn(
        "absolute inset-y-1 z-[1] flex items-center overflow-hidden rounded border px-1.5 text-[11px] font-medium shadow-sm",
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
          JSON.stringify({ reservationId: bar.reservationId }),
        );
        event.dataTransfer.effectAllowed = "move";
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
}: {
  bar: CalendarBar;
  snapshot: CalendarRead;
  display: CalendarDisplayOptions;
  selected: boolean;
  canManage: boolean;
  onSelectBar: (bar: CalendarBar) => void;
  onOpen: (reservationId: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
}) {
  const row = calendarBarToDeskRow(bar, snapshot.rooms, snapshot.roomTypes);
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs",
        calendarStatusBarClass(bar.status),
        selected && "ring-2 ring-[#C89933]",
      )}
      draggable={canDragCalendarBar(bar.status)}
      onDragStart={(event) => {
        event.dataTransfer.setData(
          BOOKING_CALENDAR_DRAG_MIME,
          JSON.stringify({ reservationId: bar.reservationId }),
        );
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
        data: { restaurantId, reservationId: proposed.bar.reservationId },
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
      if (!detail) throw new Error("Reservation is still loading.");
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
          <Input type="date" value={departure} onChange={(event) => setDeparture(event.target.value)} />
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
