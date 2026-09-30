import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, ChevronDown, History, ShieldAlert, SlidersHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { RateRevenueChrome } from "@/packages/pms/components/rates/rate-revenue-chrome";
import { RevenueFoundationView } from "@/packages/pms/components/rates/revenue-foundation-view";
import { RevenueContextBar } from "@/packages/pms/components/rates/revenue-context-bar";
import { RevenueControlView } from "@/packages/pms/components/rates/revenue-control/revenue-control-view";
import { RateCalendarView } from "@/packages/pms/components/rates/rate-calendar/rate-calendar-view";
import { BulkRateChangeView } from "@/packages/pms/components/rates/bulk-rate-change/bulk-rate-change-view";
import { RateHistoryView } from "@/packages/pms/components/rates/rate-history/rate-history-view";
import { RatePlansTab } from "@/packages/pms/components/rates/rates-tabs";
import { RestrictionCalendarView } from "@/packages/pms/components/rates/restrictions/restriction-calendar-view";
import { BulkRestrictionView } from "@/packages/pms/components/rates/bulk-restriction/bulk-restriction-view";
import { RestrictionHistoryView } from "@/packages/pms/components/rates/restriction-history/restriction-history-view";
import { DemandForecastView } from "@/packages/pms/components/rates/demand-overview/demand-forecast-view";
import { DemandCalendarView } from "@/packages/pms/components/rates/demand-calendar/demand-calendar-view";
import { PickupPaceView } from "@/packages/pms/components/rates/pickup-pace/pickup-pace-view";
import { CommercialOverviewView } from "@/packages/pms/components/rates/commercial-overview/commercial-overview-view";
import { PromotionsView } from "@/packages/pms/components/rates/promotions/promotions-view";
import { PackagesView } from "@/packages/pms/components/rates/packages/packages-view";
import { CommercialHistoryView } from "@/packages/pms/components/rates/commercial-history/commercial-history-view";
import { CompetitorSetupView } from "@/packages/pms/components/rates/competitor-setup/competitor-setup-view";
import { ApprovalsView } from "@/packages/pms/components/rates/approvals/approvals-view";
import { RevenuePerformanceView } from "@/packages/pms/components/rates/analytics/revenue-performance-view";
import { RevenueAuditView } from "@/packages/pms/components/rates/audit/revenue-audit-view";
import { RevenueExportView } from "@/packages/pms/components/rates/export/revenue-export-view";
import { defaultRateCalendarRange } from "@/packages/pms/lib/revenue/rate-calendar";
import { defaultDemandCalendarRange } from "@/packages/pms/lib/revenue/demand-calendar";
import { defaultDemandRange } from "@/packages/pms/lib/revenue/demand";
import { defaultControlCenterRange } from "@/packages/pms/lib/revenue/revenue-control";
import { getRevenueAccess } from "@/packages/pms/lib/revenue/revenue-access.functions";
import {
  getRevenueBaseConfig,
  listRevenueCatalogues,
  REVENUE_CONFIG_STALE_MS,
} from "@/packages/pms/lib/revenue/revenue-config.functions";
import { revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import {
  patchRevenueContext,
  sanitizeLoadedContext,
  serializeRevenueSearch,
  type RevenueContext,
  type RevenueSearchParams,
} from "@/packages/pms/lib/revenue/revenue-context";
import {
  type RevenuePrimarySection,
  type RevenueWorkspaceView,
  REVENUE_PRIMARY_SECTIONS,
  REVENUE_SECTION_DEFAULTS,
  canAccessRevenueView,
  contextFieldsForView,
  firstAccessibleRevenueView,
  normalizeRevenueView,
  revenueViewDefinition,
  sectionForRevenueView,
  viewsForRevenueSection,
} from "@/packages/pms/lib/rate-revenue-workspace";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

interface SectionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const SectionButton = forwardRef<HTMLButtonElement, SectionButtonProps>(
  ({ active = false, children, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={[
          "relative flex h-11 shrink-0 items-center gap-2 px-4 text-sm font-semibold transition-colors",
          active ? "text-[#251605]" : "text-[#756A5B] hover:text-[#251605]",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {children}
        {active ? (
          <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
        ) : null}
      </button>
    );
  },
);
SectionButton.displayName = "SectionButton";

function SecondaryButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative flex h-10 shrink-0 items-center px-3.5 text-sm font-semibold transition-colors",
        active ? "text-[#251605]" : "text-[#756A5B] hover:text-[#251605]",
      ].join(" ")}
    >
      {children}
      {active ? (
        <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
      ) : null}
    </button>
  );
}

