import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildAccountChargeGroups } from "./cashiering-account-ownership.ts";
import {
  accountCashStampsShift,
  accountPaymentCapabilities,
  accountPaymentDescription,
  accountTenderScopeLabel,
  buildAccountPayments,
  overpaymentCredit,
  projectedAccountBalance,
  queryAccountPayments,
  writeOffAllowed,
  type AccountLedgerTender,
} from "./cashiering-account-payments.ts";
import {
  shiftCashMovementTitle,
  splitStampedCash,
  summarizeBusinessDateActivity,
  type BusinessActivityRow,
} from "./cashiering-control.ts";
function drawerExpected(input: {
  opening: number;
  cashIn: number;
  cashOut: number;
  hotelCash: number;
}): number {
  return Math.round((input.opening + input.cashIn - input.cashOut + input.hotelCash) * 100) / 100;
}

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const sql = read("../../../../supabase/migrations/0149_cashiering_account_payments.sql");
const drizzle = read("../../../../drizzle/migrations/0149_cashiering_account_payments.sql");
const drawer = read("../../../../supabase/migrations/0114_cashiering_phase6_hotel_drawer.sql");
const guest = read("../../../../supabase/migrations/0135_cashiering_phase4_tax_on_post.sql");
const writeOffSql = read(
  "../../../../supabase/migrations/0130_cashiering_phase10_extended_settlement.sql",
);
const poster = read("./cashiering-phases.functions.ts");
const activity = read("./cashiering-control.functions.ts");
const panel = read("../components/cashiering/financial-account-payments-panel.tsx");
const workspace = read("../components/cashiering/financial-account-workspace.tsx");
const controlPanel = read("../components/cashiering/cashier-control-panel.tsx");

const fn = sql.slice(
  sql.indexOf("FUNCTION public.post_financial_account_transaction"),
  sql.indexOf("GRANT EXECUTE"),
);
const signature = fn.slice(0, fn.indexOf("RETURNS"));
const writeOffFn = writeOffSql.slice(
  writeOffSql.indexOf("FUNCTION public.post_settlement_write_off"),
  writeOffSql.indexOf("GRANT EXECUTE"),
);
const figures = drawer.slice(
  drawer.indexOf("FUNCTION public.hotel_drawer_figures"),
  drawer.indexOf("FUNCTION public.post_folio_transaction"),
);
const entry = poster.slice(
  poster.indexOf("export const postFinancialAccountEntry"),
  poster.indexOf("export const closeFinancialAccount"),
);

function ledger(
  partial: Partial<AccountLedgerTender> & Pick<AccountLedgerTender, "id" | "type" | "amount">,
): AccountLedgerTender {
  return {
    category: partial.type,
    description: partial.id,
    postedAt: "2026-10-10T08:00:00.000Z",
    paymentMethod: null,
    postedByMembershipId: "ada",
    hotelCashierShiftId: null,
    originalTransactionId: null,
    referenceType: null,
    ...partial,
  };
}

function activityRow(
  partial: Partial<BusinessActivityRow> &
    Pick<BusinessActivityRow, "id" | "type" | "amount" | "postedAt">,
): BusinessActivityRow {
  return {
    category: partial.type,
    description: partial.id,
    createdAt: partial.postedAt,
    paymentMethod: null,
    originalTransactionId: null,
    referenceType: null,
    referenceId: null,
    transferId: null,
    postedBy: "Ada",
    ownerLabel: "Guest",
    ...partial,
  };
}

