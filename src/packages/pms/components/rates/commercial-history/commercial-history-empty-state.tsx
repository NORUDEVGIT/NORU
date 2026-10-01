import {
  COMMERCIAL_HISTORY_EMPTY_COPY,
  COMMERCIAL_HISTORY_IMMUTABLE_COPY,
} from "@/packages/pms/lib/revenue/commercial-history";

export function CommercialHistoryEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-[#FAF6F0] px-4 py-8 text-center">
      <p className="text-sm font-semibold text-[#251605]">{COMMERCIAL_HISTORY_EMPTY_COPY}</p>
      <p className="mt-1 text-xs text-[#756A5B]">{COMMERCIAL_HISTORY_IMMUTABLE_COPY}</p>
    </div>
  );
}
