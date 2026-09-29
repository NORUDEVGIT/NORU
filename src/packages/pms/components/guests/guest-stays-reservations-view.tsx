import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { useOptionalGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

type QuickScope = "all" | "upcoming" | "in_house" | "past";

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

  // KPI Metrics for Summary Strip
  const upcomingCount = allStays.filter((s) => s.arrivalDate >= today && s.status !== "cancelled").length;
  const inHouseCount = allStays.filter((s) => s.status === "checked_in").length;
  const pastCount = allStays.filter((s) => s.departureDate < today || s.status === "checked_out").length;
  const cancelledCount = allStays.filter((s) => s.status === "cancelled" || s.status === "no_show").length;
  const totalNights = allStays.reduce((sum, s) => sum + (s.nights || 0), 0);

  function exportCsv() {
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

  function clearFilters() {
    setScope("all");
    setFilters({ search: "", status: "all", from: "", to: "" });
  }

  const hasActiveFilters =
    scope !== "all" ||
    filters.search.trim() !== "" ||
    filters.status !== "all" ||
    filters.from !== "" ||
    filters.to !== "";

  return (
    <div className="space-y-4" data-testid="guest-stay-history">
      {/* 5-Cell Summary Strip matching Reservations Workspace */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-medium text-[#756A5B] uppercase tracking-wider">Upcoming</p>
          <p className="mt-0.5 font-display text-lg font-semibold text-[#251605]">{upcomingCount}</p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-medium text-[#756A5B] uppercase tracking-wider">In-House</p>
          <p className="mt-0.5 font-display text-lg font-semibold text-[#8A641A]">{inHouseCount}</p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-medium text-[#756A5B] uppercase tracking-wider">Past Stays</p>
          <p className="mt-0.5 font-display text-lg font-semibold text-[#251605]">{pastCount}</p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-medium text-[#756A5B] uppercase tracking-wider">Cancelled / No-show</p>
          <p className="mt-0.5 font-display text-lg font-semibold text-[#756A5B]">{cancelledCount}</p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2.5 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[10px] font-medium text-[#756A5B] uppercase tracking-wider">Total Nights</p>
          <p className="mt-0.5 font-display text-lg font-semibold text-[#251605]">{totalNights}</p>
        </div>
      </div>

      {/* Scope Switcher + Operational Toolbar */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm space-y-3">
        {/* Scope Pill Views */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-2.5">
          <div className="flex items-center gap-1.5" role="tablist">
            {(
              [
                { id: "all", label: "All Stays" },
                { id: "upcoming", label: "Upcoming" },
                { id: "in_house", label: "Current / In-House" },
                { id: "past", label: "Past" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScope(tab.id)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  scope === tab.id
                    ? "bg-[#C89933]/15 text-[#8A641A] font-semibold"
                    : "text-[#756A5B] hover:bg-[#F7F4EE] hover:text-[#251605]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B] hover:bg-[#F7F4EE]"
            >
              <Download className="mr-1.5 size-3.5" /> Export CSV
            </Button>
            <Button
              asChild
              size="sm"
              className="h-8 text-xs bg-[#8A641A] hover:bg-[#725215] text-white shadow-sm font-medium transition-colors"
            >
              <Link
                to="/restaurant/pms/reservations"
                search={{ create: "new", guestId }}
                data-testid="guest-bookings-new"
              >
                <CalendarPlus className="mr-1.5 size-3.5" /> + New Reservation
              </Link>
            </Button>
          </div>
        </div>

        {/* Dense Filters Bar */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-5 items-center">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
            <Input
              placeholder="Search confirmation, room, rate plan, source…"
              className="h-8 pl-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
              value={filters.search}
              onChange={(e) => setFilters((curr) => ({ ...curr, search: e.target.value }))}
            />
          </div>

          <div>
            <Select
              value={filters.status}
              onValueChange={(val) =>
                setFilters((curr) => ({ ...curr, status: val as ReservationStatus | "all" }))
              }
            >
              <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                <SelectItem value="all">All Statuses</SelectItem>
                {RESERVATION_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
              value={filters.from}
              onChange={(e) => setFilters((curr) => ({ ...curr, from: e.target.value }))}
              data-testid="guest-bookings-from"
            />
            <span className="text-[10px] text-[#756A5B]">to</span>
            <Input
              type="date"
              className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
              value={filters.to}
              onChange={(e) => setFilters((curr) => ({ ...curr, to: e.target.value }))}
              data-testid="guest-bookings-to"
            />
          </div>

          <div className="flex justify-end">
            {hasActiveFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 text-xs text-[#756A5B] hover:text-[#251605]"
              >
                <X className="mr-1 size-3" /> Clear
              </Button>
            ) : null}
          </div>
        </div>
      </div>

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
                        <GuestStayActions stay={stay} access={access} today={today} size="sm" />
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
