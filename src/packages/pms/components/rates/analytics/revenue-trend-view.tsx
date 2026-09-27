import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type {
  DailyTrendRow,
  RevenuePerformanceOverview,
} from "@/packages/pms/lib/revenue/revenue-analytics";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/components/ui/chart";
import { Info } from "lucide-react";

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
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
}) {
  const isInventoryMeaningful = overview.inventoryMetricSupport === "SUPPORTED";
  const [metric, setMetric] = useState<TrendMetric>("revenue");
  const [granularity, setGranularity] = useState<TrendGranularity>("daily");

  const { dailyTrend } = overview;

  // Aggregate daily rows into Weekly or Monthly with strict adherence to Amendment 3:
  // Never sum reservationCount! Aggregate additive nightly metrics and recompute ratios.
  const displayRows: AggregatedTrendRow[] = useMemo(() => {
    if (granularity === "daily") {
      return dailyTrend.map((row) => ({
        key: row.stayDate,
        label: row.stayDate,
        bookedRoomRevenue: row.bookedRoomRevenue,
        soldRoomNights: row.soldRoomNights,
        availableRoomNights: row.availableRoomNights,
        occupancyPct: row.occupancyPct,
        adr: row.adr,
        revpar: row.revpar,
        pricedSharePct: row.pricedSharePct,
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
      const key = granularity === "weekly" ? getWeekNumber(d.stayDate) : d.stayDate.substring(0, 7);
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
      const unpriced = Math.max(
        0,
        d.soldRoomNights - Math.round((d.soldRoomNights * d.pricedSharePct) / 100),
      );
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
        <div className="flex flex-wrap rounded-md border border-[#E8E1D7] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setMetric("revenue")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              metric === "revenue"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Booked Revenue
          </button>
          <button
            type="button"
            onClick={() => setMetric("soldNights")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              metric === "soldNights"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sold Nights
          </button>
          <button
            type="button"
            disabled={!isInventoryMeaningful}
            onClick={() => setMetric("occupancy")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              !isInventoryMeaningful
                ? "opacity-40 cursor-not-allowed"
                : metric === "occupancy"
                  ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Occupancy {!isInventoryMeaningful ? "(N/A)" : ""}
          </button>
          <button
            type="button"
            onClick={() => setMetric("adr")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              metric === "adr"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ADR
          </button>
          <button
            type="button"
            disabled={!isInventoryMeaningful}
            onClick={() => setMetric("revpar")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              !isInventoryMeaningful
                ? "opacity-40 cursor-not-allowed"
                : metric === "revpar"
                  ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
            }`}
          >
            RevPAR {!isInventoryMeaningful ? "(N/A)" : ""}
          </button>
        </div>

        {/* Granularity Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-[#E8E1D7] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setGranularity("daily")}
              className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
                granularity === "daily"
                  ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setGranularity("weekly")}
              className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
                granularity === "weekly"
                  ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setGranularity("monthly")}
              className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
                granularity === "monthly"
                  ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
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
            <h3 className="text-sm font-semibold text-foreground">
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
            <p className="text-xs text-muted-foreground">
              {granularity === "daily"
                ? "Nightly stay-date allocation."
                : granularity === "weekly"
                  ? "Weekly weighted aggregation. Distinct reservation count is non-additive across stay dates."
                  : "Monthly weighted aggregation. Distinct reservation count is non-additive across stay dates."}{" "}
              No forecast or budget comparison line configured.
            </p>
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
      <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
        <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {granularity === "daily" ? "Daily" : granularity === "weekly" ? "Weekly" : "Monthly"}{" "}
              Breakdown
            </h4>
            <p className="text-[11px] text-muted-foreground">
              {granularity !== "daily" &&
                "Notice: Reservation Count is displayed as '—' because reservations spanning multiple dates cannot be summed."}
            </p>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-[#E8E1D7] bg-[#F7F4EE] text-[11px] font-medium text-muted-foreground">
              <tr>
                <th className="py-2.5 pl-4 pr-3">Period</th>
                <th className="px-3 py-2.5 text-right">Booked Revenue</th>
                <th className="px-3 py-2.5 text-right">Sold Nights</th>
                <th className="px-3 py-2.5 text-right">Available Nights</th>
                <th className="px-3 py-2.5 text-right">Occupancy %</th>
                <th className="px-3 py-2.5 text-right">ADR</th>
                <th className="px-3 py-2.5 text-right">RevPAR</th>
                <th className="px-3 py-2.5 text-right">Priced Share</th>
                <th className="py-2.5 pl-3 pr-4 text-right">Reservations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E1D7]/60">
              {displayRows.map((r) => (
                <tr key={r.key} className="hover:bg-muted/20">
                  <td className="py-2 pl-4 pr-3 font-mono font-medium text-foreground">
                    {r.label}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-foreground">
                    {formatCurrency(r.bookedRoomRevenue)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.soldRoomNights.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                    {r.availableRoomNights !== null
                      ? r.availableRoomNights.toLocaleString()
                      : "N/A"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.occupancyPct !== null ? `${r.occupancyPct}%` : "N/A"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(r.adr)}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.revpar !== null ? formatCurrency(r.revpar) : "N/A"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                    {r.pricedSharePct}%
                  </td>
                  <td className="py-2 pl-3 pr-4 text-right font-mono text-muted-foreground">
                    {r.reservationCountDisplay}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
