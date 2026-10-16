import { Info, SlidersHorizontal } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  RATE_CHANGE_ACTION_TYPES,
  type RateChangeActionType,
} from "@/packages/pms/lib/revenue/rate-change";
import { rateHistoryActionLabel } from "@/packages/pms/lib/revenue/rate-history";

export function RateHistoryFilters({
  actionType,
  onActionTypeChange,
}: {
  actionType: RateChangeActionType | "";
  onActionTypeChange: (value: RateChangeActionType | "") => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="rate-history-action" className="text-xs font-semibold text-[#5A4833]">
          Action Type
        </label>
        <select
          id="rate-history-action"
          value={actionType}
          onChange={(event) => onActionTypeChange(event.target.value as RateChangeActionType | "")}
          className="flex h-9 w-52 rounded-lg border border-[#DED7CD] bg-white px-3 text-sm font-medium text-[#251605]"
        >
          <option value="">All actions</option>
          {RATE_CHANGE_ACTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {rateHistoryActionLabel(value)}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 px-3 text-xs font-semibold text-[#5A4833] hover:text-[#251605]"
          onClick={() => onActionTypeChange("")}
        >
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 bg-[#D5A62B] px-3.5 text-xs font-semibold text-[#332303] hover:bg-[#C89933]"
          onClick={() => {
            const el = document.getElementById("rate-history-action");
            el?.focus();
          }}
        >
          <SlidersHorizontal className="mr-1.5 size-3.5" />
          Filters
          {actionType ? " (1)" : ""}
        </Button>
      </div>

      <p className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E1D7] bg-[#FAF6F0] px-3 py-1.5 text-xs text-[#5A4833]">
        <Info className="size-3.5 shrink-0 text-[#8A641A]" />
        <span>
          Date range filters <span className="font-semibold text-[#251605]">Changed Between</span>{" "}
          (when the change was recorded), not stay date.
        </span>
      </p>
    </div>
  );
}
