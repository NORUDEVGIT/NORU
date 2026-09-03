import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { RoomsDashboardTab } from "@/components/rooms/rooms-dashboard";
import { RoomTypesTab } from "@/components/rooms/room-types-tab";
import { RoomsTab } from "@/components/rooms/rooms-tab";
import { getRoomsAccess } from "@/lib/rooms.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

const TABS = ["dashboard", "room-types", "rooms"] as const;
type RoomsTabKey = (typeof TABS)[number];

export const Route = createFileRoute("/restaurant/rooms/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},

  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/rooms" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Rooms & Front Office — NORU" },
      {
        name: "description",
        content: "Set up room types, rooms, amenities and room imagery for your property in NORU.",
      },
      { property: "og:title", content: "Rooms & Front Office — NORU" },
      { property: "og:description", content: "Room type and room setup for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoomsRoute,
});

function RoomsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  const configTab = searchTab === "room-types" || searchTab === "rooms";
  return (
    <RestaurantShell active="Rooms" module={configTab ? "configuration" : "rooms"}>
      {(m) => <RoomsPage membership={m} />}
    </RestaurantShell>
  );
}

function RoomsPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
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

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading rooms…</p>;
  if (!accessQuery.data?.canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Rooms & Front Office</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access room setup for this property.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Rooms & Front Office</h1>
        <p className="text-sm text-muted-foreground">
          Room types, rooms and imagery for {membership.restaurant.name}.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as RoomsTabKey)}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="room-types">Room Types</TabsTrigger>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
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
