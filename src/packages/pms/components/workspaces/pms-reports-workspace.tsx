/**
 * Reports Phase 0. Figures come from existing PMS readers.
 * The house date is restaurants.business_date via getPropertyBusinessDate.
 * This workspace does not export, schedule, or write source data.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { ReportsChrome } from "@/packages/pms/components/reports/reports-chrome";
import { ReportsDesk } from "@/packages/pms/components/reports/reports-desk";
import { RevenueOverviewTab } from "@/packages/pms/components/rates/rates-tabs";
import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";
import {
  reportByCode,
  reportsReaderDate,
  reportsSearch,
  resolveReportsView,
  type ReportCategory,
  type ReportCode,
} from "@/packages/pms/lib/reports-shell";

export function PmsReportsWorkspace({
  membership,
  initialTab,
  initialReport,
  initialCategory,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
  initialReport?: string | undefined;
  initialCategory?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const view = resolveReportsView({
    tab: initialTab,
    report: initialReport,
    category: initialCategory,
  });
  const [catalogueQuery, setCatalogueQuery] = useState("");

  useEffect(() => {
    const next = resolveReportsView({
      tab: initialTab,
      report: initialReport,
      category: initialCategory,
    });
    const canonical = reportsSearch(next);
    if (!initialTab && !initialReport && !initialCategory && canonical.tab === "center" && !canonical.category) {
      return;
    }
    if (
      initialTab === canonical.tab &&
      initialReport === canonical.report &&
      initialCategory === canonical.category
    ) {
      return;
    }
    void navigate({
      to: "/restaurant/pms/reports",
      search: canonical,
      replace: true,
    });
  }, [initialCategory, initialReport, initialTab, navigate]);

  const fetchDate = useServerFn(getPropertyBusinessDate);
  const dateQuery = useQuery({
    queryKey: ["property-business-date", restaurantId],
    queryFn: () => fetchDate({ data: { restaurantId } }),
    retry: false,
  });

  function goCenter(category?: ReportCategory) {
    void navigate({
      to: "/restaurant/pms/reports",
      search: reportsSearch(category ? { tab: "center", category } : { tab: "center" }),
    });
  }

  function goReport(code: ReportCode) {
    void navigate({
      to: "/restaurant/pms/reports",
      search: reportsSearch({ tab: "report", report: code }),
    });
  }

  const businessDate = dateQuery.data?.businessDate ?? null;
  const revenue = reportByCode("revenue");

  return (
    <ReportsChrome
      membership={membership}
      view={view}
      onOpenCenter={() => goCenter()}
      onOpenCategory={(category) => goCenter(category)}
      onSearch={setCatalogueQuery}
    >
      {dateQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the house date…</p>
      ) : dateQuery.isError || !businessDate ? (
        <p className="text-sm text-muted-foreground">The house date could not be loaded, so reports are not shown.</p>
      ) : view.tab === "report" && view.report === "revenue" && revenue ? (
        <div className="space-y-4" data-testid="reports-report-revenue">
          <p className="text-sm text-muted-foreground" data-testid="reports-caption-revenue">
            {revenue.caption}
          </p>
          <Link
            to="/restaurant/pms/rates-revenue"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            {revenue.ownerLabel}
          </Link>
          <RevenueOverviewTab restaurantId={restaurantId} today={reportsReaderDate(businessDate)} />
        </div>
      ) : (
        <ReportsDesk
          restaurantId={restaurantId}
          businessDate={businessDate}
          report={view.tab === "report" ? view.report : null}
          category={view.tab === "center" ? view.category : null}
          catalogueQuery={catalogueQuery}
          onOpenReport={goReport}
        />
      )}
    </ReportsChrome>
  );
}
