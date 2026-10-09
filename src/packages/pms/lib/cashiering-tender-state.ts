export type TenderDisplayState =
  | "Posted"
  | "Partially refunded"
  | "Refunded"
  | "Unapplied"
  | "Partially applied"
  | "Fully applied";

export type TenderTypeFilter = "all" | "payment" | "deposit" | "refund";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Balance after a positive payment or deposit. The ledger stores that amount as a credit. */
export function projectedFolioBalance(currentBalance: number, enteredAmount: number): number {
  const entered = Number.isFinite(enteredAmount) ? enteredAmount : 0;
  return roundMoney(currentBalance - entered);
}

export function refundedAgainst(
  sourceId: string,
  rows: Array<{ type: string; amount: number; originalTransactionId: string | null }>,
): number {
  return roundMoney(
    rows
      .filter((line) => line.type === "refund" && line.originalTransactionId === sourceId)
      .reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );
}

export function tenderDisplayState(
  row: { id: string; type: string; amount: number },
  rows: Array<{ type: string; amount: number; originalTransactionId: string | null }>,
  deposit?: { received: number; applied: number; available: number } | null,
): TenderDisplayState | null {
  if (row.type !== "payment" && row.type !== "deposit") return null;
  const received = roundMoney(Math.abs(Number(row.amount) || 0));
  const refunded = refundedAgainst(row.id, rows);
  if (refunded > 0.009 && roundMoney(received - refunded) <= 0.009) return "Refunded";
  if (row.type === "payment") {
    return refunded > 0.009 ? "Partially refunded" : "Posted";
  }
  const applied = roundMoney(deposit?.applied ?? 0);
  const available = roundMoney(deposit?.available ?? received - refunded);
  if (refunded > 0.009 && applied <= 0.009) return "Partially refunded";
  if (applied <= 0.009 && available > 0.009) return "Unapplied";
  if (available > 0.009) return "Partially applied";
  return "Fully applied";
}

export function filterTenderRows<
  T extends {
    type: string;
    description: string;
    paymentMethod: string | null;
    postedBy: string | null;
    postedAt: string;
  },
>(rows: T[], input: { search: string; type: TenderTypeFilter; from: string; to: string }): T[] {
  const term = input.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (row.type !== "payment" && row.type !== "deposit" && row.type !== "refund") return false;
    if (input.type !== "all" && row.type !== input.type) return false;
    const day = row.postedAt.slice(0, 10);
    if (input.from && day < input.from) return false;
    if (input.to && day > input.to) return false;
    if (!term) return true;
    const haystack = [row.description, row.paymentMethod ?? "", row.postedBy ?? ""]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}
