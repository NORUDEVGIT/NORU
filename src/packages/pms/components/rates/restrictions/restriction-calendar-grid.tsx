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
  selectedPlanIds,
  onSelect,
  onSelectRow,
  onTogglePlan,
  onToggleRoomType,
  onToggleAllPlans,
}: {
  data: RestrictionCalendarWorkspace;
  selected: RestrictionCalendarCellModel | null;
  selectedRowPlanId?: string | null;
  selectedPlanIds?: string[];
  onSelect: (cell: RestrictionCalendarCellModel) => void;
  onSelectRow?: (row: RestrictionCalendarPlanRow, roomType: RateCalendarRoomType) => void;
  onTogglePlan?: (planId: string, roomTypeId: string) => void;
  onToggleRoomType?: (roomTypeId: string, planIdsInGroup: string[]) => void;
  onToggleAllPlans?: (allPlanIds: string[]) => void;
}) {
  const allPlanIds = data.groups.flatMap((group) => group.rows.map((row) => row.plan.id));
  const showCheckboxes = Boolean(onTogglePlan || onToggleRoomType);
  const allChecked =
    showCheckboxes &&
    allPlanIds.length > 0 &&
    allPlanIds.every((id) => selectedPlanIds?.includes(id));

  return (
    <div className="overflow-auto rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
      <table className="min-w-max w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#E3DBD0] bg-[#F8F5F0]">
            <th className="sticky left-0 z-30 min-w-[190px] border-r border-[#E3DBD0] bg-[#F8F5F0] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#5A4833]">
              <div className="flex items-center gap-2">
                {showCheckboxes && onToggleAllPlans ? (
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => onToggleAllPlans(allPlanIds)}
                    title="Select or clear all visible room types and rate plans"
                    className="size-4 shrink-0 cursor-pointer accent-[#C89933]"
                  />
                ) : null}
                <span>Room Type</span>
              </div>
            </th>

            <th className="sticky left-[190px] z-30 min-w-[230px] border-r border-[#E3DBD0] bg-[#F8F5F0] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#5A4833]">
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
              selectedPlanIds={selectedPlanIds}
              onSelect={onSelect}
              onSelectRow={onSelectRow}
              onTogglePlan={onTogglePlan}
              onToggleRoomType={onToggleRoomType}
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
  selectedPlanIds,
  onSelect,
  onSelectRow,
  onTogglePlan,
  onToggleRoomType,
}: {
  group: RestrictionCalendarGroup;
  selected: RestrictionCalendarCellModel | null;
  selectedRowPlanId: string | null;
  selectedPlanIds?: string[];
  onSelect: (cell: RestrictionCalendarCellModel) => void;
  onSelectRow?: (row: RestrictionCalendarPlanRow, roomType: RateCalendarRoomType) => void;
  onTogglePlan?: (planId: string, roomTypeId: string) => void;
  onToggleRoomType?: (roomTypeId: string, planIdsInGroup: string[]) => void;
}) {
  const groupPlanIds = group.rows.map((row) => row.plan.id);
  const selectedInGroup = groupPlanIds.filter((id) => selectedPlanIds?.includes(id));
  const isGroupChecked = groupPlanIds.length > 0 && selectedInGroup.length === groupPlanIds.length;
  const isGroupIndeterminate =
    selectedInGroup.length > 0 && selectedInGroup.length < groupPlanIds.length;

  return (
    <>
      {group.rows.map((row, index) => {
        const isPlanChecked = Boolean(selectedPlanIds?.includes(row.plan.id));
        const isRowSelected = selectedRowPlanId === row.plan.id || isPlanChecked;
        return (
          <tr
            key={row.plan.id}
            className={[
              "border-t border-[#E8E1D7] transition-colors",
              isRowSelected ? "bg-[#FDF5E2]" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {index === 0 ? (
              <td
                rowSpan={group.rows.length}
                className={[
                  "sticky left-0 z-20 min-w-[190px] border-r border-[#E8E1D7] px-3.5 py-3 align-top text-sm font-semibold text-[#251605] transition-colors",
                  isGroupChecked
                    ? "border-l-4 border-l-[#C89933] bg-[#FDF5E2]"
                    : selectedInGroup.length > 0
                      ? "border-l-4 border-l-[#C89933]/60 bg-[#FBF3DF]"
                      : "bg-[#FAF6F0]",
                ].join(" ")}
              >
                {onToggleRoomType ? (
                  <label className="flex cursor-pointer items-start gap-2.5 select-none">
                    <input
                      type="checkbox"
                      checked={isGroupChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = isGroupIndeterminate;
                      }}
                      onChange={() => onToggleRoomType(group.roomType.id, groupPlanIds)}
                      className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[#C89933]"
                    />
                    <div>
                      <div className="text-sm font-semibold text-[#251605]">
                        {group.roomType.name}
                      </div>
                      <div
                        className={[
                          "mt-0.5 text-[11px] font-semibold",
                          selectedInGroup.length > 0 ? "text-[#8A641A]" : "text-[#756A5B]",
                        ].join(" ")}
                      >
                        {selectedInGroup.length > 0
                          ? `${selectedInGroup.length}/${groupPlanIds.length} selected`
                          : `${groupPlanIds.length} plan${groupPlanIds.length === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  </label>
                ) : (
                  group.roomType.name
                )}
              </td>
            ) : null}
            <td
              className={[
                "sticky left-[190px] z-20 min-w-[230px] border-r border-[#E8E1D7] px-3.5 py-2.5 align-middle transition-colors",
                isRowSelected ? "border-l-4 border-l-[#C89933] bg-[#FDF5E2]" : "bg-white",
                onSelectRow || onTogglePlan ? "cursor-pointer hover:bg-[#FAF6F0]" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (onTogglePlan) {
                  onTogglePlan(row.plan.id, group.roomType.id);
                } else {
                  onSelectRow?.(row, group.roomType);
                }
              }}
              role={onSelectRow || onTogglePlan ? "button" : undefined}
              tabIndex={onSelectRow || onTogglePlan ? 0 : undefined}
              onKeyDown={
                onSelectRow || onTogglePlan
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (onTogglePlan) {
                          onTogglePlan(row.plan.id, group.roomType.id);
                        } else {
                          onSelectRow?.(row, group.roomType);
                        }
                      }
                    }
                  : undefined
              }
              title={
                onTogglePlan
                  ? "Check to include this rate plan in bulk restriction changes, or click Edit Row for single-row date range update"
                  : onSelectRow
                    ? "Click to update restrictions for this entire row across the selected date range"
                    : undefined
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  {onTogglePlan ? (
                    <input
                      type="checkbox"
                      checked={isPlanChecked}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => onTogglePlan(row.plan.id, group.roomType.id)}
                      className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[#C89933]"
                    />
                  ) : null}
                  <div>
                    <div className="text-[13px] font-semibold text-[#251605]">
                      {row.plan.code}
                      {row.plan.active ? "" : " (inactive)"}
                    </div>
                    <div className="text-xs text-[#756A5B]">{row.plan.name}</div>
                  </div>
                </div>
                {onSelectRow ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectRow(row, group.roomType);
                    }}
                    className={[
                      "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors",
                      selectedRowPlanId === row.plan.id
                        ? "bg-[#C89933] text-[#251605]"
                        : "border border-[#DDD4C5] bg-[#FAF6F0] text-[#5A4833] hover:border-[#C89933]",
                    ].join(" ")}
                  >
                    {selectedRowPlanId === row.plan.id ? "Row Selected" : "Edit Row"}
                  </button>
                ) : null}
              </div>
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
