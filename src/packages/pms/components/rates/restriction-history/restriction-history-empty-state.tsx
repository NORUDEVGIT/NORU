import {
  RESTRICTION_HISTORY_EMPTY_COPY,
  RESTRICTION_HISTORY_EMPTY_SECONDARY,
} from "@/packages/pms/lib/revenue/restriction-history";

export function RestrictionHistoryEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-[#FAF6F0] px-4 py-8 text-center">
      <p className="text-sm font-semibold text-[#251605]">{RESTRICTION_HISTORY_EMPTY_COPY}</p>
      <p className="mt-1 text-xs text-[#756A5B]">{RESTRICTION_HISTORY_EMPTY_SECONDARY}</p>
    </div>
  );
}
