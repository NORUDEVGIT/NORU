import type { ReactNode } from "react";

/**
 * Slot for a report's own filters. The shared shell does not define
 * Police or Cashier controls.
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
      className="report-print-hide flex flex-wrap items-end gap-2 rounded-xl border border-[#E8E1D7] bg-white px-3 py-3 shadow-sm"
      data-testid="reports-filter-bar"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">{children}</div>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 shrink-0 items-center rounded-lg border border-[#E8E1D7] bg-white px-3 text-xs font-medium text-[#251605] hover:border-[#C89933]/60"
        >
          Clear filters
        </button>
      ) : null}
      {onApply ? (
        <button
          type="button"
          onClick={onApply}
          className="inline-flex h-9 shrink-0 items-center rounded-lg bg-[#251605] px-3 text-xs font-medium text-white"
        >
          Apply
        </button>
      ) : null}
    </div>
  );
}
