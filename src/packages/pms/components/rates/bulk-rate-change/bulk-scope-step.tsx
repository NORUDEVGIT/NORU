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

  const allPlanIds = ratePlans.map((plan) => plan.id);
  const allChecked = allPlanIds.length > 0 && allPlanIds.every((id) => planIds.includes(id));

  return (
    <section className="space-y-2.5 rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="bulk-from" className="text-xs font-semibold text-[#5A4833]">
              From
            </Label>
            <Input
              id="bulk-from"
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
            <Label htmlFor="bulk-to" className="text-xs font-semibold text-[#5A4833]">
              To
            </Label>
            <Input
              id="bulk-to"
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
                onChange={() =>
                  onChange({
                    roomTypeIds: allChecked ? [] : roomTypes.map((rt) => rt.id),
                    planIds: allChecked ? [] : allPlanIds,
                  })
                }
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
