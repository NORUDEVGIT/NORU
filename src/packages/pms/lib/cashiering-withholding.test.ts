import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  activeWithholdingNet,
  creditNoteAllocationGuard,
  invoiceEffectiveNet,
  invoiceOutstanding,
  reviewAllocationTarget,
  settlementState,
  summarizeInvoiceSettlement,
} from "./cashiering-account-allocation.ts";
import { groupAccountLedger } from "./cashiering-account-history.ts";
import { buildAccountPayments, type AccountLedgerTender } from "./cashiering-account-payments.ts";
import { activityTypeLabel } from "./cashiering-account-workspace.ts";
import {
  splitStampedCash,
  summarizeBusinessDateActivity,
  type BusinessActivityRow,
} from "./cashiering-control.ts";
import { buildFinancialHistory } from "./cashiering-transaction-history.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const sql = read("../../../../drizzle/migrations/0156_cashiering_withholding_certificates.sql");
const hosted = read("../../../../supabase/migrations/0156_cashiering_withholding_certificates.sql");
const balance = read(
  "../../../../drizzle/migrations/0128_cashiering_phase8_financial_accounts.sql",
);
const credit = read("../../../../drizzle/migrations/0141_cashiering_cross_ledger_transfer.sql");
const drawer = read("../../../../drizzle/migrations/0114_cashiering_phase6_hotel_drawer.sql");
const night = read("./nightaudit.server.ts");

const target = {
  invoiceAccountId: "fa-1",
  paymentAccountId: "fa-1",
  paymentType: "payment",
  paymentLedgerAmount: -100,
  invoiceIssued: true,
  paymentCurrency: "ETB",
  invoiceCurrency: "ETB",
  accountStatus: "open" as const,
  face: 100,
  refunded: 0,
  paymentAllocated: 0,
  invoiceEffectiveNet: 100,
  invoiceAllocated: 0,
  amount: 70,
};

