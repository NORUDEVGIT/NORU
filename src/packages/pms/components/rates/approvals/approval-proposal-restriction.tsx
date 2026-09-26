import type { RevenueApprovalDisplaySnapshot } from "@/packages/pms/lib/revenue/revenue-approval";
import { revenueApprovalScopeLabel } from "@/packages/pms/lib/revenue/revenue-approval-ui";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-[#251605]">{value}</span>
    </div>
  );
}

function fieldLabel(field: string) {
  if (field === "stopSell") return "Stop Sell";
  if (field === "closedToArrival") return "CTA";
  if (field === "closedToDeparture") return "CTD";
  if (field === "minStay") return "Min Stay";
  if (field === "maxStay") return "Max Stay";
  return field;
}

export function RestrictionApprovalProposal({
  proposal,
  snapshot,
}: {
  proposal: Record<string, unknown>;
  snapshot?: RevenueApprovalDisplaySnapshot | null;
}) {
  const operation = asRecord(proposal.operation);
  const targets = Array.isArray(proposal.targets) ? proposal.targets : [];
  const type = String(operation.type ?? "SET_FIELDS");
  const fields = asRecord(operation.fields);
  const changed = Object.keys(fields);

  return (
    <div className="space-y-1.5">
      <Row label="Operation" value={type === "CLEAR_ALL" ? "Clear restrictions" : "Set fields"} />
      <Row label="Date range" value={revenueApprovalScopeLabel(snapshot).split(" · ")[0] ?? "—"} />
      <Row label="Room types" value={snapshot?.roomTypeNames.join(", ") || "—"} />
      <Row label="Rate plans" value={snapshot?.ratePlanNames.join(", ") || "—"} />
      <Row label="Affected cells" value={String(snapshot?.targetCount ?? targets.length)} />
      {type === "CLEAR_ALL" ? (
        <Row label="Fields" value="All restriction fields cleared" />
      ) : (
        changed.map((field) => (
          <Row key={field} label={fieldLabel(field)} value={String(fields[field] ?? "—")} />
        ))
      )}
    </div>
  );
}
