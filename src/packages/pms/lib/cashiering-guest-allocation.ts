/**
 * Guest payment allocation.
 *
 * Classifies a posted guest payment against an issued charge-group invoice.
 * It does not move the folio ledger, change a receipt, or attribute a deposit.
 */

export const GUEST_ALLOCATION_TOLERANCE = 0.01;

export const GUEST_SETTLEMENT_STATES = [
  "NO_AMOUNT_DUE",
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
] as const;

export type GuestSettlementState = (typeof GUEST_SETTLEMENT_STATES)[number];

const ALLOCATE_ROLES = ["owner", "manager", "accountant"] as const;
const VIEW_ROLES = ["owner", "manager", "cashier", "accountant"] as const;
const OPERATE_ROLES = ["owner", "manager", "cashier"] as const;
const MANAGE_ROLES = ["owner", "manager"] as const;

export function roundGuestMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function guestPaymentFace(ledgerAmount: number): number {
  return roundGuestMoney(-ledgerAmount);
}

export function guestPaymentAvailable(
  face: number,
  refunded: number,
  allocatedNet: number,
): number {
  return roundGuestMoney(face - refunded - allocatedNet);
}

/** Charge-group invoices use invoiceTotal only. Legacy balance is not a settlement base. */
export function guestInvoiceOriginalAmount(
  snapshot: {
    totals?: { invoiceTotal?: number | null } | null;
  } | null,
): number | null {
  const raw = snapshot?.totals?.invoiceTotal;
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  return roundGuestMoney(Number(raw));
}

export function guestInvoiceEffectiveNet(
  invoiceTotal: number,
  noteDeltas: readonly number[],
): number {
  const notes = noteDeltas.reduce((sum, delta) => sum + delta, 0);
  return roundGuestMoney(invoiceTotal + notes);
}

export function guestInvoiceOutstanding(effectiveNet: number, allocatedNet: number): number {
  return roundGuestMoney(effectiveNet - allocatedNet);
}

export function guestSettlementState(
  effectiveNet: number,
  allocatedNet: number,
): GuestSettlementState {
  const net = roundGuestMoney(effectiveNet);
  const allocated = roundGuestMoney(allocatedNet);
  const outstanding = guestInvoiceOutstanding(net, allocated);
  if (net <= GUEST_ALLOCATION_TOLERANCE) return "NO_AMOUNT_DUE";
  if (allocated <= GUEST_ALLOCATION_TOLERANCE) return "UNPAID";
  if (outstanding > GUEST_ALLOCATION_TOLERANCE) return "PARTIALLY_PAID";
  return "PAID";
}

export function guestSettlementLabel(state: GuestSettlementState): string {
  if (state === "NO_AMOUNT_DUE") return "No Amount Due";
  if (state === "PARTIALLY_PAID") return "Partially Paid";
  if (state === "PAID") return "Paid";
  return "Unpaid";
}

export function guestAllocationCapabilities(input: {
  role: string;
  folioStatus: "open" | "closed";
}): {
  canView: boolean;
  canAllocate: boolean;
  canReverse: boolean;
  canPostPayment: boolean;
  canRefund: boolean;
} {
  const view = (VIEW_ROLES as readonly string[]).includes(input.role);
  const allocate = (ALLOCATE_ROLES as readonly string[]).includes(input.role);
  const open = input.folioStatus === "open";
  return {
    canView: view,
    canAllocate: view && allocate && open,
    canReverse: view && allocate && open,
    canPostPayment: (OPERATE_ROLES as readonly string[]).includes(input.role),
    canRefund: (MANAGE_ROLES as readonly string[]).includes(input.role),
  };
}

export function guestPaymentRefundable(input: {
  sourceType: string;
  faceMinusRefunds: number;
  allocatedNet: number;
}): number | null {
  if (input.sourceType !== "payment" && input.sourceType !== "deposit") return null;
  if (input.sourceType === "deposit") return roundGuestMoney(input.faceMinusRefunds);
  return roundGuestMoney(input.faceMinusRefunds - input.allocatedNet);
}

