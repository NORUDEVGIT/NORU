import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import {
  DepositFacts,
  ReadinessCard,
  ReviewBanner,
} from "../components/frontoffice/fo-checkin-v2-review-panels";
import { RegistrationFormDocument } from "../components/frontoffice/fo-checkin-v2-review-print";
import type { CheckInAgreementRead } from "./fo-check-in-agreement";
import type { CheckInReadiness } from "./fo-check-in-readiness";
import {
  buildRegistrationFormView,
  checkInCommandTarget,
  completeCheckInEnabled,
  completionFailureCopy,
  keyRequirementState,
  reviewDepositView,
  satisfiedReadinessItems,
  unitAlreadyCheckedIn,
  type RegistrationFormView,
} from "./fo-checkin-v2-review-model";

const here = dirname(fileURLToPath(import.meta.url));
const readRel = (rel: string) => readFileSync(join(here, rel), "utf8");
const workspace = readRel("../components/frontoffice/fo-checkin-v2-workspace.tsx");
const review = readRel("../components/frontoffice/fo-checkin-v2-review.tsx");
const printSource = readRel("../components/frontoffice/fo-checkin-v2-review-print.tsx");
const panels = readRel("../components/frontoffice/fo-checkin-v2-review-panels.tsx");

function readiness(patch: Partial<CheckInReadiness> = {}): CheckInReadiness {
  return {
    target: {
      reservationRoomId: "unit-205",
      guestId: "guest-hana",
      guestSource: "unit_primary",
      status: "confirmed",
    },
    registration: { complete: true, waived: false },
    identity: { valid: true, warnings: [] },
    room: { assigned: true, eligible: true, ready: true },
    financial: {
      scope: "reservation",
      requiredAmount: 1000,
      receivedAmount: 1000,
      outstanding: 0,
      satisfied: true,
      guaranteeMethod: "cash",
      guaranteeSatisfied: null,
    },
    agreement: { versionId: "version-1", signed: true },
    key: { recorded: true, waived: false },
    blockers: [],
    warnings: [],
    overrides: [],
    canCheckIn: true,
    ...patch,
  };
}

function agreementRead(): CheckInAgreementRead {
  return {
    reservationRoomId: "unit-205",
    guestId: "guest-hana",
    guestSource: "unit_primary",
    blocker: null,
    version: {
      id: "6f1c2a7e-1111-4c2b-9d1e-0a1b2c3d4e5f",
      label: "3",
      body: "",
      title: "Guest Registration Agreement",
      acknowledgements: [
        {
          id: "hotel_terms",
          title: "Hotel Terms",
          statement: "Configured statement alpha",
          required: true,
          displayOrder: 10,
        },
      ],
    },
    signed: {
      id: "instance-1",
      agreementVersionId: "version-1",
      guestId: "guest-hana",
      reservationRoomId: "unit-205",
      acknowledgements: { hotel_terms: true },
      signedAt: "2026-10-19T09:30:00.000Z",
      capturedBy: "abcdef12-0000-4000-8000-000000000000",
      hasSignature: true,
    },
    draft: null,
  };
}

