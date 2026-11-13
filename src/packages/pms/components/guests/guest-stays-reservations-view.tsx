import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { useOptionalGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
import {
  PmsFilterChoiceRow,
  PmsFilterMenu,
  PmsFilterNoteRow,
} from "@/packages/pms/components/pms-filter-menu";
import { PMS_FILTER_DATE } from "@/packages/pms/components/pms-filter-popover";
import { GuestStayActions } from "@/packages/pms/components/guests/guest-stay-actions";
import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import {
  GUEST_BOOKINGS_COPY,
  GUEST_BOOKINGS_EMPTY,
  GUEST_BOOKINGS_PAGE_SIZE,
  GUEST_BOOKINGS_TITLE,
  RESERVATION_STATUSES,
  canCreateGuestStayReservation,
  bookingRowActions,
  bookingTimelineLabel,
  filterGuestBookings,
  guestBookingsCsv,
  paginateGuestBookings,
  pickActiveBooking,
  stayNumberForBooking,
  type GuestBookingFilters,
  type ReservationStatus,
} from "@/packages/pms/lib/guest-bookings-workspace";
import {
  isInHouseStay,
  isUpcomingStay,
  stayRoomNumberLabel,
  type GuestStay,
} from "@/packages/pms/lib/guest-profile-wave3";
import {
  getGuestBookingDetail,
  listGuestStays,
} from "@/packages/pms/lib/guests.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

type QuickScope = "all" | "upcoming" | "in_house" | "past";

const STAY_SCOPE_OPTIONS = [
  ["all", "All stays"],
  ["upcoming", "Upcoming"],
  ["in_house", "In-house"],
  ["past", "Past"],
] as const;

const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  checked_in: "In-house",
  checked_out: "Checked out",
  no_show: "No-show",
};

const STATUS_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["all", "All statuses"],
  ...RESERVATION_STATUSES.map((status) => [status, STATUS_LABELS[status]] as const),
];

