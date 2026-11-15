import { TriangleAlert } from "lucide-react";

import { NoruStatusChip } from "@/packages/pms/components/settings/pms-card6-integration-bits";
import type {
  DistributionActivationStatus,
  DistributionMappingStatus,
  DistributionSyncStatus,
} from "@/packages/pms/lib/distribution-card6.server";

export function DistributionStatusBadge({ status }: { status: DistributionMappingStatus }) {
  return (
    <NoruStatusChip
      tone={status === "attention" ? "error" : status === "disabled" ? "disabled" : "pending"}
    />
  );
}

export function DistributionActivationBadge({ status }: { status: DistributionActivationStatus }) {
  return <NoruStatusChip tone={status === "active" ? "connected" : "disabled"} />;
}

export function DistributionSyncStatusBadge({ status }: { status: DistributionSyncStatus }) {
  return <NoruStatusChip tone={status === "disabled" ? "disabled" : "pending"} />;
}

export function MappingPairStatus({ mapped }: { mapped: boolean }) {
  return <NoruStatusChip tone={mapped ? "mapped" : "not_mapped"} />;
}

export function MappingAttentionStatus({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#7A5511]">
      <TriangleAlert className="size-3" aria-hidden /> {label}
    </span>
  );
}
