import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BadgeDollarSign,
  BarChart3,
  BedDouble,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  DoorOpen,
  FileText,
  History,
  LayoutGrid,
  Menu,
  Package,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Tag,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { resolvePmsReturnTo } from "@/packages/pms/lib/cashiering-shell";
import { RateRevenueChrome } from "@/packages/pms/components/rates/rate-revenue-chrome";
import { RevenueFoundationView } from "@/packages/pms/components/rates/revenue-foundation-view";
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
import { getRevenueControlWorkspace } from "@/packages/pms/lib/revenue/revenue-control.functions";
import { PmsFilterChoiceRow, PmsFilterMenu } from "@/packages/pms/components/pms-filter-menu";
import { SHELL_ICON_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import {
  RATE_REVENUE_SHELL_PRIMARY_BUTTON,
  RateRevenueDateRange,
  RateRevenueExportButton,
  RateRevenueShellProvider,
  RateRevenueViewSwitcher,
  type RateRevenueShellSlots,
  downloadCsv,
} from "@/packages/pms/components/rates/rate-revenue-shell-slots";
import { useMoney } from "@/core/state/property-format";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";
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
  type RevenueWorkspaceView,
  REVENUE_DEFAULT_VIEW,
  canAccessRevenueView,
  contextFieldsForView,
  firstAccessibleRevenueView,
  isDemotedDemandView,
  normalizeRevenueView,
  revenueViewDefinition,
} from "@/packages/pms/lib/rate-revenue-workspace";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

const BURGER_DESTINATIONS: RevenueWorkspaceView[] = [
  "control-center",
  "rate-plans-reference",
  "rate-calendar",
  "rate-history",
  "restrictions",
  "restriction-history",
  "commercial",
  "promotions",
  "packages",
  "commercial-history",
  "approvals",
  "revenue-performance",
  "audit-control",
  "export",
  "competitor-setup",
];

const BURGER_ICONS: Partial<Record<RevenueWorkspaceView, typeof LayoutGrid>> = {
  "control-center": LayoutGrid,
  "rate-plans-reference": FileText,
  "rate-calendar": CalendarDays,
  "rate-history": History,
  restrictions: ShieldAlert,
  "restriction-history": ClipboardList,
  commercial: Tag,
  promotions: SlidersHorizontal,
  packages: Package,
  "commercial-history": History,
  approvals: ShieldAlert,
  "revenue-performance": TrendingUp,
  "audit-control": ClipboardList,
  export: FileText,
  "competitor-setup": BarChart3,
};

