import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeRmBill } from "./rm-tax.ts";
import {
  assertOrderAdjustable,
  authorizeRmAdjustConfirm,
  canAttemptRmAdjust,
  canCompleteCompedOrder,
  canSubmitCompConfirm,
  canSubmitDiscountConfirm,
  capDiscountToEligible,
  computeAdjustedRmBill,
  eligibleMerchandiseAfterComps,
  payableWasNow,
  resolveCompAmount,
  resolveDiscountAmount,
} from "./rm-adjust.ts";

const EXCLUSIVE = {
  taxRate: 15,
  taxInclusive: false,
  serviceEnabled: true,
  serviceRate: 10,
};

const INCLUSIVE = {
  taxRate: 15,
  taxInclusive: true,
  serviceEnabled: true,
  serviceRate: 10,
};

describe("RM adjust authorization", () => {
  it("denies cashiers by default (no explicit grant)", () => {
    assert.equal(canAttemptRmAdjust("cashier", false), false);
    const decision = authorizeRmAdjustConfirm({
      role: "cashier",
      staffGranted: false,
      action: "rm_discount",
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.code, "UNAUTHORIZED");
  });

  it("denies waiters, kitchen and accountants even if a grant flag is set", () => {
    assert.equal(canAttemptRmAdjust("waiter", true), false);
    assert.equal(canAttemptRmAdjust("kitchen", true), false);
    assert.equal(canAttemptRmAdjust("accountant", true), false);
    const decision = authorizeRmAdjustConfirm({
      role: "waiter",
      staffGranted: true,
      action: "rm_comp",
    });
    assert.equal(decision.ok, false);
  });

  it("allows owner/manager without a cashier grant", () => {
    assert.equal(canAttemptRmAdjust("owner", false), true);
    assert.equal(canAttemptRmAdjust("manager", false), true);
    const decision = authorizeRmAdjustConfirm({
      role: "manager",
      staffGranted: false,
      action: "rm_discount",
    });
    assert.deepEqual(decision, { ok: true });
  });

  it("allows an explicitly granted cashier", () => {
    assert.equal(canAttemptRmAdjust("cashier", true), true);
    const decision = authorizeRmAdjustConfirm({
      role: "cashier",
      staffGranted: true,
      action: "rm_comp",
    });
    assert.deepEqual(decision, { ok: true });
  });
});

describe("unpaid-only and paid-block", () => {
  it("rejects a paid check and points at Refund", () => {
    const result = assertOrderAdjustable({
      paidAt: "2026-09-11T12:00:00Z",
      billingMethod: "direct",
      roomPosted: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "ORDER_PAID");
      assert.match(result.message, /Refund/);
    }
  });

  it("rejects a room-charged check", () => {
    const result = assertOrderAdjustable({
      paidAt: null,
      billingMethod: "room_charge",
      roomPosted: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "ORDER_PAID");
  });

  it("rejects a completed comp", () => {
    const result = assertOrderAdjustable({
      paidAt: "2026-09-11T12:00:00Z",
      billingMethod: "comp",
      roomPosted: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "ORDER_PAID");
  });

  it("allows an unpaid open check", () => {
    const result = assertOrderAdjustable({
      paidAt: null,
      billingMethod: null,
      roomPosted: false,
    });
    assert.deepEqual(result, { ok: true });
  });
});

describe("discount caps and replace", () => {
  it("accepts a percent 0–100 of eligible merchandise after comps", () => {
    const ten = resolveDiscountAmount({ type: "percent", value: 10, eligibleMerchandise: 80 });
    assert.deepEqual(ten, { ok: true, amount: 8 });
    const full = resolveDiscountAmount({ type: "percent", value: 100, eligibleMerchandise: 80 });
    assert.deepEqual(full, { ok: true, amount: 80 });
    const zero = resolveDiscountAmount({ type: "percent", value: 0, eligibleMerchandise: 80 });
    assert.deepEqual(zero, { ok: true, amount: 0 });
  });

  it("rejects a percent outside 0–100", () => {
    const over = resolveDiscountAmount({ type: "percent", value: 101, eligibleMerchandise: 80 });
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.code, "INVALID_PERCENT");
    const under = resolveDiscountAmount({ type: "percent", value: -1, eligibleMerchandise: 80 });
    assert.equal(under.ok, false);
  });

  it("rejects an amount larger than eligible merchandise after comps", () => {
    const result = resolveDiscountAmount({ type: "amount", value: 81, eligibleMerchandise: 80 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "OVER_DISCOUNT");
  });

  it("accepts an amount at the eligible cap", () => {
    const result = resolveDiscountAmount({ type: "amount", value: 80, eligibleMerchandise: 80 });
    assert.deepEqual(result, { ok: true, amount: 80 });
  });

  it("replaces a previous discount instead of stacking", () => {
    const first = resolveDiscountAmount({ type: "percent", value: 10, eligibleMerchandise: 100 });
    const second = resolveDiscountAmount({ type: "amount", value: 25, eligibleMerchandise: 100 });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok) assert.equal(first.amount, 10);
    if (second.ok) assert.equal(second.amount, 25);
  });

  it("caps a surviving percent discount after comps reduce eligible merchandise", () => {
    const capped = capDiscountToEligible({
      type: "percent",
      value: 50,
      currentAmount: 50,
      eligibleMerchandise: 40,
    });
    assert.deepEqual(capped, { type: "percent", value: 50, amount: 20 });
  });
});

describe("line and entire-check comps", () => {
  it("comps selected remaining line amounts", () => {
    const result = resolveCompAmount({
      scope: "lines",
      merchandise: 100,
      selectedLineRemainings: [12, 8],
      alreadyComped: 10,
    });
    assert.deepEqual(result, { ok: true, amount: 20, nextCompTotal: 30 });
  });

  it("comps the remaining check and does not invent extra merchandise", () => {
    const result = resolveCompAmount({
      scope: "check",
      merchandise: 100,
      selectedLineRemainings: [],
      alreadyComped: 25,
    });
    assert.deepEqual(result, { ok: true, amount: 75, nextCompTotal: 100 });
  });

  it("rejects a second entire-check comp", () => {
    const result = resolveCompAmount({
      scope: "check",
      merchandise: 100,
      selectedLineRemainings: [],
      alreadyComped: 100,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "ALREADY_COMPED");
  });

  it("rejects a line that is already fully comped", () => {
    const result = resolveCompAmount({
      scope: "lines",
      merchandise: 100,
      selectedLineRemainings: [0],
      alreadyComped: 40,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "LINE_OVER");
  });
});

describe("recalc merchandise → discount/comp → tax → service → payable", () => {
  it("exclusive 15% + service 10% after a $20 amount discount", () => {
    const bill = computeAdjustedRmBill({
      merchandiseSubtotal: 100,
      settings: EXCLUSIVE,
      discountAmount: 20,
      compAmount: 0,
    });
    assert.equal(bill.merchandiseSubtotal, 100);
    assert.equal(bill.discountAmount, 20);
    assert.equal(bill.adjustedMerchandise, 80);
    assert.equal(bill.taxAmount, 12);
    assert.equal(bill.serviceAmount, 8);
    assert.equal(bill.payable, 100);
    assert.equal(bill.taxLabel, "Tax (added)");
  });

  it("inclusive 15% + service 10% after a $20 amount discount (no double-add)", () => {
    const bill = computeAdjustedRmBill({
      merchandiseSubtotal: 100,
      settings: INCLUSIVE,
      discountAmount: 20,
      compAmount: 0,
    });
    assert.equal(bill.adjustedMerchandise, 80);
    assert.equal(bill.taxAmount, 10.43);
    assert.equal(bill.merchandiseNet, 69.57);
    assert.equal(bill.serviceAmount, 6.96);
    assert.equal(bill.payable, 86.96);
    assert.notEqual(bill.payable, bill.adjustedMerchandise + bill.taxAmount);
  });

  it("applies service to net AFTER a line comp, not the original merchandise", () => {
    const bill = computeRmBill(100, EXCLUSIVE, { discountAmount: 0, compAmount: 40 });
    assert.equal(bill.adjustedMerchandise, 60);
    assert.equal(bill.taxAmount, 9);
    assert.equal(bill.serviceAmount, 6);
    assert.equal(bill.payable, 75);
  });

  it("entire-check comp drives payable to 0", () => {
    const bill = computeAdjustedRmBill({
      merchandiseSubtotal: 100,
      settings: EXCLUSIVE,
      discountAmount: 0,
      compAmount: 100,
    });
    assert.equal(bill.adjustedMerchandise, 0);
    assert.equal(bill.taxAmount, 0);
    assert.equal(bill.serviceAmount, 0);
    assert.equal(bill.payable, 0);
  });

  it("replacing a 10% discount with 25% uses the new amount only", () => {
    const first = computeAdjustedRmBill({
      merchandiseSubtotal: 100,
      settings: EXCLUSIVE,
      discountAmount: 10,
    });
    const second = computeAdjustedRmBill({
      merchandiseSubtotal: 100,
      settings: EXCLUSIVE,
      discountAmount: 25,
    });
    assert.equal(first.discountAmount, 10);
    assert.equal(second.discountAmount, 25);
    assert.equal(second.adjustedMerchandise, 75);
    assert.equal(second.taxAmount, 11.25);
    assert.equal(second.serviceAmount, 7.5);
    assert.equal(second.payable, 93.75);
  });

  it("eligible merchandise after comps is what the discount cap uses", () => {
    assert.equal(eligibleMerchandiseAfterComps(100, 30), 70);
    const over = resolveDiscountAmount({ type: "amount", value: 71, eligibleMerchandise: 70 });
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.code, "OVER_DISCOUNT");
  });
});

describe("zero-payable complete and confirm lock", () => {
  it("allows Complete (comped) only when payable is 0 on an adjustable check", () => {
    assert.equal(canCompleteCompedOrder({ payable: 0, adjustable: true }), true);
    assert.equal(canCompleteCompedOrder({ payable: 0.001, adjustable: true }), true);
    assert.equal(canCompleteCompedOrder({ payable: 1, adjustable: true }), false);
    assert.equal(canCompleteCompedOrder({ payable: 0, adjustable: false }), false);
  });

  it("shows payable was→now without inventing a live payable", () => {
    assert.deepEqual(payableWasNow(125, 100), { was: 125, now: 100, delta: -25 });
  });

  it("disables Confirm until reason and a positive amount are present", () => {
    const discount = { reason: "", amount: 8, submitting: false };
    assert.equal(canSubmitDiscountConfirm(discount), false);
    assert.equal(canSubmitDiscountConfirm({ ...discount, reason: "VIP" }), true);
    assert.equal(canSubmitDiscountConfirm({ ...discount, reason: "VIP", submitting: true }), false);
    assert.equal(canSubmitDiscountConfirm({ ...discount, reason: "VIP", amount: 0 }), false);

    const comp = { reason: "Staff meal", amount: 12, hasSelection: false, submitting: false };
    assert.equal(canSubmitCompConfirm(comp), false);
    assert.equal(canSubmitCompConfirm({ ...comp, hasSelection: true }), true);
  });
});