export function RatesWorkspace({
  membership,
  search,
}: {
  membership: RestaurantMembership;
  search: RevenueSearchParams;
}) {
  const restaurantId = membership.restaurant.id;
  const today = usePropertyBusinessDate(restaurantId, membership.restaurant.timezone);
  const navigate = useNavigate();

  const [view, setView] = useState<RevenueWorkspaceView>(() =>
    normalizeRevenueView(search.view ?? search.tab),
  );
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setView(normalizeRevenueView(search.view ?? search.tab));
  }, [search.view, search.tab]);

  const fetchAccess = useServerFn(getRevenueAccess);
  const accessQuery = useQuery({
    queryKey: ["revenue-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const access = accessQuery.data;

  const fetchBase = useServerFn(getRevenueBaseConfig);
  const fetchCatalogues = useServerFn(listRevenueCatalogues);
  const baseQuery = useQuery({
    queryKey: ["revenue-base-config", restaurantId],
    queryFn: () => fetchBase({ data: { restaurantId } }),
    staleTime: 15_000,
    retry: false,
  });
  const cataloguesQuery = useQuery({
    queryKey: ["revenue-catalogues", restaurantId],
    queryFn: () => fetchCatalogues({ data: { restaurantId } }),
    staleTime: REVENUE_CONFIG_STALE_MS,
    retry: false,
  });

  const coreConfigStatus = baseQuery.isLoading
    ? "loading"
    : baseQuery.isError
      ? "error"
      : "success";
  const cataloguesStatus = cataloguesQuery.isLoading
    ? "loading"
    : cataloguesQuery.isError
      ? "error"
      : "success";
  const roomTypes = baseQuery.isSuccess ? baseQuery.data.roomTypes : [];
  const ratePlans = baseQuery.isSuccess ? baseQuery.data.ratePlans : [];
  const marketSegments = cataloguesQuery.isSuccess ? cataloguesQuery.data.marketSegments : [];
  const bookingSources = cataloguesQuery.isSuccess ? cataloguesQuery.data.bookingSources : [];
  const salesChannels = cataloguesQuery.isSuccess ? cataloguesQuery.data.salesChannels : [];
  const businessDate = baseQuery.data?.property.businessDate ?? today;
  const contextOptions = {
    roomTypes,
    ratePlans,
    marketSegments,
    bookingSources,
    salesChannels,
  };
  const context = sanitizeLoadedContext(search, businessDate, contextOptions, {
    base: baseQuery.isSuccess,
    catalogues: cataloguesQuery.isSuccess,
  });

  const requestedView =
    access && !canAccessRevenueView(access, view)
      ? (firstAccessibleRevenueView(access) ?? view)
      : view;
  const definition = revenueViewDefinition(requestedView);
  const activeSection = sectionForRevenueView(requestedView);
  const secondaryViews = viewsForRevenueSection(activeSection, access);
  const showSecondary = activeSection !== "revenue-control" && activeSection !== "more";
  const moreViews = viewsForRevenueSection("more", access);
  const primarySections = REVENUE_PRIMARY_SECTIONS.filter(
    (section) => viewsForRevenueSection(section.id, access).length > 0,
  );

  function writeState(nextView: RevenueWorkspaceView, nextContext: RevenueContext) {
    setView(nextView);
    setMoreOpen(false);
    void navigate({
      to: "/restaurant/pms/rates-revenue",
      search: serializeRevenueSearch(nextView, nextContext, {
        approvalTab: search.approvalTab,
        approvalRequest: search.approvalRequest,
        analyticsTab: search.analyticsTab,
        auditTab: search.auditTab,
        auditEvent: search.auditEvent,
        auditAction: search.auditAction,
        auditActor: search.auditActor,
        auditSearch: search.auditSearch,
      }),
      replace: true,
    });
  }

  function selectView(nextView: RevenueWorkspaceView) {
    if (access && !canAccessRevenueView(access, nextView)) return;
    writeState(nextView, context);
  }

  function updateContext(patch: Partial<RevenueContext>) {
    writeState(requestedView, patchRevenueContext(context, patch, contextOptions));
  }

  useEffect(() => {
    if (!baseQuery.isSuccess) return;
    if (requestedView !== "control-center") return;
    if (search.from || search.to) return;
    const range = defaultControlCenterRange(businessDate);
    if (context.fromDate === range.fromDate && context.toDate === range.toDate) return;
    writeState(requestedView, patchRevenueContext(context, range, contextOptions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedView, baseQuery.isSuccess, search.from, search.to, businessDate]);

  useEffect(() => {
    if (!baseQuery.isSuccess) return;
    if (requestedView !== "rate-calendar" && requestedView !== "restrictions") return;
    if (search.from || search.to) return;
    const range = defaultRateCalendarRange(businessDate);
    if (context.fromDate === range.fromDate && context.toDate === range.toDate) return;
    writeState(requestedView, patchRevenueContext(context, range, contextOptions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedView, baseQuery.isSuccess, search.from, search.to, businessDate]);

  useEffect(() => {
    if (!baseQuery.isSuccess) return;
    if (requestedView !== "demand-forecast" && requestedView !== "pickup-pace") return;
    if (search.from || search.to) return;
    const range = defaultDemandRange(businessDate);
    if (context.fromDate === range.fromDate && context.toDate === range.toDate) return;
    writeState(requestedView, patchRevenueContext(context, range, contextOptions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedView, baseQuery.isSuccess, search.from, search.to, businessDate]);

  useEffect(() => {
    if (!baseQuery.isSuccess) return;
    if (
      requestedView !== "commercial" &&
      requestedView !== "promotions" &&
      requestedView !== "commercial-history"
    )
      return;
    if (search.from || search.to) return;
    const range = defaultControlCenterRange(businessDate);
    if (context.fromDate === range.fromDate && context.toDate === range.toDate) return;
    writeState(requestedView, patchRevenueContext(context, range, contextOptions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedView, baseQuery.isSuccess, search.from, search.to, businessDate]);

  useEffect(() => {
    if (!baseQuery.isSuccess) return;
    if (requestedView !== "demand-calendar") return;
    if (search.from || search.to) return;
    const range = defaultDemandCalendarRange(businessDate);
    if (context.fromDate === range.fromDate && context.toDate === range.toDate) return;
    writeState(requestedView, patchRevenueContext(context, range, contextOptions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedView, baseQuery.isSuccess, search.from, search.to, businessDate]);

  function selectPrimary(section: RevenuePrimarySection) {
    if (section === "more") {
      setMoreOpen((current) => !current);
      return;
    }
    if (section === activeSection) return;
    selectView(REVENUE_SECTION_DEFAULTS[section]);
  }

  function renderView() {
    switch (requestedView) {
      case "control-center":
        return (
          <RevenueControlView restaurantId={restaurantId} context={context} access={access!} />
        );
      case "rate-plans-reference":
        return (
          <RatePlansTab
            restaurantId={restaurantId}
            roomTypeId={context.roomTypeId}
            onRoomTypeChange={(roomTypeId) => updateContext({ roomTypeId })}
            onOpenCalendar={(ratePlanId, planRoomTypeId) =>
              writeState(
                "rate-calendar",
                patchRevenueContext(
                  context,
                  { ratePlanId, roomTypeId: planRoomTypeId },
                  contextOptions,
                ),
              )
            }
          />
        );
      case "rate-calendar":
        return (
          <RateCalendarView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            businessDate={businessDate}
            onRangeChange={(fromDate, toDate) => updateContext({ fromDate, toDate })}
          />
        );
      case "bulk-rate-change":
        return (
          <BulkRateChangeView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            roomTypes={roomTypes}
            ratePlans={ratePlans}
          />
        );
      case "rate-history":
        return <RateHistoryView restaurantId={restaurantId} context={context} />;
      case "restrictions":
        return (
          <RestrictionCalendarView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            businessDate={businessDate}
            onRangeChange={(fromDate, toDate) => updateContext({ fromDate, toDate })}
          />
        );
      case "apply-restriction":
        return (
          <BulkRestrictionView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            roomTypes={roomTypes}
            ratePlans={ratePlans}
            canApplyRestrictions={access?.canApplyRestrictions === true}
          />
        );
      case "restriction-history":
        return (
          <RestrictionHistoryView
            restaurantId={restaurantId}
            context={context}
            roomTypes={roomTypes}
            ratePlans={ratePlans}
            onContextChange={updateContext}
          />
        );
      case "demand-forecast":
        return <DemandForecastView restaurantId={restaurantId} context={context} />;
      case "pickup-pace":
        return <PickupPaceView restaurantId={restaurantId} context={context} />;
      case "demand-calendar":
        return (
          <DemandCalendarView
            restaurantId={restaurantId}
            context={context}
            businessDate={businessDate}
            onRangeChange={(fromDate, toDate) => updateContext({ fromDate, toDate })}
          />
        );
      case "commercial":
        return (
          <CommercialOverviewView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            roomTypes={roomTypes}
            ratePlans={ratePlans}
            onNavigateView={selectView}
          />
        );
      case "promotions":
        return (
          <PromotionsView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            roomTypes={roomTypes}
            ratePlans={ratePlans}
            onNavigateView={selectView}
          />
        );
      case "packages":
        return (
          <PackagesView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            roomTypes={roomTypes}
            ratePlans={ratePlans}
            onNavigateView={selectView}
          />
        );
      case "commercial-history":
        return (
          <CommercialHistoryView
            restaurantId={restaurantId}
            context={context}
            onNavigateView={selectView}
          />
        );
      case "competitor-setup":
        return <CompetitorSetupView restaurantId={restaurantId} access={access!} />;
      case "approvals":
        return (
          <ApprovalsView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            approvalTab={search.approvalTab}
            approvalRequest={search.approvalRequest}
          />
        );
      case "revenue-performance":
        return (
          <RevenuePerformanceView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            analyticsTab={search.analyticsTab}
          />
        );
      case "audit-control":
        return (
          <RevenueAuditView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            auditTab={search.auditTab}
            auditEvent={search.auditEvent}
            auditAction={search.auditAction}
            auditActor={search.auditActor}
            auditSearch={search.auditSearch}
          />
        );
      case "export":
        return (
          <RevenueExportView
            restaurantId={restaurantId}
            context={{
              ...context,
              fromDate: context.fromDate,
              ratePlanId: context.ratePlanId,
            }}
            auditTab={search.auditTab}
            auditAction={search.auditAction}
            auditActor={search.auditActor}
            auditSearch={search.auditSearch}
          />
        );
      default:
        return (
          <RevenueFoundationView
            title={definition.label}
            description={definition.description}
            plannedCapability={definition.plannedCapability}
            sources={definition.sources}
          />
        );
    }
  }

  if (accessQuery.isLoading) {
    return <p className="px-6 py-10 text-sm text-muted-foreground">Loading Rate & Revenue…</p>;
  }

  if (!access?.canView) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl font-semibold">Rate & Revenue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access rates and revenue for this property.
        </p>
      </div>
    );
  }

  return (
    <RateRevenueChrome membership={membership}>
      <div className="min-w-0 bg-[#F7F4EE]">
        <div className="border-b border-border bg-background">
          <div className="px-5 pt-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Operations
                </p>
                <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-[#251605]">
                  Rate & Revenue
                </h1>
                <p className="mt-1 text-sm text-[#756A5B]">
                  Operational pricing, occupancy and revenue control.
                </p>
              </div>

              {access.canViewRates || access.canViewRestrictions ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-4 text-sm font-semibold text-[#251605] shadow-sm transition-colors hover:bg-[#FAF6F0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#251605]"
                    >
                      <SlidersHorizontal className="size-4 text-[#8A641A]" />
                      <span>Rate & Restriction Actions</span>
                      <ChevronDown className="size-4 text-[#756A5B]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={6}
                    className="z-50 w-60 overflow-hidden rounded-xl border border-[#DDD4C5] bg-white p-1.5 shadow-xl"
                  >
                    {access.canViewRates ? (
                      <>
                        <DropdownMenuItem asChild>
                          <Link
                            to="/restaurant/pms/rates-revenue"
                            search={serializeRevenueSearch("rate-calendar", context)}
                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[#251605] transition-colors hover:bg-[#FAF6F0]"
                          >
                            <CalendarDays className="size-4 text-[#8A641A]" />
                            <span>Open Rate Calendar</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to="/restaurant/pms/rates-revenue"
                            search={serializeRevenueSearch("bulk-rate-change", context)}
                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[#251605] transition-colors hover:bg-[#FAF6F0]"
                          >
                            <SlidersHorizontal className="size-4 text-[#8A641A]" />
                            <span>Bulk Rate Change</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to="/restaurant/pms/rates-revenue"
                            search={serializeRevenueSearch("rate-history", context)}
                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[#251605] transition-colors hover:bg-[#FAF6F0]"
                          >
                            <History className="size-4 text-[#8A641A]" />
                            <span>View Rate History</span>
                          </Link>
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {access.canViewRestrictions ? (
                      <DropdownMenuItem asChild>
                        <Link
                          to="/restaurant/pms/rates-revenue"
                          search={serializeRevenueSearch("restrictions", context)}
                          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[#251605] transition-colors hover:bg-[#FAF6F0]"
                        >
                          <ShieldAlert className="size-4 text-amber-700" />
                          <span>View Restrictions</span>
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          <div className="relative mt-3 flex items-end gap-3 overflow-x-auto px-5 sm:px-6">
            {primarySections.map((section) =>
              section.id === "more" ? (
                <DropdownMenu key={section.id} open={moreOpen} onOpenChange={setMoreOpen}>
                  <DropdownMenuTrigger asChild>
                    <SectionButton active={activeSection === "more"}>
                      {section.label}
                      <ChevronDown
                        className={[
                          "h-4 w-4 transition-transform",
                          moreOpen ? "rotate-180" : "",
                        ].join(" ")}
                      />
                    </SectionButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={6}
                    className="z-50 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl"
                  >
                    {moreViews.map((item) => {
                      const itemDef = revenueViewDefinition(item);
                      return (
                        <DropdownMenuItem
                          key={item}
                          onSelect={() => selectView(item)}
                          className={[
                            "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm cursor-pointer transition-colors",
                            requestedView === item
                              ? "bg-muted font-semibold text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                          ].join(" ")}
                        >
                          {itemDef.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <SectionButton
                  key={section.id}
                  active={activeSection === section.id}
                  onClick={() => selectPrimary(section.id)}
                >
                  {section.label}
                </SectionButton>
              ),
            )}
          </div>

          {showSecondary ? (
            <div className="flex items-end gap-3 overflow-x-auto border-t border-border/60 px-5 sm:px-6">
              {secondaryViews.map((item) => (
                <SecondaryButton
                  key={item}
                  active={requestedView === item}
                  onClick={() => selectView(item)}
                >
                  {revenueViewDefinition(item).label}
                </SecondaryButton>
              ))}
            </div>
          ) : null}
        </div>

        <main className="space-y-4 p-4 sm:p-5 lg:p-6">
          {requestedView !== "rate-plans-reference" &&
          requestedView !== "bulk-rate-change" &&
          requestedView !== "apply-restriction" &&
          requestedView !== "restriction-history" ? (
            <RevenueContextBar
              fields={contextFieldsForView(requestedView)}
              context={context}
              onChange={updateContext}
              roomTypes={roomTypes}
              ratePlans={ratePlans}
              marketSegments={marketSegments}
              bookingSources={bookingSources}
              salesChannels={salesChannels}
              cataloguesError={
                cataloguesQuery.isError
                  ? revenueUiError(cataloguesQuery.error, "Sales catalogues could not be loaded.")
                  : null
              }
              coreConfigStatus={coreConfigStatus}
              cataloguesStatus={cataloguesStatus}
            />
          ) : null}
          {renderView()}
        </main>
      </div>
    </RateRevenueChrome>
  );
}
