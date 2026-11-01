import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, Receipt, Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
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

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "In-house",
  checked_out: "Completed",
  cancelled: "Cancelled",
};

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-[#251605]">{label}</p>
      {children}
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter ${label}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#C89933] bg-[#F5EAD0] py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-[#251605]"
    >
      {label}
      <X className="size-3" />
    </button>
  );
}

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
  const roomTypes = query.data?.filters.roomTypes ?? [];
  const ratePlans = query.data?.filters.ratePlans ?? [];

  const totalRoomNights = items.reduce((sum, r) => sum + (r.nights ?? 0), 0);
  const upcomingCount = items.filter((r) => r.status === "confirmed" || r.status === "pending").length;
  const inHouseCount = items.filter((r) => r.status === "checked_in").length;

  const roomTypeName = roomTypes.find((row) => row.id === roomTypeId)?.name;
  const ratePlanName = ratePlans.find((row) => row.id === ratePlanId)?.name;

  const activeFilterCount =
    (status !== "all" ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0) +
    (roomTypeId !== "all" ? 1 : 0) +
    (ratePlanId !== "all" ? 1 : 0);

  function clearFilters() {
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
            {query.isLoading
              ? "Loading…"
              : `${items.length} bookings · ${upcomingCount} upcoming · ${inHouseCount} in-house · ${totalRoomNights} room nights`}
          </p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
            <Input
              className="h-9 border-[#DDD4C5] bg-white pl-8 text-xs"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search guest or confirmation"
              data-testid="travel-agent-bookings-search"
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-2 border-[#DDD4C5] bg-white text-xs font-medium text-[#251605]"
                data-testid="travel-agent-bookings-filter-button"
              >
                <SlidersHorizontal className="size-3.5 text-[#C89933]" />
                Filter
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-[#C89933] px-1.5 text-[11px] font-bold text-[#251605]">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              className="max-h-[75vh] w-80 space-y-4 overflow-y-auto rounded-xl border-[#DDD4C5] p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[#251605]">Filter bookings</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-[#8A641A]"
                  disabled={activeFilterCount === 0}
                  onClick={clearFilters}
                >
                  Reset all
                </Button>
              </div>

              <FilterField label="Status">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 w-full border-[#DDD4C5] text-xs">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-xs">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Arrival date">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    className="h-9 border-[#DDD4C5] text-xs"
                    aria-label="Arrival from"
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                  <Input
                    type="date"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    className="h-9 border-[#DDD4C5] text-xs"
                    aria-label="Arrival to"
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                </div>
              </FilterField>

              <FilterField label="Room type">
                <Select value={roomTypeId} onValueChange={setRoomTypeId}>
                  <SelectTrigger className="h-9 w-full border-[#DDD4C5] text-xs">
                    <SelectValue placeholder="All room types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All room types</SelectItem>
                    {roomTypes.map((row) => (
                      <SelectItem key={row.id} value={row.id} className="text-xs">
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Rate plan">
                <Select value={ratePlanId} onValueChange={setRatePlanId}>
                  <SelectTrigger className="h-9 w-full border-[#DDD4C5] text-xs">
                    <SelectValue placeholder="All rate plans" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All rate plans</SelectItem>
                    {ratePlans.map((row) => (
                      <SelectItem key={row.id} value={row.id} className="text-xs">
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            </PopoverContent>
          </Popover>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 ? (
          <ul className="flex flex-wrap gap-2" data-testid="travel-agent-bookings-filter-chips">
            {status !== "all" ? (
              <li>
                <FilterChip
                  label={STATUS_LABELS[status] ?? status}
                  onRemove={() => setStatus("all")}
                />
              </li>
            ) : null}
            {from ? (
              <li>
                <FilterChip label={`From ${from}`} onRemove={() => setFrom("")} />
              </li>
            ) : null}
            {to ? (
              <li>
                <FilterChip label={`To ${to}`} onRemove={() => setTo("")} />
              </li>
            ) : null}
            {roomTypeId !== "all" ? (
              <li>
                <FilterChip
                  label={roomTypeName ?? "Room type"}
                  onRemove={() => setRoomTypeId("all")}
                />
              </li>
            ) : null}
            {ratePlanId !== "all" ? (
              <li>
                <FilterChip
                  label={ratePlanName ?? "Rate plan"}
                  onRemove={() => setRatePlanId("all")}
                />
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="travel-agent-bookings-table">
            <thead>
              <tr className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B]">
                <th className="px-3.5 py-2.5">Confirmation</th>
                <th className="px-3 py-2.5">Guest</th>
                <th className="px-3 py-2.5">Stay</th>
                <th className="px-3 py-2.5">Room</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Commission</th>
                <th className="px-3.5 py-2.5 text-right">Folio</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F0EAE1]">
              {query.isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-[#756A5B]">
                    Loading bookings…
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#8C827A]">
                    No bookings match these filters.
                  </td>
                </tr>
              ) : (
                pageItems.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-[#FAF8F5]/80"
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

                    <td className="px-3 py-2.5 text-[#251605]">
                      <span className="block">
                        {row.arrivalDate} → {row.departureDate}
                      </span>
                      <span className="block text-[11px] text-[#756A5B]">
                        {row.nights} {row.nights === 1 ? "night" : "nights"}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-[#251605]">
                      <span className="block">{row.roomLabel}</span>
                      {row.ratePlanName ? (
                        <span className="block text-[11px] text-[#756A5B]">{row.ratePlanName}</span>
                      ) : null}
                    </td>

                    <td className="px-3 py-2.5">
                      <ReservationStatusBadge status={row.status} />
                    </td>

                    <td className="px-3 py-2.5 text-right font-mono text-[#251605]">
                      {row.total == null ? "—" : row.total.toFixed(2)}
                    </td>

                    <td className="px-3 py-2.5 text-right font-mono font-medium text-[#8A641A]">
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