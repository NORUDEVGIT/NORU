import type { DemandRoomTypeRollup } from "@/packages/pms/lib/revenue/demand-overview";

export function DemandRoomTypeTable({
  rows,
  money,
}: {
  rows: DemandRoomTypeRollup[];
  money: (value: number) => string;
}) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Room Type Nights</h2>
      <p className="text-[10px] text-muted-foreground">
        Occupancy nights by room type. Available nights still count active rooms × days.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No room types in this range.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[10px]">
            <thead className="border-b border-[#E8E1D7] bg-[#F8F5F0] text-[9px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-semibold">Room Type</th>
                <th className="px-2 py-2 font-semibold">OTB nights</th>
                <th className="px-2 py-2 font-semibold">Available</th>
                <th className="px-2 py-2 font-semibold">Remaining</th>
                <th className="px-2 py-2 font-semibold">Occupancy</th>
                <th className="px-2 py-2 font-semibold">Booked Revenue</th>
                <th className="px-2 py-2 font-semibold">ADR</th>
                <th className="px-2 py-2 font-semibold">Priced Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.roomTypeId} className="border-b border-[#E8E1D7]/80">
                  <td className="px-2 py-2 font-medium text-[#251605]">{row.roomTypeName}</td>
                  <td className="px-2 py-2">{row.roomsOnBooks}</td>
                  <td className="px-2 py-2">{row.roomsAvailable}</td>
                  <td className="px-2 py-2">{row.roomsRemaining}</td>
                  <td className="px-2 py-2">{row.occupancyPercent}%</td>
                  <td className="px-2 py-2">{money(row.bookedRoomRevenue)}</td>
                  <td className="px-2 py-2">{money(row.adr)}</td>
                  <td className="px-2 py-2">{row.pricedShare}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
