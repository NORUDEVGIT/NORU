import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  BULK_RATE_CHANGE_OVER_MAX_COPY,
  plansForSelectedRoomTypes,
  type BulkTargetExpansion,
} from "@/packages/pms/lib/revenue/bulk-rate-change";
import type {
  RevenueRatePlan,
  RevenueRoomType,
} from "@/packages/pms/lib/revenue/revenue-config.types";

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
  onChange: (patch: {
    fromDate?: string;
    toDate?: string;
    roomTypeIds?: string[];
    planIds?: string[];
  }) => void;
}) {
  const visiblePlans = plansForSelectedRoomTypes(ratePlans, roomTypeIds);

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  }

  return (
    <section className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
        <div>
          <Label htmlFor="bulk-from" className="text-xs font-semibold text-[#5A4833]">
            From
          </Label>
          <Input
            id="bulk-from"
            type="date"
            value={fromDate}
            onChange={(event) => onChange({ fromDate: event.target.value })}
            className="mt-1.5 h-9 w-40 text-sm font-medium text-[#251605]"
          />
        </div>
        <div>
          <Label htmlFor="bulk-to" className="text-xs font-semibold text-[#5A4833]">
            To
          </Label>
          <Input
            id="bulk-to"
            type="date"
            value={toDate}
            onChange={(event) => onChange({ toDate: event.target.value })}
            className="mt-1.5 h-9 w-40 text-sm font-medium text-[#251605]"
          />
        </div>

        <fieldset className="min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <legend className="text-xs font-semibold text-[#5A4833]">Room Types</legend>
            {roomTypeIds.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange({ roomTypeIds: [] })}
                className="text-xs font-semibold text-[#8A641A] hover:underline"
              >
                All room types
              </button>
            ) : null}
          </div>
          {roomTypes.length === 0 ? (
            <p className="text-xs text-[#756A5B]">
              No room types are configured in Property Setup.
            </p>
          ) : (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-[#E8E1D7] bg-[#FAF6F0]/60 p-2">
              {roomTypes.map((type) => {
                const checked = roomTypeIds.includes(type.id);
                return (
                  <label
                    key={type.id}
                    className={[
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      checked
                        ? "border-[#C89933] bg-white font-semibold text-[#251605] shadow-sm"
                        : "border-[#DED7CD] bg-white/80 text-[#5A4833] hover:text-[#251605]",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange({ roomTypeIds: toggle(roomTypeIds, type.id) })}
                      className="size-3.5 accent-[#C89933]"
                    />
                    <span>{type.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <fieldset className="min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <legend className="text-xs font-semibold text-[#5A4833]">Rate Plans</legend>
            {visiblePlans.length > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ planIds: visiblePlans.map((plan) => plan.id) })}
                  className="text-xs font-semibold text-[#8A641A] hover:underline"
                >
                  Select all
                </button>
                {planIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onChange({ planIds: [] })}
                    className="text-xs font-medium text-[#756A5B] hover:text-[#251605]"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {visiblePlans.length === 0 ? (
            <p className="text-xs text-[#756A5B]">
              {ratePlans.length === 0
                ? "No rate plans are configured in Property Setup."
                : "No rate plans match the selected room types."}
            </p>
          ) : (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-[#E8E1D7] bg-[#FAF6F0]/60 p-2">
              {visiblePlans.map((plan) => {
                const checked = planIds.includes(plan.id);
                return (
                  <label
                    key={plan.id}
                    className={[
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      checked
                        ? "border-[#C89933] bg-white font-semibold text-[#251605] shadow-sm"
                        : "border-[#DED7CD] bg-white/80 text-[#5A4833] hover:text-[#251605]",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange({ planIds: toggle(planIds, plan.id) })}
                      className="size-3.5 accent-[#C89933]"
                    />
                    <span>
                      {plan.code} · {plan.roomTypeName}
                      {plan.active ? "" : " (inactive)"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      </div>

      {!expansion.ok ? (
        <div className="border-t border-[#EFE9DF] pt-2.5">
          {expansion.code === "over_max" ? (
            <p className="text-xs font-medium text-[#6B4A0A]">{BULK_RATE_CHANGE_OVER_MAX_COPY}</p>
          ) : expansion.code === "invalid_range" ? (
            <p className="text-xs font-medium text-[#6B4A0A]">Choose a valid date range.</p>
          ) : (
            <p className="text-xs text-[#756A5B]">
              Select at least one rate plan and a valid date range to configure a bulk rate change.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
