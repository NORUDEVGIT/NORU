import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";
import { Info } from "lucide-react";

export function RevenueKpiDetail({
  overview,
  formatCurrency,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
}) {
  const isInventoryMeaningful = overview.inventoryMetricSupport === "SUPPORTED";
  const { roomTypes } = overview.breakdowns;

  return (
    <div className="space-y-4">
      {/* 1. Formula Explanation Cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[#E8E1D7] bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Occupancy Rate
            </span>
            <span className="font-display text-base font-semibold text-foreground">
              {isInventoryMeaningful && overview.summary.occupancyPct !== null
                ? `${overview.summary.occupancyPct}%`
                : "N/A"}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Sold Room Nights / Available Room Nights
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Measures inventory utilization across physical rooms in the active stay window.
          </p>
        </div>

        <div className="rounded-xl border border-[#E8E1D7] bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Average Daily Rate (ADR)
            </span>
            <span className="font-display text-base font-semibold text-foreground">
              {formatCurrency(overview.summary.adr)}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Booked Room Revenue / Sold Room Nights
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Average realization per occupied room night for priced reservations.
          </p>
        </div>

        <div className="rounded-xl border border-[#E8E1D7] bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              RevPAR
            </span>
            <span className="font-display text-base font-semibold text-foreground">
              {isInventoryMeaningful && overview.summary.revpar !== null
                ? formatCurrency(overview.summary.revpar)
                : "N/A"}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Booked Room Revenue / Available Room Nights
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Yield generated per available room capacity. Evaluates pricing vs volume balance.
          </p>
        </div>
      </div>

      {/* 2. Room Type Table */}
      <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
        <div className="flex flex-col gap-1 border-b border-[#E8E1D7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Room Type KPI Breakdown</h3>
            <p className="text-xs text-muted-foreground">
              Operational metrics allocated by room category.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            <span>Forecast and budget comparisons are not configured.</span>
          </div>
        </div>

        {roomTypes.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No room type performance data available for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE]/50 text-[11px] font-medium text-muted-foreground">
                <tr>
                  <th className="py-2.5 pl-4 pr-3">Room Type</th>
                  <th className="px-3 py-2.5 text-right">Sold Nights</th>
                  <th className="px-3 py-2.5 text-right">Available Nights</th>
                  <th className="px-3 py-2.5 text-right">Occupancy %</th>
                  <th className="px-3 py-2.5 text-right">Booked Revenue</th>
                  <th className="px-3 py-2.5 text-right">ADR</th>
                  <th className="px-3 py-2.5 text-right">RevPAR</th>
                  <th className="px-3 py-2.5 text-right">Priced Nights</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Reservations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {roomTypes.map((row) => (
                  <tr key={row.roomTypeId} className="hover:bg-muted/20">
                    <td className="py-2.5 pl-4 pr-3 font-medium text-foreground">
                      {row.roomTypeName}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.soldRoomNights.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.availableRoomNights !== null
                        ? row.availableRoomNights.toLocaleString()
                        : "N/A"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.occupancyPct !== null ? `${row.occupancyPct}%` : "N/A"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground">
                      {formatCurrency(row.bookedRoomRevenue)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(row.adr)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.revpar !== null ? formatCurrency(row.revpar) : "N/A"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      {row.pricedSoldNights}
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right font-mono text-muted-foreground">
                      {row.reservationCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
