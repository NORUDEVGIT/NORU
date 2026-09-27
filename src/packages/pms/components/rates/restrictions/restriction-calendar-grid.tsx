import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type {
  RestrictionCalendarCell as RestrictionCalendarCellModel,
  RestrictionCalendarGroup,
  RestrictionCalendarWorkspace,
} from "@/packages/pms/lib/revenue/restriction-calendar";
import { RestrictionCalendarCell } from "./restriction-calendar-cell";

export function RestrictionCalendarGrid({
  data,
  selected,
  onSelect,
}: {
  data: RestrictionCalendarWorkspace;
  selected: RestrictionCalendarCellModel | null;
  onSelect: (cell: RestrictionCalendarCellModel) => void;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-[#E3DBD0] bg-white shadow-sm">
  <table className="min-w-max border-collapse text-sm">
    <thead>
      <tr className="border-b border-[#E3DBD0] bg-[#F8F5F0]">
        <th className="sticky left-0 z-30 min-w-[190px] border-r border-[#E3DBD0] bg-[#F8F5F0] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Room Type
        </th>

        <th className="sticky left-[190px] z-30 min-w-[190px] border-r border-[#E3DBD0] bg-[#F8F5F0] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Rate Plan
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
          {data.groups.map((group) => (
            <GroupRows key={group.roomType.id} group={group} selected={selected} onSelect={onSelect} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  selected,
  onSelect,
}: {
  group: RestrictionCalendarGroup;
  selected: RestrictionCalendarCellModel | null;
  onSelect: (cell: RestrictionCalendarCellModel) => void;
}) {
  return (
    <>
      {group.rows.map((row, index) => (
        <tr key={row.plan.id} className="border-t border-[#E8E1D7]">
          {index === 0 ? (
            <td
              rowSpan={group.rows.length}
              className="sticky left-0 z-20 min-w-[190px] border-r border-[#E8E1D7] bg-[#F7F4EE] px-2 py-2 align-top text-xs font-semibold text-[#251605]"
            >
              {group.roomType.name}
            </td>
          ) : null}
          <td className="sticky left-[190px] z-20 min-w-[190px]  border-r border-[#E8E1D7] bg-card px-2 py-1.5 align-middle">
            <div className="text-xs font-medium text-[#251605]">
              {row.plan.code}
              {row.plan.active ? "" : " (inactive)"}
            </div>
            <div className="text-[10px] text-muted-foreground">{row.plan.name}</div>
          </td>
          {row.cells.map((cell) => (
            <td key={cell.date} className="px-1 py-1">
              <RestrictionCalendarCell
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
