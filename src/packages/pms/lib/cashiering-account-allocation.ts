/**
 * Company and group payment allocation.
 *
 * An allocation classifies an existing account payment against an issued
 * financial-account invoice. It is not ledger movement: it does not change
 * the account balance, statement, source-folio ownership, charges, invoice
 * coverage, or cashier shift.
 */

export const ALLOCATION_TOLERANCE = 0.01;

export const SETTLEMENT_STATES = ["NO_AMOUNT_DUE", "UNPAID", "PARTIALLY_PAID", "PAID"] as const;

export type SettlementState = (typeof SETTLEMENT_STATES)[number];

export type AllocationRejection = {
  ok: false;
  code: string;
};

const ALLOCATE_ROLES = ["owner", "manager", "accountant"] as const;
const VIEW_ROLES = ["owner", "manager", "cashier", "accountant"] as const;

export function roundAllocationMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Stored payment lines are negative. Face value is the positive amount received. */
export function paymentFace(ledgerAmount: number): number {
  return roundAllocationMoney(-ledgerAmount);
}

export function paymentAvailable(face: number, refunded: number, allocatedNet: number): number {
  return roundAllocationMoney(face - refunded - allocatedNet);
}

export function invoiceOriginalAmount(
  snapshot: {
    totals?: { invoiceTotal?: number | null; balance?: number | null } | null;
  } | null,
): number {
  const totals = snapshot?.totals;
  const raw = totals?.invoiceTotal ?? totals?.balance ?? 0;
  return roundAllocationMoney(Number(raw) || 0);
}

/** Credit-note headers are negative. Debit-note headers are positive. Count each header once. */
export function invoiceEffectiveNet(invoiceTotal: number, noteDeltas: readonly number[]): number {
  const notes = noteDeltas.reduce((sum, delta) => sum + delta, 0);
  return roundAllocationMoney(invoiceTotal + notes);
}

export function invoiceOutstanding(effectiveNet: number, allocatedNet: number): number {
  return roundAllocationMoney(effectiveNet - allocatedNet);
}

/** Display-only. Financial checks use the unclamped outstanding amount. */
export function displayOutstanding(outstanding: number): number {
  const rounded = roundAllocationMoney(outstanding);
  return Math.abs(rounded) <= ALLOCATION_TOLERANCE ? 0 : rounded;
}

export function settlementState(effectiveNet: number, allocatedNet: number): SettlementState {
  const net = roundAllocationMoney(effectiveNet);
  const allocated = roundAllocationMoney(allocatedNet);
  const outstanding = invoiceOutstanding(net, allocated);
  if (net <= ALLOCATION_TOLERANCE) return "NO_AMOUNT_DUE";
  if (allocated <= ALLOCATION_TOLERANCE) return "UNPAID";
  if (outstanding > ALLOCATION_TOLERANCE) return "PARTIALLY_PAID";
  return "PAID";
}

export function settlementStateLabel(state: SettlementState): string {
  if (state === "NO_AMOUNT_DUE") return "No Amount Due";
  if (state === "PARTIALLY_PAID") return "Partially Paid";
  if (state === "PAID") return "Paid";
  return "Unpaid";
}

export function allocationCapabilities(input: { role: string; status: "open" | "closed" }): {
  canView: boolean;
  canAllocate: boolean;
  canReverse: boolean;
} {
  const view = (VIEW_ROLES as readonly string[]).includes(input.role);
  const allocate = (ALLOCATE_ROLES as readonly string[]).includes(input.role);
  const open = input.status === "open";
  return {
    canView: view,
    canAllocate: view && allocate && open,
    canReverse: view && allocate && open,
  };
}

export function noteTotals(deltas: readonly { noteType: string; totalDelta: number }[]): {
  creditNoteTotal: number;
  debitNoteTotal: number;
} {
  let creditNoteTotal = 0;
  let debitNoteTotal = 0;
  for (const note of deltas) {
    if (note.noteType === "debit") debitNoteTotal += note.totalDelta;
    else creditNoteTotal += note.totalDelta;
  }
  return {
    creditNoteTotal: roundAllocationMoney(creditNoteTotal),
    debitNoteTotal: roundAllocationMoney(debitNoteTotal),
  };
}