export function GuestStaysReservationsView({
  restaurantId,
  guestId,
  guestName,
  guestProfileNumber,
  timezone,
  onOpenFinancial,
}: {
  restaurantId: string;
  guestId: string;
  guestName: string;
  guestProfileNumber?: string | null;
  timezone: string;
  onOpenFinancial?: () => void;
}) {
  const navigate = useNavigate();
  const fetchStays = useServerFn(listGuestStays);
  const fetchDetail = useServerFn(getGuestBookingDetail);
  const profileActions = useOptionalGuestProfileActions();
  const today = propertyToday(timezone);

  const [scope, setScope] = useState<QuickScope>("all");
  const [filters, setFilters] = useState<GuestBookingFilters>({
    search: "",
    status: "all",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [selectedStayId, setSelectedStayId] = useState<string | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  const staysQuery = useQuery({
    queryKey: ["guest-stays", restaurantId, guestId],
    queryFn: () => fetchStays({ data: { restaurantId, guestId } }),
    retry: false,
  });

  const allStays = staysQuery.data?.stays ?? [];
  const access = staysQuery.data?.access ?? {
    reservation: false,
    frontOffice: false,
    folio: false,
  };

  // Scope filter applied on top of stay rows
  const scopedStays = useMemo(() => {
    if (scope === "upcoming") {
      return allStays.filter((s) => s.arrivalDate >= today && s.status !== "cancelled");
    }
    if (scope === "in_house") {
      return allStays.filter((s) => s.status === "checked_in");
    }
    if (scope === "past") {
      return allStays.filter((s) => s.departureDate < today || s.status === "checked_out");
    }
    return allStays;
  }, [allStays, scope, today]);

  const filtered = useMemo(() => filterGuestBookings(scopedStays, filters), [scopedStays, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / GUEST_BOOKINGS_PAGE_SIZE));
  const paged = paginateGuestBookings(filtered, Math.min(page, pageCount));

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.status, filters.from, filters.to, scope]);

  // Selected reservation quick detail query
  const selectedStay = allStays.find((s) => s.id === selectedStayId) ?? null;
  const detailQuery = useQuery({
    queryKey: ["guest-booking-detail", restaurantId, guestId, selectedStayId],
    queryFn: () =>
      fetchDetail({
        data: { restaurantId, guestId, reservationId: selectedStayId! },
      }),
    enabled: Boolean(selectedStayId && quickViewOpen),
    retry: false,
  });

  const canPrintExport = profileActions?.canPrintExport ?? false;

  function exportCsv() {
    if (!canPrintExport) return;
    const csv = guestBookingsCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `guest-stays-${guestId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleRowClick(stay: GuestStay) {
    setSelectedStayId(stay.id);
    setQuickViewOpen(true);
  }

  function clearMenuFilters() {
    setScope("all");
    setFilters((current) => ({ ...current, status: "all", from: "", to: "" }));
  }

  const filterCount =
    (scope !== "all" ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0);

  const scopeLabel = STAY_SCOPE_OPTIONS.find(([id]) => id === scope)?.[1] ?? "All stays";
  const filterChips = [
    scope !== "all"
      ? {
          id: "scope",
          label: `Stay: ${scopeLabel}`,
          onRemove: () => setScope("all"),
        }
      : null,
    filters.status !== "all"
      ? {
          id: "status",
          label: `Status: ${STATUS_LABELS[filters.status]}`,
          onRemove: () => setFilters((current) => ({ ...current, status: "all" })),
        }
      : null,
    filters.from
      ? {
          id: "from",
          label: `From: ${filters.from}`,
          onRemove: () => setFilters((current) => ({ ...current, from: "" })),
        }
      : null,
    filters.to
      ? {
          id: "to",
          label: `To: ${filters.to}`,
          onRemove: () => setFilters((current) => ({ ...current, to: "" })),
        }
      : null,
  ].filter((chip): chip is { id: string; label: string; onRemove: () => void } => chip !== null);

  const hasActiveFilters = filters.search.trim() !== "" || filterCount > 0;

  return (
    <div className="space-y-4" data-testid="guest-stay-history">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search confirmation, room, rate plan, source…"
            className="h-9 pl-8 pr-8 text-xs"
            value={filters.search}
            onChange={(e) => setFilters((curr) => ({ ...curr, search: e.target.value }))}
            aria-label="Search stays"
          />
          {filters.search ? (
            <button
              type="button"
              onClick={() => setFilters((current) => ({ ...current, search: "" }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <PmsFilterMenu
          activeCount={filterCount}
          onClear={clearMenuFilters}
          buttonTestId="guest-stays-filter-button"
          menuTestId="guest-stays-filter-menu"
        >
          <PmsFilterChoiceRow
            label="Stay"
            value={scope}
            current={scope === "all" ? "" : scopeLabel}
            options={STAY_SCOPE_OPTIONS}
            onChange={(value) => setScope(value as QuickScope)}
          />
          <PmsFilterChoiceRow
            label="Status"
            value={filters.status}
            current={filters.status === "all" ? "" : STATUS_LABELS[filters.status]}
            options={STATUS_OPTIONS}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                status: value as ReservationStatus | "all",
              }))
            }
          />
          <PmsFilterNoteRow label="Stay dates">
            <div className="grid gap-2" onKeyDown={(event) => event.stopPropagation()}>
              <label className="grid gap-1 text-[11px] font-medium text-[#7A6B58]">
                From
                <Input
                  type="date"
                  className={PMS_FILTER_DATE}
                  value={filters.from}
                  aria-label="Stay dates from"
                  data-testid="guest-bookings-from"
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, from: event.target.value }))
                  }
                  onKeyDown={(event) => event.stopPropagation()}
                />
              </label>
              <label className="grid gap-1 text-[11px] font-medium text-[#7A6B58]">
                To
                <Input
                  type="date"
                  className={PMS_FILTER_DATE}
                  value={filters.to}
                  aria-label="Stay dates to"
                  data-testid="guest-bookings-to"
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, to: event.target.value }))
                  }
                  onKeyDown={(event) => event.stopPropagation()}
                />
              </label>
            </div>
          </PmsFilterNoteRow>
        </PmsFilterMenu>
        {canPrintExport ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={exportCsv}
            className="size-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]"
            aria-label="Export CSV"
            title="Export CSV"
          >
            <Download className="size-4" />
          </Button>
        ) : null}
        {canCreateGuestStayReservation(access) ? (
          <Button
            asChild
            className="h-9 shrink-0 bg-[#8A641A] text-xs font-medium text-white shadow-sm hover:bg-[#725215]"
          >
            <Link
              to="/restaurant/pms/reservations"
              search={{ create: "new", guestId }}
              data-testid="guest-bookings-new"
            >
              <CalendarPlus className="mr-1.5 size-3.5" /> New Reservation
            </Link>
          </Button>
        ) : null}
      </div>

      {filterChips.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-1.5 text-xs"
          data-testid="guest-stays-filter-chips"
        >
          {filterChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 rounded-md border border-[#E8E4DC] bg-[#FAF8F5] px-2 py-0.5 font-medium text-[#251605]"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="text-[#7A6B58] hover:text-[#251605]"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearMenuFilters}
            className="ml-1 text-xs font-semibold text-[#8C6D23] hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {/* Dense Operational Table */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white shadow-sm overflow-hidden">
        {staysQuery.isLoading ? (
          <div className="p-8 text-center text-xs text-[#756A5B] flex items-center justify-center gap-2">
            <RefreshCw className="size-3.5 animate-spin text-[#8A641A]" />
            <span>Loading reservation history…</span>
          </div>
        ) : staysQuery.isError ? (
          <div className="p-8 text-center text-xs text-rose-600">
            Failed to load reservations for this guest.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-xs font-medium text-[#251605]">
              {hasActiveFilters ? "No reservations match the filters." : GUEST_BOOKINGS_EMPTY}
            </p>
            <p className="text-[11px] text-[#756A5B]">
              {hasActiveFilters
                ? "Try clearing filters to see past or future bookings."
                : "Create a reservation to record this guest's first stay."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="guest-bookings-table">
              <thead className="bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] border-b border-[#DDD4C5]">
                <tr>
                  <th className="px-3.5 py-2.5">Confirmation</th>
                  <th className="px-3.5 py-2.5">Arrival</th>
                  <th className="px-3.5 py-2.5">Departure</th>
                  <th className="px-3.5 py-2.5">Nights</th>
                  <th className="px-3.5 py-2.5">Room Type / Room</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5">Source</th>
                  <th className="px-3.5 py-2.5">Rate Plan</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD4C5]">
                {paged.map((stay) => {
                  const isSelected = selectedStayId === stay.id;
                  return (
                    <tr
                      key={stay.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-[#F7F4EE]/60",
                        isSelected ? "bg-[#FBF7EE]" : "bg-white",
                      )}
                      data-testid="guest-stay-row"
                      onClick={() => handleRowClick(stay)}
                    >
                      <td className="px-3.5 py-2.5 font-medium text-[#251605]">
                        {stay.confirmationNumber}
                      </td>
                      <td className="px-3.5 py-2.5 text-[#251605]">
                        {formatStayDate(stay.arrivalDate)}
                      </td>
                      <td className="px-3.5 py-2.5 text-[#251605]">
                        {formatStayDate(stay.departureDate)}
                      </td>
                      <td className="px-3.5 py-2.5 text-[#756A5B]">{stay.nights}</td>
                      <td className="px-3.5 py-2.5 text-[#251605]">
                        <span className="font-medium">{stay.roomTypeName}</span>
                        {stay.roomNumber ? (
                          <span className="text-[#756A5B] ml-1">· Room {stay.roomNumber}</span>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <ReservationStatusBadge status={stay.status} />
                      </td>
                      <td className="px-3.5 py-2.5 text-[#756A5B]">
                        {stay.sourceLabel ?? "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-[#756A5B]">
                        {stay.ratePlanName ?? "—"}
                      </td>
                      <td
                        className="px-3.5 py-2.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GuestStayActions
                          stay={stay}
                          access={access}
                          today={today}
                          size="sm"
                          presentation="menu"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-[#DDD4C5] px-4 py-2 text-xs text-[#756A5B]">
            <div>
              Showing {Math.min(filtered.length, (page - 1) * GUEST_BOOKINGS_PAGE_SIZE + 1)} to{" "}
              {Math.min(filtered.length, page * GUEST_BOOKINGS_PAGE_SIZE)} of {filtered.length} stays
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-7 w-7 p-0 border-[#DDD4C5]"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="px-2 font-medium text-[#251605]">
                {page} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 w-7 p-0 border-[#DDD4C5]"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Right-Side Quick View Drawer */}
      <Sheet open={quickViewOpen} onOpenChange={setQuickViewOpen}>
        <SheetContent className="w-full sm:max-w-md border-l border-[#DDD4C5] bg-white p-0 text-[#251605]">
          {selectedStay ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-[#DDD4C5] p-4 text-left bg-[#FAF8F5]">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="border-[#DDD4C5] text-[10px] text-[#756A5B]">
                    Stay Quick View
                  </Badge>
                  <ReservationStatusBadge status={selectedStay.status} />
                </div>
                <SheetTitle className="font-display text-base font-semibold text-[#251605] mt-1">
                  Conf #{selectedStay.confirmationNumber}
                </SheetTitle>
                <SheetDescription className="text-xs text-[#756A5B]">
                  {formatStayDate(selectedStay.arrivalDate)} → {formatStayDate(selectedStay.departureDate)} ({selectedStay.nights} nights)
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                {/* Stay Details */}
                <div className="rounded-lg border border-[#DDD4C5] p-3 space-y-2">
                  <h4 className="font-semibold text-[#251605]">Reservation Information</h4>
                  <div className="grid grid-cols-2 gap-2 text-[#756A5B]">
                    <div>
                      <span>Room Type:</span>
                      <p className="font-medium text-[#251605]">{selectedStay.roomTypeName}</p>
                    </div>
                    <div>
                      <span>Room Number:</span>
                      <p className="font-medium text-[#251605]">{selectedStay.roomNumber ?? "Not assigned"}</p>
                    </div>
                    <div>
                      <span>Rate Plan:</span>
                      <p className="font-medium text-[#251605]">{selectedStay.ratePlanName ?? "—"}</p>
                    </div>
                    <div>
                      <span>Source:</span>
                      <p className="font-medium text-[#251605]">{selectedStay.sourceLabel ?? "—"}</p>
                    </div>
                    <div>
                      <span>Adults / Children:</span>
                      <p className="font-medium text-[#251605]">
                        {selectedStay.adults} Adults, {selectedStay.children} Children
                      </p>
                    </div>
                    <div>
                      <span>Quoted Total:</span>
                      <p className="font-medium text-[#251605]">
                        {selectedStay.roomSubtotal != null
                          ? `${selectedStay.currency ?? "ETB"} ${selectedStay.roomSubtotal}`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Timeline Events if loaded */}
                <div className="rounded-lg border border-[#DDD4C5] p-3 space-y-2">
                  <h4 className="font-semibold text-[#251605]">Timeline & Activity</h4>
                  {detailQuery.isLoading ? (
                    <p className="text-[11px] text-[#756A5B]">Loading timeline…</p>
                  ) : detailQuery.data?.events && detailQuery.data.events.length > 0 ? (
                    <ul className="space-y-1.5">
                      {detailQuery.data.events.map((evt) => (
                        <li key={evt.id} className="flex items-start justify-between text-[11px]">
                          <span className="text-[#251605]">{bookingTimelineLabel(evt.eventKind)}</span>
                          <span className="text-[#756A5B]">{formatStayDate(evt.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-[#756A5B]">No detailed events recorded.</p>
                  )}
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="border-t border-[#DDD4C5] p-4 bg-[#FAF8F5] flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickViewOpen(false)}
                  className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B]"
                >
                  Close
                </Button>

                <Button
                  asChild
                  size="sm"
                  className="h-8 text-xs bg-[#8A641A] hover:bg-[#725215] text-white font-medium"
                >
                  <Link
                    to="/restaurant/pms/reservations"
                    search={{ tab: "individual" }}
                    onClick={() => setQuickViewOpen(false)}
                  >
                    Open in Reservations <ExternalLink className="ml-1 size-3" />
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

