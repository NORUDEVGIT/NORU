import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, DoorClosed, DoorOpen, Hotel, LogIn, Search, UserPlus, Wrench } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { WalkInDialog } from "@/components/frontoffice/front-office-dialogs";
import { getFrontOfficeDashboard } from "@/lib/frontoffice.functions";
import { propertyToday } from "@/lib/reservation-dates";
import { useRestaurantTimezone } from "@/core/state/restaurant-context";

export function FrontOfficeSummary({ restaurantId }: { restaurantId: string }) {
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);
  const [walkIn, setWalkIn] = useState(false);

  const fetchDashboard = useServerFn(getFrontOfficeDashboard);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["front-office", "dashboard", restaurantId, today],
    queryFn: () => fetchDashboard({ data: { restaurantId, today } }),
    retry: false,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading front office…</p>;
  if (isError || !data) return null;

  const cards = [
    { label: "Arrivals today", value: data.arrivalsToday, icon: LogIn },
    { label: "Departures today", value: data.departuresToday, icon: DoorClosed },
    { label: "In-house guests", value: data.inHouse, icon: Hotel },
    { label: "Available rooms", value: data.availableRooms, icon: DoorOpen },
    { label: "Occupied rooms", value: data.occupiedRooms, icon: CalendarCheck },
    { label: "Out of order", value: data.outOfOrder, icon: Wrench },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg">Front office today</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setWalkIn(true)}>
            <UserPlus className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Walk-in</span>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/restaurant/rooms/arrivals">
              <LogIn className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Check-in</span>
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/restaurant/rooms" search={{ tab: "rooms" }}>
              <Search className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Room search</span>
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <card.icon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-2 font-display text-3xl">{card.value}</p>
          </div>
        ))}
      </div>

      <WalkInDialog restaurantId={restaurantId} today={today} open={walkIn} onOpenChange={setWalkIn} />
    </section>
  );
}