export function summarizeInvoiceSettlement(input: {
  invoiceTotal: number;
  noteDeltas: readonly number[];
  allocatedNet: number;
}): {
  originalAmount: number;
  effectiveNet: number;
  allocated: number;
  outstanding: number;
  settlementState: SettlementState;
} {
  const originalAmount = roundAllocationMoney(input.invoiceTotal);
  const effectiveNet = invoiceEffectiveNet(originalAmount, input.noteDeltas);
  const allocated = roundAllocationMoney(input.allocatedNet);
  return {
    originalAmount,
    effectiveNet,
    allocated,
    outstanding: invoiceOutstanding(effectiveNet, allocated),
    settlementState: settlementState(effectiveNet, allocated),
  };
}

/**
 * Credit note guard. Projected effective net is the snapshot total plus existing
 * note headers minus this credit. Reject when that would fall below active allocations.
 */
export function creditNoteAllocationGuard(input: {
  invoiceTotal: number;
  existingNoteDeltas: readonly number[];
  creditAmount: number;
  allocatedNet: number;
}):
  | { ok: true; projectedNet: number }
  | {
      ok: false;
      code: "ALLOCATION_EXCEEDS_INVOICE_NET";
      projectedNet: number;
      allocated: number;
      release: number;
    } {
  const projectedNet = invoiceEffectiveNet(input.invoiceTotal, [
    ...input.existingNoteDeltas,
    -roundAllocationMoney(input.creditAmount),
  ]);
  const allocated = roundAllocationMoney(input.allocatedNet);
  if (projectedNet < allocated - ALLOCATION_TOLERANCE) {
    return {
      ok: false,
      code: "ALLOCATION_EXCEEDS_INVOICE_NET",
      projectedNet,
      allocated,
      release: roundAllocationMoney(allocated - projectedNet),
    };
  }
  return { ok: true, projectedNet };
}

export type AllocationTargetCheck = {
  invoiceAccountId: string;
  paymentAccountId: string;
  paymentType: string;
  paymentLedgerAmount: number;
  invoiceIssued: boolean;
  paymentCurrency: string;
  invoiceCurrency: string;
  accountStatus: "open" | "closed";
  face: number;
  refunded: number;
  paymentAllocated: number;
  invoiceEffectiveNet: number;
  invoiceAllocated: number;
  amount: number;
};

/** Domain rules the apply RPC enforces. Account balance is not an input. */
export function reviewAllocationTarget(
  input: AllocationTargetCheck,
): { ok: true; available: number; outstanding: number } | AllocationRejection {
  if (input.accountStatus !== "open") return { ok: false, code: "ACCOUNT_CLOSED" };
  if (input.paymentType !== "payment" || input.paymentLedgerAmount >= 0) {
    return { ok: false, code: "ALLOCATION_NOT_A_PAYMENT" };
  }
  if (input.paymentAccountId !== input.invoiceAccountId) {
    return { ok: false, code: "ALLOCATION_ACCOUNT_MISMATCH" };
  }
  if (!input.invoiceIssued) return { ok: false, code: "ALLOCATION_NOT_ISSUED" };
  if (input.paymentCurrency !== input.invoiceCurrency) {
    return { ok: false, code: "ALLOCATION_CURRENCY_MISMATCH" };
  }
  if (!(input.amount > 0)) return { ok: false, code: "ALLOCATION_AMOUNT_INVALID" };
  const available = paymentAvailable(input.face, input.refunded, input.paymentAllocated);
  const outstanding = invoiceOutstanding(input.invoiceEffectiveNet, input.invoiceAllocated);
  if (roundAllocationMoney(input.amount) > available + ALLOCATION_TOLERANCE) {
    return { ok: false, code: "ALLOCATION_EXCEEDS_PAYMENT" };
  }
  if (roundAllocationMoney(input.amount) > outstanding + ALLOCATION_TOLERANCE) {
    return { ok: false, code: "ALLOCATION_EXCEEDS_INVOICE" };
  }
  return { ok: true, available, outstanding };
}

export function refundWithinAvailable(input: {
  face: number;
  refunded: number;
  allocatedNet: number;
  refundAmount: number;
}): boolean {
  const available = paymentAvailable(input.face, input.refunded, input.allocatedNet);
  return roundAllocationMoney(input.refundAmount) <= available + 0.001;
}

export function reversalAmount(
  originalAmount: number,
  existingReversals: readonly number[],
): number {
  const net = roundAllocationMoney(
    originalAmount + existingReversals.reduce((sum, amount) => sum + amount, 0),
  );
  return net;
}

export function stalePreview(expected: number, current: number): boolean {
  return (
    Math.abs(roundAllocationMoney(expected) - roundAllocationMoney(current)) > ALLOCATION_TOLERANCE
  );
}
