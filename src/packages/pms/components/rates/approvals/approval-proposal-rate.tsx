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

export function RateApprovalProposal({
  proposal,
  snapshot,
}: {
  proposal: Record<string, unknown>;
  snapshot?: RevenueApprovalDisplaySnapshot | null;
}) {
  const rule = asRecord(proposal.rule);
  const targets = Array.isArray(proposal.targets) ? proposal.targets : [];
  const type = String(rule.type ?? snapshot?.operationLabel ?? "SET_RATE");
  const value = rule.value;
  const sourceDate = typeof rule.sourceDate === "string" ? rule.sourceDate : null;

  let change = type;
  if (type === "SET_RATE") change = `Set rate${value == null ? "" : ` to ${String(value)}`}`;
  else if (type === "PERCENT_INCREASE")
    change = `Increase ${value == null ? "" : `${String(value)}%`}`.trim();
  else if (type === "PERCENT_DECREASE")
    change = `Decrease ${value == null ? "" : `${String(value)}%`}`.trim();
  else if (type === "RESET_OVERRIDE") change = "Reset override";
  else if (type === "COPY_FROM_DATE") change = `Copy from ${sourceDate ?? "source date"}`;

  return (
    <div className="space-y-1.5">
      <Row label="Operation" value={type} />
      <Row label="Date range" value={revenueApprovalScopeLabel(snapshot).split(" · ")[0] ?? "—"} />
      <Row label="Room types" value={snapshot?.roomTypeNames.join(", ") || "—"} />
      <Row label="Rate plans" value={snapshot?.ratePlanNames.join(", ") || "—"} />
      <Row label="Affected cells" value={String(snapshot?.targetCount ?? targets.length)} />
      <Row label="Change" value={change} />
      {type === "SET_RATE" && value != null ? <Row label="Amount" value={String(value)} /> : null}
      {(type === "PERCENT_INCREASE" || type === "PERCENT_DECREASE") && value != null ? (
        <Row label="Percent" value={`${String(value)}%`} />
      ) : null}
      {type === "COPY_FROM_DATE" ? <Row label="Source date" value={sourceDate ?? "—"} /> : null}
    </div>
  );
}
