import type { RevenueControlRoomTypeRow } from "@/packages/pms/lib/revenue/revenue-control";

export function RevenueControlRoomTypes({
  rows,
  money,
  embedded = false,
}: {
  rows: RevenueControlRoomTypeRow[];
  money: (value: number) => string;
  embedded?: boolean;
}) {
  const visibleRows = rows.slice(0, 5);

  const content =
    visibleRows.length === 0 ? (
      <p className="rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F5] px-3.5 py-3 text-center text-sm font-medium text-[#5A4833]">
        No room type performance is available for this range.
      </p>
    ) : (
      <div className="w-full overflow-hidden rounded-lg border border-[#EFECE6]">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-[#DDD4C5] bg-[#FAF6F0] text-xs font-bold text-[#5A4833]">
            <tr>
              <th className="h-9 w-[38%] px-3">Room Type</th>
              <th className="h-9 w-[18%] px-2.5 text-right">Occupancy</th>
              <th className="h-9 w-[22%] px-2.5 text-right">ADR</th>
              <th className="h-9 w-[22%] px-3 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFECE6]">
            {visibleRows.map((row) => (
              <tr key={row.roomTypeId} className="transition-colors hover:bg-[#FAF6F0]/60">
                <td
                  className="h-10 truncate px-3 font-semibold text-[#251605]"
                  title={row.roomTypeName}
                >
                  {row.roomTypeName}
                </td>
                <td className="h-10 px-2.5 text-right font-semibold text-[#251605]">
                  {row.occupancyPercent}%
                </td>
                <td className="h-10 px-2.5 text-right font-medium text-[#251605]">
                  {money(row.adr)}
                </td>
                <td className="h-10 px-3 text-right font-semibold text-[#251605]">
                  {money(row.bookedRoomRevenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  if (embedded) {
    return <div className="mt-3">{content}</div>;
  }

  return (
    <section className="flex flex-col rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-[#251605]">
          Top Room Type Performance
        </h2>
        {visibleRows.length > 0 ? (
          <span className="rounded-full bg-[#FAF6F0] px-2.5 py-0.5 text-xs font-bold text-[#5A4833]">
            Top {visibleRows.length}
          </span>
        ) : null}
      </div>
      {content}
    </section>
  );
}
