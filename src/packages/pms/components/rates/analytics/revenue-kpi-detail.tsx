import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";

export function RevenueKpiDetail({
  overview,
  formatCurrency,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
}) {
  const isInventoryMeaningful = overview.summary.inventoryMetricSupport === "SUPPORTED";
  const { roomTypes } = overview.breakdowns;

  return (
    <div className="space-y-4">
      {/* 1. Metric Summary Cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#756A5B]">
              Occupancy Rate
            </span>
            <span className="font-display text-2xl font-bold text-[#251605]">
              {isInventoryMeaningful && overview.summary.occupancyPct !== null
                ? `${overview.summary.occupancyPct}%`
                : "N/A"}
            </span>
          </div>
          <p className="mt-1.5 font-mono text-xs text-[#756A5B]">
            Sold Room Nights / Available Room Nights
          </p>
        </div>

        <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#756A5B]">
              Average Daily Rate (ADR)
            </span>
            <span className="font-display text-2xl font-bold text-[#251605]">
              {formatCurrency(overview.summary.adr)}
            </span>
          </div>
          <p className="mt-1.5 font-mono text-xs text-[#756A5B]">
            Booked Room Revenue / Sold Room Nights
          </p>
        </div>

        <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#756A5B]">
              RevPAR
            </span>
            <span className="font-display text-2xl font-bold text-[#251605]">
              {isInventoryMeaningful && overview.summary.revpar !== null
                ? formatCurrency(overview.summary.revpar)
                : "N/A"}
            </span>
          </div>
          <p className="mt-1.5 font-mono text-xs text-[#756A5B]">
            Booked Room Revenue / Available Room Nights
          </p>
        </div>
      </div>

      {/* 2. Room Type Table */}
      <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
        <div className="border-b border-[#E8E1D7] px-4 py-3.5">
          <h3 className="font-display text-base font-semibold text-[#251605]">
            Room Type KPI Breakdown
          </h3>
        </div>

        {roomTypes.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#756A5B]">
            No room type performance data available for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8E1D7] bg-[#FAF8F4] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                <tr>
                  <th className="py-3 pl-4 pr-3">Room Type</th>
                  <th className="px-3 py-3 text-right">Sold Nights</th>
                  <th className="px-3 py-3 text-right">Available Nights</th>
                  <th className="px-3 py-3 text-right">Occupancy %</th>
                  <th className="px-3 py-3 text-right">Booked Revenue</th>
                  <th className="px-3 py-3 text-right">ADR</th>
                  <th className="px-3 py-3 text-right">RevPAR</th>
                  <th className="px-3 py-3 text-right">Priced Nights</th>
                  <th className="py-3 pl-3 pr-4 text-right">Reservations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {roomTypes.map((row) => (
                  <tr key={row.roomTypeId} className="hover:bg-[#FAF8F4]/80 transition-colors">
                    <td className="py-3 pl-4 pr-3 font-medium text-sm text-[#251605]">
                      {row.roomTypeName}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                      {row.soldRoomNights.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#756A5B]">
                      {row.availableRoomNights !== null
                        ? row.availableRoomNights.toLocaleString()
                        : "N/A"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                      {row.occupancyPct !== null ? `${row.occupancyPct}%` : "N/A"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] font-medium text-[#251605]">
                      {formatCurrency(row.bookedRoomRevenue)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">{formatCurrency(row.adr)}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                      {row.revpar !== null ? formatCurrency(row.revpar) : "N/A"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#756A5B]">
                      {row.pricedRoomNights}
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right font-mono text-[13px] text-[#756A5B]">
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
