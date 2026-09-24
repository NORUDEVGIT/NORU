import type { RestrictionCalendarCell as RestrictionCalendarCellModel } from "@/packages/pms/lib/revenue/restriction-calendar";

import {
  RESTRICTION_CALENDAR_OPEN_LABEL,
  restrictionMarkClass,
} from "@/packages/pms/lib/revenue/restriction-calendar";

function restrictionCardClass(cell: RestrictionCalendarCellModel) {
  if (cell.restriction.stopSell) {
    return "border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100";
  }

  if (
    cell.restriction.closedToArrival ||
    cell.restriction.closedToDeparture
  ) {
    return "border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100";
  }

  if (
    cell.restriction.minStay != null ||
    cell.restriction.maxStay != null
  ) {
    return "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100";
  }

  return "border-[#E8E1D7] bg-[#FBF9F5] hover:border-[#C89933]/60 hover:bg-[#FFFDF8]";
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
      onClick={onSelect}
      className={[
        "relative flex h-[68px] min-w-[96px] flex-col items-start justify-center rounded-lg border px-2 py-2 text-left transition-all",
        restrictionCardClass(cell),

        selected
          ? "z-10 border-[#C89933] shadow-sm ring-2 ring-[#C89933]"
          : "",

        !cell.planActive || cell.outsideValidity ? "opacity-60" : "",
      ].join(" ")}
    >
      {cell.hasRestriction ? (
        <div className="flex flex-wrap gap-1">
          {cell.marks.map((mark) => (
            <span
              key={mark.key}
              className={restrictionMarkClass(mark.kind)}
            >
              {mark.label}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-[11px] font-medium text-[#6F665D]">
          {RESTRICTION_CALENDAR_OPEN_LABEL}
        </span>
      )}

      <span className="mt-1.5 text-[9px] text-muted-foreground">
        {cell.inventory.occupancyPercent}% occ
      </span>
    </button>
  );
}