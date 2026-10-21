import type { ReactNode } from "react";
import { Filter, RotateCcw, SlidersHorizontal } from "lucide-react";

/**
 * Slot for a report's own filters.
 * Structured to match the modern filtering toolbar in Cashiering and Reservations.
 */
export function ReportFilterBar({
  children,
  onClear,
  onApply,
}: {
  children?: ReactNode;
  onClear?: () => void;
  onApply?: () => void;
}) {
  return (
    <div
      className="report-print-hide space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-2xs"
      data-testid="reports-filter-bar"
    >
      {/* Header toolbar strip */}
      <div className="flex items-center justify-between border-b border-[#F2ECE3] pb-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md border border-[#E5D7B7] bg-[#FAF3E3] text-[#8A6A24]">
            <SlidersHorizontal className="size-3" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#8A6A24]">
            Filter & Search
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#DDD4C5] bg-[#FAF8F4] px-2.5 text-xs font-medium text-[#7A7167] transition-colors hover:border-[#C89933] hover:bg-[#FAF3E3] hover:text-[#251605]"
            >
              <RotateCcw className="size-3 text-[#A89F91]" />
              <span>Clear filters</span>
            </button>
          ) : null}
          {onApply ? (
            <button
              type="button"
              onClick={onApply}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#8A6A24] px-3.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-[#6F531B]"
            >
              <Filter className="size-3" />
              <span>Apply</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Inputs container */}
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
  );
}
