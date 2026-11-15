import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { resolvePmsReturnTo } from "@/packages/pms/lib/cashiering-shell";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { getDistributionAccess } from "@/packages/pms/lib/distribution.functions";
import {
  DistributionChannelsTab,
  DistributionLogsTab,
  DistributionOverviewTab,
  RateMappingTab,
  RoomMappingTab,
  useDistribution,
} from "@/packages/pms/components/distribution/distribution-tabs";
import { AiosellWorkspacePanel } from "@/packages/pms/components/workspaces/aiosell-workspace-panel";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading, NonPmsOnly } from "@/core/state/pms-context";

const TABS = ["overview", "channels", "rooms", "rates", "logs", "aiosell"] as const;
export type DistributionSubTabKey = (typeof TABS)[number];
type TabKey = DistributionSubTabKey;

export function DistributionWorkspace({
  membership,
  initialTab,
  returnTo,
  returnToLabel,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
  returnTo?: string | undefined;
  returnToLabel?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const { hasPrevious, computedLabel, handleReturn } = resolvePmsReturnTo({
    returnTo,
    returnToLabel,
  });
  const searchTab = initialTab;
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (searchTab && (TABS as readonly string[]).includes(searchTab)) setTab(searchTab as TabKey);
  }, [searchTab]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3" data-testid="distribution-desk-header">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Configuration · Distribution
          </p>
          <h1 className="font-display text-2xl">
            <PageHeading fallback="Distribution" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Your NORU direct booking page and the channel foundation behind it.
          </p>
        </div>

        {hasPrevious ? (
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReturn}
              data-testid="distribution-return-to-previous"
              className="h-8 gap-1.5 px-3 text-xs font-semibold text-[#5C5346] hover:text-[#251605] border-[#D6CDBF] bg-white shadow-xs hover:bg-[#FAF8F4] transition-all"
            >
              <ArrowLeft className="size-3.5 text-[#8A6A24]" />
              {computedLabel}
            </Button>
          </div>
        ) : null}
      </div>

      <DistributionSubTabs restaurantId={restaurantId} tab={tab} onTabChange={setTab} />
    </div>
  );
}

const SUB_TAB_LABELS: Record<TabKey, string> = {
  overview: "Overview",
  channels: "Channels",
  rooms: "Room Mapping",
  rates: "Rate Mapping",
  logs: "Logs",
  aiosell: "Aiosell",
};

/**
 * Overview · Channels · Room Mapping · Rate Mapping · Logs · Aiosell.
 * Rendered in Settings → Connectivity & Distribution → Distribution.
 */
export function DistributionSubTabs({
  restaurantId,
  tab: controlledTab,
  onTabChange,
  channelsExtra,
}: {
  restaurantId: string;
  tab?: TabKey;
  onTabChange?: (tab: TabKey) => void;
  channelsExtra?: ReactNode;
}) {
  const [localTab, setLocalTab] = useState<TabKey>("overview");
  const tab = controlledTab ?? localTab;
  const setTab = onTabChange ?? setLocalTab;

  const fetchAccess = useServerFn(getDistributionAccess);
  const accessQuery = useQuery({
    queryKey: ["distribution-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const overview = useDistribution(restaurantId);

  if (accessQuery.isLoading)
    return <p className="text-sm text-[#7A6A55]">Loading distribution…</p>;
  if (!accessQuery.data?.canView) {
    return (
      <p className="rounded-xl border border-[#E6E1D8] bg-white p-4 text-sm text-[#7A6A55]">
        You don't have permission to open Distribution for this property.
      </p>
    );
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} data-testid="distribution-sub-tabs">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-[#E6E1D8] bg-[#FBF7EE] p-1">
        {TABS.map((key) => (
          <TabsTrigger
            key={key}
            value={key}
            data-testid={`distribution-sub-tab-${key}`}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#7A6A55] data-[state=active]:bg-white data-[state=active]:text-[#251605] data-[state=active]:shadow-sm"
          >
            {SUB_TAB_LABELS[key]}
          </TabsTrigger>
        ))}
      </TabsList>

      {overview.isLoading || !overview.data ? (
        <p className="mt-3 text-sm text-[#7A6A55]">Loading…</p>
      ) : (
        <>
          <TabsContent value="overview" className="mt-3">
            <DistributionOverviewTab data={overview.data} />
          </TabsContent>
          <TabsContent value="channels" className="mt-3 space-y-3">
            <DistributionChannelsTab
              data={overview.data}
              restaurantId={restaurantId}
              omitChannelList={channelsExtra != null}
            />
            {channelsExtra}
          </TabsContent>
          <TabsContent value="rooms" className="mt-3">
            <RoomMappingTab data={overview.data} restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="rates" className="mt-3">
            <RateMappingTab data={overview.data} restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="logs" className="mt-3">
            <DistributionLogsTab data={overview.data} />
          </TabsContent>
        </>
      )}
      <TabsContent value="aiosell" className="mt-3">
        <AiosellWorkspacePanel restaurantId={restaurantId} />
      </TabsContent>
    </Tabs>
  );
}
