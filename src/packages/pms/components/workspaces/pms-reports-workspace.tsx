/**
 * Reports workspace. Unified single-window report viewer.
 * Users can switch between report types via the Report Type dropdown at any time.
 * Analytics readers stay on the existing desk.
 * Police reads getPoliceStayReport. Cashier reads getCashierInvoiceReport.
 * Fiscal reads getFiscalRegistrationReport.
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
import { CashierInvoiceReportScreen } from "@/packages/pms/components/reports/cashier-invoice-report-screen";
import { FiscalRegistrationReportScreen } from "@/packages/pms/components/reports/fiscal-registration-report-screen";
import { PoliceStayReportScreen } from "@/packages/pms/components/reports/police-stay-report-screen";
import { ServiceEntitlementReportScreen } from "@/packages/pms/components/reports/service-entitlement-report-screen";
import { RevenueOverviewTab } from "@/packages/pms/components/rates/rates-tabs";
import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";
import { resolvePmsReturnTo } from "@/packages/pms/lib/cashiering-shell";
import {
  isAnalyticsReport,
  reportByCode,
  reportsReaderDate,
  reportsSearch,
  resolveReportsView,
  sameReportsSearch,
  type ReportGroupId,
  type ReportId,
  type ReportsRouteSearch,
} from "@/packages/pms/lib/reports-shell";

function rowSearchFilters(search: ReportsRouteSearch): Partial<ReportsRouteSearch> {
  const filters: Partial<ReportsRouteSearch> = {};
  if (search.stayDate) filters.stayDate = search.stayDate;
  if (search.from) filters.from = search.from;
  if (search.to) filters.to = search.to;
  if (search.documentType) filters.documentType = search.documentType;
  if (search.grain) filters.grain = search.grain;
  if (search.query) filters.query = search.query;
  if (search.issuer) filters.issuer = search.issuer;
  if (search.mode) filters.mode = search.mode;
  if (search.status) filters.status = search.status;
  if (search.page) filters.page = search.page;
  if (search.pageSize) filters.pageSize = search.pageSize;
  if (search.presence) filters.presence = search.presence;
  if (search.name) filters.name = search.name;
  if (search.nationality) filters.nationality = search.nationality;
  if (search.room) filters.room = search.room;
  if (search.serviceDate) filters.serviceDate = search.serviceDate;
  if (search.meal) filters.meal = search.meal;
  if (search.department) filters.department = search.department;
  if (search.stay === "in-house" || search.stay === "confirmed") filters.stay = search.stay;
  if (search.returnTo) filters.returnTo = search.returnTo;
  if (search.returnToLabel) filters.returnToLabel = search.returnToLabel;
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

  const { hasPrevious, computedLabel, handleReturn } = resolvePmsReturnTo({
    returnTo: search.returnTo,
    returnToLabel: search.returnToLabel,
  });

  // Single window: if landing with no report selected or an analytics view, default directly to Police Stay Report
  useEffect(() => {
    const next = resolveReportsView(search);
    if ((next.kind === "center" || next.kind === "analytics") && businessDate) {
      const canonical = reportsSearch(
        resolveReportsView({ report: "police" }),
        {
          stayDate: reportsReaderDate(businessDate),
          returnTo: search.returnTo,
          returnToLabel: search.returnToLabel,
        },
      );
      void navigate({
        to: "/restaurant/pms/reports",
        search: canonical,
        replace: true,
      });
      return;
    }

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
    if (next.kind === "row" && next.report === "cashier-invoice" && filters && businessDate) {
      const houseDate = reportsReaderDate(businessDate);
      if (!filters.from) filters.from = houseDate;
      if (!filters.to) filters.to = houseDate;
      if (!filters.documentType) filters.documentType = "INV";
    }
    if (next.kind === "row" && next.report === "fiscal-registration" && filters && businessDate) {
      const houseDate = reportsReaderDate(businessDate);
      if (!filters.from) filters.from = houseDate;
      if (!filters.to) filters.to = houseDate;
      if (!filters.documentType) filters.documentType = "INV";
    }
    if (
      next.kind === "row" &&
      (next.report === "meal-service" || next.report === "service-fulfillment") &&
      filters &&
      businessDate
    ) {
      if (!filters.serviceDate) filters.serviceDate = reportsReaderDate(businessDate);
      if (next.report === "meal-service" && !filters.meal) filters.meal = "BREAKFAST";
    }
    const canonical = reportsSearch(next, filters);
    if (sameReportsSearch(search, canonical)) return;
    void navigate({
      to: "/restaurant/pms/reports",
      search: canonical,
      replace: true,
    });
  }, [businessDate, navigate, search]);

  function goReport(id: ReportId) {
    const nextView = resolveReportsView({ report: id });
    const filters: Partial<ReportsRouteSearch> = nextView.kind === "row" ? rowSearchFilters(search) : {};
    if (search.returnTo) {
      filters.returnTo = search.returnTo;
      if (search.returnToLabel) filters.returnToLabel = search.returnToLabel;
    }
    if (nextView.kind === "row" && nextView.report === "police" && !filters.stayDate && businessDate) {
      filters.stayDate = reportsReaderDate(businessDate);
    }
    if (
      nextView.kind === "row" &&
      (nextView.report === "cashier-invoice" || nextView.report === "fiscal-registration") &&
      businessDate
    ) {
      const houseDate = reportsReaderDate(businessDate);
      if (!filters.from) filters.from = houseDate;
      if (!filters.to) filters.to = houseDate;
      if (!filters.documentType) filters.documentType = "INV";
    }
    if (
      nextView.kind === "row" &&
      (nextView.report === "meal-service" || nextView.report === "service-fulfillment") &&
      businessDate
    ) {
      if (!filters.serviceDate) filters.serviceDate = reportsReaderDate(businessDate);
      if (nextView.report === "meal-service" && !filters.meal) filters.meal = "BREAKFAST";
    }
    void navigate({
      to: "/restaurant/pms/reports",
      search: reportsSearch(nextView, filters),
    });
  }

  function goCenter(group?: ReportGroupId) {
    goReport("police");
  }

  const revenue = reportByCode("revenue");
  const openRow = view.kind === "row" ? reportByCode(view.report) : null;
  const currentReportId: ReportId =
    view.kind === "row" || view.kind === "analytics" ? view.report : "police";

  let body = null;
  if (dateQuery.isLoading) {
    body = (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading the house date…
      </div>
    );
  } else if (dateQuery.isError || !businessDate || !timezone) {
    body = (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        The house date could not be loaded, so reports are not shown.
      </div>
    );
  } else if (view.kind === "missing") {
    body = <ReportMissingState onBack={() => goReport("police")} />;
  } else if (
    (view.kind === "row" && view.report === "police" && openRow?.kind === "row") ||
    view.kind === "center"
  ) {
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
  } else if (view.kind === "row" && view.report === "cashier-invoice" && openRow?.kind === "row") {
    body = (
      <CashierInvoiceReportScreen
        restaurantId={restaurantId}
        propertyName={membership.restaurant.name}
        businessDate={reportsReaderDate(businessDate)}
        timezone={timezone}
        search={search}
      />
    );
  } else if (
    view.kind === "row" &&
    view.report === "fiscal-registration" &&
    openRow?.kind === "row"
  ) {
    body = (
      <FiscalRegistrationReportScreen
        restaurantId={restaurantId}
        propertyName={membership.restaurant.name}
        businessDate={reportsReaderDate(businessDate)}
        timezone={timezone}
        search={search}
      />
    );
  } else if (
    view.kind === "row" &&
    (view.report === "meal-service" || view.report === "service-fulfillment") &&
    openRow?.kind === "row"
  ) {
    body = (
      <ServiceEntitlementReportScreen
        restaurantId={restaurantId}
        propertyName={membership.restaurant.name}
        businessDate={reportsReaderDate(businessDate)}
        report={view.report}
        search={search}
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
    // Fallback: render police stay report in unified window
    body = (
      <PoliceStayReportScreen
        restaurantId={restaurantId}
        propertyName={membership.restaurant.name}
        propertyDetail={null}
        businessDate={reportsReaderDate(businessDate)}
        timezone={timezone}
        search={search}
      />
    );
  }

  return (
    <ReportsChrome
      membership={membership}
      view={view}
      currentReportId={currentReportId}
      onSelectReport={goReport}
      hasPrevious={hasPrevious}
      returnLabel={computedLabel}
      onReturn={handleReturn}
      onOpenCenter={() => goCenter()}
      onOpenCategory={(group) => goCenter(group)}
      onSearch={setCatalogueQuery}
    >
      {body}
    </ReportsChrome>
  );
}
