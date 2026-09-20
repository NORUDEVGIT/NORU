import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { cn } from "@/shared/lib/utils";
import { Card8ActivationTab } from "@/packages/pms/components/settings/pms-card8-activation-tab";
import { Card8GoliveTab } from "@/packages/pms/components/settings/pms-card8-golive-tab";
import { Card8OfflineTab } from "@/packages/pms/components/settings/pms-card8-offline-tab";
import { Card8ValidationTab } from "@/packages/pms/components/settings/pms-card8-validation-tab";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  CARD1_PMS_NAV,
  propertySetupStatusLabel,
} from "@/packages/pms/lib/pms-property-setup-card1";
import { getCard8Readiness } from "@/packages/pms/lib/pms-property-setup-card8.functions";
import type { Card8DomainReport, Card8Verdict } from "@/packages/pms/lib/card8-readiness.server";
import {
  CARD8_SIDEBAR_OUT,
  CARD8_SUBTITLE,
  CARD8_TABS,
  CARD8_WORKSPACE_TITLE,
  type Card8TabId,
} from "@/packages/pms/lib/pms-property-setup-card8";

function verdictClass(verdict: Card8Verdict) {
  if (verdict === "PASS") return "text-emerald-700";
  if (verdict === "PARTIAL") return "text-[#9A6A12]";
  return "text-destructive";
}

function Card8ReportNotes({ label, slice }: { label: string; slice: Card8DomainReport }) {
  if (slice.blockers.length === 0 && slice.warnings.length === 0) return null;
  const notes = [
    ...slice.blockers.map((message) => ({ message, blocker: true })),
    ...slice.warnings.map((message) => ({ message, blocker: false })),
  ];
  const visible = notes.slice(0, 5);
  return (
    <li className="min-w-0 rounded-xl border p-3">
      <p className="font-medium text-[#251605]">{label}</p>
      {visible.map((item, index) => (
        <p
          key={`${label}-note-${index}`}
          className={cn(
            "mt-1 text-sm",
            item.blocker ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {item.message}
        </p>
      ))}
      {notes.length > visible.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          + {notes.length - visible.length} more. Open the relevant tab for full details.
        </p>
      ) : null}
    </li>
  );
}

/** Card 8 Phase 5 integrates four domains without changing activation ownership. */
export function PmsPropertySetupCard8Section({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<Card8TabId>("offline-sync");
  const [reportOpen, setReportOpen] = useState(false);
  const queryClient = useQueryClient();
  const getReadiness = useServerFn(getCard8Readiness);
  const overallQuery = useQuery({
    queryKey: ["pms-card8-readiness", restaurantId],
    queryFn: () => getReadiness({ data: { restaurantId } }),
  });
  const validate = useMutation({
    mutationFn: () => getReadiness({ data: { restaurantId } }),
    onSuccess: (report) => {
      queryClient.setQueryData(["pms-card8-readiness", restaurantId], report);
      setReportOpen(true);
    },
  });
  const overall = overallQuery.data?.overall;

  function goBack() {
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  return (
    <section
      className="min-h-[calc(100dvh-3.75rem)] bg-[#F7F4EE]"
      data-testid="pms-card8-workspace"
      data-card-fullscreen="true"
    >
      <div className="sr-only">{CARD8_SIDEBAR_OUT}</div>
      <nav
        className="flex flex-wrap items-center gap-1 bg-[#251605] px-4 py-2 text-white"
        data-testid="pms-card8-top-nav"
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

      <div className="min-w-0 overflow-x-auto px-4 py-5 sm:px-6" data-testid="pms-card8-fullscreen">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-[#251605]">{CARD8_WORKSPACE_TITLE}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{CARD8_SUBTITLE}</p>
            <p className="mt-2 text-sm" data-testid="pms-card8-overall-status">
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
              data-testid="pms-card8-overall-validate"
            >
              {validate.isPending ? "Validating…" : "Validate"}
            </Button>
            <Button type="button" variant="outline" onClick={goBack}>
              Back to Property Setup
            </Button>
          </div>
        </div>

        {overallQuery.isError || validate.isError ? (
          <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Overall readiness could not be loaded. No status or activation state was changed.
          </p>
        ) : null}

        {reportOpen && overallQuery.data ? (
          <section
            className="mb-4 min-w-0 rounded-2xl border bg-card p-4"
            data-testid="pms-card8-readiness-report"
            aria-label="Card 8 readiness report"
          >
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {(
                [
                  ["Offline & Sync", overallQuery.data.offline.verdict],
                  ["System Validation", overallQuery.data.validation.verdict],
                  ["Go-Live", overallQuery.data.golive.verdict],
                  ["Property Activation", overallQuery.data.activation.verdict],
                  ["Integrity", overallQuery.data.integrity.verdict],
                  ["Overall", overallQuery.data.overall.verdict],
                ] as const
              ).map(([label, verdict]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className={cn("mt-1 font-medium", verdictClass(verdict))}>{verdict}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
              <Card8ReportNotes label="Offline & Sync" slice={overallQuery.data.offline} />
              <Card8ReportNotes label="System Validation" slice={overallQuery.data.validation} />
              <Card8ReportNotes label="Go-Live" slice={overallQuery.data.golive} />
              <Card8ReportNotes label="Property Activation" slice={overallQuery.data.activation} />
              <Card8ReportNotes
                label="Cross-domain Integrity"
                slice={overallQuery.data.integrity}
              />
            </ul>
          </section>
        ) : null}

        <Tabs value={tab} onValueChange={(value) => setTab(value as Card8TabId)}>
          <TabsList
            className="mb-4 flex h-auto w-full min-w-0 flex-wrap justify-start overflow-x-auto"
            data-testid="pms-card8-tabs-slot"
          >
            {CARD8_TABS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                data-testid={`card8-tab-${item.id}`}
                className="focus-visible:ring-2 focus-visible:ring-[#C89933]"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {CARD8_TABS.map((item) => (
            <TabsContent key={item.id} value={item.id}>
              {item.id === "offline-sync" ? (
                <Card8OfflineTab restaurantId={restaurantId} canEdit={canEdit} />
              ) : item.id === "system-validation" ? (
                <Card8ValidationTab restaurantId={restaurantId} />
              ) : item.id === "go-live" ? (
                <Card8GoliveTab restaurantId={restaurantId} canEdit={canEdit} />
              ) : (
                <Card8ActivationTab restaurantId={restaurantId} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
