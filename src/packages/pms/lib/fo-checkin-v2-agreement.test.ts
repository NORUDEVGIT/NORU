import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import type { CheckInAgreementRead } from "./fo-check-in-agreement";
import {
  agreementAcknowledgementState,
  agreementCanContinue,
  agreementSignaturePath,
  buildCheckInAgreementSummary,
  signatureHasInk,
} from "./fo-checkin-v2-agreement-model";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

const workspace = readRel("../components/frontoffice/fo-checkin-v2-workspace.tsx");
const agreement = [
  readRel("../components/frontoffice/fo-checkin-v2-agreement.tsx"),
  readRel("../components/frontoffice/fo-checkin-v2-agreement-document.tsx"),
].join("\n");

function read(overrides: Partial<CheckInAgreementRead> = {}): CheckInAgreementRead {
  return {
    reservationRoomId: "unit-205",
    guestId: "guest-hana",
    guestSource: "unit_primary",
    blocker: null,
    version: { id: "version-1", label: "2026.1", body: "House rules\n\nSecond paragraph." },
    signed: null,
    draft: null,
    ...overrides,
  };
}

describe("check-in v2 agreement", () => {
  it("renders Step 4 inside the shared Check-In workspace", () => {
    assert.match(workspace, /data-testid="fo-ci-v2-workspace"/);
    assert.match(workspace, /step === "agreement_signature" \?/);
    assert.match(workspace, /FoCheckInV2Agreement/);
    assert.match(agreement, /data-testid="fo-ci-v2-agreement"/);
    assert.doesNotMatch(agreement, /useNavigate|navigate\(/);
    assert.doesNotMatch(workspace, /navigate\(/);
  });

  it("reads the agreement with getCheckInAgreement", () => {
    assert.match(agreement, /getCheckInAgreement/);
    assert.match(agreement, /fo-ci-v2-agreement", restaurantId, reservationId, reservationRoomId/);
  });

  it("displays the agreement body exactly", () => {
    assert.match(agreement, /whitespace-pre-wrap/);
    assert.match(agreement, /\{version\.body\}/);
    assert.doesNotMatch(agreement, /I accept the hotel/);
  });

  it("displays the version label and keeps the id out of the text", () => {
    const summary = buildCheckInAgreementSummary(read(), "Hana Ali Kebede");
    assert.equal(summary.version, "Version 2026.1");
    assert.match(agreement, /agreementVersionLabel\(version\)/);
    assert.match(agreement, /data-version-id=\{version\.id\}/);
    assert.doesNotMatch(agreement, /Version \{version\.id\}/);
  });

  it("displays the selected unit guest", () => {
    assert.match(agreement, /unit\.primaryGuestName/);
    assert.match(agreement, /data-guest-id=\{agreement\.guestId\}/);
  });

  it("displays the selected unit room", () => {
    assert.match(agreement, /unit\.roomNumber/);
    assert.match(agreement, /fo-ci-v2-agreement-room/);
  });

  it("labels a booker fallback", () => {
    assert.match(agreement, /agreement\.guestSource === "booker"/);
    assert.match(agreement, /fo-ci-v2-agreement-relationship/);
    assert.match(agreement, /Booker/);
  });

  it("blocks when no active agreement is published", () => {
    const blocked = read({ blocker: "AGREEMENT_REQUIRED", version: null });
    assert.equal(buildCheckInAgreementSummary(blocked, "Hana").status, "Agreement unavailable");
    assert.match(agreement, /AGREEMENT_REQUIRED/);
    assert.match(agreement, /No active registration agreement is published for this property/);
  });

  it("does not allow Continue without an active agreement", () => {
    assert.equal(
      agreementCanContinue(read({ blocker: "AGREEMENT_REQUIRED", version: null })),
      false,
    );
    assert.equal(agreementCanContinue(null), false);
    assert.match(workspace, /agreementSigned \?/);
    assert.match(workspace, /fo-ci-v2-continue-review/);
  });

  it("loads acknowledgements from the agreement read", () => {
    const flags = agreementAcknowledgementState(
      read({
        draft: {
          id: "draft-1",
          agreementVersionId: "version-1",
          guestId: "guest-hana",
          reservationRoomId: "unit-205",
          acknowledgements: { terms: true },
        },
      }),
    );
    assert.deepEqual(flags, { terms: true });
    assert.match(agreement, /agreementAcknowledgementState\(agreement\)/);
  });

  it("saves acknowledgements before signing", () => {
    assert.match(agreement, /saveCheckInAgreement/);
    assert.match(agreement, /acknowledgements: flags/);
    assert.match(workspace, /fo-ci-v2-save-agreement-draft/);
    assert.match(agreement, /persistAcknowledgements\(\)/);
    assert.match(agreement, /Save the acknowledgements before signing/);
  });

  it("makes signed acknowledgements read-only", () => {
    assert.match(agreement, /disabled=\{readOnly \|\| !guestMatches\}/);
    assert.match(agreement, /agreement\.signed && !agreement\.draft/);
  });

  it("rejects a blank signature", () => {
    assert.equal(signatureHasInk(0), false);
    assert.equal(signatureHasInk(2), true);
    assert.match(agreement, /Draw a signature before signing/);
    assert.match(agreement, /signatureHasInk/);
  });

  it("stores a drawn signature on the existing agreement path", () => {
    assert.equal(
      agreementSignaturePath("property-1", "stay-1", "file-1"),
      "property-1/check-in-agreements/stay-1/file-1.png",
    );
    assert.match(agreement, /agreementSignaturePath/);
    assert.match(agreement, /from\("property-images"\)\.upload/);
    assert.match(agreement, /captureCheckInAgreementSignature/);
  });

  it("signs with method drawn", () => {
    assert.match(agreement, /method: "drawn"/);
  });

  it("refetches the agreement after signing", () => {
    const signed = agreement.slice(
      agreement.indexOf("await captureSignature"),
      agreement.indexOf("return true;"),
    );
    assert.match(signed, /agreementQuery\.refetch\(\)/);
    assert.match(signed, /onRefresh\(\)/);
  });

  it("renders a signed agreement as immutable", () => {
    assert.match(agreement, /data-testid="fo-ci-v2-agreement-signed"/);
    assert.match(agreement, /Registration Agreement Signed/);
    assert.doesNotMatch(agreement, /Edit signature|Replace agreement/);
  });

  it("shows the signed time, staff reference, and version", () => {
    assert.match(agreement, /signed\.signedAt/);
    assert.match(agreement, /signed\.capturedBy/);
    assert.match(agreement, /fo-ci-v2-agreement-signed-at/);
    assert.match(agreement, /fo-ci-v2-agreement-recorded-by/);
    assert.match(agreement, /agreementVersionLabel\(agreement\.version\)/);
  });

  it("does not sign a sibling unit", () => {
    assert.match(agreement, /data-guest-id=\{agreement\.guestId\}/);
    assert.match(agreement, /data-reservation-room-id=\{agreement\.reservationRoomId/);
    assert.doesNotMatch(agreement, /siblings\[0\]|sibling\.guest/);
  });

  it("refetches the agreement when the unit changes", () => {
    assert.match(workspace, /reservationRoomId=\{activeRoomId\}/);
    assert.match(agreement, /fo-ci-v2-agreement", restaurantId, reservationId, reservationRoomId/);
  });

  it("omits the unit id for a legacy stay", () => {
    assert.match(agreement, /\.\.\.\(reservationRoomId \? \{ reservationRoomId \} : \{\}\)/);
    assert.doesNotMatch(agreement, /reservationRoomId: null/);
  });

  it("returns to Payment & Guarantee without leaving the workspace", () => {
    assert.match(workspace, /fo-ci-v2-back-payment/);
    assert.match(workspace, /setStep\("payment_guarantee"\)/);
    assert.doesNotMatch(agreement, /navigate\(/);
  });

  it("continues only after the read confirms a signature", () => {
    assert.equal(
      agreementCanContinue(
        read({
          signed: {
            id: "instance-1",
            agreementVersionId: "version-1",
            guestId: "guest-hana",
            reservationRoomId: "unit-205",
            acknowledgements: { terms: true },
            signedAt: "2026-10-18T12:00:00.000Z",
            capturedBy: "staff-1",
            hasSignature: true,
          },
        }),
      ),
      true,
    );
    assert.equal(agreementCanContinue(read()), false);
    assert.match(agreement, /onReady\(agreementCanContinue\(agreement\)\)/);
  });

  it("advances Continue to the Step 5 review", () => {
    assert.match(workspace, /setStep\("review_checkin"\)/);
    assert.match(workspace, /FoCheckInV2Review/);
    assert.match(workspace, /data-testid="fo-ci-v2-back-agreement"/);
  });

  it("does not implement final check-in inside the agreement step", () => {
    assert.doesNotMatch(agreement, /completeFoCheckIn|Complete Check-In/);
    assert.match(workspace, /Complete Check-In/);
  });

  it("keeps the property version, unit instance, signature, and history", () => {
    const writer = readRel("./fo-check-in-agreement.functions.ts");
    assert.match(writer, /pms_registration_agreement_versions/);
    assert.match(writer, /fo_checkin_agreement_instances/);
    assert.match(writer, /reservation_room_id: target\.reservationRoomId/);
    assert.match(writer, /signature_storage_path: data\.storagePath/);
    assert.match(writer, /notes: "Registration agreement saved\."/);
    assert.match(writer, /notes: "Registration agreement signed\."/);
    assert.match(writer, /reservationRoomId: target\.reservationRoomId/);
  });

  it("does not use profile consent or email signature fields", () => {
    assert.doesNotMatch(agreement, /data_processing_consent|marketing_consent/);
    assert.doesNotMatch(agreement, /pms_communication_sender_settings|pms_communication_defaults/);
    assert.doesNotMatch(
      readRel("./fo-checkin-v2-agreement-model.ts"),
      /data_processing_consent|marketing_consent/,
    );
  });
});
