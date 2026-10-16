import { revenueApprovalStatusLabel } from "@/packages/pms/lib/revenue/revenue-approval-ui";
import type { RevenueApprovalStatus } from "@/packages/pms/lib/revenue/revenue-approval";

const TONE: Record<RevenueApprovalStatus, string> = {
  pending: "bg-amber-50 text-amber-800 border border-amber-200/80",
  approved: "bg-emerald-50 text-emerald-800 border border-emerald-200/80",
  rejected: "bg-rose-50 text-rose-800 border border-rose-200/80",
  cancelled: "bg-[#F0EBE1] text-[#736B5E] border border-[#DDD4C5]",
  stale: "bg-orange-50 text-orange-800 border border-orange-200/80",
};

export function ApprovalStatusChip({ status }: { status: RevenueApprovalStatus | string }) {
  const tone = TONE[status as RevenueApprovalStatus] ?? "bg-[#F0EBE1] text-[#736B5E] border border-[#DDD4C5]";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${tone}`}>
      {revenueApprovalStatusLabel(status)}
    </span>
  );
}
