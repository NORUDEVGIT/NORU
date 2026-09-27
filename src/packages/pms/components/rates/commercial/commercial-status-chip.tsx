import {
  commercialStatusLabel,
  type CommercialOperationalStatus,
} from "@/packages/pms/lib/revenue/commercial-overview";

export function CommercialStatusChip({
  status,
  overlap,
}: {
  status: CommercialOperationalStatus;
  overlap?: boolean;
}) {
  const tones: Record<CommercialOperationalStatus, string> = {
    active: "border-emerald-500/20 bg-emerald-500/10 text-emerald-800",
    upcoming: "border-[#C89933]/30 bg-[#F8F1E5] text-[#6B4A0A]",
    expired: "border-[#DED7CD] bg-[#F3ECE2] text-muted-foreground",
    inactive: "border-border bg-muted/40 text-muted-foreground",
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${tones[status]}`}
      >
        {commercialStatusLabel(status)}
      </span>
      {overlap ? (
        <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          Overlap
        </span>
      ) : null}
    </span>
  );
}
