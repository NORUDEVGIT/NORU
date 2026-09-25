import { RESTRICTION_ACTION_TYPES, type RestrictionActionType } from "@/packages/pms/lib/revenue/restriction-change";
import { restrictionHistoryActionLabel } from "@/packages/pms/lib/revenue/restriction-history";

export function RestrictionHistoryFilters({
  actionType,
  onActionTypeChange,
}: {
  actionType: RestrictionActionType | "";
  onActionTypeChange: (value: RestrictionActionType | "") => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#E8E1D7] bg-card px-3 py-2">
      <div className="min-w-40">
        <label
          htmlFor="restriction-history-action"
          className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Action type
        </label>
        <select
          id="restriction-history-action"
          value={actionType}
          onChange={(event) => onActionTypeChange(event.target.value as RestrictionActionType | "")}
          className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
        >
          <option value="">All actions</option>
          {RESTRICTION_ACTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {restrictionHistoryActionLabel(value)}
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
