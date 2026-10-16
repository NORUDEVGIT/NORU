import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, type ChartConfig } from "@/shared/components/ui/chart";
import type { PickupDateRow } from "@/packages/pms/lib/revenue/pickup-pace";

const config = {
  currentRoomsOnBooks: { label: "Current OTB", color: "#C89933" },
  priorRoomsOnBooks: { label: "Prior OTB", color: "#8B651D" },
} satisfies ChartConfig;

function CompareTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: PickupDateRow }>;
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-[#E8E1D7] bg-white px-2.5 py-2 text-[10px] shadow-sm">
      <p className="font-medium text-[#251605]">{label}</p>
      <p>Current OTB: {row.currentRoomsOnBooks ?? "unavailable"}</p>
      <p>Prior OTB: {row.priorRoomsOnBooks ?? "unavailable"}</p>
    </div>
  );
}

export function PickupOtbCompareChart({ dates }: { dates: PickupDateRow[] }) {
  const comparable = dates.filter((row) => row.comparable);
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Current OTB vs Prior OTB</h2>
      <p className="text-[10px] text-muted-foreground">
        Same stay dates on two captured snapshots. This is not a forecast.
      </p>
      {comparable.length === 0 ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">No comparable stay dates in this range.</p>
      ) : (
        <ChartContainer config={config} className="mt-3 aspect-[16/7] w-full">
          <AreaChart data={comparable} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="stayDate" tick={{ fontSize: 10 }} tickMargin={6} minTickGap={16} />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip content={<CompareTooltip />} />
            <Area
              type="monotone"
              dataKey="currentRoomsOnBooks"
              stroke="#C89933"
              fill="#C89933"
              fillOpacity={0.12}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="priorRoomsOnBooks"
              stroke="#8B651D"
              fill="#8B651D"
              fillOpacity={0.08}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  );
}
