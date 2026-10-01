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
    active: "border-emerald-300 bg-emerald-50 text-emerald-800",
    upcoming: "border-amber-300 bg-amber-50 text-amber-900",
    expired: "border-[#DED7CD] bg-[#F3ECE2] text-[#5A4833]",
    inactive: "border-[#DED7CD] bg-[#F7F4EE] text-[#756A5B]",
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[status]}`}
      >
        {commercialStatusLabel(status)}
      </span>
      {overlap ? (
        <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
          Overlap
        </span>
      ) : null}
    </span>
  );
}