describe("account payment migration", () => {
  it("keeps the dual-lane function free of new tables and a client shift id", () => {
    assert.equal(sql, drizzle);
    assert.doesNotMatch(sql, /CREATE TABLE/);
    assert.doesNotMatch(signature, /shift/i);
    assert.match(signature, /_original_transaction_id uuid DEFAULT NULL/);
    assert.doesNotMatch(fn, /UPDATE public\.folio_transactions/);
    assert.doesNotMatch(fn, /SHIFT_REQUIRED/);
    assert.doesNotMatch(fn, /financial_account_balance/);
    assert.doesNotMatch(fn, /guest_folio_invoices/);
    assert.doesNotMatch(fn, /city_ledger|voucher/i);
  });

  it("stamps only the actor's open same-property shift for cash payment and cash refund", () => {
    assert.match(fn, /clean_method = 'cash' AND _type IN \('payment','refund'\)/);
    assert.doesNotMatch(fn, /_type IN \('payment','deposit','refund'\)/);
    const lookup = fn.slice(fn.indexOf("hotel_cashier_shifts"), fn.indexOf("INSERT INTO"));
    assert.match(lookup, /restaurant_id = _restaurant_id/);
    assert.match(lookup, /membership_id = _membership_id/);
    assert.match(lookup, /status = 'open'/);
    assert.match(fn, /hotel_cashier_shift_id/);
    const insert = fn.slice(
      fn.indexOf("INSERT INTO public.folio_transactions"),
      fn.indexOf("RETURNING"),
    );
    assert.match(insert, /hotel_cashier_shift_id/);
    assert.match(guest, /clean_method = 'cash' AND _type IN \('payment','deposit','refund'\)/);
  });

  it("caps linked refunds before insert and keeps idempotent retries first", () => {
    assert.ok(fn.indexOf("IDEMPOTENCY_KEY_REUSED") < fn.indexOf("ACCOUNT_CLOSED"));
    assert.ok(fn.indexOf("ACCOUNT_CLOSED") < fn.indexOf("REFUND_EXCEEDS_SOURCE"));
    assert.ok(fn.indexOf("FOR UPDATE") < fn.indexOf("REFUND_EXCEEDS_SOURCE"));
    assert.match(fn, /financial_account_id = acct.id/);
    assert.match(fn, /SOURCE_NOT_ON_ACCOUNT/);
    assert.match(fn, /SOURCE_NOT_A_PAYMENT/);
    assert.match(fn, /REFUND_METHOD_MISMATCH/);
    assert.match(fn, /clean_method := source.payment_method/);
    assert.match(fn, /original_transaction_id = source.id/);
    assert.match(fn, /WHEN 'charge' THEN _amount WHEN 'refund' THEN _amount ELSE -_amount/);
  });

  it("leaves write-off off the drawer and does not close the account", () => {
    assert.doesNotMatch(writeOffFn, /hotel_cashier_shift_id/);
    assert.doesNotMatch(writeOffFn, /status = 'closed'/);
    assert.match(writeOffFn, /settlement_write_off/);
  });

  it("counts stamped account cash in hotel_drawer_figures without a folio filter", () => {
    assert.match(figures, /COALESCE\(-sum\(amount\), 0\)/);
    assert.match(figures, /payment_method = 'cash'/);
    assert.match(figures, /transaction_type IN \('payment','deposit','refund'\)/);
    assert.doesNotMatch(figures, /folio_id IS NOT NULL/);
    assert.match(figures, /opening \+ cash_in - cash_out \+ hotel_cash/);
  });
});

