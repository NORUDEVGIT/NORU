import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/shared/components/ui/chart";
import type { RevenueControlNight } from "@/packages/pms/lib/revenue/revenue-control";

const occupancyConfig = {
  occupancyPercent: { label: "Occupancy", color: "#C89933" },
} satisfies ChartConfig;

const revenueConfig = {
  bookedRoomRevenue: { label: "Booked Room Revenue", color: "#8B651D" },
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
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#251605]">
            {metric === "occupancy" ? "Occupancy Trend" : "Booked Room Revenue"}
          </h2>
          <p className="text-[10px] text-muted-foreground">
            Nightly booked values for the selected range. No forecast line.
          </p>
        </div>
        <div className="flex rounded-md border border-[#DED7CD] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setMetric("occupancy")}
            className={`h-7 rounded px-2 text-[10px] ${
              metric === "occupancy" ? "bg-[#F8F1E5] font-medium text-[#251605]" : "text-muted-foreground"
            }`}
          >
            Occupancy
          </button>
          <button
            type="button"
            onClick={() => setMetric("revenue")}
            className={`h-7 rounded px-2 text-[10px] ${
              metric === "revenue" ? "bg-[#F8F1E5] font-medium text-[#251605]" : "text-muted-foreground"
            }`}
          >
            Booked revenue
          </button>
        </div>
      </div>
      {nightly.length === 0 ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">No dates in the selected range.</p>
      ) : (
        <ChartContainer
          config={metric === "occupancy" ? occupancyConfig : revenueConfig}
          className="mt-3 aspect-[16/7] w-full"
        >
          <AreaChart data={nightly} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickMargin={6} minTickGap={16} />
            <YAxis
              tick={{ fontSize: 10 }}
              width={40}
              tickFormatter={(value: number) =>
                metric === "occupancy" ? `${value}` : String(Math.round(value))
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    metric === "occupancy"
                      ? `${Number(value)}%`
                      : money(Number(value))
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
                stroke="#8B651D"
                fill="#8B651D"
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
