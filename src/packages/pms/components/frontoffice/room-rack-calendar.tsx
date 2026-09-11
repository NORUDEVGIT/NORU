import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ComingSoonChip, ComingSoonPanel, PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import {
  EMPTY_RACK_FILTERS,
  FO_BRAND,
  OPS_STRIP_COMING_SOON,
  RACK_COMING_SOON_FILTERS,
  RESERVATION_LEGEND,
  ROOM_LEGEND,
  dateRange,
  handleReservationBarDrop,
  isLiveHorizon,
  isPermissionDeniedMessage,
  reservationBarColor,
  reservationBarPlacement,
  roomMatchesFilters,
  stayFromReservation,
  stayMatchesFilters,
  stayOverlapsRange,
  type CalendarHorizon,
  type RackFilters,
} from "@/packages/pms/lib/front-office-shell";
import {
  getFrontOfficeDashboard,
  listOccupancy,
  type FrontOfficeStay,
  type OccupancyRoom,
} from "@/packages/pms/lib/frontoffice.functions";
import { listRoomRack, type RackRoom } from "@/packages/pms/lib/housekeeping.functions";
import { listReservations, type ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import { addDays, formatStayDate } from "@/packages/pms/lib/reservation-dates";

type Viewport = "phone" | "wide";

export function RoomRackCalendar({
  restaurantId,
  today,
  viewport,
  onSelectStay,
}: {
  restaurantId: string;
  today: string;
  viewport: Viewport;
  onSelectStay: (stay: FrontOfficeStay) => void;
}) {
  const [focusDate, setFocusDate] = useState(today);
  const [horizon, setHorizon] = useState<CalendarHorizon>(viewport === "phone" ? 1 : 7);
  const [filters, setFilters] = useState<RackFilters>(EMPTY_RACK_FILTERS);

  const liveHorizon = isLiveHorizon(horizon);
  const days = liveHorizon ? horizon : 7;
  const rangeEnd = addDays(focusDate, days - 1);

  const fetchOccupancy = useServerFn(listOccupancy);
  const fetchReservations = useServerFn(listReservations);
  const fetchDashboard = useServerFn(getFrontOfficeDashboard);
  const fetchHk = useServerFn(listRoomRack);

  const occupancyQuery = useQuery({
    queryKey: ["front-office", "occupancy", restaurantId],
    queryFn: () => fetchOccupancy({ data: { restaurantId } }),
    retry: false,
  });
  const reservationsQuery = useQuery({
    queryKey: ["front-office", "rack-reservations", restaurantId, focusDate, days],
    queryFn: () =>
      fetchReservations({
        data: { restaurantId, fromDate: focusDate, toDate: rangeEnd, page: 1, pageSize: 100 },
      }),
    enabled: liveHorizon,
    retry: false,
  });
  const dashboardQuery = useQuery({
    queryKey: ["front-office", "dashboard", restaurantId, today],
    queryFn: () => fetchDashboard({ data: { restaurantId, today } }),
    retry: false,
  });
  const hkQuery = useQuery({
    queryKey: ["front-office", "hk-status-feed", restaurantId],
    queryFn: () => fetchHk({ data: { restaurantId } }),
    retry: false,
  });

  const rooms = occupancyQuery.data ?? [];
  const stays = (reservationsQuery.data?.rows ?? []).filter((row) =>
    stayOverlapsRange(row.arrivalDate, row.departureDate, focusDate, days),
  );
  const hkByRoom = new Map((hkQuery.data ?? []).map((r) => [r.id, r]));
  const hkDenied = hkQuery.isError && isPermissionDeniedMessage(hkQuery.error);

  const floors = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.floor).filter(Boolean) as string[])).sort(),
    [rooms],
  );
  const types = useMemo(() => Array.from(new Set(rooms.map((r) => r.roomTypeName))).sort(), [rooms]);
  const sources = useMemo(
    () => Array.from(new Set(stays.map((s) => s.source).filter(Boolean))).sort(),
    [stays],
  );

  const visibleRooms = rooms.filter((room) =>
    roomMatchesFilters(
      {
        floor: room.floor,
        roomTypeName: room.roomTypeName,
        occupancy: room.occupancy,
        status: room.status,
        housekeepingStatus: hkByRoom.get(room.id)?.housekeepingStatus ?? null,
      },
      filters,
    ),
  );

  const visibleStays = stays.filter((stay) => stayMatchesFilters(stay, filters, focusDate));
  const unassigned = visibleStays.filter((s) => !s.roomId);

  if (occupancyQuery.isError && isPermissionDeniedMessage(occupancyQuery.error)) {
    return <PermissionDeniedPanel message="You don't have access to Front Office occupancy for this property." />;
  }

  return (
    <div className="space-y-4" data-testid="fo-room-rack-calendar">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl">Room Rack + Calendar</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFocusDate(today)}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setFocusDate(addDays(focusDate, -1))} aria-label="Previous day">
            <ChevronLeft className="size-4" />
          </Button>
          <Input type="date" className="w-40" value={focusDate} onChange={(e) => setFocusDate(e.target.value)} />
          <Button variant="outline" size="icon" onClick={() => setFocusDate(addDays(focusDate, 1))} aria-label="Next day">
            <ChevronRight className="size-4" />
          </Button>
          {([1, 7, 14, 30] as const).map((n) => (
            <Button
              key={n}
              size="sm"
              variant={horizon === n ? "default" : "outline"}
              onClick={() => setHorizon(n)}
            >
              {n} day{n === 1 ? "" : "s"}
              {isLiveHorizon(n) ? null : <span className="ml-1 text-[10px] uppercase">Soon</span>}
            </Button>
          ))}
        </div>
      </div>

      <OpsStrip
        {...(dashboardQuery.data ? { dashboard: dashboardQuery.data } : {})}
        loading={dashboardQuery.isLoading}
      />

      <FilterRow
        filters={filters}
        onChange={setFilters}
        floors={floors}
        types={types}
        sources={sources}
        hkAvailable={!hkDenied && !!hkQuery.data}
      />

      {hkDenied ? (
        <PermissionDeniedPanel
          className="py-3"
          message="Housekeeping status is hidden — you don't have access to the housekeeping feed. Occupancy is still shown."
        />
      ) : null}

      {!liveHorizon ? (
        <ComingSoonPanel
          title={`${horizon}-day calendar is Coming soon`}
          description="1-day and 7-day views are live from existing reservation and occupancy reads. A longer window is not opened from this shell."
        />
      ) : occupancyQuery.isLoading || reservationsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Room Rack + Calendar…</p>
      ) : viewport === "phone" ? (
        <PhoneRackList
          rooms={visibleRooms}
          stays={visibleStays}
          hkByRoom={hkByRoom}
          today={focusDate}
          onSelectStay={onSelectStay}
        />
      ) : (
        <CalendarBoard
          rooms={visibleRooms}
          stays={visibleStays}
          unassigned={unassigned}
          hkByRoom={hkByRoom}
          focusDate={focusDate}
          days={days}
          onSelectStay={onSelectStay}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Legend title="Room states" items={ROOM_LEGEND} />
        <Legend title="Reservation states" items={RESERVATION_LEGEND} />
      </div>
    </div>
  );
}

