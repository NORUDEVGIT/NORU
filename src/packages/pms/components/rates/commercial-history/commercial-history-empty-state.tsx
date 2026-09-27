import {
  COMMERCIAL_HISTORY_EMPTY_COPY,
  COMMERCIAL_HISTORY_IMMUTABLE_COPY,
} from "@/packages/pms/lib/revenue/commercial-history";

export function CommercialHistoryEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[#E8E1D7] bg-[#F7F4EE] px-4 py-8 text-center">
      <p className="text-sm font-medium text-[#251605]">{COMMERCIAL_HISTORY_EMPTY_COPY}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{COMMERCIAL_HISTORY_IMMUTABLE_COPY}</p>
    </div>
  );
}
