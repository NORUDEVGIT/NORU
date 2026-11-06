import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Card6IntegrationsTab } from "@/packages/pms/components/settings/pms-card6-integrations-tab";
import { Card6DistributionTab } from "@/packages/pms/components/settings/pms-card6-distribution-tab";
import {
  PropertySetupStatusRail,
  PropertySetupStepNav,
  PropertySetupWorkspaceShell,
} from "@/packages/pms/components/settings/setup-kit";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  CARD6_SIDEBAR_OUT,
  CARD6_SUBTITLE,
  CARD6_TABS,
  type Card6TabId,
} from "@/packages/pms/lib/pms-property-setup-card6";
import { getPmsCard6Integrations } from "@/packages/pms/lib/integrations-card6.functions";
import { getPmsCard6Distribution } from "@/packages/pms/lib/distribution-card6.functions";
import { getFiscalIntegrationStatus } from "@/packages/pms/lib/fiscal/fiscal.functions";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";

/** Card 6 shell for integrations, distribution mapping, and operations. */
export function PmsPropertySetupCard6Section({
  restaurantId,
  canEdit,
  initialTab = "integrations",
}: {
  restaurantId: string;
  canEdit: boolean;
  initialTab?: Card6TabId;
}) {
  const [tab, setTab] = useState<Card6TabId>(initialTab);

  const loadIntegrations = useServerFn(getPmsCard6Integrations);
  const loadDistribution = useServerFn(getPmsCard6Distribution);
  const loadFiscal = useServerFn(getFiscalIntegrationStatus);

  const integrationsQuery = useQuery({
    queryKey: ["pms-card6-integrations", restaurantId],
    queryFn: () => loadIntegrations({ data: { restaurantId } }),
    retry: false,
  });
  const distributionQuery = useQuery({
    queryKey: ["pms-card6-distribution", restaurantId],
    queryFn: () => loadDistribution({ data: { restaurantId } }),
    retry: false,
  });
  const fiscalQuery = useQuery({
    queryKey: ["fiscal-integration", restaurantId],
    queryFn: () => loadFiscal({ data: { restaurantId } }),
    retry: false,
  });

  const hasFiscal = fiscalQuery.data?.status && fiscalQuery.data.status !== "not_configured";
  const hasIntegrations = (integrationsQuery.data?.integrations.length ?? 0) > 0;
  const integrationsDone = hasFiscal || (integrationsQuery.data?.integrations.some((i) => i.enabled) ?? false);
  const integrationsStatus: PropertySetupCardStatus = integrationsDone
    ? "complete"
    : hasIntegrations
      ? "in_progress"
      : "not_started";

  const channels = distributionQuery.data?.channels ?? [];
  const channelsActive = channels.some((c) => c.activationStatus === "active");
  const distributionStatus: PropertySetupCardStatus = channelsActive
    ? "complete"
    : channels.length > 0
      ? "in_progress"
      : "not_started";

  const cardStatus: PropertySetupCardStatus =
    integrationsStatus === "complete" && distributionStatus === "complete"
      ? "complete"
      : integrationsStatus !== "not_started" || distributionStatus !== "not_started"
        ? "in_progress"
        : "not_started";

  const completeCount = (integrationsStatus === "complete" ? 1 : 0) + (distributionStatus === "complete" ? 1 : 0);
  const inProgressCount =
    (integrationsStatus === "in_progress" ? 1 : 0) + (distributionStatus === "in_progress" ? 1 : 0);
  const notStartedCount =
    (integrationsStatus === "not_started" ? 1 : 0) + (distributionStatus === "not_started" ? 1 : 0);

  function goBack() {
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  return (
    <section
      className="flex min-h-[calc(100dvh-3.75rem)] min-w-0 flex-1 flex-col bg-[#F7F4EE]"
      data-testid="pms-card6-workspace"
      data-card-fullscreen="true"
    >
      <div className="sr-only">{CARD6_SIDEBAR_OUT}</div>
      <div className="min-w-0 flex-1" data-testid="pms-card6-fullscreen">
        <PropertySetupWorkspaceShell
          cardNumber={6}
          status={cardStatus}
          description={CARD6_SUBTITLE}
          onBack={goBack}
          footerTestId="pms-card6-chrome"
          rail={
            <div data-testid="pms-card6-status-rail">
              <PropertySetupStatusRail
                complete={completeCount}
                inProgress={inProgressCount}
                notStarted={notStartedCount}
              />
            </div>
          }
          stepNav={
            <PropertySetupStepNav
              activeId={tab}
              onSelect={(id) => {
                const next = CARD6_TABS.find((item) => item.id === id);
                if (next?.available) setTab(id as Card6TabId);
              }}
              steps={CARD6_TABS.map((item, index) => ({
                id: item.id,
                number: index + 1,
                title: item.label,
                status: item.id === "integrations" ? integrationsStatus : distributionStatus,
              }))}
            />
          }
        >
          <Tabs value={tab} onValueChange={(value) => setTab(value as Card6TabId)}>
            <TabsList className="sr-only">
              {CARD6_TABS.map((item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  disabled={!item.available}
                  data-testid={`card6-tab-${item.id}`}
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="integrations">
              <Card6IntegrationsTab restaurantId={restaurantId} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="distribution">
              <Card6DistributionTab
                restaurantId={restaurantId}
                canEdit={canEdit}
                onGoToIntegrations={() => setTab("integrations")}
              />
            </TabsContent>
          </Tabs>
        </PropertySetupWorkspaceShell>
      </div>
    </section>
  );
}
