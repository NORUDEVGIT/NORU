import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  BedDouble,
  CalendarMinus,
  CalendarPlus,
  Check,
  Download,
  Circle,
  Clock,
  DoorOpen,
  Eye,
  GripVertical,
  House,
  LayoutGrid,
  LogIn,
  LogOut,
  MessageSquare,
  MoreVertical,
  Pencil,
  Percent,
  Receipt,
  RefreshCw,
  ScanSearch,
  Search,
  Sparkles,
  Table2,
  Triangle,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import {
  PmsFilterChoiceRow,
  PmsFilterMenu,
  PmsFilterNoteRow,
} from "@/packages/pms/components/pms-filter-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import {
  ComingSoonChip,
  PermissionDeniedPanel,
} from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { FoRackConfirmSheet } from "@/packages/pms/components/frontoffice/fo-rack-confirm-sheet";
import { useFoToolbarSlot } from "@/packages/pms/components/frontoffice/front-office-chrome";
import { StayBadgeStrip } from "@/packages/pms/components/frontoffice/fo-stay-badges";
import { FoStayAmendedMark } from "@/packages/pms/components/frontoffice/fo-stay-amendment-presentation";
import {
  latestStayAmendmentByReservation,
  type FoStayAmendmentHistoryRow,
} from "@/packages/pms/lib/fo-amendments";
import {
  EMPTY_RACK_FILTERS,
  FO_BRAND,
  HK_LEGEND,
  LIVE_HORIZONS,
  RESERVATION_BAR_SOFT_BG_ALPHA,
  RESERVATION_BAR_SOFT_BORDER_ALPHA,
  calendarHorizonLabel,
  countActiveRackFilters,
  dateRange,
  hkStatusAriaLabel,
  isLiveHorizon,
  isPermissionDeniedMessage,
  liveHkStatus,
  reservationBarPlacement,
  roomMatchesFilters,
  shouldShowDragHandle,
  stayMatchesFilters,
  stayMatchesRackCategory,
  stayOverlapsRange,
  groupRackRooms,
  rackFrozenGridTemplate,
  rackFrozenStickyLeftPx,
  rackGroupHeaderColumnSpan,
  rackFloorSecondaryLabel,
  rackRoomStatusDisplay,
  RACK_DATE_TRACK_GRID_COLUMN,
  RACK_FROZEN_COLUMN_COUNT,
  type CalendarHorizon,
  type FoNavId,
  type LiveHkStatus,
  type RackFilters,
  type RackGroupBy,
} from "@/packages/pms/lib/front-office-shell";
import {
  foRackCheckedInStay,
  foRackConfirmedAssignedStay,
  type FoRackInHouseTarget,
} from "@/packages/pms/lib/fo-check-in-workspace";
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
import type { FoHkTaskRoomTarget } from "@/packages/pms/components/frontoffice/fo-housekeeping-task-modal";
import { listReservations } from "@/packages/pms/lib/reservations.functions";
import {
  DaysRangeSelect,
  PMS_ICON_BUTTON,
  WeekRangeControl,
  initialWeekFocusDate,
  mondayOf,
  readSharedWeekStart,
  writeSharedWeekStart,
} from "@/packages/pms/components/pms-week-controls";
import {
  exportReservationsToPdf,
  openPdfWindow,
} from "@/packages/pms/components/reservations/reservation-export-pdf";
import { addDays, formatStayDate } from "@/packages/pms/lib/reservation-dates";
import {
  useMoveEligibleRoomIds,
  type MoveDragStay,
} from "@/packages/pms/components/use-move-eligible-rooms";
import { cn } from "@/shared/lib/utils";
import { deriveOpsStrip, type FoRackFocus, type OpsStripItem } from "@/packages/pms/lib/fo-exceptions";
import { listFoExceptionFeeds } from "@/packages/pms/lib/fo-exceptions.functions";
import { foOperationalQueryOptions } from "@/packages/pms/lib/fo-freshness";
import {
  foRackActionStay,
  foRackUnitIdentity,
  foRackBarMenuItems,
  foRackMaintenanceRelevant,
  projectRackStays,
  type FoRackBarActionId,
  type FoRackStay,
  type FoRackBarMenuItem,
} from "@/packages/pms/lib/fo-rack-bar-menu";

type Viewport = "phone" | "wide";

/** FO UI polish — Rack/Table/List all render the same stay/room data. No second business logic. */
type FoRackViewMode = "rack" | "table";

const FO_DRAG_MIME = "application/x-fo-reservation";

function exportRackStays(
  restaurantName: string,
  rangeStart: string,
  rangeEnd: string,
  stays: readonly FoRackStay[],
) {
  const printWindow = openPdfWindow();
  if (!printWindow) return;
  exportReservationsToPdf({
    printWindow,
    title: "Front Office",
    restaurantName,
    scope: "Room Rack",
    rangeLabel: `${formatStayDate(rangeStart)} – ${formatStayDate(rangeEnd)}`,
    rows: stays.map((stay) => ({
      confirmationNumber: stay.confirmationNumber,
      guestName: stay.guestName,
      roomTypeName: stay.roomTypeName,
      room: stay.roomNumber ?? "Unassigned",
      arrival: formatStayDate(stay.arrivalDate),
      departure: formatStayDate(stay.departureDate),
      nights: stay.nights,
      adults: stay.adults,
      children: stay.children,
      status: stay.status.replaceAll("_", " "),
      source: stay.source,
      ratePlan: stay.ratePlanName ?? "—",
      total:
        stay.roomSubtotal == null
          ? "—"
          : `${stay.currency ?? ""} ${stay.roomSubtotal.toFixed(2)}`.trim(),
    })),
  });
}

