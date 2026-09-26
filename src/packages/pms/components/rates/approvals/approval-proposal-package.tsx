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

export function PackageApprovalProposal({
  proposal,
  snapshot,
  reactivate,
}: {
  proposal: Record<string, unknown>;
  snapshot?: RevenueApprovalDisplaySnapshot | null;
  reactivate?: boolean;
}) {
  const operation = String(proposal.operation ?? snapshot?.operationLabel ?? "EDIT");
  const price = proposal.configuredPrice ?? proposal.price ?? proposal.packagePrice;
  const chargeBasis = proposal.chargeBasis ?? proposal.charge_basis;
  const components = Array.isArray(proposal.components) ? proposal.components : null;

  return (
    <div className="space-y-1.5">
      <Row label="Package" value={snapshot?.name || snapshot?.code || "Package"} />
      <Row
        label="Action"
        value={commercialProposalActionLabel({ operation, kind: "package", reactivate })}
      />
      <Row
        label="Stay dates"
        value={`${proposal.validFrom ?? snapshot?.dateFrom ?? "—"} – ${proposal.validTo ?? snapshot?.dateTo ?? "—"}`}
      />
      <Row
        label="Room scope"
        value={snapshot?.roomTypeNames.join(", ") || idsCount(proposal.roomTypeIds)}
      />
      <Row
        label="Rate-plan scope"
        value={snapshot?.ratePlanNames.join(", ") || idsCount(proposal.ratePlanIds)}
      />
      <Row
        label="Configured price"
        value={price == null ? "Stored on package master" : String(price)}
      />
      {chargeBasis != null ? <Row label="Charge basis" value={String(chargeBasis)} /> : null}
      {components ? (
        <Row
          label="Components"
          value={components
            .map((item) =>
              typeof item === "string"
                ? item
                : String((item as { name?: string }).name ?? "Component"),
            )
            .join(", ")}
        />
      ) : (
        <Row label="Components snapshot" value="Stored on package master" />
      )}
      {snapshot?.code ? <Row label="Code" value={snapshot.code} /> : null}
    </div>
  );
}
