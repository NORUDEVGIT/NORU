import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import type { CheckInDepositReadiness } from "./fo-check-in";
import {
  buildCheckInPaymentSummary,
  canAuthorizeCheckInDepositWaiver,
  canContinuePayment,
  depositRequirementStatus,
  GUARANTEE_NOT_EVALUATED,
  postedDepositProgressFailure,
} from "./fo-checkin-v2-payment-model";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

const workspace = readRel("../components/frontoffice/fo-checkin-v2-workspace.tsx");
const payment = readRel("../components/frontoffice/fo-checkin-v2-payment.tsx");

function readiness(overrides: Partial<CheckInDepositReadiness> = {}): CheckInDepositReadiness {
  return {
    scope: "reservation",
    folioId: "folio-1",
    folioStatus: "open",
    currency: "ETB",
    requiredAmount: 2000,
    receivedAmount: 500,
    outstanding: 1500,
    satisfied: false,
    guaranteeMethod: "card",
    guaranteeSatisfied: null,
    guaranteeNote: "No guarantee satisfaction rule is configured.",
    companyMasterId: null,
    groupAccountMasterId: null,
    ...overrides,
  };
}

describe("check-in v2 payment", () => {
  it("renders Step 3 inside the shared Check-In workspace", () => {
    assert.match(workspace, /data-testid="fo-ci-v2-workspace"/);
    assert.match(workspace, /step === "payment_guarantee" \?/);
    assert.match(workspace, /FoCheckInV2Payment/);
    assert.match(payment, /data-testid="fo-ci-v2-payment"/);
    assert.doesNotMatch(payment, /useNavigate|navigate\(/);
    assert.doesNotMatch(workspace, /navigate\(/);
  });

  it("uses getCheckInDepositReadiness", () => {
    assert.match(payment, /getCheckInDepositReadiness/);
    assert.match(payment, /fo-ci-v2-deposit", restaurantId, reservationId, reservationRoomId/);
  });

  it("renders the required deposit from the backend read", () => {
    const summary = buildCheckInPaymentSummary(readiness(), false);
    assert.match(summary.required, /2,000\.00/);
    assert.match(payment, /fo-ci-v2-deposit-required/);
    assert.match(payment, /summary\.required/);
  });

  it("renders the deposit received from the backend read", () => {
    const summary = buildCheckInPaymentSummary(readiness(), false);
    assert.match(summary.received, /500\.00/);
    assert.match(payment, /fo-ci-v2-deposit-received/);
    assert.match(payment, /summary\.received/);
  });

  it("renders the outstanding amount from the backend read", () => {
    const summary = buildCheckInPaymentSummary(readiness(), false);
    assert.match(summary.outstanding, /1,500\.00/);
    assert.match(payment, /fo-ci-v2-deposit-outstanding/);
    assert.match(payment, /summary\.outstanding/);
  });

  it("does not treat an ordinary payment as the deposit", () => {
    assert.equal(
      depositRequirementStatus({
        requiredAmount: 2000,
        receivedAmount: 0,
        satisfied: false,
        waived: false,
      }),
      "Outstanding",
    );
    assert.match(payment, /Ordinary payments do not satisfy this deposit/);
    assert.doesNotMatch(payment, /transaction_type:\s*["']payment["']/);
    assert.doesNotMatch(payment, /folioBalance|paymentTotal|roomSubtotal/);
  });

  it("keeps a partial deposit outstanding", () => {
    assert.equal(
      depositRequirementStatus({
        requiredAmount: 1750,
        receivedAmount: 1000,
        satisfied: false,
        waived: false,
      }),
      "Partially paid",
    );
    assert.equal(canContinuePayment(readiness({ satisfied: false })), false);
  });

  it("enables Continue only from backend satisfied", () => {
    assert.equal(canContinuePayment(readiness({ satisfied: true, outstanding: 0 })), true);
    assert.equal(canContinuePayment(null), false);
    assert.match(payment, /onReady\(readiness\?\.satisfied === true\)/);
    assert.match(workspace, /disabled=\{!depositSatisfied\}/);
  });

  it("treats a zero or missing requirement as satisfied when the backend does", () => {
    assert.equal(
      depositRequirementStatus({
        requiredAmount: null,
        receivedAmount: 0,
        satisfied: true,
        waived: false,
      }),
      "Not required",
    );
    assert.equal(
      depositRequirementStatus({
        requiredAmount: 0,
        receivedAmount: 0,
        satisfied: true,
        waived: false,
      }),
      "Not required",
    );
    assert.equal(canContinuePayment(readiness({ requiredAmount: 0, satisfied: true })), true);
    assert.equal(canContinuePayment(readiness({ requiredAmount: null, satisfied: true })), true);
  });

  it("shows Waived without rewriting the received amount", () => {
    const summary = buildCheckInPaymentSummary(
      readiness({ receivedAmount: 500, requiredAmount: 2000, satisfied: true, outstanding: 0 }),
      true,
    );
    assert.equal(summary.status, "Waived");
    assert.match(summary.received, /500\.00/);
    assert.doesNotMatch(summary.received, /2,000\.00/);
    assert.match(payment, /Received deposit is unchanged/);
    assert.match(payment, /unit\.progress\.depositWaived/);
  });

  it("shows guarantee_method as a stored fact", () => {
    const summary = buildCheckInPaymentSummary(readiness({ guaranteeMethod: "card" }), false);
    assert.equal(summary.guarantee, "card");
    assert.match(payment, /guaranteeMethodLabel\(readiness\.guaranteeMethod\)/);
  });

  it("does not render a null guarantee as satisfied", () => {
    const summary = buildCheckInPaymentSummary(
      readiness({ guaranteeMethod: null, guaranteeSatisfied: null }),
      false,
    );
    assert.equal(summary.guarantee, "No guarantee method recorded");
    assert.equal(summary.guaranteeNote, GUARANTEE_NOT_EVALUATED);
    assert.doesNotMatch(summary.guaranteeNote, /satisfied/i);
    assert.match(payment, /data-guarantee-satisfied="null"/);
    assert.doesNotMatch(payment, /Guarantee satisfied/);
  });

  it("shows the folio as reservation scoped", () => {
    const summary = buildCheckInPaymentSummary(readiness(), false);
    assert.equal(summary.folioScope, "Reservation");
    assert.match(payment, /Folio scope: \{summary\.folioScope\}/);
    assert.match(payment, /Financial activity is shared across this reservation/);
  });

  it("does not apply this unit waiver to a sibling", () => {
    assert.match(payment, /unit\.progress\.depositWaived/);
    assert.doesNotMatch(payment, /sibling\.deposit|siblings\[.+\]\.deposit/);
    assert.match(payment, /this room/);
  });

  it("refetches readiness when the selected unit changes", () => {
    assert.match(workspace, /reservationRoomId=\{activeRoomId\}/);
    assert.match(payment, /fo-ci-v2-deposit", restaurantId, reservationId, reservationRoomId/);
  });

  it("collects a deposit through postCheckInDeposit", () => {
    assert.match(payment, /postCheckInDeposit/);
    assert.match(payment, /fo-ci-v2-collect-deposit/);
    assert.match(payment, /idempotencyKey: depositKey\.current/);
    assert.match(payment, /reservationRoomId/);
  });

  it("refetches readiness after a successful deposit", () => {
    const success = payment.slice(
      payment.indexOf("onSuccess: async () => {"),
      payment.indexOf("onError:"),
    );
    assert.match(success, /readinessQuery\.refetch\(\)/);
    assert.match(success, /onRefresh\(\)/);
    assert.match(success, /depositKey\.current = crypto\.randomUUID\(\)/);
  });

  it("does not repost when the folio post landed and progress did not", () => {
    assert.equal(
      postedDepositProgressFailure(new Error("Deposit txn-88 was posted. Progress failed.")),
      "txn-88",
    );
    const failure = payment.slice(
      payment.indexOf("onError: (error) => {"),
      payment.indexOf("const waiveMut"),
    );
    assert.match(failure, /postedDepositProgressFailure/);
    assert.doesNotMatch(failure, /depositKey\.current = crypto\.randomUUID/);
    assert.match(payment, /if \(postedTransactionId\) return/);
    assert.match(payment, /Do not submit this\s+deposit again/);
  });

  it("does not let a receptionist authorize the deposit waiver", () => {
    assert.equal(canAuthorizeCheckInDepositWaiver("receptionist"), false);
    assert.equal(canAuthorizeCheckInDepositWaiver(null), false);
    assert.match(payment, /canAuthorizeCheckInDepositWaiver\(role\)/);
    assert.match(payment, /fo-ci-v2-waiver-denied/);
  });

  it("lets an owner or manager use the existing waiver command", () => {
    assert.equal(canAuthorizeCheckInDepositWaiver("owner"), true);
    assert.equal(canAuthorizeCheckInDepositWaiver("manager"), true);
    assert.match(payment, /waiveCheckInDeposit/);
    assert.match(payment, /fo-ci-v2-waive-deposit/);
    assert.match(payment, /reason: reason\.trim\(\)/);
    const waivedBranch = payment.slice(
      payment.indexOf("canWaive ?"),
      payment.indexOf("fo-ci-v2-waiver-denied"),
    );
    assert.match(waivedBranch, /waiveMut\.mutate/);
  });

  it("returns to Registration without leaving the workspace", () => {
    assert.match(workspace, /fo-ci-v2-back-registration/);
    assert.match(workspace, /setStep\("registration"\)/);
    assert.doesNotMatch(payment, /navigate\(/);
  });

  it("advances Continue to the Step 4 shell", () => {
    assert.match(workspace, /fo-ci-v2-continue-agreement/);
    assert.match(workspace, /setStep\("agreement_signature"\)/);
    assert.match(workspace, /fo-ci-v2-step-placeholder-/);
    assert.match(workspace, /This step is not available yet/);
  });

  it("does not implement agreement or signature", () => {
    assert.doesNotMatch(
      payment,
      /signature|acknowledgement|saveCheckInAgreement|captureCheckInAgreement/i,
    );
    assert.doesNotMatch(workspace, /captureCheckInAgreementSignature|saveCheckInAgreement/);
  });

  it("does not implement Complete Check-In", () => {
    assert.doesNotMatch(payment, /completeFoCheckIn|Complete Check-In/);
    assert.doesNotMatch(workspace, /completeFoCheckIn|Complete Check-In/);
  });
});
