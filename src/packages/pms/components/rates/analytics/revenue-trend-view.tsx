import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/components/ui/chart";

type TrendMetric = "revenue" | "occupancy" | "adr" | "revpar" | "soldNights";
type TrendGranularity = "daily" | "weekly" | "monthly";

type AggregatedTrendRow = {
  key: string;
  label: string;
  bookedRoomRevenue: number;
  soldRoomNights: number;
  availableRoomNights: number | null;
  occupancyPct: number | null;
  adr: number;
  revpar: number | null;
  pricedSharePct: number;
  reservationCountDisplay: string; // "—" for weekly/monthly to avoid double counting
};

function getWeekNumber(dateStr: string): string {
  const d = new Date(dateStr);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function RevenueTrendView({
  overview,
  formatCurrency,
  showTable = true,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
  showTable?: boolean;
}) {
  const isInventoryMeaningful = overview.summary.inventoryMetricSupport === "SUPPORTED";
  const [metric, setMetric] = useState<TrendMetric>("revenue");
  const [granularity, setGranularity] = useState<TrendGranularity>("daily");

  const { dailyTrend } = overview;

  // Aggregate daily rows into Weekly or Monthly with strict adherence to Amendment 3:
  // Never sum reservationCount! Aggregate additive nightly metrics and recompute ratios.
  const displayRows: AggregatedTrendRow[] = useMemo(() => {
    if (granularity === "daily") {
      return dailyTrend.map((row) => ({
        key: row.date,
        label: row.date,
        bookedRoomRevenue: row.bookedRoomRevenue,
        soldRoomNights: row.soldRoomNights,
        availableRoomNights: row.availableRoomNights,
        occupancyPct: row.occupancyPct,
        adr: row.adr,
        revpar: row.revpar,
        pricedSharePct: row.pricedShare,
        reservationCountDisplay: String(row.reservationCount),
      }));
    }

    const map = new Map<
      string,
      {
        key: string;
        label: string;
        bookedRoomRevenue: number;
        soldRoomNights: number;
        availableRoomNights: number | null;
        hasNullAvailable: boolean;
        unpricedSoldNights: number;
      }
    >();

    for (const d of dailyTrend) {
      const key = granularity === "weekly" ? getWeekNumber(d.date) : d.date.substring(0, 7);
      const existing = map.get(key) ?? {
        key,
        label: key,
        bookedRoomRevenue: 0,
        soldRoomNights: 0,
        availableRoomNights: 0,
        hasNullAvailable: false,
        unpricedSoldNights: 0,
      };

      existing.bookedRoomRevenue += d.bookedRoomRevenue;
      existing.soldRoomNights += d.soldRoomNights;
      if (d.availableRoomNights === null) {
        existing.hasNullAvailable = true;
      } else if (!existing.hasNullAvailable && existing.availableRoomNights !== null) {
        existing.availableRoomNights += d.availableRoomNights;
      }

      // calculate unpriced sold nights for accurate weighted priced share
      const unpriced = Math.max(0, d.soldRoomNights - d.pricedRoomNights);
      existing.unpricedSoldNights += unpriced;

      map.set(key, existing);
    }

    return Array.from(map.values()).map((agg) => {
      const available = agg.hasNullAvailable ? null : agg.availableRoomNights;
      const occ =
        available !== null && available > 0
          ? Math.round((agg.soldRoomNights / available) * 1000) / 10
          : null;
      const adr =
        agg.soldRoomNights > 0
          ? Math.round((agg.bookedRoomRevenue / agg.soldRoomNights) * 100) / 100
          : 0;
      const revpar =
        available !== null && available > 0
          ? Math.round((agg.bookedRoomRevenue / available) * 100) / 100
          : null;
      const pricedShare =
        agg.soldRoomNights > 0
          ? Math.round(
              ((agg.soldRoomNights - agg.unpricedSoldNights) / agg.soldRoomNights) * 1000,
            ) / 10
          : 100;

      return {
        key: agg.key,
        label: agg.label,
        bookedRoomRevenue: Math.round(agg.bookedRoomRevenue * 100) / 100,
        soldRoomNights: agg.soldRoomNights,
        availableRoomNights: available,
        occupancyPct: occ,
        adr,
        revpar,
        pricedSharePct: pricedShare,
        reservationCountDisplay: "—", // Amendment 3: never sum reservationCount
      };
    });
  }, [dailyTrend, granularity]);

  const chartData = useMemo(() => {
    return displayRows.map((r) => {
      let val: number | null = 0;
      if (metric === "revenue") val = r.bookedRoomRevenue;
      else if (metric === "occupancy") val = r.occupancyPct;
      else if (metric === "adr") val = r.adr;
      else if (metric === "revpar") val = r.revpar;
      else if (metric === "soldNights") val = r.soldRoomNights;

      return {
        date: r.label,
        value: val ?? 0,
      };
    });
  }, [displayRows, metric]);

  const metricConfigs: Record<TrendMetric, ChartConfig> = {
    revenue: {
      value: { label: "Booked Room Revenue", color: "#8B651D" },
    },
    occupancy: {
      value: { label: "Occupancy %", color: "#C89933" },
    },
    adr: {
      value: { label: "ADR", color: "#6A4C1B" },
    },
    revpar: {
      value: { label: "RevPAR", color: "#A87A24" },
    },
    soldNights: {
      value: { label: "Sold Room Nights", color: "#3B260F" },
    },
  };

  return (
    <div className="space-y-4">
      {/* Metric & Granularity Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Metric Selector */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]/60 p-1">
          <button
            type="button"
            onClick={() => setMetric("revenue")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              metric === "revenue"
                ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            Booked Revenue
          </button>
          <button
            type="button"
            onClick={() => setMetric("soldNights")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              metric === "soldNights"
                ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            Sold Nights
          </button>
          <button
            type="button"
            disabled={!isInventoryMeaningful}
            onClick={() => setMetric("occupancy")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              !isInventoryMeaningful
                ? "opacity-40 cursor-not-allowed text-[#756A5B]"
                : metric === "occupancy"
                  ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                  : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            Occupancy {!isInventoryMeaningful ? "(N/A)" : ""}
          </button>
          <button
            type="button"
            onClick={() => setMetric("adr")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              metric === "adr"
                ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            ADR
          </button>
          <button
            type="button"
            disabled={!isInventoryMeaningful}
            onClick={() => setMetric("revpar")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              !isInventoryMeaningful
                ? "opacity-40 cursor-not-allowed text-[#756A5B]"
                : metric === "revpar"
                  ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                  : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            RevPAR {!isInventoryMeaningful ? "(N/A)" : ""}
          </button>
        </div>

        {/* Granularity Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]/60 p-1">
            <button
              type="button"
              onClick={() => setGranularity("daily")}
              className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                granularity === "daily"
                  ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                  : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setGranularity("weekly")}
              className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                granularity === "weekly"
                  ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                  : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
              }`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setGranularity("monthly")}
              className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                granularity === "monthly"
                  ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                  : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
              }`}
            >
              Monthly
            </button>
          </div>
        </div>
      </div>

      {/* Primary Trend Chart */}
      <div className="rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#E8E1D7] pb-3">
          <div>
            <h3 className="font-display text-base font-semibold text-[#251605]">
              {metric === "revenue"
                ? "Booked Room Revenue Trend"
                : metric === "occupancy"
                  ? "Occupancy % Trend"
                  : metric === "adr"
                    ? "ADR Trend"
                    : metric === "revpar"
                      ? "RevPAR Trend"
                      : "Sold Nights Trend"}
            </h3>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            No stay-date trend data available in this range.
          </div>
        ) : (
          <div className="pt-4">
            <ChartContainer config={metricConfigs[metric]} className="h-64 w-full">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C89933" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#C89933" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#E8E1D7" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={{ stroke: "#E8E1D7" }}
                  tick={{ fontSize: 10, fill: "#8A7D6B" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={{ stroke: "#E8E1D7" }}
                  tick={{ fontSize: 10, fill: "#8A7D6B" }}
                  tickFormatter={(val: number) => {
                    if (metric === "revenue" || metric === "adr" || metric === "revpar") {
                      return val >= 1000 ? `${Math.round(val / 1000)}k` : String(val);
                    }
                    if (metric === "occupancy") return `${val}%`;
                    return String(val);
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(val) => {
                        const num = Number(val);
                        if (metric === "revenue" || metric === "adr" || metric === "revpar") {
                          return formatCurrency(num);
                        }
                        if (metric === "occupancy") return `${num}%`;
                        return num.toLocaleString();
                      }}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#C89933"
                  strokeWidth={2}
                  fill="url(#trendGradient)"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        )}
      </div>

      {/* Dense Operational Table */}
      {showTable && (
        <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3.5">
            <div>
              <h4 className="font-display text-base font-semibold text-[#251605]">
                {granularity === "daily" ? "Daily" : granularity === "weekly" ? "Weekly" : "Monthly"}{" "}
                Breakdown
              </h4>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-[#E8E1D7] bg-[#FAF8F4] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                <tr>
                  <th className="py-3 pl-4 pr-3">Period</th>
                  <th className="px-3 py-3 text-right">Booked Revenue</th>
                  <th className="px-3 py-3 text-right">Sold Nights</th>
                  <th className="px-3 py-3 text-right">Available Nights</th>
                  <th className="px-3 py-3 text-right">Occupancy %</th>
                  <th className="px-3 py-3 text-right">ADR</th>
                  <th className="px-3 py-3 text-right">RevPAR</th>
                  <th className="px-3 py-3 text-right">Priced Share</th>
                  <th className="py-3 pl-3 pr-4 text-right">Reservations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {displayRows.map((r) => (
                  <tr key={r.key} className="hover:bg-[#FAF8F4]/80 transition-colors">
                    <td className="py-3 pl-4 pr-3 font-mono font-medium text-sm text-[#251605]">
                      {r.label}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] font-medium text-[#251605]">
                      {formatCurrency(r.bookedRoomRevenue)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                      {r.soldRoomNights.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#756A5B]">
                      {r.availableRoomNights !== null
                        ? r.availableRoomNights.toLocaleString()
                        : "N/A"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                      {r.occupancyPct !== null ? `${r.occupancyPct}%` : "N/A"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">{formatCurrency(r.adr)}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                      {r.revpar !== null ? formatCurrency(r.revpar) : "N/A"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#756A5B]">
                      {r.pricedSharePct}%
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right font-mono text-[13px] text-[#756A5B]">
                      {r.reservationCountDisplay}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
