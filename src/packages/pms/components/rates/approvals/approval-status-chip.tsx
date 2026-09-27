import { revenueApprovalStatusLabel } from "@/packages/pms/lib/revenue/revenue-approval-ui";
import type { RevenueApprovalStatus } from "@/packages/pms/lib/revenue/revenue-approval";

const TONE: Record<RevenueApprovalStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-[#E8E1D7] text-[#5C5146]",
  stale: "bg-orange-100 text-orange-900",
};

export function ApprovalStatusChip({ status }: { status: RevenueApprovalStatus | string }) {
  const tone = TONE[status as RevenueApprovalStatus] ?? "bg-[#E8E1D7] text-[#5C5146]";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${tone}`}>
      {revenueApprovalStatusLabel(status)}
    </span>
  );
}
