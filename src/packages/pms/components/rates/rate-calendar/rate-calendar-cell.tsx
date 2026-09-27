import type { RateCalendarCell as RateCalendarCellModel } from "@/packages/pms/lib/revenue/rate-calendar";
import { inventoryBandLabel } from "@/packages/pms/lib/revenue/rate-calendar";

function formatRate(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

const BAND_CLASS: Record<RateCalendarCellModel["inventory"]["band"], string> = {
  available: "bg-emerald-50 text-[#251605]",
  limited: "bg-amber-50 text-[#251605]",
  "low-remaining": "bg-rose-50 text-[#251605]",
};

export function RateCalendarCell({
  cell,
  selected,
  onSelect,
}: {
  cell: RateCalendarCellModel;
  selected: boolean;
  onSelect: () => void;
}) {
  const restriction = cell.restriction;
  const marks: string[] = [];
  if (restriction.stopSell) marks.push("SS");
  if (restriction.closedToArrival) marks.push("CTA");
  if (restriction.closedToDeparture) marks.push("CTD");
  if (restriction.minStay != null) marks.push(`Min ${restriction.minStay}`);
  if (restriction.maxStay != null) marks.push(`Max ${restriction.maxStay}`);

  const title = [
    formatRate(cell.effectiveRate),
    cell.overrideActive ? "Override" : "Base rate",
    cell.restrictionLabel,
    `${inventoryBandLabel(cell.inventory.band)} · ${cell.inventory.remainingRooms} remaining of ${cell.inventory.roomsAvailable}`,
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
        "relative flex h-14 min-w-[4.5rem] flex-col items-start justify-center rounded-md border px-1.5 text-left transition-colors",
        BAND_CLASS[cell.inventory.band],
        selected ? "z-10 border-[#C89933] ring-2 ring-[#C89933]" : "border-[#E8E1D7] hover:border-[#C89933]/70",
        !cell.planActive || cell.outsideValidity ? "opacity-70" : "",
      ].join(" ")}
    >
      <span className="flex items-center gap-1 text-sm font-semibold leading-none text-[#251605]">
        {formatRate(cell.effectiveRate)}
        {cell.overrideActive ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[#C89933]" aria-label="Override" />
        ) : null}
      </span>
      {marks.length > 0 ? (
        <span className="mt-1 text-[9px] font-medium uppercase tracking-wide text-[#6B4A0A]">
          {marks.join(" ")}
        </span>
      ) : (
        <span className="mt-1 text-[9px] text-muted-foreground">{cell.inventory.occupancyPercent}% occ</span>
      )}
    </button>
  );
}
