import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, type ChartConfig } from "@/shared/components/ui/chart";
import type { DemandDateRow } from "@/packages/pms/lib/revenue/demand";

const revenueConfig = {
  bookedRoomRevenue: { label: "Booked Room Revenue", color: "#8B651D" },
} satisfies ChartConfig;

function RevenueTooltip({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean;
  payload?: Array<{ payload: DemandDateRow }>;
  label?: string;
  money: (value: number) => string;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-[#E8E1D7] bg-white px-2.5 py-2 text-[10px] shadow-sm">
      <p className="font-medium text-[#251605]">{label}</p>
      <p>Booked revenue: {money(row.bookedRoomRevenue)}</p>
      <p>ADR: {money(row.adr)}</p>
      <p>Priced share: {row.pricedShare}%</p>
    </div>
  );
}

export function BookedRevenueChart({
  dates,
  money,
}: {
  dates: DemandDateRow[];
  money: (value: number) => string;
}) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Booked Room Revenue</h2>
      <p className="text-[10px] text-muted-foreground">
        Snapshot revenue by stay date. Unpriced nights can understate ADR.
      </p>
      {dates.length === 0 ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">No dates in the selected range.</p>
      ) : (
        <ChartContainer config={revenueConfig} className="mt-3 aspect-[16/7] w-full">
          <AreaChart data={dates} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickMargin={6} minTickGap={16} />
            <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(value: number) => String(Math.round(value))} />
            <Tooltip content={<RevenueTooltip money={money} />} />
            <Area
              type="monotone"
              dataKey="bookedRoomRevenue"
              stroke="#8B651D"
              fill="#8B651D"
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  );
}
