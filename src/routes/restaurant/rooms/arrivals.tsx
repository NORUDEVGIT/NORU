import { useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReservationStatusBadge, formatStayDate } from "@/components/bookings/reservation-bits";
import {
  AssignRoomDialog,
  CheckInDialog,
  NoShowDialog,
} from "@/components/frontoffice/front-office-dialogs";
import { supabase } from "@/integrations/supabase/client";
import { listArrivals, type FrontOfficeStay } from "@/lib/frontoffice.functions";
import { getBookingsAccess } from "@/lib/reservations.functions";
import { propertyToday } from "@/lib/reservation-dates";
import { useRestaurantTimezone } from "@/state/restaurant-context";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/rooms/arrivals")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/rooms/arrivals" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Arrivals — Front Office — NORU" },
      { name: "description", content: "Today's hotel arrivals with room assignment and check-in for your property." },
      { property: "og:title", content: "Arrivals — NORU" },
      { property: "og:description", content: "Front office arrivals list with check-in actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ArrivalsRoute,
});

function ArrivalsRoute() {
  return <RestaurantShell active="Arrivals">{(m) => <ArrivalsPage membership={m} />}</RestaurantShell>;
}

const ALL = "all";

function ArrivalsPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);

  const [date, setDate] = useState(today);
  const [status, setStatus] = useState(ALL);
  const [assignment, setAssignment] = useState(ALL);
  const [checkIn, setCheckIn] = useState<FrontOfficeStay | null>(null);
  const [assign, setAssign] = useState<FrontOfficeStay | null>(null);
  const [noShow, setNoShow] = useState<FrontOfficeStay | null>(null);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchArrivals = useServerFn(listArrivals);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const arrivalsQuery = useQuery({
    queryKey: ["front-office", "arrivals", restaurantId, date, status, assignment],
    queryFn: () =>
      fetchArrivals({
        data: {
          restaurantId,
          date,
          ...(status !== ALL ? { status: status as "pending" | "confirmed" } : {}),
          ...(assignment !== ALL ? { assignment: assignment as "assigned" | "unassigned" } : {}),
        },
      }),
    enabled: canManage,
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading arrivals…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Arrivals</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access Front Office for this property.
        </p>
      </div>
    );
  }

  const rows = arrivalsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Arrivals</h1>
        <p className="text-sm text-muted-foreground">
          Reservations arriving on {formatStayDate(date)} at {membership.restaurant.name}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assignment} onValueChange={setAssignment}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Room assignment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any assignment</SelectItem>
            <SelectItem value="assigned">Room assigned</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {arrivalsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading arrivals…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No arrivals for this date.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((stay) => (
            <li key={stay.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/restaurant/bookings/$reservationId"
                      params={{ reservationId: stay.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {stay.confirmationNumber}
                    </Link>
                    <ReservationStatusBadge status={stay.status} />
                  </div>
                  <p className="mt-1 text-sm">
                    {stay.guestName}
                    {stay.guestVip ? " · VIP" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stay.roomTypeName} · {stay.roomNumber ? `Room ${stay.roomNumber}` : "Unassigned"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatStayDate(stay.arrivalDate)} → {formatStayDate(stay.departureDate)} · {stay.nights} night
                    {stay.nights === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAssign(stay)}>
                    {stay.roomNumber ? "Change room" : "Assign room"}
                  </Button>
                  {stay.status === "confirmed" ? (
                    <Button size="sm" onClick={() => setCheckIn(stay)}>
                      Check in
                    </Button>
                  ) : null}
                  {stay.status === "confirmed" && stay.arrivalDate < today ? (
                    <Button variant="ghost" size="sm" onClick={() => setNoShow(stay)}>
                      No-show
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {assign ? (
        <AssignRoomDialog
          restaurantId={restaurantId}
          stay={assign}
          open
          onOpenChange={(v) => !v && setAssign(null)}
        />
      ) : null}
      {checkIn ? (
        <CheckInDialog
          restaurantId={restaurantId}
          stay={checkIn}
          open
          onOpenChange={(v) => !v && setCheckIn(null)}
        />
      ) : null}
      {noShow ? (
        <NoShowDialog
          restaurantId={restaurantId}
          stay={noShow}
          today={today}
          open
          onOpenChange={(v) => !v && setNoShow(null)}
        />
      ) : null}
    </div>
  );
}
