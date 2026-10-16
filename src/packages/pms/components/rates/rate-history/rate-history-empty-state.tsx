import {
  RATE_HISTORY_EMPTY_COPY,
  RATE_HISTORY_EMPTY_SECONDARY,
} from "@/packages/pms/lib/revenue/rate-history";

export function RateHistoryEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-white px-6 py-10 text-center shadow-sm">
      <p className="text-sm font-semibold text-[#251605]">{RATE_HISTORY_EMPTY_COPY}</p>
      <p className="mt-1.5 text-xs text-[#756A5B]">{RATE_HISTORY_EMPTY_SECONDARY}</p>
    </div>
  );
}
