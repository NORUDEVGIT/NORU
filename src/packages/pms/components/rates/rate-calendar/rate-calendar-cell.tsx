import type { RateCalendarCell as RateCalendarCellModel } from "@/packages/pms/lib/revenue/rate-calendar";
import { inventoryBandLabel } from "@/packages/pms/lib/revenue/rate-calendar";

function formatRate(value: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

const BAND_CLASS: Record<RateCalendarCellModel["inventory"]["band"], string> = {
  available:
    "border-emerald-300 bg-emerald-50/95 text-[#251605] hover:border-emerald-400 hover:bg-emerald-100/80",
  limited:
    "border-amber-300 bg-amber-50/95 text-[#251605] hover:border-amber-400 hover:bg-amber-100/80",
  "low-remaining":
    "border-rose-300 bg-rose-50/95 text-[#251605] hover:border-rose-400 hover:bg-rose-100/80",
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
  const marks: Array<{ label: string; isStopSell?: boolean; isCtaCtd?: boolean }> = [];
  if (restriction.stopSell) marks.push({ label: "SS", isStopSell: true });
  if (restriction.closedToArrival) marks.push({ label: "CTA", isCtaCtd: true });
  if (restriction.closedToDeparture) marks.push({ label: "CTD", isCtaCtd: true });
  if (restriction.minStay != null) marks.push({ label: `Min ${restriction.minStay}` });
  if (restriction.maxStay != null) marks.push({ label: `Max ${restriction.maxStay}` });

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
        "relative flex h-[70px] w-full min-w-[6.25rem] cursor-pointer flex-col items-start justify-between rounded-lg border px-2.5 py-1.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
        selected
          ? "z-10 border-[#C89933] bg-[#FDF5E2] shadow-md ring-2 ring-[#C89933]"
          : cell.overrideActive
            ? "border-[#C89933] border-l-4 border-l-[#C89933] bg-[#FFFDF7] shadow-xs hover:bg-[#FDF7EB]"
            : BAND_CLASS[cell.inventory.band],
        !cell.planActive || cell.outsideValidity ? "opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex w-full items-center justify-between gap-1">
        <span className="text-sm font-bold leading-tight tabular-nums text-[#251605]">
          {formatRate(cell.effectiveRate)}
        </span>
        {cell.overrideActive ? (
          <span
            className="inline-flex items-center rounded bg-[#C89933] px-1.5 py-0.5 text-[11px] font-bold leading-none text-[#251605]"
            aria-label="Override"
          >
            OVR
          </span>
        ) : null}
      </div>

      {marks.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {marks.map((mark) => (
            <span
              key={mark.label}
              className={[
                "rounded px-1 py-0.5 text-[11px] font-bold leading-none",
                mark.isStopSell
                  ? "bg-rose-600 text-white"
                  : mark.isCtaCtd
                    ? "bg-amber-500 text-[#251605]"
                    : "bg-[#251605] text-white",
              ].join(" ")}
            >
              {mark.label}
            </span>
          ))}
        </div>
      ) : (
        <span className="mt-1 text-xs font-semibold text-[#5A4833]">
          {cell.inventory.occupancyPercent}% occ
        </span>
      )}
    </button>
  );
}
