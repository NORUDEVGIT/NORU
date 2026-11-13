import { useEffect, useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  ClipboardList,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";

import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  AssignRoomDialog,
  CheckInDialog,
  CheckOutDialog,
  NoShowDialog,
  StayDatesDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import {
  PmsFilterPopover,
  PmsFilterSection,
  PmsFilterSelect,
  PmsFilterToggle,
  PMS_FILTER_DATE,
} from "@/packages/pms/components/pms-filter-popover";
import { ReservationShellSlot } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { PMS_OP_BTN_OUTLINE } from "@/packages/pms/lib/pms-operational-surface";
import { ArrivalGuestWorkspace } from "@/packages/pms/components/workspaces/arrival-guest-workspace";
import {
  BulkExpectedArrivalDialog,
  LateCheckoutDialog,
} from "@/packages/pms/components/workspaces/arrivals-departures-dialogs";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { getReservationArrivalsDepartures } from "@/packages/pms/lib/reservation-workspace/arrivals-departures.server";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import type {
  ArrivalExceptionKey,
  ArrivalRow,
  DepartureExceptionKey,
  DepartureRow,
  ReservationArrivalsDeparturesSnapshot,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatClockInZone } from "@/shared/lib/property-time";
import { cn } from "@/shared/lib/utils";
import type { FrontOfficeDeskAccess } from "@/packages/pms/lib/front-office-desk-access";

type Mode = "arrivals" | "departures";
type FoKind = "assign_room" | "check_in" | "check_out" | "no_show" | "extend_stay";

const PILL_BUTTON =
  "h-9 rounded-full border-[#e9dfd0] bg-white text-sm font-semibold text-[#4a2c1a] shadow-none hover:bg-[#f5ead0]";

const ARRIVAL_EXCEPTION_LABELS: Record<ArrivalExceptionKey, string> = {
  unassigned: "Unassigned",
  room_not_ready: "Room not ready",
  room_unavailable: "Room unavailable",
  payment_issue: "Payment issue",
  special_request: "Special request",
};

const DEPARTURE_EXCEPTION_LABELS: Record<DepartureExceptionKey, string> = {
  overstay: "Overstay",
  payment_issue: "Payment issue",
};

function useDesktopOverlay() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop;
}

function stayFromArrival(row: ArrivalRow): FrontOfficeStay {
  return {
    id: row.reservationId,
    confirmationNumber: row.confirmationNumber,
    guestId: row.guest.id,
    guestName: row.guest.name,
    guestVip: row.guest.vip,
    guestPhone: row.guest.phone,
    guestEmail: row.guest.email,
    roomTypeId: row.room.roomTypeId,
    roomTypeName: row.room.roomTypeName,
    roomId: row.room.roomId,
    roomNumber: row.room.roomNumber,
    arrivalDate: row.stay.arrivalDate,
    departureDate: row.stay.departureDate,
    nights: row.stay.nights,
    adults: row.stay.adults,
    children: row.stay.children,
    status: row.stay.status,
    specialRequests: row.operational.specialRequests,
    source: row.commercial.source,
    guaranteeMethod: row.commercial.guaranteeMethod,
    overstay: false,
    walkInIncomplete: row.operational.walkInIncomplete,
    expectedArrivalAt: row.operational.expectedArrivalTime,
  };
}

function stayFromDeparture(row: DepartureRow): FrontOfficeStay {
  return {
    id: row.reservationId,
    confirmationNumber: row.confirmationNumber,
    guestId: row.guest.id,
    guestName: row.guest.name,
    guestVip: row.guest.vip,
    guestPhone: null,
    guestEmail: null,
    roomTypeId: row.room.roomTypeId,
    roomTypeName: row.room.roomTypeName,
    roomId: row.room.roomId,
    roomNumber: row.room.roomNumber,
    arrivalDate: row.stay.arrivalDate,
    departureDate: row.stay.departureDate,
    nights: nightsBetween(row.stay.arrivalDate, row.stay.departureDate),
    adults: 1,
    children: 0,
    status: row.stay.status,
    specialRequests: row.operational.specialRequests,
    overstay: row.stay.overstay,
    lateCheckoutGranted: row.operational.lateCheckout.granted,
    lateCheckoutUntil: row.operational.lateCheckout.until,
    lateCheckoutNote: row.operational.lateCheckout.note,
  };
}

