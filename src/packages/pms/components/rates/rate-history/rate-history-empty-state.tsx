import { RATE_HISTORY_EMPTY_COPY, RATE_HISTORY_EMPTY_SECONDARY } from "@/packages/pms/lib/revenue/rate-history";

export function RateHistoryEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[#E8E1D7] bg-[#F7F4EE] px-4 py-8 text-center">
      <p className="text-sm font-medium text-[#251605]">{RATE_HISTORY_EMPTY_COPY}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{RATE_HISTORY_EMPTY_SECONDARY}</p>
    </div>
  );
}
