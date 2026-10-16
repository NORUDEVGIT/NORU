import type { RestrictionCalendarCell as RestrictionCalendarCellModel } from "@/packages/pms/lib/revenue/restriction-calendar";
import {
  RESTRICTION_CALENDAR_OPEN_LABEL,
  restrictionMarkClass,
} from "@/packages/pms/lib/revenue/restriction-calendar";

function restrictionCardClass(cell: RestrictionCalendarCellModel, selected: boolean) {
  if (selected) {
    return "z-10 border-[#C89933] bg-[#FDF5E2] shadow-md ring-2 ring-[#C89933]";
  }

  if (cell.restriction.stopSell) {
    return "border-rose-400 border-l-4 border-l-rose-600 bg-rose-50/95 hover:border-rose-500 hover:bg-rose-100/90";
  }

  if (cell.restriction.closedToArrival || cell.restriction.closedToDeparture) {
    return "border-amber-400 border-l-4 border-l-amber-500 bg-amber-50/95 hover:border-amber-500 hover:bg-amber-100/90";
  }

  if (cell.restriction.minStay != null || cell.restriction.maxStay != null) {
    return "border-indigo-300 border-l-4 border-l-indigo-600 bg-indigo-50/85 hover:border-indigo-400 hover:bg-indigo-100/80";
  }

  return "border-emerald-200 bg-emerald-50/50 hover:border-[#C89933]/70 hover:bg-emerald-50/90";
}

export function RestrictionCalendarCell({
  cell,
  selected,
  onSelect,
}: {
  cell: RestrictionCalendarCellModel;
  selected: boolean;
  onSelect: () => void;
}) {
  const title = [
    cell.restrictionLabel ?? "No restrictions applied",
    `${cell.inventory.occupancyPercent}% occupancy · ${cell.inventory.roomsSold} sold · ${cell.inventory.roomsAvailable} available`,
    cell.outsideValidity ? "Outside plan validity" : null,
    cell.planActive ? null : "Inactive plan",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      title={title}
      aria-label={`${cell.date}: ${title}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        "relative flex h-[72px] min-w-[104px] w-full cursor-pointer flex-col items-start justify-between rounded-lg border px-2.5 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
        restrictionCardClass(cell, selected),
        !cell.planActive || cell.outsideValidity ? "opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {cell.hasRestriction ? (
        <div className="flex flex-wrap gap-1">
          {cell.marks.map((mark) => (
            <span key={mark.key} className={restrictionMarkClass(mark.kind)}>
              {mark.label}
            </span>
          ))}
        </div>
      ) : (
        <span className="inline-flex items-center rounded bg-emerald-100/90 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
          {RESTRICTION_CALENDAR_OPEN_LABEL}
        </span>
      )}

      <span className="mt-1 text-[11px] font-semibold text-[#5A4833]">
        {cell.inventory.occupancyPercent}% occ
      </span>
    </button>
  );
}
