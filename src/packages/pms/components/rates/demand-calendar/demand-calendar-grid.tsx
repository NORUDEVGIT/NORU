import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type {
  DemandCalendarCell as DemandCalendarCellModel,
  DemandCalendarWorkspace,
} from "@/packages/pms/lib/revenue/demand-calendar";
import { DemandCalendarCell } from "./demand-calendar-cell";

export function DemandCalendarGrid({
  data,
  selected,
  onSelect,
}: {
  data: DemandCalendarWorkspace;
  selected: DemandCalendarCellModel | null;
  onSelect: (cell: DemandCalendarCellModel) => void;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-[#E3DBD0] bg-white shadow-sm">
      <table className="min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#E3DBD0] bg-[#F8F5F0]">
            <th className="sticky left-0 z-30 min-w-[160px] border-r border-[#E3DBD0] bg-[#F8F5F0] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Room Type
            </th>
            {data.dates.map((date) => (
              <th
                key={date}
                className="sticky top-0 z-20 min-w-[104px] border-r border-[#EEE7DD] px-2 py-3 text-center text-[10px] font-semibold text-[#251605]"
              >
                {formatStayDate(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.roomTypeId} className="border-t border-[#E8E1D7]">
              <td className="sticky left-0 z-20 min-w-[160px] border-r border-[#E8E1D7] bg-[#F7F4EE] px-3 py-2 align-middle text-xs font-semibold text-[#251605]">
                {row.roomTypeName}
              </td>
              {row.cells.map((cell) => (
                <td key={`${cell.roomTypeId}|${cell.date}`} className="px-1 py-1">
                  <DemandCalendarCell
                    cell={cell}
                    selected={selected?.roomTypeId === cell.roomTypeId && selected.date === cell.date}
                    onSelect={() => onSelect(cell)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
