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
  reviewIncludedItems,
  reviewNoShowCopy,
  reviewRefundabilityCopy,
} from "./create-reservation-review.ts";

const page = readFileSync(
  new URL("../components/bookings/create-reservation-page.tsx", import.meta.url),
  "utf8",
);
const reviewUi = readFileSync(
  new URL("../components/bookings/create-reservation-review.tsx", import.meta.url),
  "utf8",
);
const reviewPrint = readFileSync(
  new URL("../components/bookings/reservation-print-document.tsx", import.meta.url),
  "utf8",
);
const createFns = readFileSync(new URL("./reservations.functions.ts", import.meta.url), "utf8");

describe("Create Reservation Step 4 review workspace", () => {
  it("renders nine cards in three rows", () => {
    const ids = [...reviewUi.matchAll(/testId="(review-card-[^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(ids, [
      "review-card-guest",
      "review-card-stay",
      "review-card-rate",
      "review-card-source",
      "review-card-guarantee",
      "review-card-policies",
      "review-card-packages",
      "review-card-requests",
      "review-card-print",
    ]);
    assert.match(reviewUi, /grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3/);
    assert.match(reviewUi, /h-full !rounded-\[6px\]/);
    assert.doesNotMatch(reviewUi, /items-start gap-3 md:grid-cols-2/);
    assert.doesNotMatch(reviewUi, /!h-fit|h-fit/);
    assert.doesNotMatch(reviewUi, /h-\[\d|min-h-\[\d/);
    const singleRate = reviewUi.slice(
      reviewUi.indexOf('testId="review-card-rate"'),
      reviewUi.indexOf('testId="review-card-source"'),
    );
    assert.doesNotMatch(singleRate, /col-span-full|xl:col-span-3|lg:col-span-3/);
    assert.match(reviewUi, /title="Payment & Deposit"/);
    assert.match(reviewUi, /title="Stay Policies"/);
    assert.doesNotMatch(reviewUi, /title="Guarantee & Deposit"/);
    assert.doesNotMatch(reviewUi, /Policies & Additional Information/);
    assert.doesNotMatch(reviewUi, /data-testid="review-policy-ack"/);
    assert.doesNotMatch(reviewUi, /Guest informed about cancellation policy/);
    assert.doesNotMatch(reviewUi, /Guest consent for deposit and guarantee/);
    assert.doesNotMatch(reviewUi, /Special terms and conditions apply/);
    assert.match(reviewUi, /No packages selected/);
    assert.match(reviewUi, /chargeBasisLabel/);
    assert.match(reviewUi, /priceLabel/);
    assert.match(reviewUi, /Includes:/);
    assert.match(reviewUi, /No saved preferences/);
    assert.match(reviewUi, /No service requests selected/);
    assert.match(reviewUi, /Print a clean reservation review before confirmation/);
    assert.match(page, /CreateReservationReview/);
    assert.match(page, /savedPreferences=\{savedPreferenceRows\}/);
    assert.match(page, /selectedServiceRequests=\{selectedServiceRequests\}/);
    assert.match(page, /selectedPackages=/);
    assert.match(page, /data-testid="save-as-pending"/);
    assert.match(page, /data-testid="confirm-guarantee"/);
    assert.match(page, /create\.mutate\("pending"\)/);
    assert.match(page, /create\.mutate\("confirmed"\)/);
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
    assert.match(reviewUi, /testId="review-card-packages"/);
    assert.match(reviewUi, /No packages selected/);
    assert.match(reviewUi, /Includes:/);
    const packagesCard = reviewUi.slice(reviewUi.indexOf('testId="review-card-packages"') - 220);
    assert.match(packagesCard.slice(0, 260), /CREATE_REVIEW_STEPS\.bookingDetails/);
    assert.match(page, /selectedPackages=/);
    assert.match(reviewUi, /testId="review-card-requests"/);
    assert.match(reviewUi, /No saved preferences/);
    assert.match(reviewUi, /No service requests selected/);
    assert.match(page, /savedPreferences=\{savedPreferenceRows\}/);
    assert.match(page, /selectedServiceRequests=\{selectedServiceRequests\}/);
    assert.match(
      page,
      /stayTotal=\{pricingState\.kind === "priced" \? money\(quotedGuestTotal\(pricingState\.quote\)\) : "—"\}/,
    );
    assert.doesNotMatch(reviewUi, /Grand Total|grandCommercialSubtotal|card\.price \*/);
    assert.doesNotMatch(reviewUi, /\/restaurant\/pms\/reservations\/new/);
    assert.doesNotMatch(reviewUi, /createFileRoute/);
  });

  it("keeps card numbers and CVV out of the review and the print summary", () => {
    assert.equal(maskGuaranteePan("4111111111111111"), "•••• •••• •••• 1111");
    assert.equal(maskGuaranteePan("4111 1111 1111 4587"), "•••• •••• •••• 4587");
    assert.equal(maskGuaranteePan(""), "—");
    assert.equal(isCardGuaranteeMethod("card"), true);
    assert.equal(isCardGuaranteeMethod("CASH"), false);
    assert.doesNotMatch(maskGuaranteePan("4111111111111111"), /4111111111111111/);
    assert.doesNotMatch(reviewUi, /cvv|CVV|cvc|CVC/i);
    assert.doesNotMatch(reviewPrint, /cvv|CVV|cardNumber|Card Number/i);
    const printBody = reviewPrint.slice(
      reviewPrint.indexOf("<article"),
      reviewPrint.indexOf("</article>"),
    );
    assert.match(reviewUi, /<ReservationPrintDocument/);
    assert.match(reviewPrint, /data-testid="reservation-print-document"/);
    assert.match(reviewUi, /onClick=\{\(\) => window\.print\(\)\}/);
    assert.match(reviewUi, /buildDraftReservationPrintData/);
    assert.match(reviewPrint, /\{data\.title\}/);
    assert.match(reviewPrint, /@media print/);
    assert.match(reviewPrint, /body \* \{ visibility: hidden; \}/);
    assert.doesNotMatch(reviewPrint, /ReservationReviewPrint|reservation-review-print/);
    assert.doesNotMatch(printBody, />\s*Edit\s*</);
    assert.doesNotMatch(printBody, /save-as-pending|confirm-guarantee|create-reservation-stepper/);
    assert.doesNotMatch(reviewUi, /create\.mutate|submitReservation/);
    assert.doesNotMatch(reviewPrint, /create\.mutate|submitReservation/);
    assert.equal(reviewIncludedItems(["Included", "WiFi"]), "Breakfast included · WiFi");
    assert.equal(
      reviewRefundabilityCopy("non_refundable", "Advance purchase"),
      "Non-refundable · Advance purchase",
    );
    assert.equal(reviewNoShowCopy("Standard", "First night"), "Standard · First night");
    assert.equal(reviewNoShowCopy("", null), null);
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
