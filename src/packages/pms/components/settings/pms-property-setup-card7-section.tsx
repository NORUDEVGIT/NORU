import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { cn } from "@/shared/lib/utils";
import { Card7AuditTab } from "@/packages/pms/components/settings/pms-card7-audit-tab";
import { Card7ImportTab } from "@/packages/pms/components/settings/pms-card7-import-tab";
import { Card7ReportsTab } from "@/packages/pms/components/settings/pms-card7-reports-tab";
import { Card7SecurityRolesTab } from "@/packages/pms/components/settings/pms-card7-security-roles-tab";
import { PmsPropertySetupCard7Workspace } from "@/packages/pms/components/settings/pms-property-setup-card7-workspace";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  CARD1_PMS_NAV,
  propertySetupStatusLabel,
} from "@/packages/pms/lib/pms-property-setup-card1";
import { getCard7Validation } from "@/packages/pms/lib/pms-property-setup-card7.functions";
import {
  CARD7_PHASE0_PLACEHOLDER,
  CARD7_SIDEBAR_OUT,
  CARD7_SUBTITLE,
  CARD7_TABS,
  CARD7_WORKSPACE_TITLE,
  type Card7TabId,
} from "@/packages/pms/lib/pms-property-setup-card7";
import type { Card7DomainReport, Card7Verdict } from "@/packages/pms/lib/card7-readiness.server";

function verdictClass(verdict: Card7Verdict) {
  if (verdict === "PASS") return "text-emerald-700";
  if (verdict === "PARTIAL") return "text-[#C89933]";
  return "text-destructive";
}

function Card7Placeholder({ description }: { description: string }) {
  return (
    <PmsPropertySetupCard7Workspace
      status={<p className="text-sm text-muted-foreground">Not started</p>}
      actions={
        <p className="text-xs text-muted-foreground">Save Draft · Validate · Activate</p>
      }
    >
      <div className="rounded-2xl border border-dashed border-[#D8CDBB] bg-card p-6">
        <p className="text-sm text-[#251605]">{description}</p>
        <p className="mt-2 text-sm text-muted-foreground">{CARD7_PHASE0_PLACEHOLDER}</p>
      </div>
    </PmsPropertySetupCard7Workspace>
  );
}

function Card7ReportNotes({
  label,
  slice,
}: {
  label: string;
  slice: Card7DomainReport;
}) {
  if (slice.blockers.length === 0 && slice.warnings.length === 0) return null;
  return (
    <li className="min-w-0">
      <p className="font-medium text-[#251605]">{label}</p>
      {slice.blockers.map((item, index) => (
        <p key={`${label}-blocker-${index}`} className="text-destructive">
          {item}
        </p>
      ))}
      {slice.warnings.map((item, index) => (
        <p key={`${label}-warning-${index}`} className="text-muted-foreground">
          {item}
        </p>
      ))}
    </li>
  );
}

/** Card 7 workspace. Phase 5 integrates overall readiness across the four setup domains. */
export function PmsPropertySetupCard7Section({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<Card7TabId>("security-roles");
  const [reportOpen, setReportOpen] = useState(false);
  const queryClient = useQueryClient();
  const getValidation = useServerFn(getCard7Validation);
  const overallQuery = useQuery({
    queryKey: ["pms-card7-validation", restaurantId],
    queryFn: () => getValidation({ data: { restaurantId } }),
  });
  const validate = useMutation({
    mutationFn: () => getValidation({ data: { restaurantId } }),
    onSuccess: (report) => {
      queryClient.setQueryData(["pms-card7-validation", restaurantId], report);
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
      data-testid="pms-card7-workspace"
      data-card-fullscreen="true"
    >
      <div className="sr-only">{CARD7_SIDEBAR_OUT}</div>
      <nav
        className="flex flex-wrap items-center gap-1 bg-[#251605] px-4 py-2 text-white"
        data-testid="pms-card7-top-nav"
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

      <div className="min-w-0 overflow-x-auto px-4 py-5 sm:px-6" data-testid="pms-card7-fullscreen">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-[#251605]">{CARD7_WORKSPACE_TITLE}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{CARD7_SUBTITLE}</p>
            <p className="mt-2 text-sm" data-testid="pms-card7-overall-status">
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
              data-testid="pms-card7-overall-validate"
            >
              Validate
            </Button>
            <Button type="button" variant="outline" onClick={goBack}>
              Back to Property Setup
            </Button>
          </div>
        </div>

        {reportOpen && overallQuery.data ? (
          <div className="mb-4 min-w-0 overflow-x-auto rounded-2xl border bg-card p-4 text-sm" data-testid="pms-card7-validation-report">
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {(
                [
                  ["Security & Roles", overallQuery.data.security.verdict],
                  ["Audit", overallQuery.data.audit.verdict],
                  ["Reports", overallQuery.data.reports.verdict],
                  ["Data Import", overallQuery.data.importDomain.verdict],
                  ["Integrity", overallQuery.data.integrity.verdict],
                  ["Overall", overallQuery.data.overall.verdict],
                ] as const
              ).map(([label, verdict]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className={cn("font-medium", verdictClass(verdict))}>{verdict}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-3 space-y-2 text-xs">
              <Card7ReportNotes label="Security & Roles" slice={overallQuery.data.security} />
              <Card7ReportNotes label="Audit" slice={overallQuery.data.audit} />
              <Card7ReportNotes label="Reports" slice={overallQuery.data.reports} />
              <Card7ReportNotes label="Data Import" slice={overallQuery.data.importDomain} />
              <Card7ReportNotes label="Integrity" slice={overallQuery.data.integrity} />
            </ul>
          </div>
        ) : null}

        <Tabs value={tab} onValueChange={(value) => setTab(value as Card7TabId)}>
          <TabsList
            className="mb-4 flex h-auto w-full min-w-0 flex-wrap justify-start overflow-x-auto"
            data-testid="pms-card7-tabs-slot"
          >
            {CARD7_TABS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                data-testid={`card7-tab-${item.id}`}
                className="focus-visible:ring-2 focus-visible:ring-[#C89933]"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {CARD7_TABS.map((item) => (
            <TabsContent key={item.id} value={item.id}>
              {item.id === "security-roles" ? (
                <Card7SecurityRolesTab restaurantId={restaurantId} canEdit={canEdit} />
              ) : item.id === "audit" ? (
                <Card7AuditTab restaurantId={restaurantId} canEdit={canEdit} />
              ) : item.id === "reports-analytics" ? (
                <Card7ReportsTab restaurantId={restaurantId} canEdit={canEdit} />
              ) : item.id === "data-import-migration" ? (
                <Card7ImportTab restaurantId={restaurantId} canEdit={canEdit} />
              ) : (
                <Card7Placeholder description={item.description} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
