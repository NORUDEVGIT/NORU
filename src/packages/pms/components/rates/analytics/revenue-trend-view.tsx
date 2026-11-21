import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/components/ui/chart";
import { AnalyticsSegmented } from "./analytics-segmented";

type TrendMetric = "revenue" | "occupancy" | "adr" | "revpar" | "soldNights";
type TrendGranularity = "daily" | "weekly" | "monthly";

type AggregatedTrendRow = {
  key: string;
  label: string;
  bookedRoomRevenue: number;
  soldRoomNights: number;
  occupancyPct: number | null;
  adr: number;
  revpar: number | null;
};

const METRIC_TITLES: Record<TrendMetric, string> = {
  revenue: "Booked Room Revenue",
  soldNights: "Sold Room Nights",
  occupancy: "Occupancy",
  adr: "ADR",
  revpar: "RevPAR",
};

const METRIC_CONFIGS: Record<TrendMetric, ChartConfig> = {
  revenue: { value: { label: "Booked Room Revenue", color: "#8B651D" } },
  occupancy: { value: { label: "Occupancy %", color: "#C89933" } },
  adr: { value: { label: "ADR", color: "#6A4C1B" } },
  revpar: { value: { label: "RevPAR", color: "#A87A24" } },
  soldNights: { value: { label: "Sold Room Nights", color: "#3B260F" } },
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
  const isInventoryMeaningful = overview.summary.inventoryMetricSupport === "SUPPORTED";
  const [selectedMetric, setMetric] = useState<TrendMetric>("revenue");
  const [granularity, setGranularity] = useState<TrendGranularity>("daily");
  const metric: TrendMetric =
    !isInventoryMeaningful && (selectedMetric === "occupancy" || selectedMetric === "revpar")
      ? "revenue"
      : selectedMetric;

  const { dailyTrend } = overview;

  // Never sum reservationCount; aggregate additive nightly metrics and recompute ratios.
  const displayRows: AggregatedTrendRow[] = useMemo(() => {
    if (granularity === "daily") {
      return dailyTrend.map((row) => ({
        key: row.date,
        label: row.date,
        bookedRoomRevenue: row.bookedRoomRevenue,
        soldRoomNights: row.soldRoomNights,
        occupancyPct: row.occupancyPct,
        adr: row.adr,
        revpar: row.revpar,
      }));
    }

    const map = new Map<
      string,
      {
        key: string;
        bookedRoomRevenue: number;
        soldRoomNights: number;
        availableRoomNights: number | null;
        hasNullAvailable: boolean;
      }
    >();

    for (const d of dailyTrend) {
      const key = granularity === "weekly" ? getWeekNumber(d.date) : d.date.substring(0, 7);
      const existing = map.get(key) ?? {
        key,
        bookedRoomRevenue: 0,
        soldRoomNights: 0,
        availableRoomNights: 0,
        hasNullAvailable: false,
      };
      existing.bookedRoomRevenue += d.bookedRoomRevenue;
      existing.soldRoomNights += d.soldRoomNights;
      if (d.availableRoomNights === null) {
        existing.hasNullAvailable = true;
      } else if (!existing.hasNullAvailable && existing.availableRoomNights !== null) {
        existing.availableRoomNights += d.availableRoomNights;
      }
      map.set(key, existing);
    }

    return Array.from(map.values()).map((agg) => {
      const available = agg.hasNullAvailable ? null : agg.availableRoomNights;
      return {
        key: agg.key,
        label: agg.key,
        bookedRoomRevenue: Math.round(agg.bookedRoomRevenue * 100) / 100,
        soldRoomNights: agg.soldRoomNights,
        occupancyPct:
          available !== null && available > 0
            ? Math.round((agg.soldRoomNights / available) * 1000) / 10
            : null,
        adr:
          agg.soldRoomNights > 0
            ? Math.round((agg.bookedRoomRevenue / agg.soldRoomNights) * 100) / 100
            : 0,
        revpar:
          available !== null && available > 0
            ? Math.round((agg.bookedRoomRevenue / available) * 100) / 100
            : null,
      };
    });
  }, [dailyTrend, granularity]);

  const chartData = useMemo(
    () =>
      displayRows.map((r) => {
        let val: number | null = 0;
        if (metric === "revenue") val = r.bookedRoomRevenue;
        else if (metric === "occupancy") val = r.occupancyPct;
        else if (metric === "adr") val = r.adr;
        else if (metric === "revpar") val = r.revpar;
        else val = r.soldRoomNights;
        return { date: r.label, value: val ?? 0 };
      }),
    [displayRows, metric],
  );

  const isMoney = metric === "revenue" || metric === "adr" || metric === "revpar";
  const inventoryTitle = isInventoryMeaningful
    ? undefined
    : "Not available while a rate plan, segment, or source filter is applied";

  return (
    <section className="flex h-full flex-col rounded-xl border border-[#E8E1D7] bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E1D7] px-4 py-2.5">
        <h3 className="font-display text-sm font-semibold text-[#251605]">
          {METRIC_TITLES[metric]} Trend
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <AnalyticsSegmented
            ariaLabel="Trend metric"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "revenue", label: "Revenue" },
              { value: "soldNights", label: "Sold Nights" },
              {
                value: "occupancy",
                label: "Occupancy",
                disabled: !isInventoryMeaningful,
                title: inventoryTitle,
              },
              { value: "adr", label: "ADR" },
              {
                value: "revpar",
                label: "RevPAR",
                disabled: !isInventoryMeaningful,
                title: inventoryTitle,
              },
            ]}
          />
          <AnalyticsSegmented
            ariaLabel="Trend granularity"
            value={granularity}
            onChange={setGranularity}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        </div>
      </header>

      {chartData.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-12 text-xs text-[#756A5B]">
          No stay-date trend data in this range.
        </div>
      ) : (
        <div className="flex-1 px-3 pb-3 pt-4">
          <ChartContainer config={METRIC_CONFIGS[metric]} className="aspect-auto h-[280px] w-full">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C89933" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#C89933" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#EFECE6" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={{ stroke: "#E8E1D7" }}
                tick={{ fontSize: 10, fill: "#8A7D6B" }}
                minTickGap={20}
              />
              <YAxis
                tickLine={false}
                axisLine={{ stroke: "#E8E1D7" }}
                tick={{ fontSize: 10, fill: "#8A7D6B" }}
                tickFormatter={(val: number) => {
                  if (isMoney) return val >= 1000 ? `${Math.round(val / 1000)}k` : String(val);
                  if (metric === "occupancy") return `${val}%`;
                  return String(val);
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(val) => {
                      const num = Number(val);
                      if (isMoney) return formatCurrency(num);
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
    </section>
  );
}
