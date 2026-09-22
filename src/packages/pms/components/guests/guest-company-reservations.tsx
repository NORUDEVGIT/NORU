import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { listCompanyReservations } from "@/packages/pms/lib/guest-company-detail.functions";
import { COMPANY_CONTACT_DEFAULT_PAGE_SIZE, COMPANY_CONTACT_PAGE_SIZES } from "@/packages/pms/lib/guest-company-detail-workspace";
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

  return (
    <div className="space-y-4" data-testid="company-reservations">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Reservations</h2>
          <p className="text-sm text-muted-foreground">
            Reservations already bound to this company. Create uses the existing booking wizard.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link to="/restaurant/bookings/new" search={{ companyMasterId: companyId }}>
              Create Reservation
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Kpi label="Total" value={String(kpis?.total ?? 0)} />
        <Kpi label="Upcoming" value={String(kpis?.upcoming ?? 0)} />
        <Kpi label="In-house" value={String(kpis?.inHouse ?? 0)} />
        <Kpi label="Completed" value={String(kpis?.completed ?? 0)} />
        <Kpi label="Cancelled" value={String(kpis?.cancelled ?? 0)} />
        <Kpi label="Room nights" value={String(kpis?.roomNights ?? 0)} />
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(0); }} placeholder="Search confirmation, guest, room" />
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
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
        <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0); }} />
        <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(0); }} />
        <Select value={source} onValueChange={(value) => { setSource(value); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {(query.data?.filters.sources ?? []).map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roomTypeId} onValueChange={(value) => { setRoomTypeId(value); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Room type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All room types</SelectItem>
            {(query.data?.filters.roomTypes ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Select value={ratePlanId} onValueChange={(value) => { setRatePlanId(value); setPage(0); }}>
        <SelectTrigger className="max-w-xs"><SelectValue placeholder="Rate plan" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All rate plans</SelectItem>
          {(query.data?.filters.ratePlans ?? []).map((item) => (
            <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <section className="rounded-2xl border border-border bg-card p-4">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading reservations…</p>
        ) : query.error ? (
          <p className="text-sm text-muted-foreground">{(query.error as Error).message}</p>
        ) : pageItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reservations match these filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Confirmation</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Nights</TableHead>
                <TableHead>Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: row.id }} className="underline">
                      {row.confirmationNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {row.guestId ? (
                      <Link
                        to={GUEST_PROFILE_DETAIL_PATH}
                        params={{ guestId: row.guestId }}
                        search={guestProfileSearch({ type: "individual", nav: "overview" })}
                        className="underline"
                      >
                        {row.guestName}
                      </Link>
                    ) : (
                      row.guestName
                    )}
                  </TableCell>
                  <TableCell>{row.arrivalDate} – {row.departureDate}</TableCell>
                  <TableCell>{row.roomLabel}</TableCell>
                  <TableCell>{row.ratePlanName ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                  <TableCell>{row.nights}</TableCell>
                  <TableCell>
                    {row.total == null ? "—" : `${row.currency ?? ""} ${row.total.toFixed(2)}`.trim()}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {canManage ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: row.id }}>
                          Open
                        </Link>
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="ghost">
                      <Link to={GUEST_CASHIERING_HREF}>Folio</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(0); }}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMPANY_CONTACT_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>{size} / page</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
              Previous
            </Button>
            <span className="self-center text-muted-foreground">{page + 1} / {pages}</span>
            <Button type="button" size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>
              Next
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
