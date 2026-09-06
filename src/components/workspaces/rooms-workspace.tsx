import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoomsDashboardTab } from "@/components/rooms/rooms-dashboard";
import { RoomTypesTab } from "@/components/rooms/room-types-tab";
import { RoomsTab } from "@/components/rooms/rooms-tab";
import { getRoomsAccess } from "@/lib/rooms.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { PageHeading, NonPmsOnly } from "@/state/pms-context";

const TABS = ["dashboard", "room-types", "rooms"] as const;
type RoomsTabKey = (typeof TABS)[number];

export function RoomsWorkspace({ membership, initialTab }: { membership: RestaurantMembership; initialTab?: string | undefined }) {
  const restaurantId = membership.restaurant.id;
  const searchTab = initialTab;
  const [tab, setTab] = useState<RoomsTabKey>("dashboard");

  useEffect(() => {
    if (searchTab && (TABS as readonly string[]).includes(searchTab)) setTab(searchTab as RoomsTabKey);
  }, [searchTab]);

  const fetchAccess = useServerFn(getRoomsAccess);
  const accessQuery = useQuery({
    queryKey: ["rooms-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading front office…</p>;
  if (!accessQuery.data?.canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl"><PageHeading fallback="Front Office" /></h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access front office operations for this property.
        </p>
      </div>
    );
  }

  const configContext = tab === "room-types" || tab === "rooms";

  return (
    <div className="space-y-6">
      <div>
        {configContext ? (
          <NonPmsOnly>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Configuration · Rooms
            </p>
          </NonPmsOnly>
        ) : null}
        <h1 className="font-display text-2xl"><PageHeading fallback={configContext ? "Room Types & Rooms" : "Front Office"} /></h1>
        <p className="text-sm text-muted-foreground">
          {configContext
            ? `Room types, rooms and imagery for ${membership.restaurant.name}.`
            : `Manage arrivals, in-house guests, departures and reservations for ${membership.restaurant.name}.`}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as RoomsTabKey)}>
        <TabsList>
          {configContext ? (
            <>
              <TabsTrigger value="room-types">Room Types</TabsTrigger>
              <TabsTrigger value="rooms">Rooms</TabsTrigger>
            </>
          ) : (
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <RoomsDashboardTab restaurantId={restaurantId} />
        </TabsContent>
        <TabsContent value="room-types" className="mt-4">
          <RoomTypesTab restaurantId={restaurantId} />
        </TabsContent>
        <TabsContent value="rooms" className="mt-4">
          <RoomsTab restaurantId={restaurantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
