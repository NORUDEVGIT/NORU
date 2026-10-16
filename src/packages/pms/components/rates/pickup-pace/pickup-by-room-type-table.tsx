import type { PickupRoomTypeRow } from "@/packages/pms/lib/revenue/pickup-pace";
import { formatPickupPoints } from "@/packages/pms/lib/revenue/pickup-pace";

function cell(value: number | null): string {
  return value == null ? "unavailable" : String(value);
}

export function PickupByRoomTypeTable({
  rows,
  money,
}: {
  rows: PickupRoomTypeRow[];
  money: (value: number) => string;
}) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Pickup by Room Type</h2>
      <p className="text-[10px] text-muted-foreground">
        Room-type snapshot grain only. Rate-plan pickup is not computed.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No room types in the selected snapshot range.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[10px]">
            <thead className="border-b border-[#E8E1D7] bg-[#F8F5F0] text-[9px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-semibold">Room Type</th>
                <th className="px-2 py-2 font-semibold">Prior OTB</th>
                <th className="px-2 py-2 font-semibold">Current OTB</th>
                <th className="px-2 py-2 font-semibold">Rooms Pickup</th>
                <th className="px-2 py-2 font-semibold">Revenue Pickup</th>
                <th className="px-2 py-2 font-semibold">Occupancy Δ</th>
                <th className="px-2 py-2 font-semibold">ADR Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.roomTypeId} className="border-b border-[#E8E1D7]/80">
                  <td className="px-2 py-2 font-medium text-[#251605]">{row.roomTypeName}</td>
                  <td className="px-2 py-2">{cell(row.priorOtb)}</td>
                  <td className="px-2 py-2">{cell(row.currentOtb)}</td>
                  <td className="px-2 py-2">{cell(row.roomsPickup)}</td>
                  <td className="px-2 py-2">{row.revenuePickup == null ? "unavailable" : money(row.revenuePickup)}</td>
                  <td className="px-2 py-2">{row.comparable ? formatPickupPoints(row.occupancyPointChange) : "unavailable"}</td>
                  <td className="px-2 py-2">{row.adrChange == null ? "unavailable" : money(row.adrChange)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
