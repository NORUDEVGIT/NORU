import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Card5DepartmentsTab } from "@/packages/pms/components/settings/pms-card5-departments-tab";
import { Card5OutletsTab } from "@/packages/pms/components/settings/pms-card5-outlets-tab";
import { Card5SalesEventsTab } from "@/packages/pms/components/settings/pms-card5-sales-events-tab";
import { StaffAccessWorkspace } from "@/packages/pms/components/settings/staff-access-workspace";
import {
  LocalSectionNavigator,
  PropertySetupStatusRail,
  PropertySetupWorkspaceShell,
} from "@/packages/pms/components/settings/setup-kit";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { propertySetupRailCounts } from "@/packages/pms/lib/pms-property-setup-ui";
import { propertySetupStatusLabel } from "@/packages/pms/lib/pms-property-setup-card1";
import { getCard5Validation } from "@/packages/pms/lib/pms-property-setup-card5.functions";
import {
  CARD5_HASH,
  CARD5_SUBTITLE,
  CARD5_TABS,
  STAFF_ACCESS_HASH,
  type Card5TabId,
} from "@/packages/pms/lib/pms-property-setup-card5";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { STAFF_ACCESS_STEP_ID, staffAccessStepVisible } from "@/packages/pms/lib/staff-access";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";

type Card5WorkspaceTab = Card5TabId | typeof STAFF_ACCESS_STEP_ID;

function initialCard5Tab(): Card5WorkspaceTab {
  if (typeof window !== "undefined" && window.location.hash.replace(/^#/, "") === STAFF_ACCESS_HASH) {
    return STAFF_ACCESS_STEP_ID;
  }
  return "departments";
}

/** Card 5 workspace. Phases 1–3 implement Departments, Outlets, and Sales & Events setup. */
export function PmsPropertySetupCard5Section({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<Card5WorkspaceTab>(initialCard5Tab);
  const access = usePmsPermissions(restaurantId);
  const showStaff =
    !access.isLoading &&
    staffAccessStepVisible(
      access.can(PMS_PERMISSIONS.STAFF_VIEW),
      access.can(PMS_PERMISSIONS.ROLES_VIEW),
    );
  const showOrg =
    !access.isLoading && (access.can(PMS_PERMISSIONS.CONFIG_ORGANIZATION_VIEW) || canEdit);
  const getValidation = useServerFn(getCard5Validation);
  const overallQuery = useQuery({
    queryKey: ["pms-card5-validation", restaurantId],
    queryFn: () => getValidation({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (access.isLoading) return;
    if (tab === STAFF_ACCESS_STEP_ID && !showStaff && showOrg) setTab("departments");
    if (tab !== STAFF_ACCESS_STEP_ID && !showOrg && showStaff) setTab(STAFF_ACCESS_STEP_ID);
  }, [access.isLoading, showOrg, showStaff, tab]);

  function selectStep(id: string) {
    const next = id as Card5WorkspaceTab;
    setTab(next);
    const hash = next === STAFF_ACCESS_STEP_ID ? STAFF_ACCESS_HASH : CARD5_HASH;
    if (window.location.hash.replace(/^#/, "") !== hash) {
      window.location.hash = hash;
    }
  }

  function goBack() {
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  const overall = overallQuery.data?.overall;
  const railSections = [
    {
      id: "departments",
      title: "Departments",
      status: overallQuery.data?.departments.status ?? "not_started",
    },
    {
      id: "outlets-facilities",
      title: "Outlets & Facilities",
      status: overallQuery.data?.facilities.status ?? "not_started",
    },
    {
      id: "sales-events",
      title: "Sales & Events",
      status: overallQuery.data?.sales.status ?? "not_started",
    },
  ] as const;
  const counts = propertySetupRailCounts(railSections.map((row) => row.status));

  return (
    <section
      className="flex min-h-[calc(100dvh-3.75rem)] min-w-0 flex-1 flex-col bg-[#F7F4EE]"
      data-testid="pms-card5-workspace"
      data-card-fullscreen="true"
    >
      <div className="min-w-0 flex-1" data-testid="pms-card5-fullscreen">
        <PropertySetupWorkspaceShell
          cardNumber={5}
          status={overall?.status ?? "not_started"}
          description={CARD5_SUBTITLE}
          hideTitle
          wide
          footer={null}
          sections={[...railSections]}
          complete={counts.complete}
          inProgress={counts.inProgress}
          notStarted={counts.notStarted}
          blockers={overall?.blockers}
          warnings={overall?.warnings}
          onBack={goBack}
          footerTestId="pms-card5-chrome"
          rail={
            <div data-testid="pms-card5-status-rail">
              <PropertySetupStatusRail
                sections={[...railSections]}
                complete={counts.complete}
                inProgress={counts.inProgress}
                notStarted={counts.notStarted}
                blockers={overall?.blockers}
                warnings={overall?.warnings}
              />
            </div>
          }
          stepNav={
            <div className="min-w-0" data-testid="pms-card5-tabs-slot">
              <p className="sr-only" data-testid="pms-card5-overall-status">
                {overallQuery.isLoading || !overall
                  ? "Checking overall status…"
                  : `Overall: ${propertySetupStatusLabel(overall.status)}`}
              </p>
              <LocalSectionNavigator
                testId="pms-card5-local-section-nav"
                activeId={tab}
                onSelect={selectStep}
                items={[
                  ...(showStaff ? [{ id: STAFF_ACCESS_STEP_ID, label: "Staff & Access" }] : []),
                  ...(showOrg
                    ? CARD5_TABS.map((item) => ({ id: item.id, label: item.label }))
                    : []),
                ]}
              />
            </div>
          }
        >
          {access.isLoading ? <p className="text-sm text-[#756A5B]">Checking access…</p> : null}
          {!access.isLoading && tab === STAFF_ACCESS_STEP_ID ? (
            <StaffAccessWorkspace restaurantId={restaurantId} />
          ) : null}
          {!access.isLoading && tab !== STAFF_ACCESS_STEP_ID ? (
          <Tabs value={tab} onValueChange={(value) => selectStep(value)}>
            <TabsList className="sr-only">
              {CARD5_TABS.map((item) => (
                <TabsTrigger key={item.id} value={item.id} data-testid={`card5-tab-${item.id}`}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {CARD5_TABS.map((item) => (
              <TabsContent key={item.id} value={item.id} className="mt-0">
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
          ) : null}
        </PropertySetupWorkspaceShell>
      </div>
    </section>
  );
}
