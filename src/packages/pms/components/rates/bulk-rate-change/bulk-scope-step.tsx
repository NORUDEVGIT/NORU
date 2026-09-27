import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  BULK_RATE_CHANGE_OVER_MAX_COPY,
  plansForSelectedRoomTypes,
  type BulkTargetExpansion,
} from "@/packages/pms/lib/revenue/bulk-rate-change";
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";

export function BulkScopeStep({
  fromDate,
  toDate,
  roomTypeIds,
  planIds,
  roomTypes,
  ratePlans,
  expansion,
  onChange,
}: {
  fromDate: string;
  toDate: string;
  roomTypeIds: string[];
  planIds: string[];
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  expansion: BulkTargetExpansion;
  onChange: (patch: { fromDate?: string; toDate?: string; roomTypeIds?: string[]; planIds?: string[] }) => void;
}) {
  const visiblePlans = plansForSelectedRoomTypes(ratePlans, roomTypeIds);

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="bulk-from">From</Label>
          <Input
            id="bulk-from"
            type="date"
            value={fromDate}
            onChange={(event) => onChange({ fromDate: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="bulk-to">To</Label>
          <Input
            id="bulk-to"
            type="date"
            value={toDate}
            onChange={(event) => onChange({ toDate: event.target.value })}
          />
        </div>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-[11px] font-medium text-[#251605]">Room types</legend>
        {roomTypes.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No room types are configured in Property Setup.</p>
        ) : (
          <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border border-[#E8E1D7] bg-white p-2">
            {roomTypes.map((type) => (
              <label key={type.id} className="flex items-center gap-2 text-[11px] text-[#251605]">
                <input
                  type="checkbox"
                  checked={roomTypeIds.includes(type.id)}
                  onChange={() => onChange({ roomTypeIds: toggle(roomTypeIds, type.id) })}
                />
                <span>{type.name}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">Leave unchecked to include plans from every room type.</p>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-[11px] font-medium text-[#251605]">Rate plans</legend>
        {visiblePlans.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {ratePlans.length === 0
              ? "No rate plans are configured in Property Setup."
              : "No rate plans match the selected room types."}
          </p>
        ) : (
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-[#E8E1D7] bg-white p-2">
            {visiblePlans.map((plan) => (
              <label key={plan.id} className="flex items-center gap-2 text-[11px] text-[#251605]">
                <input
                  type="checkbox"
                  checked={planIds.includes(plan.id)}
                  onChange={() => onChange({ planIds: toggle(planIds, plan.id) })}
                />
                <span>
                  {plan.code} · {plan.roomTypeName}
                  {plan.active ? "" : " (inactive)"}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {expansion.ok ? (
        <p className="text-[11px] text-[#251605]">
          {expansion.targetCount} change{expansion.targetCount === 1 ? "" : "s"} across {expansion.dates.length}{" "}
          date{expansion.dates.length === 1 ? "" : "s"}.
        </p>
      ) : expansion.code === "over_max" ? (
        <p className="text-[11px] text-[#6B4A0A]">{BULK_RATE_CHANGE_OVER_MAX_COPY}</p>
      ) : expansion.code === "invalid_range" ? (
        <p className="text-[11px] text-[#6B4A0A]">Choose a valid date range.</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">Select at least one rate plan and a date range.</p>
      )}
    </div>
  );
}
