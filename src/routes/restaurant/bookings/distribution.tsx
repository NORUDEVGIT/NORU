import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getDistributionAccess } from "@/lib/distribution.functions";
import {
  DistributionChannelsTab,
  DistributionLogsTab,
  DistributionOverviewTab,
  RateMappingTab,
  RoomMappingTab,
  useDistribution,
} from "@/components/distribution/distribution-tabs";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

const TABS = ["overview", "channels", "rooms", "rates", "logs"] as const;
type TabKey = (typeof TABS)[number];

export const Route = createFileRoute("/restaurant/bookings/distribution")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/bookings/distribution" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Distribution — NORU" },
      {
        name: "description",
        content: "Manage your NORU direct booking page, channels, room and rate mappings and distribution activity.",
      },
      { property: "og:title", content: "Distribution — NORU" },
      { property: "og:description", content: "Direct booking channel, mappings and activity log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DistributionRoute,
});

function DistributionRoute() {
  return <RestaurantShell active="Distribution">{(m) => <DistributionPage membership={m} />}</RestaurantShell>;
}

function DistributionPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (searchTab && (TABS as readonly string[]).includes(searchTab)) setTab(searchTab as TabKey);
  }, [searchTab]);

  const fetchAccess = useServerFn(getDistributionAccess);
  const accessQuery = useQuery({
    queryKey: ["distribution-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const overview = useDistribution(restaurantId);

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading distribution…</p>;
  if (!accessQuery.data?.canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Distribution</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can manage distribution for this property.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Configuration · Distribution
        </p>
        <h1 className="font-display text-2xl">Distribution</h1>
        <p className="text-sm text-muted-foreground">
          Your NORU direct booking page and the channel foundation behind it.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="rooms">Room Mapping</TabsTrigger>
          <TabsTrigger value="rates">Rate Mapping</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {overview.isLoading || !overview.data ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <TabsContent value="overview" className="mt-4">
              <DistributionOverviewTab data={overview.data} />
            </TabsContent>
            <TabsContent value="channels" className="mt-4">
              <DistributionChannelsTab data={overview.data} restaurantId={restaurantId} />
            </TabsContent>
            <TabsContent value="rooms" className="mt-4">
              <RoomMappingTab data={overview.data} restaurantId={restaurantId} />
            </TabsContent>
            <TabsContent value="rates" className="mt-4">
              <RateMappingTab data={overview.data} restaurantId={restaurantId} />
            </TabsContent>
            <TabsContent value="logs" className="mt-4">
              <DistributionLogsTab data={overview.data} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
