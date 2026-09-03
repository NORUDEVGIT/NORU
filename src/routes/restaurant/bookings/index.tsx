import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, ListChecks } from "lucide-react";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Button } from "@/components/ui/button";
import { ReservationStatusBadge, StatCard, formatStayDate, propertyToday } from "@/components/bookings/reservation-bits";
import { supabase } from "@/integrations/supabase/client";
import {
  getBookingsAccess,
  getBookingsDashboard,
  listReservations,
} from "@/lib/reservations.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { useRestaurantTimezone } from "@/state/restaurant-context";

export const Route = createFileRoute("/restaurant/bookings/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/bookings" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Booking Dashboard — Front Office — NORU" },
      {
        name: "description",
        content: "Today's arrivals, departures, in-house stays and pending reservations for your property.",
      },
      { property: "og:title", content: "Booking Dashboard — NORU" },
      { property: "og:description", content: "Arrivals, departures and reservation activity at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookingsRoute,
});

function BookingsRoute() {
  return <RestaurantShell active="Bookings">{(m) => <BookingsDashboardPage membership={m} />}</RestaurantShell>;
}

function BookingsDashboardPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchDashboard = useServerFn(getBookingsDashboard);
  const fetchReservations = useServerFn(listReservations);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const dashboardQuery = useQuery({
    queryKey: ["bookings-dashboard", restaurantId, today],
    queryFn: () => fetchDashboard({ data: { restaurantId, today } }),
    enabled: canManage,
  });

  const arrivalsQuery = useQuery({
    queryKey: ["bookings-arrivals", restaurantId, today],
    queryFn: () =>
      fetchReservations({
        data: { restaurantId, fromDate: today, toDate: today, pageSize: 10 },
      }),
    enabled: canManage,
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading bookings…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Front Office</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access reservations for this property.
        </p>
      </div>
    );
  }

  const stats = dashboardQuery.data;
  const active = (arrivalsQuery.data?.rows ?? []).filter((r) => r.status !== "cancelled");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Booking Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Reservation activity for {membership.restaurant.name} — {formatStayDate(today)}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/restaurant/bookings/reservations">
              <ListChecks className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">All reservations</span>
            </Link>
          </Button>
          <Button asChild>
            <Link to="/restaurant/bookings/new">
              <CalendarPlus className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">New reservation</span>
            </Link>
          </Button>
        </div>
      </div>

      {dashboardQuery.isLoading || !stats ? (
        <p className="text-sm text-muted-foreground">Loading today's numbers…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Arrivals today" value={stats.arrivalsToday} />
          <StatCard label="Departures today" value={stats.departuresToday} />
          <StatCard
            label="Staying tonight"
            value={stats.stayingToday}
            hint={`${stats.occupancyPercent}% of ${stats.sellableRooms} sellable rooms`}
          />
          <StatCard label="Pending confirmation" value={stats.pending} />
          <StatCard label="Upcoming reservations" value={stats.upcoming} />
          <StatCard label="Cancelled this month" value={stats.cancelledThisMonth} />
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h2 className="font-display text-lg">Today's reservations</h2>
          <p className="text-xs text-muted-foreground">Stays arriving, departing or in progress today.</p>
        </header>
        {arrivalsQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : active.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nothing on the books for today.</p>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((r) => (
              <li key={r.id}>
                <Link
                  to="/restaurant/bookings/$reservationId"
                  params={{ reservationId: r.id }}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <span className="font-medium">{r.confirmationNumber}</span>
                  <span className="text-sm">{r.guestName}</span>
                  <span className="text-sm text-muted-foreground">
                    {r.roomTypeName}
                    {r.roomNumber ? ` · Room ${r.roomNumber}` : ""}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatStayDate(r.arrivalDate)} → {formatStayDate(r.departureDate)}
                  </span>
                  <span className="ml-auto">
                    <ReservationStatusBadge status={r.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
