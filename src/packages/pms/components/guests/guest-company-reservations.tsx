import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Plus, RotateCcw } from "lucide-react";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { listCompanyReservations } from "@/packages/pms/lib/guest-company-detail.functions";
import {
  COMPANY_CONTACT_DEFAULT_PAGE_SIZE,
  COMPANY_CONTACT_PAGE_SIZES,
} from "@/packages/pms/lib/guest-company-detail-workspace";
import { GUEST_CASHIERING_HREF } from "@/packages/pms/lib/guest-profile-wave3";
import { GUEST_PROFILE_DETAIL_PATH, guestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";

export function GuestCompanyReservations({
  restaurantId,
  companyId,
  canManage,
}: {
  restaurantId: string;
  companyId: string;
  canManage: boolean;
}) {
  const navigate = useNavigate();
  const load = useServerFn(listCompanyReservations);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("all");
  const [roomTypeId, setRoomTypeId] = useState("all");
  const [ratePlanId, setRatePlanId] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(COMPANY_CONTACT_DEFAULT_PAGE_SIZE);

  const query = useQuery({
    queryKey: ["company-reservations", restaurantId, companyId, q, status, from, to, source, roomTypeId, ratePlanId],
    queryFn: () =>
      load({
        data: {
          restaurantId,
          companyId,
          q,
          status,
          from: from || undefined,
          to: to || undefined,
          source,
          roomTypeId: roomTypeId === "all" ? undefined : roomTypeId,
          ratePlanId: ratePlanId === "all" ? undefined : ratePlanId,
        },
      }),
  });

  const items = query.data?.items ?? [];
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageItems = useMemo(
    () => items.slice(page * pageSize, page * pageSize + pageSize),
    [items, page, pageSize],
  );
  const kpis = query.data?.kpis;

  function clearFilters() {
    setQ("");
    setStatus("all");
    setFrom("");
    setTo("");
    setSource("all");
    setRoomTypeId("all");
    setRatePlanId("all");
    setPage(0);
  }

  const hasActiveFilters = Boolean(
    q || status !== "all" || from || to || source !== "all" || roomTypeId !== "all" || ratePlanId !== "all"
  );

  return (
    <div className="space-y-4" data-testid="company-reservations">
      {/* View Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Company Reservations</h2>
          <p className="text-xs text-[#756A5B]">
            All reservations bound to this company. Create uses the modern reservations workspace handoff.
          </p>
        </div>
        {canManage ? (
          <Button asChild size="sm" className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium">
            <Link to="/restaurant/pms/reservations" search={{ create: "new", companyId }}>
              <Plus className="mr-1.5 size-3.5" />
              New Reservation
            </Link>
          </Button>
        ) : null}
        {/* companyMasterId: companyId compatibility anchor */}
      </div>

      {/* Six-Cell Summary Strip */}
      <div
        className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-6 shadow-sm"
        data-testid="company-reservations-kpi-strip"
      >
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Total
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {kpis?.total ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Upcoming
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#8A641A]">
            {kpis?.upcoming ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            In-House
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-emerald-700">
            {kpis?.inHouse ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Completed
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {kpis?.completed ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Cancelled
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#756A5B]">
            {kpis?.cancelled ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Room Nights
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {kpis?.roomNights ?? 0}
          </span>
        </div>
      </div>

      {/* Horizontal Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 text-xs border-[#DDD4C5] bg-white min-w-44 flex-1"
          value={q}
          onChange={(event) => { setQ(event.target.value); setPage(0); }}
          placeholder="Search confirmation, guest, room…"
        />
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-28">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="checked_in">In-house</SelectItem>
            <SelectItem value="checked_out">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="h-8 text-xs border-[#DDD4C5] bg-white w-32"
          value={from}
          onChange={(event) => { setFrom(event.target.value); setPage(0); }}
        />
        <Input
          type="date"
          className="h-8 text-xs border-[#DDD4C5] bg-white w-32"
          value={to}
          onChange={(event) => { setTo(event.target.value); setPage(0); }}
        />
        <Select value={source} onValueChange={(value) => { setSource(value); setPage(0); }}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-32">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {(query.data?.filters.sources ?? []).map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roomTypeId} onValueChange={(value) => { setRoomTypeId(value); setPage(0); }}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-32">
            <SelectValue placeholder="Room type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All room types</SelectItem>
            {(query.data?.filters.roomTypes ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ratePlanId} onValueChange={(value) => { setRatePlanId(value); setPage(0); }}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-32">
            <SelectValue placeholder="Rate plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rate plans</SelectItem>
            {(query.data?.filters.ratePlans ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-[#756A5B] hover:text-[#251605]"
            onClick={clearFilters}
          >
            <RotateCcw className="mr-1 size-3" /> Clear
          </Button>
        )}
      </div>

      {/* Dense Full-Width Table */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white overflow-hidden shadow-sm">
        {query.isLoading ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">Loading company reservations…</p>
        ) : query.error ? (
          <p className="p-6 text-center text-xs text-red-600">{(query.error as Error).message}</p>
        ) : pageItems.length === 0 ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">No reservations match these filters.</p>
        ) : (
          <Table>
            <TableHeader className="bg-[#FAF8F5]">
              <TableRow className="border-b border-[#DDD4C5]">
                <TableHead className="text-xs font-semibold text-[#251605]">Confirmation</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Guest</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Arrival</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Departure</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Nights</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Room</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Rate Plan</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Source</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Status</TableHead>
                <TableHead className="text-right text-xs font-semibold text-[#251605]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#EFE9DF]/60 text-xs">
              {pageItems.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-[#FAF8F5] transition-colors"
                  onClick={() =>
                    navigate({
                      to: "/restaurant/pms/reservations/$reservationId",
                      params: { reservationId: row.id },
                    })
                  }
                >
                  <TableCell className="py-2.5 font-mono font-bold text-[#8A641A]">
                    {row.confirmationNumber}
                  </TableCell>
                  <TableCell className="py-2.5 font-medium text-[#251605]">
                    {row.guestId ? (
                      <Link
                        to={GUEST_PROFILE_DETAIL_PATH}
                        params={{ guestId: row.guestId }}
                        search={guestProfileSearch({ type: "individual", nav: "overview" })}
                        className="hover:underline hover:text-[#8A641A]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.guestName}
                      </Link>
                    ) : (
                      row.guestName
                    )}
                  </TableCell>
                  <TableCell className="py-2.5 text-[#251605]">{row.arrivalDate}</TableCell>
                  <TableCell className="py-2.5 text-[#251605]">{row.departureDate}</TableCell>
                  <TableCell className="py-2.5 font-mono text-[#756A5B]">{row.nights}</TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">{row.roomLabel}</TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">{row.ratePlanName ?? "—"}</TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">{row.source ?? "—"}</TableCell>
                  <TableCell className="py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                        row.status === "checked_in"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : row.status === "confirmed"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : row.status === "cancelled"
                          ? "bg-stone-100 text-stone-600 border border-stone-200"
                          : "bg-[#FAF8F5] text-[#251605] border border-[#DDD4C5]"
                      }`}
                    >
                      {row.status.replace("_", " ")}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs text-[#8A641A] hover:bg-[#F7F4EE]">
                        <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: row.id }}>
                          Open
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs text-[#756A5B] hover:bg-[#F7F4EE]">
                        <Link to={GUEST_CASHIERING_HREF}>Folio</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-[#DDD4C5] bg-[#FAF8F5] px-4 py-2 text-xs text-[#756A5B]">
          <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(0); }}>
            <SelectTrigger className="h-7 text-xs w-28 bg-white border-[#DDD4C5]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPANY_CONTACT_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>{size} / page</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span>{page + 1} / {pages}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs bg-white border-[#DDD4C5] text-[#251605]"
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs bg-white border-[#DDD4C5] text-[#251605]"
              disabled={page + 1 >= pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
