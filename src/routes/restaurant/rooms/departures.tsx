import { useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { CheckOutDialog } from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { listDepartures, type FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { getBookingsAccess } from "@/packages/pms/lib/reservations.functions";
import { propertyToday } from "@/shared/lib/property-dates";
import { useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/rooms/departures")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/rooms/departures" } });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Departures — Front Office — NORU" },
      { name: "description", content: "Departures due today plus overstays, with operational check-out." },
      { property: "og:title", content: "Departures — NORU" },
      { property: "og:description", content: "Front office departures and check-out." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeparturesRoute,
});

function DeparturesRoute() {
  return <RestaurantShell active="Departures">{(m) => <DeparturesPage membership={m} />}</RestaurantShell>;
}

function DeparturesPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);

  const [date, setDate] = useState(today);
  const [checkOut, setCheckOut] = useState<FrontOfficeStay | null>(null);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchDepartures = useServerFn(listDepartures);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const departuresQuery = useQuery({
    queryKey: ["front-office", "departures", restaurantId, date],
    queryFn: () => fetchDepartures({ data: { restaurantId, date } }),
    enabled: canManage,
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading departures…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Departures</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access Front Office for this property.
        </p>
      </div>
    );
  }

  const rows = departuresQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Departures</h1>
        <p className="text-sm text-muted-foreground">
          Stays due to depart on {formatStayDate(date)}, plus any overstays.
        </p>
      </div>

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
