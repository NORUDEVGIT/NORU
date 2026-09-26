import type { RevenueApprovalDisplaySnapshot } from "@/packages/pms/lib/revenue/revenue-approval";
import { commercialProposalActionLabel } from "@/packages/pms/lib/revenue/revenue-approval-ui";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-[#251605]">{value}</span>
    </div>
  );
}

function idsCount(value: unknown) {
  return Array.isArray(value) ? `${value.length} selected` : "Inherit / all";
}

export function PromotionApprovalProposal({
  proposal,
  snapshot,
  reactivate,
}: {
  proposal: Record<string, unknown>;
  snapshot?: RevenueApprovalDisplaySnapshot | null;
  reactivate?: boolean;
}) {
  const operation = String(proposal.operation ?? snapshot?.operationLabel ?? "EDIT");
  return (
    <div className="space-y-1.5">
      <Row label="Promotion" value={snapshot?.name || snapshot?.code || "Promotion"} />
      <Row
        label="Action"
        value={commercialProposalActionLabel({ operation, kind: "promotion", reactivate })}
      />
      <Row
        label="Stay dates"
        value={`${proposal.validFrom ?? snapshot?.dateFrom ?? "—"} – ${proposal.validTo ?? snapshot?.dateTo ?? "—"}`}
      />
      <Row
        label="Booking window"
        value={`${proposal.bookingFrom ?? "—"} – ${proposal.bookingTo ?? "—"}`}
      />
      <Row label="Priority" value={proposal.priority == null ? "—" : String(proposal.priority)} />
      <Row
        label="Room scope"
        value={snapshot?.roomTypeNames.join(", ") || idsCount(proposal.roomTypeIds)}
      />
      <Row
        label="Rate-plan scope"
        value={snapshot?.ratePlanNames.join(", ") || idsCount(proposal.ratePlanIds)}
      />
      {snapshot?.code ? <Row label="Code" value={snapshot.code} /> : null}
    </div>
  );
}
