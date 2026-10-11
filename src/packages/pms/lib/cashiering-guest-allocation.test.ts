import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FOLIO_INVOICE_ALLOCATION_WARNING,
  folioSettledWithUnallocatedInvoices,
  guestAllocationCapabilities,
  guestCreditNoteGuard,
  guestInvoiceEffectiveNet,
  guestInvoiceOriginalAmount,
  guestInvoiceOutstanding,
  guestPaymentAvailable,
  guestPaymentFace,
  guestPaymentRefundable,
  guestSettlementLabel,
  guestSettlementState,
  reviewGuestAllocation,
} from "./cashiering-guest-allocation.ts";

const sql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0151_cashiering_guest_payment_allocations.sql",
    import.meta.url,
  ),
  "utf8",
);
const drizzle = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0151_cashiering_guest_payment_allocations.sql",
    import.meta.url,
  ),
  "utf8",
);
const accountSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0150_cashiering_account_payment_allocations.sql",
    import.meta.url,
  ),
  "utf8",
);
const guestPoster = readFileSync(
  new URL(
    "../../../../supabase/migrations/0135_cashiering_phase4_tax_on_post.sql",
    import.meta.url,
  ),
  "utf8",
);

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} -> ${end}`);
  return source.slice(from, to);
}

const base = {
  folioStatus: "open" as const,
  paymentType: "payment",
  paymentLedgerAmount: -10000,
  paymentFolioId: "folio-a",
  invoiceFolioId: "folio-a",
  coverageScope: "charge_groups",
  invoiceIssued: true,
  hasInvoiceTotal: true,
  folioCurrency: "ETB",
  invoiceCurrency: "ETB",
  face: 10000,
  refunded: 0,
  paymentAllocated: 0,
  invoiceEffectiveNet: 10000,
  invoiceAllocated: 0,
  amount: 10000,
};

describe("guest payment allocation", () => {
  it("keeps the migration dual-lane and separate from company allocation", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /CREATE TABLE public\.guest_payment_invoice_allocations/);
    assert.doesNotMatch(sql, /INSERT INTO public\.financial_account_payment_allocations/);
    assert.doesNotMatch(sql, /INSERT INTO public\.folio_deposit_allocations/);
    assert.doesNotMatch(accountSql, /guest_payment_invoice_allocations/);
    assert.doesNotMatch(guestPoster, /guest_payment_invoice_allocations/);
  });

  it("derives one payment settling one invoice without a stored status", () => {
    assert.equal(guestPaymentFace(-10000), 10000);
    assert.equal(guestPaymentAvailable(10000, 0, 10000), 0);
    assert.equal(guestSettlementState(10000, 10000), "PAID");
    assert.equal(guestInvoiceOutstanding(10000, 10000), 0);
    assert.equal(guestSettlementLabel("PAID"), "Paid");
  });

  it("splits one payment across two invoices", () => {
    const first = reviewGuestAllocation({
      ...base,
      invoiceEffectiveNet: 8000,
      amount: 8000,
    });
    const second = reviewGuestAllocation({
      ...base,
      paymentAllocated: 8000,
      invoiceEffectiveNet: 4000,
      invoiceAllocated: 0,
      amount: 2000,
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(guestSettlementState(8000, 8000), "PAID");
    assert.equal(guestSettlementState(4000, 2000), "PARTIALLY_PAID");
    assert.equal(guestInvoiceOutstanding(4000, 2000), 2000);
    assert.equal(guestPaymentAvailable(10000, 0, 10000), 0);
  });

  it("lets several payments settle one invoice", () => {
    assert.equal(guestSettlementState(10000, 4000), "PARTIALLY_PAID");
    assert.equal(guestSettlementState(10000, 7000), "PARTIALLY_PAID");
    assert.equal(guestSettlementState(10000, 10000), "PAID");
  });

  it("keeps an unallocated remainder without treating it as new ledger credit", () => {
    assert.equal(guestPaymentAvailable(10000, 0, 8000), 2000);
    assert.equal(guestSettlementState(10000, 8000), "PARTIALLY_PAID");
  });

  it("blocks a refund that would consume an allocation and allows it after reversal", () => {
    assert.equal(
      guestPaymentRefundable({
        sourceType: "payment",
        faceMinusRefunds: 10000,
        allocatedNet: 8000,
      }),
      2000,
    );
    const blocked = reviewGuestAllocation({ ...base, amount: 3000, paymentAllocated: 8000 });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "ALLOCATION_EXCEEDS_PAYMENT");
    assert.equal(
      guestPaymentRefundable({
        sourceType: "payment",
        faceMinusRefunds: 10000,
        allocatedNet: 7000,
      }),
      3000,
    );
  });

  it("hides a refund when the payment is fully allocated", () => {
    assert.equal(
      guestPaymentRefundable({
        sourceType: "payment",
        faceMinusRefunds: 10000,
        allocatedNet: 10000,
      }),
      0,
    );
  });

  it("does not reduce a deposit refund by payment allocations", () => {
    assert.equal(
      guestPaymentRefundable({ sourceType: "deposit", faceMinusRefunds: 4000, allocatedNet: 4000 }),
      4000,
    );
  });

  it("rejects a credit note below active allocations and allows it after reversal", () => {
    const blocked = guestCreditNoteGuard({
      invoiceTotal: 10000,
      existingNoteDeltas: [],
      creditAmount: 2000,
      allocatedNet: 10000,
    });
    assert.equal(blocked.ok, false);
    const allowed = guestCreditNoteGuard({
      invoiceTotal: 10000,
      existingNoteDeltas: [],
      creditAmount: 2000,
      allocatedNet: 8000,
    });
    assert.equal(allowed.ok, true);
    if (allowed.ok) {
      assert.equal(allowed.projectedNet, 8000);
      assert.equal(guestSettlementState(allowed.projectedNet, 8000), "PAID");
    }
  });

  it("treats a credit note to zero as no amount due", () => {
    const allowed = guestCreditNoteGuard({
      invoiceTotal: 10000,
      existingNoteDeltas: [],
      creditAmount: 10000,
      allocatedNet: 0,
    });
    assert.equal(allowed.ok, true);
    if (allowed.ok) assert.equal(guestSettlementState(allowed.projectedNet, 0), "NO_AMOUNT_DUE");
    assert.notEqual(guestSettlementState(0, 0), "PAID");
  });

  it("lets a debit note turn a paid invoice partially paid without new cash", () => {
    const net = guestInvoiceEffectiveNet(10000, [2000]);
    assert.equal(net, 12000);
    assert.equal(guestInvoiceOutstanding(net, 10000), 2000);
    assert.equal(guestSettlementState(net, 10000), "PARTIALLY_PAID");
  });

  it("keeps a deposit-funded charge invoice unpaid until a payment is allocated", () => {
    assert.equal(guestInvoiceOriginalAmount({ totals: { invoiceTotal: 10000 } }), 10000);
    assert.equal(guestSettlementState(10000, 0), "UNPAID");
    assert.equal(guestSettlementState(10000, 6000), "PARTIALLY_PAID");
    assert.equal(guestInvoiceOutstanding(10000, 6000), 4000);
    assert.equal(folioSettledWithUnallocatedInvoices(0, [4000]), true);
    assert.match(FOLIO_INVOICE_ALLOCATION_WARNING, /Folio balance is settled/);
  });

  it("rejects the wrong folio, a legacy invoice, a draft, and a currency mismatch", () => {
    assert.equal(reviewGuestAllocation({ ...base, invoiceFolioId: "folio-b" }).ok, false);
    assert.equal(reviewGuestAllocation({ ...base, coverageScope: "legacy_folio" }).ok, false);
    assert.equal(reviewGuestAllocation({ ...base, invoiceIssued: false }).ok, false);
    assert.equal(reviewGuestAllocation({ ...base, hasInvoiceTotal: false }).ok, false);
    assert.equal(reviewGuestAllocation({ ...base, invoiceCurrency: "USD" }).ok, false);
    assert.equal(reviewGuestAllocation({ ...base, paymentType: "deposit" }).ok, false);
    assert.equal(reviewGuestAllocation({ ...base, folioStatus: "closed" }).ok, false);
    assert.equal(guestInvoiceOriginalAmount({ totals: { invoiceTotal: null } }), null);
  });

  it("allows allocation while the folio is in credit", () => {
    const result = reviewGuestAllocation({
      ...base,
      face: 5000,
      paymentLedgerAmount: -5000,
      invoiceEffectiveNet: 3000,
      amount: 3000,
    });
    assert.equal(result.ok, true);
  });

  it("keeps accountant allocation separate from cashier posting and manager refunds", () => {
    const accountant = guestAllocationCapabilities({ role: "accountant", folioStatus: "open" });
    assert.equal(accountant.canAllocate, true);
    assert.equal(accountant.canReverse, true);
    assert.equal(accountant.canPostPayment, false);
    assert.equal(accountant.canRefund, false);
    const cashier = guestAllocationCapabilities({ role: "cashier", folioStatus: "open" });
    assert.equal(cashier.canView, true);
    assert.equal(cashier.canAllocate, false);
    assert.equal(cashier.canPostPayment, true);
    const closed = guestAllocationCapabilities({ role: "owner", folioStatus: "closed" });
    assert.equal(closed.canView, true);
    assert.equal(closed.canAllocate, false);
    assert.equal(closed.canReverse, false);
  });

  it("locks folio, payment, then invoices and stores one idempotency key", () => {
    const apply = between(
      sql,
      "CREATE OR REPLACE FUNCTION public.apply_guest_payment_invoice_allocations",
      "CREATE OR REPLACE FUNCTION public.reverse_guest_payment_invoice_allocation",
    );
    const folioLock = apply.indexOf("FROM public.guest_folios");
    const paymentLock = apply.indexOf("FOR UPDATE;", folioLock);
    const invoiceLock = apply.indexOf("ORDER BY inv_lock.id");
    assert.ok(folioLock < paymentLock && paymentLock < invoiceLock);
    assert.match(apply, /FOLIO_CLOSED/);
    assert.match(apply, /LEGACY_INVOICE_ALLOCATION_UNSUPPORTED/);
    assert.match(apply, /ALLOCATION_FOLIO_MISMATCH/);
    assert.match(apply, /ALLOCATION_CURRENCY_MISMATCH/);
    assert.match(apply, /invoice_id = invoice_ids\[1\]/);
    assert.match(apply, /IDEMPOTENCY_KEY_REUSED/);
    assert.match(apply, /guest_payment_allocated/);
    assert.doesNotMatch(apply, /INSERT INTO public\.folio_transactions/);
    assert.doesNotMatch(apply, /hotel_cashier_shift_id/);
  });

  it("caps only payment refunds and guards only the guest credit-note path", () => {
    const poster = between(
      sql,
      "CREATE OR REPLACE FUNCTION public.post_folio_transaction",
      "CREATE OR REPLACE FUNCTION public.issue_invoice_credit_note_draft",
    );
    const paymentCap = poster.indexOf("source.transaction_type = 'payment'");
    const allocationRead = poster.indexOf("guest_payment_invoice_allocations");
    assert.ok(paymentCap > 0 && allocationRead > paymentCap);
    assert.match(poster, /REFUND_EXCEEDS_SETTLED/);
    assert.doesNotMatch(poster, /folio_deposit_allocations/);
    const credit = sql.slice(sql.indexOf("FUNCTION public.issue_invoice_credit_note_draft"));
    assert.match(credit, /IF account_for_history IS NOT NULL THEN/);
    assert.match(credit, /financial_account_payment_allocations/);
    assert.match(credit, /IF draft\.guest_invoice_id IS NOT NULL THEN/);
    assert.match(credit, /guest_payment_invoice_allocations/);
    assert.doesNotMatch(credit, /guest_folios\.status|folio\.status <> 'open'/);
  });
});
