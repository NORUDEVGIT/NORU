import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  House,
  Download,
  List,
  LogIn,
  LogOut,
  Menu,
  RefreshCw,
  Search,
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
import type {
  ReservationActionCapabilities,
  ReservationContextActionId,
} from "@/packages/pms/components/reservations/reservation-context-actions";
import { frontOfficeDeskAccess } from "@/packages/pms/lib/front-office-desk-access";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
import { ReservationContextMenu } from "@/packages/pms/components/reservations/reservation-context-menu";
import { ReservationFilterMenu } from "@/packages/pms/components/reservations/reservation-filter-menu";
import {
  DaysRangeSelect,
  WeekRangeControl,
  mondayOf,
  readSharedWeekStart,
  writeSharedWeekStart,
} from "@/packages/pms/components/pms-week-controls";
import {
  ExportPdfDialog,
  type ExportRange,
} from "@/packages/pms/components/guests/guest-export-pdf";
import {
  exportReservationsToPdf,
  openPdfWindow,
} from "@/packages/pms/components/reservations/reservation-export-pdf";
import { BookingCalendarPanel } from "@/packages/pms/components/reservations/booking-calendar";
import {
  DEFAULT_CALENDAR_VIEW,
  type CalendarViewState,
} from "@/packages/pms/components/reservations/reservation-desk-toolbar-menu";
import {
  ReservationShellProvider,
  SHELL_ICON_BUTTON,
  SHELL_PRIMARY_BUTTON,
} from "@/packages/pms/components/reservations/reservation-shell-slots";
import { addDays } from "@/packages/pms/lib/reservation-dates";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import {
  CALENDAR_HORIZONS,
  type CalendarHorizon,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { GroupsWorkspace } from "@/packages/pms/components/reservations/groups-workspace";
import { WaitlistWorkspace } from "@/packages/pms/components/reservations/waitlist-workspace";
import { ArrivalsDeparturesWorkspace } from "@/packages/pms/components/workspaces/arrivals-departures-workspace";
import { ReservationControlWorkspace } from "@/packages/pms/components/workspaces/reservation-control-workspace";
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
// Wave 4 guest account integration: account master queries read reservations linked to account masters (not Sales & Events group blocks).
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
import { setReservationStatus, copyReservation } from "@/packages/pms/lib/reservations.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

const PAGE_SIZE = 25;
/**
 * Export to PDF reads the desk page by page. Stop after this many pages
 * (40 x 25 = 1,000 reservations) so one export cannot run forever.
 */
const EXPORT_MAX_PAGES = 40;
const ALL = DESK_FILTER_ALL;

type SourceFilter = DeskSourceFilter;
type StatusFilter = DeskStatusFilter;

type ReservationActionDialog = "assign_room" | "change_room" | "check_in" | "check_out";

/** Reads refreshed by the shared toolbar Refresh button; the KPI row is always included. */
const SECTION_REFRESH_KEYS: Record<CalendarWorkspaceSection, string[]> = {
  desk: ["reservation-desk"],
  calendar: [
    "reservation-desk",
    "reservation-calendar",
    "reservation-calendar-search",
    "reservation-calendar-exceptions",
    "reservation-desk-availability",
  ],
  groups: ["reservation-desk", "pms-groups", "pms-group"],
  waitlist: ["reservation-desk", "pms-waitlist", "pms-waitlist-detail"],
  "arrivals-departures": ["reservation-desk", "pms-arrivals-departures"],
  exceptions: ["reservation-desk", "pms-reservation-exceptions"],
};

const SECTION_SEARCH_PLACEHOLDER: Record<CalendarWorkspaceSection, string> = {
  desk: "Search confirmation, guest, phone, email or room…",
  calendar: "Search confirmation, guest, phone, email or room…",
  groups: "Search group name, confirmation, code or reference…",
  waitlist: "Search waitlist by guest, number or notes…",
  "arrivals-departures": "Search guest, confirmation or room…",
  exceptions: "Search exceptions by guest, reservation or room…",
};

const RESERVATION_SECTIONS = [
  "Reservation Desk",
  "Booking Calendar",
  "Groups & Blocks",
  "Waitlist",
  "Arrivals & Departures",
  "Exceptions",
] as const;

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
  { id: "groups", label: "Groups", note: "Linked masters", icon: Users },
];

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

function sourceLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SectionTab({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative flex h-10 items-center px-2.5 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
        disabled ? "cursor-not-allowed opacity-45" : "hover:text-foreground",
      )}
    >
      {children}
      {active ? (
        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
      ) : null}
    </button>
  );
}