describe("company withholding settlement", () => {
  it("keeps both migration lanes identical and posts a non-cash certificate", () => {
    assert.equal(sql, hosted);
    assert.match(sql, /CREATE TABLE public\.withholding_certificates/);
    assert.match(sql, /WITHHOLDING_IMMUTABLE/);
    assert.match(sql, /'withholding_certificate', _membership_id/);
    assert.match(
      sql,
      /'adjustment', 'adjustment',\s*'Withholding certificate', round\(-_amount, 2\)/,
    );
    assert.match(sql, /'Withholding reversal', round\(original\.amount, 2\)/);
    assert.match(sql, /ledger\.payment_method IS NOT NULL/);
    assert.match(sql, /ledger\.hotel_cashier_shift_id IS NOT NULL/);
    assert.doesNotMatch(sql, /payment_method,/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.record_withholding_certificate/);
    assert.match(sql, /TO service_role/);
    assert.match(sql, /withholding_certificates_one_reversal/);
    assert.match(sql, /withholding_certificates_idempotency/);
    assert.match(sql, /WITHHOLDING_EXCEEDS_OUTSTANDING/);
    assert.match(sql, /account_kind IS DISTINCT FROM 'company'/);
    assert.match(sql, /WITHHOLDING_NOT_ISSUED/);
    assert.match(sql, /WITHHOLDING_CURRENCY_UNSUPPORTED/);
    assert.match(sql, /ACCOUNT_CLOSED/);
    assert.match(sql, /WITHHOLDING_AMOUNT_INVALID/);
    assert.match(sql, /WITHHOLDING_PRETAX_INVALID/);
    assert.match(
      sql,
      /outstanding := round\(effective_net - inv_allocated - public\.account_invoice_active_withholding/,
    );
  });

  it("reduces outstanding by active withholding and restores it on reversal", () => {
    assert.equal(invoiceOutstanding(100, 0, 30), 70);
    assert.equal(invoiceOutstanding(100, 80, 0), 20);
    assert.equal(invoiceOutstanding(100, 80, 20), 0);
    const active = activeWithholdingNet([
      { id: "a", amount: 30, reversesCertificateId: null },
      { id: "b", amount: 20, reversesCertificateId: null },
      { id: "c", amount: 30, reversesCertificateId: "a" },
    ]);
    assert.equal(active, 20);
    const summary = summarizeInvoiceSettlement({
      invoiceTotal: 100,
      noteDeltas: [],
      allocatedNet: 0,
      withholdingNet: active,
    });
    assert.equal(summary.originalAmount, 100);
    assert.equal(summary.outstanding, 80);
    assert.equal(settlementState(100, 0, 20), "PARTIALLY_PAID");
  });

  it("caps payment allocation and withholding against the same effective net", () => {
    const afterWithholding = reviewAllocationTarget({
      ...target,
      invoiceWithholding: 30,
      amount: 70,
    });
    assert.equal(afterWithholding.ok, true);
    const tooMuchPayment = reviewAllocationTarget({
      ...target,
      invoiceWithholding: 30,
      amount: 80,
    });
    assert.equal(tooMuchPayment.ok, false);
    if (tooMuchPayment.ok) return;
    assert.equal(tooMuchPayment.code, "ALLOCATION_EXCEEDS_INVOICE");
    const afterPayment = invoiceOutstanding(100, 80, 0);
    assert.equal(afterPayment, 20);
    assert.equal(invoiceOutstanding(100, 80, 30) < -0.01, true);
    const withNotes = invoiceEffectiveNet(100, [-10, 15]);
    assert.equal(invoiceOutstanding(withNotes, 80, 20), 5);
    const blocked = creditNoteAllocationGuard({
      invoiceTotal: 100,
      existingNoteDeltas: [],
      creditAmount: 30,
      allocatedNet: 80,
      withholdingNet: 20,
    });
    assert.equal(blocked.ok, false);
  });

  it("labels withholding on the statement and keeps it out of payments and cash", () => {
    const ledger = {
      id: "wh-1",
      type: "adjustment",
      category: "adjustment",
      description: "Withholding certificate",
      amount: -3000,
      postedAt: "2026-10-13T10:00:00.000Z",
      paymentMethod: null,
      referenceType: "withholding_certificate",
      shiftId: null,
    };
    const reversal = {
      ...ledger,
      id: "wh-2",
      description: "Withholding reversal",
      amount: 3000,
    };
    const groups = groupAccountLedger([ledger, reversal], "ETB");
    assert.deepEqual(
      groups.map((group) => group.title),
      ["Withholding Certificate", "Withholding Reversal"],
    );
    assert.equal(activityTypeLabel(ledger), "Withholding Certificate");
    assert.equal(activityTypeLabel(reversal), "Withholding Reversal");
    const tender: AccountLedgerTender = {
      id: ledger.id,
      type: ledger.type,
      category: ledger.category,
      description: ledger.description,
      amount: ledger.amount,
      postedAt: ledger.postedAt,
      paymentMethod: null,
      postedByMembershipId: null,
      hotelCashierShiftId: null,
      originalTransactionId: null,
      referenceType: ledger.referenceType,
    };
    const payment: AccountLedgerTender = {
      ...tender,
      id: "pay-1",
      type: "payment",
      category: "payment",
      description: "Payment",
      amount: -97000,
      paymentMethod: "bank_transfer",
    };
    const listed = buildAccountPayments({ rows: [tender, payment], canRefund: false });
    assert.deepEqual(
      listed.map((row) => row.id),
      ["pay-1"],
    );
    const activity: BusinessActivityRow = {
      id: ledger.id,
      type: "adjustment",
      category: "adjustment",
      description: ledger.description,
      amount: ledger.amount,
      postedAt: "2026-10-13T08:00:00.000Z",
      createdAt: "2026-10-13T08:00:00.000Z",
      paymentMethod: null,
      originalTransactionId: null,
      referenceType: "withholding_certificate",
      referenceId: null,
      transferId: null,
      postedBy: null,
      ownerLabel: "Company",
    };
    const cash: BusinessActivityRow = {
      ...activity,
      id: "cash-1",
      type: "payment",
      category: "payment",
      description: "Cash",
      amount: -100,
      paymentMethod: "cash",
    };
    const summary = summarizeBusinessDateActivity({
      rows: [activity, cash],
      businessDate: "2026-10-13",
      timezone: "Africa/Addis_Ababa",
    });
    assert.equal(summary.payments.amount, 100);
    assert.equal(summary.payments.count, 1);
    assert.deepEqual(splitStampedCash([activity, cash]), {
      cashPayments: 100,
      cashDeposits: 0,
      cashRefunds: 0,
    });
    const history = buildFinancialHistory({
      rows: [
        {
          id: ledger.id,
          type: "adjustment",
          category: "adjustment",
          description: ledger.description,
          amount: ledger.amount,
          postedAt: ledger.postedAt,
          createdAt: ledger.postedAt,
          postedBy: null,
          paymentMethod: null,
          originalTransactionId: null,
          referenceType: "withholding_certificate",
          referenceId: null,
          transferId: null,
          quantity: null,
          unitAmount: null,
          chargeSource: null,
          departmentName: null,
        },
      ],
      counterparts: {},
      allocations: [],
      coverage: { legacyInvoice: null, invoices: [], debitNotes: [], creditNotes: [] },
      access: { canManage: false, open: true },
    });
    assert.equal(history[0]?.label, "Withholding Certificate");
    assert.equal(Math.round((100 + -20) * 100) / 100, 80);
    assert.match(balance, /SELECT COALESCE\(round\(sum\(amount\), 2\), 0\)/);
    assert.match(credit, /dest_balance \+ round\(_amount, 2\), 2\) > credit_limit/);
    assert.match(drawer, /transaction_type IN \('payment','deposit','refund'\)/);
    assert.match(night, /transaction_type === "payment"/);
    assert.doesNotMatch(sql, /transaction_type', 'payment'/);
  });
});
