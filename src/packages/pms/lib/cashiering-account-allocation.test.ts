import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  allocationCapabilities,
  creditNoteAllocationGuard,
  invoiceEffectiveNet,
  invoiceOutstanding,
  paymentAvailable,
  paymentFace,
  refundWithinAvailable,
  reversalAmount,
  roundAllocationMoney,
  settlementState,
  settlementStateLabel,
  stalePreview,
  summarizeInvoiceSettlement,
  reviewAllocationTarget,
} from "./cashiering-account-allocation.ts";
import { buildAccountHistory, buildAccountStatement } from "./cashiering-account-history.ts";
import { accountWorkspaceCapabilities } from "./cashiering-account-workspace.ts";

const sql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0150_cashiering_account_payment_allocations.sql",
    import.meta.url,
  ),
  "utf8",
);
const drizzle = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0150_cashiering_account_payment_allocations.sql",
    import.meta.url,
  ),
  "utf8",
);
const historicalRefund = readFileSync(
  new URL("../../../../supabase/migrations/0149_cashiering_account_payments.sql", import.meta.url),
  "utf8",
);
const roles = readFileSync(
  new URL("../../../../src/core/lib/cashiering-roles.ts", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering-phases.functions.ts", import.meta.url), "utf8");

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}

const baseTarget = {
  invoiceAccountId: "fa-1",
  paymentAccountId: "fa-1",
  paymentType: "payment",
  paymentLedgerAmount: -10000,
  invoiceIssued: true,
  paymentCurrency: "ETB",
  invoiceCurrency: "ETB",
  accountStatus: "open" as const,
  face: 10000,
  refunded: 0,
  paymentAllocated: 0,
  invoiceEffectiveNet: 10000,
  invoiceAllocated: 0,
  amount: 4000,
};

describe("payment allocation formulas", () => {
  it("derives face, available, effective net, and outstanding", () => {
    assert.equal(paymentFace(-20000), 20000);
    assert.equal(paymentAvailable(20000, 2000, 8000), 10000);
    assert.equal(invoiceEffectiveNet(10000, [-2000, 3000]), 11000);
    assert.equal(invoiceOutstanding(10000, 4000), 6000);
    assert.equal(roundAllocationMoney(10.005), 10.01);
  });

  it("derives settlement without storing a paid status", () => {
    assert.equal(settlementState(10000, 0), "UNPAID");
    assert.equal(settlementState(10000, 4000), "PARTIALLY_PAID");
    assert.equal(invoiceOutstanding(10000, 4000), 6000);
    assert.equal(settlementState(10000, 10000), "PAID");
    assert.equal(invoiceOutstanding(10000, 10000), 0);
    assert.equal(settlementState(0, 0), "NO_AMOUNT_DUE");
    assert.equal(settlementStateLabel("NO_AMOUNT_DUE"), "No Amount Due");
    assert.notEqual(settlementState(0, 0), "PAID");
  });

  it("allocates one payment across invoices and keeps the remainder", () => {
    const available = paymentAvailable(20000, 0, 0);
    const first = reviewAllocationTarget({
      ...baseTarget,
      face: available,
      paymentLedgerAmount: -20000,
      invoiceEffectiveNet: 8000,
      amount: 8000,
    });
    const second = reviewAllocationTarget({
      ...baseTarget,
      face: available,
      paymentLedgerAmount: -20000,
      paymentAllocated: 8000,
      invoiceEffectiveNet: 7000,
      amount: 7000,
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(paymentAvailable(20000, 0, 15000), 5000);
    assert.equal(settlementState(8000, 8000), "PAID");
    assert.equal(settlementState(7000, 7000), "PAID");
  });

  it("lets several payments settle one invoice", () => {
    assert.equal(settlementState(10000, 4000), "PARTIALLY_PAID");
    assert.equal(settlementState(10000, 7000), "PARTIALLY_PAID");
    assert.equal(settlementState(10000, 10000), "PAID");
  });

  it("rejects over-allocation of the payment and of the invoice", () => {
    const payment = reviewAllocationTarget({
      ...baseTarget,
      face: 5000,
      paymentLedgerAmount: -5000,
      amount: 6000,
      invoiceEffectiveNet: 10000,
    });
    const invoice = reviewAllocationTarget({
      ...baseTarget,
      invoiceEffectiveNet: 4000,
      amount: 5000,
    });
    assert.equal(payment.ok && payment, false);
    if (!payment.ok) assert.equal(payment.code, "ALLOCATION_EXCEEDS_PAYMENT");
    if (!invoice.ok) assert.equal(invoice.code, "ALLOCATION_EXCEEDS_INVOICE");
  });

  it("rejects the wrong account, a draft, a currency mismatch, and a closed account", () => {
    const wrong = reviewAllocationTarget({ ...baseTarget, invoiceAccountId: "fa-2" });
    const draft = reviewAllocationTarget({ ...baseTarget, invoiceIssued: false });
    const currency = reviewAllocationTarget({ ...baseTarget, invoiceCurrency: "USD" });
    const closed = reviewAllocationTarget({ ...baseTarget, accountStatus: "closed" });
    const deposit = reviewAllocationTarget({
      ...baseTarget,
      paymentType: "deposit",
      paymentLedgerAmount: -1000,
    });
    if (!wrong.ok) assert.equal(wrong.code, "ALLOCATION_ACCOUNT_MISMATCH");
    if (!draft.ok) assert.equal(draft.code, "ALLOCATION_NOT_ISSUED");
    if (!currency.ok) assert.equal(currency.code, "ALLOCATION_CURRENCY_MISMATCH");
    if (!closed.ok) assert.equal(closed.code, "ACCOUNT_CLOSED");
    if (!deposit.ok) assert.equal(deposit.code, "ALLOCATION_NOT_A_PAYMENT");
  });

  it("blocks a refund that would consume allocated money until the allocation is reversed", () => {
    assert.equal(
      refundWithinAvailable({ face: 10000, refunded: 0, allocatedNet: 8000, refundAmount: 3000 }),
      false,
    );
    assert.equal(paymentAvailable(10000, 0, 10000), 0);
    assert.equal(
      refundWithinAvailable({ face: 10000, refunded: 0, allocatedNet: 10000, refundAmount: 1 }),
      false,
    );
    const remaining = reversalAmount(8000, [-3000]);
    assert.equal(remaining, 5000);
    assert.equal(paymentAvailable(10000, 0, 5000), 5000);
    assert.equal(
      refundWithinAvailable({ face: 10000, refunded: 0, allocatedNet: 5000, refundAmount: 3000 }),
      true,
    );
    assert.equal(reversalAmount(5000, [-5000]), 0);
    assert.equal(reversalAmount(5000, [-5000, -1]) < 0, true);
  });

  it("rejects a credit note that would fall below active allocations", () => {
    const blocked = creditNoteAllocationGuard({
      invoiceTotal: 10000,
      existingNoteDeltas: [],
      creditAmount: 2000,
      allocatedNet: 10000,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.allocated, 10000);
      assert.equal(blocked.release, 2000);
      assert.equal(blocked.projectedNet, 8000);
    }
    const allowed = creditNoteAllocationGuard({
      invoiceTotal: 10000,
      existingNoteDeltas: [],
      creditAmount: 2000,
      allocatedNet: 8000,
    });
    assert.equal(allowed.ok, true);
    if (allowed.ok) assert.equal(allowed.projectedNet, 8000);
    assert.equal(settlementState(8000, 8000), "PAID");
    assert.equal(paymentAvailable(10000, 0, 8000), 2000);
  });

  it("lets a debit note turn a paid invoice into partially paid without a new ledger charge", () => {
    const summary = summarizeInvoiceSettlement({
      invoiceTotal: 10000,
      noteDeltas: [2000],
      allocatedNet: 10000,
    });
    assert.equal(summary.effectiveNet, 12000);
    assert.equal(summary.allocated, 10000);
    assert.equal(summary.outstanding, 2000);
    assert.equal(summary.settlementState, "PARTIALLY_PAID");
  });

  it("treats a fully credited invoice with no allocation as no amount due", () => {
    const summary = summarizeInvoiceSettlement({
      invoiceTotal: 10000,
      noteDeltas: [-10000],
      allocatedNet: 0,
    });
    assert.equal(summary.effectiveNet, 0);
    assert.equal(summary.settlementState, "NO_AMOUNT_DUE");
  });

  it("reverses the full remaining amount and restores availability", () => {
    assert.equal(reversalAmount(5000, []), 5000);
    assert.equal(paymentAvailable(10000, 0, 0), paymentAvailable(10000, 0, 5000) + 5000);
    assert.equal(invoiceOutstanding(10000, 0), invoiceOutstanding(10000, 5000) + 5000);
    assert.equal(stalePreview(5000, 4000), true);
    assert.equal(stalePreview(5000, 5000), false);
  });

  it("keeps legacy unallocated payments eligible for their face minus refunds", () => {
    assert.equal(paymentAvailable(paymentFace(-10000), 0, 0), 10000);
    assert.equal(paymentAvailable(10000, 1500, 0), 8500);
  });
});

describe("allocation permissions", () => {
  it("lets owner, manager, and accountant allocate, and keeps cashier view-only", () => {
    for (const role of ["owner", "manager", "accountant"] as const) {
      const rights = allocationCapabilities({ role, status: "open" });
      assert.equal(rights.canAllocate, true);
      assert.equal(rights.canReverse, true);
    }
    const cashier = allocationCapabilities({ role: "cashier", status: "open" });
    assert.equal(cashier.canView, true);
    assert.equal(cashier.canAllocate, false);
    assert.equal(cashier.canReverse, false);
    const closed = allocationCapabilities({ role: "accountant", status: "closed" });
    assert.equal(closed.canView, true);
    assert.equal(closed.canAllocate, false);
    assert.equal(closed.canReverse, false);
  });

  it("does not give accountant cash posting, refund, write-off, or close", () => {
    const accountant = accountWorkspaceCapabilities({
      role: "accountant",
      status: "open",
      balance: 100,
      accountKind: "company",
    });
    assert.equal(accountant.canReceivePayment, false);
    assert.equal(accountant.canRefund, false);
    assert.equal(accountant.canWriteOff, false);
    assert.equal(accountant.canClose, false);
    assert.match(roles, /CASHIER_ALLOCATE_ROLES = \["owner", "manager", "accountant"\]/);
    assert.match(roles, /CASHIER_MANAGE_ROLES = \["owner", "manager"\]/);
    assert.doesNotMatch(roles, /CASHIER_MANAGE_ROLES = \[[^\]]*accountant/);
    assert.match(poster, /requireCashierOperator/);
    assert.match(poster, /requireCashierManager/);
    assert.doesNotMatch(poster, /requireCashierAllocator/);
  });
});

describe("allocation history stays off the statement", () => {
  it("records allocation and reversal without a statement line or balance change", () => {
    const ledger = [
      {
        id: "charge",
        type: "charge",
        category: "manual",
        description: "Room",
        amount: 10000,
        postedAt: "2026-10-02T08:00:00.000Z",
      },
      {
        id: "pay",
        type: "payment",
        category: "payment",
        description: "Received",
        amount: -10000,
        postedAt: "2026-10-02T09:00:00.000Z",
        paymentMethod: "bank_transfer",
      },
    ];
    const before = buildAccountStatement({
      currency: "ETB",
      timezone: "UTC",
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
      rows: ledger,
    });
    const after = buildAccountStatement({
      currency: "ETB",
      timezone: "UTC",
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
      rows: ledger,
    });
    assert.deepEqual(after, before);
    assert.equal(after.closingBalance, 0);
    const history = buildAccountHistory({
      accountId: "fa-1",
      currency: "ETB",
      openedAt: "2026-10-01T00:00:00.000Z",
      closedAt: null,
      createdByMembershipId: null,
      rows: ledger,
      documents: [],
      closes: [],
      allocations: [
        {
          id: "alloc-1",
          amount: 5000,
          occurredAt: "2026-10-03T00:00:00.000Z",
          actorMembershipId: "mem-1",
          paymentTransactionId: "pay",
          paymentMethod: "bank_transfer",
          invoiceId: "inv-1",
          invoiceNumber: "INV-1001",
          reason: null,
        },
        {
          id: "alloc-2",
          amount: -5000,
          occurredAt: "2026-10-04T00:00:00.000Z",
          actorMembershipId: "mem-1",
          paymentTransactionId: "pay",
          paymentMethod: "bank_transfer",
          invoiceId: "inv-1",
          invoiceNumber: "INV-1001",
          reason: "Allocated to wrong invoice",
        },
      ],
    });
    const allocated = history.filter((event) => event.eventType === "payment_allocated");
    const reversed = history.filter((event) => event.eventType === "allocation_reversed");
    assert.equal(allocated.length, 1);
    assert.equal(reversed.length, 1);
    assert.match(allocated[0]?.title ?? "", /INV-1001/);
    assert.match(reversed[0]?.description ?? "", /Allocated to wrong invoice/);
    assert.equal(allocated[0]?.affectsBalance, false);
    assert.equal(reversed[0]?.affectsBalance, false);
    assert.equal(
      history
        .filter((event) => event.affectsBalance)
        .reduce((sum, event) => sum + (event.amount ?? 0), 0),
      0,
    );
  });
});

describe("allocation migration", () => {
  it("is the same file in both migration lanes", () => {
    assert.equal(sql, drizzle);
  });

  it("creates an append-only allocation table and the three RPCs", () => {
    const table = between(
      sql,
      "CREATE TABLE public.financial_account_payment_allocations",
      "CREATE INDEX financial_account_payment_allocations_payment_idx",
    );
    assert.doesNotMatch(
      table,
      /updated_at|deleted_at|available_amount|invoice_paid_status|cashier_shift/,
    );
    assert.match(sql, /BEFORE UPDATE OR DELETE ON public.financial_account_payment_allocations/);
    assert.match(sql, /financial_account_payment_allocations_payment_idx/);
    assert.match(sql, /financial_account_payment_allocations_invoice_idx/);
    assert.match(sql, /financial_account_payment_allocations_account_idx/);
    assert.match(sql, /financial_account_payment_allocations_operation_idx/);
    assert.match(sql, /financial_account_payment_allocations_idempotency/);
    assert.match(sql, /preview_financial_account_payment_allocation/);
    assert.match(sql, /apply_financial_account_payment_allocations/);
    assert.match(sql, /reverse_financial_account_payment_allocation/);
    assert.doesNotMatch(sql, /issue_invoice_debit_note_draft/);
    assert.doesNotMatch(sql, /folio_deposit_allocations/);
  });

  it("locks account, then payment, then invoices, and does not post a ledger line", () => {
    const apply = between(
      sql,
      "CREATE OR REPLACE FUNCTION public.apply_financial_account_payment_allocations",
      "CREATE OR REPLACE FUNCTION public.reverse_financial_account_payment_allocation",
    );
    const accountLock = apply.indexOf("FROM public.financial_accounts");
    const paymentLock = apply.indexOf("FROM public.folio_transactions");
    const invoiceLock = apply.indexOf("FROM public.financial_account_invoices inv_lock");
    assert.ok(accountLock < paymentLock && paymentLock < invoiceLock);
    assert.match(apply, /ORDER BY inv_lock.id/);
    assert.doesNotMatch(apply, /INSERT INTO public.folio_transactions/);
    assert.doesNotMatch(apply, /financial_account_balance|hotel_cashier_shifts|guest_folios/);
    const reverse = between(
      sql,
      "CREATE OR REPLACE FUNCTION public.reverse_financial_account_payment_allocation",
      "CREATE OR REPLACE FUNCTION public.post_financial_account_transaction",
    );
    assert.doesNotMatch(reverse, /INSERT INTO public.folio_transactions/);
    assert.match(reverse, /REASON_REQUIRED/);
    assert.match(reverse, /-remaining/);
  });

  it("makes the refund cap and the credit-note issuer allocation-aware", () => {
    assert.match(sql, /-source\.amount - linked - allocated/);
    assert.match(sql, /ALLOCATION_EXCEEDS_INVOICE_NET/);
    assert.doesNotMatch(historicalRefund, /financial_account_payment_allocations/);
    assert.match(historicalRefund, /-source\.amount - linked, 2/);
  });
});
