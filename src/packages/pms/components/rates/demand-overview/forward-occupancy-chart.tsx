import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, type ChartConfig } from "@/shared/components/ui/chart";
import type { DemandDateRow } from "@/packages/pms/lib/revenue/demand";

const occupancyConfig = {
  occupancyPercent: { label: "OTB Occupancy", color: "#C89933" },
} satisfies ChartConfig;

function OccupancyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: DemandDateRow }>;
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-[#E8E1D7] bg-white px-2.5 py-2 text-[10px] shadow-sm">
      <p className="font-medium text-[#251605]">{label}</p>
      <p>OTB nights: {row.roomsOnBooks}</p>
      <p>Available nights: {row.roomsAvailable}</p>
      <p>Remaining nights: {row.roomsRemaining}</p>
      <p>Occupancy: {row.occupancyPercent}%</p>
    </div>
  );
}

export function ForwardOccupancyChart({ dates }: { dates: DemandDateRow[] }) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Forward Occupancy</h2>
      <p className="text-[10px] text-muted-foreground">
        Live on-the-books occupancy by stay date. No forecast series.
      </p>
      {dates.length === 0 ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">No dates in the selected range.</p>
      ) : (
        <ChartContainer config={occupancyConfig} className="mt-3 aspect-[16/7] w-full">
          <AreaChart data={dates} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickMargin={6} minTickGap={16} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={36} tickFormatter={(value: number) => `${value}`} />
            <Tooltip content={<OccupancyTooltip />} />
            <Area
              type="monotone"
              dataKey="occupancyPercent"
              stroke="#C89933"
              fill="#C89933"
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  );
}
