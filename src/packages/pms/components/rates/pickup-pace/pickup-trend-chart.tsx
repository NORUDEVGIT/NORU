import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, type ChartConfig } from "@/shared/components/ui/chart";
import type { PickupDateRow } from "@/packages/pms/lib/revenue/pickup-pace";

const config = {
  roomsPickup: { label: "Rooms Pickup", color: "#C89933" },
} satisfies ChartConfig;

function PickupTooltip({
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
      <p>Rooms pickup: {row.roomsPickup ?? "unavailable"}</p>
      <p>Revenue pickup: {row.revenuePickup ?? "unavailable"}</p>
    </div>
  );
}

export function PickupTrendChart({ dates }: { dates: PickupDateRow[] }) {
  const comparable = dates.filter((row) => row.comparable);
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Rooms Pickup</h2>
      <p className="text-[10px] text-muted-foreground">
        Snapshot-to-snapshot room-night change by stay date. Unavailable dates are omitted.
      </p>
      {comparable.length === 0 ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">No comparable stay dates in this range.</p>
      ) : (
        <ChartContainer config={config} className="mt-3 aspect-[16/7] w-full">
          <AreaChart data={comparable} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="stayDate" tick={{ fontSize: 10 }} tickMargin={6} minTickGap={16} />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip content={<PickupTooltip />} />
            <Area type="monotone" dataKey="roomsPickup" stroke="#C89933" fill="#C89933" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  );
}
