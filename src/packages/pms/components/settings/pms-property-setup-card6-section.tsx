import { useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { cn } from "@/shared/lib/utils";
import { Card6IntegrationsTab } from "@/packages/pms/components/settings/pms-card6-integrations-tab";
import { Card6DistributionTab } from "@/packages/pms/components/settings/pms-card6-distribution-tab";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { CARD1_PMS_NAV } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  CARD6_SIDEBAR_OUT,
  CARD6_SUBTITLE,
  CARD6_TABS,
  CARD6_WORKSPACE_TITLE,
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
      className="min-h-[calc(100dvh-3.75rem)] bg-[#F7F4EE]"
      data-testid="pms-card6-workspace"
      data-card-fullscreen="true"
    >
      <div className="sr-only">{CARD6_SIDEBAR_OUT}</div>
      <nav
        className="flex flex-wrap items-center gap-1 bg-[#251605] px-4 py-2 text-white"
        data-testid="pms-card6-top-nav"
        aria-label="PMS"
      >
        {CARD1_PMS_NAV.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs",
              item.id === "settings"
                ? "bg-[#C89933] text-[#251605]"
                : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="px-4 py-5 sm:px-6" data-testid="pms-card6-fullscreen">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-[#251605]">{CARD6_WORKSPACE_TITLE}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{CARD6_SUBTITLE}</p>
          </div>
          <Button type="button" variant="outline" onClick={goBack}>
            Back to Property Setup
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as Card6TabId)}>
          <TabsList className="mb-4">
            {CARD6_TABS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                disabled={!item.available}
                data-testid={`card6-tab-${item.id}`}
              >
                {item.label}
                {item.available ? null : (
                  <span className="ml-2 rounded-full border border-[#CCCCCC] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Later
                  </span>
                )}
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
      </div>
    </section>
  );
}
