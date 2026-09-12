import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { shouldSuppressRestaurantPmsRail } from "./front-office-shell.ts";
import {
  CANCEL_FEE_DESCRIPTION,
  CASHIER_SHIFT_REQUIRED_MESSAGE,
  CREATED_BY_UNKNOWN,
  FEE_REQUIRED_BANNER,
  NO_CANCEL_FEE_REQUIRED,
  NO_NOSHOW_FEE_REQUIRED,
  NOSHOW_FEE_DESCRIPTION,
  REFUND_IN_CASHIERING_CTA,
  WALK_INS_EMPTY,
  canCompleteCancel,
  canCompleteNoShow,
  canContinueMoney,
  canContinueReason,
  cashieringRefundHref,
  feeAmountAllowed,
  filterWalkInsHistory,
  folioHasPostedFee,
  isFeeSatisfied,
  isReasonComplete,
  mapCashierShiftError,
  suggestFirstNight,
  walkInCreatedByLabel,
} from "./fo-cancel-noshow.ts";

describe("FO-FS3 policy A fee gating", () => {
  it("blocks Confirm when a required fee is neither posted nor waived", () => {
    assert.equal(isFeeSatisfied({ required: true, posted: false, waived: false }), false);
    assert.equal(canContinueMoney({ required: true, posted: false, waived: false }), false);
    assert.equal(canCompleteCancel({ reasonOk: true, feeOk: false }), false);
    assert.equal(canCompleteNoShow({ reasonOk: true, feeOk: false }), false);
    assert.equal(FEE_REQUIRED_BANNER, "Post the fee or request a supervisor waiver.");
  });

  it("enables Confirm after a posted charge or a supervisor waive", () => {
    assert.equal(isFeeSatisfied({ required: true, posted: true, waived: false }), true);
    assert.equal(isFeeSatisfied({ required: true, posted: false, waived: true }), true);
    assert.equal(canCompleteCancel({ reasonOk: true, feeOk: true }), true);
    assert.equal(canCompleteNoShow({ reasonOk: true, feeOk: true }), true);
    assert.equal(canContinueReason("abc"), true);
    assert.equal(isReasonComplete("ab"), false);
    assert.equal(feeAmountAllowed(12.5), true);
    assert.equal(feeAmountAllowed(0), false);
  });
});

describe("FO-FS3 fee-required Off path", () => {
  it("allows Continue without post or waive when the property switch is off", () => {
    assert.equal(isFeeSatisfied({ required: false, posted: false, waived: false }), true);
    assert.equal(canContinueMoney({ required: false, posted: false, waived: false }), true);
    assert.equal(canCompleteCancel({ reasonOk: true, feeOk: true }), true);
    assert.equal(NO_CANCEL_FEE_REQUIRED, "No cancel fee required");
    assert.equal(NO_NOSHOW_FEE_REQUIRED, "No no-show charge required");
  });
});

describe("FO-FS3 charge-before-status", () => {
  it("does not treat cancel or no-show as complete when the fee is unsatisfied", () => {
    assert.equal(canCompleteCancel({ reasonOk: true, feeOk: false }), false);
    assert.equal(canCompleteNoShow({ reasonOk: true, feeOk: false }), false);
    assert.equal(
      folioHasPostedFee([{ type: "charge", description: "Cancel fee" }], "cancel"),
      true,
    );
    assert.equal(
      folioHasPostedFee([{ type: "charge", description: "No-show charge" }], "noshow"),
      true,
    );
    assert.equal(
      folioHasPostedFee([{ type: "payment", description: "Cancel fee" }], "cancel"),
      false,
    );
  });

  it("complete handlers gate fee before the status flip", () => {
    const fns = readFileSync(new URL("./fo-cancel-noshow.functions.ts", import.meta.url), "utf8");
    const cancelSrc = fns.slice(fns.indexOf("export const completeFoCancel"));
    const noShowSrc = fns.slice(fns.indexOf("export const completeFoNoShow"));
    assert.ok(cancelSrc.indexOf("canCompleteCancel") < cancelSrc.indexOf('status: "cancelled"'));
    assert.ok(noShowSrc.indexOf("canCompleteNoShow") < noShowSrc.indexOf("mark_hotel_reservation_no_show"));
    assert.match(fns, /postCancelOrNoShowFee/);
    assert.match(fns, /_type: "charge"/);
    assert.match(fns, /CANCEL_FEE_DESCRIPTION|Cancel fee/);
    assert.match(fns, /NOSHOW_FEE_DESCRIPTION|No-show charge/);
    assert.doesNotMatch(fns, /_type: "refund"/);
    assert.doesNotMatch(fns, /forfeit/);
    assert.equal(CANCEL_FEE_DESCRIPTION, "Cancel fee");
    assert.equal(NOSHOW_FEE_DESCRIPTION, "No-show charge");
  });
});

