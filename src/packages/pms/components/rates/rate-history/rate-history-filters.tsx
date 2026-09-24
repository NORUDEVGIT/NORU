import { RATE_CHANGE_ACTION_TYPES, type RateChangeActionType } from "@/packages/pms/lib/revenue/rate-change";
import { rateHistoryActionLabel } from "@/packages/pms/lib/revenue/rate-history";

export function RateHistoryFilters({
  actionType,
  onActionTypeChange,
}: {
  actionType: RateChangeActionType | "";
  onActionTypeChange: (value: RateChangeActionType | "") => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#E8E1D7] bg-card px-3 py-2">
      <div className="min-w-40">
        <label htmlFor="rate-history-action" className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Action type
        </label>
        <select
          id="rate-history-action"
          value={actionType}
          onChange={(event) => onActionTypeChange(event.target.value as RateChangeActionType | "")}
          className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
        >
          <option value="">All actions</option>
          {RATE_CHANGE_ACTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {rateHistoryActionLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <p className="pb-1 text-[10px] text-muted-foreground">
        The date range above is <span className="font-medium text-[#251605]">Changed Between</span> (when the
        change was recorded), not stay date.
      </p>
    </div>
  );
}
