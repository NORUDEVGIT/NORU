import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CREATE_REVIEW_STEPS,
  guestInitials,
  isCardGuaranteeMethod,
  maskGuaranteePan,
  preferenceFlagFromRequests,
  reviewDash,
} from "./create-reservation-review.ts";

const page = readFileSync(
  new URL("../components/bookings/create-reservation-page.tsx", import.meta.url),
  "utf8",
);
const reviewUi = readFileSync(
  new URL("../components/bookings/create-reservation-review.tsx", import.meta.url),
  "utf8",
);
const createFns = readFileSync(new URL("./reservations.functions.ts", import.meta.url), "utf8");

describe("Create Reservation Step 5 review dashboard", () => {
  it("renders the compact six-card layout, summary rail, and acknowledgements", () => {
    assert.match(page, /CreateReservationReview/);
    assert.match(page, /data-testid="create-reservation-summary"/);
    assert.match(reviewUi, /data-testid="create-reservation-review"/);
    assert.match(reviewUi, /testId="review-card-guest"/);
    assert.match(reviewUi, /testId="review-card-stay"/);
    assert.match(reviewUi, /testId="review-card-rate"/);
    assert.match(reviewUi, /testId="review-card-source"/);
    assert.match(reviewUi, /testId="review-card-guarantee"/);
    assert.match(reviewUi, /testId="review-card-policies"/);
    assert.match(reviewUi, /lg:grid-cols-3/);
    assert.match(reviewUi, /data-testid="review-policy-ack"/);
    assert.match(page, /data-testid="summary-cancellation"/);
    assert.match(page, /data-testid="create-reservation-actions"/);
    assert.match(page, /data-testid="save-as-pending"/);
    assert.match(page, /data-testid="confirm-guarantee"/);
    assert.doesNotMatch(reviewUi, /TODO: wire to a confirmation preview reader/);
  });

  it("routes Edit actions to existing wizard steps", () => {
    assert.equal(CREATE_REVIEW_STEPS.guestStayAvailability, 0);
    assert.equal(CREATE_REVIEW_STEPS.bookingDetails, 1);
    assert.equal(CREATE_REVIEW_STEPS.policies, 2);
    assert.equal(CREATE_REVIEW_STEPS.review, 3);
    assert.match(reviewUi, /onEdit\(CREATE_REVIEW_STEPS.guestStayAvailability\)/);
    assert.match(reviewUi, /onEdit\(CREATE_REVIEW_STEPS.bookingDetails\)/);
    assert.match(reviewUi, /onEdit\(CREATE_REVIEW_STEPS.policies\)/);
    assert.match(page, /onEdit=\{setWorkflowStep\}/);
    assert.doesNotMatch(reviewUi, /\/restaurant\/pms\/reservations\/new/);
    assert.doesNotMatch(reviewUi, /createFileRoute/);
  });

  it("masks card PAN and never prints CVV or a raw 16-digit number", () => {
    assert.equal(maskGuaranteePan("4111111111111111"), "•••• •••• •••• 1111");
    assert.equal(maskGuaranteePan("4111 1111 1111 4587"), "•••• •••• •••• 4587");
    assert.equal(maskGuaranteePan(""), "—");
    assert.equal(isCardGuaranteeMethod("card"), true);
    assert.equal(isCardGuaranteeMethod("CASH"), false);
    assert.doesNotMatch(maskGuaranteePan("4111111111111111"), /4111111111111111/);
    assert.doesNotMatch(reviewUi, /cvv|CVV|cvc|CVC/i);
    assert.match(reviewUi, /maskGuaranteePan/);
  });

  it("renders missing values as a clean dash", () => {
    assert.equal(reviewDash(null), "—");
    assert.equal(reviewDash(""), "—");
    assert.equal(reviewDash("  "), "—");
    assert.equal(reviewDash("Maria Santos"), "Maria Santos");
    assert.equal(guestInitials("Maria Santos"), "MS");
    assert.equal(preferenceFlagFromRequests("", "High Floor"), "—");
    assert.equal(preferenceFlagFromRequests("High floor, non-smoking", "High Floor"), "Yes");
  });

  it("does not change create payload, pricing, or package bind", () => {
    assert.match(page, /createReservation/);
    assert.match(page, /quoteStay/);
    assert.match(page, /CreateReservationPackages/);
    assert.doesNotMatch(page, /\.\.\.step4Policies/);
    assert.doesNotMatch(createFns, /ackInformed|cardNumber|_package_id/);
    assert.match(page, /canSubmitCreateReservation/);
    assert.match(page, /canSubmitConfirmReservation/);
  });
});
