import { useEffect, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { ArrivalsWorkspace } from "@/components/workspaces/arrivals-workspace";
import { FrontOfficeSummary } from "@/components/frontoffice/front-office-summary";
import { DeparturesList, InHouseList } from "@/components/frontoffice/stay-lists";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading } from "@/core/state/pms-context";

const TABS = ["overview", "arrivals", "checkin", "assignment", "inhouse", "departures"] as const;
type FrontOfficeTabKey = (typeof TABS)[number];

/**
 * Phase 7D.2F1 — canonical Front Office desk. Every tab reuses an existing
 * screen and the existing server functions; nothing here adds a new data path.
 */
export function FrontOfficeWorkspace({
  membership,
  initialTab,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const [tab, setTab] = useState<FrontOfficeTabKey>("overview");

  useEffect(() => {
    if (initialTab && (TABS as readonly string[]).includes(initialTab)) {
      setTab(initialTab as FrontOfficeTabKey);
    }
  }, [initialTab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">
          <PageHeading fallback="Front Office" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Arrivals, check-in, room assignment, in-house guests and departures for {membership.restaurant.name}.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as FrontOfficeTabKey)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="arrivals">Arrivals</TabsTrigger>
          <TabsTrigger value="checkin">Check-in</TabsTrigger>
          <TabsTrigger value="assignment">Room assignment</TabsTrigger>
          <TabsTrigger value="inhouse">In-house</TabsTrigger>
          <TabsTrigger value="departures">Departures</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <FrontOfficeSummary restaurantId={restaurantId} />
        </TabsContent>
        <TabsContent value="arrivals" className="mt-4">
          <ArrivalsWorkspace membership={membership} variant="arrivals" embedded />
        </TabsContent>
        <TabsContent value="checkin" className="mt-4">
          <ArrivalsWorkspace membership={membership} variant="checkin" embedded />
        </TabsContent>
        <TabsContent value="assignment" className="mt-4">
          <ArrivalsWorkspace membership={membership} variant="assignment" embedded />
        </TabsContent>
        <TabsContent value="inhouse" className="mt-4">
          <InHouseList restaurantId={restaurantId} propertyName={membership.restaurant.name} />
        </TabsContent>
        <TabsContent value="departures" className="mt-4">
          <DeparturesList restaurantId={restaurantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
