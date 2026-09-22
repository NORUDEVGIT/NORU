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
import { listTravelAgentReservations } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { GUEST_CASHIERING_HREF } from "@/packages/pms/lib/guest-profile-wave3";
import { GUEST_PROFILE_DETAIL_PATH, guestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";

export function GuestTravelAgentBookings({
  restaurantId,
  agencyId,
  canManage,
}: {
  restaurantId: string;
  agencyId: string;
  canManage: boolean;
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
  const pageItems = useMemo(() => items.slice(0, 50), [items]);

  return (
    <div className="space-y-4" data-testid="travel-agent-bookings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Bookings</h2>
          <p className="text-sm text-muted-foreground">
            Existing hotel reservations bound to this travel agency.
          </p>
        </div>
        {canManage ? (
          <Link to="/restaurant/bookings/new" search={{ travelAgentMasterId: agencyId }}>
            <Button type="button">New Booking</Button>
          </Link>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search guest or confirmation" />
        <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="checked_in">In house</SelectItem>
            <SelectItem value="checked_out">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roomTypeId} onValueChange={setRoomTypeId}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Room type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All room types</SelectItem>
            {(query.data?.filters.roomTypes ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ratePlanId} onValueChange={setRatePlanId}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Rate plan" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rate plans</SelectItem>
            {(query.data?.filters.ratePlans ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Confirmation</TableHead>
            <TableHead>Guest</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Check-out</TableHead>
            <TableHead>Nights</TableHead>
            <TableHead>Room Type</TableHead>
            <TableHead>Rate Plan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Commission</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageItems.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: row.id }}>
                  {row.confirmationNumber}
                </Link>
              </TableCell>
              <TableCell>
                {row.guestId ? (
                  <Link
                    to={GUEST_PROFILE_DETAIL_PATH}
                    params={{ guestId: row.guestId }}
                    search={guestProfileSearch({ type: "individual" })}
                  >
                    {row.guestName}
                  </Link>
                ) : (
                  row.guestName
                )}
              </TableCell>
              <TableCell>{row.arrivalDate}</TableCell>
              <TableCell>{row.departureDate}</TableCell>
              <TableCell>{row.nights}</TableCell>
              <TableCell>{row.roomLabel}</TableCell>
              <TableCell>{row.ratePlanName ?? "—"}</TableCell>
              <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
              <TableCell>{row.total == null ? "—" : row.total.toFixed(2)}</TableCell>
              <TableCell>{row.commission?.amount == null ? "—" : row.commission.amount.toFixed(2)}</TableCell>
              <TableCell>
                <Link to={GUEST_CASHIERING_HREF}>Folio</Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!items.length ? <p className="text-sm text-muted-foreground">No bookings match these filters.</p> : null}
    </div>
  );
}
