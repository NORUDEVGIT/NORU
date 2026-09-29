import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type {
  RateCalendarCell as RateCalendarCellModel,
  RateCalendarGroup,
  RateCalendarWorkspace,
} from "@/packages/pms/lib/revenue/rate-calendar";
import { RateCalendarCell } from "./rate-calendar-cell";

export function RateCalendarGrid({
  data,
  selected,
  onSelect,
}: {
  data: RateCalendarWorkspace;
  selected: RateCalendarCellModel | null;
  onSelect: (cell: RateCalendarCellModel) => void;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
      <table className="min-w-max w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
            <th className="sticky left-0 z-20 min-w-36 border-r border-[#E8E1D7] bg-[#F7F4EE] px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#5A4833]">
              Room Type
            </th>
            <th className="sticky left-36 z-20 min-w-44 border-r border-[#E8E1D7] bg-[#F7F4EE] px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#5A4833]">
              Rate Plan
            </th>
            {data.dates.map((date) => (
              <th
                key={date}
                className="sticky top-0 z-10 min-w-[6rem] px-2 py-2.5 text-left text-xs font-semibold text-[#251605]"
              >
                {formatStayDate(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFE9DF]">
          {data.groups.map((group) => (
            <GroupRows
              key={group.roomType.id}
              group={group}
              mixedCurrency={data.mixedCurrency}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  mixedCurrency,
  selected,
  onSelect,
}: {
  group: RateCalendarGroup;
  mixedCurrency: boolean;
  selected: RateCalendarCellModel | null;
  onSelect: (cell: RateCalendarCellModel) => void;
}) {
  return (
    <>
      {group.rows.map((row, index) => (
        <tr key={row.plan.id} className="border-t border-[#E8E1D7]">
          {index === 0 ? (
            <td
              rowSpan={group.rows.length}
              className="sticky left-0 z-10 border-r border-[#E8E1D7] bg-[#FAF6F0] px-3.5 py-3 align-top text-sm font-semibold text-[#251605]"
            >
              {group.roomType.name}
            </td>
          ) : null}
          <td className="sticky left-36 z-10 border-r border-[#E8E1D7] bg-white px-3.5 py-2.5 align-middle">
            <div className="text-sm font-semibold text-[#251605]">
              {row.plan.code}
              {row.plan.active ? "" : " (inactive)"}
            </div>
            <div className="text-xs text-[#756A5B]">
              {row.plan.name}
              {mixedCurrency && row.plan.currency ? ` · ${row.plan.currency}` : ""}
            </div>
          </td>
          {row.cells.map((cell) => (
            <td key={cell.date} className="p-1.5">
              <RateCalendarCell
                cell={cell}
                selected={
                  selected?.ratePlanId === cell.ratePlanId &&
                  selected.date === cell.date &&
                  selected.roomTypeId === cell.roomTypeId
                }
                onSelect={() => onSelect(cell)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
