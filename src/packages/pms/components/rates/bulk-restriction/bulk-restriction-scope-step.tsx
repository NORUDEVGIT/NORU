import { useEffect, useState } from "react";
import { Filter } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  BULK_RESTRICTION_OVER_MAX_COPY,
  plansForSelectedRoomTypes,
  type BulkTargetExpansion,
} from "@/packages/pms/lib/revenue/bulk-restriction-change";
import type {
  RevenueRatePlan,
  RevenueRoomType,
} from "@/packages/pms/lib/revenue/revenue-config.types";

export function BulkRestrictionScopeStep({
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
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);

  useEffect(() => {
    setDraftFrom(fromDate);
    setDraftTo(toDate);
  }, [fromDate, toDate]);

  const visiblePlans = plansForSelectedRoomTypes(ratePlans, roomTypeIds);

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  }

  return (
    <section className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <Label htmlFor="bulk-restriction-from" className="text-xs font-semibold text-[#5A4833]">
                From
              </Label>
              <Input
                id="bulk-restriction-from"
                type="date"
                value={draftFrom}
                onChange={(event) => {
                  setDraftFrom(event.target.value);
                  onChange({ fromDate: event.target.value });
                }}
                className="mt-1.5 h-9 w-40 text-sm font-medium text-[#251605]"
              />
            </div>
            <div>
              <Label htmlFor="bulk-restriction-to" className="text-xs font-semibold text-[#5A4833]">
                To
              </Label>
              <Input
                id="bulk-restriction-to"
                type="date"
                value={draftTo}
                onChange={(event) => {
                  setDraftTo(event.target.value);
                  onChange({ toDate: event.target.value });
                }}
                className="mt-1.5 h-9 w-40 text-sm font-medium text-[#251605]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2.5 text-xs font-semibold text-[#5A4833] hover:text-[#251605]"
                onClick={() => onChange({ roomTypeIds: [], planIds: [] })}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 bg-[#D5A62B] px-3 text-xs font-semibold text-[#332303] hover:bg-[#C89933]"
                onClick={() => onChange({ fromDate: draftFrom, toDate: draftTo })}
              >
                <Filter className="mr-1.5 size-3.5" />
                Filter
              </Button>
            </div>
          </div>
          <p className="text-xs text-[#756A5B]">
            Date range is not limited to the 14-day Restriction Calendar window. The wizard uses the
            full selected range.
          </p>
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
            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-[#E8E1D7] bg-[#FAF6F0]/60 p-2">
              {roomTypes.map((type) => {
                const checked = roomTypeIds.includes(type.id);
                return (
                  <label
                    key={type.id}
                    className={[
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-[#C89933]/40",
                      checked
                        ? "border-[#C89933] bg-white font-semibold text-[#251605] shadow-sm"
                        : "border-[#DED7CD] bg-white/90 text-[#251605] hover:border-[#C89933]/60 hover:bg-white",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange({ roomTypeIds: toggle(roomTypeIds, type.id) })}
                      className="size-4 shrink-0 accent-[#C89933]"
                    />
                    <span className="flex-1 select-none">{type.name}</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-xs text-[#756A5B]">
            Leave unchecked to include plans from every room type.
          </p>
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
            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-[#E8E1D7] bg-[#FAF6F0]/60 p-2">
              {visiblePlans.map((plan) => {
                const checked = planIds.includes(plan.id);
                return (
                  <label
                    key={plan.id}
                    className={[
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-[#C89933]/40",
                      checked
                        ? "border-[#C89933] bg-white font-semibold text-[#251605] shadow-sm"
                        : "border-[#DED7CD] bg-white/90 text-[#251605] hover:border-[#C89933]/60 hover:bg-white",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange({ planIds: toggle(planIds, plan.id) })}
                      className="size-4 shrink-0 accent-[#C89933]"
                    />
                    <span className="flex-1 select-none">
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

      <div className="border-t border-[#EFE9DF] pt-2.5">
        {expansion.ok ? (
          <p className="text-xs font-medium text-[#251605]">
            {expansion.targetCount} change{expansion.targetCount === 1 ? "" : "s"} across{" "}
            {expansion.dates.length} date{expansion.dates.length === 1 ? "" : "s"}.
          </p>
        ) : expansion.code === "over_max" ? (
          <p className="text-xs font-medium text-[#6B4A0A]">{BULK_RESTRICTION_OVER_MAX_COPY}</p>
        ) : expansion.code === "invalid_range" ? (
          <p className="text-xs font-medium text-[#6B4A0A]">Choose a valid date range.</p>
        ) : (
          <p className="text-xs text-[#756A5B]">
            Select at least one rate plan and a date range, or click any cell or row in the
            Restriction Calendar below.
          </p>
        )}
      </div>
    </section>
  );
}