function OpsStrip({
  dashboard,
  loading,
}: {
  dashboard?: {
    arrivalsToday: number;
    departuresToday: number;
    inHouse: number;
    availableRooms: number;
    occupiedRooms: number;
    outOfOrder: number;
    outOfService: number;
  };
  loading: boolean;
}) {
  const cards = dashboard
    ? [
        ["Arrivals", dashboard.arrivalsToday],
        ["Departures", dashboard.departuresToday],
        ["In-house", dashboard.inHouse],
        ["Available", dashboard.availableRooms],
        ["Occupied", dashboard.occupiedRooms],
        ["OOO", dashboard.outOfOrder],
        ["OOS", dashboard.outOfService],
      ]
    : [];

  return (
    <div className="flex flex-wrap gap-2" data-testid="fo-ops-strip">
      {loading ? <p className="text-xs text-muted-foreground">Loading occupancy strip…</p> : null}
      {cards.map(([label, value]) => (
        <div key={String(label)} className="rounded-xl border border-border bg-card px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="font-display text-lg">{value}</p>
        </div>
      ))}
      {OPS_STRIP_COMING_SOON.map((item) => (
        <ComingSoonChip key={item.id} label={item.label} />
      ))}
    </div>
  );
}

function FilterRow({
  filters,
  onChange,
  floors,
  types,
  sources,
  hkAvailable,
}: {
  filters: RackFilters;
  onChange: (next: RackFilters) => void;
  floors: string[];
  types: string[];
  sources: string[];
  hkAvailable: boolean;
}) {
  function set<K extends keyof RackFilters>(key: K, value: RackFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="fo-rack-filters">
      <FilterSelect
        label="Floor"
        value={filters.floor}
        onChange={(v) => set("floor", v)}
        options={floors.map((f) => [f, `Floor ${f}`] as const)}
      />
      <FilterSelect
        label="Type"
        value={filters.roomType}
        onChange={(v) => set("roomType", v)}
        options={types.map((t) => [t, t] as const)}
      />
      <FilterSelect
        label="Room status"
        value={filters.roomStatus}
        onChange={(v) => set("roomStatus", v)}
        options={[
          ["vacant", "Vacant"],
          ["occupied", "Occupied"],
          ["available", "Available"],
          ["out_of_order", "Out of order"],
          ["out_of_service", "Out of service"],
        ]}
      />
      {hkAvailable ? (
        <FilterSelect
          label="HK"
          value={filters.hkStatus}
          onChange={(v) => set("hkStatus", v)}
          options={[
            ["clean", "Clean"],
            ["dirty", "Dirty"],
            ["inspected", "Inspected"],
          ]}
        />
      ) : (
        <ComingSoonChip label="HK filter" hint="Housekeeping status is unavailable on this login." />
      )}
      <FilterSelect
        label="Res status"
        value={filters.resStatus}
        onChange={(v) => set("resStatus", v)}
        options={[
          ["pending", "Pending"],
          ["confirmed", "Confirmed"],
          ["checked_in", "In-house"],
          ["checked_out", "Checked out"],
          ["cancelled", "Cancelled"],
          ["no_show", "No-show"],
        ]}
      />
      <FilterSelect
        label="Stay"
        value={filters.staySlice}
        onChange={(v) => set("staySlice", v as RackFilters["staySlice"])}
        options={[
          ["arrival", "Arrival"],
          ["departure", "Departure"],
          ["in_house", "In-house"],
        ]}
      />
      <FilterSelect
        label="VIP"
        value={filters.vip}
        onChange={(v) => set("vip", v)}
        options={[["vip", "VIP only"]]}
      />
      <FilterSelect
        label="Source"
        value={filters.source}
        onChange={(v) => set("source", v)}
        options={sources.map((s) => [s, s] as const)}
      />
      {RACK_COMING_SOON_FILTERS.map((item) => (
        <ComingSoonChip key={item.id} label={item.label} />
      ))}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-36">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
        {options.map(([v, name]) => (
          <SelectItem key={v} value={v}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CalendarBoard({
  rooms,
  stays,
  unassigned,
  hkByRoom,
  focusDate,
  days,
  onSelectStay,
}: {
  rooms: OccupancyRoom[];
  stays: ReservationDetail[];
  unassigned: ReservationDetail[];
  hkByRoom: Map<string, RackRoom>;
  focusDate: string;
  days: number;
  onSelectStay: (stay: FrontOfficeStay) => void;
}) {
  const dates = dateRange(focusDate, days);
  const byRoom = new Map<string, ReservationDetail[]>();
  for (const stay of stays) {
    if (!stay.roomId) continue;
    const list = byRoom.get(stay.roomId) ?? [];
    list.push(stay);
    byRoom.set(stay.roomId, list);
  }

  return (
    <div className="overflow-auto rounded-2xl border border-border" data-testid="fo-calendar-board">
      <div
        className="min-w-max"
        style={{
          display: "grid",
          gridTemplateColumns: `220px repeat(${days}, minmax(128px, 1fr))`,
        }}
      >
        <div className="sticky left-0 z-20 border-b border-r border-border bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Room
        </div>
        {dates.map((d) => (
          <div key={d} className="border-b border-border px-3 py-2 text-xs font-medium">
            {formatStayDate(d)}
          </div>
        ))}

        {unassigned.length > 0 ? (
          <UnassignedRow stays={unassigned} focusDate={focusDate} days={days} dates={dates} onSelectStay={onSelectStay} />
        ) : null}

        {rooms.map((room) => (
          <RoomRow
            key={room.id}
            room={room}
            hk={hkByRoom.get(room.id) ?? null}
            stays={byRoom.get(room.id) ?? []}
            focusDate={focusDate}
            days={days}
            dates={dates}
            onSelectStay={onSelectStay}
          />
        ))}
      </div>
    </div>
  );
}

function UnassignedRow({
  stays,
  focusDate,
  days,
  dates,
  onSelectStay,
}: {
  stays: ReservationDetail[];
  focusDate: string;
  days: number;
  dates: string[];
  onSelectStay: (stay: FrontOfficeStay) => void;
}) {
  return (
    <>
      <div
        className="sticky left-0 z-10 border-b border-r border-border px-3 py-3 text-sm"
        style={{ backgroundColor: `${FO_BRAND.chrome}0D` }}
      >
        <p className="font-medium">Unassigned</p>
        <p className="text-xs text-muted-foreground">{stays.length} stay{stays.length === 1 ? "" : "s"}</p>
      </div>
      <div
        className="relative border-b border-border"
        style={{ gridColumn: `2 / span ${dates.length}`, minHeight: 56 }}
      >
        <BarTrack stays={stays} focusDate={focusDate} days={days} onSelectStay={onSelectStay} />
      </div>
    </>
  );
}

function RoomRow({
  room,
  hk,
  stays,
  focusDate,
  days,
  dates,
  onSelectStay,
}: {
  room: OccupancyRoom;
  hk: RackRoom | null;
  stays: ReservationDetail[];
  focusDate: string;
  days: number;
  dates: string[];
  onSelectStay: (stay: FrontOfficeStay) => void;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-sm">
        <p className="font-medium">
          {room.roomNumber}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{room.roomTypeName}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {room.floor ? `Floor ${room.floor}` : "—"} · {room.occupancy}
          {hk ? ` · HK ${hk.housekeepingStatus}` : ""}
        </p>
        <p className="truncate text-xs text-muted-foreground">{room.guestName ?? "Vacant"}</p>
      </div>
      <div
        className="relative border-b border-border"
        style={{ gridColumn: `2 / span ${dates.length}`, minHeight: 56 }}
      >
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${days}, minmax(128px, 1fr))` }}
        >
          {dates.map((d) => (
            <div key={d} className="border-l border-[#CCCCCC]/70" />
          ))}
        </div>
        <BarTrack stays={stays} focusDate={focusDate} days={days} onSelectStay={onSelectStay} />
      </div>
    </>
  );
}

function BarTrack({
  stays,
  focusDate,
  days,
  onSelectStay,
}: {
  stays: ReservationDetail[];
  focusDate: string;
  days: number;
  onSelectStay: (stay: FrontOfficeStay) => void;
}) {
  return (
    <div
      className="relative grid h-full min-h-14 px-1 py-1"
      style={{ gridTemplateColumns: `repeat(${days}, minmax(128px, 1fr))` }}
    >
      {stays.map((stay) => {
        const place = reservationBarPlacement(stay.arrivalDate, stay.departureDate, focusDate, days);
        if (!place) return null;
        return (
          <ReservationBar
            key={stay.id}
            stay={stay}
            startCol={place.startCol}
            endCol={place.endCol}
            onSelectStay={onSelectStay}
          />
        );
      })}
    </div>
  );
}

function ReservationBar({
  stay,
  startCol,
  endCol,
  onSelectStay,
}: {
  stay: ReservationDetail;
  startCol: number;
  endCol: number;
  onSelectStay: (stay: FrontOfficeStay) => void;
}) {
  return (
    <div
      className="relative mx-0.5 flex min-w-0 items-stretch"
      style={{ gridColumn: `${startCol} / ${endCol}` }}
    >
      <button
        type="button"
        data-testid="fo-reservation-bar"
        className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-left text-xs text-white"
        style={{ backgroundColor: reservationBarColor(stay.status) }}
        onClick={() => onSelectStay(stayFromReservation(stay, stay.arrivalDate))}
      >
        <span
          data-testid="fo-drag-handle"
          draggable
          className="shrink-0 cursor-grab text-white/80"
          aria-label="Drag to move — Coming soon"
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", stay.id);
            e.dataTransfer.effectAllowed = "none";
          }}
          onDragEnd={() => {
            handleReservationBarDrop({ reservationId: stay.id, targetRoomId: "" }, {});
          }}
        >
          <GripVertical className="size-3.5" />
        </span>
        <span className="truncate font-medium">{stay.guestName}</span>
      </button>
    </div>
  );
}

function PhoneRackList({
  rooms,
  stays,
  hkByRoom,
  today,
  onSelectStay,
}: {
  rooms: OccupancyRoom[];
  stays: ReservationDetail[];
  hkByRoom: Map<string, RackRoom>;
  today: string;
  onSelectStay: (stay: FrontOfficeStay) => void;
}) {
  const todayStays = stays.filter((s) => s.arrivalDate <= today && s.departureDate > today);
  return (
    <div className="space-y-3" data-testid="fo-phone-rack-list">
      <p className="text-sm text-muted-foreground">
        Phone shows rooms and today&apos;s stays. The week Gantt stays on larger screens.
      </p>
      <ul className="space-y-2">
        {rooms.map((room) => {
          const hk = hkByRoom.get(room.id);
          return (
            <li key={room.id} className="rounded-2xl border border-border bg-card p-3">
              <p className="font-medium">
                {room.roomNumber} · {room.roomTypeName}
              </p>
              <p className="text-xs text-muted-foreground">
                {room.occupancy}
                {hk ? ` · HK ${hk.housekeepingStatus}` : ""} · {room.guestName ?? "Vacant"}
              </p>
            </li>
          );
        })}
      </ul>
      <ul className="space-y-2">
        {todayStays.map((stay) => (
          <li key={stay.id}>
            <button
              type="button"
              className="w-full rounded-2xl border border-border bg-card p-3 text-left"
              onClick={() => onSelectStay(stayFromReservation(stay, today))}
            >
              <p className="font-medium">{stay.guestName}</p>
              <p className="text-xs text-muted-foreground">
                {stay.confirmationNumber} · {stay.roomNumber ?? "Unassigned"}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ title, items }: { title: string; items: { key: string; label: string; color: string }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.key} className="inline-flex items-center gap-1.5 text-xs">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function dropReservationOnRoom(reservationId: string, targetRoomId: string) {
  return handleReservationBarDrop({ reservationId, targetRoomId }, {});
}

