// Date range filters Changed Between (when the change was recorded), not stay date.

import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  RATE_CHANGE_ACTION_TYPES,
  type RateChangeActionType,
} from "@/packages/pms/lib/revenue/rate-change";
import { rateHistoryActionLabel } from "@/packages/pms/lib/revenue/rate-history";
import type {
  RevenueRatePlan,
  RevenueRoomType,
} from "@/packages/pms/lib/revenue/revenue-config.types";
import { addUtcDays, type RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";

export function RateHistoryFilters({
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
  actionType: RateChangeActionType | "";
  onContextChange?: ((patch: Partial<RevenueContext>) => void) | undefined;
  onActionTypeChange: (value: RateChangeActionType | "") => void;
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [draftFrom, setDraftFrom] = useState(context?.fromDate ?? "");
  const [draftTo, setDraftTo] = useState(context?.toDate ?? "");
  const [draftRoomType, setDraftRoomType] = useState(context?.roomTypeId ?? "");
  const [draftRatePlan, setDraftRatePlan] = useState(context?.ratePlanId ?? "");
  const [draftAction, setDraftAction] = useState<RateChangeActionType | "">(actionType);

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

  const activeChips: Array<{ id: string; label: string; onRemove: () => void }> = [];

  if (draftRoomType) {
    const rt = roomTypes.find((r) => r.id === draftRoomType);
    activeChips.push({
      id: "roomType",
      label: `Room Type: ${rt?.name ?? draftRoomType}`,
      onRemove: () => {
        setDraftRoomType("");
        onContextChange?.({ roomTypeId: null });
      },
    });
  }

  if (draftRatePlan) {
    const rp = ratePlans.find((r) => r.id === draftRatePlan);
    activeChips.push({
      id: "ratePlan",
      label: `Rate Plan: ${rp ? `${rp.code} — ${rp.name}` : draftRatePlan}`,
      onRemove: () => {
        setDraftRatePlan("");
        onContextChange?.({ ratePlanId: null });
      },
    });
  }

  if (draftAction) {
    activeChips.push({
      id: "actionType",
      label: `Action: ${rateHistoryActionLabel(draftAction)}`,
      onRemove: () => {
        setDraftAction("");
        onActionTypeChange("");
      },
    });
  }

  return (
    <div className="rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-sm">
      <div className="flex flex-nowrap items-end gap-3 overflow-x-auto pb-0.5">
        {context && onContextChange ? (
          <>
            <label
              htmlFor="rate-history-from"
              className="grid shrink-0 gap-1.5 text-xs font-semibold text-[#5A4833]"
            >
              From
              <Input
                id="rate-history-from"
                type="date"
                value={draftFrom}
                onChange={(event) => {
                  setDraftFrom(event.target.value);
                  onContextChange({ fromDate: event.target.value });
                }}
                className="h-9 w-36 text-sm font-medium text-[#251605]"
              />
            </label>

            <label
              htmlFor="rate-history-to"
              className="grid shrink-0 gap-1.5 text-xs font-semibold text-[#5A4833]"
            >
              To
              <Input
                id="rate-history-to"
                type="date"
                value={draftTo}
                onChange={(event) => {
                  setDraftTo(event.target.value);
                  onContextChange({ toDate: event.target.value });
                }}
                className="h-9 w-36 text-sm font-medium text-[#251605]"
              />
            </label>

            <label
              htmlFor="rate-history-room-type"
              className="grid shrink-0 w-44 gap-1.5 text-xs font-semibold text-[#5A4833]"
            >
              Room Type
              <select
                id="rate-history-room-type"
                value={draftRoomType}
                onChange={(event) => {
                  const next = event.target.value;
                  setDraftRoomType(next);
                  onContextChange({ roomTypeId: next || null });
                }}
                className="flex h-9 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm font-medium text-[#251605] outline-none focus:border-[#C89933]"
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
              htmlFor="rate-history-rate-plan"
              className="grid shrink-0 w-48 gap-1.5 text-xs font-semibold text-[#5A4833]"
            >
              Rate Plan
              <select
                id="rate-history-rate-plan"
                value={draftRatePlan}
                onChange={(event) => {
                  const next = event.target.value;
                  setDraftRatePlan(next);
                  onContextChange({ ratePlanId: next || null });
                }}
                className="flex h-9 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm font-medium text-[#251605] outline-none focus:border-[#C89933]"
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
          htmlFor="rate-history-action"
          className="grid shrink-0 w-48 gap-1.5 text-xs font-semibold text-[#5A4833]"
        >
          Action Type
          <select
            id="rate-history-action"
            value={draftAction}
            onChange={(event) => {
              const next = event.target.value as RateChangeActionType | "";
              setDraftAction(next);
              onActionTypeChange(next);
            }}
            className="flex h-9 w-full rounded-lg border border-[#DED7CD] bg-white px-3 text-sm font-medium text-[#251605] outline-none focus:border-[#C89933]"
          >
            <option value="">All actions</option>
            {RATE_CHANGE_ACTION_TYPES.map((value) => (
              <option key={value} value={value}>
                {rateHistoryActionLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex shrink-0 items-center gap-2">
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
              onContextChange?.({ fromDate: draftFrom, toDate: draftTo });
              setFiltersExpanded((current) => !current);
            }}
          >
            <SlidersHorizontal className="mr-1.5 size-3.5" />
            Filters
            {activeChips.length > 0 ? ` (${activeChips.length})` : ""}
          </Button>
        </div>
      </div>

      {filtersExpanded ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EFE9DF] pt-2.5 text-xs text-[#5A4833]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#251605]">Quick Window:</span>
            {[
              { label: "7 Days", days: 6 },
              { label: "14 Days", days: 13 },
              { label: "30 Days", days: 29 },
              { label: "90 Days", days: 89 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  const nextTo = addUtcDays(draftFrom, preset.days);
                  setDraftTo(nextTo);
                  onContextChange?.({
                    fromDate: draftFrom,
                    toDate: nextTo,
                  });
                }}
                className="inline-flex h-7 items-center rounded-md border border-[#DED7CD] bg-[#FAF6F0] px-2.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#EFE7DA]"
              >
                {preset.label}
              </button>
            ))}
          </div>
          {context ? (
            <span className="text-xs text-[#756A5B]">
              Showing recorded changes from {context.fromDate} to {context.toDate}
            </span>
          ) : null}
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {activeChips.map((chip) => (
            <li key={chip.id}>
              <button
                type="button"
                onClick={chip.onRemove}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#DDD4C5] bg-[#FAF6F0] px-3 py-1 text-xs font-medium text-[#251605] transition-colors hover:border-[#C89933] hover:bg-[#F3ECE0]"
              >
                <span>{chip.label}</span>
                <X className="size-3 text-[#8A641A]" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
