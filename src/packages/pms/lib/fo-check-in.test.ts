import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { shouldSuppressRestaurantPmsRail } from "./front-office-shell.ts";
import {
  DEPOSIT_REQUIRED_BANNER,
  REGISTRATION_INCOMPLETE_BANNER,
  WALK_IN_CONTINUE_STEP,
  canCompleteCheckIn,
  canCompleteDeposit,
  canContinueKey,
  canContinueRegistration,
  isDepositSatisfied,
  isRegistrationComplete,
  isRoomReady,
  mapCashierShiftError,
  mapDepositMethod,
  walkInContinueStep,
} from "./fo-check-in.ts";

const blankReg = {
  fullName: "",
  phone: null,
  email: null,
  idDocumentType: null,
  idDocumentNumber: null,
};

const completeReg = {
  fullName: "Ada Smith",
  phone: "+44 20 7946 0958",
  email: null,
  idDocumentType: "passport" as const,
  idDocumentNumber: "AB123456",
};

describe("FO-FS1 registration gate", () => {
  it("registration incomplete blocks Continue unless waived", () => {
    assert.equal(isRegistrationComplete(blankReg), false);
    assert.equal(canContinueRegistration(blankReg, false), false);
    assert.equal(canContinueRegistration({ ...completeReg, phone: null, email: null }, false), false);
    assert.equal(canContinueRegistration({ ...completeReg, idDocumentNumber: "" }, false), false);
    assert.equal(canContinueRegistration(completeReg, false), true);
    assert.equal(canContinueRegistration(blankReg, true), true);
    assert.equal(REGISTRATION_INCOMPLETE_BANNER, "Complete registration or request a waiver.");
  });
});

describe("FO-FS1 deposit policy A", () => {
  it("no post + no waiver disables Complete; post or waive enables", () => {
    assert.equal(isDepositSatisfied({ postedAmount: 0, waived: false }), false);
    assert.equal(canCompleteDeposit({ postedAmount: 0, waived: false }), false);
    assert.equal(canCompleteCheckIn({ roomReady: true, registrationOk: true, depositOk: false, keyOk: true }), false);

    assert.equal(isDepositSatisfied({ postedAmount: 50, waived: false }), true);
    assert.equal(canCompleteDeposit({ postedAmount: 50, waived: false }), true);
    assert.equal(canCompleteDeposit({ postedAmount: 0, waived: true }), true);
    assert.equal(canCompleteCheckIn({ roomReady: true, registrationOk: true, depositOk: true, keyOk: true }), true);
    assert.equal(DEPOSIT_REQUIRED_BANNER, "Deposit required before check-in can finish.");
    assert.equal(mapDepositMethod("transfer"), "bank_transfer");
    assert.equal(mapCashierShiftError("SHIFT_NOT_FOUND"), "Open a cashier shift to post.");
  });
});

describe("FO-FS1 key gate", () => {
  it("key missing blocks unless waived", () => {
    assert.equal(canContinueKey({ accessType: null, identifier: null, waived: false }), false);
    assert.equal(canContinueKey({ accessType: "physical_key", identifier: "", waived: false }), false);
    assert.equal(canContinueKey({ accessType: "physical_key", identifier: "K-12", waived: false }), true);
    assert.equal(canContinueKey({ accessType: null, identifier: null, waived: true }), true);
  });
});

describe("FO-FS1 room readiness", () => {
  it("only available + clean/inspected rooms are ready", () => {
    assert.equal(isRoomReady({ status: "available", housekeepingStatus: "clean" }).ready, true);
    assert.equal(isRoomReady({ status: "available", housekeepingStatus: "inspected" }).ready, true);
    assert.equal(isRoomReady({ status: "available", housekeepingStatus: "dirty" }).ready, false);
    assert.equal(isRoomReady({ status: "available", housekeepingStatus: "pickup" }).ready, false);
    assert.equal(isRoomReady({ status: "out_of_order", housekeepingStatus: "clean" }).ready, false);
    assert.equal(isRoomReady({ status: "out_of_service", housekeepingStatus: "inspected" }).ready, false);
    assert.equal(isRoomReady(null).ready, false);
  });
});

describe("FO-FS1 walk-in continue", () => {
  it("walk-in create path must not invoke check-in; continue starts at B", () => {
    assert.equal(walkInContinueStep(), "registration");
    assert.equal(WALK_IN_CONTINUE_STEP, "registration");

    const dialogs = readFileSync(new URL("../components/frontoffice/front-office-dialogs.tsx", import.meta.url), "utf8");
    const walkInFn = dialogs.slice(dialogs.indexOf("export function WalkInDialog"));
    assert.match(walkInFn, /status: "confirmed"/);
    assert.doesNotMatch(walkInFn, /checkInReservation/);
    assert.doesNotMatch(walkInFn, /checkIn\(/);
    assert.match(walkInFn, /onCreated/);
  });
});

describe("FO-FS0 rail lock", () => {
  it("shouldSuppressRestaurantPmsRail(\"front-office\") still true", () => {
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
  });
});

describe("FO-FS1 stepper source locks", () => {
  it("stepper source has no Void / settle / refund actions", () => {
    const stepper = readFileSync(new URL("../components/frontoffice/fo-check-in-stepper.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(stepper, /\bVoid\b/);
    assert.doesNotMatch(stepper, /\bsettle\b/i);
    assert.doesNotMatch(stepper, /\brefund\b/i);
  });
});
