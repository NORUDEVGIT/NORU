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
  GUARANTEE_UNRULED,
  isDepositSatisfied,
  isRegistrationComplete,
  isRoomReady,
  mapCashierShiftError,
  mapDepositMethod,
  netDepositTowardRequirement,
  netPaymentTowardRequirement,
  projectCheckInDepositReadiness,
  snapshotRequiredAmount,
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
    assert.equal(
      canContinueRegistration({ ...completeReg, phone: null, email: null }, false),
      false,
    );
    assert.equal(canContinueRegistration({ ...completeReg, idDocumentNumber: "" }, false), false);
    assert.equal(canContinueRegistration(completeReg, false), true);
    assert.equal(canContinueRegistration(blankReg, true), true);
    assert.equal(REGISTRATION_INCOMPLETE_BANNER, "Complete registration or request a waiver.");
  });
});

describe("FO-FS1 deposit policy A", () => {
  it("counts deposit credits against the snapshot and ignores payment lines", () => {
    const depositCredit = [{ id: "dep", type: "deposit", amount: -1500 }];
    const partialDeposit = [{ id: "dep", type: "deposit", amount: -1000 }];
    const paymentOnly = [{ id: "pay", type: "payment", amount: -1500 }];

    assert.equal(netDepositTowardRequirement(depositCredit), 1500);
    assert.equal(netDepositTowardRequirement(paymentOnly), 0);
    assert.equal(
      netDepositTowardRequirement([
        { id: "dep", type: "deposit", amount: -1500 },
        { id: "ref", type: "refund", amount: 400, originalTransactionId: "dep" },
        { id: "pay", type: "payment", amount: -900 },
      ]),
      1100,
    );
    assert.equal(
      isDepositSatisfied({
        postedAmount: netDepositTowardRequirement(depositCredit),
        waived: false,
        requiredAmount: 1500,
      }),
      true,
    );
    assert.equal(
      isDepositSatisfied({
        postedAmount: netDepositTowardRequirement(paymentOnly),
        waived: false,
        requiredAmount: 1500,
      }),
      false,
    );
    assert.equal(
      isDepositSatisfied({
        postedAmount: netDepositTowardRequirement(partialDeposit),
        waived: false,
        requiredAmount: 1500,
      }),
      false,
    );
    assert.equal(
      canCompleteDeposit({ postedAmount: 1500, waived: false, requiredAmount: 1500 }),
      true,
    );
    assert.equal(
      canCompleteDeposit({ postedAmount: 1000, waived: false, requiredAmount: 1500 }),
      false,
    );
    assert.equal(isDepositSatisfied({ postedAmount: 0, waived: false, requiredAmount: 0 }), true);
    assert.equal(
      isDepositSatisfied({ postedAmount: 0, waived: false, requiredAmount: null }),
      true,
    );
    assert.equal(isDepositSatisfied({ postedAmount: 0, waived: true, requiredAmount: 1500 }), true);
    assert.equal(canCompleteDeposit({ postedAmount: 0, waived: true, requiredAmount: 1500 }), true);
    assert.equal(
      canCompleteCheckIn({ roomReady: true, registrationOk: true, depositOk: false, keyOk: true }),
      false,
    );
    assert.equal(
      canCompleteCheckIn({ roomReady: true, registrationOk: true, depositOk: true, keyOk: true }),
      true,
    );

    const readiness = projectCheckInDepositReadiness({
      folioId: "folio-1",
      folioNumber: "FL-000123",
      folioStatus: "open",
      currency: "GBP",
      requiredAmount: 1500,
      lines: paymentOnly,
      waived: false,
      guaranteeMethod: null,
      companyMasterId: "company-1",
      groupAccountMasterId: "group-1",
    });
    assert.equal(readiness.scope, "reservation");
    assert.equal(readiness.folioNumber, "FL-000123");
    assert.equal(readiness.receivedAmount, 0);
    assert.equal(readiness.satisfied, false);
    assert.equal(readiness.guaranteeSatisfied, null);
    assert.equal(readiness.guaranteeNote, GUARANTEE_UNRULED);
    assert.equal(readiness.companyMasterId, "company-1");
    const withDeposit = projectCheckInDepositReadiness({
      ...{
        folioId: "folio-1",
        folioStatus: "open",
        currency: "GBP",
        requiredAmount: 1500,
        lines: depositCredit,
        waived: false,
        guaranteeMethod: "card",
        companyMasterId: null,
        groupAccountMasterId: null,
      },
    });
    assert.equal(withDeposit.receivedAmount, 1500);
    assert.equal(withDeposit.outstanding, 0);
    assert.equal(withDeposit.satisfied, true);
    assert.equal(withDeposit.guaranteeSatisfied, null);

    assert.equal(
      netPaymentTowardRequirement([
        { id: "pay", type: "payment", amount: -1500 },
        { id: "dep", type: "deposit", amount: -500 },
      ]),
      1500,
    );

    assert.equal(snapshotRequiredAmount({ computed_amount: 1500 }), 1500);
    assert.equal(snapshotRequiredAmount({ computed_amount: 0 }), 0);
    assert.equal(snapshotRequiredAmount(null), null);
    assert.equal(snapshotRequiredAmount({}), null);

    const fns = readFileSync(new URL("./fo-check-in.functions.ts", import.meta.url), "utf8");
    assert.match(fns, /\.in\("transaction_type", \["deposit", "refund"\]\)/);
    assert.doesNotMatch(fns, /\.in\("transaction_type", \["payment", "refund"\]\)/);
    assert.match(fns, /netDepositTowardRequirement/);
    assert.doesNotMatch(fns, /ledgerMethod/);
    assert.match(fns, /requiredAmount: snapshotRequiredAmount/);
    assert.match(fns, /type: "deposit"/);
    assert.match(fns, /folioNumber: folio\?\.folio_number/);
    const readinessFn = fns.slice(
      fns.indexOf("export const getCheckInDepositReadiness"),
      fns.indexOf("export const ensureCheckInFolio"),
    );
    assert.equal(readinessFn.includes("open_folio_for_reservation"), false);
    assert.match(readinessFn, /requireReservationManager/);
    const postFn = fns.slice(
      fns.indexOf("export const postCheckInDeposit"),
      fns.indexOf("export const waiveCheckInDeposit"),
    );
    assert.match(postFn, /requireCashierOperator/);
    assert.equal(DEPOSIT_REQUIRED_BANNER, "Deposit required before check-in can finish.");
    assert.equal(mapDepositMethod("transfer"), "bank_transfer");
    assert.equal(mapCashierShiftError("SHIFT_NOT_FOUND"), "Open a cashier shift to post.");
  });
});

