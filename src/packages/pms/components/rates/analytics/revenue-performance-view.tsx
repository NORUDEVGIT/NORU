import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle } from "lucide-react";

import { getRevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics.functions";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import {
  serializeRevenueSearch,
  type RevenueAnalyticsTab,
  type RevenueContext,
} from "@/packages/pms/lib/revenue/revenue-context";
import { RevenueKpiStrip } from "./revenue-kpi-strip";
import { RevenueDataQualityAlert } from "./revenue-data-quality-alert";
import { RevenueKpiDetail } from "./revenue-kpi-detail";
import { RevenueSegmentBreakdown } from "./revenue-segment-breakdown";
import { RevenueSourceBreakdown } from "./revenue-source-breakdown";
import { RevenueOverviewTab } from "./revenue-overview-tab";

const VALID_ANALYTICS_TABS: RevenueAnalyticsTab[] = [
  "overview",
  "kpis",
  "segments",
  "sources",
];

function parseAnalyticsTab(tab?: string): RevenueAnalyticsTab {
  if (tab && VALID_ANALYTICS_TABS.includes(tab as RevenueAnalyticsTab)) {
    return tab as RevenueAnalyticsTab;
  }
  return "overview";
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
    </div>
  );
}

export function RevenuePerformanceView({
  restaurantId,
  context,
  access,
  analyticsTab,
  marketSegments,
  bookingSources,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  analyticsTab?: string | undefined;
  marketSegments?: Array<{ id: string; name: string; code?: string }>;
  bookingSources?: Array<{ id: string; name: string; code?: string }>;
}) {
  const navigate = useNavigate();
  const fetchOverview = useServerFn(getRevenuePerformanceOverview);

  const activeTab = parseAnalyticsTab(analyticsTab);

  const setTab = useCallback(
    (tab: RevenueAnalyticsTab) => {
      navigate({
        to: "/restaurant/pms/rates-revenue",
        search: serializeRevenueSearch("revenue-performance", context, {
          analyticsTab: tab,
        }),
      });
    },
    [navigate, context],
  );

  // P8-STEP-03 Review Amendment 2:
  // Explicitly do NOT forward context.salesChannelId into the analytics query!
  // Sales Channel is unsupported, but a legacy channel parameter in the URL must not break the view.
  const query = useQuery({
    queryKey: [
      "revenue-performance-overview",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
      context.marketSegmentId,
      context.commercialSourceId,
    ],
    queryFn: () =>
      fetchOverview({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
          ratePlanId: context.ratePlanId,
          marketSegmentId: context.marketSegmentId,
          commercialSourceId: context.commercialSourceId,
          salesChannelId: null, // strictly null per Amendment 2
        },
      }),
    retry: false,
  });

  const currency = query.data?.currency ?? "USD";
  const formatCurrency = (val: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(val);
    } catch {
      return `${currency} ${val.toFixed(2)}`;
    }
  };

  // Error boundary mappings
  if (query.isError) {
    const errorMsg = query.error?.message ?? "";
    let alertTitle = "Revenue Analytics Error";
    let alertBody = "Unable to load revenue analytics. Please try again or adjust filters.";

    if (errorMsg.includes("REVENUE_ANALYTICS_MIXED_CURRENCY")) {
      alertTitle = "Mixed Currency Incompatible";
      alertBody =
        "Revenue analytics cannot combine reservations in multiple currencies because no exchange-rate conversion is configured.";
    } else if (errorMsg.includes("REVENUE_ANALYTICS_RANGE_EXCEEDS_MAX")) {
      alertTitle = "Date Range Exceeds Maximum";
      alertBody = "Revenue analytics supports a maximum stay-date range of 90 days.";
    } else if (errorMsg.includes("REVENUE_ANALYTICS_SALES_CHANNEL_UNSUPPORTED")) {
      alertTitle = "Sales Channel Unsupported";
      alertBody = "Sales Channel analytics is not currently supported.";
    }

    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-foreground">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-destructive">{alertTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{alertBody}</p>
          </div>
        </div>
      </div>
    );
  }

  const overview = query.data;

  return (
    <div className="space-y-4">
      {/* Workspace Header & Sub-Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8E1D7] pb-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#251605]">
            Revenue Performance
          </h2>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]/60 p-1">
          <button
            type="button"
            onClick={() => setTab("overview")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              activeTab === "overview"
                ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setTab("kpis")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              activeTab === "kpis"
                ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            KPI Detail
          </button>
          <button
            type="button"
            onClick={() => setTab("segments")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              activeTab === "segments"
                ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            Segments
          </button>
          <button
            type="button"
            onClick={() => setTab("sources")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              activeTab === "sources"
                ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            Sources
          </button>
        </div>
      </div>

      {query.isLoading && <AnalyticsSkeleton />}

      {overview && (
        <div className="space-y-4">
          {/* Top KPI Strip (Always visible across all tabs for continuous situational awareness) */}
          <RevenueKpiStrip overview={overview} formatCurrency={formatCurrency} />

          {/* Quality & Scope Alerts */}
          <RevenueDataQualityAlert overview={overview} />

          {/* Tab Content */}
          {activeTab === "overview" && (
            <RevenueOverviewTab
              overview={overview}
              formatCurrency={formatCurrency}
              marketSegments={marketSegments}
              bookingSources={bookingSources}
            />
          )}

          {activeTab === "kpis" && (
            <RevenueKpiDetail overview={overview} formatCurrency={formatCurrency} />
          )}

          {activeTab === "segments" && (
            <RevenueSegmentBreakdown
              overview={overview}
              formatCurrency={formatCurrency}
              marketSegments={marketSegments}
            />
          )}

          {activeTab === "sources" && (
            <RevenueSourceBreakdown
              overview={overview}
              formatCurrency={formatCurrency}
              bookingSources={bookingSources}
            />
          )}
        </div>
      )}
    </div>
  );
}
