import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type {
  RateCalendarCell as RateCalendarCellModel,
  RateCalendarGroup,
  RateCalendarRoomType,
  RateCalendarRow,
  RateCalendarWorkspace,
} from "@/packages/pms/lib/revenue/rate-calendar";
import { RateCalendarCell } from "./rate-calendar-cell";

export function RateCalendarGrid({
  data,
  selected,
  selectedRowPlanId = null,
  onSelect,
  onSelectRow,
}: {
  data: RateCalendarWorkspace;
  selected: RateCalendarCellModel | null;
  selectedRowPlanId?: string | null;
  onSelect: (cell: RateCalendarCellModel) => void;
  onSelectRow?: (row: RateCalendarRow, roomType: RateCalendarRoomType) => void;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
      <table className="min-w-max w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
            <th className="sticky left-0 z-20 min-w-36 border-r border-[#E8E1D7] bg-[#F7F4EE] px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#5A4833]">
              Room Type
            </th>
            <th className="sticky left-36 z-20 min-w-48 border-r border-[#E8E1D7] bg-[#F7F4EE] px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#5A4833]">
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
  mixedCurrency,
  selected,
  selectedRowPlanId,
  onSelect,
  onSelectRow,
}: {
  group: RateCalendarGroup;
  mixedCurrency: boolean;
  selected: RateCalendarCellModel | null;
  selectedRowPlanId: string | null;
  onSelect: (cell: RateCalendarCellModel) => void;
  onSelectRow?: (row: RateCalendarRow, roomType: RateCalendarRoomType) => void;
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
                className="sticky left-0 z-10 border-r border-[#E8E1D7] bg-[#FAF6F0] px-3.5 py-3 align-top text-sm font-semibold text-[#251605]"
              >
                {group.roomType.name}
              </td>
            ) : null}
            <td
              className={[
                "sticky left-36 z-10 border-r border-[#E8E1D7] px-3.5 py-2.5 align-middle transition-colors",
                isRowSelected ? "bg-[#FDF7EB]" : "bg-white",
                onSelectRow ? "cursor-pointer hover:bg-[#FAF6F0]" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectRow?.(row, group.roomType)}
              title={
                onSelectRow
                  ? "Click to update this entire row for the selected date range"
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[#251605]">
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