describe("FO-FS1 key gate", () => {
  it("key missing blocks unless waived", () => {
    assert.equal(canContinueKey({ accessType: null, identifier: null, waived: false }), false);
    assert.equal(
      canContinueKey({ accessType: "physical_key", identifier: "", waived: false }),
      false,
    );
    assert.equal(
      canContinueKey({ accessType: "physical_key", identifier: "K-12", waived: false }),
      true,
    );
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
    assert.equal(
      isRoomReady({ status: "out_of_service", housekeepingStatus: "inspected" }).ready,
      false,
    );
    assert.equal(isRoomReady(null).ready, false);
  });
});

describe("FO-FS1 walk-in continue", () => {
  it("walk-in create path must not invoke check-in; continue starts at B", () => {
    assert.equal(walkInContinueStep(), "registration");
    assert.equal(WALK_IN_CONTINUE_STEP, "registration");

    const dialogs = readFileSync(
      new URL("../components/frontoffice/front-office-dialogs.tsx", import.meta.url),
      "utf8",
    );
    const walkInFn = dialogs.slice(dialogs.indexOf("export function WalkInDialog"));
    assert.match(walkInFn, /status: "confirmed"/);
    assert.doesNotMatch(walkInFn, /checkInReservation/);
    assert.doesNotMatch(walkInFn, /checkIn\(/);
    assert.match(walkInFn, /onCreated/);
  });
});

describe("FO-FS0 rail lock", () => {
  it('shouldSuppressRestaurantPmsRail("front-office") still true', () => {
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
  });
});

describe("FO-FS1 stepper source locks", () => {
  it("stepper source has no Void / settle / refund actions", () => {
    const stepper = readFileSync(
      new URL("../components/frontoffice/fo-check-in-stepper.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(stepper, /\bVoid\b/);
    assert.doesNotMatch(stepper, /\bsettle\b/i);
    assert.doesNotMatch(stepper, /\brefund\b/i);
  });
});