describe("account payment posting rules", () => {
  it("reduces the projected balance for company and group payments and stores a positive entry as a credit", () => {
    assert.equal(projectedAccountBalance(10000, "payment", 4000), 6000);
    assert.equal(projectedAccountBalance(10000, "payment", 4000), 6000);
    assert.equal(overpaymentCredit(5000, 7000), 2000);
    assert.equal(projectedAccountBalance(5000, "payment", 7000), -2000);
    assert.equal(overpaymentCredit(0, 1000), 1000);
    assert.equal(overpaymentCredit(10000, 4000), null);
    assert.equal(
      accountPaymentDescription("Acme Travel", "Bank copy"),
      "Received from Acme Travel. Bank copy",
    );
  });

  it("does not change source-folio ownership when a payment, refund, or write-off is posted", () => {
    const groups = buildAccountChargeGroups({
      accountId: "acct",
      rows: [
        {
          id: "room",
          folioId: "folio-a",
          accountId: null,
          type: "charge",
          category: "room",
          description: "Room",
          amount: 10000,
          postedAt: "2026-10-05T10:00:00.000Z",
          originalTransactionId: null,
          postedByMembershipId: null,
          quantity: null,
          unitAmount: null,
        },
        {
          id: "room-in",
          folioId: null,
          accountId: "acct",
          type: "transfer_in",
          category: "transfer",
          description: "Room",
          amount: 10000,
          postedAt: "2026-10-05T11:00:00.000Z",
          originalTransactionId: "room",
          postedByMembershipId: null,
          quantity: null,
          unitAmount: null,
        },
        {
          id: "pay",
          folioId: null,
          accountId: "acct",
          type: "payment",
          category: "payment",
          description: "Received from Acme",
          amount: -4000,
          postedAt: "2026-10-06T10:00:00.000Z",
          originalTransactionId: null,
          postedByMembershipId: "ada",
          quantity: null,
          unitAmount: null,
        },
        {
          id: "refund",
          folioId: null,
          accountId: "acct",
          type: "refund",
          category: "refund",
          description: "Partial refund",
          amount: 1000,
          postedAt: "2026-10-07T10:00:00.000Z",
          originalTransactionId: "pay",
          postedByMembershipId: "ada",
          quantity: null,
          unitAmount: null,
        },
        {
          id: "write-off",
          folioId: null,
          accountId: "acct",
          type: "adjustment",
          category: "adjustment",
          description: "Settlement write-off: uncollectible",
          amount: -500,
          postedAt: "2026-10-08T10:00:00.000Z",
          originalTransactionId: null,
          postedByMembershipId: "ada",
          quantity: null,
          unitAmount: null,
        },
      ],
    });
    assert.equal(groups[0]?.remainingAmount, 10000);
  });

  it("keeps cashier payment access and manager-only refund and write-off", () => {
    for (const role of ["owner", "manager"]) {
      const open = accountPaymentCapabilities({
        role,
        status: "open",
        balance: 2000,
        accountKind: "company",
      });
      assert.equal(open.canReceivePayment, true);
      assert.equal(open.canRefund, true);
      assert.equal(open.canWriteOff, true);
    }
    const cashier = accountPaymentCapabilities({
      role: "cashier",
      status: "open",
      balance: 2000,
      accountKind: "group",
    });
    assert.equal(cashier.canReceivePayment, true);
    assert.equal(cashier.canRefund, false);
    assert.equal(cashier.canWriteOff, false);
    const accountant = accountPaymentCapabilities({
      role: "accountant",
      status: "open",
      balance: 2000,
      accountKind: "company",
    });
    assert.equal(accountant.canReceivePayment, false);
    assert.equal(accountant.canRefund, false);
    assert.equal(accountant.canWriteOff, false);
    const closed = accountPaymentCapabilities({
      role: "owner",
      status: "closed",
      balance: 0,
      accountKind: "company",
    });
    assert.equal(closed.canReceivePayment, false);
    assert.equal(closed.canRefund, false);
    assert.equal(closed.canWriteOff, false);
    assert.match(entry, /requireCashierOperator/);
    assert.match(entry, /requireCashierManager/);
    assert.match(entry, /_original_transaction_id/);
    assert.doesNotMatch(entry, /hotel_cashier_shift/);
    assert.match(entry, /data.type === "payment" \|\| data.type === "deposit"/);
  });
});