export function RoomRackCalendar({
  restaurantId,
  restaurantName = "Front Office",
  today,
  viewport,
  rackFocus = null,
  initialHorizon,
  initialFocusDate,
  initialGroup = "none",
  onSelectStay,
  onSelectInHouse,
  onSelectRoom,
  onRackAction,
  canOpenCashiering,
  staffRole,
  onRackSearchChange,
  onWalkIn,
  category = "rack",
  exceptionStayIds,
  exceptionRoomIds,
  amendmentStayIds,
  amendmentHistory,
}: {
  restaurantId: string;
  restaurantName?: string;
  today: string;
  viewport: Viewport;
  rackFocus?: FoRackFocus | null;
  initialHorizon?: CalendarHorizon;
  initialFocusDate?: string;
  initialGroup?: RackGroupBy;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectInHouse: (target: FoRackInHouseTarget) => void;
  onSelectRoom: (target: FoHkTaskRoomTarget) => void;
  onRackAction: (action: FoRackBarActionId, stay: FrontOfficeStay) => void;
  canOpenCashiering: boolean;
  staffRole?: string;
  onRackSearchChange?: (next: {
    horizon: CalendarHorizon;
    date: string;
    group: RackGroupBy;
  }) => void;
  onWalkIn?: () => void;
  /**
   * Burger-menu-as-filter: narrows the shared Rack/Table dataset to the selected former
   * nav target in place. "rack" ("All") applies no extra narrowing.
   */
  category?: FoNavId;
  /** Reservation ids surfaced by the existing exception desk — used only when category is "exceptions". */
  exceptionStayIds?: ReadonlySet<string>;
  /** Room ids surfaced by the existing exception desk — used only when category is "exceptions". */
  exceptionRoomIds?: ReadonlySet<string>;
  /** Reservation ids with canonical stay-date amendment history — used when category is "amendments". */
  amendmentStayIds?: ReadonlySet<string>;
  /** Batched stay-date amendment rows for Rack/Table indicators (not N+1). */
  amendmentHistory?: readonly FoStayAmendmentHistoryRow[];
}) {
  const [horizon, setHorizon] = useState<CalendarHorizon>(initialHorizon ?? 7);
  const [focusDate, setFocusDate] = useState(() =>
    initialWeekFocusDate({
      today,
      ...(initialFocusDate ? { initialFocusDate } : {}),
      sharedMonday: readSharedWeekStart(restaurantId),
      weekAligned: (initialHorizon ?? 7) === 7,
    }),
  );
  const [groupBy, setGroupBy] = useState<RackGroupBy>(initialGroup);
  const [rackView, setRackView] = useState<FoRackViewMode>("rack");
  const [staySearch, setStaySearch] = useState("");
  const [rackDragging, setRackDragging] = useState(false);
  const [dragStay, setDragStay] = useState<MoveDragStay & { roomTypeName: string } | null>(null);
  const dragActiveRef = useRef(false);
  const setToolbarSlot = useFoToolbarSlot();
  const dragEligibleIds = useMoveEligibleRoomIds(restaurantId, dragStay);

  function beginRoomDrag(stay: FoRackStay) {
    dragActiveRef.current = true;
    setDragStay({
      reservationId: stay.id,
      reservationRoomId: stay.reservationRoomId,
      roomId: stay.roomId,
      roomTypeId: stay.roomTypeId,
      roomTypeName: stay.roomTypeName,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
    });
    // Defer so the browser has committed the drag image before rows are added.
    window.requestAnimationFrame(() => {
      if (dragActiveRef.current) setRackDragging(true);
    });
  }

  function endRoomDrag() {
    dragActiveRef.current = false;
    setRackDragging(false);
    setDragStay(null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") endRoomDrag();
    }
    document.addEventListener("dragend", endRoomDrag);
    document.addEventListener("drop", endRoomDrag);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("dragend", endRoomDrag);
      document.removeEventListener("drop", endRoomDrag);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const [filters, setFilters] = useState<RackFilters>(() =>
    rackFocus
      ? {
          ...EMPTY_RACK_FILTERS,
          ...(rackFocus.roomType ? { roomType: rackFocus.roomType } : {}),
          ...(rackFocus.discrepancy ? { discrepancy: rackFocus.discrepancy } : {}),
        }
      : EMPTY_RACK_FILTERS,
  );
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RackConfirmDraft | null>(null);
  const [preview, setPreview] = useState<RackConfirmDraft | null>(null);

  const liveHorizon = isLiveHorizon(horizon);
  const days = liveHorizon ? horizon : 7;
  // 7 days is always the Monday–Sunday week containing the operational date.
  // Other lengths keep their day count and still start on the selected date.
  const rangeStart = horizon === 7 ? mondayOf(focusDate) : focusDate;
  const rangeEnd = addDays(rangeStart, days - 1);
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

  useEffect(() => {
    writeSharedWeekStart(restaurantId, focusDate);
  }, [restaurantId, focusDate]);

  const occupancyQuery = useQuery({
    queryKey: ["front-office", "occupancy", restaurantId],
    queryFn: () => fetchOccupancy({ data: { restaurantId } }),
    ...foOperationalQueryOptions(),
    retry: false,
  });
  const reservationsQuery = useQuery({
    queryKey: ["front-office", "rack-reservations", restaurantId, rangeStart, days, pageSize],
    queryFn: () =>
      collectRackReservationPages(
        (page, size) =>
          fetchReservations({
            data: {
              restaurantId,
              fromDate: rangeStart,
              toDate: rangeEnd,
              page,
              pageSize: size,
              includeRoomUnits: true,
            },
          }),
        pageSize,
      ),
    enabled: liveHorizon,
    ...foOperationalQueryOptions(),
    retry: false,
  });
  const dashboardQuery = useQuery({
    queryKey: ["front-office", "dashboard", restaurantId, today],
    queryFn: () => fetchDashboard({ data: { restaurantId, today } }),
    ...foOperationalQueryOptions(),
    retry: false,
  });
  const hkQuery = useQuery({
    queryKey: ["front-office", "hk-status-feed", restaurantId],
    queryFn: () => fetchHk({ data: { restaurantId } }),
    ...foOperationalQueryOptions(),
    retry: false,
  });
  const feedsQuery = useQuery({
    queryKey: ["front-office", "exception-feeds", restaurantId, today],
    queryFn: () => fetchFeeds({ data: { restaurantId, businessDate: today } }),
    ...foOperationalQueryOptions(),
    retry: false,
  });

  const rooms = occupancyQuery.data ?? [];
  const stays = projectRackStays(reservationsQuery.data?.rows ?? []).filter(
    (row) =>
      stayOverlapsRange(row.arrivalDate, row.departureDate, rangeStart, days) ||
      departureFallsInRackRange(row.departureDate, rangeStart, days),
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
  const types = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.roomTypeName))).sort(),
    [rooms],
  );
  const sources = useMemo(
    () => Array.from(new Set(stays.map((s) => s.source).filter(Boolean))).sort(),
    [stays],
  );
  const amendmentLatestByStay = useMemo(
    () => latestStayAmendmentByReservation(amendmentHistory ?? []),
    [amendmentHistory],
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
  // Presentation only: Rack and Table share this operational projection.
  // Vacant physical rooms and stays that do not overlap the visible range
  // are not rows. All Reservations keeps every canonical lifecycle that
  // overlaps, including cancelled and no_show.
  const visibleRoomIds = new Set(visibleRooms.map((room) => room.id));
  const operationalStays = visibleStays.filter((stay) => {
    if (category === "exceptions") {
      const flagged =
        Boolean(exceptionStayIds?.has(stay.id)) ||
        Boolean(stay.roomId && exceptionRoomIds?.has(stay.roomId));
      if (!flagged) return false;
    } else if (category === "amendments") {
      if (!amendmentStayIds?.has(stay.id)) return false;
    } else if (!stayMatchesRackCategory(stay, category, focusDate)) {
      return false;
    }
    if (primaryOperationalPhase(stay, rangeStart, days) == null) {
      return false;
    }
    if (stay.roomId && !visibleRoomIds.has(stay.roomId)) return false;
    return true;
  });
  const searchNeedle = staySearch.trim().toLowerCase();
  const searchedStays = searchNeedle
    ? operationalStays.filter((stay) => {
        const haystack = [
          stay.guestName,
          stay.confirmationNumber,
          stay.roomNumber ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchNeedle);
      })
    : operationalStays;
  const operationalRoomIds = new Set(
    searchedStays
      .map((stay) => previewRoomId(stay, preview))
      .filter((roomId): roomId is string => Boolean(roomId)),
  );
  // While a stay is dragged, show its current room and rooms the existing
  // assignment read marks eligible. Other rooms, including vacant ones, stay hidden.
  const operationalRooms = rackDragging
    ? visibleRooms.filter((room) => {
        if (!dragStay) return false;
        if (room.id === dragStay.roomId) return true;
        if (!dragEligibleIds?.has(room.id)) return false;
        return (
          classifyVerticalDrop({
            reservationId: dragStay.reservationId,
            currentRoomId: dragStay.roomId,
            stayRoomTypeId: dragStay.roomTypeId,
            stayRoomTypeName: dragStay.roomTypeName,
            targetRoomId: room.id,
            targetStatus: room.status,
            targetRoomTypeId: room.roomTypeId,
            targetRoomTypeName: room.roomTypeName,
          }).action === "confirm_sheet"
        );
      })
    : visibleRooms.filter((room) => operationalRoomIds.has(room.id));
  const unassigned = searchedStays.filter((stay) => previewRoomId(stay, preview) == null);
  const filterEmpty = searchedStays.length === 0;

  function dismissConfirm() {
    setDraft(null);
    setPreview(null);
  }

  function openConfirm(next: RackConfirmDraft) {
    setPreview(next);
    setDraft(next);
  }

  if (occupancyQuery.isError && isPermissionDeniedMessage(occupancyQuery.error)) {
    return (
      <PermissionDeniedPanel message="You don't have access to Front Office occupancy for this property." />
    );
  }
  if (
    liveHorizon &&
    reservationsQuery.isError &&
    isPermissionDeniedMessage(reservationsQuery.error)
  ) {
    return (
      <PermissionDeniedPanel message="You don't have access to Front Office reservations for this property." />
    );
  }

  const occupancyFailed = occupancyQuery.isError;
  const reservationsFailed = liveHorizon && reservationsQuery.isError;
  const loadError = occupancyFailed
    ? occupancyQuery.error
    : reservationsFailed
      ? reservationsQuery.error
      : null;

  return (
    <div className="space-y-3" data-testid="fo-room-rack-calendar">
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
      />

      <section
        className="rounded-lg border border-[#DDD4C5] bg-white px-2 py-1.5 shadow-sm"
        data-testid="fo-rack-toolbar"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <div ref={setToolbarSlot} className="flex shrink-0 items-center" />
          <div className="flex shrink-0 items-center gap-1.5">
            <WeekRangeControl
              weekStart={mondayOf(focusDate)}
              onShiftWeek={(direction) => setFocusDate(addDays(focusDate, direction * 7))}
              onPickDate={setFocusDate}
            />
            <DaysRangeSelect
              value={String(horizon)}
              onChange={(value) => setHorizon(Number(value) as CalendarHorizon)}
              options={LIVE_HORIZONS.map((n) => [String(n), calendarHorizonLabel(n)] as const)}
            />
          </div>
          <div className="flex min-w-[10rem] flex-1 basis-48">
            <span className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={staySearch}
                onChange={(event) => setStaySearch(event.target.value)}
                className="h-9 pl-8 pr-8 text-xs"
                placeholder="Search guest, room or reservation…"
                aria-label="Search guest, room or reservation"
                data-testid="fo-rack-search-trigger"
              />
              {staySearch ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setStaySearch("")}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <RackFiltersButton
              filters={filters}
              onChange={setFilters}
              floors={floors}
              types={types}
              sources={sources}
              hkAvailable={hkAvailable}
              groupBy={groupBy}
              onGroupBy={setGroupBy}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={PMS_ICON_BUTTON}
                  data-testid="fo-rack-refresh"
                  aria-label="Refresh"
                  onClick={() => void queryClient.invalidateQueries({ queryKey: ["front-office"] })}
                >
                  <RefreshCw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={PMS_ICON_BUTTON}
                  data-testid="fo-rack-export"
                  aria-label="Export PDF"
                  title="Export PDF"
                  onClick={() => exportRackStays(restaurantName, rangeStart, rangeEnd, searchedStays)}
                >
                  <Download className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export PDF</TooltipContent>
            </Tooltip>
            {viewport === "phone" ? null : (
              <RackViewSwitcher view={rackView} onChange={setRackView} />
            )}
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

      {!liveHorizon ? (
        <p className="text-sm text-muted-foreground">
          {horizon}-day calendar is not a live horizon.
        </p>
      ) : occupancyQuery.isLoading || reservationsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Room Rack + Calendar…</p>
      ) : loadError ? (
        <p className="text-sm text-destructive" data-testid="fo-rack-load-error">
          {loadError instanceof Error ? loadError.message : RACK_LOAD_FAILED}
        </p>
      ) : filterEmpty ? (
        <p className="text-sm text-muted-foreground" data-testid="fo-rack-filter-empty">
          {NO_STAYS_MATCH_FILTERS}
        </p>
      ) : viewport === "phone" ? (
        <PhoneRackList
          rooms={operationalRooms}
          stays={searchedStays}
          hkByRoom={hkByRoom}
          today={focusDate}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
          openDiscrepancyRoomIds={openDiscrepancyRoomIds}
          onSelectStay={onSelectStay}
          onSelectInHouse={onSelectInHouse}
          onSelectRoom={onSelectRoom}
          onRackAction={onRackAction}
          canOpenCashiering={canOpenCashiering}
          businessDate={today}
          staffRole={staffRole}
          amendmentLatestByStay={amendmentLatestByStay}
        />
      ) : rackView === "table" ? (
        <FoRackTableView
          rooms={visibleRooms}
          stays={searchedStays}
          focusDate={rangeStart}
          days={days}
          businessDate={today}
          hkByRoom={hkByRoom}
          canOpenCashiering={canOpenCashiering}
          staffRole={staffRole}
          onSelectStay={onSelectStay}
          onSelectInHouse={onSelectInHouse}
          onSelectRoom={onSelectRoom}
          onRackAction={onRackAction}
          amendmentLatestByStay={amendmentLatestByStay}
        />
      ) : (
        <>
          <CalendarBoard
            rooms={operationalRooms}
            stays={searchedStays}
            unassigned={unassigned}
            hkByRoom={hkByRoom}
            hkAvailable={hkAvailable}
            focusDate={rangeStart}
            days={days}
            groupBy={groupBy}
            showDrag={showDrag}
            preview={preview}
            openDiscrepancyRoomIds={openDiscrepancyRoomIds}
            highlightRoomId={rackFocus?.roomId ?? null}
            onSelectStay={onSelectStay}
            onSelectInHouse={onSelectInHouse}
            onSelectRoom={onSelectRoom}
            onRackAction={onRackAction}
            canOpenCashiering={canOpenCashiering}
            businessDate={today}
            staffRole={staffRole}
            amendmentLatestByStay={amendmentLatestByStay}
          onPreview={setPreview}
          onOpenConfirm={openConfirm}
          onRoomDragStart={beginRoomDrag}
          dragSourceRoomId={rackDragging ? (dragStay?.roomId ?? null) : null}
        />
          <FoOperationalLegend />
        </>
      )}

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

type FoOperationalPhase =
  | "arriving"
  | "in_house"
  | "departing"
  | "checked_out"
  | "cancelled"
  | "no_show";

const FO_OPERATIONAL_COLOR: Record<FoOperationalPhase, string> = {
  arriving: "#3B6EA5",
  in_house: "#436436",
  departing: "#C89933",
  checked_out: "#8A8A8A",
  cancelled: "#7A6258",
  no_show: "#A84848",
};

const FO_OPERATIONAL_LEGEND: Array<{ phase: FoOperationalPhase; label: string; color: string }> = [
  { phase: "arriving", label: "Arriving", color: FO_OPERATIONAL_COLOR.arriving },
  { phase: "in_house", label: "In-House", color: FO_OPERATIONAL_COLOR.in_house },
  { phase: "departing", label: "Departing", color: FO_OPERATIONAL_COLOR.departing },
  { phase: "checked_out", label: "Checked Out", color: FO_OPERATIONAL_COLOR.checked_out },
  { phase: "cancelled", label: "Cancelled", color: FO_OPERATIONAL_COLOR.cancelled },
  { phase: "no_show", label: "No-Show", color: FO_OPERATIONAL_COLOR.no_show },
];

function operationalPhaseLabel(phase: FoOperationalPhase): string {
  return FO_OPERATIONAL_LEGEND.find((item) => item.phase === phase)?.label ?? phase;
}

function operationalBarTone(phase: FoOperationalPhase): {
  background: string;
  border: string;
  color: string;
} {
  const color = FO_OPERATIONAL_COLOR[phase];
  return {
    background: `${color}${RESERVATION_BAR_SOFT_BG_ALPHA}`,
    border: `${color}${RESERVATION_BAR_SOFT_BORDER_ALPHA}`,
    color,
  };
}

function dateFallsInRackRange(date: string, rangeStart: string, days: number): boolean {
  const rangeEnd = addDays(rangeStart, days);
  return date >= rangeStart && date < rangeEnd;
}

function departureFallsInRackRange(departure: string, rangeStart: string, days: number): boolean {
  return dateFallsInRackRange(departure, rangeStart, days);
}

/**
 * Front Office presentation phase for one canonical stay bar. Colour and row
 * inclusion only — the bar itself always spans the stay's own dates.
 */
function primaryOperationalPhase(
  stay: { status: FoRackStay["status"]; arrivalDate: string; departureDate: string },
  rangeStart: string,
  days: number,
): FoOperationalPhase | null {
  const { status, arrivalDate, departureDate } = stay;
  const overlaps = stayOverlapsRange(arrivalDate, departureDate, rangeStart, days);
  const departsInRange = departureFallsInRackRange(departureDate, rangeStart, days);
  if (!overlaps && !departsInRange) return null;
  if (status === "cancelled") return "cancelled";
  if (status === "no_show") return "no_show";
  if (status === "checked_out") return "checked_out";
  if (status === "checked_in") return "in_house";
  return "arriving";
}

/**
 * Original nights-based placement. A stay whose only visible date is its
 * departure day (e.g. checked out on the first visible day) gets that day so
 * it stays on the rack as history.
 */
function rackStayPlacement(
  status: FoRackStay["status"],
  arrival: string,
  departure: string,
  rangeStart: string,
  days: number,
): { startCol: number; endCol: number; clipped: boolean } | null {
  const place = reservationBarPlacement(arrival, departure, rangeStart, days);
  if (place) return place;
  if (
    (status === "checked_out" ||
      status === "checked_in" ||
      status === "cancelled" ||
      status === "no_show") &&
    departureFallsInRackRange(departure, rangeStart, days)
  ) {
    return reservationBarPlacement(departure, addDays(departure, 1), rangeStart, days);
  }
  return null;
}

function rackBarGuestLabel(name: string, confirmation: string, span: number): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0] ?? trimmed;
  if (span <= 1) return first;
  if (span >= 3 && confirmation.trim()) return `${trimmed} · ${confirmation.trim()}`;
  return trimmed;
}

