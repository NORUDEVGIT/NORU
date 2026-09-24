import type { RevenueControlRoomTypeRow } from "@/packages/pms/lib/revenue/revenue-control";

export function RevenueControlRoomTypes({
  rows,
  money,
}: {
  rows: RevenueControlRoomTypeRow[];
  money: (value: number) => string;
}) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Top Room Type Performance</h2>
      <p className="text-[10px] text-muted-foreground">
        Booked occupancy and snapshot revenue. Available nights still count active rooms × days.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No room types or sold nights in this range.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[10px]">
            <thead className="border-b border-[#E8E1D7] bg-[#F8F5F0] text-[9px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-semibold">Room type</th>
                <th className="px-2 py-2 font-semibold">Occupancy</th>
                <th className="px-2 py-2 font-semibold">ADR</th>
                <th className="px-2 py-2 font-semibold">Booked revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.roomTypeId} className="border-b border-[#E8E1D7]/80">
                  <td className="px-2 py-2 font-medium text-[#251605]">{row.roomTypeName}</td>
                  <td className="px-2 py-2">{row.occupancyPercent}%</td>
                  <td className="px-2 py-2">{money(row.adr)}</td>
                  <td className="px-2 py-2">{money(row.bookedRoomRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