const BURGER_LABELS: Partial<Record<RevenueWorkspaceView, string>> = {
  "control-center": "Revenue Control",
  "rate-plans-reference": "Rates",
};

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
  const { hasPrevious, computedLabel, handleReturn } = resolvePmsReturnTo({
    returnTo: search.returnTo,
    returnToLabel: search.returnToLabel,
  });

  const [view, setView] = useState<RevenueWorkspaceView>(() =>
    normalizeRevenueView(search.view ?? search.tab),
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [presentation, setPresentation] = useState<"table" | "chart">("table");
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [shellSlots, setShellSlots] = useState<RateRevenueShellSlots>({
    date: null,
    search: null,
    filter: null,
    export: null,
    view: null,
    cta: null,
  });
  const setDateSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.date === node ? current : { ...current, date: node }));
  }, []);
  const setSearchSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.search === node ? current : { ...current, search: node }));
  }, []);
  const setFilterSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.filter === node ? current : { ...current, filter: node }));
  }, []);
  const setExportSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.export === node ? current : { ...current, export: node }));
  }, []);
  const setViewSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.view === node ? current : { ...current, view: node }));
  }, []);
  const setCtaSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.cta === node ? current : { ...current, cta: node }));
  }, []);
  const qc = useQueryClient();
  const money = useMoney();

  useEffect(() => {
    setView(normalizeRevenueView(search.view ?? search.tab));
    setSearchQuery("");
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

  const fetchControl = useServerFn(getRevenueControlWorkspace);
  const controlQuery = useQuery({
    queryKey: [
      "revenue-control",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
      context.marketSegmentId,
      context.commercialSourceId,
      context.salesChannelId,
    ],
    queryFn: () =>
      fetchControl({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
          ratePlanId: context.ratePlanId,
          marketSegmentId: context.marketSegmentId,
          commercialSourceId: context.commercialSourceId,
          salesChannelId: context.salesChannelId,
        },
      }),
    retry: false,
  });
  const refreshing = useIsFetching({
    predicate: (query) => {
      const key = String(query.queryKey[0] ?? "");
      return key.startsWith("revenue") || key.startsWith("rate");
    },
  });

  const safeView = isDemotedDemandView(view) ? REVENUE_DEFAULT_VIEW : view;
  const requestedView =
    access && !canAccessRevenueView(access, safeView)
      ? (firstAccessibleRevenueView(access) ?? REVENUE_DEFAULT_VIEW)
      : safeView;
  const definition = revenueViewDefinition(requestedView);

  function defaultRangeForView(targetView: RevenueWorkspaceView, bDate: string) {
    if (targetView === "control-center") return defaultControlCenterRange(bDate);
    if (targetView === "rate-calendar" || targetView === "restrictions") {
      return defaultRateCalendarRange(bDate);
    }
    if (targetView === "demand-forecast" || targetView === "pickup-pace") {
      return defaultDemandRange(bDate);
    }
    if (targetView === "demand-calendar") return defaultDemandCalendarRange(bDate);
    return defaultControlCenterRange(bDate);
  }

  function writeState(nextView: RevenueWorkspaceView, nextContext: RevenueContext) {
    const targetView = isDemotedDemandView(nextView) ? REVENUE_DEFAULT_VIEW : nextView;
    setView(targetView);
    setMoreOpen(false);
    void navigate({
      to: "/restaurant/pms/rates-revenue",
      search: serializeRevenueSearch(targetView, nextContext, {
        approvalTab: targetView === "approvals" ? search.approvalTab : undefined,
        approvalRequest: targetView === "approvals" ? search.approvalRequest : undefined,
        analyticsTab: targetView === "revenue-performance" ? search.analyticsTab : undefined,
        auditTab:
          targetView === "audit-control" || targetView === "export" ? search.auditTab : undefined,
        auditEvent: targetView === "audit-control" ? search.auditEvent : undefined,
        auditAction:
          targetView === "audit-control" || targetView === "export" ? search.auditAction : undefined,
        auditActor:
          targetView === "audit-control" || targetView === "export" ? search.auditActor : undefined,
        auditSearch:
          targetView === "audit-control" || targetView === "export" ? search.auditSearch : undefined,
      }),
      replace: true,
    });
  }

  function selectView(nextView: RevenueWorkspaceView) {
    if (isDemotedDemandView(nextView)) return;
    if (access && !canAccessRevenueView(access, nextView)) return;
    setSearchQuery("");
    const range = defaultRangeForView(nextView, businessDate);
    writeState(nextView, {
      fromDate: range.fromDate,
      toDate: range.toDate,
      roomTypeId: null,
      ratePlanId: null,
      marketSegmentId: null,
      commercialSourceId: null,
      salesChannelId: null,
    });
  }

  function updateContext(patch: Partial<RevenueContext>) {
    writeState(requestedView, patchRevenueContext(context, patch, contextOptions));
  }

  useEffect(() => {
    const rawView = search.view ?? search.tab;
    if (!isDemotedDemandView(rawView)) return;
    writeState(REVENUE_DEFAULT_VIEW, context);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.view, search.tab]);

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

  function renderView() {
    switch (requestedView) {
      case "control-center":
        return (
          <RevenueControlView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            presentation={presentation}
          />
        );
      case "rate-plans-reference":
        return (
          <RatePlansTab
            restaurantId={restaurantId}
            roomTypeId={context.roomTypeId}
            searchQuery={searchQuery}
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
            searchQuery={searchQuery}
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
        return (
          <RateHistoryView
            restaurantId={restaurantId}
            context={context}
            roomTypes={roomTypes}
            ratePlans={ratePlans}
            onContextChange={updateContext}
          />
        );
      case "restrictions":
        return (
          <RestrictionCalendarView
            restaurantId={restaurantId}
            context={context}
            access={access!}
            businessDate={businessDate}
            searchQuery={searchQuery}
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
            onContextChange={updateContext}
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
            onContextChange={updateContext}
            onNavigateView={selectView}
          />
        );
      case "commercial-history":
        return (
          <CommercialHistoryView
            restaurantId={restaurantId}
            context={context}
            onContextChange={updateContext}
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
            marketSegments={marketSegments}
            bookingSources={bookingSources}
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

  const fields = contextFieldsForView(requestedView);
  const visiblePlans = context.roomTypeId
    ? ratePlans.filter((plan) => plan.roomTypeId === context.roomTypeId)
    : ratePlans;
  const burgerItems = BURGER_DESTINATIONS.filter(
    (item) =>
      revenueViewDefinition(item).implemented &&
      !isDemotedDemandView(item) &&
      (!access || canAccessRevenueView(access, item)),
  );
  const filterCount =
    (context.roomTypeId ? 1 : 0) +
    (context.ratePlanId ? 1 : 0) +
    (context.marketSegmentId ? 1 : 0) +
    (context.commercialSourceId ? 1 : 0) +
    (context.salesChannelId ? 1 : 0);
  const summary = controlQuery.data?.summary;
  const slotMetrics = controlQuery.data?.slotMetrics;
  const kpis = [
    {
      label: "Booked Room Revenue",
      value: summary ? money(summary.roomRevenue) : null,
      icon: CircleDollarSign,
      tone: "bg-[#F4E9D0] text-[#8A641A]",
    },
    {
      label: "Sold Room Nights",
      value: summary ? String(summary.soldRoomNights) : null,
      icon: BedDouble,
      tone: "bg-sky-50 text-sky-700",
    },
    {
      label: "Occupancy",
      value: summary ? `${summary.occupancyPercent}%` : null,
      icon: DoorOpen,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "ADR",
      value: summary ? money(summary.adr) : null,
      icon: BadgeDollarSign,
      tone: "bg-amber-50 text-amber-800",
    },
    {
      label: "RevPAR",
      value: summary ? money(summary.revPar) : null,
      icon: TrendingUp,
      tone: "bg-teal-50 text-teal-700",
    },
    {
      label: "Available Room Nights",
      value: summary ? String(summary.availableRoomNights) : null,
      icon: CalendarDays,
      tone: "bg-violet-50 text-violet-700",
    },
  ] as const;

  function refreshRevenue() {
    for (const key of [
      "revenue-control",
      "revenue-access",
      "revenue-base-config",
      "revenue-catalogues",
      "revenue-overview",
    ]) {
      void qc.invalidateQueries({ queryKey: [key, restaurantId] });
    }
  }

  if (accessQuery.isLoading) {
    return <p className="px-6 py-10 text-sm text-muted-foreground">Loading Rate & Revenue…</p>;
  }

  if (!access?.canView) {
    return (
      <div className="m-4 rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Only owners and managers can access rates and revenue for this property.
        </p>
      </div>
    );
  }

  return (
    <RateRevenueChrome membership={membership} suppressReturnButton>
      <RateRevenueShellProvider value={shellSlots}>
        <div
          className="flex min-h-[calc(100vh-4rem)] flex-col gap-3 bg-[#F7F4EE] p-3 sm:p-4"
          data-testid="rates-desk"
        >
          <section
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
            aria-label="Rate & Revenue KPIs"
            data-testid="rate-revenue-kpis"
          >
            {kpis.map((card) => (
              <div
                key={card.label}
                className="flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 shadow-sm"
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", card.tone)}>
                  <card.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-medium text-[#756A5B]">{card.label}</p>
                  {controlQuery.isLoading ? (
                    <Skeleton className="mt-1 h-5 w-10" />
                  ) : (
                    <p className="truncate font-display text-lg font-semibold leading-tight tracking-tight text-[#251605]">
                      {card.value ?? "—"}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </section>

          {slotMetrics ? (
            <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-[#5A4833]">
              <span className="rounded-full border border-[#DDD4C5] bg-white px-2 py-0.5">
                Remaining inventory {slotMetrics.remainingRoomNights}
              </span>
              <span className="rounded-full border border-[#DDD4C5] bg-white px-2 py-0.5">
                Active restrictions {slotMetrics.activeRestrictionCount}
              </span>
              <span className="rounded-full border border-[#DDD4C5] bg-white px-2 py-0.5">
                Overrides {slotMetrics.overrideCount}
              </span>
            </div>
          ) : null}

          <section
            ref={setToolbarSlot}
            className="relative w-full min-w-0 rounded-lg border border-[#DDD4C5] bg-white px-2 py-1.5 shadow-sm"
            data-testid="rate-revenue-toolbar"
          >
            <div className="flex w-full min-w-0 items-center gap-1.5">
              <div className="relative size-8 shrink-0">
                <RateRevenueBurger
                  active={requestedView}
                  items={burgerItems}
                  onSelect={selectView}
                />
              </div>
              {fields.includes("dateRange") ? (
                <RateRevenueDateRange
                  fromDate={context.fromDate}
                  toDate={context.toDate}
                  onChange={(fromDate, toDate) => updateContext({ fromDate, toDate })}
                />
              ) : (
                <div ref={setDateSlot} className="shrink-0 empty:hidden" />
              )}
              <div ref={setSearchSlot} className="min-w-0 flex-1 overflow-hidden">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  placeholder="Search rate plan, room type, or restriction…"
                  aria-label="Search"
                />
              </div>
              <div className="relative z-10 flex shrink-0 items-center gap-1.5">
                <PmsFilterMenu
                  activeCount={filterCount}
                  onClear={() =>
                    updateContext({
                      roomTypeId: null,
                      ratePlanId: null,
                      marketSegmentId: null,
                      commercialSourceId: null,
                      salesChannelId: null,
                    })
                  }
                  buttonTestId="rate-revenue-filters-button"
                  menuTestId="rate-revenue-filters-menu"
                >
                  {fields.includes("roomType") ? (
                    <PmsFilterChoiceRow
                      label="Room Type"
                      value={context.roomTypeId ?? "all"}
                      current={roomTypes.find((row) => row.id === context.roomTypeId)?.name ?? ""}
                      options={[
                        ["all", "All room types"] as const,
                        ...roomTypes.map((row) => [row.id, row.name] as const),
                      ]}
                      onChange={(value) => updateContext({ roomTypeId: value === "all" ? null : value })}
                    />
                  ) : null}
                  {fields.includes("ratePlan") ? (
                    <PmsFilterChoiceRow
                      label="Rate Plan"
                      value={context.ratePlanId ?? "all"}
                      current={
                        visiblePlans.find((row) => row.id === context.ratePlanId)
                          ? `${visiblePlans.find((row) => row.id === context.ratePlanId)?.code}`
                          : ""
                      }
                      options={[
                        ["all", "All rate plans"] as const,
                        ...visiblePlans.map((row) => [row.id, `${row.code} — ${row.name}`] as const),
                      ]}
                      onChange={(value) => updateContext({ ratePlanId: value === "all" ? null : value })}
                    />
                  ) : null}
                  {fields.includes("segment") ? (
                    <PmsFilterChoiceRow
                      label="Market Segment"
                      value={context.marketSegmentId ?? "all"}
                      current={
                        marketSegments.find((row) => row.id === context.marketSegmentId)?.name ?? ""
                      }
                      options={[
                        ["all", "All segments"] as const,
                        ...marketSegments.map((row) => [row.id, row.name] as const),
                      ]}
                      onChange={(value) =>
                        updateContext({ marketSegmentId: value === "all" ? null : value })
                      }
                    />
                  ) : null}
                  {fields.includes("source") ? (
                    <PmsFilterChoiceRow
                      label="Source"
                      value={context.commercialSourceId ?? "all"}
                      current={
                        bookingSources.find((row) => row.id === context.commercialSourceId)?.name ?? ""
                      }
                      options={[
                        ["all", "All sources"] as const,
                        ...bookingSources.map((row) => [row.id, row.name] as const),
                      ]}
                      onChange={(value) =>
                        updateContext({ commercialSourceId: value === "all" ? null : value })
                      }
                    />
                  ) : null}
                  {fields.includes("channel") ? (
                    <PmsFilterChoiceRow
                      label="Sales Channel"
                      value={context.salesChannelId ?? "all"}
                      current={
                        salesChannels.find((row) => row.id === context.salesChannelId)?.name ?? ""
                      }
                      options={[
                        ["all", "All channels"] as const,
                        ...salesChannels.map((row) => [row.id, row.name] as const),
                      ]}
                      onChange={(value) =>
                        updateContext({ salesChannelId: value === "all" ? null : value })
                      }
                    />
                  ) : null}
                </PmsFilterMenu>
                <div ref={setFilterSlot} className="hidden" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={SHELL_ICON_BUTTON}
                  onClick={refreshRevenue}
                  aria-label="Refresh"
                  title="Refresh"
                  data-testid="rate-revenue-refresh"
                >
                  <RefreshCw className={cn("size-4", refreshing > 0 && "animate-spin")} />
                </Button>
                {requestedView === "control-center" ? (
                  <RateRevenueExportButton
                    disabled={!controlQuery.data?.controlRows.length}
                    onClick={() =>
                      downloadCsv(
                        "rate-inventory-control.csv",
                        ["Date", "Occupancy", "Sold", "Available", "Rate", "Restriction", "Signal"],
                        (controlQuery.data?.controlRows ?? []).map((row) => [
                          row.date,
                          `${row.occupancyPercent}%`,
                          String(row.soldRoomNights),
                          String(row.availableRoomNights),
                          row.effectiveRate == null ? "" : String(row.effectiveRate),
                          row.restrictionLabel ?? "",
                          row.signal,
                        ]),
                      )
                    }
                  />
                ) : (
                  <div ref={setExportSlot} className="shrink-0 empty:hidden" />
                )}
                {requestedView === "control-center" ? (
                  <RateRevenueViewSwitcher value={presentation} onChange={setPresentation} />
                ) : (
                  <div ref={setViewSlot} className="shrink-0 empty:hidden" />
                )}
                {access.canViewRates &&
                (requestedView === "rate-plans-reference" || requestedView === "rate-calendar") ? (
                  <Button
                    type="button"
                    className={cn(RATE_REVENUE_SHELL_PRIMARY_BUTTON, "px-3.5 text-xs font-semibold")}
                    onClick={() => selectView("bulk-rate-change")}
                  >
                    Bulk Rate Change
                  </Button>
                ) : access.canApplyRestrictions && requestedView === "restrictions" ? (
                  <Button
                    type="button"
                    className={cn(RATE_REVENUE_SHELL_PRIMARY_BUTTON, "px-3.5 text-xs font-semibold")}
                    onClick={() => selectView("apply-restriction")}
                  >
                    Apply Restriction
                  </Button>
                ) : (
                  <div ref={setCtaSlot} className="shrink-0 empty:hidden" />
                )}
                {hasPrevious ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReturn}
                    data-testid="rates-return-to-previous"
                    className="h-9 shrink-0 gap-1.5 border-[#DDD4C5] bg-white px-3 text-xs font-semibold text-[#5C5346]"
                  >
                    <ArrowLeft className="size-3.5 text-[#8A6A24]" />
                    {computedLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <main className="min-w-0">
            {cataloguesQuery.isError ? (
              <p className="mb-3 text-xs text-muted-foreground">
                {revenueUiError(cataloguesQuery.error, "Sales catalogues could not be loaded.")}
              </p>
            ) : null}
            {coreConfigStatus === "error" ? (
              <p className="mb-3 text-xs text-muted-foreground">Rate configuration could not be loaded.</p>
            ) : null}
            {renderView()}
          </main>
        </div>
      </RateRevenueShellProvider>
    </RateRevenueChrome>
  );
}

function RateRevenueBurger({
  active,
  items,
  onSelect,
}: {
  active: RevenueWorkspaceView;
  items: RevenueWorkspaceView[];
  onSelect: (id: RevenueWorkspaceView) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Rate & Revenue navigation"
          title="Rate & Revenue navigation"
          data-testid="rate-revenue-nav-trigger"
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md text-[#251605]",
            "opacity-50 transition-opacity hover:bg-[#F3EEE4] hover:opacity-100",
            "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
            "data-[state=open]:bg-[#F3EEE4] data-[state=open]:opacity-100",
          )}
        >
          <Menu className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-64 p-1.5"
        data-testid="rate-revenue-workspace-nav"
        aria-label="Rate & Revenue"
      >
        <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Rate & Revenue
        </p>
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {items.map((id) => {
            const Icon = BURGER_ICONS[id] ?? LayoutGrid;
            const isActive = id === active;
            return (
              <button
                key={id}
                type="button"
                data-testid={`rate-revenue-nav-${id}`}
                onClick={() => {
                  setOpen(false);
                  onSelect(id);
                }}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-[#F4E9D0] font-medium text-[#251605]"
                    : "text-foreground hover:bg-[#F7F4EE]",
                )}
              >
                <Icon className="size-4 shrink-0 text-[#8A6A24]" aria-hidden="true" />
                <span className="flex-1">{BURGER_LABELS[id] ?? revenueViewDefinition(id).label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
