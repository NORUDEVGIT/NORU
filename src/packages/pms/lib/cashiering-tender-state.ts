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

/** Positive outstanding balance is the default final-payment amount. */
export function settlementPaymentDefault(balance: number): number {
  return balance > 0.009 ? roundMoney(balance) : 0;
}

/** Why Close Folio is unavailable. Null means the ledger balance can close. */
export function settlementCloseBlock(balance: number): string | null {
  if (Math.abs(balance) < 0.01) return null;
  if (balance < -0.009) return "Credit balance must be resolved before closing.";
  return "Balance must be zero before closing.";
}

/** Write-off is a positive amount no greater than the current outstanding balance. */
export function writeOffAmountAllowed(balance: number, amount: number): boolean {
  if (!(balance > 0.009)) return false;
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return roundMoney(amount) <= roundMoney(balance) + 0.001;
}

export function summarizeFolioLedger(
  rows: Array<{ type: string; category: string; amount: number }>,
): {
  netCharges: number;
  tax: number;
  serviceCharge: number;
  payments: number;
  deposits: number;
  adjustments: number;
  discounts: number;
  refunds: number;
  transfersIn: number;
  transfersOut: number;
  currentBalance: number;
} {
  let netCharges = 0;
  let tax = 0;
  let serviceCharge = 0;
  let payments = 0;
  let deposits = 0;
  let adjustments = 0;
  let discounts = 0;
  let refunds = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  let currentBalance = 0;

  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    currentBalance += amount;
    if (row.type === "charge" && row.category === "tax") tax += amount;
    else if (row.type === "charge" && row.category === "service_charge") serviceCharge += amount;
    else if (row.type === "charge") netCharges += amount;
    else if (row.type === "payment") payments += Math.abs(amount);
    else if (row.type === "deposit") deposits += Math.abs(amount);
    else if (row.type === "adjustment") adjustments += amount;
    else if (row.type === "discount") discounts += Math.abs(amount);
    else if (row.type === "refund") refunds += amount;
    else if (row.type === "transfer_in") transfersIn += amount;
    else if (row.type === "transfer_out") transfersOut += Math.abs(amount);
  }

  return {
    netCharges: roundMoney(netCharges),
    tax: roundMoney(tax),
    serviceCharge: roundMoney(serviceCharge),
    payments: roundMoney(payments),
    deposits: roundMoney(deposits),
    adjustments: roundMoney(adjustments),
    discounts: roundMoney(discounts),
    refunds: roundMoney(refunds),
    transfersIn: roundMoney(transfersIn),
    transfersOut: roundMoney(transfersOut),
    currentBalance: roundMoney(currentBalance),
  };
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