describe("FO-FS3 walk-in Complete/Incomplete filter", () => {
  it("filters by date range, completion and guest/confirmation search", () => {
    const rows = [
      {
        id: "1",
        createdAt: "2026-09-12T09:00:00.000Z",
        guestName: "Ada Smith",
        confirmationNumber: "CNF-1",
        roomNumber: "201",
        createdBy: "Reception",
        walkInIncomplete: true,
      },
      {
        id: "2",
        createdAt: "2026-09-12T11:00:00.000Z",
        guestName: "Ben Jones",
        confirmationNumber: "CNF-2",
        roomNumber: "202",
        createdBy: CREATED_BY_UNKNOWN,
        walkInIncomplete: false,
      },
      {
        id: "3",
        createdAt: "2026-09-11T11:00:00.000Z",
        guestName: "Ada Smith",
        confirmationNumber: "CNF-3",
        roomNumber: null,
        createdBy: CREATED_BY_UNKNOWN,
        walkInIncomplete: true,
      },
    ];

    const incomplete = filterWalkInsHistory(rows, {
      from: "2026-09-12",
      to: "2026-09-12",
      completion: "incomplete",
      search: "",
      timeZone: "UTC",
    });
    assert.deepEqual(incomplete.map((r) => r.id), ["1"]);

    const complete = filterWalkInsHistory(rows, {
      from: "2026-09-12",
      to: "2026-09-12",
      completion: "complete",
      search: "",
      timeZone: "UTC",
    });
    assert.deepEqual(complete.map((r) => r.id), ["2"]);

    const search = filterWalkInsHistory(rows, {
      from: "2026-09-11",
      to: "2026-09-12",
      completion: "all",
      search: "cnf-3",
      timeZone: "UTC",
    });
    assert.deepEqual(search.map((r) => r.id), ["3"]);
    assert.equal(walkInCreatedByLabel(""), CREATED_BY_UNKNOWN);
    assert.equal(WALK_INS_EMPTY, "No walk-ins in this range.");
  });
});

describe("FO-FS0 rail lock", () => {
  it("shouldSuppressRestaurantPmsRail(\"front-office\") still true", () => {
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("cashiering"), false);
  });
});

describe("FO-FS3 source locks", () => {
  it("wraps the old dialogs and does not add Void or an FO refund post", () => {
    const dialogs = readFileSync(new URL("../components/frontoffice/front-office-dialogs.tsx", import.meta.url), "utf8");
    assert.match(dialogs, /FoNoShowStepper/);
    assert.doesNotMatch(dialogs, /charges arrive in a later phase/);

    const frames = readFileSync(new URL("../components/frontoffice/front-office-frames.tsx", import.meta.url), "utf8");
    assert.match(frames, /FoCancelStepper/);
    assert.match(frames, /WalkInsHistoryFrame/);
    assert.doesNotMatch(frames, /ComingSoonChip label="Cancel fees"/);
    assert.doesNotMatch(frames, /ComingSoonChip label="No-show charges"/);
    assert.doesNotMatch(frames, /Walk-in history is Coming soon/);

    const stepper = readFileSync(
      new URL("../components/frontoffice/fo-cancel-noshow-stepper.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(stepper, /\bVoid\b/);
    assert.doesNotMatch(stepper, /type:\s*"refund"/);
    assert.doesNotMatch(stepper, /forfeit/);
    assert.match(stepper, /REFUND_IN_CASHIERING_CTA/);
    assert.match(stepper, /completeFoCancel/);
    assert.match(stepper, /completeFoNoShow/);
    assert.equal(REFUND_IN_CASHIERING_CTA, "Refund in Cashiering");
    assert.equal(cashieringRefundHref("FL-0001"), "/restaurant/pms/cashiering?tab=folios&folio=FL-0001");
    assert.equal(mapCashierShiftError("SHIFT_NOT_FOUND"), CASHIER_SHIFT_REQUIRED_MESSAGE);
  });

  it("never invents a first-night rate", () => {
    assert.equal(suggestFirstNight({ roomSubtotal: null, nightlyRates: [], nights: 2 }), null);
    assert.equal(suggestFirstNight({ roomSubtotal: 180, nightlyRates: [], nights: 2 }), null);
    assert.equal(suggestFirstNight({ roomSubtotal: 90, nightlyRates: [], nights: 1 }), 90);
    assert.equal(
      suggestFirstNight({
        roomSubtotal: 180,
        nightlyRates: [{ date: "2026-09-12", rate: 95 }],
        nights: 2,
      }),
      95,
    );
  });
});
