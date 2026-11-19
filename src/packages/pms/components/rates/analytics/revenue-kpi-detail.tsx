import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";

export function RevenueKpiDetail({
  overview,
  formatCurrency,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
}) {
  const { roomTypes } = overview.breakdowns;

  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-white shadow-xs">
      <header className="flex items-center justify-between gap-2 border-b border-[#E8E1D7] px-4 py-2.5">
        <h3 className="font-display text-sm font-semibold text-[#251605]">KPIs by Room Type</h3>
        <span className="text-[11px] font-medium text-[#756A5B]">
          {roomTypes.length} room type{roomTypes.length === 1 ? "" : "s"}
        </span>
      </header>

      {roomTypes.length === 0 ? (
        <div className="p-8 text-center text-xs text-[#756A5B]">
          No room type performance for the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E8E1D7] bg-[#FAF8F4] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
              <tr>
                <th className="py-2.5 pl-4 pr-3">Room Type</th>
                <th className="px-3 py-2.5 text-right">Sold Nights</th>
                <th className="px-3 py-2.5 text-right">Available Nights</th>
                <th className="px-3 py-2.5 text-right">Occupancy</th>
                <th className="px-3 py-2.5 text-right">Booked Revenue</th>
                <th className="px-3 py-2.5 text-right">ADR</th>
                <th className="px-3 py-2.5 text-right">RevPAR</th>
                <th className="px-3 py-2.5 text-right">Priced Nights</th>
                <th className="py-2.5 pl-3 pr-4 text-right">Reservations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E1D7]/60">
              {roomTypes.map((row) => (
                <tr key={row.roomTypeId} className="transition-colors hover:bg-[#FAF8F4]/80">
                  <td className="py-2.5 pl-4 pr-3 text-sm font-medium text-[#251605]">
                    {row.roomTypeName}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] text-[#251605]">
                    {row.soldRoomNights.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] text-[#756A5B]">
                    {row.availableRoomNights !== null
                      ? row.availableRoomNights.toLocaleString()
                      : "N/A"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] text-[#251605]">
                    {row.occupancyPct !== null ? `${row.occupancyPct}%` : "N/A"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] font-medium text-[#251605]">
                    {formatCurrency(row.bookedRoomRevenue)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] text-[#251605]">
                    {formatCurrency(row.adr)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] text-[#251605]">
                    {row.revpar !== null ? formatCurrency(row.revpar) : "N/A"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] text-[#756A5B]">
                    {row.pricedRoomNights}
                  </td>
                  <td className="py-2.5 pl-3 pr-4 text-right font-mono text-[13px] text-[#756A5B]">
                    {row.reservationCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
