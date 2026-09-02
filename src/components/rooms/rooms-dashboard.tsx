import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, CheckCircle2, CircleSlash, DoorOpen, Tag, Wrench } from "lucide-react";

import { getRoomsDashboard } from "@/lib/rooms.functions";
import { FrontOfficeSummary } from "@/components/frontoffice/front-office-summary";


export function RoomsDashboardTab({ restaurantId }: { restaurantId: string }) {
  const fetchDashboard = useServerFn(getRoomsDashboard);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["rooms-dashboard", restaurantId],
    queryFn: () => fetchDashboard({ data: { restaurantId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading room overview…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">We couldn't load the room overview.</p>;

  const cards = [
    { label: "Total rooms", value: data.totalRooms, icon: BedDouble },
    { label: "Active rooms", value: data.activeRooms, icon: CheckCircle2 },
    { label: "Sellable rooms", value: data.sellableRooms, icon: Tag },
    { label: "Available", value: data.availableRooms, icon: DoorOpen },
    { label: "Out of order", value: data.outOfOrder, icon: Wrench },
    { label: "Out of service", value: data.outOfService, icon: CircleSlash },
  ];

  return (
    <div className="space-y-6">
      <FrontOfficeSummary restaurantId={restaurantId} />

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

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Rooms by type</h2>
        {data.byType.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No room types yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.byType.map((row) => (
              <li key={row.code} className="flex items-center justify-between text-sm">
                <span>
                  {row.name} <span className="text-xs text-muted-foreground">({row.code})</span>
                </span>
                <span className="font-medium">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
