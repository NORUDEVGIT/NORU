import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authorizeClosePosShift,
  canCloseAnyPosShift,
  canStartCashUp,
  canSubmitCloseShift,
  cashVariance,
  interpretClosePosShiftFailure,
  isUnpaidTillDraft,
  recomputeExpectedCash,
  whoseDrawerLabel,
} from "./rm-cash-up.ts";

describe("close authorization", () => {
  it("denies a cashier closing someone else's shift", () => {
    const decision = authorizeClosePosShift({
      role: "cashier",
      actorMembershipId: "cashier-1",
      shiftMembershipId: "cashier-2",
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.code, "UNAUTHORIZED");
      assert.match(decision.message, /own/i);
    }
  });

  it("allows a cashier to close their own shift", () => {
    const decision = authorizeClosePosShift({
      role: "cashier",
      actorMembershipId: "cashier-1",
      shiftMembershipId: "cashier-1",
    });
    assert.deepEqual(decision, { ok: true });
  });

  it("allows owner/manager to close any open shift", () => {
    assert.equal(canCloseAnyPosShift("owner"), true);
    assert.equal(canCloseAnyPosShift("manager"), true);
    assert.equal(canCloseAnyPosShift("cashier"), false);
    assert.equal(canCloseAnyPosShift("waiter"), false);
    assert.deepEqual(
      authorizeClosePosShift({
        role: "manager",
        actorMembershipId: "mgr-1",
        shiftMembershipId: "cashier-9",
      }),
      { ok: true },
    );
  });

  it("maps an unauthorized RPC/authz failure without inventing success", () => {
    const outcome = interpretClosePosShiftFailure("UNAUTHORIZED: You can only close your own cashier shift.");
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, "UNAUTHORIZED");
  });
});

describe("already closed", () => {
  it("rejects a second close with a clear already-closed message", () => {
    const outcome = interpretClosePosShiftFailure("SHIFT_ALREADY_CLOSED");
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, "SHIFT_ALREADY_CLOSED");
    assert.match(outcome.message, /already closed/i);
    assert.match(outcome.message, /open a new/i);
  });
});

describe("expected cash formula and variance", () => {
  it("recomputes expected as opening + cash payments − cash refunds", () => {
    assert.equal(
      recomputeExpectedCash({ openingCash: 100, cashPayments: 45.5, cashRefunds: 10 }),
      135.5,
    );
  });

  it("treats a missing opening float as zero and does not trust a stale stored expected", () => {
    assert.equal(
      recomputeExpectedCash({ openingCash: null, cashPayments: 20, cashRefunds: 0 }),
      20,
    );
    const staleStoredExpected = 999;
    const recomputed = recomputeExpectedCash({
      openingCash: 50,
      cashPayments: 10,
      cashRefunds: 0,
    });
    assert.equal(recomputed, 60);
    assert.notEqual(recomputed, staleStoredExpected);
  });

  it("labels Over / Short / Exact from counted − expected", () => {
    assert.deepEqual(cashVariance({ counted: 80, expected: 75 }), {
      amount: 5,
      kind: "over",
      label: "Over",
    });
    assert.deepEqual(cashVariance({ counted: 70, expected: 75 }), {
      amount: -5,
      kind: "short",
      label: "Short",
    });
    assert.deepEqual(cashVariance({ counted: 75, expected: 75 }), {
      amount: 0,
      kind: "exact",
      label: "Exact",
    });
  });
});

describe("unpaid till draft block", () => {
  it("blocks cash-up when the live cart has lines", () => {
    assert.equal(isUnpaidTillDraft({ lineCount: 2, hasUnpaidPlacedSale: false }), true);
    assert.equal(canStartCashUp({ lineCount: 2, hasUnpaidPlacedSale: false }), false);
  });

  it("blocks cash-up when a placed sale is still unpaid", () => {
    assert.equal(isUnpaidTillDraft({ lineCount: 0, hasUnpaidPlacedSale: true }), true);
    assert.equal(canStartCashUp({ lineCount: 0, hasUnpaidPlacedSale: true }), false);
  });

  it("allows cash-up only after the till draft is finished or cleared", () => {
    assert.equal(isUnpaidTillDraft({ lineCount: 0, hasUnpaidPlacedSale: false }), false);
    assert.equal(canStartCashUp({ lineCount: 0, hasUnpaidPlacedSale: false }), true);
  });
});

describe("confirm lock and whose-drawer", () => {
  it("disables Close shift while submitting or when counted cash is invalid", () => {
    assert.equal(canSubmitCloseShift({ closingCash: 10, submitting: false }), true);
    assert.equal(canSubmitCloseShift({ closingCash: 0, submitting: false }), true);
    assert.equal(canSubmitCloseShift({ closingCash: 10, submitting: true }), false);
    assert.equal(canSubmitCloseShift({ closingCash: -1, submitting: false }), false);
  });

  it("labels the drawer as Your shift or Closing: {Name}", () => {
    assert.equal(whoseDrawerLabel({ isOwn: true, cashierName: "Ada" }), "Your shift");
    assert.equal(whoseDrawerLabel({ isOwn: false, cashierName: "Ada" }), "Closing: Ada");
  });
});
