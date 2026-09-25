import { DEMAND_CALENDAR_LEGEND_LABELS } from "@/packages/pms/lib/revenue/demand-calendar";

const SWATCH: Record<(typeof DEMAND_CALENDAR_LEGEND_LABELS)[number], string> = {
  "Open Inventory": "bg-[#FBF9F5]",
  "Elevated Occupancy": "bg-amber-50",
  "High Occupancy": "bg-red-50",
  "Sold Out": "bg-red-100",
  "Stop Sell": "bg-red-50 ring-1 ring-red-300",
  Restriction: "bg-slate-100",
  "Rate Override": "bg-[#F8F1E5]",
};

export function DemandCalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#E8E1D7] bg-white px-4 py-3 text-[10px] text-muted-foreground shadow-sm">
      {DEMAND_CALENDAR_LEGEND_LABELS.map((label) => (
        <span key={label} className="inline-flex items-center gap-2">
          <span className={`h-3 w-3 rounded border border-[#E8E1D7] ${SWATCH[label]}`} />
          {label}
        </span>
      ))}
      <span className="ml-auto text-[9px]">Occupancy and inventory states, not demand scores</span>
    </div>
  );
}