function form(
  patch: {
    checkedIn?: boolean;
    signatureUrl?: string | null;
    signatureRecorded?: boolean;
    agreement?: CheckInAgreementRead | null;
  } = {},
): RegistrationFormView {
  const checkedIn = patch.checkedIn ?? false;
  const agreement = patch.agreement === undefined ? agreementRead() : patch.agreement;
  const built = buildRegistrationFormView({
    checkedIn,
    stampPending: false,
    generatedAt: "19 Oct 2026, 10:00",
    property: {
      name: "Test International Hotel",
      address: "Bole, Addis Ababa",
      phone: "+251 11 000 0000",
      email: "stay@hotel.test",
      logoUrl: null,
    },
    guestName: "Hana Ali Kebede",
    profileNumber: "GP-1042",
    dateOfBirth: "1990-04-02",
    nationality: "Ethiopian",
    phone: "+251 91 000 0000",
    email: "hana@guest.test",
    address: "Bole, Addis Ababa",
    confirmationNumber: "NRU-1042",
    reservationStatus: checkedIn ? "checked_in" : "confirmed",
    bookingSource: "Direct",
    companyName: null,
    travelAgentName: null,
    groupName: null,
    arrivalDate: "2026-10-19",
    departureDate: "2026-10-21",
    nights: 2,
    adults: 2,
    children: 1,
    roomNumber: "205",
    roomTypeName: "Deluxe",
    ratePlanName: "Flexible",
    currency: "ETB",
    roomCharge: 4000,
    deposit: reviewDepositView(readiness(), "ETB"),
    idType: "Passport",
    idNumber: "EP12345678",
    idCountry: "ET",
    idExpiry: "2030-01-01",
    idIssueDate: "2020-01-01",
    idVerification: "Satisfied",
    agreement,
    signatureUrl:
      patch.signatureUrl === undefined ? "https://example.test/signature.png" : patch.signatureUrl,
    checkInTime: checkedIn ? "19 Oct 2026, 10:05" : null,
    processedBy: "front.desk@hotel.test",
  });
  if (patch.signatureRecorded === false && built.signatureRecorded) {
    return { ...built, signatureRecorded: false };
  }
  return built;
}

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("check-in v2 step 5 review", () => {
  it("1. renders Step 5 inside the shared workspace", () => {
    assert.match(workspace, /data-testid="fo-ci-v2-workspace"/);
    assert.match(workspace, /step === "review_checkin" \?/);
    assert.match(workspace, /FoCheckInV2Review/);
    assert.match(review, /data-testid="fo-ci-v2-review"/);
    assert.doesNotMatch(review, /useNavigate|navigate\(/);
    assert.doesNotMatch(workspace, /useNavigate|navigate\(/);
  });

  it("2. reads readiness with getCheckInReadiness", () => {
    assert.match(review, /getCheckInReadiness/);
    assert.match(review, /fo-ci-v2-readiness", restaurantId, reservationId, reservationRoomId/);
    assert.doesNotMatch(review, /evaluateCheckInReadiness/);
  });

  it("3. readiness cards use the backend result", () => {
    assert.match(review, /<ReadinessCard readiness=\{readiness\}/);
    assert.match(panels, /satisfiedReadinessItems\(readiness\)/);
    assert.doesNotMatch(review + panels, /check_in_hotel_reservation/);
  });

  it("4. canCheckIn true enables Complete Check-In", () => {
    assert.equal(
      completeCheckInEnabled({
        canCheckIn: true,
        pending: false,
        alreadyCheckedIn: false,
        outcome: null,
      }),
      true,
    );
    assert.match(workspace, /disabled=\{!reviewActions\.canComplete \|\| reviewActions\.busy\}/);
  });

  it("5. a blocker disables Complete Check-In", () => {
    assert.equal(
      completeCheckInEnabled({
        canCheckIn: false,
        pending: false,
        alreadyCheckedIn: false,
        outcome: null,
      }),
      false,
    );
    const blocked = html(
      createElement(ReviewBanner, {
        readiness: readiness({
          canCheckIn: false,
          blockers: [{ code: "ROOM_NOT_READY", message: "The assigned room is not ready." }],
        }),
      }),
    );
    assert.match(blocked, /Check-In cannot be completed/);
  });

  it("6. warnings alone do not disable Complete Check-In", () => {
    const warned = readiness({
      canCheckIn: true,
      warnings: [{ code: "UNVERIFIED_DOCUMENT", message: "Identity document is not verified." }],
    });
    assert.equal(
      completeCheckInEnabled({
        canCheckIn: warned.canCheckIn,
        pending: false,
        alreadyCheckedIn: false,
        outcome: null,
      }),
      true,
    );
    assert.match(
      html(createElement(ReviewBanner, { readiness: warned })),
      /All information completed/,
    );
    assert.doesNotMatch(
      html(createElement(ReviewBanner, { readiness: warned })),
      /cannot be completed/,
    );
  });

  it("7. renders every blocker", () => {
    const blocked = readiness({
      canCheckIn: false,
      blockers: [
        { code: "DEPOSIT_REQUIRED", message: "Deposit required before check-in can finish." },
        { code: "KEY_REQUIRED", message: "Record a key or waive keys for later." },
      ],
    });
    const markup = html(createElement(ReadinessCard, { readiness: blocked }));
    assert.match(markup, /fo-ci-v2-review-blocker-DEPOSIT_REQUIRED/);
    assert.match(markup, /fo-ci-v2-review-blocker-KEY_REQUIRED/);
    assert.match(markup, /Required before Check-In/);
  });

  it("8. renders warnings separately from blockers", () => {
    const markup = html(
      createElement(ReadinessCard, {
        readiness: readiness({
          warnings: [
            { code: "EARLY_ARRIVAL", message: "Expected arrival is before check-in time." },
          ],
        }),
      }),
    );
    assert.match(markup, /fo-ci-v2-review-warnings/);
    assert.match(markup, /fo-ci-v2-review-warning-EARLY_ARRIVAL/);
    assert.doesNotMatch(markup, /fo-ci-v2-review-blockers/);
  });

  it("9. renders waivers separately", () => {
    const markup = html(
      createElement(ReadinessCard, {
        readiness: readiness({
          overrides: [
            {
              requirement: "KEY_REQUIRED",
              reason: "Guest arrives with their own lock",
              actor: "abcdef12-0000-4000-8000-000000000000",
              at: "2026-10-19T08:00:00.000Z",
            },
          ],
        }),
      }),
    );
    assert.match(markup, /Authorized Waivers/);
    assert.match(markup, /fo-ci-v2-review-waiver-KEY_REQUIRED/);
    assert.match(markup, /Waived/);
  });

  it("10. a deposit waiver does not display a fake payment", () => {
    const waived = reviewDepositView(
      readiness({
        financial: {
          scope: "reservation",
          requiredAmount: 1000,
          receivedAmount: 0,
          outstanding: 1000,
          satisfied: true,
          guaranteeMethod: null,
          guaranteeSatisfied: null,
        },
        overrides: [
          { requirement: "DEPOSIT_REQUIRED", reason: "Manager approved", actor: null, at: null },
        ],
      }),
      "ETB",
    );
    assert.ok(waived);
    assert.equal(waived?.status, "Waived");
    assert.equal(waived?.received, null);
    const markup = html(createElement(DepositFacts, { deposit: waived! }));
    assert.match(markup, /Waived/);
    assert.doesNotMatch(markup, /Deposit received/);
    assert.doesNotMatch(markup, /4242|Visa ending|Authorized/);
  });

  it("11. a key waiver clears only the key representation", () => {
    const waivedKey = readiness({
      registration: { complete: false, waived: false },
      key: { recorded: false, waived: true },
      canCheckIn: false,
      overrides: [{ requirement: "KEY_REQUIRED", reason: "Later", actor: null, at: null }],
    });
    assert.equal(keyRequirementState(waivedKey.key), "Waived");
    assert.equal(
      satisfiedReadinessItems(waivedKey).some((item) => item.id === "key"),
      false,
    );
    assert.equal(
      satisfiedReadinessItems(waivedKey).some((item) => item.id === "registration"),
      false,
    );
  });

  it("12. renders the selected unit", () => {
    assert.match(review, /unit\.primaryGuestName/);
    assert.match(review, /unit\.roomNumber/);
    assert.match(review, /data-reservation-room-id=\{reservationRoomId \?\? ""\}/);
    assert.match(
      review,
      /data-guest-id=\{readiness\?\.target\?\.guestId \?\? unit\.primaryGuestId\}/,
    );
  });

  it("13. does not leak a sibling unit", () => {
    assert.doesNotMatch(review, /siblings/);
    assert.doesNotMatch(panels, /siblings/);
  });

  it("14. Step 1 Edit returns to Step 1", () => {
    assert.match(review, /onEdit\("guest_reservation"\)/);
    assert.match(review, /editLabel="Edit Guest & Reservation"/);
    assert.match(workspace, /onEdit=\{setStep\}/);
  });

  it("15. Step 2 Edit returns to Step 2", () => {
    assert.match(review, /onEdit\("registration"\)/);
    assert.match(review, /editLabel="Edit Registration"/);
  });

  it("16. Step 3 Edit returns to Step 3", () => {
    assert.match(review, /onEdit\("payment_guarantee"\)/);
    assert.match(review, /editLabel="Edit Payment & Guarantee"/);
  });

  it("17. Step 4 Edit returns to Step 4", () => {
    assert.match(review, /onEdit\("agreement_signature"\)/);
    assert.match(review, /editLabel="Edit Agreement & Signature"/);
  });

  it("18. returning to Step 5 refetches readiness", () => {
    assert.match(review, /refetchOnMount: "always"/);
    assert.match(workspace, /step === "review_checkin" \?/);
    assert.match(workspace, /setStep\("review_checkin"\)/);
  });

  it("19. Complete calls completeFoCheckIn", () => {
    assert.match(review, /completeFoCheckIn/);
    assert.match(review, /await completeCheckIn\(/);
    assert.doesNotMatch(workspace, /completeFoCheckIn/);
    assert.doesNotMatch(review, /check_in_hotel_reservation/);
  });

  it("20. the button stays disabled while the command is pending", () => {
    assert.equal(
      completeCheckInEnabled({
        canCheckIn: true,
        pending: true,
        alreadyCheckedIn: false,
        outcome: null,
      }),
      false,
    );
    assert.match(review, /setBusy\(true\)/);
    assert.match(review, /disabled=\{busy\}/);
    assert.match(workspace, /reviewActions\.busy/);
  });

  it("21. a successful completion renders the Checked In state", () => {
    assert.match(review, /Guest Checked In/);
    assert.match(review, /has been checked in successfully/);
    assert.match(review, /data-testid="fo-ci-v2-review-complete"/);
    assert.match(review, /setOutcome\(result\.outcome\)/);
  });

  it("22. success does not close the workspace", () => {
    const after = review.slice(review.indexOf("setOutcome(result.outcome)"));
    assert.doesNotMatch(after.slice(0, 400), /onClose\(\)/);
    assert.match(review, /onClick=\{onClose\}/);
    assert.match(review, />\s*Close\s*</);
  });

  it("23. checked_in_stamp_pending is success plus a reconciliation warning", () => {
    assert.match(review, /outcome === "checked_in_stamp_pending"/);
    assert.match(review, /fo-ci-v2-review-stamp-pending/);
    assert.match(review, /Progress synchronization is/);
    assert.match(review, /still pending/);
    assert.match(review, /Guest Checked In/);
  });

  it("24. checked_in_stamp_pending does not retry the command", () => {
    assert.equal(review.match(/await completeCheckIn\(/g)?.length, 1);
    assert.match(
      review,
      /if \(lockRef\.current \|\| outcomeRef\.current \|\| unitAlreadyCheckedIn/,
    );
    assert.equal(
      completeCheckInEnabled({
        canCheckIn: true,
        pending: false,
        alreadyCheckedIn: false,
        outcome: "checked_in_stamp_pending",
      }),
      false,
    );
  });

  it("25. an already checked-in unit does not show an active Complete button", () => {
    assert.equal(unitAlreadyCheckedIn("checked_in"), true);
    assert.equal(unitAlreadyCheckedIn("confirmed"), false);
    assert.match(workspace, /unitAlreadyCheckedIn\(unit\?\.status\) \? null/);
    assert.equal(
      completeCheckInEnabled({
        canCheckIn: true,
        pending: false,
        alreadyCheckedIn: true,
        outcome: null,
      }),
      false,
    );
  });

  it("26. switching unit clears this completion and reloads readiness", () => {
    assert.match(review, /\[reservationId, reservationRoomId\]/);
    assert.match(workspace, /setReviewScopeSeen\(reviewScope\)/);
    assert.match(review, /reservationRoomId/);
  });

  it("27. a legacy stay with no unit omits reservationRoomId", () => {
    const target = checkInCommandTarget({
      restaurantId: "property-1",
      reservationId: "stay-1",
      reservationRoomId: null,
    });
    assert.equal("reservationRoomId" in target, false);
    assert.match(
      review,
      /checkInCommandTarget\(\{ restaurantId, reservationId, reservationRoomId \}\)/,
    );
  });

  it("28. a stale blocker failure refetches readiness", () => {
    const failure = completionFailureCopy(
      new Error("Check-in blocked: The assigned room is not ready."),
    );
    assert.equal(failure.blocked, true);
    assert.match(failure.message, /requirement changed/);
    assert.doesNotMatch(failure.message, /at \S+\.ts/);
    const caught = review.slice(review.indexOf("} catch (error)"), review.indexOf("} finally"));
    assert.match(caught, /failure\.blocked/);
    assert.match(caught, /readinessQuery\.refetch\(\)/);
  });

  it("29. Print Registration Form uses the dedicated layout", () => {
    assert.match(workspace, /data-testid="fo-ci-v2-print-registration"/);
    assert.match(review, /RegistrationPrintLayer/);
    assert.match(printSource, /data-testid="fo-ci-v2-registration-form"/);
    assert.match(review, /window\.print\(\)/);
  });

  it("30. the print layout hides the rest of the page", () => {
    assert.match(printSource, /@media print/);
    assert.match(printSource, /body \* \{ visibility: hidden; \}/);
    assert.doesNotMatch(printSource, /fo-ci-v2-stepper|Check-In Summary/);
  });

  it("31. the printed document has no stepper or buttons", () => {
    const markup = html(createElement(RegistrationFormDocument, { form: form() }));
    assert.doesNotMatch(markup, /<button|fo-ci-v2-stepper|Check-In Summary/);
  });

  it("32. print includes the property identity when it is known", () => {
    const markup = html(createElement(RegistrationFormDocument, { form: form() }));
    assert.match(markup, /Test International Hotel/);
    assert.match(markup, /Bole, Addis Ababa/);
    assert.match(markup, /stay@hotel\.test/);
  });

  it("33. print includes guest details", () => {
    const markup = html(createElement(RegistrationFormDocument, { form: form() }));
    assert.match(markup, /Hana Ali Kebede/);
    assert.match(markup, /GP-1042/);
    assert.match(markup, /1990-04-02/);
    assert.match(markup, /Ethiopian/);
  });

  it("34. print includes reservation and stay details", () => {
    const markup = html(createElement(RegistrationFormDocument, { form: form() }));
    assert.match(markup, /NRU-1042/);
    assert.match(markup, /Direct/);
    assert.match(markup, />2</);
  });

  it("35. print includes the selected room", () => {
    const markup = html(createElement(RegistrationFormDocument, { form: form() }));
    assert.match(markup, /Room 205/);
    assert.match(markup, /Deluxe/);
    assert.match(markup, /Flexible/);
  });

  it("36. print includes the deposit summary", () => {
    const markup = html(createElement(RegistrationFormDocument, { form: form() }));
    assert.match(markup, /Deposit Required/);
    assert.match(markup, /Deposit Status/);
    assert.match(markup, /ETB/);
  });

  it("37. print masks the identity number", () => {
    const markup = html(createElement(RegistrationFormDocument, { form: form() }));
    assert.match(markup, /Passport/);
    assert.match(markup, /•••• 5678/);
    assert.doesNotMatch(markup, /EP12345678/);
  });

  it("38. print uses the check-in agreement acknowledgements", () => {
    const markup = html(
      createElement(RegistrationFormDocument, { form: form({ checkedIn: true }) }),
    );
    assert.match(markup, /Configured statement alpha/);
    assert.match(markup, /Accepted/);
    assert.match(review, /getCheckInAgreement/);
    assert.doesNotMatch(review, /getGuestAgreementConfiguration|updateGuestAgreementDraft/);
  });

  it("39. a signed print includes the signature image", () => {
    const markup = html(
      createElement(RegistrationFormDocument, {
        form: form({ checkedIn: true, signatureUrl: "https://example.test/signature.png" }),
      }),
    );
    assert.match(markup, /src="https:\/\/example\.test\/signature\.png"/);
    assert.match(markup, /Signed by/);
  });

  it("40. a missing signature image says Signature Recorded", () => {
    const markup = html(
      createElement(RegistrationFormDocument, {
        form: form({ checkedIn: true, signatureUrl: null }),
      }),
    );
    assert.match(markup, /Signature Recorded/);
    assert.doesNotMatch(markup, /<img/);
    assert.doesNotMatch(markup, /Not signed/);
  });

  it("41. a pre-check-in print says Pending Check-In", () => {
    const markup = html(
      createElement(RegistrationFormDocument, { form: form({ checkedIn: false }) }),
    );
    assert.match(markup, /HOTEL REGISTRATION FORM/);
    assert.match(markup, /Pending Check-In/);
    assert.doesNotMatch(markup, /CHECK-IN CONFIRMATION/);
  });

  it("42. a post-check-in print says Checked In", () => {
    const markup = html(
      createElement(RegistrationFormDocument, { form: form({ checkedIn: true }) }),
    );
    assert.match(
      markup,
      /HOTEL REGISTRATION &amp; CHECK-IN CONFIRMATION|HOTEL REGISTRATION & CHECK-IN CONFIRMATION/,
    );
    assert.match(markup, /CHECKED IN/);
    assert.match(markup, /data-print-status="Checked In"/);
  });

  it("43. a post-check-in print includes the completion details", () => {
    const markup = html(
      createElement(RegistrationFormDocument, { form: form({ checkedIn: true }) }),
    );
    assert.match(markup, /fo-ci-v2-registration-form-confirmation/);
    assert.match(markup, /19 Oct 2026, 10:05/);
    assert.match(markup, /front\.desk@hotel\.test/);
    assert.match(markup, /Room 205/);
  });

  it("44. print follows the check-in agreement, not a configuration draft", () => {
    const unsigned = agreementRead();
    unsigned.signed = null;
    const markup = html(
      createElement(RegistrationFormDocument, {
        form: form({ agreement: unsigned, checkedIn: false }),
      }),
    );
    assert.match(markup, /Configured statement alpha/);
    assert.match(markup, /Not yet accepted/);
    assert.doesNotMatch(markup, /Accepted\./);
    assert.match(review, /agreementQuery/);
  });

  it("45. Back returns to Step 4", () => {
    assert.match(workspace, /data-testid="fo-ci-v2-back-agreement"/);
    assert.match(workspace, /onClick=\{\(\) => setStep\("agreement_signature"\)\}/);
    assert.doesNotMatch(review, /navigate\(/);
  });
});
