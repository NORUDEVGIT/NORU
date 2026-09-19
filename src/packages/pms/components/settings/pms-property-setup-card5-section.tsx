import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { cn } from "@/shared/lib/utils";
import { Card5DepartmentsTab } from "@/packages/pms/components/settings/pms-card5-departments-tab";
import { Card5OutletsTab } from "@/packages/pms/components/settings/pms-card5-outlets-tab";
import { Card5SalesEventsTab } from "@/packages/pms/components/settings/pms-card5-sales-events-tab";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  CARD1_PMS_NAV,
  propertySetupStatusLabel,
} from "@/packages/pms/lib/pms-property-setup-card1";
import { getCard5Validation } from "@/packages/pms/lib/pms-property-setup-card5.functions";
import {
  CARD5_SIDEBAR_OUT,
  CARD5_SUBTITLE,
  CARD5_TABS,
  CARD5_WORKSPACE_TITLE,
  type Card5TabId,
} from "@/packages/pms/lib/pms-property-setup-card5";
import type { Card5Verdict } from "@/packages/pms/lib/card5-readiness.server";

function verdictClass(verdict: Card5Verdict) {
  if (verdict === "PASS") return "text-emerald-700";
  if (verdict === "PARTIAL") return "text-[#C89933]";
  return "text-destructive";
}

/** Card 5 workspace. Phases 1–3 implement Departments, Outlets, and Sales & Events setup. */
export function PmsPropertySetupCard5Section({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<Card5TabId>("departments");
  const [reportOpen, setReportOpen] = useState(false);
  const queryClient = useQueryClient();
  const getValidation = useServerFn(getCard5Validation);
  const overallQuery = useQuery({
    queryKey: ["pms-card5-validation", restaurantId],
    queryFn: () => getValidation({ data: { restaurantId } }),
  });
  const validate = useMutation({
    mutationFn: () => getValidation({ data: { restaurantId } }),
    onSuccess: (report) => {
      queryClient.setQueryData(["pms-card5-validation", restaurantId], report);
      setReportOpen(true);
    },
  });

  function goBack() {
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  const overall = overallQuery.data?.overall;

  return (
    <section
      className="min-h-[calc(100dvh-3.75rem)] bg-[#F7F4EE]"
      data-testid="pms-card5-workspace"
      data-card-fullscreen="true"
    >
      <div className="sr-only">{CARD5_SIDEBAR_OUT}</div>
      <nav
        className="flex flex-wrap items-center gap-1 bg-[#251605] px-4 py-2 text-white"
        data-testid="pms-card5-top-nav"
        aria-label="PMS"
      >
        {CARD1_PMS_NAV.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
              item.id === "settings"
                ? "bg-[#C89933] text-[#251605]"
                : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="px-4 py-5 sm:px-6" data-testid="pms-card5-fullscreen">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-[#251605]">{CARD5_WORKSPACE_TITLE}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{CARD5_SUBTITLE}</p>
            <p className="mt-2 text-sm" data-testid="pms-card5-overall-status">
              {overallQuery.isLoading || !overall
                ? "Checking overall status…"
                : `Overall: ${propertySetupStatusLabel(overall.status)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => validate.mutate()}
              disabled={validate.isPending}
              data-testid="pms-card5-overall-validate"
            >
              Validate
            </Button>
            <Button type="button" variant="outline" onClick={goBack}>
              Back to Property Setup
            </Button>
          </div>
        </div>

        {reportOpen && overallQuery.data ? (
          <dl
            className="mb-4 grid gap-2 rounded-2xl border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-5"
            data-testid="pms-card5-validation-report"
          >
            {(
              [
                ["Departments", overallQuery.data.departments.verdict],
                ["Outlets & Facilities", overallQuery.data.facilities.verdict],
                ["Sales & Events", overallQuery.data.sales.verdict],
                ["Integrity", overallQuery.data.integrity.verdict],
                ["Overall", overallQuery.data.overall.verdict],
              ] as const
            ).map(([label, verdict]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className={cn("font-medium", verdictClass(verdict))}>{verdict}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <Tabs value={tab} onValueChange={(value) => setTab(value as Card5TabId)}>
          <TabsList
            className="mb-4 flex h-auto w-full flex-wrap justify-start"
            data-testid="pms-card5-tabs-slot"
          >
            {CARD5_TABS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                data-testid={`card5-tab-${item.id}`}
                className="focus-visible:ring-2 focus-visible:ring-[#C89933]"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {CARD5_TABS.map((item) => (
            <TabsContent key={item.id} value={item.id}>
              {item.id === "departments" ? (
                <Card5DepartmentsTab restaurantId={restaurantId} canEdit={canEdit} />
              ) : item.id === "outlets-facilities" ? (
                <Card5OutletsTab restaurantId={restaurantId} canEdit={canEdit} />
              ) : (
                <Card5SalesEventsTab restaurantId={restaurantId} canEdit={canEdit} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
