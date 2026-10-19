import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  buildRegistrationSave,
  registrationDocumentState,
  registrationDraft,
  registrationRelationship,
  registrationTargetsGuest,
} from "./fo-checkin-v2-registration-model";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

describe("Check-In Step 2 registration", () => {
  const workspace = readRel("../components/frontoffice/fo-checkin-v2-workspace.tsx");
  const registration = readRel("../components/frontoffice/fo-checkin-v2-registration.tsx");

  it("opens Step 2 inside the same Check-In workspace", () => {
    assert.match(workspace, /data-testid="fo-ci-v2-workspace"/);
    assert.match(workspace, /FoCheckInV2Registration/);
    assert.match(workspace, /step === "registration"/);
    assert.doesNotMatch(registration, /useNavigate/);
    assert.doesNotMatch(workspace, /useNavigate/);
  });

  it("uses getCheckInRegistration", () => {
    assert.match(registration, /getCheckInRegistration/);
    assert.match(
      registration,
      /\["fo-ci-v2-registration", restaurantId, reservationId, reservationRoomId\]/,
    );
  });

  it("shows the selected unit primary guest", () => {
    const target = registrationTargetsGuest({
      guestId: "guest-hana",
      guestSource: "unit_primary",
    });
    assert.equal(target.guestId, "guest-hana");
    assert.equal(target.relationship, "Primary Guest");
    assert.match(registration, /data-testid="fo-ci-v2-registration-guest"/);
    assert.match(registration, /unit\.primaryGuestName/);
  });

  it("labels a booker fallback", () => {
    assert.equal(registrationRelationship("booker"), "Booker");
    assert.match(registration, /data-testid="fo-ci-v2-registration-relationship"/);
    assert.match(registration, /registrationRelationship\(registration\.guestSource\)/);
  });

  it("preloads registration fields over the existing profile", () => {
    const draft = registrationDraft(
      [{ code: "FIRST_NAME", label: "First name", required: true, value: "Hana" }],
      { firstName: "Old", middleName: "Ali", lastName: "Kebede" },
    );
    assert.equal(draft.firstName, "Hana");
    assert.equal(draft.middleName, "Ali");
    assert.equal(draft.lastName, "Kebede");
  });

  it("saves through saveCheckInUnitRegistration", () => {
    assert.match(registration, /saveCheckInUnitRegistration/);
    assert.match(workspace, /fo-ci-v2-save-continue/);
    assert.match(workspace, /Save & Continue/);
  });

  it("does not mutate reservation occupancy", () => {
    const saved = buildRegistrationSave({
      draft: { firstName: "Hana", adults: "2", children: "1" },
      document: null,
    });
    assert.deepEqual(saved.fields, { first_name: "Hana" });
    assert.equal("adults" in saved.fields, false);
    assert.equal("children" in saved.fields, false);
    assert.doesNotMatch(registration, /amend_hotel_reservation/);
    assert.doesNotMatch(registration, /saveCheckInUnitRegistration[\s\S]{0,400}adults/);
  });

  it("renders guest_documents as the identity source", () => {
    assert.match(registration, /registration\.documents/);
    assert.match(registration, /fo-ci-v2-identification/);
    assert.match(registration, /fo-ci-v2-id-number/);
  });

  it("does not use scalar id_document fields", () => {
    assert.doesNotMatch(registration, /id_document_/);
    assert.doesNotMatch(registration, /idDocumentNumber|idDocumentType|idDocumentExpiry/);
    assert.doesNotMatch(workspace, /id_document_/);
    const saved = buildRegistrationSave({
      draft: { firstName: "Hana", idDocumentNumber: "P1", id_document_type: "passport" },
      document: null,
    });
    assert.deepEqual(saved.fields, { first_name: "Hana" });
  });

  it("renders an unverified document as a warning", () => {
    const state = registrationDocumentState({
      documents: [{ verificationStatus: "unverified", expiryDate: "2030-01-01" }],
      warnings: ["Identity document is not verified."],
      today: "2026-10-18",
    });
    assert.equal(state.tone, "warning");
    assert.equal(state.summary, "Warning: ID unverified");
    assert.match(registration, /data-testid="fo-ci-v2-document-state"/);
  });

  it("renders expired and missing documents as blocking", () => {
    const expired = registrationDocumentState({
      documents: [{ verificationStatus: "verified", expiryDate: "2020-01-01" }],
      warnings: [],
      today: "2026-10-18",
    });
    const missing = registrationDocumentState({
      documents: [],
      warnings: [],
      today: "2026-10-18",
    });
    assert.equal(expired.tone, "blocked");
    assert.equal(expired.label, "Expired document");
    assert.equal(missing.tone, "blocked");
    assert.equal(missing.summary, "Missing required ID");
  });

  it("verifies through reviewGuestDocument", () => {
    assert.match(registration, /reviewGuestDocument/);
    assert.match(registration, /fo-ci-v2-verify-document/);
    assert.match(registration, /status: "verified"/);
  });

  it("calls searchCheckInGuestDuplicates", () => {
    assert.match(registration, /searchCheckInGuestDuplicates/);
    assert.match(registration, /fo-ci-v2-check-duplicates/);
  });

  it("does not merge or replace a duplicate profile", () => {
    assert.match(registration, /does not merge or replace/);
    assert.doesNotMatch(registration, /mergeGuest|auto-merge|set_primary/);
  });

  it("does not show a sibling unit guest as the registration guest", () => {
    const target = registrationTargetsGuest({ guestId: "guest-205", guestSource: "unit_primary" });
    assert.equal(target.guestId, "guest-205");
    assert.doesNotMatch(registration, /siblings\[0\]\.|sibling\.guest/);
    assert.match(registration, /data-guest-id=\{registration\.guestId\}/);
  });

  it("reloads registration when the unit changes", () => {
    assert.match(workspace, /reservationRoomId=\{activeRoomId\}/);
    assert.match(registration, /reservationRoomId/);
    assert.match(
      registration,
      /fo-ci-v2-registration", restaurantId, reservationId, reservationRoomId/,
    );
  });

  it("advances Save & Continue to the Step 3 shell", () => {
    assert.match(workspace, /setStep\("payment_guarantee"\)/);
    assert.match(workspace, /FoCheckInV2Payment/);
  });

  it("returns to Step 1 without leaving the workspace", () => {
    assert.match(workspace, /setStep\("guest_reservation"\)/);
    assert.match(workspace, /fo-ci-v2-back-guest/);
    assert.doesNotMatch(registration, /navigate\(/);
    assert.doesNotMatch(workspace, /navigate\(/);
  });

  it("does not implement agreement or signature", () => {
    assert.doesNotMatch(registration, /signature|agreement|acknowledgement/i);
    assert.doesNotMatch(workspace, /captureCheckInAgreementSignature|saveCheckInAgreement/);
  });

  it("does not implement payment or cashiering", () => {
    assert.doesNotMatch(
      registration,
      /postCheckInDeposit|Cashiering|guaranteeMethod|paymentMethod/,
    );
    assert.doesNotMatch(workspace, /postCheckInDeposit|Cashiering/);
  });
});