function KpiCard({
  label,
  value,
  loading,
  icon,
  tone,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 shadow-sm">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", tone)}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium text-[#756A5B]">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-10" />
        ) : (
          <p className="font-display text-lg font-semibold leading-tight tracking-tight text-[#251605]">
            {value}
          </p>
        )}
      </div>
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
    to: pathname as never,
    search: Object.keys(search).length > 0 ? (search as never) : undefined,
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
  const propertyBusinessDate = usePropertyBusinessDate(
    restaurantId,
    membership.restaurant.timezone,
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadDesk = useServerFn(getReservationDesk);
  const loadRoomTypes = useServerFn(listRoomTypes);
  const submitStatus = useServerFn(setReservationStatus);
  const submitCopy = useServerFn(copyReservation);
  const access = usePmsPermissions(restaurantId);
  const reservationCapabilities: ReservationActionCapabilities = {
    edit: access.can(PMS_PERMISSIONS.RESERVATION_EDIT),
    create: access.can(PMS_PERMISSIONS.RESERVATION_CREATE),
    cancel: access.can(PMS_PERMISSIONS.RESERVATION_CANCEL),
    assign: access.can(PMS_PERMISSIONS.RESERVATION_ASSIGNMENT_EDIT),
    stayEdit: access.can(PMS_PERMISSIONS.FRONT_OFFICE_STAY_EDIT),
    checkIn: access.can(PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN),
    checkOut: access.can(PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT),
    noShow: access.can(PMS_PERMISSIONS.FRONT_OFFICE_NO_SHOW),
    folio: access.can(PMS_PERMISSIONS.CASHIERING_VIEW),
  };
  const canManageActions = access.canAny([
    PMS_PERMISSIONS.RESERVATION_CREATE,
    PMS_PERMISSIONS.RESERVATION_EDIT,
    PMS_PERMISSIONS.RESERVATION_CANCEL,
    PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN,
    PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT,
  ]);
  const foDeskAccess = frontOfficeDeskAccess({
    isOwner: access.isOwner,
    codes: access.permissions,
  });

  const [view, setView] = useState<OperationalReservationView>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [roomTypeId, setRoomTypeId] = useState(ALL);
  const [roomTypeName, setRoomTypeName] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [advanced, setAdvanced] = useState<DeskAdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [filterSlot, setFilterSlot] = useState<HTMLElement | null>(null);
  const [primarySlot, setPrimarySlot] = useState<HTMLElement | null>(null);
  const shellSlots = useMemo(
    () => ({ filter: filterSlot, primary: primarySlot }),
    [filterSlot, primarySlot],
  );
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [calendarWeekStart, setCalendarWeekStart] = useState<string | null>(() =>
    readSharedWeekStart(restaurantId),
  );
  const [calendarHorizon, setCalendarHorizon] = useState<CalendarHorizon>(7);
  const [calendarView, setCalendarView] = useState<CalendarViewState>(DEFAULT_CALENDAR_VIEW);
  const [actionDialog, setActionDialog] = useState<{
    kind: ReservationActionDialog;
    row: ReservationDeskRow;
  } | null>(null);
  const [overlay, setOverlay] = useState<ReservationWorkspaceOverlayState>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
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
  const tableWeekStart = calendarWeekStart ?? mondayOf(propertyBusinessDate);
  const tableStayEnd = addDays(tableWeekStart, calendarHorizon - 1);

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
      tableWeekStart,
      tableStayEnd,
    ],
    queryFn: () =>
      loadDesk({
        data: {
          restaurantId,
          view,
          page,
          pageSize: PAGE_SIZE,
          ...deskQuerySlice,
          stayOverlapStart: tableWeekStart,
          stayOverlapEnd: tableStayEnd,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const selectedRow = useMemo(() => {
    const fromDesk = deskQuery.data?.rows.find((row) => row.reservationId === selectedId) ?? null;
    if (
      selectedRoomId &&
      calendarRow?.reservationId === selectedId &&
      (calendarRow.reservationRoomId ?? null) === selectedRoomId
    ) {
      return calendarRow;
    }
    if (fromDesk && !selectedRoomId) return fromDesk;
    if (calendarRow?.reservationId === selectedId) return calendarRow;
    return fromDesk;
  }, [deskQuery.data?.rows, selectedId, selectedRoomId, calendarRow]);

  function invalidateReservationReads() {
    void queryClient.invalidateQueries({ queryKey: ["reservation-desk", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-quick-view", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-calendar", restaurantId] });
    void queryClient.invalidateQueries({
      queryKey: ["reservation-calendar-exceptions", restaurantId],
    });
    void queryClient.invalidateQueries({ queryKey: ["pms-groups", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-group", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-group-operational", restaurantId] });
    void queryClient.invalidateQueries({
      queryKey: ["pms-groups-create-availability", restaurantId],
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
      setSelectedId(result.id);
      setSelectedRoomId(null);
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

  useEffect(() => {
    if (!selectedId) return;
    if (deskQuery.data?.rows.some((row) => row.reservationId === selectedId)) return;
    if (calendarRow?.reservationId === selectedId) return;
    setSelectedId(null);
    setSelectedRoomId(null);
  }, [deskQuery.data?.rows, selectedId, calendarRow]);

  function resetPage() {
    setPage(1);
  }

  function selectView(next: OperationalReservationView) {
    setView(next);
    setPage(1);
    setSelectedId(null);
    setSelectedRoomId(null);
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    resetFilterFields();
  }

  function resetFilterFields() {
    setDateFrom("");
    setDateTo("");
    setStatus("all");
    setRoomTypeId(ALL);
    setRoomTypeName("");
    setSource("all");
    setAdvanced(EMPTY_ADVANCED_FILTERS);
    setPage(1);
  }

  function openReservation(id: string) {
    setSelectedId(id);
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
    setWorkspaceSearch("");
    setSelectedId(null);
    setSelectedRoomId(null);
    void navigate({
      to: "/restaurant/pms/reservations",
      search: { tab: tabFromWorkspaceSection(section) },
    });
  }

  const editCloseGuardRef = useRef<(() => boolean) | null>(null);

  /**
   * Reads every reservation arriving in the chosen period (not just the page on
   * screen). The current view, search and filters still apply. The print window
   * is opened by the caller, inside the click, so the browser does not block it.
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
      const weekScope =
        range.preset === "all"
          ? { stayOverlapStart: tableWeekStart, stayOverlapEnd: tableStayEnd }
          : {};
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
            ...weekScope,
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
      exportReservationsToPdf({
        printWindow,
        title: "Reservations",
        restaurantName: membership.restaurant.name,
        scope: VIEWS.find((item) => item.id === view)?.label ?? "All Reservations",
        rangeLabel: range.label,
        rows: collected.map((row) => ({
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
  const kpis = snapshot?.kpis;
  const total = snapshot?.query.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isInitialLoading = deskQuery.isLoading && !snapshot;

  const isDeskOrCalendar = workspaceSection === "desk" || workspaceSection === "calendar";
  const toolbarSearch = isDeskOrCalendar ? search : workspaceSearch;
  const refreshKeys = SECTION_REFRESH_KEYS[workspaceSection];
  const sectionFetching =
    useIsFetching({
      predicate: (query) =>
        query.queryKey[1] === restaurantId &&
        refreshKeys.includes(String(query.queryKey[0])),
    }) > 0;

  function refreshSection() {
    for (const key of refreshKeys) {
      void queryClient.invalidateQueries({ queryKey: [key, restaurantId] });
    }
  }

  function setToolbarSearch(value: string) {
    if (isDeskOrCalendar) setSearch(value);
    else setWorkspaceSearch(value);
  }

  useEffect(() => {
    if (calendarWeekStart || !snapshot?.businessDate) return;
    const monday = mondayOf(snapshot.businessDate);
    setCalendarWeekStart(monday);
    writeSharedWeekStart(restaurantId, monday);
  }, [calendarWeekStart, snapshot?.businessDate, restaurantId]);

  function shiftReservationWeek(direction: -1 | 1) {
    const base = calendarWeekStart ?? (snapshot?.businessDate ? mondayOf(snapshot.businessDate) : null);
    if (!base) return;
    const next = addDays(base, direction * 7);
    setCalendarWeekStart(next);
    writeSharedWeekStart(restaurantId, next);
    setPage(1);
  }

  function pickReservationWeek(date: string) {
    const monday = mondayOf(date);
    setCalendarWeekStart(monday);
    writeSharedWeekStart(restaurantId, monday);
    setPage(1);
  }

  const roomTypeOptions: Array<[string, string]> = useMemo(
    () => (roomTypesQuery.data ?? []).map((roomType) => [roomType.id, roomType.name] as [string, string]),
    [roomTypesQuery.data],
  );
  const activeFilterCount =
    countActiveAdvancedFilters(advanced) +
    (source !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (roomTypeId !== "all" ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Reservations"
      searchPlaceholder="Search reservation…"
      helpLabel="Reservation Desk operational workspace"
      shellTestId="reservation-desk-command-shell"
      onRoomSearch={(value) => {
        setSearch(value);
      }}
    >
      <div className="relative w-full min-w-0 bg-[#F7F4EE]" data-testid="reservation-desk">
        <ReservationsBurger
          active={workspaceSection}
          toolbarSlot={toolbarSlot}
          onSelect={goWorkspaceSection}
        />
        <ReservationShellProvider value={shellSlots}>
        <main className="min-w-0 w-full space-y-3 p-3 sm:p-4 lg:p-5">
            <section
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
              aria-label="Reservation KPIs"
              data-testid="reservation-kpis"
            >
              <KpiCard
                label="Total Reservations"
                value={total}
                loading={isInitialLoading}
                icon={<ClipboardList className="size-4" />}
                tone="bg-[#F4E9D0] text-[#8A641A]"
              />
              <KpiCard
                label="Arrivals"
                value={kpis?.arrivalsToday ?? 0}
                loading={isInitialLoading}
                icon={<LogIn className="size-4" />}
                tone="bg-blue-50 text-blue-700"
              />
              <KpiCard
                label="Departures"
                value={kpis?.departuresToday ?? 0}
                loading={isInitialLoading}
                icon={<LogOut className="size-4" />}
                tone="bg-amber-50 text-amber-800"
              />
              <KpiCard
                label="In-House"
                value={kpis?.inHouse ?? 0}
                loading={isInitialLoading}
                icon={<House className="size-4" />}
                tone="bg-emerald-50 text-emerald-700"
              />
              <KpiCard
                label="Unassigned"
                value={kpis?.unassigned ?? 0}
                loading={isInitialLoading}
                icon={<TriangleAlert className="size-4" />}
                tone="bg-orange-50 text-orange-700"
              />
              <KpiCard
                label="Available Rooms"
                value={kpis?.availableRooms ?? 0}
                loading={isInitialLoading}
                icon={<DoorOpen className="size-4" />}
                tone="bg-indigo-50 text-indigo-700"
              />
            </section>

              <section
                ref={setToolbarSlot}
                className="relative w-full min-w-0 rounded-lg border border-[#DDD4C5] bg-white px-2 py-1.5 shadow-sm"
                data-testid="reservation-toolbar"
                data-section={workspaceSection}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-10">
                  <div className="flex shrink-0 items-center gap-1.5">
                    <WeekRangeControl
                      weekStart={calendarWeekStart}
                      onShiftWeek={shiftReservationWeek}
                      onPickDate={pickReservationWeek}
                    />
                    <DaysRangeSelect
                      value={String(calendarHorizon)}
                      onChange={(value) => {
                        setCalendarHorizon(Number(value) as CalendarHorizon);
                        setPage(1);
                      }}
                      options={CALENDAR_HORIZONS.map(
                        (days) => [String(days), days === 1 ? "1 day" : `${days} days`] as const,
                      )}
                    />
                  </div>
                  <div className="flex min-w-[10rem] flex-1 basis-48">
                    <span className="relative w-full">
                      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={toolbarSearch}
                        onChange={(event) => setToolbarSearch(event.target.value)}
                        className="h-9 pl-8 pr-8 text-xs"
                        placeholder={SECTION_SEARCH_PLACEHOLDER[workspaceSection]}
                        aria-label="Search reservations"
                        data-testid="reservation-toolbar-search"
                      />
                      {toolbarSearch ? (
                        <button
                          type="button"
                          aria-label="Clear search"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          onClick={() => setToolbarSearch("")}
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </span>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    {isDeskOrCalendar ? (
                      <ReservationFilterMenu
                        restaurantId={restaurantId}
                        view={view}
                        activeCount={activeFilterCount}
                        status={status}
                        roomTypeId={roomTypeId}
                        roomTypeOptions={roomTypeOptions}
                        source={source}
                        arrivalFrom={dateFrom}
                        arrivalTo={dateTo}
                        advanced={advanced}
                        calendar={
                          workspaceSection === "calendar"
                            ? { view: calendarView, onChange: setCalendarView }
                            : undefined
                        }
                        onStatus={(value) => {
                          setStatus(value);
                          resetPage();
                        }}
                        onRoomType={(id, name) => {
                          setRoomTypeId(id);
                          setRoomTypeName(name);
                          resetPage();
                        }}
                        onSource={(value) => {
                          setSource(value);
                          resetPage();
                        }}
                        onArrival={(from, to) => {
                          setDateFrom(from);
                          setDateTo(to);
                          resetPage();
                        }}
                        onAdvanced={(next) => {
                          setAdvanced(next);
                          resetPage();
                        }}
                        onClear={resetFilterFields}
                      />
                    ) : null}
                    <span ref={setFilterSlot} className="contents" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className={SHELL_ICON_BUTTON}
                          aria-label="Refresh"
                          data-testid="reservation-toolbar-refresh"
                          onClick={refreshSection}
                          disabled={sectionFetching}
                        >
                          <RefreshCw className={cn("size-4", sectionFetching && "animate-spin")} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
                    {isDeskOrCalendar ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={SHELL_ICON_BUTTON}
                        disabled={exporting}
                        onClick={() => setExportOpen(true)}
                        aria-label="Export PDF"
                        title="Export PDF"
                        data-testid="reservation-desk-export-pdf"
                      >
                        <Download className={cn("size-4", exporting && "animate-pulse")} />
                      </Button>
                    ) : null}
                    {isDeskOrCalendar ? (
                      <ReservationViewSwitcher
                        section={workspaceSection}
                        onChange={goWorkspaceSection}
                      />
                    ) : null}
                    {isDeskOrCalendar ? (
                      <Button
                        className={SHELL_PRIMARY_BUTTON}
                        data-testid="reservation-new-reservation"
                        onClick={() => {
                          setCreateGroupLink(null);
                          setOverlay({ type: "new-reservation" });
                        }}
                      >
                        <CalendarPlus className="size-4" />
                        New Reservation
                      </Button>
                    ) : null}
                    <span ref={setPrimarySlot} className="contents" />
                  </div>
                </div>
                {workspaceSection === "desk" && arrivalError ? (
                  <p className="mt-2 text-xs text-destructive">{arrivalError}</p>
                ) : null}
                {workspaceSection === "desk" && deskFilterChips(bar, advanced).length > 0 ? (
                  <ul
                    className="mt-2 flex flex-wrap items-center gap-2"
                    data-testid="reservation-desk-filter-chips"
                  >
                    {deskFilterChips(bar, advanced).map((chip) => (
                      <li key={chip.id}>
                        <button
                          type="button"
                          aria-label={chip.removeLabel}
                          className="inline-flex items-center gap-1 rounded-full border border-[#DDD4C5] bg-[#F7F4EE] px-2.5 py-1 text-xs text-[#251605]"
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
                    <li>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={clearFilters}
                      >
                        Clear all
                      </Button>
                    </li>
                  </ul>
                ) : null}
              </section>

          {workspaceSection === "desk" ? (
            <section className="min-w-0 w-full overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
              {deskQuery.isFetching && !isInitialLoading ? (
                <p className="border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
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
              ) : snapshot?.rows.length === 0 ? (
                <div className="grid min-h-72 place-items-center px-6 text-center">
                  <div>
                    <p className="font-medium text-foreground">
                      {hasActiveDeskConstraints(search, bar, advanced)
                        ? "No reservations match these filters"
                        : "No reservations in this view"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
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
                  rows={snapshot?.rows ?? []}
                  businessDate={snapshot?.businessDate ?? ""}
                  canManage={canManageActions}
                  capabilities={reservationCapabilities}
                  onOpen={openReservation}
                  onAction={handleReservationAction}
                />
              )}

              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Page {snapshot?.query.page ?? page} of {pages} · {total} total · {PAGE_SIZE}{" "}
                  per page
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || deskQuery.isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!snapshot?.query.hasMore || deskQuery.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </section>
          ) : workspaceSection === "arrivals-departures" ? (
            <ArrivalsDeparturesWorkspace
              restaurantId={restaurantId}
              search={workspaceSearch}
              timezone={membership.restaurant.timezone}
              currencyCode={membership.restaurant.currencyCode}
              foAccess={foDeskAccess}
              onOpenReservation={openReservation}
            />
          ) : workspaceSection === "exceptions" ? (
            <ReservationControlWorkspace
              restaurantId={restaurantId}
              search={workspaceSearch}
              onSearchChange={setWorkspaceSearch}
              currencyCode={membership.restaurant.currencyCode}
              canManage={canManageActions}
              onOpenReservation={openReservation}
              onOpenCalendar={() => goWorkspaceSection("calendar")}
            />
          ) : workspaceSection === "groups" ? (
            <GroupsWorkspace
              restaurantId={restaurantId}
              search={workspaceSearch}
              canWrite={access.can(PMS_PERMISSIONS.RESERVATION_GROUP_EDIT)}
              canCreateReservation={access.can(PMS_PERMISSIONS.RESERVATION_CREATE)}
              createStayActive={overlay?.type === "new-reservation" && Boolean(createGroupLink)}
              onCreateStay={(groupId, blockId) => {
                setCreateGroupLink({ pmsGroupId: groupId, pmsGroupBlockId: blockId });
                setOverlay({ type: "new-reservation" });
              }}
              onOpenReservation={openReservation}
            />
          ) : workspaceSection === "waitlist" ? (
            <WaitlistWorkspace
              restaurantId={restaurantId}
              search={workspaceSearch}
              onSearchChange={setWorkspaceSearch}
              canWrite={access.can(PMS_PERMISSIONS.RESERVATION_WAITLIST_EDIT)}
              onOpenReservation={openReservation}
            />
          ) : (
            <div className="min-w-0 w-full">
              <BookingCalendarPanel
                restaurantId={restaurantId}
                canManage={canManageActions}
                selectedId={selectedId}
                selectedReservationRoomId={selectedRoomId}
                shared={{
                  search: debouncedSearch,
                  status,
                  roomTypeId,
                  source,
                  rangeStart: calendarWeekStart,
                  horizon: calendarHorizon,
                  view: calendarView,
                }}
                onSelect={(row) => {
                  setCalendarRow(row);
                  setSelectedId(row.reservationId);
                  setSelectedRoomId(row.reservationRoomId ?? null);
                }}
                onOpen={openReservation}
                onAction={handleReservationAction}
              />
            </div>
          )}
        </main>
        </ReservationShellProvider>
      </div>

      {actionDialog ? (
        <ReservationActionDialogHost
          restaurantId={restaurantId}
          businessDate={snapshot?.businessDate ?? ""}
          action={actionDialog}
          onOpenChange={closeActionDialog}
        />
      ) : null}

      <ExportPdfDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="Export reservations to PDF"
        description="Choose the arrival period. Reservations arriving in that period are exported. Your current view, search and filters still apply."
        onExport={(range) => {
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
            : overlayTitle(overlay, snapshot?.rows ?? [], selectedRow)
        }
        description={
          overlay?.type === "new-reservation"
            ? "Create a new reservation, check availability and assign a room."
            : overlayDescription(overlay, snapshot?.rows ?? [], selectedRow)
        }
        hideVisualHeader={
          overlay?.type === "reservation-detail" ||
          overlay?.type === "edit-reservation" ||
          overlay?.type === "cancel-reservation" ||
          overlay?.type === "no-show-reservation"
        }
        size={overlay?.type === "reservation-detail" ? "workspace" : "wide"}
        showCreateIcon={overlay?.type === "new-reservation"}
        onOpenChange={(open) => {
          if (
            !open &&
            overlay?.type === "edit-reservation" &&
            editCloseGuardRef.current &&
            !editCloseGuardRef.current()
          ) {
            return;
          }
          closeWorkspaceOverlay(open);
        }}
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
            lockOperationalGroup={Boolean(createGroupLink)}
            returnToLabel={createGroupLink ? "Return to Group" : returnToLabel}
            onCancel={() => closeWorkspaceOverlay(false)}
            onCreated={() => invalidateReservationReads()}
            onOpenCreatedReservation={(reservationId) => {
              setSelectedId(reservationId);
              setSelectedRoomId(null);
              setCalendarRow(null);
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
              setSelectedId(reservationId);
              setSelectedRoomId(null);
              setCalendarRow(null);
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
            onRegisterCloseGuard={(guard) => {
              editCloseGuardRef.current = guard;
            }}
            onOpenReservation={(id) => {
              setSelectedId(id);
              setSelectedRoomId(null);
              setCalendarRow(null);
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
              setSelectedId(id);
              setSelectedRoomId(null);
              setCalendarRow(null);
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
              setSelectedId(id);
              setSelectedRoomId(null);
              setCalendarRow(null);
              setOverlay({ type: "reservation-detail", reservationId: id });
              invalidateReservationReads();
            }}
          />
        ) : null}
      </ReservationWorkspaceOverlay>
    </RoomInventoryChrome>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
  compact = false,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<[string, string]>;
  compact?: boolean;
}) {
  const control = (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9 w-36" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([id, name]) => (
          <SelectItem key={id} value={id}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (compact) return control;
  return (
    <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      {control}
    </label>
  );
}

const RESERVATION_BURGER_ITEMS: Array<{
  id: CalendarWorkspaceSection;
  label: string;
  icon: typeof ClipboardList;
}> = [
  { id: "desk", label: "All Reservations", icon: ClipboardList },
  { id: "groups", label: "Groups & Blocks", icon: Users },
  { id: "waitlist", label: "Waitlist", icon: Clock },
  { id: "arrivals-departures", label: "Arrivals & Departures", icon: LogIn },
  { id: "exceptions", label: "Exceptions", icon: TriangleAlert },
];

function ReservationsBurger({
  active,
  toolbarSlot,
  onSelect,
}: {
  active: CalendarWorkspaceSection;
  toolbarSlot: HTMLElement | null;
  onSelect: (section: CalendarWorkspaceSection) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = (
    <div
      className={cn(
        "pointer-events-none z-30",
        toolbarSlot ? "absolute left-1 top-1/2 -translate-y-1/2" : "absolute top-3 left-3",
      )}
      data-testid="reservation-desk-topbar"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Reservations navigation"
            title="Reservations navigation"
            data-testid="reservation-nav-trigger"
            className={cn(
              "pointer-events-auto inline-flex size-8 items-center justify-center rounded-md text-[#251605]",
              "opacity-50 transition-opacity hover:bg-[#F3EEE4] hover:opacity-100",
              "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
              "data-[state=open]:bg-[#F3EEE4] data-[state=open]:opacity-100",
            )}
          >
            <Menu className="size-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="pointer-events-auto w-64 p-1.5"
          data-testid="reservation-workspace-nav"
          aria-label="Reservations"
        >
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Reservations
          </p>
          <div className="flex flex-col gap-0.5">
            {RESERVATION_BURGER_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.id === "desk"
                  ? active === "desk" || active === "calendar"
                  : active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`reservation-nav-${item.id}`}
                  onClick={() => {
                    setOpen(false);
                    onSelect(item.id);
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-[#F4E9D0] font-medium text-[#251605]"
                      : "text-foreground hover:bg-[#F7F4EE]",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-[#8A6A24]" aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
  return toolbarSlot ? createPortal(trigger, toolbarSlot) : trigger;
}

function ReservationViewSwitcher({
  section,
  onChange,
}: {
  section: CalendarWorkspaceSection;
  onChange: (next: CalendarWorkspaceSection) => void;
}) {
  const options = [
    { id: "desk" as const, label: "Table", icon: Table2 },
    { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
  ];
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-[#DDD4C5] bg-white p-0.5"
      data-testid="reservation-view-switcher"
      role="group"
      aria-label="Reservation view"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = section === option.id;
        return (
          <Tooltip key={option.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={option.label}
                aria-pressed={active}
                data-testid={`reservation-view-${option.id}`}
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

function OperationalViewsRail({
  collapsed,
  onToggle,
  view,
  snapshot,
  onSelect,
}: {
  collapsed: boolean;
  onToggle: () => void;
  view: OperationalReservationView;
  snapshot: ReservationDeskSnapshot | undefined;
  onSelect: (id: OperationalReservationView) => void;
}) {
  return (
    <aside
      className={cn(
        "relative min-w-0 overflow-visible rounded-xl border border-[#DDD4C5] bg-white shadow-sm",
        collapsed ? "w-14 p-1" : "p-2",
      )}
    >
      {collapsed ? null : (
        <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Operational views
        </p>
      )}
      <nav className="space-y-1" aria-label="Operational reservation views">
        {VIEWS.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          const count = viewCount(item.id, snapshot);
          const button = (
            <button
              type="button"
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex w-full items-center rounded-lg text-left text-sm transition-colors",
                collapsed ? "h-11 justify-center px-0 py-1" : "justify-between px-3 py-2",
                active
                  ? "bg-[#F4E9D0] font-medium text-[#251605]"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {collapsed ? (
                <span className="flex flex-col items-center gap-0.5">
                  <Icon className="size-4" />
                  <span className="text-[9px] font-semibold tabular-nums leading-none text-[#251605]">
                    {count}
                  </span>
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0" />
                    <span>
                      {item.label}
                      {item.note ? (
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          {item.note}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums">{count}</span>
                </>
              )}
            </button>
          );
          return collapsed ? (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>
                {item.label}
                {item.note ? ` · ${item.note}` : ""} · {count}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span key={item.id}>{button}</span>
          );
        })}
      </nav>
      <button
        type="button"
        aria-label={collapsed ? "Expand operational views" : "Collapse operational views"}
        onClick={onToggle}
        className="absolute -right-2.5 top-6 z-20 hidden size-5 items-center justify-center rounded-full border border-[#DDD4C5] bg-white text-[#6B6256] shadow-sm xl:inline-flex"
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
      </button>
    </aside>
  );
}

function ModeButton({
  active,
  disabled,
  icon,
  children,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
        active ? "bg-[#F4E9D0] text-[#251605]" : "text-muted-foreground",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ReservationTable({
  rows,
  businessDate,
  canManage,
  capabilities,
  onOpen,
  onAction,
}: {
  rows: ReservationDeskRow[];
  businessDate: string;
  canManage: boolean;
  capabilities?: ReservationActionCapabilities;
  onOpen: (id: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
}) {
  return (
    <div className="min-w-0 max-lg:overflow-x-auto lg:overflow-x-hidden">
      <table className="w-full table-fixed text-sm max-lg:min-w-[760px]">
        <thead className="bg-[#FAF8F4] text-left text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
          <tr>
            <th className="w-[6.5rem] px-2 py-2.5">Res. No.</th>
            <th className="w-[16%] px-2 py-2.5">Guest Name</th>
            <th className="w-[14%] px-2 py-2.5">Room Type</th>
            <th className="w-[6.75rem] whitespace-nowrap px-2 py-2.5">Arrival</th>
            <th className="w-[6.75rem] whitespace-nowrap px-2 py-2.5">Departure</th>
            <th className="w-12 whitespace-nowrap px-2 py-2.5 text-center">Nights</th>
            <th className="hidden w-12 whitespace-nowrap px-2 py-2.5 text-center 2xl:table-cell">
              Adults
            </th>
            <th className="hidden w-14 whitespace-nowrap px-2 py-2.5 text-center 2xl:table-cell">
              Children
            </th>
            <th className="w-[7.25rem] whitespace-nowrap px-2 py-2.5">Status</th>
            <th className="hidden w-[5.75rem] px-2 py-2.5 lg:table-cell xl:hidden 2xl:table-cell">
              Source
            </th>
            <th className="hidden w-[9%] px-2 py-2.5 lg:table-cell xl:hidden min-[1760px]:table-cell">
              Rate Plan
            </th>
            <th className="hidden w-[6.75rem] px-2 py-2.5 text-right lg:table-cell xl:hidden min-[1760px]:table-cell">
              Total Amount
            </th>
            <th className="w-14 py-2.5 pl-2 pr-4 text-right">Actions</th>
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
                className="cursor-pointer border-t border-border transition-colors hover:bg-[#FAF7EF]"
              >
                <td className="px-2 py-2.5">
                  <button
                    type="button"
                    title={row.confirmationNumber}
                    className="block max-w-full truncate text-left font-semibold text-[#765719] underline-offset-2 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(row.reservationId);
                    }}
                  >
                    {row.confirmationNumber}
                  </button>
                </td>
                <td className="px-2 py-2.5 font-medium">
                  <span className="block truncate" title={row.guestName}>
                    {row.guestName}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-muted-foreground">
                  <span className="block truncate" title={row.roomTypeName}>
                    {row.roomTypeName}
                  </span>
                  <span className="block truncate text-[10px]" title={room}>
                    {room}
                  </span>
                </td>
                <td
                  className="whitespace-nowrap px-2 py-2.5 text-muted-foreground"
                  title={formatDate(row.arrivalDate)}
                >
                  {formatDeskDate(row.arrivalDate)}
                </td>
                <td
                  className="whitespace-nowrap px-2 py-2.5 text-muted-foreground"
                  title={formatDate(row.departureDate)}
                >
                  {formatDeskDate(row.departureDate)}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 text-center tabular-nums">
                  {row.nights}
                </td>
                <td className="hidden whitespace-nowrap px-2 py-2.5 text-center tabular-nums 2xl:table-cell">
                  {row.adults}
                </td>
                <td className="hidden whitespace-nowrap px-2 py-2.5 text-center tabular-nums 2xl:table-cell">
                  {row.children}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5">
                  <ReservationStatusBadge status={row.status} />
                </td>
                <td className="hidden px-2 py-2.5 text-muted-foreground lg:table-cell xl:hidden 2xl:table-cell">
                  <span className="block truncate" title={source}>
                    {source}
                  </span>
                </td>
                <td className="hidden px-2 py-2.5 text-muted-foreground lg:table-cell xl:hidden min-[1760px]:table-cell">
                  <span className="block truncate" title={row.ratePlanName ?? undefined}>
                    {row.ratePlanName ?? "—"}
                  </span>
                </td>
                <td className="hidden px-2 py-2.5 text-right font-medium tabular-nums lg:table-cell xl:hidden min-[1760px]:table-cell">
                  {formatMoney(row.roomSubtotal, row.currency)}
                </td>
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
                      capabilities,
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
