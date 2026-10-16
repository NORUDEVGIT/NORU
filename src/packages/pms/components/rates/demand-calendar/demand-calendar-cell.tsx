import {
  demandCalendarBandClass,
  formatDemandPickup7d,
  type DemandCalendarCell as DemandCalendarCellModel,
} from "@/packages/pms/lib/revenue/demand-calendar";
import { restrictionMarkClass } from "@/packages/pms/lib/revenue/restriction-calendar";

export function DemandCalendarCell({
  cell,
  selected,
  onSelect,
}: {
  cell: DemandCalendarCellModel;
  selected: boolean;
  onSelect: () => void;
}) {
  const pickup = formatDemandPickup7d(cell.roomsPickup7d);
  const title = [
    `${cell.occupancyPercent}% occupancy`,
    `${cell.roomsRemaining} left of ${cell.roomsAvailable}`,
    pickup ? `7D pickup ${pickup}` : null,
    cell.stopSell ? "Stop Sell" : null,
    cell.overrideActive ? "Rate override" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      title={title}
      onClick={onSelect}
      className={[
        "relative flex h-[84px] min-w-[96px] flex-col items-start justify-center rounded-lg border px-2 py-1.5 text-left transition-all",
        demandCalendarBandClass(cell.band, cell.stopSell),
        selected ? "z-10 border-[#C89933] shadow-sm ring-2 ring-[#C89933]" : "hover:border-[#C89933]/60",
      ].join(" ")}
    >
      <span className="text-[12px] font-semibold text-[#251605]">{cell.occupancyPercent}%</span>
      <span className="text-[10px] text-muted-foreground">{cell.roomsRemaining} left</span>
      {pickup ? <span className="text-[9px] font-medium text-[#6B4A0A]">{pickup}</span> : null}
      {cell.marks.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-0.5">
          {cell.marks.map((mark) => (
            <span key={mark.key} className={restrictionMarkClass(mark.kind)}>
              {mark.label}
            </span>
          ))}
        </div>
      ) : null}
      {cell.overrideActive ? (
        <span className="mt-1 rounded border border-[#C89933]/50 bg-[#F8F1E5] px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-[#6B4A0A]">
          Override
        </span>
      ) : null}
    </button>
  );
}
