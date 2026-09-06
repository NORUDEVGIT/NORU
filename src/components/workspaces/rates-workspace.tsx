import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRatesAccess } from "@/lib/rates.functions";
import {
  RateCalendarTab,
  RatePlansTab,
  RateRestrictionsTab,
  RevenueOverviewTab,
} from "@/components/rates/rates-tabs";
import { propertyToday } from "@/lib/reservation-dates";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

const TABS = ["overview", "plans", "calendar", "restrictions"] as const;
type RatesTabKey = (typeof TABS)[number];

export function RatesWorkspace({ membership, initialTab }: { membership: RestaurantMembership; initialTab?: string }) {
  const restaurantId = membership.restaurant.id;
  const today = propertyToday(membership.restaurant.timezone);
  const searchTab = initialTab;
  const [tab, setTab] = useState<RatesTabKey>("overview");

  useEffect(() => {
    if (searchTab && (TABS as readonly string[]).includes(searchTab)) setTab(searchTab as RatesTabKey);
  }, [searchTab]);

  const fetchAccess = useServerFn(getRatesAccess);
  const accessQuery = useQuery({
    queryKey: ["rates-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading rates…</p>;
  if (!accessQuery.data?.canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Rates & Revenue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access rates and revenue for this property.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Configuration · Rates &amp; Revenue
        </p>
        <h1 className="font-display text-2xl">Rates & Revenue</h1>
        <p className="text-sm text-muted-foreground">
          Rate plans, daily rates, restrictions and revenue performance for {membership.restaurant.name}.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as RatesTabKey)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plans">Rate Plans</TabsTrigger>
          <TabsTrigger value="calendar">Rate Calendar</TabsTrigger>
          <TabsTrigger value="restrictions">Restrictions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <RevenueOverviewTab restaurantId={restaurantId} today={today} />
        </TabsContent>
        <TabsContent value="plans" className="mt-4">
          <RatePlansTab restaurantId={restaurantId} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <RateCalendarTab restaurantId={restaurantId} today={today} />
        </TabsContent>
        <TabsContent value="restrictions" className="mt-4">
          <RateRestrictionsTab restaurantId={restaurantId} today={today} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
