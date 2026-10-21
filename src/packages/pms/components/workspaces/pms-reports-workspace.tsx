/**
 * Reports workspace. Analytics readers stay on the existing desk.
 * Police reads getPoliceStayReport. Cashier stays a placeholder.
 * The house date is restaurants.business_date via getPropertyBusinessDate.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { ReportsChrome } from "@/packages/pms/components/reports/reports-chrome";
import { ReportsCatalogue } from "@/packages/pms/components/reports/reports-catalogue";
import { ReportsDesk } from "@/packages/pms/components/reports/reports-desk";
import { ReportMissingState } from "@/packages/pms/components/reports/report-states";
import { PoliceStayReportScreen } from "@/packages/pms/components/reports/police-stay-report-screen";
import { RowReportPlaceholder } from "@/packages/pms/components/reports/row-report-placeholder";
import { RevenueOverviewTab } from "@/packages/pms/components/rates/rates-tabs";
import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";
import {
  isAnalyticsReport,
  reportByCode,
  reportsReaderDate,
  reportsSearch,
  resolveReportsView,
  sameReportsSearch,
  type ReportGroupId,
  type ReportId,
  type ReportPageSize,
  type ReportsRouteSearch,
} from "@/packages/pms/lib/reports-shell";

function rowSearchFilters(search: ReportsRouteSearch): Partial<ReportsRouteSearch> {
  const filters: Partial<ReportsRouteSearch> = {};
  if (search.stayDate) filters.stayDate = search.stayDate;
  if (search.from) filters.from = search.from;
  if (search.to) filters.to = search.to;
  if (search.documentType) filters.documentType = search.documentType;
  if (search.page) filters.page = search.page;
  if (search.pageSize) filters.pageSize = search.pageSize;
  if (search.presence) filters.presence = search.presence;
  if (search.name) filters.name = search.name;
  if (search.nationality) filters.nationality = search.nationality;
  if (search.room) filters.room = search.room;
  return filters;
}

export function PmsReportsWorkspace({
  membership,
  search,
}: {
  membership: RestaurantMembership;
  search: ReportsRouteSearch;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const view = resolveReportsView(search);
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const fetchDate = useServerFn(getPropertyBusinessDate);
  const dateQuery = useQuery({
    queryKey: ["property-business-date", restaurantId],
    queryFn: () => fetchDate({ data: { restaurantId } }),
    retry: false,
  });
  const businessDate = dateQuery.data?.businessDate ?? null;
  const timezone = dateQuery.data?.timezone ?? null;

  useEffect(() => {
    const next = resolveReportsView(search);
    const filters = next.kind === "row" ? rowSearchFilters(search) : undefined;
    if (
      next.kind === "row" &&
      next.report === "police" &&
      filters &&
      !filters.stayDate &&
      businessDate
    ) {
      filters.stayDate = reportsReaderDate(businessDate);
    }
    const canonical = reportsSearch(next, filters);
    if (sameReportsSearch(search, canonical)) return;
    void navigate({
      to: "/restaurant/pms/reports",
      search: canonical,
      replace: true,
    });
  }, [businessDate, navigate, search]);

  function goCenter(group?: ReportGroupId) {
    void navigate({
      to: "/restaurant/pms/reports",
      search: reportsSearch(
        group
          ? { kind: "center", group, topic: null }
          : { kind: "center", group: null, topic: null },
      ),
    });
  }

  function goReport(id: ReportId) {
    void navigate({
      to: "/restaurant/pms/reports",
      search: reportsSearch(resolveReportsView({ report: id })),
    });
  }

  function goPage(page: number, pageSize: ReportPageSize) {
    if (view.kind !== "row") return;
    void navigate({
      to: "/restaurant/pms/reports",
      search: reportsSearch(view, { ...rowSearchFilters(search), page, pageSize }),
    });
  }

  const revenue = reportByCode("revenue");
  const openRow = view.kind === "row" ? reportByCode(view.report) : null;

  let body = null;
  if (dateQuery.isLoading) {
    body = <p className="text-sm text-muted-foreground">Loading the house date…</p>;
  } else if (dateQuery.isError || !businessDate || !timezone) {
    body = (
      <p className="text-sm text-muted-foreground">
        The house date could not be loaded, so reports are not shown.
      </p>
    );
  } else if (view.kind === "missing") {
    body = <ReportMissingState onBack={() => goCenter()} />;
  } else if (view.kind === "row" && view.report === "police" && openRow?.kind === "row") {
    const detail = [membership.restaurant.address, membership.restaurant.city]
      .map((part) => (part ?? "").trim())
      .filter((part) => part.length > 0)
      .join(", ");
    body = (
      <PoliceStayReportScreen
        restaurantId={restaurantId}
        propertyName={membership.restaurant.name}
        propertyDetail={detail || null}
        businessDate={reportsReaderDate(businessDate)}
        timezone={timezone}
        search={search}
      />
    );
  } else if (view.kind === "row" && openRow && openRow.kind === "row") {
    body = (
      <RowReportPlaceholder
        definition={openRow}
        businessDate={reportsReaderDate(businessDate)}
        timezone={timezone}
        page={view.page}
        pageSize={view.pageSize}
        onPageChange={goPage}
      />
    );
  } else if (
    view.kind === "analytics" &&
    view.report === "revenue" &&
    revenue &&
    isAnalyticsReport(revenue)
  ) {
    body = (
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
    );
  } else if (view.kind === "analytics") {
    body = (
      <ReportsDesk restaurantId={restaurantId} businessDate={businessDate} report={view.report} />
    );
  } else {
    const scope = view.group ?? view.topic;
    body = <ReportsCatalogue query={catalogueQuery} scope={scope} onOpenReport={goReport} />;
  }

  return (
    <ReportsChrome
      membership={membership}
      view={view}
      onOpenCenter={() => goCenter()}
      onOpenCategory={(group) => goCenter(group)}
      onSearch={setCatalogueQuery}
    >
      {body}
    </ReportsChrome>
  );
}
