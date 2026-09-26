import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";

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

function SectionButton({
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
        "relative flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
      {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" /> : null}
    </button>
  );
}

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
        "relative flex h-9 shrink-0 items-center px-2.5 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
      {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" /> : null}
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

  const coreConfigStatus = baseQuery.isLoading ? "loading" : baseQuery.isError ? "error" : "success";
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

  const requestedView = access && !canAccessRevenueView(access, view)
    ? firstAccessibleRevenueView(access) ?? view
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
      search: serializeRevenueSearch(nextView, nextContext),
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
  }, [requestedView, baseQuery.isSuccess, search.from, search.to, businessDate]);

  useEffect(() => {
    if (!baseQuery.isSuccess) return;
    if (requestedView !== "rate-calendar" && requestedView !== "restrictions") return;
    if (search.from || search.to) return;
    const range = defaultRateCalendarRange(businessDate);
    if (context.fromDate === range.fromDate && context.toDate === range.toDate) return;
    writeState(requestedView, patchRevenueContext(context, range, contextOptions));
  }, [requestedView, baseQuery.isSuccess, search.from, search.to, businessDate]);

  useEffect(() => {
    if (!baseQuery.isSuccess) return;
    if (requestedView !== "demand-forecast" && requestedView !== "pickup-pace") return;
    if (search.from || search.to) return;
    const range = defaultDemandRange(businessDate);
    if (context.fromDate === range.fromDate && context.toDate === range.toDate) return;
    writeState(requestedView, patchRevenueContext(context, range, contextOptions));
  }, [requestedView, baseQuery.isSuccess, search.from, search.to, businessDate]);

  useEffect(() => {
    if (!baseQuery.isSuccess) return;
    if (requestedView !== "commercial" && requestedView !== "promotions" && requestedView !== "commercial-history") return;
    if (search.from || search.to) return;
    const range = defaultControlCenterRange(businessDate);
    if (context.fromDate === range.fromDate && context.toDate === range.toDate) return;
    writeState(requestedView, patchRevenueContext(context, range, contextOptions));
  }, [requestedView, baseQuery.isSuccess, search.from, search.to, businessDate]);

  useEffect(() => {
    if (!baseQuery.isSuccess) return;
    if (requestedView !== "demand-calendar") return;
    if (search.from || search.to) return;
    const range = defaultDemandCalendarRange(businessDate);
    if (context.fromDate === range.fromDate && context.toDate === range.toDate) return;
    writeState(requestedView, patchRevenueContext(context, range, contextOptions));
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
        return <RevenueControlView restaurantId={restaurantId} context={context} access={access} />;
      case "rate-plans-reference":
        return <RatePlansTab restaurantId={restaurantId} roomTypeId={context.roomTypeId} />;
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
        return <RestrictionHistoryView restaurantId={restaurantId} context={context} />;
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Operations
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-foreground">
              Rate & Revenue
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Commercial and revenue operations for {membership.restaurant.name}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{definition.description}</p>
          </div>

          <div className="relative mt-3 flex items-end gap-1 overflow-x-auto px-5 sm:px-6">
            {primarySections.map((section) =>
              section.id === "more" ? (
                <div key={section.id} className="relative">
                  <SectionButton
                    active={activeSection === "more"}
                    onClick={() => selectPrimary("more")}
                  >
                    {section.label}
                    <ChevronDown
                      className={["h-3.5 w-3.5 transition-transform", moreOpen ? "rotate-180" : ""].join(
                        " ",
                      )}
                    />
                  </SectionButton>
                  {moreOpen ? (
                    <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                      {moreViews.map((item) => {
                        const itemDef = revenueViewDefinition(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => selectView(item)}
                            className={[
                              "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
                              requestedView === item
                                ? "bg-muted font-medium text-foreground"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            ].join(" ")}
                          >
                            {itemDef.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
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
            <div className="flex items-end gap-1 overflow-x-auto border-t border-border/60 px-5 sm:px-6">
              {secondaryViews.map((item) => (
                <SecondaryButton key={item} active={requestedView === item} onClick={() => selectView(item)}>
                  {revenueViewDefinition(item).label}
                </SecondaryButton>
              ))}
            </div>
          ) : null}

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
        </div>

        <main className="p-3 sm:p-4">{renderView()}</main>
      </div>
    </RateRevenueChrome>
  );
}
