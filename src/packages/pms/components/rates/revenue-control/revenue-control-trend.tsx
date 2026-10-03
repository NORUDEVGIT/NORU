import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/components/ui/chart";
import type { RevenueControlNight } from "@/packages/pms/lib/revenue/revenue-control";

const occupancyConfig = {
  occupancyPercent: { label: "Occupancy", color: "#C89933" },
} satisfies ChartConfig;

const revenueConfig = {
  bookedRoomRevenue: { label: "Booked Room Revenue", color: "#8A641A" },
} satisfies ChartConfig;

export function RevenueControlTrend({
  nightly,
  money,
}: {
  nightly: RevenueControlNight[];
  money: (value: number) => string;
}) {
  const [metric, setMetric] = useState<"occupancy" | "revenue">("occupancy");

  return (
    <section className="flex flex-col rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold text-[#251605]">
            {metric === "occupancy" ? "Occupancy Trend" : "Booked Room Revenue"}
          </h2>
          <p className="sr-only">Nightly booked values for the selected range. No forecast line.</p>
        </div>

        <div className="inline-flex rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] p-1">
          <button
            type="button"
            onClick={() => setMetric("occupancy")}
            className={`h-8 rounded-lg px-3.5 text-sm font-bold transition-colors ${
              metric === "occupancy"
                ? "bg-white text-[#251605] shadow-sm"
                : "text-[#756A5B] hover:text-[#251605]"
            }`}
          >
            Occupancy
          </button>
          <button
            type="button"
            onClick={() => setMetric("revenue")}
            className={`h-8 rounded-lg px-3.5 text-sm font-bold transition-colors ${
              metric === "revenue"
                ? "bg-white text-[#251605] shadow-sm"
                : "text-[#756A5B] hover:text-[#251605]"
            }`}
          >
            Booked Revenue
          </button>
        </div>
      </div>

      {nightly.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center text-sm text-[#756A5B]">
          No dates in the selected range.
        </div>
      ) : (
        <ChartContainer
          config={metric === "occupancy" ? occupancyConfig : revenueConfig}
          className="mt-3 h-[240px] w-full aspect-auto"
        >
          <AreaChart data={nightly} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFECE6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: "#5A4833", fontWeight: 500 }}
              tickMargin={6}
              minTickGap={20}
              stroke="#DDD4C5"
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#5A4833", fontWeight: 500 }}
              width={48}
              stroke="#DDD4C5"
              tickFormatter={(value: number) =>
                metric === "occupancy" ? `${value}%` : String(Math.round(value))
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    metric === "occupancy" ? `${Number(value)}%` : money(Number(value))
                  }
                />
              }
            />
            {metric === "occupancy" ? (
              <Area
                type="monotone"
                dataKey="occupancyPercent"
                stroke="#C89933"
                fill="#C89933"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ) : (
              <Area
                type="monotone"
                dataKey="bookedRoomRevenue"
                stroke="#8A641A"
                fill="#8A641A"
                fillOpacity={0.12}
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  );
}