export type GuestAllocationCheck = {
  folioStatus: "open" | "closed";
  paymentType: string;
  paymentLedgerAmount: number;
  paymentFolioId: string;
  invoiceFolioId: string;
  coverageScope: string;
  invoiceIssued: boolean;
  hasInvoiceTotal: boolean;
  folioCurrency: string;
  invoiceCurrency: string;
  face: number;
  refunded: number;
  paymentAllocated: number;
  invoiceEffectiveNet: number;
  invoiceAllocated: number;
  amount: number;
};

export function reviewGuestAllocation(
  input: GuestAllocationCheck,
): { ok: true; available: number; outstanding: number } | { ok: false; code: string } {
  if (input.folioStatus !== "open") return { ok: false, code: "FOLIO_CLOSED" };
  if (input.paymentType !== "payment" || input.paymentLedgerAmount >= 0) {
    return { ok: false, code: "ALLOCATION_NOT_A_GUEST_PAYMENT" };
  }
  if (input.paymentFolioId !== input.invoiceFolioId) {
    return { ok: false, code: "ALLOCATION_FOLIO_MISMATCH" };
  }
  if (input.coverageScope === "legacy_folio") {
    return { ok: false, code: "LEGACY_INVOICE_ALLOCATION_UNSUPPORTED" };
  }
  if (input.coverageScope !== "charge_groups" || !input.invoiceIssued || !input.hasInvoiceTotal) {
    return { ok: false, code: "ALLOCATION_NOT_ISSUED" };
  }
  if (input.folioCurrency !== input.invoiceCurrency) {
    return { ok: false, code: "ALLOCATION_CURRENCY_MISMATCH" };
  }
  const available = guestPaymentAvailable(input.face, input.refunded, input.paymentAllocated);
  const outstanding = guestInvoiceOutstanding(input.invoiceEffectiveNet, input.invoiceAllocated);
  if (input.amount > available + GUEST_ALLOCATION_TOLERANCE) {
    return { ok: false, code: "ALLOCATION_EXCEEDS_PAYMENT" };
  }
  if (input.amount > outstanding + GUEST_ALLOCATION_TOLERANCE) {
    return { ok: false, code: "ALLOCATION_EXCEEDS_INVOICE" };
  }
  return { ok: true, available, outstanding };
}

export function guestCreditNoteGuard(input: {
  invoiceTotal: number;
  existingNoteDeltas: readonly number[];
  creditAmount: number;
  allocatedNet: number;
}):
  | { ok: true; projectedNet: number }
  | { ok: false; code: "ALLOCATION_EXCEEDS_INVOICE_NET"; projectedNet: number; release: number } {
  const projectedNet = guestInvoiceEffectiveNet(input.invoiceTotal, [
    ...input.existingNoteDeltas,
    -roundGuestMoney(input.creditAmount),
  ]);
  const allocated = roundGuestMoney(input.allocatedNet);
  if (projectedNet < allocated - GUEST_ALLOCATION_TOLERANCE) {
    return {
      ok: false,
      code: "ALLOCATION_EXCEEDS_INVOICE_NET",
      projectedNet,
      release: roundGuestMoney(allocated - projectedNet),
    };
  }
  return { ok: true, projectedNet };
}

export function folioSettledWithUnallocatedInvoices(
  balance: number,
  outstanding: readonly number[],
): boolean {
  if (Math.abs(roundGuestMoney(balance)) >= GUEST_ALLOCATION_TOLERANCE) return false;
  return outstanding.some((value) => roundGuestMoney(value) > GUEST_ALLOCATION_TOLERANCE);
}

export const FOLIO_INVOICE_ALLOCATION_WARNING =
  "Folio balance is settled, but one or more issued invoices still have unallocated payment amounts.";
