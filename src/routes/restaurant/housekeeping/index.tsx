import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getHousekeepingAccess } from "@/lib/housekeeping.functions";
import {
  CleaningBoardTab,
  DiscrepanciesTab,
  HousekeepingDashboardTab,
  HousekeepingHistoryTab,
  InspectionsTab,
  MaintenanceTab,
  RestrictionsTab,
  RoomRackTab,
} from "@/components/housekeeping/housekeeping-tabs";
import { useRestaurantTimezone } from "@/state/restaurant-context";
import { localDateInZone } from "@/lib/restaurant-time";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

const TABS = [
  "dashboard",
  "rack",
  "board",
  "inspections",
  "discrepancies",
  "restrictions",
  "maintenance",
  "history",
] as const;
type TabKey = (typeof TABS)[number];

export const Route = createFileRoute("/restaurant/housekeeping/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/housekeeping" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Housekeeping — NORU" },
      {
        name: "description",
        content:
          "Room rack, cleaning board, inspections, room restrictions, discrepancies and maintenance for your property.",
      },
      { property: "og:title", content: "Housekeeping — NORU" },
      { property: "og:description", content: "Daily housekeeping operations for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HousekeepingRoute,
});

function HousekeepingRoute() {
  return (
    <RestaurantShell active="Housekeeping">
      {(m) => <HousekeepingPage membership={m} />}
    </RestaurantShell>
  );
}

function HousekeepingPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = useMemo(() => localDateInZone(timezone), [timezone]);
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  const [tab, setTab] = useState<TabKey>("dashboard");

  useEffect(() => {
    if (searchTab && (TABS as readonly string[]).includes(searchTab)) setTab(searchTab as TabKey);
  }, [searchTab]);

  const fetchAccess = useServerFn(getHousekeepingAccess);
  const accessQuery = useQuery({
    queryKey: ["housekeeping-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  if (accessQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading housekeeping…</p>;
  }
  if (!accessQuery.data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Housekeeping</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to Housekeeping for this property.
        </p>
      </div>
    );
  }

  const scope = accessQuery.data.scope;
  const isSupervisor = scope === "supervisor";
  const canClean = scope === "supervisor" || scope === "housekeeper";
  const canMaintain = scope === "supervisor" || scope === "maintenance";

  const props = { restaurantId, today };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Housekeeping</h1>
        <p className="text-sm text-muted-foreground">
          Daily room status, cleaning and inspections for {membership.restaurant.name}.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="rack">Room Rack</TabsTrigger>
          {canClean ? <TabsTrigger value="board">Cleaning Board</TabsTrigger> : null}
          {isSupervisor ? <TabsTrigger value="inspections">Inspections</TabsTrigger> : null}
          {isSupervisor ? <TabsTrigger value="discrepancies">Discrepancies</TabsTrigger> : null}
          {isSupervisor ? <TabsTrigger value="restrictions">Room Restrictions</TabsTrigger> : null}
          {canMaintain ? <TabsTrigger value="maintenance">Maintenance</TabsTrigger> : null}
          {isSupervisor ? <TabsTrigger value="history">History</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <HousekeepingDashboardTab {...props} />
        </TabsContent>
        <TabsContent value="rack" className="mt-6">
          <RoomRackTab {...props} />
        </TabsContent>
        <TabsContent value="board" className="mt-6">
          <CleaningBoardTab {...props} />
        </TabsContent>
        <TabsContent value="inspections" className="mt-6">
          <InspectionsTab {...props} />
        </TabsContent>
        <TabsContent value="discrepancies" className="mt-6">
          <DiscrepanciesTab {...props} />
        </TabsContent>
        <TabsContent value="restrictions" className="mt-6">
          <RestrictionsTab {...props} />
        </TabsContent>
        <TabsContent value="maintenance" className="mt-6">
          <MaintenanceTab {...props} />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <HousekeepingHistoryTab {...props} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
