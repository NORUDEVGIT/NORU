import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar,
  CalendarDays,
  CalendarPlus,
  DoorOpen,
  ExternalLink,
  House,
  Receipt,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { listTravelAgentReservations } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { GUEST_CASHIERING_HREF } from "@/packages/pms/lib/guest-profile-wave3";
import { GUEST_PROFILE_DETAIL_PATH, guestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";
import { ReservationStatusBadge } from "@/packages/pms/components/bookings/reservation-bits";

export function GuestTravelAgentBookings({
  restaurantId,
  agencyId,
  canManage,
}: {
  restaurantId: string;
  agencyId: string;
  canManage?: boolean;
}) {
  const load = useServerFn(listTravelAgentReservations);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("all");
  const [ratePlanId, setRatePlanId] = useState("all");

  const query = useQuery({
    queryKey: ["travel-agent-bookings", restaurantId, agencyId, q, status, from, to, roomTypeId, ratePlanId],
    queryFn: () =>
      load({
        data: {
          restaurantId,
          agencyId,
          q,
          status,
          from: from || undefined,
          to: to || undefined,
          roomTypeId: roomTypeId === "all" ? undefined : roomTypeId,
          ratePlanId: ratePlanId === "all" ? undefined : ratePlanId,
        },
      }),
  });

  const items = query.data?.items ?? [];
  const pageItems = useMemo(() => items.slice(0, 100), [items]);

  // Derived KPI metrics
  const totalBookings = items.length;
  const inHouseCount = items.filter((r) => r.status === "checked_in").length;
  const upcomingCount = items.filter((r) => r.status === "confirmed" || r.status === "pending").length;
  const completedCount = items.filter((r) => r.status === "checked_out").length;
  const cancelledCount = items.filter((r) => r.status === "cancelled").length;
  const totalRoomNights = items.reduce((sum, r) => sum + (r.nights ?? 0), 0);

  function clearFilters() {
    setQ("");
    setStatus("all");
    setFrom("");
    setTo("");
    setRoomTypeId("all");
    setRatePlanId("all");
  }

  return (
    <div className="space-y-4" data-testid="travel-agent-bookings">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#251605]">Bookings</h2>
          <p className="text-xs text-[#756A5B]">
            Hotel reservations associated with this travel agency as booking agent or channel source.
          </p>
        </div>
        <Button
          asChild
          className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] text-xs font-medium"
          data-testid="travel-agent-bookings-new-reservation"
        >
          <Link to="/restaurant/pms/reservations" search={{ create: "new", travelAgentId: agencyId, travelAgentMasterId: agencyId }}>
            <CalendarPlus className="mr-1.5 size-3.5" />
            New Booking
          </Link>
        </Button>
      </div>

      {/* Summary Band */}
      <div className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-6 shadow-sm">
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Total</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">{totalBookings}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Upcoming</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#8A641A]">{upcomingCount}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">In-House</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#2E7D32]">{inHouseCount}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Completed</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#756A5B]">{completedCount}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Cancelled</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#C62828]">{cancelledCount}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Room Nights</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">{totalRoomNights}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="relative min-w-44 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
          <Input
            className="h-8 pl-8 text-xs border-[#DDD4C5] bg-[#FAF8F5]"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search guest or confirmation…"
            data-testid="travel-agent-bookings-search"
          />
        </div>

        <Input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="h-8 w-32 text-xs border-[#DDD4C5]"
          title="From Arrival Date"
        />

        <Input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="h-8 w-32 text-xs border-[#DDD4C5]"
          title="To Arrival Date"
        />

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-32 text-xs border-[#DDD4C5] bg-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
            <SelectItem value="pending" className="text-xs">Pending</SelectItem>
            <SelectItem value="confirmed" className="text-xs">Confirmed</SelectItem>
            <SelectItem value="checked_in" className="text-xs">In-House</SelectItem>
            <SelectItem value="checked_out" className="text-xs">Completed</SelectItem>
            <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={roomTypeId} onValueChange={setRoomTypeId}>
          <SelectTrigger className="h-8 w-36 text-xs border-[#DDD4C5] bg-white">
            <SelectValue placeholder="Room Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Room Types</SelectItem>
            {(query.data?.filters.roomTypes ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id} className="text-xs">{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ratePlanId} onValueChange={setRatePlanId}>
          <SelectTrigger className="h-8 w-36 text-xs border-[#DDD4C5] bg-white">
            <SelectValue placeholder="Rate Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Rate Plans</SelectItem>
            {(query.data?.filters.ratePlans ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id} className="text-xs">{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(q || status !== "all" || from || to || roomTypeId !== "all" || ratePlanId !== "all") && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 text-xs text-[#756A5B]"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Dense Table */}
      <div className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="travel-agent-bookings-table">
            <thead>
              <tr className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] uppercase tracking-wider">
                <th className="px-3.5 py-2.5">Confirmation</th>
                <th className="px-3 py-2.5">Guest</th>
                <th className="px-3 py-2.5">Arrival</th>
                <th className="px-3 py-2.5">Departure</th>
                <th className="px-3 py-2.5 text-center">Nights</th>
                <th className="px-3 py-2.5">Room Type</th>
                <th className="px-3 py-2.5">Rate Plan</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Commission</th>
                <th className="px-3.5 py-2.5 text-right">Folio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EAE1]">
              {query.isLoading ? (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-[#756A5B]">
                    Loading bookings…
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#8C827A] italic">
                    No bookings match these filters.
                  </td>
                </tr>
              ) : (
                pageItems.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-[#FAF8F5]/80 transition-colors"
                    data-testid={`travel-agent-booking-row-${row.id}`}
                  >
                    <td className="px-3.5 py-2.5 font-mono font-medium text-[#8A641A]">
                      <Link
                        to="/restaurant/pms/reservations/$reservationId"
                        params={{ reservationId: row.id }}
                        className="hover:underline"
                      >
                        {row.confirmationNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[#251605]">
                      {row.guestId ? (
                        <Link
                          to={GUEST_PROFILE_DETAIL_PATH}
                          params={{ guestId: row.guestId }}
                          search={guestProfileSearch({ type: "individual" })}
                          className="hover:underline"
                        >
                          {row.guestName}
                        </Link>
                      ) : (
                        row.guestName
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[#756A5B]">{row.arrivalDate}</td>
                    <td className="px-3 py-2.5 text-[#756A5B]">{row.departureDate}</td>
                    <td className="px-3 py-2.5 font-mono text-center text-[#251605]">{row.nights}</td>
                    <td className="px-3 py-2.5 text-[#251605]">{row.roomLabel}</td>
                    <td className="px-3 py-2.5 text-[#756A5B]">{row.ratePlanName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <ReservationStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-[#251605]">
                      {row.total == null ? "—" : row.total.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right font-medium text-[#8A641A]">
                      {row.commission?.amount == null ? "—" : row.commission.amount.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <Link
                        to={GUEST_CASHIERING_HREF}
                        className="inline-flex items-center gap-1 text-[11px] text-[#8A641A] hover:underline"
                      >
                        <Receipt className="size-3" />
                        Folio
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const GuestTravelAgentBookingsView = GuestTravelAgentBookings;
