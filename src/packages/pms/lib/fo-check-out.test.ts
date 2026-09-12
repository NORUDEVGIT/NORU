import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { shouldSuppressRestaurantPmsRail } from "./front-office-shell.ts";
import {
  CASHIERING_REFUND_PATH,
  CLOSE_REQUIRED_BANNER,
  CREDIT_BLOCK_BANNER,
  EMAIL_NOT_CONFIGURED_MESSAGE,
  FOLIO_LEFT_OPEN_CHIP,
  OVERRIDE_CREDIT_TITLE,
  OVERRIDE_UNPAID_TITLE,
  REFUND_IN_CASHIERING_CTA,
  SETTLE_REQUIRED_BANNER,
  canCompleteCheckOut,
  canContinueClose,
  canContinueFolio,
  canContinueSettle,
  canContinueStay,
  cashieringRefundHref,
  formatCheckoutDate,
  isCreditBalance,
  isFolioSettled,
  isOwesBalance,
  mapCashierShiftError,
  mapSettlementMethod,
  overrideKindForBalance,
  paymentAmountAllowed,
  platformEmailConfigured,
  shouldCloseFolioAtCheckout,
} from "./fo-check-out.ts";

describe("FO-FS2 policy A settle gate", () => {
  it("blocks Continue/Complete while |balance| ≥ 0.01 unless override", () => {
    assert.equal(isFolioSettled(0), true);
    assert.equal(isFolioSettled(0.004), true);
    assert.equal(isFolioSettled(0.01), false);
    assert.equal(isOwesBalance(12.5), true);
    assert.equal(canContinueSettle({ balance: 12.5, override: false }), false);
    assert.equal(
      canCompleteCheckOut({ stayOk: true, folioOk: true, settleOk: false, closeOk: false }),
      false,
    );

    assert.equal(canContinueSettle({ balance: 0, override: false }), true);
    assert.equal(canContinueSettle({ balance: 40, override: true }), true);
    assert.equal(SETTLE_REQUIRED_BANNER, "Settle the folio or request a supervisor override.");
  });

  it("maps transfer to bank_transfer and cashier shift errors", () => {
    assert.equal(mapSettlementMethod("transfer"), "bank_transfer");
    assert.equal(mapSettlementMethod("cash"), "cash");
    assert.equal(mapCashierShiftError("SHIFT_NOT_FOUND"), "Open a cashier shift to post.");
    assert.equal(paymentAmountAllowed(10, 10), true);
    assert.equal(paymentAmountAllowed(10.01, 10), false);
    assert.equal(paymentAmountAllowed(0, 10), false);
  });
});

describe("FO-FS2 credit block", () => {
  it("treats credit as a Cashiering refund, not an FO settle", () => {
    assert.equal(isCreditBalance(-0.01), true);
    assert.equal(isCreditBalance(0), false);
    assert.equal(canContinueSettle({ balance: -18, override: false }), false);
    assert.equal(canContinueSettle({ balance: -18, override: true }), true);
    assert.equal(overrideKindForBalance(-18), "credit");
    assert.equal(overrideKindForBalance(22), "unpaid");
    assert.equal(overrideKindForBalance(0), null);
    assert.equal(REFUND_IN_CASHIERING_CTA, "Refund in Cashiering");
    assert.equal(CASHIERING_REFUND_PATH, "/restaurant/pms/cashiering");
    assert.equal(cashieringRefundHref("F-100"), "/restaurant/pms/cashiering?tab=folios&folio=F-100");
    assert.match(CREDIT_BLOCK_BANNER, /Refund in Cashiering/);
  });
});

