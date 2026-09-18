import { Circle, TriangleAlert } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import type { DistributionMappingStatus } from "@/packages/pms/lib/distribution-card6.server";
import { distributionMappingStatusLabel } from "@/packages/pms/lib/distribution-card6.server";

const CHANNEL_STYLES: Record<DistributionMappingStatus, string> = {
  pending: "border-[#C89933]/50 bg-[#C89933]/10 text-[#7A5511]",
  attention: "border-destructive/40 bg-destructive/10 text-destructive",
  disabled: "border-[#CCCCCC] bg-muted/40 text-muted-foreground",
};

export function DistributionStatusBadge({ status }: { status: DistributionMappingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        CHANNEL_STYLES[status],
      )}
    >
      {distributionMappingStatusLabel(status)}
    </span>
  );
}

export function MappingPairStatus({ mapped }: { mapped: boolean }) {
  if (mapped) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#436436]">
        <span aria-hidden>✓</span> Mapped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Circle className="size-2.5" aria-hidden /> Not Mapped
    </span>
  );
}

export function MappingAttentionStatus({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#7A5511]">
      <TriangleAlert className="size-3" aria-hidden /> {label}
    </span>
  );
}
