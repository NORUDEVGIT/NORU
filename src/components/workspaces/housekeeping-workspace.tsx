import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
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
import { useRestaurantTimezone } from "@/core/state/restaurant-context";
import { localDateInZone } from "@/core/lib/restaurant-time";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading, NonPmsOnly } from "@/core/state/pms-context";

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

export function HousekeepingWorkspace({ membership, initialTab }: { membership: RestaurantMembership; initialTab?: string | undefined }) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = useMemo(() => localDateInZone(timezone), [timezone]);
  const searchTab = initialTab;
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
        <h1 className="font-display text-2xl"><PageHeading fallback="Housekeeping" /></h1>
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
        <h1 className="font-display text-2xl"><PageHeading fallback="Housekeeping" /></h1>
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
          <RoomRackTab {...props} canCreateTask={canClean} />
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
