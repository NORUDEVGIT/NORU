import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertRefundableAmount,
  authorizeRmRefundConfirm,
  canAttemptRmRefund,
  canSubmitRefundConfirm,
  interpretRoomReverseResult,
  remainingRefundable,
  restaurantPaymentStatus,
} from "./rm-refunds.ts";

describe("RM refund authorization", () => {
  it("denies cashiers by default (no explicit grant)", () => {
    assert.equal(canAttemptRmRefund("cashier", false), false);
    const decision = authorizeRmRefundConfirm({
      role: "cashier",
      cashierGranted: false,
      method: "card",
      hasOpenShift: true,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.code, "UNAUTHORIZED");
  });

  it("denies waiters, kitchen and accountants even if a grant flag is set", () => {
    assert.equal(canAttemptRmRefund("waiter", true), false);
    assert.equal(canAttemptRmRefund("kitchen", true), false);
    assert.equal(canAttemptRmRefund("accountant", true), false);
    const decision = authorizeRmRefundConfirm({
      role: "waiter",
      cashierGranted: true,
      method: "cash",
      hasOpenShift: true,
    });
    assert.equal(decision.ok, false);
  });

  it("allows owner/manager without a cashier grant", () => {
    assert.equal(canAttemptRmRefund("owner", false), true);
    assert.equal(canAttemptRmRefund("manager", false), true);
    const decision = authorizeRmRefundConfirm({
      role: "manager",
      cashierGranted: false,
      method: "card",
      hasOpenShift: false,
    });
    assert.deepEqual(decision, { ok: true, correctionWithoutShift: false });
  });

  it("keeps room reverse manager-only even if a cashier was granted refunds", () => {
    const decision = authorizeRmRefundConfirm({
      role: "cashier",
      cashierGranted: true,
      method: "room",
      hasOpenShift: true,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.code, "UNAUTHORIZED");
  });

  it("blocks a granted cashier from any refund when there is no open shift", () => {
    const card = authorizeRmRefundConfirm({
      role: "cashier",
      cashierGranted: true,
      method: "card",
      hasOpenShift: false,
    });
    assert.equal(card.ok, false);
    if (!card.ok) assert.equal(card.code, "CASHIER_SHIFT_REQUIRED");
  });

  it("allows an explicitly granted cashier with an open shift", () => {
    const decision = authorizeRmRefundConfirm({
      role: "cashier",
      cashierGranted: true,
      method: "cash",
      hasOpenShift: true,
    });
    assert.deepEqual(decision, { ok: true, correctionWithoutShift: false });
  });

  it("blocks cashiers from cash refunds when there is no open shift", () => {
    const decision = authorizeRmRefundConfirm({
      role: "cashier",
      cashierGranted: true,
      method: "cash",
      hasOpenShift: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.code, "CASHIER_SHIFT_REQUIRED");
  });

  it("lets a manager record a no-open-shift cash correction", () => {
    const decision = authorizeRmRefundConfirm({
      role: "owner",
      cashierGranted: false,
      method: "cash",
      hasOpenShift: false,
    });
    assert.deepEqual(decision, { ok: true, correctionWithoutShift: true });
  });
});

describe("over-refund and double-refund caps", () => {
  it("rejects a refund larger than the sale remaining", () => {
    const result = assertRefundableAmount({
      amount: 12,
      saleRemaining: 10,
      tenderRemaining: 12,
      lineAmounts: [12],
      lineRemainings: [12],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "OVER_REFUND");
  });

  it("rejects a second refund once remaining is zero", () => {
    const result = assertRefundableAmount({
      amount: 4,
      saleRemaining: 0,
      tenderRemaining: 0,
      lineAmounts: [4],
      lineRemainings: [0],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "DOUBLE_REFUND");
  });

  it("rejects a refund larger than the selected tender remaining", () => {
    const result = assertRefundableAmount({
      amount: 8,
      saleRemaining: 12,
      tenderRemaining: 5,
      lineAmounts: [8],
      lineRemainings: [8],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "TENDER_OVER");
  });

  it("accepts a selected-line refund within both caps", () => {
    const result = assertRefundableAmount({
      amount: 6,
      saleRemaining: 10,
      tenderRemaining: 7,
      lineAmounts: [4, 2],
      lineRemainings: [4, 6],
    });
    assert.deepEqual(result, { ok: true, amount: 6 });
  });

  it("computes remaining refundable after a partial refund", () => {
    assert.equal(remainingRefundable(20, 7.5), 12.5);
    assert.equal(remainingRefundable(20, 20), 0);
  });
});

describe("room reverse failure", () => {
  it("treats a failed reverse as blocking with retry and never as success", () => {
    const outcome = interpretRoomReverseResult({
      ok: false,
      message: "FOLIO_CLOSED: that folio is closed.",
    });
    assert.equal(outcome.success, false);
    if (!outcome.success) {
      assert.equal(outcome.retry, true);
      assert.match(outcome.message, /folio/i);
    }
  });

  it("does not invent success when the reverse payload is incomplete", () => {
    const outcome = interpretRoomReverseResult({ ok: true });
    assert.equal(outcome.success, false);
    if (!outcome.success) assert.equal(outcome.retry, true);
  });

  it("returns success only after a confirmed reverse amount", () => {
    const outcome = interpretRoomReverseResult({ ok: true, amount: 24 });
    assert.deepEqual(outcome, { success: true, amount: 24 });
  });
});

describe("payment badges and confirm lock", () => {
  it("derives Paid / Partially refunded / Refunded without using kitchen status", () => {
    assert.equal(
      restaurantPaymentStatus({
        paidAt: "2026-09-10T12:00:00Z",
        billingMethod: "direct",
        roomPosted: false,
        total: 10,
        refundedAmount: 0,
      }),
      "paid",
    );
    assert.equal(
      restaurantPaymentStatus({
        paidAt: "2026-09-10T12:00:00Z",
        billingMethod: "direct",
        roomPosted: false,
        total: 10,
        refundedAmount: 4,
      }),
      "partially_refunded",
    );
    assert.equal(
      restaurantPaymentStatus({
        paidAt: "2026-09-10T12:00:00Z",
        billingMethod: "direct",
        roomPosted: false,
        total: 10,
        refundedAmount: 10,
      }),
      "refunded",
    );
  });

  it("disables Confirm until reason, selection and card honesty are present", () => {
    const base = {
      reason: "",
      amount: 5,
      hasSelection: true,
      tenderSelected: true,
      cardAcknowledged: false,
      method: "card" as const,
      submitting: false,
    };
    assert.equal(canSubmitRefundConfirm(base), false);
    assert.equal(canSubmitRefundConfirm({ ...base, reason: "Wrong item" }), false);
    assert.equal(canSubmitRefundConfirm({ ...base, reason: "Wrong item", cardAcknowledged: true }), true);
    assert.equal(
      canSubmitRefundConfirm({ ...base, reason: "Wrong item", cardAcknowledged: true, submitting: true }),
      false,
    );
  });
});
