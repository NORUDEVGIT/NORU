import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type { RateCalendarRoomType } from "@/packages/pms/lib/revenue/rate-calendar";
import type {
  RestrictionCalendarCell as RestrictionCalendarCellModel,
  RestrictionCalendarGroup,
  RestrictionCalendarPlanRow,
  RestrictionCalendarWorkspace,
} from "@/packages/pms/lib/revenue/restriction-calendar";
import { RestrictionCalendarCell } from "./restriction-calendar-cell";

export function RestrictionCalendarGrid({
  data,
  selected,
  selectedRowPlanId = null,
  onSelect,
  onSelectRow,
}: {
  data: RestrictionCalendarWorkspace;
  selected: RestrictionCalendarCellModel | null;
  selectedRowPlanId?: string | null;
  onSelect: (cell: RestrictionCalendarCellModel) => void;
  onSelectRow?: (row: RestrictionCalendarPlanRow, roomType: RateCalendarRoomType) => void;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
      <table className="min-w-max w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#E3DBD0] bg-[#F8F5F0]">
            <th className="sticky left-0 z-30 min-w-[190px] border-r border-[#E3DBD0] bg-[#F8F5F0] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#5A4833]">
              Room Type
            </th>

            <th className="sticky left-[190px] z-30 min-w-[210px] border-r border-[#E3DBD0] bg-[#F8F5F0] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#5A4833]">
              Rate Plan
            </th>

            {data.dates.map((date) => (
              <th
                key={date}
                className="sticky top-0 z-20 min-w-[112px] border-r border-[#EEE7DD] px-2.5 py-3 text-center text-xs font-semibold text-[#251605]"
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
              selected={selected}
              selectedRowPlanId={selectedRowPlanId}
              onSelect={onSelect}
              onSelectRow={onSelectRow}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  selected,
  selectedRowPlanId,
  onSelect,
  onSelectRow,
}: {
  group: RestrictionCalendarGroup;
  selected: RestrictionCalendarCellModel | null;
  selectedRowPlanId: string | null;
  onSelect: (cell: RestrictionCalendarCellModel) => void;
  onSelectRow?: (row: RestrictionCalendarPlanRow, roomType: RateCalendarRoomType) => void;
}) {
  return (
    <>
      {group.rows.map((row, index) => {
        const isRowSelected = selectedRowPlanId === row.plan.id;
        return (
          <tr
            key={row.plan.id}
            className={[
              "border-t border-[#E8E1D7] transition-colors",
              isRowSelected ? "bg-[#FDF7EB]" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {index === 0 ? (
              <td
                rowSpan={group.rows.length}
                className="sticky left-0 z-20 min-w-[190px] border-r border-[#E8E1D7] bg-[#FAF6F0] px-3.5 py-3 align-top text-sm font-semibold text-[#251605]"
              >
                {group.roomType.name}
              </td>
            ) : null}
            <td
              className={[
                "sticky left-[190px] z-20 min-w-[210px] border-r border-[#E8E1D7] px-3.5 py-2.5 align-middle transition-colors",
                isRowSelected ? "bg-[#FDF7EB]" : "bg-white",
                onSelectRow ? "cursor-pointer hover:bg-[#FAF6F0]" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectRow?.(row, group.roomType)}
              role={onSelectRow ? "button" : undefined}
              tabIndex={onSelectRow ? 0 : undefined}
              onKeyDown={
                onSelectRow
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectRow(row, group.roomType);
                      }
                    }
                  : undefined
              }
              title={
                onSelectRow
                  ? "Click to update restrictions for this entire row across the selected date range"
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-semibold text-[#251605]">
                  {row.plan.code}
                  {row.plan.active ? "" : " (inactive)"}
                </div>
                {onSelectRow ? (
                  <span
                    className={[
                      "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors",
                      isRowSelected
                        ? "bg-[#C89933] text-[#251605]"
                        : "border border-[#DDD4C5] bg-[#FAF6F0] text-[#5A4833]",
                    ].join(" ")}
                  >
                    {isRowSelected ? "Row Selected" : "Edit Row"}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-[#756A5B]">{row.plan.name}</div>
            </td>
            {row.cells.map((cell) => (
              <td key={cell.date} className="p-1.5">
                <RestrictionCalendarCell
                  cell={cell}
                  selected={
                    isRowSelected ||
                    (selected?.ratePlanId === cell.ratePlanId &&
                      selected.date === cell.date &&
                      selected.roomTypeId === cell.roomTypeId)
                  }
                  onSelect={() => onSelect(cell)}
                />
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
