import type { RestrictionCalendarCell as RestrictionCalendarCellModel } from "@/packages/pms/lib/revenue/restriction-calendar";
import {
  RESTRICTION_CALENDAR_OPEN_LABEL,
  restrictionMarkClass,
} from "@/packages/pms/lib/revenue/restriction-calendar";

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
        "relative flex h-14 min-w-[4.5rem] flex-col items-start justify-center rounded-md border bg-[#F7F4EE] px-1.5 text-left transition-colors",
        selected ? "z-10 border-[#C89933] ring-2 ring-[#C89933]" : "border-[#E8E1D7] hover:border-[#C89933]/70",
        !cell.planActive || cell.outsideValidity ? "opacity-70" : "",
      ].join(" ")}
    >
      {cell.hasRestriction ? (
        <span className="flex flex-wrap gap-x-1 text-[9px] font-semibold uppercase tracking-wide">
          {cell.marks.map((mark) => (
            <span key={mark.key} className={restrictionMarkClass(mark.kind)}>
              {mark.label}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground">{RESTRICTION_CALENDAR_OPEN_LABEL}</span>
      )}
      <span className="mt-1 text-[9px] text-muted-foreground">
        {cell.inventory.occupancyPercent}% occ
      </span>
    </button>
  );
}