describe("FO-FS2 close at zero", () => {
  it("requires close only when settled, open, and not overridden", () => {
    assert.equal(
      shouldCloseFolioAtCheckout({ balance: 0, override: false, folioStatus: "open" }),
      true,
    );
    assert.equal(
      shouldCloseFolioAtCheckout({ balance: 0, override: false, folioStatus: "closed" }),
      false,
    );
    assert.equal(canContinueClose({ balance: 0, override: false, folioStatus: "closed" }), true);
    assert.equal(canContinueClose({ balance: 0, override: false, folioStatus: "open" }), false);
    assert.equal(CLOSE_REQUIRED_BANNER, "Close the folio at zero before completing check-out.");
    assert.equal(canContinueFolio({ folioId: null }), false);
    assert.equal(canContinueFolio({ folioId: "folio-1" }), true);
    assert.equal(canContinueStay({ loaded: true, status: "checked_in" }), true);
    assert.equal(canContinueStay({ loaded: true, status: "confirmed" }), false);
    const dated = formatCheckoutDate("2026-09-12");
    assert.match(dated, /12/);
    assert.match(dated, /2026/);
  });
});

describe("FO-FS2 override leaves folio open", () => {
  it("never closes a non-zero or overridden folio", () => {
    assert.equal(
      shouldCloseFolioAtCheckout({ balance: 40, override: true, folioStatus: "open" }),
      false,
    );
    assert.equal(
      shouldCloseFolioAtCheckout({ balance: -12, override: true, folioStatus: "open" }),
      false,
    );
    assert.equal(
      shouldCloseFolioAtCheckout({ balance: 0, override: true, folioStatus: "open" }),
      false,
    );
    assert.equal(canContinueClose({ balance: 40, override: true, folioStatus: "open" }), true);
    assert.equal(
      canCompleteCheckOut({ stayOk: true, folioOk: true, settleOk: true, closeOk: true }),
      true,
    );
    assert.equal(FOLIO_LEFT_OPEN_CHIP, "Folio left open — override");
    assert.equal(OVERRIDE_UNPAID_TITLE, "Override unpaid check-out");
    assert.equal(OVERRIDE_CREDIT_TITLE, "Override credit leave open");
  });
});

describe("FO-FS0 rail lock", () => {
  it("shouldSuppressRestaurantPmsRail(\"front-office\") still true", () => {
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("cashiering"), false);
  });
});

describe("FO-FS2 email honesty", () => {
  it("disables email when platform secrets are missing", () => {
    assert.equal(platformEmailConfigured({ apiKey: null, from: null }), false);
    assert.equal(platformEmailConfigured({ apiKey: "re_x", from: "" }), false);
    assert.equal(platformEmailConfigured({ apiKey: "re_x", from: "desk@noru.test" }), true);
    assert.equal(EMAIL_NOT_CONFIGURED_MESSAGE, "Email not configured.");
  });
});

describe("FO-FS2 stepper source locks", () => {
  it("replaces soft-warn checkout and does not add Void or an FO refund form", () => {
    const dialogs = readFileSync(new URL("../components/frontoffice/front-office-dialogs.tsx", import.meta.url), "utf8");
    assert.match(dialogs, /FoCheckOutStepper/);
    assert.doesNotMatch(dialogs, /You can still check/);
    assert.doesNotMatch(dialogs, /Check out anyway/);

    const stepper = readFileSync(new URL("../components/frontoffice/fo-check-out-stepper.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(stepper, /\bVoid\b/);
    assert.doesNotMatch(stepper, /type:\s*"refund"/);
    assert.doesNotMatch(stepper, /Check out anyway/);
    assert.match(stepper, /REFUND_IN_CASHIERING_CTA/);
    assert.match(stepper, /closeFolioAtCheckout/);
    assert.match(stepper, /completeFoCheckOut/);

    const fns = readFileSync(new URL("./fo-check-out.functions.ts", import.meta.url), "utf8");
    assert.match(fns, /closeFolioAtCheckout/);
    assert.match(fns, /close_guest_folio/);
    assert.match(fns, /check_out_hotel_reservation/);
    assert.match(fns, /post_folio_transaction/);
    assert.match(fns, /_type: "payment"/);
    assert.doesNotMatch(fns, /_type: "refund"/);
    assert.doesNotMatch(fns, /fo_checkout_progress/);
  });
});
