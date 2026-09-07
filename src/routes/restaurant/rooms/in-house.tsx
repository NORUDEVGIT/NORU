import { useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReservationStatusBadge, formatStayDate } from "@/components/bookings/reservation-bits";
import {
  CheckOutDialog,
  RoomMoveDialog,
  StayDatesDialog,
} from "@/components/frontoffice/front-office-dialogs";
import { supabase } from "@/integrations/supabase/client";
import { listInHouse, type FrontOfficeStay } from "@/lib/frontoffice.functions";
import { getBookingsAccess } from "@/lib/reservations.functions";
import { propertyToday } from "@/lib/reservation-dates";
import { useRestaurantTimezone } from "@/state/restaurant-context";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/rooms/in-house")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/rooms/in-house" } });
    }
  },
  head: () => ({
    meta: [
      { title: "In-House Guests — Front Office — NORU" },
      { name: "description", content: "Guests currently in-house with room move, stay change and check-out actions." },
      { property: "og:title", content: "In-House Guests — NORU" },
      { property: "og:description", content: "Every checked-in stay at your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InHouseRoute,
});

function InHouseRoute() {
  return <RestaurantShell active="In-House">{(m) => <InHousePage membership={m} />}</RestaurantShell>;
}

function InHousePage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);

  const [search, setSearch] = useState("");
  const [move, setMove] = useState<FrontOfficeStay | null>(null);
  const [stay, setStay] = useState<FrontOfficeStay | null>(null);
  const [checkOut, setCheckOut] = useState<FrontOfficeStay | null>(null);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchInHouse = useServerFn(listInHouse);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const inHouseQuery = useQuery({
    queryKey: ["front-office", "in-house", restaurantId, today, search],
    queryFn: () =>
      fetchInHouse({ data: { restaurantId, today, ...(search.trim() ? { search: search.trim() } : {}) } }),
    enabled: canManage,
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading in-house guests…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">In-House Guests</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access Front Office for this property.
        </p>
      </div>
    );
  }

  const rows = inHouseQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">In-House Guests</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} stay{rows.length === 1 ? "" : "s"} currently checked in at {membership.restaurant.name}.
        </p>
      </div>

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
                    <Link
                      to="/restaurant/pms/reservations/$reservationId"
                      params={{ reservationId: row.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.confirmationNumber}
                    </Link>
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

      <p className="text-xs text-muted-foreground">
        Billing settlement will be handled in a future Cashiering phase.
      </p>

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