function formatMoney(value: number | null, currency: string): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function financialLabel(financial: ArrivalRow["financial"], currency: string): string {
  if (financial.state === "permission_denied") return "Permission denied";
  if (financial.state !== "available") return "Coming soon";
  if (financial.balance != null) return formatMoney(financial.balance, currency);
  if (financial.folioId) return "Folio open";
  return "No folio";
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

export function ArrivalsDeparturesWorkspace({
  restaurantId,
  search = "",
  rangeStart,
  rangeEnd,
  timezone,
  currencyCode,
  foAccess,
  onOpenReservation,
}: {
  restaurantId: string;
  /** Guest, confirmation or room, from the shared Reservations search. Runs on loaded rows. */
  search?: string;
  /** Shared Reservations week. Arrivals and departures inside it are listed. */
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
  currencyCode: string;
  foAccess: FrontOfficeDeskAccess;
  onOpenReservation: (reservationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const desktop = useDesktopOverlay();
  const loadSnapshot = useServerFn(getReservationArrivalsDepartures);
  const loadRoomTypes = useServerFn(listRoomTypes);

  const [mode, setMode] = useState<Mode>("arrivals");
  const [date, setDate] = useState("");
  const [vip, setVip] = useState(false);
  const [assignment, setAssignment] = useState<"all" | "assigned" | "unassigned">("all");
  const [roomTypeId, setRoomTypeId] = useState("all");
  const [arrivalStatus, setArrivalStatus] = useState<"all" | "pending" | "confirmed">("all");
  const [departureStatus, setDepartureStatus] = useState<"all" | "confirmed" | "checked_in">("all");
  const [overstay, setOverstay] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedArrivalIds, setSelectedArrivalIds] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bulkEtaOpen, setBulkEtaOpen] = useState(false);
  const [lateRow, setLateRow] = useState<DepartureRow | null>(null);
  const [foAction, setFoAction] = useState<{ kind: FoKind; stay: FrontOfficeStay } | null>(null);

  const roomTypesQuery = useQuery({
    queryKey: ["pms-ad-room-types", restaurantId],
    queryFn: () => loadRoomTypes({ data: { restaurantId, includeInactive: false } }),
    staleTime: 5 * 60_000,
  });

  const dateInWeek = !date || (date >= rangeStart && date <= rangeEnd);
  const singleDay = Boolean(date) && dateInWeek;

  const snapshotQuery = useQuery({
    queryKey: [
      "pms-arrivals-departures",
      restaurantId,
      singleDay ? date : "",
      rangeStart,
      rangeEnd,
      vip,
      assignment,
      roomTypeId,
      arrivalStatus,
      departureStatus,
      overstay,
    ],
    queryFn: () =>
      loadSnapshot({
        data: {
          restaurantId,
          date: singleDay ? date : undefined,
          dateFrom: singleDay ? undefined : rangeStart,
          dateTo: singleDay ? undefined : rangeEnd,
          vip: vip || undefined,
          assignment: assignment === "all" ? undefined : assignment,
          roomTypeId: roomTypeId === "all" ? undefined : roomTypeId,
          arrivalStatus: arrivalStatus === "all" ? undefined : arrivalStatus,
          overstay: overstay || undefined,
          departureStatus: departureStatus === "all" ? undefined : departureStatus,
        },
      }) as Promise<ReservationArrivalsDeparturesSnapshot>,
    enabled: dateInWeek,
    placeholderData: keepPreviousData,
  });

  const snapshot = dateInWeek ? snapshotQuery.data : undefined;

  const searchTerm = search.trim().toLowerCase();
  const arrivals = useMemo(() => {
    const rows = snapshot?.arrivals ?? [];
    if (!searchTerm) return rows;
    return rows.filter((row) =>
      [row.guest.name, row.confirmationNumber, row.room.roomNumber, row.room.roomTypeName].some(
        (field) => field?.toLowerCase().includes(searchTerm),
      ),
    );
  }, [snapshot?.arrivals, searchTerm]);
  const departures = useMemo(() => {
    const rows = snapshot?.departures ?? [];
    if (!searchTerm) return rows;
    return rows.filter((row) =>
      [row.guest.name, row.confirmationNumber, row.room.roomNumber, row.room.roomTypeName].some(
        (field) => field?.toLowerCase().includes(searchTerm),
      ),
    );
  }, [snapshot?.departures, searchTerm]);
  const selectedArrival = arrivals.find((row) => row.reservationId === selectedId) ?? null;
  const selectedDeparture = departures.find((row) => row.reservationId === selectedId) ?? null;
  const arrivalWorkspaceOpen = mode === "arrivals" && selectedArrival !== null;
  const quickViewOpen = mode === "departures" && selectedDeparture !== null;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-arrivals-departures", restaurantId] });
  }

  function selectArrival(row: ArrivalRow) {
    setSelectedId(row.reservationId);
  }

  function selectDeparture(row: DepartureRow) {
    setSelectedId(row.reservationId);
    setMobileOpen(true);
  }

  function openStay(id: string) {
    setMobileOpen(false);
    onOpenReservation(id);
  }

  /* Filter menu bookkeeping */
  const businessDate = snapshot?.businessDate ?? "";

  const activeFilterCount =
    (date ? 1 : 0) +
    (roomTypeId !== "all" ? 1 : 0) +
    (mode === "arrivals"
      ? (assignment !== "all" ? 1 : 0) + (arrivalStatus !== "all" ? 1 : 0) + (vip ? 1 : 0)
      : (departureStatus !== "all" ? 1 : 0) + (overstay ? 1 : 0));

  function resetFilters() {
    setDate("");
    setRoomTypeId("all");
    setAssignment("all");
    setArrivalStatus("all");
    setVip(false);
    setDepartureStatus("all");
    setOverstay(false);
  }

  const roomTypeChipName =
    roomTypeId !== "all"
      ? ((roomTypesQuery.data ?? []).find((type) => type.id === roomTypeId)?.name ?? "Room type")
      : null;

  const totals = snapshot?.totals;

  const kpis = useMemo(() => {
    if (!totals) return [];
    return mode === "arrivals"
      ? [
          {
            label: "Arrivals",
            value: totals.arrivals,
            icon: <CalendarDays className="size-4" />,
            warn: false,
          },
          {
            label: "Unassigned Arrivals",
            value: totals.unassignedArrivals,
            icon: <BedDouble className="size-4" />,
            warn: true,
          },
          {
            label: "Not Ready",
            value: totals.notReadyArrivals,
            icon: <TriangleAlert className="size-4" />,
            warn: true,
          },
          {
            label: "Exceptions",
            value: totals.arrivalExceptions,
            icon: <AlertTriangle className="size-4" />,
            warn: true,
          },
        ]
      : [
          {
            label: "Departures",
            value: totals.departures,
            icon: <CalendarDays className="size-4" />,
            warn: false,
          },
          {
            label: "Overstays",
            value: totals.overstays,
            icon: <TriangleAlert className="size-4" />,
            warn: true,
          },
          {
            label: "Financial Issues",
            value: totals.departurePaymentIssues,
            icon: <ClipboardList className="size-4" />,
            warn: true,
          },
          {
            label: "Exceptions",
            value: totals.departureExceptions,
            icon: <AlertTriangle className="size-4" />,
            warn: true,
          },
        ];
  }, [totals, mode]);

  const quickViewDeparture = (
    <DepartureQuickView
      row={selectedDeparture}
      timezone={timezone}
      currencyCode={currencyCode}
      foAccess={foAccess}
      onOpen={openStay}
      onCheckOut={(row) => setFoAction({ kind: "check_out", stay: stayFromDeparture(row) })}
      onExtend={(row) => setFoAction({ kind: "extend_stay", stay: stayFromDeparture(row) })}
      onLate={setLateRow}
    />
  );

  return (
    <div className="space-y-3" data-testid="arrivals-departures-workspace">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center rounded-full bg-[#f1ede6] p-1"
            role="group"
            aria-label="Arrivals or departures"
          >
            <ModeButton
              active={mode === "arrivals"}
              count={totals?.arrivals}
              onClick={() => setMode("arrivals")}
            >
              Arrivals
            </ModeButton>
            <ModeButton
              active={mode === "departures"}
              count={totals?.departures}
              onClick={() => setMode("departures")}
            >
              Departures
            </ModeButton>
          </div>

          {rangeStart ? (
            <p className="min-w-0 truncate text-xs text-[#7A6B58]">
              <span className="font-semibold text-[#4a2c1a]">
                {date
                  ? formatStayDate(date)
                  : `${formatStayDate(rangeStart)} – ${formatStayDate(rangeEnd)}`}
              </span>
              {date && snapshot && snapshot.businessDate !== date
                ? ` · Business date ${formatStayDate(snapshot.businessDate)}`
                : ""}
              {snapshotQuery.isFetching ? " · Updating…" : ""}
            </p>
          ) : null}

          <ReservationShellSlot name="filter">
            <PmsFilterPopover
              title={mode === "arrivals" ? "Filter Arrivals" : "Filter Departures"}
              activeCount={activeFilterCount}
              open={filterOpen}
              onOpenChange={setFilterOpen}
              onClear={resetFilters}
              onApply={() => setFilterOpen(false)}
              buttonTestId="arrivals-departures-filter-button"
            >
              <PmsFilterSection title="Operational date">
                <Input
                  type="date"
                  className={PMS_FILTER_DATE}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label="Operational date"
                />
                <Button
                  type="button"
                  variant="outline"
                  className={cn(PMS_OP_BTN_OUTLINE, "h-9 w-full text-xs font-semibold")}
                  disabled={!businessDate || date === businessDate}
                  onClick={() => setDate(businessDate)}
                >
                  Jump to business date
                </Button>
              </PmsFilterSection>

              <PmsFilterSection title="Room type">
                <PmsFilterSelect
                  value={roomTypeId}
                  onValueChange={setRoomTypeId}
                  options={[
                    ["all", "All room types"],
                    ...(roomTypesQuery.data ?? []).map((type) => [type.id, type.name] as const),
                  ]}
                  ariaLabel="Room type"
                />
              </PmsFilterSection>

              {mode === "arrivals" ? (
                <>
                  <PmsFilterSection title="Assignment">
                    <PmsFilterSelect
                      value={assignment}
                      onValueChange={(value) => setAssignment(value as typeof assignment)}
                      options={[
                        ["all", "All"],
                        ["assigned", "Assigned"],
                        ["unassigned", "Unassigned"],
                      ]}
                      ariaLabel="Assignment"
                    />
                  </PmsFilterSection>
                  <PmsFilterSection title="Status">
                    <PmsFilterSelect
                      value={arrivalStatus}
                      onValueChange={(value) => setArrivalStatus(value as typeof arrivalStatus)}
                      options={[
                        ["all", "Pending and confirmed"],
                        ["pending", "Pending"],
                        ["confirmed", "Confirmed"],
                      ]}
                      ariaLabel="Arrival status"
                    />
                  </PmsFilterSection>
                  <PmsFilterSection title="Guests">
                    <PmsFilterToggle label="VIP only" checked={vip} onChange={setVip} />
                  </PmsFilterSection>
                </>
              ) : (
                <>
                  <PmsFilterSection title="Status">
                    <PmsFilterSelect
                      value={departureStatus}
                      onValueChange={(value) => setDepartureStatus(value as typeof departureStatus)}
                      options={[
                        ["all", "Confirmed and in-house"],
                        ["confirmed", "Confirmed"],
                        ["checked_in", "In-house"],
                      ]}
                      ariaLabel="Departure status"
                    />
                  </PmsFilterSection>
                  <PmsFilterSection title="Stay">
                    <PmsFilterToggle label="Overstay only" checked={overstay} onChange={setOverstay} />
                  </PmsFilterSection>
                </>
              )}
            </PmsFilterPopover>
          </ReservationShellSlot>
        </div>

        {/* Active filter chips */}
        {date ||
        roomTypeChipName ||
        (mode === "arrivals" && (assignment !== "all" || arrivalStatus !== "all" || vip)) ||
        (mode === "departures" && (departureStatus !== "all" || overstay)) ? (
          <ul className="flex flex-wrap gap-2" data-testid="arrivals-departures-filter-chips">
            {date ? (
              <li>
                <FilterChip label={formatStayDate(date)} onRemove={() => setDate("")} />
              </li>
            ) : null}
            {roomTypeChipName ? (
              <li>
                <FilterChip label={roomTypeChipName} onRemove={() => setRoomTypeId("all")} />
              </li>
            ) : null}
            {mode === "arrivals" && assignment !== "all" ? (
              <li>
                <FilterChip label={assignment} onRemove={() => setAssignment("all")} />
              </li>
            ) : null}
            {mode === "arrivals" && arrivalStatus !== "all" ? (
              <li>
                <FilterChip label={arrivalStatus} onRemove={() => setArrivalStatus("all")} />
              </li>
            ) : null}
            {mode === "arrivals" && vip ? (
              <li>
                <FilterChip label="VIP only" onRemove={() => setVip(false)} />
              </li>
            ) : null}
            {mode === "departures" && departureStatus !== "all" ? (
              <li>
                <FilterChip
                  label={departureStatus.replaceAll("_", " ")}
                  onRemove={() => setDepartureStatus("all")}
                />
              </li>
            ) : null}
            {mode === "departures" && overstay ? (
              <li>
                <FilterChip label="Overstay only" onRemove={() => setOverstay(false)} />
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {mode === "arrivals" && selectedArrivalIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#e9dfd0] bg-[#f5ead0] px-4 py-2">
          <p className="text-sm font-semibold text-[#4a2c1a]">
            {selectedArrivalIds.length} selected
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-xs text-[#4a2c1a]"
              onClick={() => setSelectedArrivalIds([])}
            >
              Clear
            </Button>
            {foAccess.canStayEdit ? (
              <Button
                size="sm"
                className="rounded-full bg-[#C89933] text-xs font-bold text-[#251605] hover:bg-[#B98B2D]"
                onClick={() => setBulkEtaOpen(true)}
              >
                Set expected arrival
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "grid min-w-0 gap-3",
          quickViewOpen && "xl:grid-cols-[minmax(0,1fr)_300px]",
        )}
      >
        <section className="min-w-0 overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
          {snapshotQuery.isError ? (
            <div className="space-y-2 p-4">
              <p className="text-sm text-destructive">
                {snapshotQuery.error instanceof Error
                  ? snapshotQuery.error.message
                  : "Could not load arrivals and departures."}
              </p>
              <Button variant="outline" size="sm" onClick={() => void snapshotQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : snapshotQuery.isLoading && !snapshot ? (
            <div className="space-y-2 p-4" aria-label="Loading arrivals and departures">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : mode === "arrivals" && arrivals.length === 0 ? (
            <EmptyState
              message="No arrivals for these filters."
              canReset={activeFilterCount > 0}
              onReset={resetFilters}
            />
          ) : mode === "departures" && departures.length === 0 ? (
            <EmptyState
              message="No departures for these filters."
              canReset={activeFilterCount > 0}
              onReset={resetFilters}
            />
          ) : mode === "arrivals" ? (
            <ArrivalsTable
              rows={arrivals}
              selectedId={selectedId}
              selectedIds={selectedArrivalIds}
              timezone={timezone}
              foAccess={foAccess}
              onToggleSelect={(id, checked) =>
                setSelectedArrivalIds((current) =>
                  checked
                    ? [...new Set([...current, id])]
                    : current.filter((value) => value !== id),
                )
              }
              onSelect={selectArrival}
              onAssign={(row) => setFoAction({ kind: "assign_room", stay: stayFromArrival(row) })}
              onCheckIn={(row) => setFoAction({ kind: "check_in", stay: stayFromArrival(row) })}
            />
          ) : (
            <DeparturesTable
              rows={departures}
              selectedId={selectedId}
              timezone={timezone}
              currencyCode={currencyCode}
              onSelect={selectDeparture}
              onOpen={openStay}
              onCheckOut={(row) => setFoAction({ kind: "check_out", stay: stayFromDeparture(row) })}
            />
          )}
        </section>

        {quickViewOpen ? (
          <aside className="relative hidden min-w-0 xl:block">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10 size-7"
              aria-label="Close quick view"
              onClick={() => setSelectedId(null)}
            >
              <X className="size-4" />
            </Button>
            {quickViewDeparture}
          </aside>
        ) : null}
      </div>

      <Sheet
        open={!desktop && mobileOpen && selectedId !== null && mode === "departures"}
        onOpenChange={setMobileOpen}
      >
        <SheetContent className="w-full overflow-y-auto p-4 sm:max-w-md xl:hidden">
          {quickViewDeparture}
        </SheetContent>
      </Sheet>

      <ArrivalGuestWorkspace
        restaurantId={restaurantId}
        row={selectedArrival}
        open={arrivalWorkspaceOpen}
        timezone={timezone}
        currencyCode={currencyCode}
        canManage={foAccess.canStayEdit}
        onClose={() => setSelectedId(null)}
        onOpenReservation={openStay}
        onOpenHistory={openStay}
        onSaved={invalidate}
      />

      <BulkExpectedArrivalDialog
        restaurantId={restaurantId}
        timezone={timezone}
        arrivalDate={date || snapshot?.selectedDate || snapshot?.businessDate || ""}
        reservationIds={selectedArrivalIds}
        open={bulkEtaOpen}
        onOpenChange={setBulkEtaOpen}
        onSaved={() => {
          setSelectedArrivalIds([]);
          invalidate();
        }}
      />
      <LateCheckoutDialog
        restaurantId={restaurantId}
        timezone={timezone}
        row={lateRow}
        open={lateRow !== null}
        onOpenChange={(open) => {
          if (!open) setLateRow(null);
        }}
        onSaved={invalidate}
      />
      {foAction?.kind === "assign_room" ? (
        <AssignRoomDialog
          restaurantId={restaurantId}
          stay={foAction.stay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              invalidate();
            }
          }}
        />
      ) : null}
      {foAction?.kind === "check_in" ? (
        <CheckInDialog
          restaurantId={restaurantId}
          stay={foAction.stay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              invalidate();
            }
          }}
        />
      ) : null}
      {foAction?.kind === "check_out" ? (
        <CheckOutDialog
          restaurantId={restaurantId}
          stay={foAction.stay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              invalidate();
            }
          }}
        />
      ) : null}
      {foAction?.kind === "no_show" ? (
        <NoShowDialog
          restaurantId={restaurantId}
          stay={foAction.stay}
          today={snapshot?.selectedDate ?? snapshot?.businessDate ?? date}
          open
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              invalidate();
            }
          }}
        />
      ) : null}
      {foAction?.kind === "extend_stay" ? (
        <StayDatesDialog
          restaurantId={restaurantId}
          stay={foAction.stay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              invalidate();
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  count,
  children,
  onClick,
}: {
  active: boolean;
  count?: number;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
        active ? "bg-[#C89933] text-[#251605] shadow-sm" : "text-[#7A6B58] hover:text-[#4a2c1a]",
      )}
    >
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            "rounded-full px-1.5 text-[11px] tabular-nums",
            active ? "bg-white/60" : "bg-white",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function KpiCard({
  label,
  value,
  icon,
  warn,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  warn: boolean;
}) {
  const alert = warn && value > 0;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm",
        alert ? "border-amber-200 bg-amber-50/60" : "border-[#e9dfd0]",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          alert ? "bg-amber-100 text-amber-900" : "bg-[#f5ead0] text-[#8C6D23]",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-xl font-semibold leading-none tabular-nums text-[#4a2c1a]">
          {value}
        </p>
        <p className="mt-1 truncate text-[11px] text-[#7A6B58]">{label}</p>
      </div>
    </div>
  );
}

function EmptyState({
  message,
  canReset,
  onReset,
}: {
  message: string;
  canReset: boolean;
  onReset: () => void;
}) {
  return (
    <div className="grid min-h-56 place-items-center p-6 text-center">
      <div>
        <p className="font-medium text-[#4a2c1a]">{message}</p>
        {canReset ? (
          <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={onReset}>
            Reset filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ExceptionBadges({ keys, labels }: { keys: string[]; labels: Record<string, string> }) {
  if (keys.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((key) => (
        <span
          key={key}
          className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-950"
        >
          {labels[key] ?? key.replaceAll("_", " ")}
        </span>
      ))}
    </div>
  );
}

function ReadinessPill({ assigned, ready }: { assigned: boolean; ready: boolean }) {
  const label = assigned ? (ready ? "Ready" : "Not ready") : "Unassigned";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        !assigned && "bg-[#f1ede6] text-[#7A6B58]",
        assigned && ready && "bg-emerald-100 text-emerald-900",
        assigned && !ready && "bg-amber-100 text-amber-950",
      )}
    >
      {label}
    </span>
  );
}

const TABLE_HEAD = "border-b border-[#efe7d8] bg-[#faf7f1] text-xs font-semibold text-[#7A6B58]";

function ArrivalsTable({
  rows,
  selectedId,
  selectedIds,
  timezone,
  foAccess,
  onToggleSelect,
  onSelect,
  onAssign,
  onCheckIn,
}: {
  rows: ArrivalRow[];
  selectedId: string | null;
  selectedIds: string[];
  timezone: string;
  foAccess: FrontOfficeDeskAccess;
  onToggleSelect: (id: string, checked: boolean) => void;
  onSelect: (row: ArrivalRow) => void;
  onAssign: (row: ArrivalRow) => void;
  onCheckIn: (row: ArrivalRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="w-10 px-3 py-2.5">
              <span className="sr-only">Select</span>
            </th>
            <th className="px-3 py-2.5 font-semibold">Guest</th>
            <th className="px-3 py-2.5 font-semibold">Stay</th>
            <th className="px-3 py-2.5 font-semibold">Room</th>
            <th className="px-3 py-2.5 font-semibold">ETA</th>
            <th className="px-3 py-2.5 font-semibold">Status</th>
            <th className="px-3 py-2.5 font-semibold">Exceptions</th>
            <th className="px-3 py-2.5 text-right font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.reservationId}
              className={cn(
                "cursor-pointer border-b border-[#efe7d8] last:border-b-0 hover:bg-[#faf7f1]",
                selectedId === row.reservationId && "bg-[#f5ead0]/60",
              )}
              onClick={() => onSelect(row)}
            >
              <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.includes(row.reservationId)}
                  onCheckedChange={(value) => onToggleSelect(row.reservationId, value === true)}
                  aria-label={`Select ${row.confirmationNumber}`}
                />
              </td>
              <td className="px-3 py-2.5">
                <p className="flex items-center gap-1 font-semibold text-[#4a2c1a]">
                  {row.guest.name}
                  {row.guest.vip ? <VipBadge /> : null}
                </p>
                <p className="text-[11px] text-[#7A6B58]">{row.confirmationNumber}</p>
              </td>
              <td className="px-3 py-2.5 text-[#7A6B58]">
                {formatStayDate(row.stay.arrivalDate)} → {formatStayDate(row.stay.departureDate)}
              </td>
              <td className="px-3 py-2.5">
                <p className="font-medium text-[#4a2c1a]">{row.room.roomNumber ?? "—"}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <ReadinessPill assigned={row.room.assigned} ready={row.room.ready} />
                  <span className="truncate text-[11px] text-[#7A6B58]">
                    {row.room.roomTypeName}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2.5">
                {formatClockInZone(row.operational.expectedArrivalTime, timezone)}
              </td>
              <td className="px-3 py-2.5">
                <ReservationStatusBadge status={row.stay.status} />
              </td>
              <td className="px-3 py-2.5">
                <ExceptionBadges
                  keys={row.operational.exceptionKeys}
                  labels={ARRIVAL_EXCEPTION_LABELS}
                />
              </td>
              <td className="px-3 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
                <div className="flex justify-end gap-1.5">
                  {foAccess.canCheckIn && row.hints.canCheckIn ? (
                    <Button
                      size="sm"
                      className="rounded-full bg-[#C89933] text-xs font-bold text-[#251605] hover:bg-[#B98B2D]"
                      onClick={() => onCheckIn(row)}
                    >
                      Check in
                    </Button>
                  ) : foAccess.canAssignRoom && row.hints.canAssignRoom ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full border-[#e9dfd0] text-xs font-semibold text-[#4a2c1a] hover:bg-[#f5ead0]"
                      onClick={() => onAssign(row)}
                    >
                      Assign room
                    </Button>
                  ) : null}
                  {row.hints.canOpen ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full text-xs font-semibold text-[#4a2c1a]"
                      onClick={() => onSelect(row)}
                    >
                      Open
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeparturesTable({
  rows,
  selectedId,
  timezone,
  currencyCode,
  onSelect,
  onOpen,
  onCheckOut,
}: {
  rows: DepartureRow[];
  selectedId: string | null;
  timezone: string;
  currencyCode: string;
  onSelect: (row: DepartureRow) => void;
  onOpen: (id: string) => void;
  onCheckOut: (row: DepartureRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2.5 font-semibold">Guest</th>
            <th className="px-3 py-2.5 font-semibold">Room</th>
            <th className="px-3 py-2.5 font-semibold">Departure</th>
            <th className="px-3 py-2.5 font-semibold">Balance</th>
            <th className="px-3 py-2.5 font-semibold">Late checkout</th>
            <th className="px-3 py-2.5 font-semibold">Status</th>
            <th className="px-3 py-2.5 font-semibold">Exceptions</th>
            <th className="px-3 py-2.5 text-right font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.reservationId}
              className={cn(
                "cursor-pointer border-b border-[#efe7d8] last:border-b-0 hover:bg-[#faf7f1]",
                selectedId === row.reservationId && "bg-[#f5ead0]/60",
              )}
              onClick={() => onSelect(row)}
            >
              <td className="px-3 py-2.5">
                <p className="flex items-center gap-1 font-semibold text-[#4a2c1a]">
                  {row.guest.name}
                  {row.guest.vip ? <VipBadge /> : null}
                </p>
                <p className="text-[11px] text-[#7A6B58]">{row.confirmationNumber}</p>
              </td>
              <td className="px-3 py-2.5">
                <p className="font-medium text-[#4a2c1a]">{row.room.roomNumber ?? "—"}</p>
                <p className="text-[11px] text-[#7A6B58]">{row.room.roomTypeName}</p>
              </td>
              <td className="px-3 py-2.5">{formatStayDate(row.stay.departureDate)}</td>
              <td className="px-3 py-2.5">{financialLabel(row.financial, currencyCode)}</td>
              <td className="px-3 py-2.5">
                {row.operational.lateCheckout.granted
                  ? formatClockInZone(row.operational.lateCheckout.until, timezone)
                  : "—"}
              </td>
              <td className="px-3 py-2.5">
                <ReservationStatusBadge status={row.stay.status} />
              </td>
              <td className="px-3 py-2.5">
                <ExceptionBadges
                  keys={row.operational.exceptionKeys}
                  labels={DEPARTURE_EXCEPTION_LABELS}
                />
              </td>
              <td className="px-3 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
                <div className="flex justify-end gap-1.5">
                  {row.hints.canCheckOut ? (
                    <Button
                      size="sm"
                      className="rounded-full bg-[#C89933] text-xs font-bold text-[#251605] hover:bg-[#B98B2D]"
                      onClick={() => onCheckOut(row)}
                    >
                      Check out
                    </Button>
                  ) : null}
                  {row.hints.canOpen ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full text-xs font-semibold text-[#4a2c1a]"
                      onClick={() => onOpen(row.reservationId)}
                    >
                      Open
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuickViewShell({
  children,
  "data-testid": testId,
}: {
  children: ReactNode;
  "data-testid": string;
}) {
  return (
    <div
      className="rounded-2xl border border-[#e9dfd0] bg-white p-4 shadow-sm"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function DepartureQuickView({
  row,
  timezone,
  currencyCode,
  foAccess,
  onOpen,
  onCheckOut,
  onExtend,
  onLate,
}: {
  row: DepartureRow | null;
  timezone: string;
  currencyCode: string;
  foAccess: FrontOfficeDeskAccess;
  onOpen: (id: string) => void;
  onCheckOut: (row: DepartureRow) => void;
  onExtend: (row: DepartureRow) => void;
  onLate: (row: DepartureRow) => void;
}) {
  if (!row) {
    return (
      <QuickViewShell data-testid="departure-quick-view">
        <p className="text-sm text-[#7A6B58]">
          Select a departure to see the balance, late checkout and actions.
        </p>
      </QuickViewShell>
    );
  }
  const late = row.operational.lateCheckout;
  return (
    <QuickViewShell data-testid="departure-quick-view">
      <p className="flex items-center gap-2 font-display text-lg text-[#4a2c1a]">
        <Users className="size-4 text-[#c9a24a]" />
        {row.guest.name}
        {row.guest.vip ? <VipBadge /> : null}
      </p>
      <p className="text-xs text-[#7A6B58]">{row.confirmationNumber}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <Field label="Departure" value={formatStayDate(row.stay.departureDate)} />
        <Field label="In-house" value={row.stay.inHouse ? "Yes" : "No"} />
        <Field label="Overstay" value={row.stay.overstay ? "Yes" : "No"} />
        <Field label="Room" value={row.room.roomNumber ?? "—"} />
        <Field label="Housekeeping" value={row.room.housekeepingStatus ?? "—"} />
        <Field label="Balance" value={financialLabel(row.financial, currencyCode)} />
        <Field
          label="Deposit"
          value={
            row.financial.state !== "available"
              ? financialLabel(row.financial, currencyCode)
              : row.financial.depositWaived
                ? "Waived"
                : row.financial.depositPosted == null
                  ? "—"
                  : formatMoney(row.financial.depositPosted, currencyCode)
          }
        />
        <Field
          label="Late checkout"
          value={late.granted ? formatClockInZone(late.until, timezone) : "Not granted"}
        />
        <Field label="Special requests" value={row.operational.specialRequests ?? "—"} />
      </dl>
      <div className="mt-3">
        <ExceptionBadges keys={row.operational.exceptionKeys} labels={DEPARTURE_EXCEPTION_LABELS} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {row.hints.canOpen ? (
          <Button
            size="sm"
            className="rounded-full bg-[#C89933] font-bold text-[#251605] hover:bg-[#B98B2D]"
            onClick={() => onOpen(row.reservationId)}
          >
            Open Reservation
          </Button>
        ) : null}
        {foAccess.canCheckOut && row.hints.canCheckOut ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-[#e9dfd0]"
            onClick={() => onCheckOut(row)}
          >
            Check out
          </Button>
        ) : null}
        {foAccess.canStayEdit && row.hints.canExtendStay ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-[#e9dfd0]"
            onClick={() => onExtend(row)}
          >
            Extend Stay
          </Button>
        ) : null}
        {foAccess.canStayEdit && row.hints.canGrantLateCheckout ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-[#e9dfd0]"
            onClick={() => onLate(row)}
          >
            Grant Late Checkout
          </Button>
        ) : null}
        {row.hints.canOpenFolio ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-[#e9dfd0]"
            onClick={() => onOpen(row.reservationId)}
          >
            Open folio
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full"
          onClick={() => onOpen(row.reservationId)}
        >
          History
        </Button>
      </div>
    </QuickViewShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#7A6B58]">{label}</dt>
      <dd className="text-right text-[#4a2c1a]">{value}</dd>
    </div>
  );
}
