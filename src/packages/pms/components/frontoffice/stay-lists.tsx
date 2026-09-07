/**
 * Phase 7D.2F1 — shared Front Office stay lists.
 *
 * The in-house and departures bodies used to live inside their own legacy
 * routes. They are extracted here unchanged so the canonical Front Office
 * workspace can present them as tabs. No new data or write paths.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  CheckOutDialog,
  RoomMoveDialog,
  StayDatesDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { listDepartures, listInHouse, type FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import { useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";

function ConfirmationLink({ stay }: { stay: FrontOfficeStay }) {
  return (
    <Link
      to="/restaurant/pms/reservations/$reservationId"
      params={{ reservationId: stay.id }}
      className="font-medium underline-offset-4 hover:underline"
    >
      {stay.confirmationNumber}
    </Link>
  );
}

export function InHouseList({ restaurantId, propertyName }: { restaurantId: string; propertyName: string }) {
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);

  const [search, setSearch] = useState("");
  const [move, setMove] = useState<FrontOfficeStay | null>(null);
  const [stay, setStay] = useState<FrontOfficeStay | null>(null);
  const [checkOut, setCheckOut] = useState<FrontOfficeStay | null>(null);

  const fetchInHouse = useServerFn(listInHouse);
  const inHouseQuery = useQuery({
    queryKey: ["front-office", "in-house", restaurantId, today, search],
    queryFn: () =>
      fetchInHouse({ data: { restaurantId, today, ...(search.trim() ? { search: search.trim() } : {}) } }),
    retry: false,
  });

  const rows = inHouseQuery.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {rows.length} stay{rows.length === 1 ? "" : "s"} currently checked in at {propertyName}.
      </p>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search guest, room or confirmation"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {inHouseQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading in-house guests…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nobody is in-house right now.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ConfirmationLink stay={row} />
                    <ReservationStatusBadge status={row.status} />
                    {row.overstay ? (
                      <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                        Overstay
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm">
                    {row.guestName} · Room {row.roomNumber ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{row.roomTypeName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatStayDate(row.arrivalDate)} → {formatStayDate(row.departureDate)} · {row.nights} night
                    {row.nights === 1 ? "" : "s"}
                  </p>
                  {row.specialRequests ? (
                    <p className="mt-1 text-xs text-muted-foreground">Requests: {row.specialRequests}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/restaurant/pms/reservations/guests/$guestId" params={{ guestId: row.guestId }}>
                      Guest
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setMove(row)}>
                    Room move
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setStay(row)}>
                    Change stay
                  </Button>
                  <Button size="sm" onClick={() => setCheckOut(row)}>
                    Check out
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {move ? (
        <RoomMoveDialog restaurantId={restaurantId} stay={move} open onOpenChange={(v) => !v && setMove(null)} />
      ) : null}
      {stay ? (
        <StayDatesDialog restaurantId={restaurantId} stay={stay} open onOpenChange={(v) => !v && setStay(null)} />
      ) : null}
      {checkOut ? (
        <CheckOutDialog
          restaurantId={restaurantId}
          stay={checkOut}
          open
          onOpenChange={(v) => !v && setCheckOut(null)}
        />
      ) : null}
    </div>
  );
}

export function DeparturesList({ restaurantId }: { restaurantId: string }) {
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);

  const [date, setDate] = useState(today);
  const [checkOut, setCheckOut] = useState<FrontOfficeStay | null>(null);

  const fetchDepartures = useServerFn(listDepartures);
  const departuresQuery = useQuery({
    queryKey: ["front-office", "departures", restaurantId, date],
    queryFn: () => fetchDepartures({ data: { restaurantId, date } }),
    retry: false,
  });

  const rows = departuresQuery.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Stays due to depart on {formatStayDate(date)}, plus any overstays.
      </p>

      <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />

      {departuresQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading departures…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No departures for this date.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ConfirmationLink stay={row} />
                    <ReservationStatusBadge status={row.status} />
                    {row.overstay ? (
                      <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                        Overstay
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm">
                    {row.guestName} · Room {row.roomNumber ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatStayDate(row.arrivalDate)} → {formatStayDate(row.departureDate)}
                  </p>
                </div>
                {row.status === "checked_in" ? (
                  <Button size="sm" onClick={() => setCheckOut(row)}>
                    Check out
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {checkOut ? (
        <CheckOutDialog
          restaurantId={restaurantId}
          stay={checkOut}
          open
          onOpenChange={(v) => !v && setCheckOut(null)}
        />
      ) : null}
    </div>
  );
}
