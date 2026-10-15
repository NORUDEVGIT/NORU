import type { FiscalSettlementSummary } from "../../lib/fiscal/fiscal-document-mode.ts";

function etb(amount: number): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return `ETB ${text}`;
}

export function FiscalSettlementSummaryCard({
  settlement,
}: {
  settlement: FiscalSettlementSummary;
}) {
  return (
    <div
      className="mt-3 space-y-1 rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3 text-sm text-[#251605]"
      data-testid="fiscal-settlement"
    >
      <p className="font-medium">Fiscal Settlement</p>
      <p>Mode: {settlement.mode}</p>
      <p>Eligible payments: {etb(settlement.eligiblePayments)}</p>
      <p>Invoice total: {etb(settlement.invoiceTotal)}</p>
      {settlement.mode === "CREDIT" ? (
        <p>Unpaid by eligible payments: {etb(settlement.unpaid)}</p>
      ) : null}
      <p>{settlement.reason}</p>
    </div>
  );
}
