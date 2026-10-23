/**
 * Night Audit settlement findings.
 *
 * Uses Cashiering's issued-invoice classifier. It does not post, allocate, or close a folio.
 * An open in-house balance is not an integrity blocker. A folio/invoice contradiction is.
 */
import {
  classifyIssuedGuestInvoice,
  folioSettledWithUnallocatedInvoices,
  GUEST_ALLOCATION_TOLERANCE,
  guestPaymentAvailable,
  guestPaymentFace,
  roundGuestMoney,
} from "./cashiering-guest-allocation.ts";

export type SettlementException = {
  exceptionType: string;
  severity: "warning" | "blocking";
  referenceType: string | null;
  referenceId: string | null;
  message: string;
};

export const SETTLEMENT_BLOCKER_TYPES = [
  "folio_invoice_contradiction",
  "allocation_exceeds_source",
  "orphan_allocation",
] as const;

export type SettlementInvoiceFact = {
  id: string;
  folioId: string;
  number: string;
  eligible: boolean;
  invoiceTotal: number | null;
  noteDeltas: readonly number[];
  paymentAllocated: number;
  depositApplied: number;
  cashDebitCovered: number;
};

export type SettlementPaymentFact = {
  id: string;
  face: number;
  refunded: number;
  allocated: number;
};

export type SettlementAllocationFact = {
  id: string;
  invoiceId: string;
  amount: number;
};

export function settlementIntegrityExceptions(input: {
  folios: readonly { id: string; number: string; balance: number }[];
  invoices: readonly SettlementInvoiceFact[];
  payments: readonly SettlementPaymentFact[];
  allocations: readonly SettlementAllocationFact[];
}): SettlementException[] {
  const exceptions: SettlementException[] = [];
  const invoiceIds = new Set(input.invoices.map((invoice) => invoice.id));
  const classified = input.invoices.map((invoice) => ({
    invoice,
    result: classifyIssuedGuestInvoice({
      eligible: invoice.eligible,
      invoiceTotal: invoice.invoiceTotal,
      noteDeltas: invoice.noteDeltas,
      paymentAllocated: invoice.paymentAllocated,
      depositApplied: invoice.depositApplied,
      cashDebitCovered: invoice.cashDebitCovered,
    }),
  }));

  for (const folio of input.folios) {
    const outstanding = classified
      .filter((row) => row.invoice.folioId === folio.id && row.result.outstanding != null)
      .map((row) => row.result.outstanding ?? 0);
    if (folioSettledWithUnallocatedInvoices(folio.balance, outstanding)) {
      exceptions.push({
        exceptionType: "folio_invoice_contradiction",
        severity: "blocking",
        referenceType: "folio",
        referenceId: folio.id,
        message: `Folio ${folio.number} is settled on the ledger, but an issued invoice still has an outstanding balance.`,
      });
    }
  }

  for (const payment of input.payments) {
    const available = guestPaymentAvailable(payment.face, payment.refunded, payment.allocated);
    if (available < -GUEST_ALLOCATION_TOLERANCE) {
      exceptions.push({
        exceptionType: "allocation_exceeds_source",
        severity: "blocking",
        referenceType: "folio_transaction",
        referenceId: payment.id,
        message: `A payment or deposit is allocated ${roundGuestMoney(payment.allocated).toFixed(2)} beyond the amount still available.`,
      });
    }
  }

  for (const allocation of input.allocations) {
    if (!invoiceIds.has(allocation.invoiceId)) {
      exceptions.push({
        exceptionType: "orphan_allocation",
        severity: "blocking",
        referenceType: "allocation",
        referenceId: allocation.id,
        message: "An allocation points at an invoice that is not on this property.",
      });
    }
  }

  return exceptions;
}

export function paymentFace(ledgerAmount: number): number {
  return guestPaymentFace(ledgerAmount);
}

/**
 * Folio ledger findings. An open balance is a warning. A closed non-zero balance,
 * a posting after close, and a duplicate room charge are blockers.
 * Invoice settlement is a separate check and is not recalculated here.
 */
export function folioLedgerExceptions(input: {
  folios: readonly {
    id: string;
    number: string;
    status: string;
    closedAt: string | null;
  }[];
  transactions: readonly {
    folioId: string;
    amount: number;
    postedAt: string;
    referenceType: string | null;
    referenceId: string | null;
  }[];
  missingFolios: readonly { id: string; confirmationNumber: string; status: string }[];
}): { exceptions: SettlementException[]; balances: Map<string, number> } {
  const balances = new Map<string, number>();
  const roomChargeCount = new Map<string, number>();
  for (const txn of input.transactions) {
    balances.set(txn.folioId, roundGuestMoney((balances.get(txn.folioId) ?? 0) + txn.amount));
    if (txn.referenceType === "reservation_room_charge" && txn.referenceId) {
      roomChargeCount.set(txn.referenceId, (roomChargeCount.get(txn.referenceId) ?? 0) + 1);
    }
  }

  const exceptions: SettlementException[] = [];
  for (const folio of input.folios) {
    const balance = balances.get(folio.id) ?? 0;
    if (folio.status === "closed" && Math.abs(balance) >= GUEST_ALLOCATION_TOLERANCE) {
      exceptions.push({
        exceptionType: "closed_folio_nonzero_balance",
        severity: "blocking",
        referenceType: "folio",
        referenceId: folio.id,
        message: `Folio ${folio.number} is closed with a balance of ${balance.toFixed(2)}.`,
      });
    }
    if (folio.status === "closed" && folio.closedAt) {
      const after = input.transactions.filter(
        (txn) => txn.folioId === folio.id && txn.postedAt > folio.closedAt!,
      );
      if (after.length > 0) {
        exceptions.push({
          exceptionType: "closed_folio_post_activity",
          severity: "blocking",
          referenceType: "folio",
          referenceId: folio.id,
          message: `Folio ${folio.number} has ${after.length} posting(s) after it was closed.`,
        });
      }
    }
    if (folio.status === "open" && Math.abs(balance) >= GUEST_ALLOCATION_TOLERANCE) {
      exceptions.push({
        exceptionType: "open_folio_balance",
        severity: "warning",
        referenceType: "folio",
        referenceId: folio.id,
        message: `Folio ${folio.number} has an outstanding balance of ${balance.toFixed(2)}.`,
      });
    }
  }

  for (const [reservationId, count] of roomChargeCount) {
    if (count > 1) {
      exceptions.push({
        exceptionType: "duplicate_room_charge",
        severity: "blocking",
        referenceType: "reservation",
        referenceId: reservationId,
        message: `A reservation has ${count} room charges posted for the same stay.`,
      });
    }
  }

  for (const stay of input.missingFolios) {
    exceptions.push({
      exceptionType: "missing_folio",
      severity: "warning",
      referenceType: "reservation",
      referenceId: stay.id,
      message: `${stay.confirmationNumber} is priced and ${stay.status.replaceAll("_", " ")} but has no folio.`,
    });
  }

  return { exceptions, balances };
}
