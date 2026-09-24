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
    <div className="overflow-auto rounded-xl border border-[#E8E1D7] bg-card">
      <table className="min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
            <th className="sticky left-0 z-20 min-w-28 border-r border-[#E8E1D7] bg-[#F7F4EE] px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Room type
            </th>
            <th className="sticky left-28 z-20 min-w-36 border-r border-[#E8E1D7] bg-[#F7F4EE] px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Rate plan
            </th>
            {data.dates.map((date) => (
              <th
                key={date}
                className="sticky top-0 z-10 min-w-[4.75rem] px-1 py-2 text-left text-[10px] font-medium text-[#251605]"
              >
                {formatStayDate(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
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
              className="sticky left-0 z-10 border-r border-[#E8E1D7] bg-[#F7F4EE] px-2 py-2 align-top text-xs font-semibold text-[#251605]"
            >
              {group.roomType.name}
            </td>
          ) : null}
          <td className="sticky left-28 z-10 border-r border-[#E8E1D7] bg-card px-2 py-1.5 align-middle">
            <div className="text-xs font-medium text-[#251605]">
              {row.plan.code}
              {row.plan.active ? "" : " (inactive)"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {row.plan.name}
              {mixedCurrency && row.plan.currency ? ` · ${row.plan.currency}` : ""}
            </div>
          </td>
          {row.cells.map((cell) => (
            <td key={cell.date} className="px-1 py-1">
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