function previewRoomId(stay: FoRackStay, preview: RackConfirmDraft | null): string | null {
  if (preview?.kind === "move_room" && preview.reservationId === stay.id)
    return preview.targetRoomId;
  return stay.roomId;
}

function previewDates(
  stay: FoRackStay,
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
  rooms: Array<{
    occupancy: "vacant" | "occupied";
    status: string;
    housekeepingStatus?: string | null;
  }>;
  hkAvailable: boolean;
  occupancyTrusted?: boolean;
  openDiscrepancies?: number | null;
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

  const visible = frontOfficeKpiCards(cards);
  if (loading && !dashboard) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="fo-ops-strip">
        Loading occupancy strip…
      </p>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      data-testid="fo-ops-strip"
    >
      {visible.map((item) => {
        const meta = opsKpiMeta(item.id);
        return (
          <div
            key={item.id}
            data-testid={`fo-ops-${item.id}`}
            className="flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 text-left shadow-sm"
          >
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", meta.tone)}>
              {meta.icon}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium text-[#756A5B]">{item.label}</p>
              <p className="font-display text-lg font-semibold leading-tight tracking-tight text-[#251605]">
                {item.display ?? item.value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Visible strip only. deriveOpsStrip still returns the full set for other views. */
function frontOfficeKpiCards(cards: OpsStripItem[]): OpsStripItem[] {
  const byId = new Map(cards.map((item) => [item.id, item]));
  const arrivals = byId.get("arrivals");
  const inHouse = byId.get("in_house");
  const departures = byId.get("departures");
  const occupancy = byId.get("occupancy_pct");
  const available = byId.get("available");
  const attention = byId.get("discrepancies") ?? byId.get("vacant_dirty");
  return [
    { id: "arrivals", label: "Arrivals", value: arrivals?.value ?? 0, filter: arrivals?.filter ?? { staySlice: "arrival" } },
    { id: "in_house", label: "In-House", value: inHouse?.value ?? 0, filter: inHouse?.filter ?? { staySlice: "in_house" } },
    { id: "departures", label: "Departures", value: departures?.value ?? 0, filter: departures?.filter ?? { staySlice: "departure" } },
    {
      id: "occupancy_pct",
      label: "Occupancy",
      value: occupancy?.value ?? 0,
      display: occupancy?.display ?? "—",
      filter: occupancy?.filter ?? { roomStatus: "occupied" },
    },
    { id: "available", label: "Available", value: available?.value ?? 0, filter: available?.filter ?? { roomStatus: "available" } },
    {
      id: "attention",
      label: "Attention",
      value: attention?.value ?? 0,
      filter: attention?.filter ?? { discrepancy: "open" },
    },
  ];
}

function opsKpiMeta(id: string): { icon: ReactNode; tone: string; hint?: string } {
  switch (id) {
    case "arrivals":
      return { icon: <LogIn className="size-4" />, tone: "bg-blue-50 text-blue-700" };
    case "departures":
      return { icon: <LogOut className="size-4" />, tone: "bg-amber-50 text-amber-800" };
    case "in_house":
      return { icon: <House className="size-4" />, tone: "bg-emerald-50 text-emerald-700" };
    case "attention":
      return { icon: <AlertTriangle className="size-4" />, tone: "bg-orange-50 text-orange-700" };
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
  groupBy,
  onGroupBy,
}: {
  filters: RackFilters;
  onChange: (next: RackFilters) => void;
  floors: string[];
  types: string[];
  sources: string[];
  hkAvailable: boolean;
  groupBy: RackGroupBy;
  onGroupBy: (next: RackGroupBy) => void;
}) {
  const activeCount = countActiveRackFilters(filters);

  function set<K extends keyof RackFilters>(key: K, value: RackFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  const groupingLabel =
    groupBy === "floor" ? "Floor" : groupBy === "room_type" ? "Room Type" : "No grouping";

  return (
    <PmsFilterMenu
      activeCount={activeCount}
      onClear={() => onChange(EMPTY_RACK_FILTERS)}
      buttonTestId="fo-filters-button"
      countTestId="fo-filters-count"
      menuTestId="fo-filters-popover"
    >
      <div className="contents" data-testid="fo-rack-filters">
        <PmsFilterChoiceRow
          label="Grouping"
          value={groupBy}
          current={groupingLabel}
          neutralValue="none"
          options={[
            ["none", "No grouping"],
            ["floor", "Floor"],
            ["room_type", "Room Type"],
          ]}
          onChange={(value) => onGroupBy(value as RackGroupBy)}
        />
        <PmsFilterChoiceRow
          label="Floor"
          value={filters.floor}
          current={filters.floor === "all" ? "" : `Floor ${filters.floor}`}
          options={[["all", "All floors"], ...floors.map((floor) => [floor, `Floor ${floor}`] as const)]}
          onChange={(value) => set("floor", value)}
        />
        <PmsFilterChoiceRow
          label="Room Type"
          value={filters.roomType}
          current={filters.roomType === "all" ? "" : filters.roomType}
          options={[["all", "All room types"], ...types.map((type) => [type, type] as const)]}
          onChange={(value) => set("roomType", value)}
        />
        <PmsFilterChoiceRow
          label="Room Status"
          value={filters.roomStatus}
          current={roomStatusLabel(filters.roomStatus)}
          options={[
            ["all", "All room statuses"],
            ["vacant", "Vacant"],
            ["occupied", "Occupied"],
            ["available", "Available"],
            ["out_of_order", "Out of order"],
            ["out_of_service", "Out of service"],
          ]}
          onChange={(value) => set("roomStatus", value)}
        />
        {hkAvailable ? (
          <PmsFilterChoiceRow
            label="Housekeeping"
            value={filters.hkStatus}
            current={hkStatusAriaLabel(filters.hkStatus) ?? ""}
            options={[
              ["all", "All housekeeping"],
              ["clean", "Clean"],
              ["dirty", "Dirty"],
              ["inspected", "Inspected"],
              ["pickup", "Pickup"],
            ]}
            onChange={(value) => set("hkStatus", value)}
          />
        ) : (
          <PmsFilterNoteRow label="Housekeeping">
            <ComingSoonChip
              label="HK filter"
              hint="Housekeeping status is unavailable on this login."
            />
          </PmsFilterNoteRow>
        )}
        <PmsFilterChoiceRow
          label="Reservation Status"
          value={filters.resStatus}
          current={resStatusLabel(filters.resStatus)}
          options={[
            ["all", "All reservation statuses"],
            ["pending", "Pending"],
            ["confirmed", "Confirmed"],
            ["checked_in", "In-house"],
            ["checked_out", "Checked out"],
            ["cancelled", "Cancelled"],
            ["no_show", "No-show"],
          ]}
          onChange={(value) => set("resStatus", value)}
        />
        <PmsFilterChoiceRow
          label="Stay Status"
          value={filters.staySlice}
          current={staySliceLabel(filters.staySlice)}
          options={[
            ["all", "All stay statuses"],
            ["arrival", "Arrival"],
            ["departure", "Departure"],
            ["in_house", "In-house"],
          ]}
          onChange={(value) => set("staySlice", value as RackFilters["staySlice"])}
        />
        <PmsFilterChoiceRow
          label="VIP"
          value={filters.vip}
          current={filters.vip === "vip" ? "VIP only" : ""}
          options={[
            ["all", "All guests"],
            ["vip", "VIP only"],
          ]}
          onChange={(value) => set("vip", value)}
        />
        <PmsFilterChoiceRow
          label="Group"
          value={filters.group}
          current={filters.group === "group" ? "Group only" : ""}
          options={[
            ["all", "All groups"],
            ["group", "Group only"],
          ]}
          onChange={(value) => set("group", value)}
        />
        <PmsFilterChoiceRow
          label="Corporate"
          value={filters.corporate}
          current={filters.corporate === "corporate" ? "Corporate only" : ""}
          options={[
            ["all", "All corporate"],
            ["corporate", "Corporate only"],
          ]}
          onChange={(value) => set("corporate", value)}
        />
        <PmsFilterChoiceRow
          label="Special Request"
          value={filters.specialRequest}
          current={filters.specialRequest === "special" ? "Special request" : ""}
          options={[
            ["all", "All special requests"],
            ["special", "Special request"],
          ]}
          onChange={(value) => set("specialRequest", value)}
        />
        <PmsFilterChoiceRow
          label="Source"
          value={filters.source}
          current={filters.source === "all" ? "" : filters.source}
          options={[["all", "All sources"], ...sources.map((source) => [source, source] as const)]}
          onChange={(value) => set("source", value)}
        />
      </div>
    </PmsFilterMenu>
  );
}

function roomStatusLabel(value: string): string {
  switch (value) {
    case "vacant":
      return "Vacant";
    case "occupied":
      return "Occupied";
    case "available":
      return "Available";
    case "out_of_order":
      return "Out of order";
    case "out_of_service":
      return "Out of service";
    default:
      return "";
  }
}

function resStatusLabel(value: string): string {
  switch (value) {
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "checked_in":
      return "In-house";
    case "checked_out":
      return "Checked out";
    case "cancelled":
      return "Cancelled";
    case "no_show":
      return "No-show";
    default:
      return "";
  }
}

function staySliceLabel(value: RackFilters["staySlice"]): string {
  switch (value) {
    case "arrival":
      return "Arrival";
    case "departure":
      return "Departure";
    case "in_house":
      return "In-house";
    default:
      return "";
  }
}

function RackGroupSelect({
  groupBy,
  onGroupBy,
  toolbar = false,
}: {
  groupBy: RackGroupBy;
  onGroupBy: (next: RackGroupBy) => void;
  toolbar?: boolean;
}) {
  return (
    <Select value={groupBy} onValueChange={(value) => onGroupBy(value as RackGroupBy)}>
      <SelectTrigger
        className={cn("text-xs", toolbar ? "h-9 w-[9.5rem]" : "h-7 w-[8.75rem]")}
        aria-label="Group rooms"
        data-testid="fo-rack-group-by"
      >
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

function hkTaskTarget(room: OccupancyRoom, hk: RackRoom | null): FoHkTaskRoomTarget {
  return {
    roomId: room.id,
    roomNumber: room.roomNumber,
    occupancy: room.occupancy,
    housekeepingStatus: hk?.housekeepingStatus ?? null,
    guestName: room.guestName,
    openTaskId: hk?.openTaskId ?? null,
    openTaskStatus: hk?.openTaskStatus ?? null,
    openTaskType: hk?.openTaskType ?? null,
    openTaskPriority: hk?.openTaskPriority ?? null,
  };
}

function inHouseTargetForRoom(
  room: OccupancyRoom,
  stays: readonly FoRackStay[],
): FoRackInHouseTarget | null {
  return foRackCheckedInStay({
    roomId: room.id,
    stays,
    occupied: room.reservationId
      ? {
          reservationId: room.reservationId,
          reservationRoomId: room.reservationRoomId,
        }
      : null,
  });
}

function selectRackStay(
  stay: FoRackStay,
  room: OccupancyRoom | null,
  businessDate: string,
  onSelectStay: (stay: FrontOfficeStay) => void,
  onSelectInHouse: (target: FoRackInHouseTarget) => void,
) {
  if (stay.status === "checked_in") {
    const identity = foRackUnitIdentity(stay);
    if (identity.kind === "unit") {
      onSelectInHouse({ reservationId: stay.id, reservationRoomId: identity.reservationRoomId });
      return;
    }
    if (identity.kind === "header" && (!room || stay.roomId === room.id)) {
      onSelectInHouse({ reservationId: stay.id, reservationRoomId: null });
      return;
    }
  }
  onSelectStay(foRackActionStay(stay, businessDate));
}

const RACK_VIEW_OPTIONS: Array<{ id: FoRackViewMode; label: string; icon: typeof LayoutGrid }> = [
  { id: "rack", label: "Rack view", icon: LayoutGrid },
  { id: "table", label: "Table view", icon: Table2 },
];

/** Icon-only Rack/Table switcher. Both read the same operational stays. */
function RackViewSwitcher({
  view,
  onChange,
}: {
  view: FoRackViewMode;
  onChange: (next: FoRackViewMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-[#DDD4C5] bg-white p-0.5"
      data-testid="fo-rack-view-switcher"
      role="group"
      aria-label="Front Office rack view"
    >
      {RACK_VIEW_OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = view === option.id;
        return (
          <Tooltip key={option.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={option.label}
                aria-pressed={active}
                data-testid={`fo-rack-view-${option.id}`}
                onClick={() => onChange(option.id)}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-sm transition-colors",
                  active
                    ? "bg-[#C89933] text-[#251605]"
                    : "bg-transparent text-muted-foreground hover:bg-[#F3EEE4] hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{option.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function sortedRackStays(stays: FoRackStay[]): FoRackStay[] {
  return [...stays].sort((a, b) => {
    const room = (a.roomNumber ?? "~").localeCompare(b.roomNumber ?? "~", undefined, {
      numeric: true,
    });
    return room !== 0 ? room : a.guestName.localeCompare(b.guestName);
  });
}

function RackViewMenu({
  stay,
  businessDate,
  canOpenCashiering,
  staffRole,
  hkByRoom,
  onRackAction,
}: {
  stay: FoRackStay;
  businessDate: string;
  canOpenCashiering: boolean;
  staffRole?: string;
  hkByRoom: Map<string, RackRoom>;
  onRackAction: (action: FoRackBarActionId, stay: FrontOfficeStay) => void;
}) {
  const actionStay = foRackActionStay(stay, businessDate);
  return (
    <RackStayMenu
      items={foRackBarMenuItems({
        status: stay.status,
        assigned: Boolean(stay.roomId),
        arrivalDate: stay.arrivalDate,
        businessDate,
        canOpenCashiering,
        maintenanceRelevant: foRackMaintenanceRelevant(
          stay.roomId ? hkByRoom.get(stay.roomId)?.maintenanceStatus : null,
        ),
        staffRole,
      })}
      tone="card"
      onAction={(action) => onRackAction(action, actionStay)}
    />
  );
}

function RackStatusChip({ phase }: { phase: FoOperationalPhase }) {
  const tone = operationalBarTone(phase);
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: tone.background, borderColor: tone.border, color: tone.color }}
    >
      {operationalPhaseLabel(phase)}
    </span>
  );
}

type AmendmentLatestByStay = ReadonlyMap<string, FoStayAmendmentHistoryRow>;

type RackViewRowsProps = {
  rooms: OccupancyRoom[];
  stays: FoRackStay[];
  focusDate: string;
  days: number;
  businessDate: string;
  canOpenCashiering: boolean;
  staffRole?: string;
  hkByRoom: Map<string, RackRoom>;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectInHouse: (target: FoRackInHouseTarget) => void;
  onSelectRoom: (target: FoHkTaskRoomTarget) => void;
  onRackAction: (action: FoRackBarActionId, stay: FrontOfficeStay) => void;
  amendmentLatestByStay: AmendmentLatestByStay;
};

/**
 * Table View — same stays/rooms the rack already loaded, read-only summary
 * rows. No new query, no second write path; the ⋮ menu routes through the
 * existing onRackAction resolver exactly like the rack bars do.
 */
function FoRackTableView({
  rooms,
  stays,
  focusDate,
  days,
  businessDate,
  canOpenCashiering,
  staffRole,
  hkByRoom,
  onSelectStay,
  onSelectInHouse,
  onSelectRoom,
  onRackAction,
  amendmentLatestByStay,
}: RackViewRowsProps) {
  const sorted = sortedRackStays(stays);
  if (sorted.length === 0) {
    return (
      <div
        className="rounded-lg border border-[#DDD4C5] bg-white p-6 text-center text-sm text-muted-foreground"
        data-testid="fo-rack-view-empty"
      >
        {NO_STAYS_MATCH_FILTERS}
      </div>
    );
  }
  return (
    <div
      className="overflow-auto rounded-lg border border-[#DDD4C5] bg-white shadow-sm"
      data-testid="fo-rack-table-view"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Room</TableHead>
            <TableHead>Guest</TableHead>
            <TableHead>Reservation</TableHead>
            <TableHead>Arrival</TableHead>
            <TableHead>Departure</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((stay) => {
            const room = stay.roomId ? (rooms.find((r) => r.id === stay.roomId) ?? null) : null;
            const phase =
              primaryOperationalPhase(stay, focusDate, days) ??
              (stay.status === "cancelled"
                ? "cancelled"
                : stay.status === "no_show"
                  ? "no_show"
                  : null);
            if (!phase) return null;
            return (
              <TableRow
                key={stay.rackKey}
                data-testid="fo-rack-table-row"
                className="cursor-pointer"
                onClick={() => selectRackStay(stay, room, focusDate, onSelectStay, onSelectInHouse)}
              >
                <TableCell
                  className="font-medium"
                  onClick={(event) => event.stopPropagation()}
                >
                  {stay.roomId && stay.roomNumber ? (
                    <button
                      type="button"
                      className="cursor-pointer rounded-sm text-left font-medium hover:text-[#C89933] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933]"
                      data-testid="fo-room-identity"
                      onClick={() =>
                        onSelectRoom(
                          hkTaskTarget(
                            room ?? {
                              id: stay.roomId!,
                              roomNumber: stay.roomNumber!,
                              roomTypeId: stay.roomTypeId,
                              roomTypeName: stay.roomTypeName,
                              floor: null,
                              status: "available",
                              occupancy: stay.status === "checked_in" ? "occupied" : "vacant",
                              guestName: stay.guestName,
                              reservationId: stay.id,
                              reservationRoomId: stay.reservationRoomId ?? null,
                              departureDate: stay.departureDate,
                            },
                            stay.roomId ? (hkByRoom.get(stay.roomId) ?? null) : null,
                          ),
                        )
                      }
                    >
                      {stay.roomNumber}
                    </button>
                  ) : (
                    "Unassigned"
                  )}
                </TableCell>
                <TableCell className="truncate">{stay.guestName}</TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span>{stay.confirmationNumber}</span>
                    {amendmentLatestByStay.get(stay.id) ? (
                      <FoStayAmendedMark amendment={amendmentLatestByStay.get(stay.id)!} compact />
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{formatStayDate(stay.arrivalDate)}</TableCell>
                <TableCell>{formatStayDate(stay.departureDate)}</TableCell>
                <TableCell>
                  <RackStatusChip phase={phase} />
                </TableCell>
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <RackViewMenu
                    stay={stay}
                    businessDate={businessDate}
                    canOpenCashiering={canOpenCashiering}
                    staffRole={staffRole}
                    hkByRoom={hkByRoom}
                    onRackAction={onRackAction}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
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
  showDrag,
  preview,
  openDiscrepancyRoomIds,
  highlightRoomId,
  onSelectStay,
  onSelectInHouse,
  onSelectRoom,
  onRackAction,
  canOpenCashiering,
  businessDate,
  staffRole,
  onPreview,
  onOpenConfirm,
  onRoomDragStart,
  dragSourceRoomId,
  amendmentLatestByStay,
}: {
  rooms: OccupancyRoom[];
  stays: FoRackStay[];
  unassigned: FoRackStay[];
  hkByRoom: Map<string, RackRoom>;
  hkAvailable: boolean;
  focusDate: string;
  days: number;
  groupBy: RackGroupBy;
  showDrag: boolean;
  preview: RackConfirmDraft | null;
  openDiscrepancyRoomIds: Set<string>;
  highlightRoomId: string | null;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectInHouse: (target: FoRackInHouseTarget) => void;
  onSelectRoom: (target: FoHkTaskRoomTarget) => void;
  onRackAction: (action: FoRackBarActionId, stay: FrontOfficeStay) => void;
  canOpenCashiering: boolean;
  businessDate: string;
  staffRole?: string;
  onPreview: (next: RackConfirmDraft | null) => void;
  onOpenConfirm: (next: RackConfirmDraft) => void;
  onRoomDragStart: (stay: FoRackStay) => void;
  dragSourceRoomId: string | null;
  amendmentLatestByStay: AmendmentLatestByStay;
}) {
  const dates = dateRange(focusDate, days);
  const colMin = rackColumnMinPx(days);
  const byRoom = new Map<string, FoRackStay[]>();
  for (const stay of stays) {
    const roomId = previewRoomId(stay, preview);
    if (!roomId) continue;
    const list = byRoom.get(roomId) ?? [];
    list.push(stay);
    byRoom.set(roomId, list);
  }

  function dropOnRoom(rackKey: string, room: OccupancyRoom) {
    const stay = stays.find((row) => row.rackKey === rackKey);
    if (!stay) return;
    onRackDrop({ reservationId: stay.id, targetRoomId: room.id }, {});
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
      targetReady: hk?.ready ?? null,
      hkKnown: hkAvailable && !!hk,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
    });
  }

  function openDateConfirm(stay: FoRackStay, nextArrival: string, nextDeparture: string) {
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
      className="overflow-auto rounded-lg border border-[#DDD4C5] bg-[#FAF8F4] shadow-sm"
      data-testid="fo-calendar-board"
      data-focus-date={focusDate}
    >
      <div
        className="min-w-max"
        data-rack-frozen-columns={RACK_FROZEN_COLUMN_COUNT}
        style={{
          display: "grid",
          gridTemplateColumns: rackFrozenGridTemplate(days, colMin),
        }}
      >
        <RackFrozenHeaderCell columnIndex={0}>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Room
          </span>
        </RackFrozenHeaderCell>
        <RackFrozenHeaderCell columnIndex={1}>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Room Type
          </span>
        </RackFrozenHeaderCell>
        <RackFrozenHeaderCell columnIndex={2}>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </span>
        </RackFrozenHeaderCell>
        <RackFrozenHeaderCell columnIndex={3} timelineEdge>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            HK
          </span>
        </RackFrozenHeaderCell>
        {dates.map((d, index) => (
          <div
            key={d}
            className={cn(
              "border-b border-border px-3 py-2 text-xs font-medium",
              index === 0 && "border-l border-[#DDD4C5]/80 pl-3",
              d === businessDate && "bg-[#F4E9D0]/60 text-[#251605]",
            )}
          >
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
            onSelectInHouse={onSelectInHouse}
            onRackAction={onRackAction}
            canOpenCashiering={canOpenCashiering}
            businessDate={businessDate}
            staffRole={staffRole}
            onPreview={onPreview}
            onOpenDateConfirm={openDateConfirm}
            onRoomDragStart={onRoomDragStart}
            amendmentLatestByStay={amendmentLatestByStay}
          />
        ) : null}

        {groupRackRooms(rooms, groupBy).map((group) => (
          <Fragment key={group.key}>
            {groupBy !== "none" ? (
              <div
                className="sticky left-0 z-10 border-b border-[#DDD4C5] bg-[#F3EEE4] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#765719]"
                style={{ gridColumn: `1 / span ${rackGroupHeaderColumnSpan(days)}` }}
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
                hkAvailable={hkAvailable}
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
                onSelectInHouse={onSelectInHouse}
                onSelectRoom={onSelectRoom}
                onRackAction={onRackAction}
                canOpenCashiering={canOpenCashiering}
                businessDate={businessDate}
                staffRole={staffRole}
                maintenanceRelevant={foRackMaintenanceRelevant(
                  hkByRoom.get(room.id)?.maintenanceStatus,
                )}
                onDropStay={(id) => dropOnRoom(id, room)}
                onPreview={onPreview}
                onOpenDateConfirm={openDateConfirm}
                onRoomDragStart={onRoomDragStart}
                acceptDrop={dragSourceRoomId == null || room.id !== dragSourceRoomId}
                dropHint={dragSourceRoomId != null && room.id !== dragSourceRoomId}
                amendmentLatestByStay={amendmentLatestByStay}
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
  onSelectInHouse,
  onRackAction,
  canOpenCashiering,
  businessDate,
  staffRole,
  onPreview,
  onOpenDateConfirm,
  onRoomDragStart,
  amendmentLatestByStay,
}: {
  stays: FoRackStay[];
  focusDate: string;
  days: number;
  dates: string[];
  colMin: number;
  showDrag: boolean;
  preview: RackConfirmDraft | null;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectInHouse: (target: FoRackInHouseTarget) => void;
  onRackAction: (action: FoRackBarActionId, stay: FrontOfficeStay) => void;
  canOpenCashiering: boolean;
  businessDate: string;
  staffRole?: string;
  onPreview: (next: RackConfirmDraft | null) => void;
  onOpenDateConfirm: (stay: FoRackStay, arrival: string, departure: string) => void;
  onRoomDragStart: (stay: FoRackStay) => void;
  amendmentLatestByStay: AmendmentLatestByStay;
}) {
  return (
    <>
      <div
        className="sticky left-0 z-10 border-b border-r border-border px-2.5 py-2 text-sm"
        style={{
          gridColumn: `1 / span ${RACK_FROZEN_COLUMN_COUNT}`,
          backgroundColor: `${FO_BRAND.chrome}0D`,
        }}
      >
        <p className="font-medium">Unassigned</p>
        <p className="text-xs text-muted-foreground">
          {stays.length} stay{stays.length === 1 ? "" : "s"}
        </p>
      </div>
      <div
        className="relative border-b border-border"
        data-testid="fo-room-track"
        style={{
          gridColumn: `${RACK_DATE_TRACK_GRID_COLUMN} / span ${dates.length}`,
          minHeight: 48,
        }}
      >
        <BarTrack
          stays={stays}
          room={null}
          focusDate={focusDate}
          days={days}
          colMin={colMin}
          showDrag={showDrag}
          preview={preview}
          onSelectStay={onSelectStay}
          onSelectInHouse={onSelectInHouse}
          onRackAction={onRackAction}
          canOpenCashiering={canOpenCashiering}
          businessDate={businessDate}
          staffRole={staffRole}
          maintenanceRelevant={false}
          onPreview={onPreview}
          onOpenDateConfirm={onOpenDateConfirm}
          onRoomDragStart={onRoomDragStart}
          amendmentLatestByStay={amendmentLatestByStay}
        />
      </div>
    </>
  );
}

function RoomRow({
  room,
  hk,
  hkAvailable,
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
  onSelectInHouse,
  onSelectRoom,
  onRackAction,
  canOpenCashiering,
  businessDate,
  staffRole,
  maintenanceRelevant,
  onDropStay,
  onPreview,
  onOpenDateConfirm,
  onRoomDragStart,
  acceptDrop,
  dropHint,
  amendmentLatestByStay,
}: {
  room: OccupancyRoom;
  hk: RackRoom | null;
  hkAvailable: boolean;
  stays: FoRackStay[];
  focusDate: string;
  days: number;
  dates: string[];
  colMin: number;
  showDrag: boolean;
  preview: RackConfirmDraft | null;
  hasOpenDiscrepancy: boolean;
  highlight: boolean;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectInHouse: (target: FoRackInHouseTarget) => void;
  onSelectRoom: (target: FoHkTaskRoomTarget) => void;
  onRackAction: (action: FoRackBarActionId, stay: FrontOfficeStay) => void;
  canOpenCashiering: boolean;
  businessDate: string;
  staffRole?: string;
  maintenanceRelevant: boolean;
  onDropStay: (reservationId: string) => void;
  onPreview: (next: RackConfirmDraft | null) => void;
  onOpenDateConfirm: (stay: FoRackStay, arrival: string, departure: string) => void;
  onRoomDragStart: (stay: FoRackStay) => void;
  acceptDrop: boolean;
  dropHint: boolean;
  amendmentLatestByStay: AmendmentLatestByStay;
}) {
  const status = rackRoomStatusDisplay(room);
  const dropHandlers = showDrag && acceptDrop
    ? {
        onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
          if (
            e.dataTransfer.types.includes(FO_DRAG_MIME) ||
            e.dataTransfer.types.includes("text/plain")
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        },
        onDrop: (e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          const id = e.dataTransfer.getData(FO_DRAG_MIME) || e.dataTransfer.getData("text/plain");
          if (id) onDropStay(id);
        },
      }
    : {};
  const highlightStyle = highlight ? { outline: `2px solid ${FO_BRAND.gold}` } : undefined;
  const rowBadges = liveStayBadges({ guestVip: false, hasOpenDiscrepancy });

  return (
    <>
      <RackFrozenBodyCell
        columnIndex={0}
        data-testid="fo-room-row"
        data-room-id={room.id}
        data-highlighted={highlight ? "true" : undefined}
        data-drop-target={dropHint ? "true" : undefined}
        className={dropHint ? "bg-[#F4E9D0]/60" : undefined}
        style={highlightStyle}
        {...dropHandlers}
      >
        <button
          type="button"
          className="inline-flex max-w-full cursor-pointer items-center rounded-sm text-left font-medium hover:text-[#C89933] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933]"
          data-testid="fo-room-identity"
          onClick={(event) => {
            event.stopPropagation();
            onSelectRoom(hkTaskTarget(room, hk));
          }}
        >
          {room.roomNumber}
        </button>
        {rowBadges.length > 0 ? (
          <StayBadgeStrip badges={rowBadges} mode={badgeDisplayMode(days)} />
        ) : null}
        {room.guestName ? (
          <p className="truncate text-[11px] text-muted-foreground">{room.guestName}</p>
        ) : null}
      </RackFrozenBodyCell>
      <RackFrozenBodyCell
        columnIndex={1}
        className={dropHint ? "bg-[#F4E9D0]/60" : undefined}
        style={highlightStyle}
        {...dropHandlers}
      >
        <p className="line-clamp-2 text-xs leading-snug" data-testid="fo-room-type">
          {room.roomTypeName}
        </p>
        {rackFloorSecondaryLabel(room.floor) ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {rackFloorSecondaryLabel(room.floor)}
          </p>
        ) : null}
      </RackFrozenBodyCell>
      <RackFrozenBodyCell
        columnIndex={2}
        className={dropHint ? "bg-[#F4E9D0]/60" : undefined}
        style={highlightStyle}
        {...dropHandlers}
      >
        <RackStatusPill statusKey={status.key} label={status.label} color={status.color} />
      </RackFrozenBodyCell>
      <RackFrozenBodyCell
        columnIndex={3}
        timelineEdge
        className={dropHint ? "bg-[#F4E9D0]/60" : undefined}
        style={highlightStyle}
        {...dropHandlers}
      >
        <RackHkCell hk={hk} hkAvailable={hkAvailable} />
      </RackFrozenBodyCell>
      <div
        className={cn(
          "relative border-b border-l border-[#DDD4C5]/80 border-border",
          dropHint && "bg-[#F4E9D0]/60",
        )}
        style={{
          gridColumn: `${RACK_DATE_TRACK_GRID_COLUMN} / span ${dates.length}`,
          minHeight: 48,
        }}
        data-testid="fo-room-track"
        data-room-id={room.id}
        onDragOver={
          showDrag && acceptDrop
            ? (e) => {
                if (
                  e.dataTransfer.types.includes(FO_DRAG_MIME) ||
                  e.dataTransfer.types.includes("text/plain")
                ) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              }
            : undefined
        }
        onDrop={
          showDrag && acceptDrop
            ? (e) => {
                e.preventDefault();
                const id =
                  e.dataTransfer.getData(FO_DRAG_MIME) || e.dataTransfer.getData("text/plain");
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
            <div
              key={d}
              className={cn("border-l border-[#CCCCCC]/70", d === businessDate && "bg-[#F4E9D0]/40")}
            />
          ))}
        </div>
        <BarTrack
          stays={stays}
          room={room}
          focusDate={focusDate}
          days={days}
          colMin={colMin}
          showDrag={showDrag}
          preview={preview}
          hasOpenDiscrepancy={hasOpenDiscrepancy}
          onSelectStay={onSelectStay}
          onSelectInHouse={onSelectInHouse}
          onRackAction={onRackAction}
          canOpenCashiering={canOpenCashiering}
          businessDate={businessDate}
          staffRole={staffRole}
          maintenanceRelevant={maintenanceRelevant}
          onPreview={onPreview}
          onOpenDateConfirm={onOpenDateConfirm}
          onRoomDragStart={onRoomDragStart}
          amendmentLatestByStay={amendmentLatestByStay}
        />
      </div>
    </>
  );
}

function BarTrack({
  stays,
  room,
  focusDate,
  days,
  colMin,
  showDrag,
  preview,
  hasOpenDiscrepancy = false,
  onSelectStay,
  onSelectInHouse,
  onRackAction,
  canOpenCashiering,
  businessDate,
  staffRole,
  maintenanceRelevant = false,
  onPreview,
  onOpenDateConfirm,
  onRoomDragStart,
  amendmentLatestByStay,
}: {
  stays: FoRackStay[];
  room: OccupancyRoom | null;
  focusDate: string;
  days: number;
  colMin: number;
  showDrag: boolean;
  preview: RackConfirmDraft | null;
  hasOpenDiscrepancy?: boolean;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectInHouse: (target: FoRackInHouseTarget) => void;
  onRackAction: (action: FoRackBarActionId, stay: FrontOfficeStay) => void;
  canOpenCashiering: boolean;
  businessDate: string;
  staffRole?: string;
  maintenanceRelevant?: boolean;
  onPreview: (next: RackConfirmDraft | null) => void;
  onOpenDateConfirm: (stay: FoRackStay, arrival: string, departure: string) => void;
  onRoomDragStart: (stay: FoRackStay) => void;
  amendmentLatestByStay: AmendmentLatestByStay;
}) {
  return (
    <div
      className="relative grid h-full min-h-12 px-2 py-0.5"
      style={{ gridTemplateColumns: `repeat(${days}, minmax(${colMin}px, 1fr))` }}
    >
      {stays.map((stay) => {
        const dates = previewDates(stay, preview);
        const place = rackStayPlacement(stay.status, dates.arrival, dates.departure, focusDate, days);
        if (!place) return null;
        const phase =
          primaryOperationalPhase(
            { status: stay.status, arrivalDate: dates.arrival, departureDate: dates.departure },
            focusDate,
            days,
          ) ??
          (stay.status === "cancelled"
            ? "cancelled"
            : stay.status === "no_show"
              ? "no_show"
              : "arriving");
        const actionStay = foRackActionStay(stay, businessDate);
        return (
          <ReservationBar
            key={stay.rackKey}
            stay={stay}
            phase={phase}
            startCol={place.startCol}
            endCol={place.endCol}
            days={days}
            focusDate={focusDate}
            showDrag={showDrag}
            onOpen={(selected) =>
              selectRackStay(selected, room, selected.arrivalDate, onSelectStay, onSelectInHouse)
            }
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
            onRoomDragStart={onRoomDragStart}
            hasOpenDiscrepancy={hasOpenDiscrepancy}
            amendment={amendmentLatestByStay.get(stay.id) ?? null}
            menuItems={foRackBarMenuItems({
              status: stay.status,
              assigned: Boolean(stay.roomId),
              arrivalDate: stay.arrivalDate,
              businessDate,
              canOpenCashiering,
              maintenanceRelevant,
              staffRole,
            })}
            onAction={(action) => onRackAction(action, actionStay)}
          />
        );
      })}
    </div>
  );
}

const RACK_ACTION_ICONS: Record<FoRackBarActionId, typeof LogIn> = {
  check_in: LogIn,
  assign_room: BedDouble,
  change_room: ArrowRightLeft,
  edit_stay: Pencil,
  no_show: Ban,
  cancel: Ban,
  open_folio: Receipt,
  check_out: LogOut,
  move_room: ArrowRightLeft,
  extend_stay: CalendarPlus,
  early_departure: CalendarMinus,
  add_service: Sparkles,
  guest_request: MessageSquare,
  late_checkout: Clock,
  open_maintenance: Wrench,
  view_details: Eye,
};

function RackStayMenu({
  items,
  tone,
  onAction,
}: {
  items: FoRackBarMenuItem[];
  tone: "bar" | "card";
  onAction: (action: FoRackBarActionId) => void;
}) {
  if (items.length === 0) return null;
  const firstDestructive = items.findIndex((item) => item.tone === "destructive");
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Stay actions"
          data-testid="fo-rack-bar-actions"
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-sm",
            tone === "bar"
              ? "text-white/90 hover:bg-white/15"
              : "text-[#251605] hover:bg-[#F3EEE4]",
          )}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreVertical className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" data-testid="fo-rack-bar-menu">
        {items.map((item, index) => {
          const Icon = RACK_ACTION_ICONS[item.id];
          return (
            <Fragment key={item.id}>
              {firstDestructive === index && index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                data-testid={`fo-rack-bar-action-${item.id}`}
                className={cn(
                  item.tone === "destructive" && "text-destructive focus:text-destructive",
                )}
                onSelect={() => onAction(item.id)}
              >
                <Icon />
                {item.label}
              </DropdownMenuItem>
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReservationBar({
  stay,
  phase,
  startCol,
  endCol,
  days,
  focusDate,
  showDrag,
  hasOpenDiscrepancy = false,
  menuItems,
  onOpen,
  onAction,
  onPreviewDates,
  onCommitDates,
  onRoomDragStart,
  amendment = null,
}: {
  stay: FoRackStay;
  phase: FoOperationalPhase;
  startCol: number;
  endCol: number;
  days: number;
  focusDate: string;
  showDrag: boolean;
  hasOpenDiscrepancy?: boolean;
  menuItems: FoRackBarMenuItem[];
  onOpen: (stay: FoRackStay) => void;
  onAction: (action: FoRackBarActionId) => void;
  onPreviewDates: (arrival: string, departure: string) => void;
  onCommitDates: (arrival: string, departure: string) => void;
  onRoomDragStart: (stay: FoRackStay) => void;
  amendment?: FoStayAmendmentHistoryRow | null;
}) {
  const dragged = useRef(false);
  const badges = liveStayBadges({ ...stay, hasOpenDiscrepancy });
  const compact = badgeDisplayMode(days);
  const span = endCol - startCol;
  const tone = operationalBarTone(phase);
  const allowMove = showDrag && phase !== "no_show" && phase !== "cancelled";
  const guestLabel =
    phase === "no_show"
      ? [rackBarGuestLabel(stay.guestName, stay.confirmationNumber, span), "No-Show"]
          .filter(Boolean)
          .join(" · ")
      : phase === "cancelled"
        ? [rackBarGuestLabel(stay.guestName, stay.confirmationNumber, span), "Cancelled"]
            .filter(Boolean)
            .join(" · ")
        : rackBarGuestLabel(stay.guestName, stay.confirmationNumber, span);
  const departing =
    phase === "in_house" && departureFallsInRackRange(stay.departureDate, focusDate, days);

  return (
    <div
      className="relative mx-1 flex min-w-0 items-stretch"
      style={{ gridColumn: `${startCol} / ${endCol}` }}
    >
      {allowMove ? (
        <span
          data-testid="fo-resize-start"
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize"
          onPointerDown={(e) =>
            startDateGesture(
              e,
              stay,
              "arrival",
              days,
              focusDate,
              onPreviewDates,
              onCommitDates,
              dragged,
            )
          }
        />
      ) : null}
      <button
        type="button"
        data-testid="fo-reservation-bar"
        title={stay.guestName}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-md border py-1 text-left text-xs font-medium",
          span <= 1 ? "pl-1 pr-5" : "pl-2 pr-8",
        )}
        style={{
          backgroundColor: tone.background,
          borderColor: tone.border,
          color: tone.color,
          ...(departing
            ? { borderRightWidth: 3, borderRightColor: FO_OPERATIONAL_COLOR.departing }
            : {}),
        }}
        onPointerDown={
          allowMove
            ? (e) =>
                startDateGesture(
                  e,
                  stay,
                  "shift",
                  days,
                  focusDate,
                  onPreviewDates,
                  onCommitDates,
                  dragged,
                )
            : undefined
        }
        onClick={(event) => {
          event.stopPropagation();
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onOpen(stay);
        }}
      >
        {allowMove ? (
          <span
            data-testid="fo-drag-handle"
            draggable
            className="shrink-0 cursor-grab opacity-70"
            aria-label="Drag to another room"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.dataTransfer.setData(FO_DRAG_MIME, stay.rackKey);
              e.dataTransfer.setData("text/plain", stay.rackKey);
              e.dataTransfer.effectAllowed = "move";
              onRoomDragStart(stay);
            }}
          >
            <GripVertical className="size-3.5" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate font-medium">{guestLabel}</span>
        {amendment ? (
          <>
            <span className="shrink-0 opacity-70">·</span>
            <FoStayAmendedMark amendment={amendment} />
          </>
        ) : null}
        {span >= 3 ? <StayBadgeStrip badges={badges} mode={compact} /> : null}
      </button>
      <div
        className={cn(
          "absolute inset-y-0 z-20 flex items-center",
          allowMove ? "right-1.5" : "right-0.5",
        )}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span aria-hidden className="mr-0.5 h-4 w-px" style={{ backgroundColor: tone.border }} />
        <RackStayMenu items={menuItems} tone="card" onAction={onAction} />
      </div>
      {allowMove ? (
        <span
          data-testid="fo-resize-end"
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize"
          onPointerDown={(e) =>
            startDateGesture(
              e,
              stay,
              "departure",
              days,
              focusDate,
              onPreviewDates,
              onCommitDates,
              dragged,
            )
          }
        />
      ) : null}
    </div>
  );
}

function startDateGesture(
  event: ReactPointerEvent<HTMLElement>,
  stay: FoRackStay,
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
    const ratio =
      rect.width <= 0 ? 0 : Math.min(0.999, Math.max(0, (clientX - rect.left) / rect.width));
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
  onSelectInHouse,
  onSelectRoom,
  onRackAction,
  canOpenCashiering,
  businessDate,
  staffRole,
  amendmentLatestByStay,
}: {
  rooms: OccupancyRoom[];
  stays: FoRackStay[];
  hkByRoom: Map<string, RackRoom>;
  today: string;
  groupBy: RackGroupBy;
  onGroupBy: (next: RackGroupBy) => void;
  openDiscrepancyRoomIds: Set<string>;
  onSelectStay: (stay: FrontOfficeStay) => void;
  onSelectInHouse: (target: FoRackInHouseTarget) => void;
  onSelectRoom: (target: FoHkTaskRoomTarget) => void;
  onRackAction: (action: FoRackBarActionId, stay: FrontOfficeStay) => void;
  canOpenCashiering: boolean;
  businessDate: string;
  staffRole?: string;
  amendmentLatestByStay: AmendmentLatestByStay;
}) {
  const todayStays = stays.filter((s) => s.arrivalDate <= today && s.departureDate > today);
  return (
    <div className="space-y-3" data-testid="fo-phone-rack-list">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room</p>
        <RackGroupSelect groupBy={groupBy} onGroupBy={onGroupBy} />
      </div>
      <p className="text-sm text-muted-foreground">
        Phone shows operational stays for this date. The week Gantt stays on larger screens.
      </p>
      {groupRackRooms(rooms, groupBy).map((group) => (
        <div key={group.key} className="space-y-2">
          {groupBy !== "none" ? (
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#765719]"
              data-testid="fo-rack-group"
            >
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
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-left font-medium hover:text-[#C89933] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933]"
                    data-testid="fo-room-identity"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectRoom(hkTaskTarget(room, hkByRoom.get(room.id) ?? null));
                    }}
                  >
                    <span>{room.roomNumber}</span>
                    <FoHkStatusGlyph status={hk?.housekeepingStatus} />
                    <span className="font-normal text-muted-foreground">· {room.roomTypeName}</span>
                  </button>
                  <StayBadgeStrip
                    badges={liveStayBadges({
                      guestVip: false,
                      hasOpenDiscrepancy: openDiscrepancyRoomIds.has(room.id),
                    })}
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
        {todayStays.map((stay) => {
          const room = stay.roomId ? (rooms.find((row) => row.id === stay.roomId) ?? null) : null;
          const actionStay = foRackActionStay(stay, businessDate);
          return (
            <li key={stay.rackKey} className="relative">
              <button
                type="button"
                data-testid="fo-phone-stay"
                className="w-full rounded-xl border border-[#DDD4C5] bg-card p-3 pr-10 text-left"
                onClick={() => selectRackStay(stay, room, today, onSelectStay, onSelectInHouse)}
              >
                <p className="flex min-w-0 items-baseline gap-1.5 font-medium">
                  <span className="truncate">{stay.guestName}</span>
                  {amendmentLatestByStay.get(stay.id) ? (
                    <>
                      <span className="shrink-0 text-muted-foreground">·</span>
                      <FoStayAmendedMark amendment={amendmentLatestByStay.get(stay.id)!} />
                    </>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stay.confirmationNumber} · {stay.roomNumber ?? "Unassigned"}
                </p>
                <StayBadgeStrip
                  badges={liveStayBadges({
                    ...stay,
                    hasOpenDiscrepancy: Boolean(
                      stay.roomId && openDiscrepancyRoomIds.has(stay.roomId),
                    ),
                  })}
                  mode="full"
                />
              </button>
              <div
                className="absolute right-2 top-2 flex items-center"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span aria-hidden className="mr-0.5 h-4 w-px bg-[#DDD4C5]" />
                <RackStayMenu
                  items={foRackBarMenuItems({
                    status: stay.status,
                    assigned: Boolean(stay.roomId),
                    arrivalDate: stay.arrivalDate,
                    businessDate,
                    canOpenCashiering,
                    maintenanceRelevant: foRackMaintenanceRelevant(
                      stay.roomId ? hkByRoom.get(stay.roomId)?.maintenanceStatus : null,
                    ),
                    staffRole,
                  })}
                  tone="card"
                  onAction={(action) => onRackAction(action, actionStay)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FoOperationalLegend() {
  return (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground"
      data-testid="fo-rack-legend"
    >
      {FO_OPERATIONAL_LEGEND.map((item) => (
        <li key={item.phase} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function RackFrozenHeaderCell({
  columnIndex,
  timelineEdge = false,
  children,
}: {
  columnIndex: number;
  timelineEdge?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "sticky z-20 flex min-h-9 items-center border-b border-r border-border bg-card px-2.5 py-2",
        timelineEdge && "border-r-[#C8BCA8] shadow-[3px_0_8px_-4px_rgba(37,22,5,0.12)]",
      )}
      style={{ left: rackFrozenStickyLeftPx(columnIndex) }}
    >
      {children}
    </div>
  );
}

function RackFrozenBodyCell({
  columnIndex,
  timelineEdge = false,
  children,
  className,
  style,
  ...rest
}: {
  columnIndex: number;
  timelineEdge?: boolean;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "sticky z-10 flex flex-col justify-center border-b border-r border-border bg-card px-2.5 py-1.5 text-sm",
        timelineEdge && "border-r-[#C8BCA8] shadow-[3px_0_8px_-4px_rgba(37,22,5,0.12)]",
        className,
      )}
      style={{ left: rackFrozenStickyLeftPx(columnIndex), ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

function RackStatusPill({
  statusKey,
  label,
  color,
}: {
  statusKey: string;
  label: string;
  color: string;
}) {
  const lightText = statusKey === "out_of_order" || statusKey === "occupied";
  return (
    <span
      className={cn(
        "inline-flex min-h-5 max-w-full items-center justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-none",
        lightText ? "text-white" : "text-[#251605]",
        statusKey === "vacant" && "border border-[#D4CFC4]",
      )}
      style={{ backgroundColor: color }}
      data-testid="fo-room-status"
    >
      {label}
    </span>
  );
}

function RackHkCell({ hk, hkAvailable }: { hk: RackRoom | null; hkAvailable: boolean }) {
  if (!hkAvailable) {
    return (
      <span className="text-xs text-muted-foreground" data-testid="fo-room-hk">
        —
      </span>
    );
  }
  const label = hkStatusAriaLabel(hk?.housekeepingStatus);
  if (!label) {
    return (
      <span className="text-xs text-muted-foreground" data-testid="fo-room-hk">
        —
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap text-[11px]"
      data-testid="fo-room-hk"
    >
      <FoHkStatusGlyph status={hk?.housekeepingStatus} />
      <span>{label}</span>
    </span>
  );
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
  if (status === "dirty")
    return <Circle className={iconClass} fill={color} style={{ color }} aria-hidden />;
  if (status === "inspected")
    return <ScanSearch className={iconClass} style={{ color }} aria-hidden />;
  return <Triangle className={iconClass} fill={color} style={{ color }} aria-hidden />;
}

export function dropReservationOnRoom(reservationId: string, targetRoomId: string) {
  return onRackDrop({ reservationId, targetRoomId }, {});
}
