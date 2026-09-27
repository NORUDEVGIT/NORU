import type { PickupDateRow } from "@/packages/pms/lib/revenue/pickup-pace";
import { formatPickupPoints } from "@/packages/pms/lib/revenue/pickup-pace";

function cell(value: number | null): string {
  return value == null ? "unavailable" : String(value);
}

export function PickupByDateTable({
  rows,
  money,
}: {
  rows: PickupDateRow[];
  money: (value: number) => string;
}) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Pickup by Stay Date</h2>
      <p className="text-[10px] text-muted-foreground">
        Comparable snapshot pairs only. Missing one side is unavailable, not zero.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No stay dates in the selected snapshot range.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[10px]">
            <thead className="border-b border-[#E8E1D7] bg-[#F8F5F0] text-[9px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-semibold">Stay Date</th>
                <th className="px-2 py-2 font-semibold">Prior OTB</th>
                <th className="px-2 py-2 font-semibold">Current OTB</th>
                <th className="px-2 py-2 font-semibold">Pickup</th>
                <th className="px-2 py-2 font-semibold">Revenue Pickup</th>
                <th className="px-2 py-2 font-semibold">Occupancy Change</th>
                <th className="px-2 py-2 font-semibold">Rooms Remaining current</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.stayDate} className="border-b border-[#E8E1D7]/80">
                  <td className="px-2 py-2 font-medium text-[#251605]">{row.stayDate}</td>
                  <td className="px-2 py-2">{cell(row.priorRoomsOnBooks)}</td>
                  <td className="px-2 py-2">{cell(row.currentRoomsOnBooks)}</td>
                  <td className="px-2 py-2">{cell(row.roomsPickup)}</td>
                  <td className="px-2 py-2">{row.revenuePickup == null ? "unavailable" : money(row.revenuePickup)}</td>
                  <td className="px-2 py-2">{row.comparable ? formatPickupPoints(row.occupancyPointChange) : "unavailable"}</td>
                  <td className="px-2 py-2">{cell(row.roomsRemainingCurrent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
