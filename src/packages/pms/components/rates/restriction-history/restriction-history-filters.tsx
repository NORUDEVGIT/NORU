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
  context?: RevenueContext;
  roomTypes?: RevenueRoomType[];
  ratePlans?: RevenueRatePlan[];
  actionType: RestrictionActionType | "";
  onContextChange?: (patch: Partial<RevenueContext>) => void;
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
        {context && onContextChange ? (
          <>
            <label
              htmlFor="restriction-history-from"
              className="grid gap-1 text-xs font-semibold text-[#5A4833]"
            >
              From
              <Input
                id="restriction-history-from"
                type="date"
                value={draftFrom}
                onChange={(event) => {
                  setDraftFrom(event.target.value);
                  onContextChange({ fromDate: event.target.value });
                }}
                className="h-9 w-40 text-sm font-medium text-[#251605]"
              />
            </label>

            <label
              htmlFor="restriction-history-to"
              className="grid gap-1 text-xs font-semibold text-[#5A4833]"
            >
              To
              <Input
                id="restriction-history-to"
                type="date"
                value={draftTo}
                onChange={(event) => {
                  setDraftTo(event.target.value);
                  onContextChange({ toDate: event.target.value });
                }}
                className="h-9 w-40 text-sm font-medium text-[#251605]"
              />
            </label>

            <label
              htmlFor="restriction-history-room-type"
              className="grid min-w-44 flex-1 gap-1 text-xs font-semibold text-[#5A4833]"
            >
              Room Type
              <select
                id="restriction-history-room-type"
                value={draftRoomType}
                onChange={(event) => {
                  const next = event.target.value;
                  setDraftRoomType(next);
                  onContextChange({ roomTypeId: next || null });
                }}
                className="flex h-9 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm font-medium text-[#251605]"
              >
                <option value="">All room types</option>
                {roomTypes.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.active ? room.name : `${room.name} (inactive)`}
                  </option>
                ))}
              </select>
            </label>

            <label
              htmlFor="restriction-history-rate-plan"
              className="grid min-w-48 flex-1 gap-1 text-xs font-semibold text-[#5A4833]"
            >
              Rate Plan
              <select
                id="restriction-history-rate-plan"
                value={draftRatePlan}
                onChange={(event) => {
                  const next = event.target.value;
                  setDraftRatePlan(next);
                  onContextChange({ ratePlanId: next || null });
                }}
                className="flex h-9 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm font-medium text-[#251605]"
              >
                <option value="">All rate plans</option>
                {visiblePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.active
                      ? `${plan.code} — ${plan.name}`
                      : `${plan.code} — ${plan.name} (inactive)`}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

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
