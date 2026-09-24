import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  ClipboardList,
  LogIn,
  LogOut,
  TriangleAlert,
  Users,
} from "lucide-react";

import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  AssignRoomDialog,
  CheckInDialog,
  CheckOutDialog,
  NoShowDialog,
  StayDatesDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import {
  BulkExpectedArrivalDialog,
  ExpectedArrivalDialog,
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

type Mode = "arrivals" | "departures";
type FoKind = "assign_room" | "check_in" | "check_out" | "no_show" | "extend_stay";

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

function financialLabel(
  financial: ArrivalRow["financial"],
  currency: string,
): string {
  if (financial.state === "permission_denied") return "Permission denied";
  if (financial.state !== "available") return "Coming soon";
  if (financial.balance != null) return formatMoney(financial.balance, currency);
  if (financial.folioId) return "Folio open";
  return "No folio";
}

export function ArrivalsDeparturesWorkspace({
  restaurantId,
  timezone,
  currencyCode,
  canManage,
  onOpenReservation,
}: {
  restaurantId: string;
  timezone: string;
  currencyCode: string;
  canManage: boolean;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedArrivalIds, setSelectedArrivalIds] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [etaRow, setEtaRow] = useState<ArrivalRow | null>(null);
  const [bulkEtaOpen, setBulkEtaOpen] = useState(false);
  const [lateRow, setLateRow] = useState<DepartureRow | null>(null);
  const [foAction, setFoAction] = useState<{ kind: FoKind; stay: FrontOfficeStay } | null>(null);

  const roomTypesQuery = useQuery({
    queryKey: ["pms-ad-room-types", restaurantId],
    queryFn: () => loadRoomTypes({ data: { restaurantId, includeInactive: false } }),
    staleTime: 5 * 60_000,
  });

  const snapshotQuery = useQuery({
    queryKey: [
      "pms-arrivals-departures",
      restaurantId,
      date,
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
          date: date || undefined,
          vip: vip || undefined,
          assignment: assignment === "all" ? undefined : assignment,
          roomTypeId: roomTypeId === "all" ? undefined : roomTypeId,
          arrivalStatus: arrivalStatus === "all" ? undefined : arrivalStatus,
          overstay: overstay || undefined,
          departureStatus: departureStatus === "all" ? undefined : departureStatus,
        },
      }) as Promise<ReservationArrivalsDeparturesSnapshot>,
    placeholderData: keepPreviousData,
  });

  const snapshot = snapshotQuery.data;
  useEffect(() => {
    if (!date && snapshot?.businessDate) setDate(snapshot.businessDate);
  }, [date, snapshot?.businessDate]);

  const arrivals = snapshot?.arrivals ?? [];
  const departures = snapshot?.departures ?? [];
  const selectedArrival = arrivals.find((row) => row.reservationId === selectedId) ?? null;
  const selectedDeparture = departures.find((row) => row.reservationId === selectedId) ?? null;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-arrivals-departures", restaurantId] });
  }

  function selectArrival(row: ArrivalRow) {
    setSelectedId(row.reservationId);
    setMobileOpen(true);
  }

  function selectDeparture(row: DepartureRow) {
    setSelectedId(row.reservationId);
    setMobileOpen(true);
  }

  function openStay(id: string) {
    setMobileOpen(false);
    onOpenReservation(id);
  }

  const totals = snapshot?.totals;
  const kpis = useMemo(
    () =>
      totals
        ? [
            { label: "Arrivals", value: totals.arrivals, icon: <LogIn className="size-4" /> },
            { label: "Departures", value: totals.departures, icon: <LogOut className="size-4" /> },
            { label: "Unassigned Arrivals", value: totals.unassignedArrivals, icon: <BedDouble className="size-4" /> },
            { label: "Not Ready", value: totals.notReadyArrivals, icon: <TriangleAlert className="size-4" /> },
            { label: "Arrival Exceptions", value: totals.arrivalExceptions, icon: <AlertTriangle className="size-4" /> },
            { label: "Departure Exceptions", value: totals.departureExceptions, icon: <AlertTriangle className="size-4" /> },
            { label: "Overstays", value: totals.overstays, icon: <CalendarDays className="size-4" /> },
            { label: "Financial Issues", value: totals.departurePaymentIssues, icon: <ClipboardList className="size-4" /> },
          ]
        : [],
    [totals],
  );

  return (
    <div className="space-y-4" data-testid="arrivals-departures-workspace">
      <section className="flex flex-wrap items-center gap-2" aria-label="Arrivals or departures">
        <ModeButton active={mode === "arrivals"} onClick={() => setMode("arrivals")}>
          Arrivals
        </ModeButton>
        <ModeButton active={mode === "departures"} onClick={() => setMode("departures")}>
          Departures
        </ModeButton>
        <p className="text-xs text-muted-foreground">
          Business date {snapshot?.businessDate ?? "—"}
        </p>
      </section>

      <section
        className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8"
        aria-label="Daily arrival and departure control"
      >
        {snapshotQuery.isLoading && !snapshot
          ? Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)
          : kpis.map((kpi) => (
              <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} />
            ))}
      </section>

      <section className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            Operational date
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-label="Operational date"
              className="h-9 w-40"
            />
          </label>
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            Room type
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={roomTypeId}
              onChange={(event) => setRoomTypeId(event.target.value)}
              aria-label="Room type"
            >
              <option value="all">All room types</option>
              {(roomTypesQuery.data ?? []).map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          {mode === "arrivals" ? (
            <>
              <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
                Assignment
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={assignment}
                  onChange={(event) => setAssignment(event.target.value as typeof assignment)}
                  aria-label="Assignment"
                >
                  <option value="all">All</option>
                  <option value="assigned">Assigned</option>
                  <option value="unassigned">Unassigned</option>
                </select>
              </label>
              <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
                Status
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={arrivalStatus}
                  onChange={(event) => setArrivalStatus(event.target.value as typeof arrivalStatus)}
                  aria-label="Arrival status"
                >
                  <option value="all">Pending and confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox checked={vip} onCheckedChange={(value) => setVip(value === true)} />
                VIP only
              </label>
            </>
          ) : (
            <>
              <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
                Status
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={departureStatus}
                  onChange={(event) => setDepartureStatus(event.target.value as typeof departureStatus)}
                  aria-label="Departure status"
                >
                  <option value="all">Confirmed and in-house</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="checked_in">In-house</option>
                </select>
              </label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox checked={overstay} onCheckedChange={(value) => setOverstay(value === true)} />
                Overstay only
              </label>
            </>
          )}
        </div>
      </section>

      {mode === "arrivals" && selectedArrivalIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#DDD4C5] bg-white px-3 py-2">
          <p className="text-sm">{selectedArrivalIds.length} selected</p>
          <Button
            size="sm"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
            onClick={() => setBulkEtaOpen(true)}
          >
            Bulk expected arrival
          </Button>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
          {snapshotQuery.isError ? (
            <div className="space-y-2 p-4">
              <p className="text-sm text-destructive">
                {snapshotQuery.error instanceof Error
                  ? snapshotQuery.error.message
                  : "Could not load arrivals and departures."}
              </p>
              <Button variant="outline" size="sm" onClick={() => void snapshotQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : snapshotQuery.isLoading && !snapshot ? (
            <div className="space-y-2 p-4" aria-label="Loading arrivals and departures">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : mode === "arrivals" && arrivals.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No arrivals for these filters.</p>
          ) : mode === "departures" && departures.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No departures for these filters.</p>
          ) : mode === "arrivals" ? (
            <ArrivalsTable
              rows={arrivals}
              selectedId={selectedId}
              selectedIds={selectedArrivalIds}
              timezone={timezone}
              currencyCode={currencyCode}
              onToggleSelect={(id, checked) =>
                setSelectedArrivalIds((current) =>
                  checked ? [...new Set([...current, id])] : current.filter((value) => value !== id),
                )
              }
              onSelect={selectArrival}
              onOpen={openStay}
              onEta={setEtaRow}
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
              onExtend={(row) => setFoAction({ kind: "extend_stay", stay: stayFromDeparture(row) })}
              onLate={setLateRow}
            />
          )}
        </section>

        <aside className="hidden min-w-0 xl:block">
          {mode === "arrivals" ? (
            <ArrivalQuickView
              row={selectedArrival}
              timezone={timezone}
              currencyCode={currencyCode}
              canManage={canManage}
              onOpen={openStay}
              onEta={setEtaRow}
              onAssign={(row) => setFoAction({ kind: "assign_room", stay: stayFromArrival(row) })}
              onCheckIn={(row) => setFoAction({ kind: "check_in", stay: stayFromArrival(row) })}
            />
          ) : (
            <DepartureQuickView
              row={selectedDeparture}
              timezone={timezone}
              currencyCode={currencyCode}
              canManage={canManage}
              onOpen={openStay}
              onCheckOut={(row) => setFoAction({ kind: "check_out", stay: stayFromDeparture(row) })}
              onExtend={(row) => setFoAction({ kind: "extend_stay", stay: stayFromDeparture(row) })}
              onLate={setLateRow}
            />
          )}
        </aside>
      </div>

      <Sheet
        open={!desktop && mobileOpen && selectedId !== null}
        onOpenChange={setMobileOpen}
      >
        <SheetContent className="w-full overflow-y-auto p-4 sm:max-w-md xl:hidden">
          {mode === "arrivals" ? (
            <ArrivalQuickView
              row={selectedArrival}
              timezone={timezone}
              currencyCode={currencyCode}
              canManage={canManage}
              onOpen={openStay}
              onEta={setEtaRow}
              onAssign={(row) => setFoAction({ kind: "assign_room", stay: stayFromArrival(row) })}
              onCheckIn={(row) => setFoAction({ kind: "check_in", stay: stayFromArrival(row) })}
            />
          ) : (
            <DepartureQuickView
              row={selectedDeparture}
              timezone={timezone}
              currencyCode={currencyCode}
              canManage={canManage}
              onOpen={openStay}
              onCheckOut={(row) => setFoAction({ kind: "check_out", stay: stayFromDeparture(row) })}
              onExtend={(row) => setFoAction({ kind: "extend_stay", stay: stayFromDeparture(row) })}
              onLate={setLateRow}
            />
          )}
        </SheetContent>
      </Sheet>

      <ExpectedArrivalDialog
        restaurantId={restaurantId}
        timezone={timezone}
        row={etaRow}
        open={etaRow !== null}
        onOpenChange={(open) => {
          if (!open) setEtaRow(null);
        }}
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
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center rounded-md px-3 text-xs font-medium",
        active ? "bg-[#F4E9D0] text-[#251605]" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
        {icon}
      </div>
      <p className="mt-1 font-display text-xl tabular-nums">{value}</p>
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

function ArrivalsTable({
  rows,
  selectedId,
  selectedIds,
  timezone,
  currencyCode,
  onToggleSelect,
  onSelect,
  onOpen,
  onEta,
  onAssign,
  onCheckIn,
}: {
  rows: ArrivalRow[];
  selectedId: string | null;
  selectedIds: string[];
  timezone: string;
  currencyCode: string;
  onToggleSelect: (id: string, checked: boolean) => void;
  onSelect: (row: ArrivalRow) => void;
  onOpen: (id: string) => void;
  onEta: (row: ArrivalRow) => void;
  onAssign: (row: ArrivalRow) => void;
  onCheckIn: (row: ArrivalRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-[#F7F4EE] text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">
              <span className="sr-only">Select</span>
            </th>
            <th className="px-3 py-2">Guest / Reservation</th>
            <th className="px-3 py-2">Stay</th>
            <th className="px-3 py-2">Room</th>
            <th className="px-3 py-2">Readiness</th>
            <th className="px-3 py-2">ETA</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Exceptions</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.reservationId}
              className={cn(
                "cursor-pointer border-b border-border/70 hover:bg-[#F7F4EE]",
                selectedId === row.reservationId && "bg-[#F4E9D0]",
              )}
              onClick={() => onSelect(row)}
            >
              <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.includes(row.reservationId)}
                  onCheckedChange={(value) => onToggleSelect(row.reservationId, value === true)}
                  aria-label={`Select ${row.confirmationNumber}`}
                />
              </td>
              <td className="px-3 py-2">
                <p className="flex items-center gap-1 font-medium">
                  {row.guest.name}
                  {row.guest.vip ? <VipBadge /> : null}
                </p>
                <p className="text-[11px] text-muted-foreground">{row.confirmationNumber}</p>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatStayDate(row.stay.arrivalDate)} → {formatStayDate(row.stay.departureDate)}
              </td>
              <td className="px-3 py-2">
                <p>{row.room.roomNumber ?? "Unassigned"}</p>
                <p className="text-[11px] text-muted-foreground">{row.room.roomTypeName}</p>
              </td>
              <td className="px-3 py-2">{row.room.assigned ? (row.room.ready ? "Ready" : "Not ready") : "Unassigned"}</td>
              <td className="px-3 py-2">{formatClockInZone(row.operational.expectedArrivalTime, timezone)}</td>
              <td className="px-3 py-2">
                <ReservationStatusBadge status={row.stay.status} />
              </td>
              <td className="px-3 py-2">
                <ExceptionBadges keys={row.operational.exceptionKeys} labels={ARRIVAL_EXCEPTION_LABELS} />
              </td>
              <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                <div className="flex justify-end gap-1">
                  {row.hints.canOpen ? (
                    <Button size="sm" variant="outline" onClick={() => onOpen(row.reservationId)}>
                      Open
                    </Button>
                  ) : null}
                  {row.hints.canUpdateEta ? (
                    <Button size="sm" variant="outline" onClick={() => onEta(row)}>
                      ETA
                    </Button>
                  ) : null}
                  {row.hints.canAssignRoom ? (
                    <Button size="sm" variant="outline" onClick={() => onAssign(row)}>
                      Assign
                    </Button>
                  ) : null}
                  {row.hints.canCheckIn ? (
                    <Button size="sm" variant="outline" onClick={() => onCheckIn(row)}>
                      Check in
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sr-only">{currencyCode}</p>
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
  onExtend,
  onLate,
}: {
  rows: DepartureRow[];
  selectedId: string | null;
  timezone: string;
  currencyCode: string;
  onSelect: (row: DepartureRow) => void;
  onOpen: (id: string) => void;
  onCheckOut: (row: DepartureRow) => void;
  onExtend: (row: DepartureRow) => void;
  onLate: (row: DepartureRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-[#F7F4EE] text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Guest / Reservation</th>
            <th className="px-3 py-2">Room</th>
            <th className="px-3 py-2">Departure</th>
            <th className="px-3 py-2">Financial</th>
            <th className="px-3 py-2">Late Checkout</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Exceptions</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.reservationId}
              className={cn(
                "cursor-pointer border-b border-border/70 hover:bg-[#F7F4EE]",
                selectedId === row.reservationId && "bg-[#F4E9D0]",
              )}
              onClick={() => onSelect(row)}
            >
              <td className="px-3 py-2">
                <p className="flex items-center gap-1 font-medium">
                  {row.guest.name}
                  {row.guest.vip ? <VipBadge /> : null}
                </p>
                <p className="text-[11px] text-muted-foreground">{row.confirmationNumber}</p>
              </td>
              <td className="px-3 py-2">
                <p>{row.room.roomNumber ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">{row.room.roomTypeName}</p>
              </td>
              <td className="px-3 py-2">{formatStayDate(row.stay.departureDate)}</td>
              <td className="px-3 py-2">{financialLabel(row.financial, currencyCode)}</td>
              <td className="px-3 py-2">
                {row.operational.lateCheckout.granted
                  ? formatClockInZone(row.operational.lateCheckout.until, timezone)
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <ReservationStatusBadge status={row.stay.status} />
              </td>
              <td className="px-3 py-2">
                <ExceptionBadges keys={row.operational.exceptionKeys} labels={DEPARTURE_EXCEPTION_LABELS} />
              </td>
              <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                <div className="flex justify-end gap-1">
                  {row.hints.canOpen ? (
                    <Button size="sm" variant="outline" onClick={() => onOpen(row.reservationId)}>
                      Open
                    </Button>
                  ) : null}
                  {row.hints.canCheckOut ? (
                    <Button size="sm" variant="outline" onClick={() => onCheckOut(row)}>
                      Check out
                    </Button>
                  ) : null}
                  {row.hints.canExtendStay ? (
                    <Button size="sm" variant="outline" onClick={() => onExtend(row)}>
                      Extend
                    </Button>
                  ) : null}
                  {row.hints.canGrantLateCheckout ? (
                    <Button size="sm" variant="outline" onClick={() => onLate(row)}>
                      Late checkout
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

function ArrivalQuickView({
  row,
  timezone,
  currencyCode,
  canManage,
  onOpen,
  onEta,
  onAssign,
  onCheckIn,
}: {
  row: ArrivalRow | null;
  timezone: string;
  currencyCode: string;
  canManage: boolean;
  onOpen: (id: string) => void;
  onEta: (row: ArrivalRow) => void;
  onAssign: (row: ArrivalRow) => void;
  onCheckIn: (row: ArrivalRow) => void;
}) {
  if (!row) {
    return (
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm" data-testid="arrival-quick-view">
        <p className="text-sm text-muted-foreground">Select an arrival to view guest, room readiness, ETA and actions.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm" data-testid="arrival-quick-view">
      <p className="flex items-center gap-2 font-display text-lg">
        <Users className="size-4" />
        {row.guest.name}
        {row.guest.vip ? <VipBadge /> : null}
      </p>
      <p className="text-xs text-muted-foreground">{row.confirmationNumber}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <Field label="Stay" value={`${formatStayDate(row.stay.arrivalDate)} → ${formatStayDate(row.stay.departureDate)}`} />
        <Field label="Room" value={row.room.roomNumber ?? "Unassigned"} />
        <Field label="Room type" value={row.room.roomTypeName} />
        <Field label="Readiness" value={row.room.assigned ? (row.room.ready ? "Ready" : "Not ready") : "Unassigned"} />
        <Field label="ETA" value={formatClockInZone(row.operational.expectedArrivalTime, timezone)} />
        <Field label="Guarantee" value={row.commercial.guaranteeMethod ?? "—"} />
        <Field label="Financial" value={financialLabel(row.financial, currencyCode)} />
        <Field label="Contact" value={[row.guest.phone, row.guest.email].filter(Boolean).join(" · ") || "—"} />
        <Field label="Special requests" value={row.operational.specialRequests ?? "—"} />
      </dl>
      <div className="mt-3">
        <ExceptionBadges keys={row.operational.exceptionKeys} labels={ARRIVAL_EXCEPTION_LABELS} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {row.hints.canOpen ? (
          <Button size="sm" onClick={() => onOpen(row.reservationId)}>
            Open Reservation
          </Button>
        ) : null}
        {row.hints.canViewGuest ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/restaurant/pms/reservations/guests/$guestId" params={{ guestId: row.guest.id }}>
              View Guest
            </Link>
          </Button>
        ) : null}
        {canManage && row.hints.canAssignRoom ? (
          <Button size="sm" variant="outline" onClick={() => onAssign(row)}>
            Assign Room
          </Button>
        ) : null}
        {canManage && row.hints.canCheckIn ? (
          <Button size="sm" variant="outline" onClick={() => onCheckIn(row)}>
            Check In
          </Button>
        ) : null}
        {canManage && row.hints.canUpdateEta ? (
          <Button size="sm" variant="outline" onClick={() => onEta(row)}>
            Update ETA
          </Button>
        ) : null}
        {row.hints.canOpenFolio ? (
          <Button size="sm" variant="outline" onClick={() => onOpen(row.reservationId)}>
            Open Folio
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => onOpen(row.reservationId)}>
          History
        </Button>
      </div>
    </div>
  );
}

function DepartureQuickView({
  row,
  timezone,
  currencyCode,
  canManage,
  onOpen,
  onCheckOut,
  onExtend,
  onLate,
}: {
  row: DepartureRow | null;
  timezone: string;
  currencyCode: string;
  canManage: boolean;
  onOpen: (id: string) => void;
  onCheckOut: (row: DepartureRow) => void;
  onExtend: (row: DepartureRow) => void;
  onLate: (row: DepartureRow) => void;
}) {
  if (!row) {
    return (
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm" data-testid="departure-quick-view">
        <p className="text-sm text-muted-foreground">Select a departure to view folio context, late checkout and actions.</p>
      </div>
    );
  }
  const late = row.operational.lateCheckout;
  return (
    <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm" data-testid="departure-quick-view">
      <p className="flex items-center gap-2 font-display text-lg">
        {row.guest.name}
        {row.guest.vip ? <VipBadge /> : null}
      </p>
      <p className="text-xs text-muted-foreground">{row.confirmationNumber}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <Field label="Departure" value={formatStayDate(row.stay.departureDate)} />
        <Field label="In-house" value={row.stay.inHouse ? "Yes" : "No"} />
        <Field label="Overstay" value={row.stay.overstay ? "Yes" : "No"} />
        <Field label="Room" value={row.room.roomNumber ?? "—"} />
        <Field label="Housekeeping" value={row.room.housekeepingStatus ?? "—"} />
        <Field label="Financial" value={financialLabel(row.financial, currencyCode)} />
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
          <Button size="sm" onClick={() => onOpen(row.reservationId)}>
            Open Reservation
          </Button>
        ) : null}
        {canManage && row.hints.canCheckOut ? (
          <Button size="sm" variant="outline" onClick={() => onCheckOut(row)}>
            Check Out
          </Button>
        ) : null}
        {canManage && row.hints.canExtendStay ? (
          <Button size="sm" variant="outline" onClick={() => onExtend(row)}>
            Extend Stay
          </Button>
        ) : null}
        {canManage && row.hints.canGrantLateCheckout ? (
          <Button size="sm" variant="outline" onClick={() => onLate(row)}>
            Grant Late Checkout
          </Button>
        ) : null}
        {row.hints.canOpenFolio ? (
          <Button size="sm" variant="outline" onClick={() => onOpen(row.reservationId)}>
            Open Folio
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => onOpen(row.reservationId)}>
          History
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
