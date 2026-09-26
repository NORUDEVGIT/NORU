import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Ban,
  BedDouble,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  DoorOpen,
  Filter,
  GripVertical,
  House,
  LogIn,
  LogOut,
  Percent,
  ScanSearch,
  Sparkles,
  Triangle,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { ComingSoonChip, PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { FoRackConfirmSheet } from "@/packages/pms/components/frontoffice/fo-rack-confirm-sheet";
import { StayBadgeStrip } from "@/packages/pms/components/frontoffice/fo-stay-badges";
import {
  EMPTY_RACK_FILTERS,
  FO_BRAND,
  FO_LEGEND_DEFAULT_OPEN,
  HK_LEGEND,
  LIVE_HORIZONS,
  RESERVATION_LEGEND,
  ROOM_LEGEND,
  calendarHorizonLabel,
  countActiveRackFilters,
  dateRange,
  hkStatusAriaLabel,
  isLiveHorizon,
  isOpsStripFilterActive,
  isPermissionDeniedMessage,
  liveHkStatus,
  reservationBarColor,
  reservationBarPlacement,
  roomMatchesFilters,
  shouldShowDragHandle,
  stayFromReservation,
  stayMatchesFilters,
  stayOverlapsRange,
  groupRackRooms,
  type CalendarHorizon,
  type LiveHkStatus,
  type RackFilters,
  type RackGroupBy,
} from "@/packages/pms/lib/front-office-shell";
import {
  NO_STAYS_MATCH_FILTERS,
  RACK_LOAD_FAILED,
  badgeDisplayMode,
  classifyVerticalDrop,
  collectRackReservationPages,
  liveStayBadges,
  onRackDrop,
  onRackResizeRelease,
  rackColumnMinPx,
  rackFiltersActive,
  rackReservationPageSize,
  type RackConfirmDraft,
} from "@/packages/pms/lib/fo-rack-power";
import {
  getFrontOfficeDashboard,
  listOccupancy,
  type FrontOfficeStay,
  type OccupancyRoom,
} from "@/packages/pms/lib/frontoffice.functions";
import { listRoomRack, type RackRoom } from "@/packages/pms/lib/housekeeping.functions";
import { listReservations, type ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import { addDays, formatStayDate } from "@/packages/pms/lib/reservation-dates";
import { cn } from "@/shared/lib/utils";
import { deriveOpsStrip, type FoRackFocus } from "@/packages/pms/lib/fo-exceptions";
import { listFoExceptionFeeds } from "@/packages/pms/lib/fo-exceptions.functions";

type Viewport = "phone" | "wide";

const FO_DRAG_MIME = "application/x-fo-reservation";

export function RoomRackCalendar({
  restaurantId,
  today,
  viewport,
  rackFocus = null,
  initialHorizon,
  initialFocusDate,
  initialGroup = "none",
  onSelectStay,
  onSelectRoom,
  onRackSearchChange,
  onWalkIn,
}: {
  restaurantId: string;
  today: string;
  viewport: Viewport;
  rackFocus?: FoRackFocus | null;
  initialHorizon?: CalendarHorizon;
  initialFocusDate?: string;
  initialGroup?: RackGroupBy;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectRoom: (roomId: string) => void;
  onRackSearchChange?: (next: { horizon: CalendarHorizon; date: string; group: RackGroupBy }) => void;
  onWalkIn?: () => void;
}) {
  const [focusDate, setFocusDate] = useState(rackFocus?.focusDate ?? initialFocusDate ?? today);
  const [horizon, setHorizon] = useState<CalendarHorizon>(initialHorizon ?? (viewport === "phone" ? 1 : 7));
  const [groupBy, setGroupBy] = useState<RackGroupBy>(initialGroup);
  const [filters, setFilters] = useState<RackFilters>(() =>
    rackFocus
      ? {
          ...EMPTY_RACK_FILTERS,
          ...(rackFocus.roomType ? { roomType: rackFocus.roomType } : {}),
          ...(rackFocus.discrepancy ? { discrepancy: rackFocus.discrepancy } : {}),
        }
      : EMPTY_RACK_FILTERS,
  );
  const [draft, setDraft] = useState<RackConfirmDraft | null>(null);
  const [preview, setPreview] = useState<RackConfirmDraft | null>(null);

  const liveHorizon = isLiveHorizon(horizon);
  const days = liveHorizon ? horizon : 7;
  const rangeEnd = addDays(focusDate, days - 1);
  const pageSize = rackReservationPageSize(days);
  const showDrag = shouldShowDragHandle(viewport);

  const fetchOccupancy = useServerFn(listOccupancy);
  const fetchReservations = useServerFn(listReservations);
  const fetchDashboard = useServerFn(getFrontOfficeDashboard);
  const fetchHk = useServerFn(listRoomRack);
  const fetchFeeds = useServerFn(listFoExceptionFeeds);

  useEffect(() => {
    if (!rackFocus) return;
    if (rackFocus.focusDate) setFocusDate(rackFocus.focusDate);
    setFilters({
      ...EMPTY_RACK_FILTERS,
      ...(rackFocus.roomType ? { roomType: rackFocus.roomType } : {}),
      ...(rackFocus.discrepancy ? { discrepancy: rackFocus.discrepancy } : {}),
    });
  }, [rackFocus]);

  useEffect(() => {
    onRackSearchChange?.({ horizon, date: focusDate, group: groupBy });
  }, [horizon, focusDate, groupBy, onRackSearchChange]);

  const occupancyQuery = useQuery({
    queryKey: ["front-office", "occupancy", restaurantId],
    queryFn: () => fetchOccupancy({ data: { restaurantId } }),
    retry: false,
  });
  const reservationsQuery = useQuery({
    queryKey: ["front-office", "rack-reservations", restaurantId, focusDate, days, pageSize],
    queryFn: () =>
      collectRackReservationPages(
        (page, size) =>
          fetchReservations({
            data: { restaurantId, fromDate: focusDate, toDate: rangeEnd, page, pageSize: size },
          }),
        pageSize,
      ),
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
  const feedsQuery = useQuery({
    queryKey: ["front-office", "exception-feeds", restaurantId, today],
    queryFn: () => fetchFeeds({ data: { restaurantId, businessDate: today } }),
    retry: false,
  });

  const rooms = occupancyQuery.data ?? [];
  const stays = (reservationsQuery.data?.rows ?? []).filter((row) =>
    stayOverlapsRange(row.arrivalDate, row.departureDate, focusDate, days),
  );
  const hkByRoom = new Map((hkQuery.data ?? []).map((r) => [r.id, r]));
  const hkDenied = hkQuery.isError && isPermissionDeniedMessage(hkQuery.error);
  const hkAvailable = !hkDenied && !!hkQuery.data;
  const discrepancyLive = (feedsQuery.data?.discrepancyLane ?? "coming_soon") === "live";
  const openDiscrepancyRoomIds = new Set(
    discrepancyLive ? (feedsQuery.data?.discrepancies ?? []).map((row) => row.roomId) : [],
  );

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
        hasOpenDiscrepancy: openDiscrepancyRoomIds.has(room.id),
      },
      filters,
    ),
  );

  const visibleStays = stays.filter((stay) => stayMatchesFilters(stay, filters, focusDate));
  const unassigned = visibleStays.filter((s) => previewRoomId(s, preview) == null);
  const filterEmpty = rackFiltersActive(filters) && visibleStays.length === 0;

  function dismissConfirm() {
    setDraft(null);
    setPreview(null);
  }

  function openConfirm(next: RackConfirmDraft) {
    setPreview(next);
    setDraft(next);
  }

  if (occupancyQuery.isError && isPermissionDeniedMessage(occupancyQuery.error)) {
    return <PermissionDeniedPanel message="You don't have access to Front Office occupancy for this property." />;
  }
  if (liveHorizon && reservationsQuery.isError && isPermissionDeniedMessage(reservationsQuery.error)) {
    return <PermissionDeniedPanel message="You don't have access to Front Office reservations for this property." />;
  }

  const occupancyFailed = occupancyQuery.isError;
  const reservationsFailed = liveHorizon && reservationsQuery.isError;
  const loadError = occupancyFailed
    ? occupancyQuery.error
    : reservationsFailed
      ? reservationsQuery.error
      : null;

  return (
    <div className="space-y-4" data-testid="fo-room-rack-calendar">
      <OpsStrip
        {...(dashboardQuery.data ? { dashboard: dashboardQuery.data } : {})}
        loading={dashboardQuery.isLoading}
        rooms={rooms.map((room) => ({
          occupancy: room.occupancy,
          status: room.status,
          housekeepingStatus: hkByRoom.get(room.id)?.housekeepingStatus ?? null,
        }))}
        hkAvailable={hkAvailable}
        occupancyTrusted={!occupancyQuery.isError && !dashboardQuery.isError}
        openDiscrepancies={discrepancyLive ? (feedsQuery.data?.discrepancies.length ?? 0) : null}
        filters={filters}
        onFilter={(next) => setFilters({ ...EMPTY_RACK_FILTERS, ...next })}
      />

      <section className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm" data-testid="fo-rack-toolbar">
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="outline" size="sm" className="h-9" onClick={() => setFocusDate(today)}>
            Today
          </Button>
          <Button variant="outline" size="icon" className="size-9" onClick={() => setFocusDate(addDays(focusDate, -1))} aria-label="Previous day">
            <ChevronLeft className="size-4" />
          </Button>
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            Date
            <Input type="date" className="h-9 w-40" value={focusDate} onChange={(e) => setFocusDate(e.target.value)} />
          </label>
          <Button variant="outline" size="icon" className="size-9" onClick={() => setFocusDate(addDays(focusDate, 1))} aria-label="Next day">
            <ChevronRight className="size-4" />
          </Button>
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            View range
            <Select
              value={String(horizon)}
              onValueChange={(value) => setHorizon(Number(value) as CalendarHorizon)}
            >
              <SelectTrigger className="h-9 w-[9.5rem]" aria-label="View range" data-testid="fo-horizon-select">
                <SelectValue placeholder="View range" />
              </SelectTrigger>
              <SelectContent>
                {LIVE_HORIZONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {calendarHorizonLabel(n)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <RackFiltersButton
              filters={filters}
              onChange={setFilters}
              floors={floors}
              types={types}
              sources={sources}
              hkAvailable={hkAvailable}
            />
            {onWalkIn ? (
              <Button
                className="h-9 bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                data-testid="fo-walk-in-cta"
                onClick={onWalkIn}
              >
                Walk-in
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {hkDenied ? (
        <PermissionDeniedPanel
          className="py-3"
          message="Housekeeping status is hidden — you don't have access to the housekeeping feed. Occupancy is still shown."
        />
      ) : null}

      {filterEmpty ? (
        <p className="text-sm text-muted-foreground" data-testid="fo-rack-filter-empty">
          {NO_STAYS_MATCH_FILTERS}
        </p>
      ) : null}

      {!liveHorizon ? (
        <p className="text-sm text-muted-foreground">{horizon}-day calendar is not a live horizon.</p>
      ) : occupancyQuery.isLoading || reservationsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Room Rack + Calendar…</p>
      ) : loadError ? (
        <p className="text-sm text-destructive" data-testid="fo-rack-load-error">
          {loadError instanceof Error ? loadError.message : RACK_LOAD_FAILED}
        </p>
      ) : viewport === "phone" ? (
        <PhoneRackList
          rooms={visibleRooms}
          stays={visibleStays}
          hkByRoom={hkByRoom}
          today={focusDate}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
          openDiscrepancyRoomIds={openDiscrepancyRoomIds}
          onSelectStay={onSelectStay}
          onSelectRoom={onSelectRoom}
        />
      ) : (
        <CalendarBoard
          rooms={visibleRooms}
          stays={visibleStays}
          unassigned={unassigned}
          hkByRoom={hkByRoom}
          hkAvailable={hkAvailable}
          focusDate={focusDate}
          days={days}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
          showDrag={showDrag}
          preview={preview}
          openDiscrepancyRoomIds={openDiscrepancyRoomIds}
          highlightRoomId={rackFocus?.roomId ?? null}
          onSelectStay={onSelectStay}
          onSelectRoom={onSelectRoom}
          onPreview={setPreview}
          onOpenConfirm={openConfirm}
        />
      )}

      <RackLegend />

      <FoRackConfirmSheet
        restaurantId={restaurantId}
        draft={draft}
        open={!!draft}
        overlappingStays={stays}
        onOpenChange={(open) => {
          if (!open) dismissConfirm();
        }}
      />
    </div>
  );
}

function previewRoomId(stay: ReservationDetail, preview: RackConfirmDraft | null): string | null {
  if (preview?.kind === "move_room" && preview.reservationId === stay.id) return preview.targetRoomId;
  return stay.roomId;
}

function previewDates(
  stay: ReservationDetail,
  preview: RackConfirmDraft | null,
): { arrival: string; departure: string } {
  if (preview?.kind === "change_dates" && preview.reservationId === stay.id) {
    return { arrival: preview.nextArrivalDate, departure: preview.nextDepartureDate };
  }
  return { arrival: stay.arrivalDate, departure: stay.departureDate };
}

function OpsStrip({
  dashboard,
  loading,
  rooms,
  hkAvailable,
  occupancyTrusted = true,
  openDiscrepancies = null,
  filters,
  onFilter,
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
  rooms: Array<{ occupancy: "vacant" | "occupied"; status: string; housekeepingStatus?: string | null }>;
  hkAvailable: boolean;
  occupancyTrusted?: boolean;
  openDiscrepancies?: number | null;
  filters: RackFilters;
  onFilter: (next: Partial<RackFilters>) => void;
}) {
  const cards = dashboard
    ? deriveOpsStrip({
        arrivalsToday: dashboard.arrivalsToday,
        departuresToday: dashboard.departuresToday,
        inHouse: dashboard.inHouse,
        availableRooms: dashboard.availableRooms,
        occupiedRooms: dashboard.occupiedRooms,
        outOfOrder: dashboard.outOfOrder,
        outOfService: dashboard.outOfService,
        rooms,
        hkAvailable,
        occupancyTrusted,
        openDiscrepancies,
      })
    : [];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-6" data-testid="fo-ops-strip">
      {loading ? <p className="text-xs text-muted-foreground">Loading occupancy strip…</p> : null}
      {cards.map((item) => {
        const active = isOpsStripFilterActive(filters, item.filter);
        const meta = opsKpiMeta(item.id);
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`fo-ops-${item.id}`}
            aria-pressed={active}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-xl border bg-white px-3 py-3 text-left shadow-sm transition-colors",
              active ? "border-[#C89933] ring-1 ring-[#C89933]/40" : "border-[#DDD4C5] hover:border-[#C89933]",
            )}
            onClick={() => onFilter(item.filter)}
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", meta.tone)}>{meta.icon}</span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium text-[#756A5B]">{item.label}</p>
              <p className="font-display text-xl font-semibold leading-tight tracking-tight text-[#251605]">
                {item.display ?? item.value}
              </p>
              {meta.hint ? <p className="truncate text-[9px] text-muted-foreground">{meta.hint}</p> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function opsKpiMeta(id: string): { icon: ReactNode; tone: string; hint?: string } {
  switch (id) {
    case "arrivals":
      return { icon: <LogIn className="size-4" />, tone: "bg-emerald-50 text-emerald-700", hint: "Today" };
    case "departures":
      return { icon: <LogOut className="size-4" />, tone: "bg-rose-50 text-rose-700", hint: "Today" };
    case "in_house":
      return { icon: <House className="size-4" />, tone: "bg-blue-50 text-blue-700" };
    case "occupied":
      return { icon: <BedDouble className="size-4" />, tone: "bg-amber-50 text-amber-800" };
    case "available":
      return { icon: <DoorOpen className="size-4" />, tone: "bg-indigo-50 text-indigo-700" };
    case "vacant":
      return { icon: <Circle className="size-4" />, tone: "bg-slate-50 text-slate-600" };
    case "vacant_dirty":
      return { icon: <AlertTriangle className="size-4" />, tone: "bg-orange-50 text-orange-700" };
    case "vacant_clean":
      return { icon: <Sparkles className="size-4" />, tone: "bg-teal-50 text-teal-700" };
    case "ooo":
      return { icon: <Ban className="size-4" />, tone: "bg-neutral-100 text-neutral-600" };
    case "oos":
      return { icon: <Ban className="size-4" />, tone: "bg-stone-100 text-stone-600" };
    case "occupancy_pct":
      return { icon: <Percent className="size-4" />, tone: "bg-[#F4E9D0] text-[#8A641A]" };
    case "discrepancies":
      return { icon: <Triangle className="size-4" />, tone: "bg-amber-50 text-amber-700" };
    default:
      return { icon: <UserRound className="size-4" />, tone: "bg-[#F4E9D0] text-[#8A641A]" };
  }
}

function RackFiltersButton({
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
  const activeCount = countActiveRackFilters(filters);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid="fo-filters-button">
          <Filter className="size-3.5" />
          Filters
          {activeCount > 0 ? (
            <span
              data-testid="fo-filters-count"
              className="ml-1 min-w-5 rounded-full bg-[#C89933] px-1.5 text-center text-[10px] leading-5 text-[#251605]"
            >
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3" data-testid="fo-filters-popover">
        <FilterRow
          filters={filters}
          onChange={onChange}
          floors={floors}
          types={types}
          sources={sources}
          hkAvailable={hkAvailable}
        />
      </PopoverContent>
    </Popover>
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
            ["pickup", "Pickup"],
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
        label="Group"
        value={filters.group}
        onChange={(v) => set("group", v)}
        options={[["group", "Group only"]]}
      />
      <FilterSelect
        label="Corporate"
        value={filters.corporate}
        onChange={(v) => set("corporate", v)}
        options={[["corporate", "Corporate only"]]}
      />
      <FilterSelect
        label="Special request"
        value={filters.specialRequest}
        onChange={(v) => set("specialRequest", v)}
        options={[["special", "Special request"]]}
      />
      <FilterSelect
        label="Source"
        value={filters.source}
        onChange={(v) => set("source", v)}
        options={sources.map((s) => [s, s] as const)}
      />
      {countActiveRackFilters(filters) > 0 ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(EMPTY_RACK_FILTERS)}>
          Clear
        </Button>
      ) : null}
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

function RackGroupSelect({
  groupBy,
  onGroupBy,
}: {
  groupBy: RackGroupBy;
  onGroupBy: (next: RackGroupBy) => void;
}) {
  return (
    <Select value={groupBy} onValueChange={(value) => onGroupBy(value as RackGroupBy)}>
      <SelectTrigger className="h-7 w-[8.75rem] text-xs" aria-label="Group rooms" data-testid="fo-rack-group-by">
        <SelectValue placeholder="Grouping" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No grouping</SelectItem>
        <SelectItem value="floor">Floor</SelectItem>
        <SelectItem value="room_type">Room Type</SelectItem>
      </SelectContent>
    </Select>
  );
}

function CalendarBoard({
  rooms,
  stays,
  unassigned,
  hkByRoom,
  hkAvailable,
  focusDate,
  days,
  groupBy,
  onGroupBy,
  showDrag,
  preview,
  openDiscrepancyRoomIds,
  highlightRoomId,
  onSelectStay,
  onSelectRoom,
  onPreview,
  onOpenConfirm,
}: {
  rooms: OccupancyRoom[];
  stays: ReservationDetail[];
  unassigned: ReservationDetail[];
  hkByRoom: Map<string, RackRoom>;
  hkAvailable: boolean;
  focusDate: string;
  days: number;
  groupBy: RackGroupBy;
  onGroupBy: (next: RackGroupBy) => void;
  showDrag: boolean;
  preview: RackConfirmDraft | null;
  openDiscrepancyRoomIds: Set<string>;
  highlightRoomId: string | null;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectRoom: (roomId: string) => void;
  onPreview: (next: RackConfirmDraft | null) => void;
  onOpenConfirm: (next: RackConfirmDraft) => void;
}) {
  const dates = dateRange(focusDate, days);
  const colMin = rackColumnMinPx(days);
  const byRoom = new Map<string, ReservationDetail[]>();
  for (const stay of stays) {
    const roomId = previewRoomId(stay, preview);
    if (!roomId) continue;
    const list = byRoom.get(roomId) ?? [];
    list.push(stay);
    byRoom.set(roomId, list);
  }

  function dropOnRoom(reservationId: string, room: OccupancyRoom) {
    const stay = stays.find((row) => row.id === reservationId);
    if (!stay) return;
    onRackDrop({ reservationId, targetRoomId: room.id }, {});
    const verdict = classifyVerticalDrop({
      reservationId: stay.id,
      currentRoomId: stay.roomId,
      stayRoomTypeId: stay.roomTypeId,
      stayRoomTypeName: stay.roomTypeName,
      targetRoomId: room.id,
      targetStatus: room.status,
      targetRoomTypeId: room.roomTypeId,
      targetRoomTypeName: room.roomTypeName,
    });
    if (verdict.action === "noop") {
      onPreview(null);
      return;
    }
    if (verdict.action === "snap_back") {
      onPreview(null);
      toast.error(verdict.message);
      return;
    }
    const hk = hkByRoom.get(room.id);
    onOpenConfirm({
      kind: "move_room",
      reservationId: stay.id,
      guestName: stay.guestName,
      confirmationNumber: stay.confirmationNumber,
      status: stay.status,
      currentRoomId: stay.roomId,
      currentRoomNumber: stay.roomNumber,
      currentRoomTypeId: stay.roomTypeId,
      currentRoomTypeName: stay.roomTypeName,
      targetRoomId: room.id,
      targetRoomNumber: room.roomNumber,
      targetRoomTypeId: room.roomTypeId,
      targetRoomTypeName: room.roomTypeName,
      targetStatus: room.status,
      targetHousekeeping: hk?.housekeepingStatus ?? null,
      hkKnown: hkAvailable && !!hk,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
    });
  }

  function openDateConfirm(stay: ReservationDetail, nextArrival: string, nextDeparture: string) {
    onRackResizeRelease({ reservationId: stay.id, nextArrival, nextDeparture }, {});
    if (nextArrival === stay.arrivalDate && nextDeparture === stay.departureDate) {
      onPreview(null);
      return;
    }
    const assigned = stay.roomId ? rooms.find((room) => room.id === stay.roomId) : undefined;
    const hk = stay.roomId ? hkByRoom.get(stay.roomId) : undefined;
    onOpenConfirm({
      kind: "change_dates",
      reservationId: stay.id,
      guestName: stay.guestName,
      confirmationNumber: stay.confirmationNumber,
      status: stay.status,
      currentRoomId: stay.roomId,
      currentRoomNumber: stay.roomNumber,
      currentRoomTypeId: stay.roomTypeId,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
      nextArrivalDate: nextArrival,
      nextDepartureDate: nextDeparture,
      currentRoomStatus: assigned?.status ?? null,
      currentHousekeeping: hk?.housekeepingStatus ?? null,
      hkKnown: !!stay.roomId && hkAvailable && !!hk,
      roomSubtotal: stay.roomSubtotal,
      nightlyRates: stay.nightlyRates,
    });
  }

  return (
    <div
      className="overflow-auto rounded-xl border border-[#DDD4C5] bg-[#FAF8F4] shadow-sm"
      data-testid="fo-calendar-board"
      data-focus-date={focusDate}
    >
      <div
        className="min-w-max"
        style={{
          display: "grid",
          gridTemplateColumns: `220px repeat(${days}, minmax(${colMin}px, 1fr))`,
        }}
      >
        <div className="sticky left-0 z-20 flex items-center justify-between gap-2 border-b border-r border-border bg-card px-2 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room</span>
          <RackGroupSelect groupBy={groupBy} onGroupBy={onGroupBy} />
        </div>
        {dates.map((d) => (
          <div key={d} className="border-b border-border px-3 py-2 text-xs font-medium">
            {formatStayDate(d)}
          </div>
        ))}

        {unassigned.length > 0 ? (
          <UnassignedRow
            stays={unassigned}
            focusDate={focusDate}
            days={days}
            dates={dates}
            colMin={colMin}
            showDrag={showDrag}
            preview={preview}
            onSelectStay={onSelectStay}
            onPreview={onPreview}
            onOpenDateConfirm={openDateConfirm}
          />
        ) : null}

        {groupRackRooms(rooms, groupBy).map((group) => (
          <Fragment key={group.key}>
            {groupBy !== "none" ? (
              <div
                className="sticky left-0 z-10 border-b border-[#DDD4C5] bg-[#F3EEE4] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#765719]"
                style={{ gridColumn: `1 / span ${days + 1}` }}
                data-testid="fo-rack-group"
              >
                {group.label}
              </div>
            ) : null}
            {group.rooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                hk={hkByRoom.get(room.id) ?? null}
                stays={byRoom.get(room.id) ?? []}
                focusDate={focusDate}
                days={days}
                dates={dates}
                colMin={colMin}
                showDrag={showDrag}
                preview={preview}
                hasOpenDiscrepancy={openDiscrepancyRoomIds.has(room.id)}
                highlight={highlightRoomId === room.id}
                onSelectStay={onSelectStay}
                onSelectRoom={onSelectRoom}
                onDropStay={(id) => dropOnRoom(id, room)}
                onPreview={onPreview}
                onOpenDateConfirm={openDateConfirm}
              />
            ))}
          </Fragment>
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
  colMin,
  showDrag,
  preview,
  onSelectStay,
  onPreview,
  onOpenDateConfirm,
}: {
  stays: ReservationDetail[];
  focusDate: string;
  days: number;
  dates: string[];
  colMin: number;
  showDrag: boolean;
  preview: RackConfirmDraft | null;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onPreview: (next: RackConfirmDraft | null) => void;
  onOpenDateConfirm: (stay: ReservationDetail, arrival: string, departure: string) => void;
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
        data-testid="fo-room-track"
        style={{ gridColumn: `2 / span ${dates.length}`, minHeight: 56 }}
      >
        <BarTrack
          stays={stays}
          focusDate={focusDate}
          days={days}
          colMin={colMin}
          showDrag={showDrag}
          preview={preview}
          onSelectStay={onSelectStay}
          onPreview={onPreview}
          onOpenDateConfirm={onOpenDateConfirm}
        />
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
  colMin,
  showDrag,
  preview,
  hasOpenDiscrepancy,
  highlight,
  onSelectStay,
  onSelectRoom,
  onDropStay,
  onPreview,
  onOpenDateConfirm,
}: {
  room: OccupancyRoom;
  hk: RackRoom | null;
  stays: ReservationDetail[];
  focusDate: string;
  days: number;
  dates: string[];
  colMin: number;
  showDrag: boolean;
  preview: RackConfirmDraft | null;
  hasOpenDiscrepancy: boolean;
  highlight: boolean;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectRoom: (roomId: string) => void;
  onDropStay: (reservationId: string) => void;
  onPreview: (next: RackConfirmDraft | null) => void;
  onOpenDateConfirm: (stay: ReservationDetail, arrival: string, departure: string) => void;
}) {
  return (
    <>
      <div
        className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-sm"
        data-testid="fo-room-row"
        data-room-id={room.id}
        data-highlighted={highlight ? "true" : undefined}
        style={highlight ? { outline: `2px solid ${FO_BRAND.gold}` } : undefined}
        onDragOver={
          showDrag
            ? (e) => {
                if (e.dataTransfer.types.includes(FO_DRAG_MIME) || e.dataTransfer.types.includes("text/plain")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              }
            : undefined
        }
        onDrop={
          showDrag
            ? (e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData(FO_DRAG_MIME) || e.dataTransfer.getData("text/plain");
                if (id) onDropStay(id);
              }
            : undefined
        }
      >
        <button
          type="button"
          className="inline-flex max-w-full items-center gap-1.5 text-left font-medium"
          data-testid="fo-room-identity"
          onClick={() => onSelectRoom(room.id)}
        >
          <span>{room.roomNumber}</span>
          <FoHkStatusGlyph status={hk?.housekeepingStatus} />
          <span className="text-xs font-normal text-muted-foreground">{room.roomTypeName}</span>
        </button>
        <StayBadgeStrip
          badges={liveStayBadges({ guestVip: false, hasOpenDiscrepancy })}
          mode={badgeDisplayMode(days)}
        />
        <p className="text-xs text-muted-foreground">
          {room.floor ? `Floor ${room.floor}` : "—"} · {room.occupancy}
        </p>
        <p className="truncate text-xs text-muted-foreground">{room.guestName ?? "Vacant"}</p>
      </div>
      <div
        className="relative border-b border-border"
        style={{ gridColumn: `2 / span ${dates.length}`, minHeight: 56 }}
        data-testid="fo-room-track"
        data-room-id={room.id}
        onDragOver={
          showDrag
            ? (e) => {
                if (e.dataTransfer.types.includes(FO_DRAG_MIME) || e.dataTransfer.types.includes("text/plain")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              }
            : undefined
        }
        onDrop={
          showDrag
            ? (e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData(FO_DRAG_MIME) || e.dataTransfer.getData("text/plain");
                if (id) onDropStay(id);
              }
            : undefined
        }
      >
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${days}, minmax(${colMin}px, 1fr))` }}
        >
          {dates.map((d) => (
            <div key={d} className="border-l border-[#CCCCCC]/70" />
          ))}
        </div>
        <BarTrack
          stays={stays}
          focusDate={focusDate}
          days={days}
          colMin={colMin}
          showDrag={showDrag}
          preview={preview}
          hasOpenDiscrepancy={hasOpenDiscrepancy}
          onSelectStay={onSelectStay}
          onPreview={onPreview}
          onOpenDateConfirm={onOpenDateConfirm}
        />
      </div>
    </>
  );
}

function BarTrack({
  stays,
  focusDate,
  days,
  colMin,
  showDrag,
  preview,
  hasOpenDiscrepancy = false,
  onSelectStay,
  onPreview,
  onOpenDateConfirm,
}: {
  stays: ReservationDetail[];
  focusDate: string;
  days: number;
  colMin: number;
  showDrag: boolean;
  preview: RackConfirmDraft | null;
  hasOpenDiscrepancy?: boolean;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onPreview: (next: RackConfirmDraft | null) => void;
  onOpenDateConfirm: (stay: ReservationDetail, arrival: string, departure: string) => void;
}) {
  return (
    <div
      className="relative grid h-full min-h-14 px-1 py-1"
      style={{ gridTemplateColumns: `repeat(${days}, minmax(${colMin}px, 1fr))` }}
    >
      {stays.map((stay) => {
        const dates = previewDates(stay, preview);
        const place = reservationBarPlacement(dates.arrival, dates.departure, focusDate, days);
        if (!place) return null;
        return (
          <ReservationBar
            key={stay.id}
            stay={stay}
            startCol={place.startCol}
            endCol={place.endCol}
            days={days}
            focusDate={focusDate}
            showDrag={showDrag}
            onSelectStay={onSelectStay}
            onPreviewDates={(arrival, departure) =>
              onPreview({
                kind: "change_dates",
                reservationId: stay.id,
                guestName: stay.guestName,
                confirmationNumber: stay.confirmationNumber,
                status: stay.status,
                currentRoomId: stay.roomId,
                currentRoomNumber: stay.roomNumber,
                currentRoomTypeId: stay.roomTypeId,
                arrivalDate: stay.arrivalDate,
                departureDate: stay.departureDate,
                nextArrivalDate: arrival,
                nextDepartureDate: departure,
                roomSubtotal: stay.roomSubtotal,
                nightlyRates: stay.nightlyRates,
              })
            }
            onCommitDates={(arrival, departure) => onOpenDateConfirm(stay, arrival, departure)}
            hasOpenDiscrepancy={hasOpenDiscrepancy}
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
  days,
  focusDate,
  showDrag,
  hasOpenDiscrepancy = false,
  onSelectStay,
  onPreviewDates,
  onCommitDates,
}: {
  stay: ReservationDetail;
  startCol: number;
  endCol: number;
  days: number;
  focusDate: string;
  showDrag: boolean;
  hasOpenDiscrepancy?: boolean;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onPreviewDates: (arrival: string, departure: string) => void;
  onCommitDates: (arrival: string, departure: string) => void;
}) {
  const dragged = useRef(false);
  const badges = liveStayBadges({ ...stay, hasOpenDiscrepancy });
  const compact = badgeDisplayMode(days);

  return (
    <div
      className="relative mx-0.5 flex min-w-0 items-stretch"
      style={{ gridColumn: `${startCol} / ${endCol}` }}
    >
      {showDrag ? (
        <span
          data-testid="fo-resize-start"
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize"
          onPointerDown={(e) =>
            startDateGesture(e, stay, "arrival", days, focusDate, onPreviewDates, onCommitDates, dragged)
          }
        />
      ) : null}
      <button
        type="button"
        data-testid="fo-reservation-bar"
        className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-left text-xs text-white"
        style={{ backgroundColor: reservationBarColor(stay.status) }}
        onPointerDown={
          showDrag
            ? (e) => startDateGesture(e, stay, "shift", days, focusDate, onPreviewDates, onCommitDates, dragged)
            : undefined
        }
        onClick={(event) => {
          event.stopPropagation();
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onSelectStay(stayFromReservation(stay, stay.arrivalDate));
        }}
      >
        {showDrag ? (
          <span
            data-testid="fo-drag-handle"
            draggable
            className="shrink-0 cursor-grab text-white/80"
            aria-label="Drag to another room"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.dataTransfer.setData(FO_DRAG_MIME, stay.id);
              e.dataTransfer.setData("text/plain", stay.id);
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            <GripVertical className="size-3.5" />
          </span>
        ) : null}
        <span className="truncate font-medium">{stay.guestName}</span>
        <StayBadgeStrip badges={badges} mode={compact} />
      </button>
      {showDrag ? (
        <span
          data-testid="fo-resize-end"
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize"
          onPointerDown={(e) =>
            startDateGesture(e, stay, "departure", days, focusDate, onPreviewDates, onCommitDates, dragged)
          }
        />
      ) : null}
    </div>
  );
}

function startDateGesture(
  event: ReactPointerEvent<HTMLElement>,
  stay: ReservationDetail,
  mode: "arrival" | "departure" | "shift",
  days: number,
  focusDate: string,
  onPreviewDates: (arrival: string, departure: string) => void,
  onCommitDates: (arrival: string, departure: string) => void,
  dragged: { current: boolean },
) {
  event.stopPropagation();
  const track = event.currentTarget.closest("[data-testid='fo-room-track']") as HTMLElement | null;
  if (!track) return;
  const el: HTMLElement = track;
  const startX = event.clientX;
  const originArrival = stay.arrivalDate;
  const originDeparture = stay.departureDate;
  let latestArrival = originArrival;
  let latestDeparture = originDeparture;
  dragged.current = false;

  function datesFromX(clientX: number): { arrival: string; departure: string } {
    const rect = el.getBoundingClientRect();
    const colWidth = rect.width / Math.max(days, 1);
    if (mode === "shift") {
      const delta = Math.round((clientX - startX) / colWidth);
      return { arrival: addDays(originArrival, delta), departure: addDays(originDeparture, delta) };
    }
    const ratio = rect.width <= 0 ? 0 : Math.min(0.999, Math.max(0, (clientX - rect.left) / rect.width));
    const index = Math.min(days - 1, Math.max(0, Math.floor(ratio * days)));
    const at = addDays(focusDate, index);
    if (mode === "arrival") {
      const arrival = at < originDeparture ? at : addDays(originDeparture, -1);
      return { arrival, departure: originDeparture };
    }
    const departure = addDays(at, 1);
    return {
      arrival: originArrival,
      departure: departure > originArrival ? departure : addDays(originArrival, 1),
    };
  }

  function onMove(ev: PointerEvent) {
    if (Math.abs(ev.clientX - startX) > 4) dragged.current = true;
    if (!dragged.current) return;
    const next = datesFromX(ev.clientX);
    latestArrival = next.arrival;
    latestDeparture = next.departure;
    onPreviewDates(next.arrival, next.departure);
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (!dragged.current) return;
    onCommitDates(latestArrival, latestDeparture);
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function PhoneRackList({
  rooms,
  stays,
  hkByRoom,
  today,
  groupBy,
  onGroupBy,
  openDiscrepancyRoomIds,
  onSelectStay,
  onSelectRoom,
}: {
  rooms: OccupancyRoom[];
  stays: ReservationDetail[];
  hkByRoom: Map<string, RackRoom>;
  today: string;
  groupBy: RackGroupBy;
  onGroupBy: (next: RackGroupBy) => void;
  openDiscrepancyRoomIds: Set<string>;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectRoom: (roomId: string) => void;
}) {
  const todayStays = stays.filter((s) => s.arrivalDate <= today && s.departureDate > today);
  return (
    <div className="space-y-3" data-testid="fo-phone-rack-list">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room</p>
        <RackGroupSelect groupBy={groupBy} onGroupBy={onGroupBy} />
      </div>
      <p className="text-sm text-muted-foreground">
        Phone shows rooms and today&apos;s stays. The week Gantt stays on larger screens.
      </p>
      {groupRackRooms(rooms, groupBy).map((group) => (
        <div key={group.key} className="space-y-2">
          {groupBy !== "none" ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#765719]" data-testid="fo-rack-group">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-2">
            {group.rooms.map((room) => {
              const hk = hkByRoom.get(room.id);
              return (
                <li key={room.id} className="rounded-xl border border-[#DDD4C5] bg-card p-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-left font-medium"
                    data-testid="fo-room-identity"
                    onClick={() => onSelectRoom(room.id)}
                  >
                    <span>{room.roomNumber}</span>
                    <FoHkStatusGlyph status={hk?.housekeepingStatus} />
                    <span className="font-normal text-muted-foreground">· {room.roomTypeName}</span>
                  </button>
                  <StayBadgeStrip
                    badges={liveStayBadges({ guestVip: false, hasOpenDiscrepancy: openDiscrepancyRoomIds.has(room.id) })}
                    mode="full"
                  />
                  <p className="text-xs text-muted-foreground">
                    {room.occupancy} · {room.guestName ?? "Vacant"}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <ul className="space-y-2">
        {todayStays.map((stay) => (
          <li key={stay.id}>
            <button
              type="button"
              data-testid="fo-phone-stay"
              className="w-full rounded-xl border border-[#DDD4C5] bg-card p-3 text-left"
              onClick={() => onSelectStay(stayFromReservation(stay, today))}
            >
              <p className="font-medium">{stay.guestName}</p>
              <p className="text-xs text-muted-foreground">
                {stay.confirmationNumber} · {stay.roomNumber ?? "Unassigned"}
              </p>
              <StayBadgeStrip
                badges={liveStayBadges({
                  ...stay,
                  hasOpenDiscrepancy: Boolean(stay.roomId && openDiscrepancyRoomIds.has(stay.roomId)),
                })}
                mode="full"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RackLegend() {
  return (
    <Collapsible defaultOpen={FO_LEGEND_DEFAULT_OPEN} data-testid="fo-rack-legend">
      <CollapsibleTrigger
        type="button"
        data-testid="fo-legend-toggle"
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
      >
        <span>Legend</span>
        <span className="text-xs text-muted-foreground">Room · Housekeeping · Reservation</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className="grid gap-4 md:grid-cols-3">
          <Legend title="Room" items={ROOM_LEGEND} />
          <Legend title="Housekeeping" items={HK_LEGEND} />
          <Legend title="Reservation" items={RESERVATION_LEGEND} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Legend({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; color: string; shape: "swatch" | "glyph" | "bar" }[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.key} className="inline-flex items-center gap-1.5 text-xs">
            <LegendMark item={item} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LegendMark({
  item,
}: {
  item: { key: string; color: string; shape: "swatch" | "glyph" | "bar" };
}) {
  if (item.shape === "bar") {
    return <span className="h-2 w-5 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden />;
  }
  if (item.shape === "glyph") {
    return <FoHkStatusGlyph status={item.key} />;
  }
  return <span className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden />;
}

function FoHkStatusGlyph({ status }: { status: string | null | undefined }) {
  const live = liveHkStatus(status);
  const label = hkStatusAriaLabel(status);
  if (!live || !label) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="fo-hk-glyph"
          data-hk-status={live}
          className="inline-flex size-4 items-center justify-center"
          aria-label={label}
        >
          <HkGlyphIcon status={live} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function HkGlyphIcon({ status }: { status: LiveHkStatus }) {
  const color = HK_LEGEND.find((item) => item.key === status)?.color;
  const iconClass = "size-3.5";
  if (status === "clean") return <Check className={iconClass} style={{ color }} aria-hidden />;
  if (status === "dirty") return <Circle className={iconClass} fill={color} style={{ color }} aria-hidden />;
  if (status === "inspected") return <ScanSearch className={iconClass} style={{ color }} aria-hidden />;
  return <Triangle className={iconClass} fill={color} style={{ color }} aria-hidden />;
}

export function dropReservationOnRoom(reservationId: string, targetRoomId: string) {
  return onRackDrop({ reservationId, targetRoomId }, {});
}