describe("account cash shift and business date", () => {
  it("adds stamped company and group cash to expected cash and ignores non-cash", () => {
    const steps = [
      { type: "payment", method: "cash", amount: -500 },
      { type: "payment", method: "card", amount: -600 },
      { type: "payment", method: "cash", amount: -200 },
      { type: "refund", method: "cash", amount: 100 },
    ];
    const running: Array<{ type: string; amount: number; paymentMethod: string | null }> = [];
    const expected = [1500, 1500, 1700, 1600];
    steps.forEach((step, index) => {
      assert.equal(
        accountCashStampsShift({ type: step.type, method: step.method }),
        step.method === "cash",
      );
      if (accountCashStampsShift({ type: step.type, method: step.method })) {
        running.push({ type: step.type, amount: step.amount, paymentMethod: step.method });
      }
      const split = splitStampedCash(running);
      assert.equal(
        drawerExpected({
          opening: 1000,
          cashIn: 0,
          cashOut: 0,
          hotelCash: split.cashPayments + split.cashDeposits - split.cashRefunds,
        }),
        expected[index],
      );
    });
    assert.equal(accountCashStampsShift({ type: "deposit", method: "cash" }), false);
    assert.equal(accountCashStampsShift({ type: "payment", method: "bank_transfer" }), false);
    assert.equal(accountCashStampsShift({ type: "payment", method: "mobile_money" }), false);
    assert.equal(accountCashStampsShift({ type: "adjustment", method: null }), false);
    const guestCash = splitStampedCash([
      { type: "payment", amount: -1000, paymentMethod: "cash" },
      { type: "deposit", amount: -500, paymentMethod: "cash" },
    ]);
    assert.equal(guestCash.cashPayments, 1000);
    assert.equal(guestCash.cashDeposits, 500);
  });

  it("labels company and group cash separately from guest cash", () => {
    assert.equal(
      shiftCashMovementTitle({ type: "payment", accountKind: "company" }),
      "Company Payment",
    );
    assert.equal(
      shiftCashMovementTitle({ type: "payment", accountKind: "group" }),
      "Group Payment",
    );
    assert.equal(
      shiftCashMovementTitle({ type: "refund", accountKind: "company" }),
      "Company Refund",
    );
    assert.equal(shiftCashMovementTitle({ type: "refund", accountKind: "group" }), "Group Refund");
    assert.equal(shiftCashMovementTitle({ type: "payment", accountKind: null }), "Guest payment");
    assert.match(activity, /financial_account_id/);
    assert.match(activity, /shiftCashMovementTitle/);
    assert.doesNotMatch(activity, /folio_id"\)\.not/);
    assert.match(controlPanel, /accountTitle/);
  });

  it("includes company and group receipts in the business-date totals once", () => {
    const day = summarizeBusinessDateActivity({
      businessDate: "2026-10-10",
      timezone: "Africa/Addis_Ababa",
      rows: [
        activityRow({
          id: "guest-pay",
          type: "payment",
          amount: -1000,
          postedAt: "2026-10-10T08:00:00.000Z",
          paymentMethod: "cash",
          ownerLabel: "Guest",
        }),
        activityRow({
          id: "company-pay",
          type: "payment",
          amount: -5000,
          postedAt: "2026-10-10T09:00:00.000Z",
          paymentMethod: "bank_transfer",
          ownerLabel: "Acme · FA-000001",
        }),
        activityRow({
          id: "group-pay",
          type: "payment",
          amount: -2000,
          postedAt: "2026-10-10T10:00:00.000Z",
          paymentMethod: "mobile_money",
          ownerLabel: "Tour group · FA-000002",
        }),
        activityRow({
          id: "guest-deposit",
          type: "deposit",
          amount: -500,
          postedAt: "2026-10-10T11:00:00.000Z",
          paymentMethod: "cash",
        }),
        activityRow({
          id: "company-refund",
          type: "refund",
          amount: 100,
          postedAt: "2026-10-10T12:00:00.000Z",
          paymentMethod: "cash",
          ownerLabel: "Acme · FA-000001",
        }),
        activityRow({
          id: "transfer",
          type: "transfer_in",
          amount: 10000,
          postedAt: "2026-10-10T07:00:00.000Z",
        }),
        activityRow({
          id: "before-midnight",
          type: "payment",
          amount: -900,
          postedAt: "2026-10-09T20:30:00.000Z",
          paymentMethod: "cash",
          ownerLabel: "Acme · FA-000001",
        }),
        activityRow({
          id: "after-midnight",
          type: "payment",
          amount: -25,
          postedAt: "2026-10-09T21:30:00.000Z",
          paymentMethod: "card",
          ownerLabel: "Acme · FA-000001",
        }),
      ],
    });
    assert.equal(day.payments.amount, 8025);
    assert.equal(day.payments.count, 4);
    assert.equal(day.deposits.amount, 500);
    assert.equal(day.deposits.count, 1);
    assert.equal(day.refunds.amount, 100);
    assert.equal(day.refunds.count, 1);
  });
});

describe("linked account refunds and write-off", () => {
  const payment = ledger({
    id: "pay",
    type: "payment",
    amount: -10000,
    paymentMethod: "card",
    description: "Received from Acme",
    postedAt: "2026-10-10T08:00:00.000Z",
  });
  const firstRefund = ledger({
    id: "r1",
    type: "refund",
    amount: 2000,
    paymentMethod: "card",
    originalTransactionId: "pay",
    postedAt: "2026-10-10T09:00:00.000Z",
  });
  const secondRefund = ledger({
    id: "r2",
    type: "refund",
    amount: 1500,
    paymentMethod: "card",
    originalTransactionId: "pay",
    postedAt: "2026-10-10T10:00:00.000Z",
  });

  it("keeps the refund cap on the source payment", () => {
    const rows = buildAccountPayments({
      rows: [payment, firstRefund, secondRefund],
      actorNames: { ada: "Ada Manager" },
      canRefund: true,
    });
    const source = rows.find((row) => row.id === "pay");
    assert.equal(source?.refundedTotal, 3500);
    assert.equal(source?.remainingRefundable, 6500);
    assert.equal(source?.paymentState, "partially_refunded");
    assert.equal(source?.canRefund, true);
    assert.equal(source?.amount, -10000);
    assert.equal(source?.displayAmount, 10000);
    const refund = rows.find((row) => row.id === "r1");
    assert.equal(refund?.canRefund, false);
    assert.equal(refund?.canViewSource, true);
    assert.equal(refund?.sourcePaymentId, "pay");
  });

  it("reduces the refundable remainder by active payment allocations", () => {
    const rows = buildAccountPayments({
      rows: [payment],
      canRefund: true,
      allocatedByPayment: { pay: 8000 },
    });
    const source = rows.find((row) => row.id === "pay");
    assert.equal(source?.allocatedTotal, 8000);
    assert.equal(source?.remainingRefundable, 2000);
    assert.equal(source?.canRefund, true);
    const blocked = buildAccountPayments({
      rows: [payment],
      canRefund: true,
      allocatedByPayment: { pay: 10000 },
    });
    assert.equal(blocked.find((row) => row.id === "pay")?.remainingRefundable, 0);
    assert.equal(blocked.find((row) => row.id === "pay")?.canRefund, false);
  });

  it("stops further refunds when the source is fully refunded", () => {
    const full = buildAccountPayments({
      rows: [
        payment,
        ledger({
          id: "full",
          type: "refund",
          amount: 10000,
          paymentMethod: "card",
          originalTransactionId: "pay",
        }),
      ],
      canRefund: true,
    });
    assert.equal(full.find((row) => row.id === "pay")?.paymentState, "refunded");
    assert.equal(full.find((row) => row.id === "pay")?.canRefund, false);
    assert.equal(full.find((row) => row.id === "pay")?.remainingRefundable, 0);
  });

  it("does not let a cashier or a closed account refund, and does not refund a refund", () => {
    const closed = buildAccountPayments({
      rows: [payment, firstRefund],
      canRefund: false,
    });
    assert.equal(closed.find((row) => row.id === "pay")?.canRefund, false);
    const nested = buildAccountPayments({
      rows: [
        payment,
        firstRefund,
        ledger({
          id: "nested",
          type: "refund",
          amount: 100,
          paymentMethod: "card",
          originalTransactionId: "r1",
        }),
      ],
      canRefund: true,
    });
    assert.equal(nested.find((row) => row.id === "nested")?.canViewSource, false);
    assert.equal(nested.find((row) => row.id === "nested")?.canRefund, false);
  });

  it("projects refund and write-off balances without treating write-off as cash", () => {
    assert.equal(projectedAccountBalance(0, "refund", 2000), 2000);
    assert.equal(projectedAccountBalance(-2000, "refund", 1000), -1000);
    assert.equal(projectedAccountBalance(2000, "write_off", 2000), 0);
    assert.equal(projectedAccountBalance(2000, "write_off", 500), 1500);
    assert.equal(writeOffAllowed(2000, 2000), true);
    assert.equal(writeOffAllowed(2000, 500), true);
    assert.equal(writeOffAllowed(2000, 2000.02), false);
    assert.equal(writeOffAllowed(0, 1), false);
    assert.equal(writeOffAllowed(-40, 10), false);
    const rows = buildAccountPayments({
      rows: [
        ledger({
          id: "wo",
          type: "adjustment",
          amount: -2000,
          description: "Settlement write-off: uncollectible",
          referenceType: "settlement_write_off",
          paymentMethod: null,
        }),
      ],
      canRefund: true,
    });
    assert.equal(rows[0]?.transactionType, "write_off");
    assert.equal(rows[0]?.displayAmount, 2000);
    assert.equal(rows[0]?.paymentMethod, null);
    assert.equal(rows[0]?.hotelCashierShiftId, null);
    assert.equal(rows[0]?.canRefund, false);
    assert.equal(accountCashStampsShift({ type: "adjustment", method: null }), false);
  });
});

describe("account payment list", () => {
  function paymentRow(index: number, postedAt: string): AccountLedgerTender {
    return ledger({
      id: `pay-${index}`,
      type: "payment",
      amount: -((index + 1) * 100),
      paymentMethod: index % 2 === 0 ? "cash" : "card",
      description: index === 0 ? "Received from Acme" : `Payment ${index}`,
      postedAt,
      postedByMembershipId: index === 3 ? "ben" : "ada",
    });
  }

  it("filters, sorts, and pages tender rows without charges", () => {
    const rows = buildAccountPayments({
      rows: [
        ...Array.from({ length: 12 }, (_, index) =>
          paymentRow(index, `2026-10-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`),
        ),
        ledger({
          id: "charge",
          type: "charge",
          amount: 80,
          description: "Direct charge",
        }),
        ledger({
          id: "old-deposit",
          type: "deposit",
          amount: -40,
          paymentMethod: "cash",
          description: "Historical deposit",
          postedAt: "2026-09-01T08:00:00.000Z",
        }),
      ],
      actorNames: { ada: "Ada Cashier", ben: "Ben Manager" },
      canRefund: true,
    });
    assert.equal(
      rows.some((row) => row.id === "charge"),
      false,
    );
    const page = queryAccountPayments(rows, { page: 2, pageSize: 10, sort: "newest" });
    assert.equal(page.total, 13);
    assert.equal(page.rows.length, 3);
    assert.equal(page.scope, "lifetime");
    assert.equal(accountTenderScopeLabel(page.scope), "Account lifetime");
    const paymentsOnly = queryAccountPayments(rows, { type: "payment" });
    assert.equal(
      paymentsOnly.rows.every((row) => row.transactionType === "payment"),
      true,
    );
    assert.equal(paymentsOnly.scope, "filtered");
    const found = queryAccountPayments(rows, { search: "acme" });
    assert.equal(found.total, 1);
    const byActor = queryAccountPayments(rows, { postedBy: "ben" });
    assert.equal(byActor.total, 1);
    const byAmount = queryAccountPayments(rows, { sort: "amount", type: "payment" });
    assert.equal(byAmount.rows[0]?.displayAmount, 1200);
    const cash = queryAccountPayments(rows, { method: "cash", type: "payment" });
    assert.equal(
      cash.rows.every((row) => row.paymentMethod === "cash"),
      true,
    );
  });
});

describe("account payments UI", () => {
  it("keeps the payments tab live and history on the account workspace", () => {
    assert.match(workspace, /FinancialAccountPayments/);
    assert.match(workspace, /FinancialAccountHistory/);
    assert.match(workspace, /FinancialAccountStatement/);
    assert.match(panel, /No payments have been posted to this financial account/);
    assert.match(panel, /Receive Payment/);
    assert.match(panel, /Write Off/);
    assert.match(panel, /This payment will leave a credit balance of/);
    assert.match(panel, /Allocation summary/);
    assert.match(panel, /Allocate payment/);
    assert.match(panel, /Reverse allocation/);
    assert.match(panel, /Available to refund/);
    assert.match(panel, /Allocated amounts must be reversed before they can be refunded/);
    assert.match(panel, /canReceivePayment/);
    assert.match(panel, /canWriteOff/);
    assert.match(panel, /canRefund/);
    assert.match(panel, /This cash payment will be included in your open cashier shift/);
    assert.match(panel, /No open cashier shift/);
    assert.doesNotMatch(
      panel,
      /Record Deposit|City Ledger|Adjust Balance|Reopen|Post Charge|Due date|Overdue/i,
    );
    assert.doesNotMatch(panel, /hotel_cashier_shift_id|hotelCashierShiftId/);
    assert.doesNotMatch(workspace, /Reopen/);
  });
});
