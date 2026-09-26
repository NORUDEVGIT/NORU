import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";

export function RevenueKpiStrip({
  overview,
  formatCurrency,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
}) {
  const isInventoryMeaningful = overview.inventoryMetricSupport === "SUPPORTED";

  const kpis = [
    {
      id: "revenue",
      label: "Booked Room Revenue",
      value: formatCurrency(overview.summary.bookedRoomRevenue),
      formula: "Sum of nightly rate allocations for priced reservations in range.",
      sub: `${overview.summary.reservationCount} total reservations`,
    },
    {
      id: "soldNights",
      label: "Sold Room Nights",
      value: overview.summary.soldRoomNights.toLocaleString(),
      formula: "Sum of occupied room nights across active stay dates.",
      sub:
        overview.summary.unpricedSoldNights > 0
          ? `${overview.summary.unpricedSoldNights} unpriced`
          : undefined,
    },
    {
      id: "availableNights",
      label: "Available Room Nights",
      value:
        isInventoryMeaningful && overview.summary.availableRoomNights !== null
          ? overview.summary.availableRoomNights.toLocaleString()
          : "N/A",
      formula: isInventoryMeaningful
        ? "Active rooms in inventory × stay date count."
        : "Inventory metrics are not meaningful when filtering by non-inventory dimensions.",
      sub: !isInventoryMeaningful ? "Non-inventory filter" : undefined,
      muted: !isInventoryMeaningful,
    },
    {
      id: "occupancy",
      label: "Occupancy",
      value:
        isInventoryMeaningful && overview.summary.occupancyPct !== null
          ? `${overview.summary.occupancyPct}%`
          : "N/A",
      formula: isInventoryMeaningful
        ? "Sold Room Nights / Available Room Nights"
        : "Not meaningful under non-inventory filters (rate plan, segment, source).",
      sub: !isInventoryMeaningful ? "Non-inventory filter" : undefined,
      muted: !isInventoryMeaningful,
    },
    {
      id: "adr",
      label: "ADR",
      value: formatCurrency(overview.summary.adr),
      formula: "Booked Room Revenue / Sold Room Nights",
      sub: "Average Daily Rate",
    },
    {
      id: "revpar",
      label: "RevPAR",
      value:
        isInventoryMeaningful && overview.summary.revpar !== null
          ? formatCurrency(overview.summary.revpar)
          : "N/A",
      formula: isInventoryMeaningful
        ? "Booked Room Revenue / Available Room Nights"
        : "Not meaningful under non-inventory filters.",
      sub: !isInventoryMeaningful ? "Non-inventory filter" : "Revenue per Available Room",
      muted: !isInventoryMeaningful,
    },
    {
      id: "pricedShare",
      label: "Priced Share",
      value: `${overview.summary.pricedSharePct}%`,
      formula: "Percentage of sold nights with an authoritative pricing snapshot.",
      sub: overview.summary.pricedSharePct === 100 ? "100% priced" : "Partial pricing",
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            className={`flex flex-col justify-between rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-xs transition-colors ${
              kpi.muted ? "bg-muted/30 opacity-80" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">{kpi.label}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground/60 hover:text-foreground">
                    <Info className="h-3 w-3" />
                    <span className="sr-only">Formula info for {kpi.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  <p className="font-semibold">{kpi.label}</p>
                  <p className="mt-0.5 text-muted-foreground">{kpi.formula}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-2">
              <span className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {kpi.value}
              </span>
              {kpi.sub && (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{kpi.sub}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
