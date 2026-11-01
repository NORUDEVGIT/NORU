import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  keepPreviousData,
  useIsFetching,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  Download,
  Filter,
  House,
  LogIn,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Table2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { ReservationStatusBadge } from "@/packages/pms/components/bookings/reservation-bits";
import {
  AssignRoomDialog,
  CheckInDialog,
  CheckOutDialog,
  RoomMoveDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { CreateReservationPage } from "@/packages/pms/components/bookings/create-reservation-page";
import {
  ExportPdfDialog,
  type ExportRange,
} from "@/packages/pms/components/guests/guest-export-pdf";
import type { ReservationContextActionId } from "@/packages/pms/components/reservations/reservation-context-actions";
import { ReservationContextMenu } from "@/packages/pms/components/reservations/reservation-context-menu";
import { ReservationDeskMoreFilters } from "@/packages/pms/components/reservations/reservation-desk-more-filters";
import {
  exportReservationsToPdf,
  openPdfWindow,
} from "@/packages/pms/components/reservations/reservation-export-pdf";
import {
  BookingCalendarPanel,
  type CalendarSharedFilters,
} from "@/packages/pms/components/reservations/booking-calendar";
import {
  DEFAULT_CALENDAR_VIEW,
  DEFAULT_TABLE_COLUMNS,
  DeskAvailabilityMenu,
  DeskDisplayMenu,
  DeskExceptionsMenu,
  type CalendarViewState,
  type TableColumns,
} from "@/packages/pms/components/reservations/reservation-desk-toolbar-menu";
import { GroupsWorkspace } from "@/packages/pms/components/reservations/groups-workspace";
import { WaitlistWorkspace } from "@/packages/pms/components/reservations/waitlist-workspace";
import { ArrivalsDeparturesWorkspace } from "@/packages/pms/components/workspaces/arrivals-departures-workspace";
import { ReservationControlWorkspace } from "@/packages/pms/components/workspaces/reservation-control-workspace";
import {
  FilterGroup,
  FilterOption,
} from "@/packages/pms/components/workspaces/guest-directory-workspace";
import {
  tabFromWorkspaceSection,
  workspaceSectionFromTab,
  type CalendarWorkspaceSection,
} from "@/packages/pms/lib/reservation-workspace/booking-calendar";
import {
  ReservationWorkspaceOverlay,
  type ReservationWorkspaceOverlayState,
} from "@/packages/pms/components/reservations/reservation-workspace-overlay";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import { WAVE4_GROUP_ACCOUNT_COPY } from "@/packages/pms/lib/guest-profile-wave4";
// Wave 4 guest account integration: listReservationsForGuestAccount reads reservations linked to account masters (not Sales & Events group blocks).
import { ReservationDetailSummary } from "@/packages/pms/components/workspaces/reservation-detail-summary";
import { ReservationDetailWorkspace } from "@/packages/pms/components/workspaces/reservation-detail-workspace";
import { ReservationEditWorkspace } from "@/packages/pms/components/workspaces/reservation-edit-workspace";
import { ReservationCancelWorkspace } from "@/packages/pms/components/workspaces/reservation-cancel-workspace";
import { ReservationNoShowWorkspace } from "@/packages/pms/components/workspaces/reservation-noshow-workspace";
import { getReservationDesk } from "@/packages/pms/lib/reservation-workspace/desk.server";
import type {
  OperationalReservationView,
  ReservationDeskRow,
  ReservationDeskSnapshot,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import {
  DESK_FILTER_ALL,
  DESK_SEARCH_DEBOUNCE_MS,
  EMPTY_ADVANCED_FILTERS,
  countActiveAdvancedFilters,
  deskFilterChips,
  hasActiveDeskConstraints,
  removeDeskFilterChip,
  toDeskSearchQuerySlice,
  validateDateRange,
  type DeskAdvancedFilters,
  type DeskBarFilters,
  type DeskSourceFilter,
  type DeskStatusFilter,
} from "@/packages/pms/lib/reservation-workspace/reservation-desk-filters";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import {
  setReservationStatus,
  copyReservation,
  getReservation,
  getRoomTypeAvailability,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import { useMoney } from "@/core/state/property-format";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

/** KPI icon chip: dark brown icon on a solid gold circle. */
const KPI_ICON_TONE = "bg-[#C89933] text-[#4a2c1a]";

const PAGE_SIZE = 25;
const ALL = DESK_FILTER_ALL;

/**
 * Export to PDF reads the desk page by page. Stop after this many pages
 * (40 x 25 = 1,000 reservations) so one export cannot run forever.
 */
const EXPORT_MAX_PAGES = 40;

type SourceFilter = DeskSourceFilter;
type StatusFilter = DeskStatusFilter;

/** How the reservation listing is drawn: table or calendar (same place, no navigation). */
type DeskLayout = "table" | "calendar";

/** What the work space under the menu icon is showing. */
type DeskPanel = "reservations" | "waitlist" | "exceptions";

type ReservationActionDialog = "assign_room" | "change_room" | "check_in" | "check_out";

const RESERVATION_ACTION_ROLES = new Set(["owner", "manager", "receptionist"]);

const VIEWS: Array<{
  id: OperationalReservationView;
  label: string;
  note?: string;
  icon: typeof ClipboardList;
}> = [
  { id: "all", label: "All Reservations", icon: ClipboardList },
  { id: "arrivals", label: "Arrivals", icon: LogIn },
  { id: "departures", label: "Departures", icon: LogOut },
  { id: "in_house", label: "In-House", icon: House },
  { id: "unassigned", label: "Unassigned", icon: DoorOpen },
  { id: "pending", label: "Pending", icon: TriangleAlert },
  { id: "groups", label: "Groups", note: "Groups & blocks", icon: Users },
];

/** Extra entries shown under the reservation views in the sidebar. */
const PANEL_ITEMS = [
  { id: "waitlist", label: "Waitlist", icon: Clock },
  { id: "exceptions", label: "Exceptions", icon: ShieldAlert },
] as const;

/** Period lengths for the day navigator (the arrows jump by this many days). */
const PERIOD_OPTIONS = [
  { days: 1, label: "Day" },
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
] as const;

/** Status and source choices shown inside More filters. */
const STATUS_OPTIONS: Array<[StatusFilter, string]> = [
  ["all", "All statuses"],
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["checked_in", "Checked In"],
  ["checked_out", "Checked Out"],
  ["cancelled", "Cancelled"],
  ["no_show", "No Show"],
];

const SOURCE_OPTIONS: Array<[SourceFilter, string]> = [
  ["all", "All sources"],
  ["staff", "Staff"],
  ["walk_in", "Walk-in"],
  ["direct_booking", "Direct booking"],
  ["future_online", "Future online"],
];

/** Choices staged inside the More filters menu; applied with "Apply filters". */
type DeskMenuDraft = {
  arrivalFrom: string;
  arrivalTo: string;
  status: StatusFilter;
  roomTypeId: string;
  source: SourceFilter;
  /** "all" or a rate plan name. Filtered in the browser. */
  ratePlan: string;
};

const DEFAULT_MENU_DRAFT: DeskMenuDraft = {
  arrivalFrom: "",
  arrivalTo: "",
  status: "all",
  roomTypeId: ALL,
  source: "all",
  ratePlan: "all",
};

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDeskDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

/** "19 Oct – 25 Oct 2026" for several days, "Mon, 19 Oct 2026" for one day. */
function formatRangeLabel(start: string, days: number): string {
  if (days <= 1) {
    return new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  const end = addDaysIso(start, days - 1);
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const short = { day: "numeric", month: "short", timeZone: "UTC" } as const;
  const startLabel = startDate.toLocaleDateString("en-GB", short);
  const endLabel = endDate.toLocaleDateString("en-GB", short);
  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();

  return startYear !== endYear
    ? `${startLabel} ${startYear} – ${endLabel} ${endYear}`
    : `${startLabel} – ${endLabel} ${endYear}`;
}

function formatMoney(value: number | null, currency: string | null): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency ?? "GBP",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency ?? ""} ${value.toFixed(2)}`.trim();
  }
}

/** Adds days to a YYYY-MM-DD date (UTC, so there is no timezone drift). */
function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localTodayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function sourceLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** KPI card: big number on top, label below, gold icon chip on the right. */
function KpiCard({
  label,
  value,
  hint,
  loading,
  icon,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  loading: boolean;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-white px-5 py-5 shadow-[0_2px_12px_rgba(74,44,26,0.10)]">
      <div className="min-w-0">
        {loading ? (
          <Skeleton className="h-8 w-14" />
        ) : (
          <p className="font-display text-3xl font-bold leading-none tracking-tight text-[#4a2c1a]">
            {value}
          </p>
        )}
        <p className="mt-2 truncate text-xs font-semibold text-[#4a2c1a]">{label}</p>
        {hint ? <p className="truncate text-[10px] text-[#7A6B58]">{hint}</p> : null}
      </div>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tone)}>
        {icon}
      </span>
    </div>
  );
}

function navigateToReturnPath(navigate: ReturnType<typeof useNavigate>, returnUrl: string) {
  const [pathname, searchStr] = returnUrl.split("?");
  const search: Record<string, string> = {};
  if (searchStr) {
    const params = new URLSearchParams(searchStr);
    for (const [key, val] of params.entries()) {
      search[key] = val;
    }
  }
  return navigate({
    to: pathname as any,
    search: Object.keys(search).length > 0 ? (search as any) : undefined,
  });
}

export function ReservationsWorkspace({
  membership,
  initialTab,
  initialCreate = false,
  initialGuestId,
  initialCompanyId,
  initialTravelAgentId,
  initialGroupId,
  initialReturnTo,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
  initialCreate?: boolean | undefined;
  initialGuestId?: string | undefined;
  initialCompanyId?: string | undefined;
  initialTravelAgentId?: string | undefined;
  initialGroupId?: string | undefined;
  initialReturnTo?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const calendarFetching =
    useIsFetching({ queryKey: ["reservation-calendar", restaurantId] }) > 0;
  const loadDesk = useServerFn(getReservationDesk);
  const loadRoomTypes = useServerFn(listRoomTypes);
  const submitStatus = useServerFn(setReservationStatus);
  const submitCopy = useServerFn(copyReservation);
  const loadReservation = useServerFn(getReservation);
  const loadAvailability = useServerFn(getRoomTypeAvailability);
  const money = useMoney();
  const canManageActions = RESERVATION_ACTION_ROLES.has(membership.role);

  const [view, setView] = useState<OperationalReservationView>("all");
  const [deskLayout, setDeskLayout] = useState<DeskLayout>("table");
  const [deskPanel, setDeskPanel] = useState<DeskPanel>("reservations");
  /** How the Booking Calendar is drawn (set from the Display menu). */
  const [calendarView, setCalendarView] = useState<CalendarViewState>(DEFAULT_CALENDAR_VIEW);
  /** Which optional table columns show (set from the Display menu). */
  const [tableColumns, setTableColumns] = useState<TableColumns>(DEFAULT_TABLE_COLUMNS);
  /** Reservation shown in the summary side panel (click a guest name or reservation number). */
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  /** Search text for the Waitlist and Exceptions panels (they filter their own rows). */
  const [panelSearch, setPanelSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [periodDays, setPeriodDays] = useState<number>(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [roomTypeId, setRoomTypeId] = useState(ALL);
  const [roomTypeName, setRoomTypeName] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  /** Rate plan filter: applied in the browser to the rows already loaded. */
  const [ratePlan, setRatePlan] = useState("all");
  /** Rate plan names seen in the loaded rows, used as the filter choices. */
  const [knownRatePlans, setKnownRatePlans] = useState<string[]>([]);
  const [advanced, setAdvanced] = useState<DeskAdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [menuDraft, setMenuDraft] = useState<DeskMenuDraft>(DEFAULT_MENU_DRAFT);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    kind: ReservationActionDialog;
    row: ReservationDeskRow;
  } | null>(null);
  const [overlay, setOverlay] = useState<ReservationWorkspaceOverlayState>(null);
  const [workspaceSection, setWorkspaceSection] = useState<CalendarWorkspaceSection>(() =>
    workspaceSectionFromTab(initialTab),
  );

  const returnTo = useMemo(() => {
    if (initialReturnTo) return initialReturnTo;
    if (initialGuestId) return `/restaurant/pms/guests/${initialGuestId}`;
    if (initialCompanyId) {
      return `/restaurant/pms/guests/${initialCompanyId}?section=companies&type=company&nav=overview`;
    }
    if (initialTravelAgentId) {
      return `/restaurant/pms/guests/${initialTravelAgentId}?section=travel_agents&type=travel_agent&nav=overview`;
    }
    if (initialGroupId) {
      return `/restaurant/pms/guests/${initialGroupId}?section=groups&type=group&nav=overview`;
    }
    return null;
  }, [initialReturnTo, initialGuestId, initialCompanyId, initialTravelAgentId, initialGroupId]);

  const returnToLabel = useMemo(() => {
    if (initialGuestId) return "Return to Guest Profile";
    if (initialCompanyId) return "Return to Company Profile";
    if (initialTravelAgentId) return "Return to Travel Agency Profile";
    if (initialGroupId) return "Return to Group Profile";
    if (returnTo) return "Return to Previous Page";
    return "Return to Reservation Desk";
  }, [initialGuestId, initialCompanyId, initialTravelAgentId, initialGroupId, returnTo]);

  const hydratedCreateRef = useRef(false);
  useEffect(() => {
    if (!initialCreate) {
      hydratedCreateRef.current = false;
      return;
    }
    if (initialCreate && !hydratedCreateRef.current) {
      hydratedCreateRef.current = true;
      setOverlay({
        type: "new-reservation",
        initialGuestId: initialGuestId ?? null,
        initialCompanyMasterId: initialCompanyId ?? null,
        initialTravelAgentMasterId: initialTravelAgentId ?? null,
        initialGroupMasterId: initialGroupId ?? null,
      });
    }
  }, [initialCreate, initialGuestId, initialCompanyId, initialTravelAgentId, initialGroupId]);

  useEffect(() => {
    setWorkspaceSection(workspaceSectionFromTab(initialTab));
  }, [initialTab]);
  const [calendarRow, setCalendarRow] = useState<ReservationDeskRow | null>(null);
  const [createGroupLink, setCreateGroupLink] = useState<{
    pmsGroupId: string;
    pmsGroupBlockId: string | null;
  } | null>(null);

  const roomTypesQuery = useQuery({
    queryKey: ["reservation-desk-room-types", restaurantId],
    queryFn: () => loadRoomTypes({ data: { restaurantId, includeInactive: false } }),
    staleTime: 5 * 60_000,
  });

  const bar: DeskBarFilters = {
    arrivalFrom: dateFrom,
    arrivalTo: dateTo,
    status,
    roomTypeId,
    roomTypeName,
    source,
  };
  const arrivalError = validateDateRange(dateFrom, dateTo, "Arrival From", "Arrival To");
  const deskQuerySlice = toDeskSearchQuerySlice(
    debouncedSearch,
    arrivalError ? { ...bar, arrivalFrom: "", arrivalTo: "" } : bar,
    advanced,
  );

  /**
   * Search + filters handed to the Booking Calendar, so it follows the same
   * controls as the table. Search and source narrow the bars; status, room
   * type and the period (start date + length) are sent to the calendar query.
   * `view` carries the Display menu choices (layout, density, building, ...).
   */
  const calendarShared = useMemo<CalendarSharedFilters>(
    () => ({
      search: debouncedSearch,
      status,
      roomTypeId: roomTypeId === ALL ? "all" : roomTypeId,
      source,
      ratePlan,
      rangeStart: dateFrom || null,
      // The calendar always follows the period buttons (Day, 7, 14, 30 days).
      horizon: periodDays,
      view: calendarView,
    }),
    [debouncedSearch, status, roomTypeId, source, ratePlan, dateFrom, periodDays, calendarView],
  );

  /** Switching to the calendar with nothing picked shows a week instead of one day. */
  function changeDeskLayout(next: DeskLayout) {
    if (next === "calendar" && !dateFrom && !dateTo && periodDays === 1) {
      setPeriodDays(7);
    }
    setDeskLayout(next);
  }

  const deskQuery = useQuery({
    queryKey: [
      "reservation-desk",
      restaurantId,
      view,
      debouncedSearch,
      dateFrom,
      dateTo,
      status,
      roomTypeId,
      source,
      advanced,
      page,
    ],
    queryFn: () =>
      loadDesk({
        data: {
          restaurantId,
          view,
          page,
          pageSize: PAGE_SIZE,
          ...deskQuerySlice,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ["reservation", restaurantId, "summary", summaryId],
    queryFn: () => loadReservation({ data: { restaurantId, reservationId: summaryId! } }),
    enabled: summaryId !== null,
    retry: false,
  });
  const summaryReservation = summaryQuery.data?.reservation;

  // Room photo for the summary (same query key as the full detail screen, so it is shared).
  const summaryAvailabilityQuery = useQuery({
    queryKey: [
      "reservation-detail-availability",
      restaurantId,
      summaryReservation?.arrivalDate,
      summaryReservation?.departureDate,
    ],
    queryFn: () =>
      loadAvailability({
        data: {
          restaurantId,
          arrival: summaryReservation!.arrivalDate,
          departure: summaryReservation!.departureDate,
        },
      }),
    enabled: Boolean(summaryReservation),
    retry: false,
  });
  const summaryCoverUrl =
    (summaryAvailabilityQuery.data ?? []).find(
      (row) => row.roomTypeId === summaryReservation?.roomTypeId,
    )?.coverUrl ?? null;

  function invalidateReservationReads() {
    void queryClient.invalidateQueries({ queryKey: ["reservation-desk", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-quick-view", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-calendar", restaurantId] });
    void queryClient.invalidateQueries({
      queryKey: ["reservation-calendar-exceptions", restaurantId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["reservation-desk-availability", restaurantId],
    });
  }

  const statusMutation = useMutation({
    mutationFn: (input: { reservationId: string; status: "pending" | "confirmed" }) =>
      submitStatus({
        data: {
          restaurantId,
          reservationId: input.reservationId,
          status: input.status,
        },
      }),
    onSuccess: (_, input) => {
      toast.success(
        input.status === "confirmed" ? "Reservation confirmed." : "Reservation reactivated.",
      );
      invalidateReservationReads();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copyMutation = useMutation({
    mutationFn: (reservationId: string) => submitCopy({ data: { restaurantId, reservationId } }),
    onSuccess: (result) => {
      toast.success(`Copied as ${result.confirmationNumber}.`);
      invalidateReservationReads();
      setOverlay({ type: "reservation-detail", reservationId: result.id });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), DESK_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Waitlist and Exceptions each start with a clean search.
  useEffect(() => {
    setPanelSearch("");
  }, [deskPanel, workspaceSection]);

  function resetPage() {
    setPage(1);
  }

  function selectView(next: OperationalReservationView) {
    setView(next);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setDateFrom("");
    setDateTo("");
    setStatus("all");
    setRoomTypeId(ALL);
    setRoomTypeName("");
    setSource("all");
    setRatePlan("all");
    setAdvanced(EMPTY_ADVANCED_FILTERS);
    setPage(1);
  }

  /* Day navigator: filters the arrival dates by a day, 7, 14 or 30 day window. */
  function applyPeriod(from: string, days: number) {
    setDateFrom(from);
    setDateTo(addDaysIso(from, days - 1));
    resetPage();
  }

  function periodToday() {
    applyPeriod(snapshot?.businessDate || localTodayIso(), periodDays);
  }

  function shiftPeriod(direction: 1 | -1) {
    const base = dateFrom || dateTo || snapshot?.businessDate || localTodayIso();
    applyPeriod(addDaysIso(base, direction * periodDays), periodDays);
  }

  function changePeriod(days: number) {
    setPeriodDays(days);
    if (dateFrom || dateTo) applyPeriod(dateFrom || dateTo, days);
  }

  /**
   * Export to PDF.
   * Reads every reservation arriving in the chosen period (not just the page on
   * screen). The current view, search, status, room type, source and advanced
   * filters still apply. "All dates" keeps the Arrival dates set in More filters.
   * The print window is opened by the caller, inside the click, so the browser
   * does not block it.
   */
  async function exportReservations(range: ExportRange, printWindow: Window) {
    setExporting(true);

    try {
      const exportBar: DeskBarFilters =
        range.preset === "all"
          ? arrivalError
            ? { ...bar, arrivalFrom: "", arrivalTo: "" }
            : bar
          : { ...bar, arrivalFrom: range.from ?? "", arrivalTo: range.to ?? "" };

      const slice = toDeskSearchQuerySlice(debouncedSearch, exportBar, advanced);

      const collected: ReservationDeskRow[] = [];
      let nextPage = 1;
      let hasMore = true;

      while (hasMore && nextPage <= EXPORT_MAX_PAGES) {
        const result = await loadDesk({
          data: {
            restaurantId,
            view,
            page: nextPage,
            pageSize: PAGE_SIZE,
            ...slice,
          },
        });

        collected.push(...result.rows);
        hasMore = result.query.hasMore;
        nextPage += 1;
      }

      if (hasMore) {
        toast.message(
          `Exported the first ${collected.length} reservations. Narrow the period to export the rest.`,
        );
      }

      // Rate plan is filtered in the browser, so the PDF applies it to every page it read.
      const exportRows =
        ratePlan === "all" ? collected : collected.filter((row) => row.ratePlanName === ratePlan);

      const activeFilters = [
        debouncedSearch.trim() ? `Search: "${debouncedSearch.trim()}"` : null,
        roomTypeName ? `Room type: ${roomTypeName}` : null,
        status !== "all" ? `Status: ${status.replaceAll("_", " ")}` : null,
        source !== "all" ? `Source: ${sourceLabel(source)}` : null,
        ratePlan !== "all" ? `Rate plan: ${ratePlan}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      exportReservationsToPdf({
        printWindow,
        title: "Reservations",
        restaurantName: membership.restaurant.name,
        scope: VIEWS.find((item) => item.id === view)?.label ?? "All Reservations",
        rangeLabel: range.label,
        filters: activeFilters,
        rows: exportRows.map((row) => ({
          confirmationNumber: row.confirmationNumber,
          guestName: row.guestName,
          roomTypeName: row.roomTypeName,
          room: row.roomNumber ?? "Unassigned",
          arrival: formatDate(row.arrivalDate),
          departure: formatDate(row.departureDate),
          nights: row.nights,
          adults: row.adults,
          children: row.children,
          status: row.status.replaceAll("_", " "),
          source: sourceLabel(row.source),
          ratePlan: row.ratePlanName ?? "—",
          total: formatMoney(row.roomSubtotal, row.currency),
        })),
      });
    } catch (error) {
      printWindow.close();
      toast.error(error instanceof Error ? error.message : "Could not export reservations.");
    } finally {
      setExporting(false);
    }
  }

  /* More filters menu: choices are staged in `menuDraft` and applied together. */
  function patchMenuDraft(patch: Partial<DeskMenuDraft>) {
    setMenuDraft((current) => ({ ...current, ...patch }));
  }

  function toggleFilterGroup(id: string) {
    setOpenGroups((current) =>
      current.includes(id) ? current.filter((group) => group !== id) : [...current, id],
    );
  }

  function applyMenuFilters(next: DeskMenuDraft) {
    setDateFrom(next.arrivalFrom);
    setDateTo(next.arrivalTo);
    setStatus(next.status);
    setRoomTypeId(next.roomTypeId);
    setRoomTypeName(
      (roomTypesQuery.data ?? []).find((roomType) => roomType.id === next.roomTypeId)?.name ?? "",
    );
    setSource(next.source);
    setRatePlan(next.ratePlan);
    resetPage();
    setFilterMenuOpen(false);
  }

  function handleFilterMenuOpenChange(open: boolean) {
    setFilterMenuOpen(open);
    if (open) {
      setMenuDraft({
        arrivalFrom: dateFrom,
        arrivalTo: dateTo,
        status,
        roomTypeId,
        source,
        ratePlan,
      });
    }
  }

  function openReservation(id: string) {
    setOverlay({ type: "reservation-detail", reservationId: id });
  }

  function openEditReservation(id: string) {
    setOverlay({ type: "edit-reservation", reservationId: id });
  }

  function openCancelReservation(id: string) {
    setOverlay({ type: "cancel-reservation", reservationId: id });
  }

  function openNoShowReservation(id: string) {
    setOverlay({ type: "no-show-reservation", reservationId: id });
  }

  function goWorkspaceSection(section: CalendarWorkspaceSection) {
    setWorkspaceSection(section);
    void navigate({
      to: "/restaurant/pms/reservations",
      search: { tab: tabFromWorkspaceSection(section) },
    });
  }

  function closeWorkspaceOverlay(open: boolean) {
    if (open) return;
    setOverlay(null);
    setCreateGroupLink(null);
    invalidateReservationReads();
    if (returnTo) {
      void navigateToReturnPath(navigate, returnTo);
    } else if (initialCreate) {
      void navigate({
        to: "/restaurant/pms/reservations",
        search: { tab: tabFromWorkspaceSection(workspaceSection) },
      });
    }
  }

  function handleReservationAction(
    actionId: ReservationContextActionId,
    row: ReservationDeskRow,
  ) {
    switch (actionId) {
      case "open":
        openReservation(row.reservationId);
        return;
      case "edit":
        openEditReservation(row.reservationId);
        return;
      case "copy":
        copyMutation.mutate(row.reservationId);
        return;
      case "open_folio":
        return;
      case "confirm":
        statusMutation.mutate({
          reservationId: row.reservationId,
          status: "confirmed",
        });
        return;
      case "reactivate":
        statusMutation.mutate({
          reservationId: row.reservationId,
          status: "pending",
        });
        return;
      case "cancel":
        openCancelReservation(row.reservationId);
        return;
      case "no_show":
        openNoShowReservation(row.reservationId);
        return;
      case "assign_room":
      case "change_room":
      case "check_in":
      case "check_out":
        setActionDialog({ kind: actionId, row });
    }
  }

  function closeActionDialog(open: boolean) {
    if (open) return;
    setActionDialog(null);
    invalidateReservationReads();
  }

  const snapshot = deskQuery.data;

  // Remember rate plan names from every page loaded, so they can be picked in the Filter menu.
  useEffect(() => {
    const names = (snapshot?.rows ?? [])
      .map((row) => row.ratePlanName)
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) return;
    setKnownRatePlans((current) => {
      const merged = Array.from(new Set([...current, ...names])).sort();
      return merged.length === current.length ? current : merged;
    });
  }, [snapshot]);

  // Rate plan filter: applied in the browser to the rows on this page.
  const visibleRows = (snapshot?.rows ?? []).filter(
    (row) => ratePlan === "all" || row.ratePlanName === ratePlan,
  );
  const kpis = snapshot?.kpis;
  const total = snapshot?.query.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isInitialLoading = deskQuery.isLoading && !snapshot;
  const filterChips = deskFilterChips(bar, advanced);

  /** True when "Groups" is picked in the sidebar: the Groups & Blocks workspace replaces the listing. */
  const groupsViewOpen =
    workspaceSection === "desk" && deskPanel === "reservations" && view === "groups";

  // KPIs are hidden on the other workspace tabs, while the Waitlist or
  // Exceptions panel is open inside the Reservation Desk, and on the Groups view.
  const showKpis =
    !(
      workspaceSection === "groups" ||
      workspaceSection === "waitlist" ||
      workspaceSection === "arrivals-departures" ||
      workspaceSection === "exceptions"
    ) &&
    !(workspaceSection === "desk" && deskPanel !== "reservations") &&
    !groupsViewOpen;

  /** The standalone Booking Calendar tab is always a calendar; the desk follows the toggle. */
  const controlsLayout: DeskLayout = workspaceSection === "calendar" ? "calendar" : deskLayout;

  /**
   * Groups & Blocks workspace (search, status filter, New Group button, table,
   * quick view). Used by the sidebar "Groups" view and the standalone Groups tab.
   */
  const groupsWorkspaceEl = (
    <GroupsWorkspace
      restaurantId={restaurantId}
      canWrite={membership.role === "owner" || membership.role === "manager"}
      onCreateStay={(groupId, blockId) => {
        setCreateGroupLink({ pmsGroupId: groupId, pmsGroupBlockId: blockId });
        setOverlay({ type: "new-reservation" });
      }}
      onOpenReservation={openReservation}
    />
  );

  /**
   * Search + filter controls. They sit inside the table panel, directly under
   * the Table / Calendar toolbar, and only show for the reservation listing.
   * The standalone Booking Calendar tab shows them too.
   */
  const deskControls = (
    <div
      className="min-w-0 border-b border-border bg-white p-3"
      data-testid="reservation-desk-controls"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#c9a24a]" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            className="h-9 rounded-full border-[#c9a24a] bg-white pl-10 text-sm font-medium"
            placeholder="Search confirmation, guest, phone, email or room"
            aria-label="Search reservations"
          />
        </div>

        <DeskFilterMenu
          open={filterMenuOpen}
          onOpenChange={handleFilterMenuOpenChange}
          activeCount={filterChips.length + (ratePlan !== "all" ? 1 : 0)}
          title="Filter reservations"
          onApply={() => applyMenuFilters(menuDraft)}
          onClear={() => applyMenuFilters(DEFAULT_MENU_DRAFT)}
        >
          <FilterGroup
            id="status"
            title="Status"
            count={menuDraft.status !== "all" ? 1 : 0}
            open={openGroups.includes("status")}
            onToggle={toggleFilterGroup}
          >
            {STATUS_OPTIONS.map(([id, label]) => (
              <FilterOption
                key={id}
                type="radio"
                name="desk-filter-status"
                label={label}
                checked={menuDraft.status === id}
                onChange={() => patchMenuDraft({ status: id })}
              />
            ))}
          </FilterGroup>

          <FilterGroup
            id="room-type"
            title="Room type"
            count={menuDraft.roomTypeId !== ALL ? 1 : 0}
            open={openGroups.includes("room-type")}
            onToggle={toggleFilterGroup}
          >
            <FilterOption
              type="radio"
              name="desk-filter-room-type"
              label="All room types"
              checked={menuDraft.roomTypeId === ALL}
              onChange={() => patchMenuDraft({ roomTypeId: ALL })}
            />
            {(roomTypesQuery.data ?? []).map((roomType) => (
              <FilterOption
                key={roomType.id}
                type="radio"
                name="desk-filter-room-type"
                label={roomType.name}
                checked={menuDraft.roomTypeId === roomType.id}
                onChange={() => patchMenuDraft({ roomTypeId: roomType.id })}
              />
            ))}
          </FilterGroup>

          <FilterGroup
            id="source"
            title="Source"
            count={menuDraft.source !== "all" ? 1 : 0}
            open={openGroups.includes("source")}
            onToggle={toggleFilterGroup}
          >
            {SOURCE_OPTIONS.map(([id, label]) => (
              <FilterOption
                key={id}
                type="radio"
                name="desk-filter-source"
                label={label}
                checked={menuDraft.source === id}
                onChange={() => patchMenuDraft({ source: id })}
              />
            ))}
          </FilterGroup>

          <FilterGroup
            id="rate-plan"
            title="Rate plan"
            count={menuDraft.ratePlan !== "all" ? 1 : 0}
            open={openGroups.includes("rate-plan")}
            onToggle={toggleFilterGroup}
          >
            <FilterOption
              type="radio"
              name="desk-filter-rate-plan"
              label="All rate plans"
              checked={menuDraft.ratePlan === "all"}
              onChange={() => patchMenuDraft({ ratePlan: "all" })}
            />
            {Array.from(
              new Set([
                ...knownRatePlans,
                ...(menuDraft.ratePlan !== "all" ? [menuDraft.ratePlan] : []),
              ]),
            ).map((name) => (
              <FilterOption
                key={name}
                type="radio"
                name="desk-filter-rate-plan"
                label={name}
                checked={menuDraft.ratePlan === name}
                onChange={() => patchMenuDraft({ ratePlan: name })}
              />
            ))}
          </FilterGroup>

          <FilterGroup
            id="arrival"
            title="Arrival dates"
            count={menuDraft.arrivalFrom || menuDraft.arrivalTo ? 1 : 0}
            open={openGroups.includes("arrival")}
            onToggle={toggleFilterGroup}
          >
            <div className="grid gap-2 py-1">
              <label className="grid gap-1 text-[11px] font-medium text-[#7A6B58]">
                From
                <Input
                  type="date"
                  className="h-9"
                  value={menuDraft.arrivalFrom}
                  onChange={(event) => patchMenuDraft({ arrivalFrom: event.target.value })}
                  onKeyDown={(event) => event.stopPropagation()}
                />
              </label>
              <label className="grid gap-1 text-[11px] font-medium text-[#7A6B58]">
                To
                <Input
                  type="date"
                  className="h-9"
                  value={menuDraft.arrivalTo}
                  onChange={(event) => patchMenuDraft({ arrivalTo: event.target.value })}
                  onKeyDown={(event) => event.stopPropagation()}
                />
              </label>
            </div>
          </FilterGroup>

          {/* The existing advanced filters stay available from here. */}
          <button
            type="button"
            onClick={() => {
              setFilterMenuOpen(false);
              setMoreFiltersOpen(true);
            }}
            className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left text-sm font-bold hover:bg-[#f5ead0]"
            data-testid="reservation-desk-more-filters-button"
          >
            <span className="flex items-center gap-2">
              Advanced filters
              {countActiveAdvancedFilters(advanced) > 0 ? (
                <span className="rounded-full bg-[#c9a24a] px-2 text-[11px] font-extrabold text-[#2b1a10]">
                  {countActiveAdvancedFilters(advanced)}
                </span>
              ) : null}
            </span>
            <SlidersHorizontal className="size-4 text-[#c9a24a]" />
          </button>
        </DeskFilterMenu>

        {hasActiveDeskConstraints(search, bar, advanced) || ratePlan !== "all" ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 rounded-full border-[#e9dfd0] bg-white text-[#4a2c1a] shadow-none hover:bg-[#f5ead0]"
          disabled={exporting}
          onClick={() => setExportOpen(true)}
          aria-label="Export PDF"
          title="Export PDF"
          data-testid="reservation-desk-export-pdf"
        >
          <Download className={cn("size-4 text-[#c9a24a]", exporting && "animate-pulse")} />
        </Button>

        <Button
          className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
          onClick={() => {
            setCreateGroupLink(null);
            setOverlay({ type: "new-reservation" });
          }}
        >
          <CalendarPlus className="size-4" />
          New Reservation
        </Button>
      </div>

      {/* Today / Day / 7 / 14 / 30 days, with Display, Exceptions and Availability on the same row */}
      <DeskPeriodNav
        from={dateFrom}
        to={dateTo}
        today={snapshot?.businessDate || localTodayIso()}
        periodDays={periodDays}
        onToday={periodToday}
        onPrev={() => shiftPeriod(-1)}
        onNext={() => shiftPeriod(1)}
        onPeriodChange={changePeriod}
        heading={
          controlsLayout === "calendar" ? (
            <div className="mr-2 min-w-0">
              <p className="truncate font-display text-lg font-semibold leading-tight text-[#4a2c1a]">
                {formatRangeLabel(
                  dateFrom || snapshot?.businessDate || localTodayIso(),
                  periodDays,
                )}
              </p>
              <p className="text-[11px] text-[#7A6B58]">
                Business date {formatDeskDate(snapshot?.businessDate || localTodayIso())}
                {calendarFetching ? " · Updating…" : ""}
              </p>
            </div>
          ) : null
        }
      >
        <DeskDisplayMenu
          layout={controlsLayout}
          calendarView={calendarView}
          onCalendarViewChange={setCalendarView}
          columns={tableColumns}
          onColumnsChange={setTableColumns}
        />
        <DeskExceptionsMenu restaurantId={restaurantId} onOpenReservation={openReservation} />
        <DeskAvailabilityMenu
          restaurantId={restaurantId}
          start={dateFrom || snapshot?.businessDate || localTodayIso()}
          days={periodDays}
        />
        {controlsLayout === "calendar" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Refresh calendar"
            title="Refresh calendar"
            disabled={calendarFetching}
            onClick={() =>
              void queryClient.invalidateQueries({
                queryKey: ["reservation-calendar", restaurantId],
              })
            }
          >
            <RefreshCw className={cn("size-4", calendarFetching && "animate-spin")} />
          </Button>
        ) : null}
      </DeskPeriodNav>

      {arrivalError ? <p className="mt-2 text-xs text-destructive">{arrivalError}</p> : null}
      {filterChips.length > 0 || ratePlan !== "all" ? (
        <ul className="mt-3 flex flex-wrap gap-2" data-testid="reservation-desk-filter-chips">
          {filterChips.map((chip) => (
            <li key={chip.id}>
              <button
                type="button"
                aria-label={chip.removeLabel}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a24a] bg-[#f5ead0] py-0.5 pl-3 pr-2 text-xs font-bold text-[#4a2c1a]"
                onClick={() => {
                  const next = removeDeskFilterChip(chip.id, bar, advanced);
                  setDateFrom(next.bar.arrivalFrom);
                  setDateTo(next.bar.arrivalTo);
                  setStatus(next.bar.status);
                  setRoomTypeId(next.bar.roomTypeId);
                  setRoomTypeName(next.bar.roomTypeName);
                  setSource(next.bar.source);
                  setAdvanced(next.advanced);
                  resetPage();
                }}
              >
                {chip.label}
                <X className="size-3" />
              </button>
            </li>
          ))}
          {ratePlan !== "all" ? (
            <li>
              <button
                type="button"
                aria-label={`Remove filter Rate plan ${ratePlan}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a24a] bg-[#f5ead0] py-0.5 pl-3 pr-2 text-xs font-bold text-[#4a2c1a]"
                onClick={() => setRatePlan("all")}
              >
                Rate plan: {ratePlan}
                <X className="size-3" />
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );

  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Reservations"
      searchPlaceholder="Search reservation…"
      helpLabel="Reservation Desk operational workspace"
      shellTestId="reservation-desk-command-shell"
      onRoomSearch={(value) => {
        // The header search follows whichever panel is open.
        const panelOpen =
          (workspaceSection === "desk" && deskPanel !== "reservations") ||
          workspaceSection === "waitlist" ||
          workspaceSection === "exceptions";
        if (panelOpen) setPanelSearch(value);
        else setSearch(value);
      }}
    >
      <div className="w-full min-w-0 bg-[#fbfbfb]" data-testid="reservation-desk">
        <header className="border-b border-border bg-background pb-4">
          <div className="px-5 pt-4 sm:px-6">
            <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-[#4a2c1a]">
              {workspaceSection === "calendar"
                ? "Booking Calendar"
                : workspaceSection === "groups" || groupsViewOpen
                  ? "Groups & Blocks"
                  : workspaceSection === "waitlist"
                    ? "Waitlist"
                    : workspaceSection === "arrivals-departures"
                      ? "Arrivals & Departures"
                      : workspaceSection === "exceptions"
                        ? "Exceptions"
                        : "Reservation Desk"}
            </h1>
          </div>
          {/* KPI strip: sits above the section tabs */}
          {showKpis ? (
            <div className="px-5 pt-4 sm:px-6">
              <section
                className="grid grid-cols-2 gap-3 rounded-2xl border border-[#e9dfd0] bg-white p-3 shadow-sm md:grid-cols-3 xl:grid-cols-6"
                aria-label="Reservation KPIs"
              >
                <KpiCard
                  label="Total Reservations"
                  value={total}
                  loading={isInitialLoading}
                  icon={<ClipboardList className="size-4" />}
                  tone={KPI_ICON_TONE}
                />
                <KpiCard
                  label="Arrivals Today"
                  value={kpis?.arrivalsToday ?? 0}
                  loading={isInitialLoading}
                  icon={<LogIn className="size-4" />}
                  tone={KPI_ICON_TONE}
                />
                <KpiCard
                  label="Departures Today"
                  value={kpis?.departuresToday ?? 0}
                  loading={isInitialLoading}
                  icon={<LogOut className="size-4" />}
                  tone={KPI_ICON_TONE}
                />
                <KpiCard
                  label="In-House"
                  value={kpis?.inHouse ?? 0}
                  loading={isInitialLoading}
                  icon={<House className="size-4" />}
                  tone={KPI_ICON_TONE}
                />
                <KpiCard
                  label="Unassigned"
                  value={kpis?.unassigned ?? 0}
                  loading={isInitialLoading}
                  icon={<TriangleAlert className="size-4" />}
                  tone={KPI_ICON_TONE}
                />
                <KpiCard
                  label="Available Rooms"
                  value={kpis?.availableRooms ?? 0}
                  loading={isInitialLoading}
                  icon={<DoorOpen className="size-4" />}
                  tone={KPI_ICON_TONE}
                />
              </section>
            </div>
          ) : null}

        </header>

        <main className="min-w-0 w-full space-y-4 p-4 sm:p-5 lg:p-6">
          {workspaceSection === "desk" ? (
            <section className="relative flex min-h-[24rem] min-w-0 overflow-hidden rounded-xl border border-[#e9dfd0] bg-white shadow-sm">
              <ViewsSidebar
                view={view}
                panel={deskPanel}
                snapshot={snapshot}
                onSelect={(id) => {
                  selectView(id);
                  setDeskLayout("table");
                  setDeskPanel("reservations");
                }}
                onSelectPanel={setDeskPanel}
              />

              <div className="min-w-0 flex-1">
                {deskPanel === "waitlist" ? (
                  <>
                    <PanelTitle
                      icon={<Clock className="size-4 text-[#c9a24a]" />}
                      label="Waitlist"
                    />
                    <div className="min-w-0 p-3">
                      <WaitlistWorkspace
                        restaurantId={restaurantId}
                        search={panelSearch}
                        onSearchChange={setPanelSearch}
                        canWrite={membership.role === "owner" || membership.role === "manager"}
                        onOpenReservation={openReservation}
                      />
                    </div>
                  </>
                ) : deskPanel === "exceptions" ? (
                  <>
                    <PanelTitle
                      icon={<ShieldAlert className="size-4 text-[#c9a24a]" />}
                      label="Exceptions"
                    />
                    <div className="min-w-0 p-3">
                      <ReservationControlWorkspace
                        restaurantId={restaurantId}
                        search={panelSearch}
                        onSearchChange={setPanelSearch}
                        currencyCode={membership.restaurant.currencyCode}
                        canManage={canManageActions}
                        onOpenReservation={openReservation}
                        onOpenCalendar={() => {
                          setDeskPanel("reservations");
                          setDeskLayout("calendar");
                        }}
                      />
                    </div>
                  </>
                ) : groupsViewOpen ? (
                  <>
                    <PanelTitle
                      icon={<Users className="size-4 text-[#c9a24a]" />}
                      label="Groups & Blocks"
                    />
                    <div className="min-w-0 p-3">{groupsWorkspaceEl}</div>
                  </>
                ) : (
                  <>
                    <ViewsToolbar
                      view={view}
                      snapshot={snapshot}
                      layout={deskLayout}
                      onLayoutChange={changeDeskLayout}
                      onRefresh={() => void deskQuery.refetch()}
                      refreshing={deskQuery.isFetching}
                    />

                    {/* Search + filters, directly under the table / calendar toolbar */}
                    {deskControls}

                    {deskLayout === "calendar" ? (
                      <div className="min-w-0 p-3">
                        <BookingCalendarPanel
                          restaurantId={restaurantId}
                          canManage={canManageActions}
                          selectedId={null}
                          shared={calendarShared}
                          onSelect={(row) => {
                            setCalendarRow(row);
                            openReservation(row.reservationId);
                          }}
                          onOpen={openReservation}
                          onAction={handleReservationAction}
                        />
                      </div>
                    ) : (
                      <>
                        {deskQuery.isFetching && !isInitialLoading ? (
                          <p className="border-b border-border px-3 py-1 text-[11px] text-[#7A6B58]">
                            Updating results…
                          </p>
                        ) : null}

                        {deskQuery.isError ? (
                          <InlineError
                            message={
                              deskQuery.error instanceof Error
                                ? deskQuery.error.message
                                : "Could not load the Reservation Desk."
                            }
                            onRetry={() => void deskQuery.refetch()}
                          />
                        ) : isInitialLoading ? (
                          <DeskTableSkeleton />
                        ) : visibleRows.length === 0 ? (
                          <div className="grid min-h-72 place-items-center px-6 text-center">
                            <div>
                              <p className="font-medium text-[#4a2c1a]">
                                {hasActiveDeskConstraints(search, bar, advanced)
                                  ? "No reservations match these filters"
                                  : "No reservations in this view"}
                              </p>
                              <p className="mt-1 text-sm text-[#7A6B58]">
                                {hasActiveDeskConstraints(search, bar, advanced)
                                  ? "Try adjusting your dates, status, room, or advanced filters."
                                  : "Adjust the filters or clear the search to continue."}
                              </p>
                              {hasActiveDeskConstraints(search, bar, advanced) ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-4"
                                  onClick={clearFilters}
                                >
                                  Clear Filters
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <ReservationTable
                            rows={visibleRows}
                            businessDate={snapshot?.businessDate ?? ""}
                            canManage={canManageActions}
                            selectedId={summaryId}
                            columns={tableColumns}
                            onSummary={setSummaryId}
                            onOpen={openReservation}
                            onAction={handleReservationAction}
                          />
                        )}

                        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                          <p className="text-xs text-[#7A6B58]">
                            Page {snapshot?.query.page ?? page} of {pages} · {total} total ·{" "}
                            {PAGE_SIZE} per page
                            {ratePlan !== "all"
                              ? ` · Rate plan filter: ${visibleRows.length} of ${snapshot?.rows.length ?? 0} on this page`
                              : ""}
                          </p>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-[#e9dfd0] text-[#4a2c1a] hover:bg-[#f5ead0]"
                              disabled={page <= 1 || deskQuery.isFetching}
                              onClick={() => setPage((current) => Math.max(1, current - 1))}
                            >
                              <ChevronLeft className="size-4" />
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-[#e9dfd0] text-[#4a2c1a] hover:bg-[#f5ead0]"
                              disabled={!snapshot?.query.hasMore || deskQuery.isFetching}
                              onClick={() => setPage((current) => current + 1)}
                            >
                              Next
                              <ChevronRight className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              {summaryId &&
              deskPanel === "reservations" &&
              deskLayout === "table" &&
              !groupsViewOpen ? (
                <ReservationSummaryPanel
                  reservation={summaryReservation}
                  coverUrl={summaryCoverUrl}
                  loading={summaryQuery.isLoading}
                  error={
                    summaryQuery.isError
                      ? summaryQuery.error instanceof Error
                        ? summaryQuery.error.message
                        : "Could not load the summary."
                      : null
                  }
                  money={(value) => money(value)}
                  nights={
                    (snapshot?.rows ?? []).find((row) => row.reservationId === summaryId)
                      ?.nights ?? 0
                  }
                  onClose={() => setSummaryId(null)}
                  onOpenFull={() => openReservation(summaryId)}
                />
              ) : null}
            </section>
          ) : workspaceSection === "arrivals-departures" ? (
            <ArrivalsDeparturesWorkspace
              restaurantId={restaurantId}
              timezone={membership.restaurant.timezone}
              currencyCode={membership.restaurant.currencyCode}
              canManage={canManageActions}
              onOpenReservation={openReservation}
            />
          ) : workspaceSection === "exceptions" ? (
            <section className="min-w-0 overflow-hidden rounded-xl border border-[#e9dfd0] bg-white shadow-sm">
              <div className="min-w-0 p-3">
                <ReservationControlWorkspace
                  restaurantId={restaurantId}
                  search={panelSearch}
                  onSearchChange={setPanelSearch}
                  currencyCode={membership.restaurant.currencyCode}
                  canManage={canManageActions}
                  onOpenReservation={openReservation}
                  onOpenCalendar={() => goWorkspaceSection("calendar")}
                />
              </div>
            </section>
          ) : workspaceSection === "groups" ? (
            groupsWorkspaceEl
          ) : workspaceSection === "waitlist" ? (
            <section className="min-w-0 overflow-hidden rounded-xl border border-[#e9dfd0] bg-white shadow-sm">
              <div className="min-w-0 p-3">
                <WaitlistWorkspace
                  restaurantId={restaurantId}
                  search={panelSearch}
                  onSearchChange={setPanelSearch}
                  canWrite={membership.role === "owner" || membership.role === "manager"}
                  onOpenReservation={openReservation}
                />
              </div>
            </section>
          ) : (
            <section className="min-w-0 overflow-hidden rounded-xl border border-[#e9dfd0] bg-white shadow-sm">
              {/* Same search + filters as the Reservation Desk */}
              {deskControls}
              <div className="min-w-0 p-3">
                <BookingCalendarPanel
                  restaurantId={restaurantId}
                  canManage={canManageActions}
                  selectedId={null}
                  shared={calendarShared}
                  onSelect={(row) => {
                    setCalendarRow(row);
                    openReservation(row.reservationId);
                  }}
                  onOpen={openReservation}
                  onAction={handleReservationAction}
                />
              </div>
            </section>
          )}
        </main>
      </div>

      {actionDialog ? (
        <ReservationActionDialogHost
          restaurantId={restaurantId}
          businessDate={snapshot?.businessDate ?? ""}
          action={actionDialog}
          onOpenChange={closeActionDialog}
        />
      ) : null}

      <ReservationDeskMoreFilters
        restaurantId={restaurantId}
        open={moreFiltersOpen}
        view={view}
        applied={advanced}
        onOpenChange={setMoreFiltersOpen}
        onApply={(next) => {
          setAdvanced(next);
          resetPage();
        }}
      />

      <ExportPdfDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="Export reservations to PDF"
        description="Choose the arrival period. Reservations arriving in that period are exported. Your current view, search and filters still apply."
        onExport={(range) => {
          // Open the print window now, inside the click, then fill it once the data is ready.
          const printWindow = openPdfWindow();
          if (!printWindow) return;
          void exportReservations(range, printWindow);
        }}
      />

      <ReservationWorkspaceOverlay
        open={overlay !== null}
        title={
          overlay?.type === "new-reservation"
            ? "New Reservation"
            : overlayTitle(overlay, snapshot?.rows ?? [], calendarRow)
        }
        description={
          overlay?.type === "new-reservation"
            ? "Create a new reservation, check availability and assign a room."
            : overlayDescription(overlay, snapshot?.rows ?? [], calendarRow)
        }
        hideVisualHeader={
          overlay?.type === "reservation-detail" ||
          overlay?.type === "edit-reservation" ||
          overlay?.type === "cancel-reservation" ||
          overlay?.type === "no-show-reservation"
        }
        showCreateIcon={overlay?.type === "new-reservation"}
        onOpenChange={closeWorkspaceOverlay}
      >
        {overlay?.type === "new-reservation" ? (
          <CreateReservationPage
            membership={membership}
            embedded
            initialGuestId={overlay.initialGuestId ?? null}
            initialCompanyMasterId={overlay.initialCompanyMasterId ?? null}
            initialTravelAgentMasterId={overlay.initialTravelAgentMasterId ?? null}
            initialGroupMasterId={overlay.initialGroupMasterId ?? null}
            pmsGroupId={createGroupLink?.pmsGroupId ?? null}
            pmsGroupBlockId={createGroupLink?.pmsGroupBlockId ?? null}
            returnToLabel={returnToLabel}
            onCancel={() => closeWorkspaceOverlay(false)}
            onCreated={() => invalidateReservationReads()}
            onOpenCreatedReservation={(reservationId) => {
              setOverlay({ type: "reservation-detail", reservationId });
              invalidateReservationReads();
            }}
            onReturnToDesk={() => closeWorkspaceOverlay(false)}
          />
        ) : null}
        {overlay?.type === "reservation-detail" ? (
          <ReservationDetailWorkspace
            membership={membership}
            reservationId={overlay.reservationId}
            embedded
            onCopiedReservation={(reservationId) => {
              setOverlay({ type: "reservation-detail", reservationId });
              invalidateReservationReads();
            }}
            onBackToList={() => closeWorkspaceOverlay(false)}
            onEditReservation={() =>
              setOverlay({ type: "edit-reservation", reservationId: overlay.reservationId })
            }
          />
        ) : null}
        {overlay?.type === "edit-reservation" ? (
          <ReservationEditWorkspace
            membership={membership}
            reservationId={overlay.reservationId}
            onBackToDesk={() => closeWorkspaceOverlay(false)}
            onOpenReservation={(id) => {
              setOverlay({ type: "reservation-detail", reservationId: id });
              invalidateReservationReads();
            }}
          />
        ) : null}
        {overlay?.type === "cancel-reservation" ? (
          <ReservationCancelWorkspace
            membership={membership}
            reservationId={overlay.reservationId}
            onBackToDesk={() => closeWorkspaceOverlay(false)}
            onOpenReservation={(id) => {
              setOverlay({ type: "reservation-detail", reservationId: id });
              invalidateReservationReads();
            }}
          />
        ) : null}
        {overlay?.type === "no-show-reservation" ? (
          <ReservationNoShowWorkspace
            membership={membership}
            reservationId={overlay.reservationId}
            onBackToDesk={() => closeWorkspaceOverlay(false)}
            onOpenReservation={(id) => {
              setOverlay({ type: "reservation-detail", reservationId: id });
              invalidateReservationReads();
            }}
          />
        ) : null}
      </ReservationWorkspaceOverlay>
    </RoomInventoryChrome>
  );
}

/**
 * Filter menu with an icon-only button (a small badge shows how many filters
 * are active). Same props as the old More filters menu: the groups are passed
 * as children and applied together with "Apply filters".
 */
function DeskFilterMenu({
  open,
  onOpenChange,
  activeCount,
  title,
  onApply,
  onClear,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  title: string;
  onApply: () => void;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Filters"
          title="Filters"
          className="relative size-9 rounded-full border-[#e9dfd0] bg-white text-[#4a2c1a] shadow-none hover:bg-[#f5ead0]"
          data-testid="reservation-desk-filter-button"
        >
          <Filter className="size-4 text-[#c9a24a]" />
          {activeCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#c9a24a] px-1 text-[10px] font-extrabold text-[#2b1a10]">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[70vh] w-80 overflow-y-auto rounded-2xl border-[#e9dfd0] bg-white p-0 shadow-[0_8px_24px_rgba(74,44,26,0.15)]"
      >
        <div className="border-b border-border px-4 py-3 text-sm font-bold text-[#4a2c1a]">
          {title}
        </div>
        {children}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-white px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
            onClick={onApply}
          >
            Apply filters
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Day navigator: Today, previous / next arrows and a period length
 * (Day, 7, 14 or 30 days). The arrows move by the chosen period, and the
 * result filters the arrival dates, the same filter as in More filters.
 * `children` (Display, Exceptions, Availability) sit on the right of the same row.
 */
function DeskPeriodNav({
  from,
  to,
  today,
  periodDays,
  onToday,
  onPrev,
  onNext,
  onPeriodChange,
  heading,
  children,
}: {
  from: string;
  to: string;
  today: string;
  periodDays: number;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPeriodChange: (days: number) => void;
  /** Date heading shown first in the row (calendar layout). */
  heading?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const unit = periodDays === 1 ? "day" : `${periodDays} days`;
  const isSingleDay = !from || !to || from === to;
  const label =
    (!from && !to) || (isSingleDay && (from || to) === today)
      ? "Today"
      : from && to && from !== to
        ? `${formatDeskDate(from)} – ${formatDate(to)}`
        : formatDate(from || to);

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e9dfd0] pt-3"
      data-testid="reservation-desk-period-nav"
    >
      {heading}

      {/* Previous  |  Today (middle)  |  Next */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Previous ${unit}`}
          title={`Previous ${unit}`}
          onClick={onPrev}
          className="grid size-8 place-items-center rounded-full text-[#4a2c1a] transition-colors hover:bg-[#f5ead0]"
          data-testid="reservation-desk-period-prev"
        >
          <ChevronLeft className="size-4" />
        </button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-8 rounded-full border-[#e9dfd0] bg-white px-5 text-xs font-bold text-[#4a2c1a] shadow-none hover:bg-[#f5ead0]",
            label === "Today" && "border-[#c9a24a] bg-[#f5ead0]",
          )}
          onClick={onToday}
          data-testid="reservation-desk-period-today"
        >
          Today
        </Button>
        <button
          type="button"
          aria-label={`Next ${unit}`}
          title={`Next ${unit}`}
          onClick={onNext}
          className="grid size-8 place-items-center rounded-full text-[#4a2c1a] transition-colors hover:bg-[#f5ead0]"
          data-testid="reservation-desk-period-next"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* The selected dates are shown only when they are not today. */}
      {label !== "Today" ? (
        <span className="text-xs font-bold text-[#4a2c1a]">{label}</span>
      ) : null}

      <div
        className="flex items-center gap-0.5 rounded-full bg-[#f1ede6] p-0.5"
        role="group"
        aria-label="Period length"
      >
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.days}
            type="button"
            aria-pressed={periodDays === option.days}
            onClick={() => onPeriodChange(option.days)}
            className={cn(
              "h-7 rounded-full px-3 text-xs font-bold text-[#7A6B58] transition-colors hover:text-[#4a2c1a]",
              periodDays === option.days && "bg-white text-[#4a2c1a] shadow-sm",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {children ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

/**
 * Sidebar for the operational views, Waitlist and Exceptions.
 * - Collapsed: only a menu icon is visible.
 * - Hover on the icon: the panel slides out and shows every option.
 * - Click on the icon: the panel is pinned open until you pick an option,
 *   click outside, press Escape, or click the icon again.
 * - Picking an option closes the panel and returns to the menu icon.
 */
function ViewsSidebar({
  view,
  panel,
  snapshot,
  onSelect,
  onSelectPanel,
}: {
  view: OperationalReservationView;
  panel: DeskPanel;
  snapshot: ReservationDeskSnapshot | undefined;
  onSelect: (id: OperationalReservationView) => void;
  onSelectPanel: (next: DeskPanel) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const expanded = hovered || pinned;

  useEffect(() => {
    if (!pinned) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setPinned(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPinned(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pinned]);

  function handleSelect(id: OperationalReservationView) {
    onSelect(id);
    setPinned(false);
    setHovered(false);
  }

  function handlePanelSelect(next: DeskPanel) {
    onSelectPanel(next);
    setPinned(false);
    setHovered(false);
  }

  return (
    <div
      ref={wrapperRef}
      className="relative z-20 w-14 shrink-0 border-r border-border bg-[#fbfbfb]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid="reservation-desk-views-sidebar"
    >
      {/* Menu icon (always visible) */}
      <div className="flex justify-center py-3">
        <button
          type="button"
          aria-label="Operational reservation views"
          aria-expanded={expanded}
          aria-haspopup="menu"
          onClick={() => setPinned((current) => !current)}
          className={cn(
            "grid size-9 place-items-center rounded-full text-[#4a2c1a] transition-colors hover:bg-[#f5ead0]",
            expanded && "bg-[#f5ead0]",
          )}
          data-testid="reservation-desk-views-menu"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {/* Slide-out panel: overlays the content, so the layout never shifts */}
      {expanded ? (
        <nav
          role="menu"
          aria-label="Reservation views"
          className="absolute left-0 top-0 h-full w-64 overflow-y-auto border-r border-[#e9dfd0] bg-white p-2 shadow-[8px_0_24px_rgba(74,44,26,0.12)]"
        >
          <div className="mb-2 flex items-center gap-3 px-1 py-1">
            <button
              type="button"
              aria-label="Close views menu"
              onClick={() => {
                setPinned(false);
                setHovered(false);
              }}
              className="grid size-9 place-items-center rounded-full bg-[#f5ead0] text-[#4a2c1a]"
            >
              <Menu className="size-5" />
            </button>
            <span className="text-sm font-bold text-[#4a2c1a]">Reservation views</span>
          </div>

          {VIEWS.map((item) => {
            const Icon = item.icon;
            const active = panel === "reservations" && view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#4a2c1a] transition-colors hover:bg-[#f5ead0]",
                  active && "bg-[#f5ead0]",
                )}
              >
                <Icon className="size-4 shrink-0 text-[#c9a24a]" />
                <span className="flex-1">
                  {item.label}
                  {item.note ? (
                    <span className="block text-[11px] font-normal text-[#7A6B58]">
                      {item.note}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs tabular-nums text-[#7A6B58]">
                  {viewCount(item.id, snapshot)}
                </span>
                {active ? <Check className="size-3.5 text-[#8C6D23]" /> : null}
              </button>
            );
          })}

          <div className="my-2 border-t border-[#e9dfd0]" />

          {PANEL_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = panel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => handlePanelSelect(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#4a2c1a] transition-colors hover:bg-[#f5ead0]",
                  active && "bg-[#f5ead0]",
                )}
                data-testid={`reservation-desk-panel-${item.id}`}
              >
                <Icon className="size-4 shrink-0 text-[#c9a24a]" />
                <span className="flex-1">{item.label}</span>
                {active ? <Check className="size-3.5 text-[#8C6D23]" /> : null}
              </button>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

/** Slim bar above the listing: current view, table/calendar toggle, refresh. */
function ViewsToolbar({
  view,
  snapshot,
  layout,
  onLayoutChange,
  onRefresh,
  refreshing,
}: {
  view: OperationalReservationView;
  snapshot: ReservationDeskSnapshot | undefined;
  layout: DeskLayout;
  onLayoutChange: (next: DeskLayout) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const current = VIEWS.find((item) => item.id === view) ?? VIEWS[0]!;
  const CurrentIcon = current.icon;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      {/* Every view, including All Reservations, shows its name and count. */}
      <div className="flex items-center gap-2 text-sm font-bold text-[#4a2c1a]">
        <CurrentIcon className="size-4 text-[#c9a24a]" />
        {current.label}
        <span className="rounded-full bg-[#f5ead0] px-2 text-[11px] font-extrabold tabular-nums">
          {viewCount(current.id, snapshot)}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Table / Calendar toggle */}
        <div
          className="flex items-center gap-0.5 rounded-full bg-[#f1ede6] p-0.5"
          role="group"
          aria-label="Reservation layout"
        >
          <button
            type="button"
            aria-label="Show as table"
            aria-pressed={layout === "table"}
            title="Table"
            onClick={() => onLayoutChange("table")}
            className={cn(
              "grid size-8 place-items-center rounded-full text-[#7A6B58] transition-colors hover:text-[#4a2c1a]",
              layout === "table" && "bg-white text-[#4a2c1a] shadow-sm",
            )}
            data-testid="reservation-desk-layout-table"
          >
            <Table2 className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Show as calendar"
            aria-pressed={layout === "calendar"}
            title="Calendar"
            onClick={() => onLayoutChange("calendar")}
            className={cn(
              "grid size-8 place-items-center rounded-full text-[#7A6B58] transition-colors hover:text-[#4a2c1a]",
              layout === "calendar" && "bg-white text-[#4a2c1a] shadow-sm",
            )}
            data-testid="reservation-desk-layout-calendar"
          >
            <CalendarDays className="size-4" />
          </button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh reservations"
          onClick={onRefresh}
          disabled={refreshing || layout === "calendar"}
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}

/** Title bar shown above Waitlist, Exceptions and Groups & Blocks. */
function PanelTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-bold text-[#4a2c1a]">
      {icon}
      {label}
    </div>
  );
}

/** Summary shown on the right side of the table when a guest name or reservation number is clicked. */
function ReservationSummaryPanel({
  reservation,
  coverUrl,
  loading,
  error,
  money,
  nights,
  onClose,
  onOpenFull,
}: {
  reservation: ReservationDetail | undefined;
  coverUrl: string | null;
  loading: boolean;
  error: string | null;
  money: (value: number) => string;
  nights: number;
  onClose: () => void;
  onOpenFull: () => void;
}) {
  return (
    <aside
      className="relative w-80 shrink-0 border-l border-[#e9dfd0] bg-[#fbfbfb] max-xl:w-72"
      aria-label="Reservation summary"
      data-testid="reservation-desk-summary-panel"
    >
      <div className="absolute inset-0 flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-bold text-[#4a2c1a]">Summary</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Close summary"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-2" aria-label="Loading summary">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : reservation ? (
            <>
              <ReservationDetailSummary
                reservation={reservation}
                money={money}
                coverUrl={coverUrl}
                nights={nights}
                testId="reservation-desk-summary"
              />
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full border-[#e9dfd0] text-[#4a2c1a] hover:bg-[#f5ead0]"
                onClick={onOpenFull}
              >
                Open full reservation
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function ReservationTable({
  rows,
  businessDate,
  canManage,
  selectedId,
  columns,
  onSummary,
  onOpen,
  onAction,
}: {
  rows: ReservationDeskRow[];
  businessDate: string;
  canManage: boolean;
  selectedId: string | null;
  /** Optional columns, chosen from the Display menu. */
  columns: TableColumns;
  onSummary: (id: string) => void;
  onOpen: (id: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
}) {
  // Every column has a fixed width in rem, and the table is as wide as the
  // columns that are switched on. When it is wider than the screen, it scrolls
  // sideways instead of squeezing the columns together.
  const COLUMN_REM = {
    reservation: 7.5,
    guest: 11,
    roomType: 10,
    arrival: 6.5,
    departure: 6.5,
    nights: 5,
    adults: 5.5,
    children: 6.5,
    status: 8,
    source: 7.5,
    ratePlan: 9.5,
    total: 9,
    actions: 5,
  } as const;

  const tableMinRem =
    COLUMN_REM.reservation +
    COLUMN_REM.guest +
    COLUMN_REM.roomType +
    COLUMN_REM.arrival +
    COLUMN_REM.departure +
    COLUMN_REM.status +
    COLUMN_REM.actions +
    (columns.nights ? COLUMN_REM.nights : 0) +
    (columns.adults ? COLUMN_REM.adults : 0) +
    (columns.children ? COLUMN_REM.children : 0) +
    (columns.source ? COLUMN_REM.source : 0) +
    (columns.ratePlan ? COLUMN_REM.ratePlan : 0) +
    (columns.total ? COLUMN_REM.total : 0);

  const remWidth = (value: number) => ({ width: `${value}rem` });

  return (
    <div className="min-w-0 overflow-x-auto">
      <table
        className="w-full table-fixed text-sm"
        style={{ minWidth: `${tableMinRem}rem` }}
      >
        <thead className="bg-[#fbfbfb] text-left text-[10px] font-semibold uppercase tracking-[0.11em] text-[#4a2c1a]">
          <tr>
            <th className="whitespace-nowrap px-2 py-2.5" style={remWidth(COLUMN_REM.reservation)}>
              Res. No.
            </th>
            <th className="whitespace-nowrap px-2 py-2.5" style={remWidth(COLUMN_REM.guest)}>
              Guest Name
            </th>
            <th className="whitespace-nowrap px-2 py-2.5" style={remWidth(COLUMN_REM.roomType)}>
              Room Type
            </th>
            <th className="whitespace-nowrap px-2 py-2.5" style={remWidth(COLUMN_REM.arrival)}>
              Arrival
            </th>
            <th className="whitespace-nowrap px-2 py-2.5" style={remWidth(COLUMN_REM.departure)}>
              Departure
            </th>
            {columns.nights ? (
              <th
                className="whitespace-nowrap px-2 py-2.5 text-center"
                style={remWidth(COLUMN_REM.nights)}
              >
                Nights
              </th>
            ) : null}
            {columns.adults ? (
              <th
                className="whitespace-nowrap px-2 py-2.5 text-center"
                style={remWidth(COLUMN_REM.adults)}
              >
                Adults
              </th>
            ) : null}
            {columns.children ? (
              <th
                className="whitespace-nowrap px-2 py-2.5 text-center"
                style={remWidth(COLUMN_REM.children)}
              >
                Children
              </th>
            ) : null}
            <th className="whitespace-nowrap px-2 py-2.5" style={remWidth(COLUMN_REM.status)}>
              Status
            </th>
            {columns.source ? (
              <th className="whitespace-nowrap px-2 py-2.5" style={remWidth(COLUMN_REM.source)}>
                Source
              </th>
            ) : null}
            {columns.ratePlan ? (
              <th className="whitespace-nowrap px-2 py-2.5" style={remWidth(COLUMN_REM.ratePlan)}>
                Rate Plan
              </th>
            ) : null}
            {columns.total ? (
              <th
                className="whitespace-nowrap px-2 py-2.5 text-right"
                style={remWidth(COLUMN_REM.total)}
              >
                Total Amount
              </th>
            ) : null}
            <th
              className="whitespace-nowrap py-2.5 pl-2 pr-4 text-right"
              style={remWidth(COLUMN_REM.actions)}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const source = sourceLabel(row.source);
            const room = row.roomNumber ?? "Unassigned";
            return (
              <tr
                key={row.reservationId}
                onClick={() => onOpen(row.reservationId)}
                className={cn(
                  "cursor-pointer border-t border-border transition-colors hover:bg-[#faf7f1]",
                  selectedId === row.reservationId && "bg-[#f5ead0]/60",
                )}
              >
                <td className="px-2 py-2.5">
                  <button
                    type="button"
                    title={`Show summary for ${row.confirmationNumber}`}
                    className="block max-w-full truncate text-left font-semibold text-[#8C6D23] underline-offset-2 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSummary(row.reservationId);
                    }}
                  >
                    {row.confirmationNumber}
                  </button>
                </td>
                <td className="px-2 py-2.5 font-medium">
                  <button
                    type="button"
                    title={`Show summary for ${row.guestName}`}
                    className="block max-w-full truncate text-left underline-offset-2 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSummary(row.reservationId);
                    }}
                  >
                    {row.guestName}
                  </button>
                </td>
                <td className="px-2 py-2.5 text-[#7A6B58]">
                  <span className="block truncate" title={row.roomTypeName}>
                    {row.roomTypeName}
                  </span>
                  <span className="block truncate text-[10px]" title={room}>
                    {room}
                  </span>
                </td>
                <td
                  className="whitespace-nowrap px-2 py-2.5 text-[#7A6B58]"
                  title={formatDate(row.arrivalDate)}
                >
                  {formatDeskDate(row.arrivalDate)}
                </td>
                <td
                  className="whitespace-nowrap px-2 py-2.5 text-[#7A6B58]"
                  title={formatDate(row.departureDate)}
                >
                  {formatDeskDate(row.departureDate)}
                </td>
                {columns.nights ? (
                  <td className="whitespace-nowrap px-2 py-2.5 text-center tabular-nums">
                    {row.nights}
                  </td>
                ) : null}
                {columns.adults ? (
                  <td className="whitespace-nowrap px-2 py-2.5 text-center tabular-nums">
                    {row.adults}
                  </td>
                ) : null}
                {columns.children ? (
                  <td className="whitespace-nowrap px-2 py-2.5 text-center tabular-nums">
                    {row.children}
                  </td>
                ) : null}
                <td className="whitespace-nowrap px-2 py-2.5">
                  <ReservationStatusBadge status={row.status} />
                </td>
                {columns.source ? (
                  <td className="px-2 py-2.5 text-[#7A6B58]">
                    <span className="block truncate" title={source}>
                      {source}
                    </span>
                  </td>
                ) : null}
                {columns.ratePlan ? (
                  <td className="px-2 py-2.5 text-[#7A6B58]">
                    <span className="block truncate" title={row.ratePlanName ?? undefined}>
                      {row.ratePlanName ?? "—"}
                    </span>
                  </td>
                ) : null}
                {columns.total ? (
                  <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                    {formatMoney(row.roomSubtotal, row.currency)}
                  </td>
                ) : null}
                <td
                  className="py-2.5 pl-2 pr-4 text-right"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ReservationContextMenu
                    context={{
                      status: row.status,
                      roomId: row.roomId,
                      arrivalDate: row.arrivalDate,
                      businessDate,
                      hints: row.hints,
                      canManage,
                    }}
                    onAction={(actionId) => onAction(actionId, row)}
                    triggerLabel={`Actions for reservation ${row.confirmationNumber}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReservationActionDialogHost({
  restaurantId,
  businessDate,
  action,
  onOpenChange,
}: {
  restaurantId: string;
  businessDate: string;
  action: { kind: ReservationActionDialog; row: ReservationDeskRow };
  onOpenChange: (open: boolean) => void;
}) {
  const stay = deskRowToFrontOfficeStay(action.row, businessDate);
  switch (action.kind) {
    case "assign_room":
      return (
        <AssignRoomDialog
          restaurantId={restaurantId}
          stay={stay}
          open
          onOpenChange={onOpenChange}
        />
      );
    case "change_room":
      return (
        <RoomMoveDialog restaurantId={restaurantId} stay={stay} open onOpenChange={onOpenChange} />
      );
    case "check_in":
      return (
        <CheckInDialog restaurantId={restaurantId} stay={stay} open onOpenChange={onOpenChange} />
      );
    case "check_out":
      return (
        <CheckOutDialog restaurantId={restaurantId} stay={stay} open onOpenChange={onOpenChange} />
      );
  }
}

function overlayDetailRow(
  overlay: ReservationWorkspaceOverlayState,
  rows: ReservationDeskRow[],
  selectedRow: ReservationDeskRow | null,
): ReservationDeskRow | null {
  if (
    overlay?.type !== "reservation-detail" &&
    overlay?.type !== "edit-reservation" &&
    overlay?.type !== "cancel-reservation" &&
    overlay?.type !== "no-show-reservation"
  ) {
    return null;
  }
  return (
    rows.find((row) => row.reservationId === overlay.reservationId) ??
    (selectedRow?.reservationId === overlay.reservationId ? selectedRow : null)
  );
}

function overlayTitle(
  overlay: ReservationWorkspaceOverlayState,
  rows: ReservationDeskRow[],
  selectedRow: ReservationDeskRow | null,
): string {
  const row = overlayDetailRow(overlay, rows, selectedRow);
  if (row) return row.confirmationNumber;
  return overlay?.type === "new-reservation" ? "New Reservation" : "Reservation";
}

function overlayDescription(
  overlay: ReservationWorkspaceOverlayState,
  rows: ReservationDeskRow[],
  selectedRow: ReservationDeskRow | null,
): string {
  const row = overlayDetailRow(overlay, rows, selectedRow);
  if (row) return `${row.guestName} · ${row.status.replaceAll("_", " ")}`;
  return overlay?.type === "new-reservation"
    ? "Create and manage a new reservation"
    : "Review stay, guest, room and commercial information.";
}

function deskRowToFrontOfficeStay(row: ReservationDeskRow, businessDate: string): FrontOfficeStay {
  return {
    id: row.reservationId,
    confirmationNumber: row.confirmationNumber,
    guestId: row.guestId,
    guestName: row.guestName,
    guestVip: row.guestVip,
    guestPhone: row.guestPhone,
    guestEmail: row.guestEmail,
    roomTypeId: row.roomTypeId,
    roomTypeName: row.roomTypeName,
    roomId: row.roomId,
    roomNumber: row.roomNumber,
    arrivalDate: row.arrivalDate,
    departureDate: row.departureDate,
    nights: row.nights,
    adults: row.adults,
    children: row.children,
    status: row.status,
    specialRequests: row.specialRequests,
    source: row.source,
    overstay: row.status === "checked_in" && row.departureDate < businessDate,
  };
}

function DeskTableSkeleton() {
  return (
    <div className="space-y-2 p-4" aria-label="Loading reservations">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function viewCount(
  view: OperationalReservationView,
  snapshot: ReservationDeskSnapshot | undefined,
): number | string {
  if (!snapshot) return "—";
  switch (view) {
    case "all":
      return snapshot.query.total;
    case "arrivals":
      return snapshot.kpis.arrivalsToday;
    case "departures":
      return snapshot.kpis.departuresToday;
    case "in_house":
      return snapshot.kpis.inHouse;
    case "unassigned":
      return snapshot.kpis.unassigned;
    case "pending":
      return snapshot.kpis.pending;
    case "groups":
      return snapshot.kpis.linkedGroupReservations;
  }
}