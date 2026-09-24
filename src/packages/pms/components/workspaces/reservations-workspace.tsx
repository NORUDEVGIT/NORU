import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  House,
  List,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { ReservationStatusBadge } from "@/packages/pms/components/bookings/reservation-bits";
import { FoCancelStepper } from "@/packages/pms/components/frontoffice/fo-cancel-stepper";
import {
  AssignRoomDialog,
  CheckInDialog,
  CheckOutDialog,
  NoShowDialog,
  RoomMoveDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { CreateReservationPage } from "@/packages/pms/components/bookings/create-reservation-page";
import type { ReservationContextActionId } from "@/packages/pms/components/reservations/reservation-context-actions";
import { ReservationContextMenu } from "@/packages/pms/components/reservations/reservation-context-menu";
import { ReservationDeskMoreFilters } from "@/packages/pms/components/reservations/reservation-desk-more-filters";
import { ReservationQuickViewPanel } from "@/packages/pms/components/reservations/reservation-quick-view";
import { BookingCalendarPanel } from "@/packages/pms/components/reservations/booking-calendar";
import { GroupsWorkspace } from "@/packages/pms/components/reservations/groups-workspace";
import { WaitlistWorkspace } from "@/packages/pms/components/reservations/waitlist-workspace";
import { ArrivalsDeparturesWorkspace } from "@/packages/pms/components/workspaces/arrivals-departures-workspace";
import { ReservationControlWorkspace } from "@/packages/pms/components/workspaces/reservation-control-workspace";
import {
  isCalendarSectionEnabled,
  tabFromWorkspaceSection,
  workspaceSectionFromTab,
  type CalendarWorkspaceSection,
} from "@/packages/pms/lib/reservation-workspace/booking-calendar";
import {
  ReservationWorkspaceOverlay,
  type ReservationWorkspaceOverlayState,
} from "@/packages/pms/components/reservations/reservation-workspace-overlay";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import { ReservationDetailWorkspace } from "@/packages/pms/components/workspaces/reservation-detail-workspace";
import { getReservationDesk } from "@/packages/pms/lib/reservation-workspace/desk.server";
import { getReservationQuickView } from "@/packages/pms/lib/reservation-workspace/quick-view.server";
import type {
  OperationalReservationView,
  ReservationDeskRow,
  ReservationDeskSnapshot,
  ReservationQuickView,
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
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

const PAGE_SIZE = 25;
const ALL = DESK_FILTER_ALL;

type SourceFilter = DeskSourceFilter;
type StatusFilter = DeskStatusFilter;

type ReservationActionDialog =
  "assign_room" | "change_room" | "cancel" | "check_in" | "check_out" | "no_show";

const RESERVATION_ACTION_ROLES = new Set(["owner", "manager", "receptionist"]);

const RESERVATION_SECTIONS = [
  "Reservation Desk",
  "Booking Calendar",
  "Groups & Blocks",
  "Waitlist",
  "Reservation List",
  "Arrivals & Departures",
  "Exceptions",
] as const;

const VIEWS: Array<{
  id: OperationalReservationView;
  label: string;
  note?: string;
}> = [
  { id: "all", label: "All Reservations" },
  { id: "arrivals", label: "Arrivals" },
  { id: "departures", label: "Departures" },
  { id: "in_house", label: "In-House" },
  { id: "unassigned", label: "Unassigned" },
  { id: "pending", label: "Pending" },
  { id: "groups", label: "Groups", note: "Linked masters" },
];

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#DDD4C5] bg-white px-3 py-3 shadow-sm">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tone)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium text-[#756A5B]">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-14" />
        ) : (
          <p className="font-display text-xl font-semibold leading-tight tracking-tight text-[#251605]">
            {value}
          </p>
        )}
        {hint ? <p className="truncate text-[9px] text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export function ReservationsWorkspace({
  membership,
  initialTab,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadDesk = useServerFn(getReservationDesk);
  const loadQuickView = useServerFn(getReservationQuickView);
  const loadRoomTypes = useServerFn(listRoomTypes);
  const submitStatus = useServerFn(setReservationStatus);
  const submitCopy = useServerFn(copyReservation);
  const canManageActions = RESERVATION_ACTION_ROLES.has(membership.role);

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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    kind: ReservationActionDialog;
    row: ReservationDeskRow;
  } | null>(null);
  const [overlay, setOverlay] = useState<ReservationWorkspaceOverlayState>(null);
  const [workspaceSection, setWorkspaceSection] = useState<CalendarWorkspaceSection>(() =>
    workspaceSectionFromTab(initialTab),
  );

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

  const selectedRow = useMemo(() => {
    const fromDesk =
      deskQuery.data?.rows.find((row) => row.reservationId === selectedId) ?? null;
    if (fromDesk) return fromDesk;
    if (calendarRow?.reservationId === selectedId) return calendarRow;
    return null;
  }, [deskQuery.data?.rows, selectedId, calendarRow]);

  const quickViewQuery = useQuery({
    queryKey: ["reservation-quick-view", restaurantId, selectedId],
    queryFn: () =>
      loadQuickView({
        data: { restaurantId, reservationId: selectedId! },
      }),
    enabled: selectedId !== null,
    retry: false,
  });

  function invalidateReservationReads() {
    void queryClient.invalidateQueries({ queryKey: ["reservation-desk", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-quick-view", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-calendar", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-calendar-exceptions", restaurantId] });
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
    mutationFn: (reservationId: string) =>
      submitCopy({ data: { restaurantId, reservationId } }),
    onSuccess: (result) => {
      toast.success(`Copied as ${result.confirmationNumber}.`);
      invalidateReservationReads();
      setSelectedId(result.id);
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
    setMobileDetailOpen(false);
  }, [deskQuery.data?.rows, selectedId, calendarRow]);

  function resetPage() {
    setPage(1);
  }

  function selectView(next: OperationalReservationView) {
    setView(next);
    setPage(1);
    setSelectedId(null);
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
    setAdvanced(EMPTY_ADVANCED_FILTERS);
    setPage(1);
  }

  function selectRow(row: ReservationDeskRow) {
    setSelectedId(row.reservationId);
    setMobileDetailOpen(true);
  }

  function openReservation(id: string) {
    setMobileDetailOpen(false);
    setOverlay({ type: "reservation-detail", reservationId: id });
  }

  function goWorkspaceSection(section: CalendarWorkspaceSection) {
    setWorkspaceSection(section);
    setSelectedId(null);
    setMobileDetailOpen(false);
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
  }

  function handleReservationAction(
    actionId: ReservationContextActionId,
    row: ReservationDeskRow,
    _quickView?: ReservationQuickView,
  ) {
    switch (actionId) {
      case "open":
      case "edit":
        openReservation(row.reservationId);
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
      case "assign_room":
      case "change_room":
      case "cancel":
      case "check_in":
      case "check_out":
      case "no_show":
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
      <div className="min-w-0 bg-[#F7F4EE]" data-testid="reservation-desk">
        <header className="border-b border-border bg-background">
          <div className="px-5 pt-4 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Operations
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-foreground">
              {workspaceSection === "calendar"
                ? "Booking Calendar"
                : workspaceSection === "groups"
                  ? "Groups & Blocks"
                  : workspaceSection === "waitlist"
                    ? "Waitlist"
                    : workspaceSection === "arrivals-departures"
                      ? "Arrivals & Departures"
                      : workspaceSection === "exceptions"
                        ? "Exceptions"
                      : "Reservation Desk"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {workspaceSection === "calendar"
                ? "Inspect stay occupancy by room, then open Quick View or Front Office actions without leaving the workspace."
                : workspaceSection === "groups"
                  ? "Manage operational groups, room blocks, pickup and rooming lists. Guest account masters stay in Guest Profile."
                  : workspaceSection === "waitlist"
                    ? "Capture waitlist requests, match availability, offer and convert through create reservation. This is not a pending stay queue."
                    : workspaceSection === "arrivals-departures"
                      ? "Manage today’s arrivals and departures, room readiness, expected arrival times, and same-day late checkout."
                      : workspaceSection === "exceptions"
                        ? "Inspect derived reservation exceptions and route them to Front Office, inventory, housekeeping, cashiering or guest profile."
                      : "Manage reservations, availability, and daily reservation operations across your property."}
            </p>
          </div>
          <nav
            className="mt-3 flex items-end gap-3 overflow-x-auto px-5 sm:px-6"
            aria-label="Reservation workspace"
          >
            {RESERVATION_SECTIONS.map((section, index) => (
              <SectionTab
                key={section}
                active={
                  workspaceSection === "calendar"
                    ? section === "Booking Calendar"
                    : workspaceSection === "groups"
                      ? section === "Groups & Blocks"
                      : workspaceSection === "waitlist"
                        ? section === "Waitlist"
                        : workspaceSection === "arrivals-departures"
                          ? section === "Arrivals & Departures"
                          : workspaceSection === "exceptions"
                            ? section === "Exceptions"
                          : section === "Reservation Desk"
                }
                disabled={!isCalendarSectionEnabled(section, index)}
                onClick={() => {
                  if (section === "Booking Calendar") goWorkspaceSection("calendar");
                  if (section === "Reservation Desk") goWorkspaceSection("desk");
                  if (section === "Groups & Blocks") goWorkspaceSection("groups");
                  if (section === "Waitlist") goWorkspaceSection("waitlist");
                  if (section === "Arrivals & Departures") goWorkspaceSection("arrivals-departures");
                  if (section === "Exceptions") goWorkspaceSection("exceptions");
                }}
              >
                {section}
              </SectionTab>
            ))}
          </nav>
        </header>

        <main className="space-y-4 p-4 sm:p-5 lg:p-6">
          {workspaceSection === "groups" ||
          workspaceSection === "waitlist" ||
          workspaceSection === "arrivals-departures" ||
          workspaceSection === "exceptions" ? null : (
          <section
            className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6"
            aria-label="Reservation KPIs"
          >
            <KpiCard
              label="Total Reservations"
              value={total}
              hint="All reservations"
              loading={isInitialLoading}
              icon={<ClipboardList className="size-4" />}
              tone="bg-[#F4E9D0] text-[#8A641A]"
            />
            <KpiCard
              label="Arrivals Today"
              value={kpis?.arrivalsToday ?? 0}
              loading={isInitialLoading}
              icon={<LogIn className="size-4" />}
              tone="bg-emerald-50 text-emerald-700"
            />
            <KpiCard
              label="Departures Today"
              value={kpis?.departuresToday ?? 0}
              loading={isInitialLoading}
              icon={<LogOut className="size-4" />}
              tone="bg-rose-50 text-rose-700"
            />
            <KpiCard
              label="In-House"
              value={kpis?.inHouse ?? 0}
              loading={isInitialLoading}
              icon={<House className="size-4" />}
              tone="bg-blue-50 text-blue-700"
            />
            <KpiCard
              label="Unassigned"
              value={kpis?.unassigned ?? 0}
              loading={isInitialLoading}
              icon={<TriangleAlert className="size-4" />}
              tone="bg-amber-50 text-amber-700"
            />
            <KpiCard
              label="Available Rooms"
              value={kpis?.availableRooms ?? 0}
              hint="Physical vacant rooms"
              loading={isInitialLoading}
              icon={<DoorOpen className="size-4" />}
              tone="bg-indigo-50 text-indigo-700"
            />
          </section>
          )}

          {workspaceSection === "desk" ? (
          <>
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
                Arrival From
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    resetPage();
                  }}
                  className="h-9 w-40"
                />
              </label>
              <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
                Arrival To
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    resetPage();
                  }}
                  className="h-9 w-40"
                />
              </label>
              <FilterSelect
                label="Status"
                value={status}
                onValueChange={(value) => {
                  setStatus(value as StatusFilter);
                  resetPage();
                }}
                options={[
                  ["all", "All statuses"],
                  ["pending", "Pending"],
                  ["confirmed", "Confirmed"],
                  ["checked_in", "Checked In"],
                  ["checked_out", "Checked Out"],
                  ["cancelled", "Cancelled"],
                  ["no_show", "No Show"],
                ]}
              />
              <FilterSelect
                label="Room Type"
                value={roomTypeId}
                onValueChange={(value) => {
                  setRoomTypeId(value);
                  setRoomTypeName(
                    (roomTypesQuery.data ?? []).find((roomType) => roomType.id === value)?.name ??
                      "",
                  );
                  resetPage();
                }}
                options={[
                  ["all", "All room types"],
                  ...(roomTypesQuery.data ?? []).map(
                    (roomType) => [roomType.id, roomType.name] as [string, string],
                  ),
                ]}
              />
              <FilterSelect
                label="Source"
                value={source}
                onValueChange={(value) => {
                  setSource(value as SourceFilter);
                  resetPage();
                }}
                options={[
                  ["all", "All sources"],
                  ["staff", "Staff"],
                  ["walk_in", "Walk-in"],
                  ["direct_booking", "Direct booking"],
                  ["future_online", "Future online"],
                ]}
              />
              <label className="grid min-w-52 flex-1 gap-1 text-[11px] font-medium text-muted-foreground">
                Search
                <span className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                    }}
                    className="h-9 pl-9"
                    placeholder="Confirmation, guest, phone, email or room"
                    aria-label="Search reservations"
                  />
                </span>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMoreFiltersOpen(true)}
                data-testid="reservation-desk-more-filters-button"
              >
                <SlidersHorizontal className="size-4" />
                More Filters
                {countActiveAdvancedFilters(advanced) > 0 ? (
                  <span className="ml-1 inline-flex min-w-5 justify-center rounded-full bg-[#C89933] px-1.5 text-[11px] font-semibold text-[#251605]">
                    {countActiveAdvancedFilters(advanced)}
                  </span>
                ) : null}
              </Button>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
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
            {arrivalError ? <p className="mt-2 text-xs text-destructive">{arrivalError}</p> : null}
            {deskFilterChips(bar, advanced).length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2" data-testid="reservation-desk-filter-chips">
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
              </ul>
            ) : null}
          </section>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[190px_minmax(0,1fr)_300px]">
            <aside className="rounded-xl border border-[#DDD4C5] bg-white p-2 shadow-sm">
              <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Operational views
              </p>
              <nav className="space-y-1" aria-label="Operational reservation views">
                {VIEWS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={view === item.id ? "page" : undefined}
                    onClick={() => selectView(item.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      view === item.id
                        ? "bg-[#F4E9D0] font-medium text-[#251605]"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <span>
                      {item.label}
                      {item.note ? (
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          {item.note}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs tabular-nums">{viewCount(item.id, snapshot)}</span>
                  </button>
                ))}
              </nav>
            </aside>

            <section className="min-w-0 overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
              <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border px-3">
                <div className="flex items-center gap-1">
                  <ModeButton
                    active={workspaceSection === "desk"}
                    icon={<List className="size-3.5" />}
                    onClick={() => goWorkspaceSection("desk")}
                  >
                    Table
                  </ModeButton>
                  <ModeButton
                    active={false}
                    icon={<CalendarDays className="size-3.5" />}
                    onClick={() => goWorkspaceSection("calendar")}
                  >
                    Calendar
                  </ModeButton>
                  <ModeButton disabled icon={<SlidersHorizontal className="size-3.5" />}>
                    Timeline
                  </ModeButton>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Refresh reservations"
                  onClick={() => void deskQuery.refetch()}
                  disabled={deskQuery.isFetching}
                >
                  <RefreshCw className={cn("size-4", deskQuery.isFetching && "animate-spin")} />
                </Button>
              </div>
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
                      <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                        Clear Filters
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <ReservationTable
                  rows={snapshot?.rows ?? []}
                  selectedId={selectedId}
                  businessDate={snapshot?.businessDate ?? ""}
                  canManage={canManageActions}
                  onSelect={selectRow}
                  onOpen={openReservation}
                  onAction={handleReservationAction}
                />
              )}

              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Page {snapshot?.query.page ?? page} of {pages} · {total} total · {PAGE_SIZE} per
                  page
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

            <aside className="hidden min-w-0 xl:block">
              <ReservationQuickViewPanel
                row={selectedRow}
                loading={quickViewQuery.isLoading}
                error={quickViewQuery.isError}
                quickView={quickViewQuery.data}
                onRetry={() => void quickViewQuery.refetch()}
                businessDate={snapshot?.businessDate ?? ""}
                canManage={canManageActions}
                onAction={(actionId) => {
                  if (selectedRow) {
                    handleReservationAction(actionId, selectedRow, quickViewQuery.data);
                  }
                }}
              />
            </aside>
          </div>
          </>
          ) : workspaceSection === "arrivals-departures" ? (
          <ArrivalsDeparturesWorkspace
            restaurantId={restaurantId}
            timezone={membership.restaurant.timezone}
            currencyCode={membership.restaurant.currencyCode}
            canManage={canManageActions}
            onOpenReservation={openReservation}
          />
          ) : workspaceSection === "exceptions" ? (
          <ReservationControlWorkspace
            restaurantId={restaurantId}
            currencyCode={membership.restaurant.currencyCode}
            canManage={canManageActions}
            onOpenReservation={openReservation}
            onOpenCalendar={() => goWorkspaceSection("calendar")}
          />
          ) : workspaceSection === "groups" ? (
          <GroupsWorkspace
            restaurantId={restaurantId}
            canWrite={membership.role === "owner" || membership.role === "manager"}
            onCreateStay={(groupId, blockId) => {
              setCreateGroupLink({ pmsGroupId: groupId, pmsGroupBlockId: blockId });
              setOverlay({ type: "new-reservation" });
            }}
            onOpenReservation={openReservation}
          />
          ) : workspaceSection === "waitlist" ? (
          <WaitlistWorkspace
            restaurantId={restaurantId}
            canWrite={membership.role === "owner" || membership.role === "manager"}
            onOpenReservation={openReservation}
          />
          ) : (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <BookingCalendarPanel
              restaurantId={restaurantId}
              canManage={canManageActions}
              selectedId={selectedId}
              onSelect={(row) => {
                setCalendarRow(row);
                setSelectedId(row.reservationId);
                setMobileDetailOpen(true);
              }}
              onOpen={openReservation}
              onAction={handleReservationAction}
            />
            <aside className="hidden min-w-0 xl:block">
              <ReservationQuickViewPanel
                row={selectedRow}
                loading={quickViewQuery.isLoading}
                error={quickViewQuery.isError}
                quickView={quickViewQuery.data}
                onRetry={() => void quickViewQuery.refetch()}
                businessDate={snapshot?.businessDate ?? ""}
                canManage={canManageActions}
                onAction={(actionId) => {
                  if (selectedRow) {
                    handleReservationAction(actionId, selectedRow, quickViewQuery.data);
                  }
                }}
              />
            </aside>
          </div>
          )}
        </main>
      </div>

      <Sheet
        open={workspaceSection === "desk" && mobileDetailOpen && selectedRow !== null}
        onOpenChange={setMobileDetailOpen}
      >
        <SheetContent className="w-full overflow-y-auto p-4 sm:max-w-md xl:hidden">
          <ReservationQuickViewPanel
            row={selectedRow}
            loading={quickViewQuery.isLoading}
            error={quickViewQuery.isError}
            quickView={quickViewQuery.data}
            onRetry={() => void quickViewQuery.refetch()}
            businessDate={snapshot?.businessDate ?? ""}
            canManage={canManageActions}
            onAction={(actionId) => {
              if (selectedRow) {
                handleReservationAction(actionId, selectedRow, quickViewQuery.data);
              }
            }}
          />
        </SheetContent>
      </Sheet>

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
        hideVisualHeader={overlay?.type === "reservation-detail"}
        showCreateIcon={overlay?.type === "new-reservation"}
        onOpenChange={closeWorkspaceOverlay}
      >
        {overlay?.type === "new-reservation" ? (
          <CreateReservationPage
            membership={membership}
            embedded
            pmsGroupId={createGroupLink?.pmsGroupId ?? null}
            pmsGroupBlockId={createGroupLink?.pmsGroupBlockId ?? null}
            onCancel={() => closeWorkspaceOverlay(false)}
            onCreated={() => invalidateReservationReads()}
            onOpenCreatedReservation={(reservationId) => {
              setSelectedId(reservationId);
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
              setOverlay({ type: "reservation-detail", reservationId });
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
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 w-40">
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
    </label>
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
  selectedId,
  businessDate,
  canManage,
  onSelect,
  onOpen,
  onAction,
}: {
  rows: ReservationDeskRow[];
  selectedId: string | null;
  businessDate: string;
  canManage: boolean;
  onSelect: (row: ReservationDeskRow) => void;
  onOpen: (id: string) => void;
  onAction: (actionId: ReservationContextActionId, row: ReservationDeskRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1120px] w-full text-sm">
        <thead className="bg-[#FAF8F4] text-left text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2.5">
              <span className="sr-only">Select</span>
            </th>
            <th className="px-3 py-2.5">Res. No.</th>
            <th className="px-3 py-2.5">Guest Name</th>
            <th className="px-3 py-2.5">Room Type</th>
            <th className="px-3 py-2.5">Arrival</th>
            <th className="px-3 py-2.5">Departure</th>
            <th className="px-3 py-2.5 text-center">Nights</th>
            <th className="px-3 py-2.5 text-center">Adults</th>
            <th className="px-3 py-2.5 text-center">Children</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Source</th>
            <th className="px-3 py-2.5">Rate Plan</th>
            <th className="px-3 py-2.5 text-right">Total Amount</th>
            <th className="px-3 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = selectedId === row.reservationId;
            return (
              <tr
                key={row.reservationId}
                onClick={() => onSelect(row)}
                className={cn(
                  "cursor-pointer border-t border-border transition-colors hover:bg-[#FAF7EF]",
                  selected && "bg-[#F4E9D0]/70",
                )}
              >
                <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => onSelect(row)}
                    aria-label={`Select reservation ${row.confirmationNumber}`}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <button
                    type="button"
                    className="font-semibold text-[#765719] underline-offset-2 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(row.reservationId);
                    }}
                  >
                    {row.confirmationNumber}
                  </button>
                </td>
                <td className="max-w-44 truncate px-3 py-2.5 font-medium">{row.guestName}</td>
                <td className="max-w-36 truncate px-3 py-2.5 text-muted-foreground">
                  {row.roomTypeName}
                  <span className="block text-[10px]">{row.roomNumber ?? "Unassigned"}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                  {formatDate(row.arrivalDate)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                  {formatDate(row.departureDate)}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums">{row.nights}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{row.adults}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{row.children}</td>
                <td className="px-3 py-2.5">
                  <ReservationStatusBadge status={row.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                  {sourceLabel(row.source)}
                </td>
                <td className="max-w-32 truncate px-3 py-2.5 text-muted-foreground">
                  {row.ratePlanName ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">
                  {formatMoney(row.roomSubtotal, row.currency)}
                </td>
                <td className="px-3 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
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
    case "cancel":
      return (
        <FoCancelStepper restaurantId={restaurantId} stay={stay} open onOpenChange={onOpenChange} />
      );
    case "check_in":
      return (
        <CheckInDialog restaurantId={restaurantId} stay={stay} open onOpenChange={onOpenChange} />
      );
    case "check_out":
      return (
        <CheckOutDialog restaurantId={restaurantId} stay={stay} open onOpenChange={onOpenChange} />
      );
    case "no_show":
      return (
        <NoShowDialog
          restaurantId={restaurantId}
          stay={stay}
          today={businessDate}
          open
          onOpenChange={onOpenChange}
        />
      );
  }
}

function overlayDetailRow(
  overlay: ReservationWorkspaceOverlayState,
  rows: ReservationDeskRow[],
  selectedRow: ReservationDeskRow | null,
): ReservationDeskRow | null {
  if (overlay?.type !== "reservation-detail") return null;
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
  return overlay?.type === "reservation-detail" ? "Reservation Detail" : "New Reservation";
}

function overlayDescription(
  overlay: ReservationWorkspaceOverlayState,
  rows: ReservationDeskRow[],
  selectedRow: ReservationDeskRow | null,
): string {
  const row = overlayDetailRow(overlay, rows, selectedRow);
  if (row) return `${row.guestName} · ${row.status.replaceAll("_", " ")}`;
  return overlay?.type === "reservation-detail"
    ? "Review stay, guest, room and commercial information."
    : "Create and manage a new reservation";
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
