import { CommercialStatusChip } from "../commercial/commercial-status-chip";
import { packageStatusLabel, type PackageDisplayStatus } from "@/packages/pms/lib/revenue/commercial-packages-ui";

export function PackageStatusChip({ status }: { status: PackageDisplayStatus }) {
  if (status === "not_activated") {
    return (
      <span className="inline-flex rounded-full border border-[#DED7CD] bg-white px-2 py-0.5 text-[10px] font-medium text-[#6B4A0A]">
        {packageStatusLabel(status)}
      </span>
    );
  }
  return <CommercialStatusChip status={status} />;
}
