import { useEffect, useState } from "react";
import { Filter, Info } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  RESTRICTION_ACTION_TYPES,
  type RestrictionActionType,
} from "@/packages/pms/lib/revenue/restriction-change";
import { restrictionHistoryActionLabel } from "@/packages/pms/lib/revenue/restriction-history";
import type {
  RevenueRatePlan,
  RevenueRoomType,
} from "@/packages/pms/lib/revenue/revenue-config.types";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";

export function RestrictionHistoryFilters({
  context,
  roomTypes = [],
  ratePlans = [],
  actionType,
  onContextChange,
  onActionTypeChange,
}: {
  context?: RevenueContext | undefined;
  roomTypes?: RevenueRoomType[] | undefined;
  ratePlans?: RevenueRatePlan[] | undefined;
  actionType: RestrictionActionType | "";
  onContextChange?: ((patch: Partial<RevenueContext>) => void) | undefined;
  onActionTypeChange: (value: RestrictionActionType | "") => void;
}) {
  const [draftFrom, setDraftFrom] = useState(context?.fromDate ?? "");
  const [draftTo, setDraftTo] = useState(context?.toDate ?? "");
  const [draftRoomType, setDraftRoomType] = useState(context?.roomTypeId ?? "");
  const [draftRatePlan, setDraftRatePlan] = useState(context?.ratePlanId ?? "");
  const [draftAction, setDraftAction] = useState<RestrictionActionType | "">(actionType);

  useEffect(() => {
    if (context) {
      setDraftFrom(context.fromDate);
      setDraftTo(context.toDate);
      setDraftRoomType(context.roomTypeId ?? "");
      setDraftRatePlan(context.ratePlanId ?? "");
    }
  }, [context]);

  useEffect(() => {
    setDraftAction(actionType);
  }, [actionType]);

  const visiblePlans = draftRoomType
    ? ratePlans.filter((plan) => plan.roomTypeId === draftRoomType)
    : ratePlans;

  const activeCount = [draftRoomType, draftRatePlan, draftAction].filter(Boolean).length;

  return (
    <section className="space-y-2.5 rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        {null}

        <label
          htmlFor="restriction-history-action"
          className="grid min-w-48 gap-1 text-xs font-semibold text-[#5A4833]"
        >
          Action Type
          <select
            id="restriction-history-action"
            value={draftAction}
            onChange={(event) => {
              const next = event.target.value as RestrictionActionType | "";
              setDraftAction(next);
              onActionTypeChange(next);
            }}
            className="flex h-9 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm font-medium text-[#251605]"
          >
            <option value="">All actions</option>
            {RESTRICTION_ACTION_TYPES.map((value) => (
              <option key={value} value={value}>
                {restrictionHistoryActionLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-3 text-xs font-semibold text-[#5A4833] hover:text-[#251605]"
            onClick={() => {
              setDraftRoomType("");
              setDraftRatePlan("");
              setDraftAction("");
              onActionTypeChange("");
              onContextChange?.({ roomTypeId: null, ratePlanId: null });
            }}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 bg-[#D5A62B] px-3.5 text-xs font-semibold text-[#332303] hover:bg-[#C89933]"
            onClick={() => {
              onActionTypeChange(draftAction);
              if (onContextChange) {
                onContextChange({
                  fromDate: draftFrom,
                  toDate: draftTo,
                  roomTypeId: draftRoomType || null,
                  ratePlanId: draftRatePlan || null,
                });
              }
            }}
          >
            <Filter className="mr-1.5 size-3.5" />
            Filter
            {activeCount > 0 ? ` (${activeCount})` : ""}
          </Button>
        </div>
      </div>

      <p className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E1D7] bg-[#FAF6F0] px-3 py-1.5 text-xs text-[#5A4833]">
        <Info className="size-3.5 shrink-0 text-[#8A641A]" />
        <span>
          Date range filters <span className="font-semibold text-[#251605]">Changed Between</span>{" "}
          (when the change was recorded), not stay date.
        </span>
      </p>
    </section>
  );
}
