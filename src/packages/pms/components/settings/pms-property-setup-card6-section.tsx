import { useState } from "react";

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
          status="not_started"
          description={CARD6_SUBTITLE}
          onBack={goBack}
          footerTestId="pms-card6-chrome"
          rail={
            <div data-testid="pms-card6-status-rail">
              <PropertySetupStatusRail complete={0} inProgress={0} notStarted={0} />
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
                status: "not_started",
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
