import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, AlertTriangle } from "lucide-react";

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
import { RevenueTrendView } from "./revenue-trend-view";
import { CommercialPerformanceSection } from "./commercial-performance-section";

const VALID_ANALYTICS_TABS: RevenueAnalyticsTab[] = [
  "overview",
  "kpis",
  "segments",
  "sources",
  "trends",
  "commercial",
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
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  analyticsTab?: string;
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

  const currency = query.data?.propertyCurrency ?? "USD";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-[#E8E1D7] pb-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Revenue Performance
          </h2>
          <p className="text-xs text-muted-foreground">
            Operational stay-date yield, KPI detail, and commercial attribution.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap rounded-md border border-[#E8E1D7] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setTab("overview")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Overview (UI-31)
          </button>
          <button
            type="button"
            onClick={() => setTab("kpis")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              activeTab === "kpis"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            KPI Detail (UI-32)
          </button>
          <button
            type="button"
            onClick={() => setTab("segments")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              activeTab === "segments"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Segments (UI-33)
          </button>
          <button
            type="button"
            onClick={() => setTab("sources")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              activeTab === "sources"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sources (UI-34)
          </button>
          <button
            type="button"
            onClick={() => setTab("trends")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              activeTab === "trends"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Trends (UI-35)
          </button>
          <button
            type="button"
            onClick={() => setTab("commercial")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              activeTab === "commercial"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Commercial
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
            <div className="space-y-4">
              <RevenueTrendView overview={overview} formatCurrency={formatCurrency} />
              <div className="grid gap-4 lg:grid-cols-2">
                <RevenueSegmentBreakdown overview={overview} formatCurrency={formatCurrency} />
                <RevenueSourceBreakdown overview={overview} formatCurrency={formatCurrency} />
              </div>
            </div>
          )}

          {activeTab === "kpis" && (
            <RevenueKpiDetail overview={overview} formatCurrency={formatCurrency} />
          )}

          {activeTab === "segments" && (
            <RevenueSegmentBreakdown overview={overview} formatCurrency={formatCurrency} />
          )}

          {activeTab === "sources" && (
            <RevenueSourceBreakdown overview={overview} formatCurrency={formatCurrency} />
          )}

          {activeTab === "trends" && (
            <RevenueTrendView overview={overview} formatCurrency={formatCurrency} />
          )}

          {activeTab === "commercial" && (
            <CommercialPerformanceSection
              restaurantId={restaurantId}
              context={context}
              formatCurrency={formatCurrency}
            />
          )}
        </div>
      )}
    </div>
  );
}
