import { commercialProposalActionLabel } from "@/packages/pms/lib/revenue/revenue-approval-ui";
import type { RevenueApprovalDisplaySnapshot } from "@/packages/pms/lib/revenue/revenue-approval";

function list(value: unknown): string {
  return Array.isArray(value) && value.length > 0 ? `${value.length} selected` : "All / inherit";
}

export function ApprovalProposalCommercial({
  kind,
  proposal,
  snapshot,
}: {
  kind: "promotion" | "package";
  proposal: Record<string, unknown>;
  snapshot?: RevenueApprovalDisplaySnapshot | null;
}) {
  const operation = String(proposal.operation ?? snapshot?.operationLabel ?? "EDIT");
  const reactivate = proposal.reactivate === true;
  return (
    <div className="space-y-1 text-[11px] text-[#251605]">
      <p className="font-medium">
        {commercialProposalActionLabel({ operation, kind, reactivate })}
      </p>
      <p>{snapshot?.name || snapshot?.code || (kind === "package" ? "Package" : "Promotion")}</p>
      {snapshot?.code ? <p className="text-muted-foreground">{snapshot.code}</p> : null}
      <p>
        Stay: {String(proposal.validFrom ?? snapshot?.dateFrom ?? "—")} –{" "}
        {String(proposal.validTo ?? snapshot?.dateTo ?? "—")}
      </p>
      {kind === "promotion" ? (
        <p>
          Booking: {String(proposal.bookingFrom ?? "—")} – {String(proposal.bookingTo ?? "—")}
        </p>
      ) : null}
      {proposal.priority != null ? <p>Priority: {String(proposal.priority)}</p> : null}
      <p>Room types: {list(proposal.roomTypeIds)}</p>
      <p>Rate plans: {list(proposal.ratePlanIds)}</p>
    </div>
  );
}
