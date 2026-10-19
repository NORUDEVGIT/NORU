import { useEffect, useState } from "react";
import { Filter } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  BULK_RATE_CHANGE_OVER_MAX_COPY,
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
  showSelectionDetails = false,
  idPrefix = "bulk",
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
  showSelectionDetails?: boolean;
  idPrefix?: string;
}) {
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);

  useEffect(() => {
    setDraftFrom(fromDate);
    setDraftTo(toDate);
  }, [fromDate, toDate]);

  const allPlanIds = ratePlans.map((plan) => plan.id);
  const allChecked = allPlanIds.length > 0 && allPlanIds.every((id) => planIds.includes(id));

  function applyPlanSelection(nextPlanIds: string[]) {
    const nextRoomTypeIds = Array.from(
      new Set(
        ratePlans
          .filter((plan) => nextPlanIds.includes(plan.id))
          .map((plan) => plan.roomTypeId),
      ),
    );
    onChange({ roomTypeIds: nextRoomTypeIds, planIds: nextPlanIds });
  }

  return (
    <section className="space-y-2.5 rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor={`${idPrefix}-from`} className="text-xs font-semibold text-[#5A4833]">
              From
            </Label>
            <Input
              id={`${idPrefix}-from`}
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
            <Label htmlFor={`${idPrefix}-to`} className="text-xs font-semibold text-[#5A4833]">
              To
            </Label>
            <Input
              id={`${idPrefix}-to`}
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

        <div className="flex flex-wrap items-center gap-2">
          {ratePlans.length > 0 ? (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#DED7CD] bg-[#FAF6F0] px-3 py-1.5 text-xs font-semibold text-[#251605] transition-colors hover:border-[#C89933]/60 focus-within:ring-2 focus-within:ring-[#C89933]/40">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => applyPlanSelection(allChecked ? [] : allPlanIds)}
                className="size-4 shrink-0 cursor-pointer accent-[#C89933]"
              />
              <span>Select all plans in grid ({ratePlans.length})</span>
            </label>
          ) : null}
          {planIds.length > 0 ? (
            <span className="inline-flex items-center rounded-lg border border-[#E8D5A7] bg-[#FBF6EA] px-2.5 py-1.5 text-xs font-semibold text-[#6B4A0A]">
              {roomTypeIds.length ||
                new Set(ratePlans.filter((p) => planIds.includes(p.id)).map((p) => p.roomTypeId))
                  .size}{" "}
              room type(s) · {planIds.length} rate plan(s) checked
            </span>
          ) : null}
        </div>
      </div>

      {showSelectionDetails && ratePlans.length > 0 ? (
        <div className="space-y-2 border-t border-[#EFE9DF] pt-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8A641A]">
              Customize selection
            </p>
            <p className="mt-0.5 text-xs text-[#756A5B]">
              Review the preselected scope and uncheck anything that should not change.
            </p>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {roomTypes.map((roomType) => {
              const roomPlans = ratePlans.filter((plan) => plan.roomTypeId === roomType.id);
              if (roomPlans.length === 0) return null;
              const roomPlanIds = roomPlans.map((plan) => plan.id);
              const roomChecked = roomPlanIds.every((id) => planIds.includes(id));
              const roomPartiallyChecked =
                !roomChecked && roomPlanIds.some((id) => planIds.includes(id));
              return (
                <div
                  key={roomType.id}
                  className="rounded-lg border border-[#E4DDD3] bg-[#FAF8F5] p-3"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#251605]">
                    <input
                      type="checkbox"
                      checked={roomChecked}
                      ref={(node) => {
                        if (node) node.indeterminate = roomPartiallyChecked;
                      }}
                      onChange={() => {
                        const nextPlanIds = roomChecked
                          ? planIds.filter((id) => !roomPlanIds.includes(id))
                          : Array.from(new Set([...planIds, ...roomPlanIds]));
                        applyPlanSelection(nextPlanIds);
                      }}
                      className="size-4 shrink-0 cursor-pointer accent-[#C89933]"
                    />
                    <span>{roomType.name}</span>
                    <span className="ml-auto text-xs font-medium text-[#756A5B]">
                      {roomPlanIds.filter((id) => planIds.includes(id)).length}/{roomPlans.length}
                    </span>
                  </label>
                  <div className="mt-2 grid gap-1.5 pl-6 sm:grid-cols-2">
                    {roomPlans.map((plan) => (
                      <label
                        key={plan.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-[#5A4833] hover:bg-white"
                      >
                        <input
                          type="checkbox"
                          checked={planIds.includes(plan.id)}
                          onChange={() => {
                            const nextPlanIds = planIds.includes(plan.id)
                              ? planIds.filter((id) => id !== plan.id)
                              : [...planIds, plan.id];
                            applyPlanSelection(nextPlanIds);
                          }}
                          className="size-3.5 shrink-0 cursor-pointer accent-[#C89933]"
                        />
                        <span className="truncate">
                          {plan.code} — {plan.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!expansion.ok ? (
        <div className="border-t border-[#EFE9DF] pt-2">
          {expansion.code === "over_max" ? (
            <p className="text-xs font-medium text-[#6B4A0A]">{BULK_RATE_CHANGE_OVER_MAX_COPY}</p>
          ) : expansion.code === "invalid_range" ? (
            <p className="text-xs font-medium text-[#6B4A0A]">Choose a valid date range.</p>
          ) : (
            <p className="text-xs text-[#756A5B]">
              Check one or more Room Types or Rate Plans directly in the calendar grid below to
              configure a bulk rate change, or click any cell/row.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
