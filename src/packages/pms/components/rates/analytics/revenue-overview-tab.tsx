import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";
import { RevenueTrendView } from "./revenue-trend-view";
import { RevenueSegmentBreakdown } from "./revenue-segment-breakdown";
import { RevenueSourceBreakdown } from "./revenue-source-breakdown";
import { PieChart, TrendingUp, Users, Compass } from "lucide-react";

export function RevenueOverviewTab({
  overview,
  formatCurrency,
  marketSegments,
  bookingSources,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
  marketSegments?: Array<{ id: string; name: string; code?: string }>;
  bookingSources?: Array<{ id: string; name: string; code?: string }>;
}) {
  const segments = overview.breakdowns.marketSegments;
  const sources = overview.breakdowns.commercialSources;

  // Resolve human-readable name for market segment
  const getSegmentName = (key: string, label: string) => {
    if (key === "unassigned") return "Unassigned";
    if (marketSegments && marketSegments.length > 0) {
      const match = marketSegments.find((s) => s.id === key);
      if (match?.name) return match.name;
    }
    return label || key;
  };

  // Resolve human-readable name for commercial booking source
  const getSourceName = (key: string, label: string) => {
    if (key === "unassigned") return "Unassigned";
    if (bookingSources && bookingSources.length > 0) {
      const match = bookingSources.find((s) => s.id === key);
      if (match?.name) return match.name;
    }
    return label || key;
  };

  return (
    <div className="space-y-4">
      {/* Middle Tier: Trend Chart & Business Mix Sidebar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Trend Performance Chart (lg:col-span-8) */}
        <div className="lg:col-span-8">
          <RevenueTrendView overview={overview} formatCurrency={formatCurrency} showTable={false} />
        </div>

        {/* Right: Revenue Distribution & Commercial Mix (lg:col-span-4) */}
        <div className="flex flex-col justify-between space-y-4 lg:col-span-4">
          {/* Market Segment Share Card */}
          <div className="flex-1 rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E8E1D7] pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#FAF8F4] text-[#C89933]">
                  <PieChart className="h-3.5 w-3.5" />
                </span>
                <h4 className="font-display text-sm font-semibold text-[#251605]">
                  Segment Distribution
                </h4>
              </div>
              <span className="text-[11px] font-medium text-[#756A5B]">Revenue Share</span>
            </div>

            {segments.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#756A5B]">
                No segment records for this stay window.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {segments.slice(0, 4).map((seg) => {
                  const displayName = getSegmentName(seg.marketSegment, seg.marketSegmentLabel);
                  return (
                    <div key={seg.marketSegment} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#251605] truncate max-w-[140px]">
                          {displayName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[#756A5B]">
                            {formatCurrency(seg.bookedRoomRevenue)}
                          </span>
                          <span className="font-mono font-semibold text-[#251605] w-9 text-right">
                            {seg.shareOfRevenue}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#FAF8F4] border border-[#E8E1D7]/40">
                        <div
                          className="h-full rounded-full bg-[#C89933] transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, seg.shareOfRevenue))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Booking Sources Mix Card */}
          <div className="flex-1 rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E8E1D7] pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#FAF8F4] text-[#C89933]">
                  <Compass className="h-3.5 w-3.5" />
                </span>
                <h4 className="font-display text-sm font-semibold text-[#251605]">
                  Top Booking Channels
                </h4>
              </div>
              <span className="text-[11px] font-medium text-[#756A5B]">Revenue Share</span>
            </div>

            {sources.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#756A5B]">
                No commercial source records for this stay window.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {sources.slice(0, 4).map((src) => {
                  const displayName = getSourceName(src.commercialSource, src.commercialSourceLabel);
                  return (
                    <div key={src.commercialSource} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#251605] truncate max-w-[140px]">
                          {displayName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[#756A5B]">
                            {formatCurrency(src.bookedRoomRevenue)}
                          </span>
                          <span className="font-mono font-semibold text-[#251605] w-9 text-right">
                            {src.shareOfRevenue}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#FAF8F4] border border-[#E8E1D7]/40">
                        <div
                          className="h-full rounded-full bg-[#3B260F] transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, src.shareOfRevenue))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Tier: Full Operational Tables (2-column grid) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueSegmentBreakdown
          overview={overview}
          formatCurrency={formatCurrency}
          marketSegments={marketSegments}
        />
        <RevenueSourceBreakdown
          overview={overview}
          formatCurrency={formatCurrency}
          bookingSources={bookingSources}
        />
      </div>
    </div>
  );
}
