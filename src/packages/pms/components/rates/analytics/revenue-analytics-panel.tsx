import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, AlertTriangle } from "lucide-react";

import { getRevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics.functions";
import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { formatMoney } from "@/shared/lib/property-time";
import { RevenueTrendView } from "./revenue-trend-view";
import { RevenueKpiDetail } from "./revenue-kpi-detail";
import { RevenueSegmentBreakdown } from "./revenue-segment-breakdown";
import { RevenueSourceBreakdown } from "./revenue-source-breakdown";

export type RevenueAnalyticsSection = "overview" | "kpis" | "segments" | "sources";

export const REVENUE_ANALYTICS_SECTIONS: Array<{ id: RevenueAnalyticsSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "kpis", label: "KPI Detail" },
  { id: "segments", label: "Market Segments" },
  { id: "sources", label: "Booking Sources" },
];

type CatalogueRow = { id: string; name: string; code?: string };

function analyticsErrorCopy(message: string) {
  if (message.includes("REVENUE_ANALYTICS_MIXED_CURRENCY")) {
    return {
      title: "Mixed currencies",
      body: "Reservations in this range use more than one currency and no exchange rate is configured.",
    };
  }
  if (message.includes("REVENUE_ANALYTICS_RANGE_EXCEEDS_MAX")) {
    return { title: "Range too long", body: "Choose a stay-date range of 90 days or less." };
  }
  return { title: "Revenue analytics unavailable", body: "Try again or adjust the filters." };
}

function resolveName(key: string, label: string, catalogue?: CatalogueRow[]) {
  if (key === "unassigned") return "Unassigned";
  return catalogue?.find((row) => row.id === key)?.name || label || key;
}

function MixCard({
  title,
  rows,
  barClass,
  formatCurrency,
}: {
  title: string;
  rows: Array<{ key: string; name: string; revenue: number; share: number }>;
  barClass: string;
  formatCurrency: (value: number) => string;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[#E8E1D7] bg-white shadow-xs">
      <header className="flex items-center justify-between gap-2 border-b border-[#E8E1D7] px-4 py-2.5">
        <h3 className="font-display text-sm font-semibold text-[#251605]">{title}</h3>
        <span className="text-[11px] font-medium text-[#756A5B]">Revenue share</span>
      </header>
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-6 text-xs text-[#756A5B]">
          No revenue in this range.
        </div>
      ) : (
        <ul className="space-y-2.5 px-4 py-3">
          {rows.slice(0, 4).map((row) => (
            <li key={row.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-[#251605]">{row.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[#756A5B]">{formatCurrency(row.revenue)}</span>
                  <span className="w-10 text-right font-mono font-semibold text-[#251605]">
                    {row.share}%
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F3EEE4]">
                <div
                  className={`h-full rounded-full ${barClass}`}
                  style={{ width: `${Math.min(100, Math.max(0, row.share))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OverviewSection({
  overview,
  formatCurrency,
  marketSegments,
  bookingSources,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
  marketSegments?: CatalogueRow[];
  bookingSources?: CatalogueRow[];
}) {
  const segmentRows = overview.breakdowns.marketSegments.map((row) => ({
    key: row.marketSegment,
    name: resolveName(row.marketSegment, row.marketSegmentLabel, marketSegments),
    revenue: row.bookedRoomRevenue,
    share: row.shareOfRevenue,
  }));
  const sourceRows = overview.breakdowns.commercialSources.map((row) => ({
    key: row.commercialSource,
    name: resolveName(row.commercialSource, row.commercialSourceLabel, bookingSources),
    revenue: row.bookedRoomRevenue,
    share: row.shareOfRevenue,
  }));

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <RevenueTrendView overview={overview} formatCurrency={formatCurrency} />
      </div>
      <div className="flex flex-col gap-3 lg:col-span-4">
        <MixCard
          title="Market Segments"
          rows={segmentRows}
          barClass="bg-[#C89933]"
          formatCurrency={formatCurrency}
        />
        <MixCard
          title="Booking Sources"
          rows={sourceRows}
          barClass="bg-[#3B260F]"
          formatCurrency={formatCurrency}
        />
      </div>
    </div>
  );
}

export function RevenueAnalyticsPanel({
  restaurantId,
  context,
  section,
  marketSegments,
  bookingSources,
}: {
  restaurantId: string;
  context: RevenueContext;
  section: RevenueAnalyticsSection;
  marketSegments?: CatalogueRow[];
  bookingSources?: CatalogueRow[];
}) {
  const fetchOverview = useServerFn(getRevenuePerformanceOverview);
  // Sales channel is not an analytics dimension; it is never forwarded.
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
          salesChannelId: null,
        },
      }),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12" aria-busy="true">
        <div className="h-[340px] animate-pulse rounded-xl border border-[#E8E1D7] bg-white lg:col-span-8" />
        <div className="h-[340px] animate-pulse rounded-xl border border-[#E8E1D7] bg-white lg:col-span-4" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    const copy = analyticsErrorCopy(query.error?.message ?? "");
    return (
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div>
          <p className="text-sm font-semibold text-destructive">{copy.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{copy.body}</p>
        </div>
      </div>
    );
  }

  const overview = query.data;
  const formatCurrency = (value: number) => formatMoney(value, overview.currency);
  const unpriced = overview.warnings.unpricedSoldNights;

  return (
    <div className="space-y-3" data-testid="revenue-analytics-panel">
      {unpriced > 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
          {unpriced} sold night{unpriced === 1 ? " has" : "s have"} no rate snapshot, so revenue and
          ADR count {unpriced === 1 ? "it" : "them"} at zero.
        </p>
      ) : null}

      {section === "overview" ? (
        <OverviewSection
          overview={overview}
          formatCurrency={formatCurrency}
          marketSegments={marketSegments}
          bookingSources={bookingSources}
        />
      ) : null}
      {section === "kpis" ? (
        <RevenueKpiDetail overview={overview} formatCurrency={formatCurrency} />
      ) : null}
      {section === "segments" ? (
        <RevenueSegmentBreakdown
          overview={overview}
          formatCurrency={formatCurrency}
          marketSegments={marketSegments}
        />
      ) : null}
      {section === "sources" ? (
        <RevenueSourceBreakdown
          overview={overview}
          formatCurrency={formatCurrency}
          bookingSources={bookingSources}
        />
      ) : null}
    </div>
  );
}
