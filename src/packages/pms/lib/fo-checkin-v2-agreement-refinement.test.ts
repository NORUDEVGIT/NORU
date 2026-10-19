import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CigaretteOff, FileText, IdCard, LogIn } from "lucide-react";
import { describe, it } from "vitest";

import {
  AgreementContent,
  AgreementPrintDocument,
} from "../components/frontoffice/fo-checkin-v2-agreement-document";
import type { CheckInAgreementRead, CheckInAgreementVersion } from "./fo-check-in-agreement";
import { agreementSectionIcon } from "./fo-checkin-v2-agreement-icons";
import {
  CHECKIN_AGREEMENT_REVIEW_FLAG,
  agreementAcknowledgementItems,
  agreementAcknowledgementState,
  agreementCanContinue,
  agreementMissingRequired,
  agreementSectionItems,
  agreementSignReady,
  agreementVersionLabel,
} from "./fo-checkin-v2-agreement-model";

const here = dirname(fileURLToPath(import.meta.url));
const readRel = (rel: string) => readFileSync(join(here, rel), "utf8");

const workspace = readRel("../components/frontoffice/fo-checkin-v2-workspace.tsx");
const component = readRel("../components/frontoffice/fo-checkin-v2-agreement.tsx");
const documentSource = readRel("../components/frontoffice/fo-checkin-v2-agreement-document.tsx");

const VERSION_ID = "6f1c2a7e-1111-4c2b-9d1e-0a1b2c3d4e5f";

function version(overrides: Partial<CheckInAgreementVersion> = {}): CheckInAgreementVersion {
  return {
    id: VERSION_ID,
    label: "3",
    body: "",
    legacy: false,
    title: "Guest Registration Agreement",
    intro: "Welcome to the property.",
    leadIn: "By signing, the guest agrees to the following:",
    acknowledgementTitle: "Guest Acknowledgement",
    acknowledgementIntro: "Please confirm each item.",
    sections: [
      {
        id: "smoking_policy",
        title: "Smoking Policy",
        description: "No smoking.",
        displayOrder: 50,
      },
      { id: "check_in_time", title: "Check-in Time", description: "From 14:00.", displayOrder: 10 },
      {
        id: "custom_pool",
        title: "Pool Rules",
        description: "Pool closes at 20:00.",
        displayOrder: 80,
      },
      { id: "identification", title: "Identification", description: "Valid ID.", displayOrder: 30 },
    ],
    acknowledgements: [
      {
        id: "hotel_terms",
        title: "Hotel Terms",
        statement: "I accept the configured terms.",
        required: true,
        displayOrder: 20,
      },
      {
        id: "registration_information",
        title: "Registration",
        statement: "My registration details are correct.",
        required: true,
        displayOrder: 10,
      },
      {
        id: "marketing_updates",
        title: "Updates",
        statement: "Optional statement from configuration.",
        required: false,
        displayOrder: 30,
      },
    ],
    ...overrides,
  };
}

function read(overrides: Partial<CheckInAgreementRead> = {}): CheckInAgreementRead {
  return {
    reservationRoomId: "unit-205",
    guestId: "guest-hana",
    guestSource: "unit_primary",
    blocker: null,
    version: version(),
    signed: null,
    draft: null,
    ...overrides,
  };
}

const signedRead = read({
  signed: {
    id: "instance-1",
    agreementVersionId: VERSION_ID,
    guestId: "guest-hana",
    reservationRoomId: "unit-205",
    acknowledgements: {
      registration_information: true,
      hotel_terms: true,
      marketing_updates: false,
    },
    signedAt: "2026-10-18T12:00:00.000Z",
    capturedBy: "abcdef12-0000-4000-8000-000000000000",
    hasSignature: true,
  },
});

const context = {
  propertyName: "Test International Hotel",
  guestName: "Hana Ali Kebede",
  confirmationNumber: "NRU-1042",
  roomNumber: "205",
  arrivalDate: "2026-10-18",
  departureDate: "2026-10-21",
};

function renderPanel(target: CheckInAgreementRead): string {
  return renderToStaticMarkup(
    createElement(AgreementContent, { read: target, version: target.version!, variant: "panel" }),
  );
}

function renderPrint(target: CheckInAgreementRead, signatureUrl: string | null): string {
  return renderToStaticMarkup(
    createElement(AgreementPrintDocument, {
      read: target,
      version: target.version!,
      items: agreementAcknowledgementItems(target),
      context,
      signatureUrl,
    }),
  );
}

describe("check-in v2 step 4 refinement", () => {
  it("1. renders configured sections in display order", () => {
    const html = renderPanel(read());
    const ids = ["check_in_time", "identification", "smoking_policy", "custom_pool"];
    const positions = ids.map((id) => html.indexOf(`fo-ci-v2-agreement-section-${id}`));
    assert.ok(positions.every((value) => value >= 0));
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
    );
    assert.deepEqual(
      agreementSectionItems(read()).map((section) => section.id),
      ids,
    );
  });

  it("2. gives known sections a semantic icon", () => {
    assert.equal(agreementSectionIcon({ id: "check_in_time", title: "" }), LogIn);
    assert.equal(agreementSectionIcon({ id: "identification", title: "" }), IdCard);
    assert.equal(agreementSectionIcon({ id: "x", title: "Smoking Policy" }), CigaretteOff);
  });

  it("3. gives a custom section the neutral fallback icon", () => {
    assert.equal(agreementSectionIcon({ id: "custom_pool", title: "Pool Rules" }), FileText);
  });

  it("4. renders the agreement title, intro, and lead-in", () => {
    const html = renderPanel(read());
    assert.match(html, /Welcome to the property\./);
    assert.match(html, /By signing, the guest agrees to the following:/);
    assert.match(component, /data-testid="fo-ci-v2-agreement-title"/);
    assert.match(component, /version\.title/);
  });

  it("5. does not show the version UUID prominently", () => {
    assert.equal(agreementVersionLabel(version()), "Version 3");
    assert.equal(agreementVersionLabel(version({ label: VERSION_ID })), "Published Agreement");
    assert.equal(agreementVersionLabel(version({ label: "" })), "Published Agreement");
    assert.doesNotMatch(renderPrint(read(), null), new RegExp(VERSION_ID));
    assert.doesNotMatch(component, /Version \{version\.id\}/);
  });

  it("6. renders enabled acknowledgements from the read", () => {
    const items = agreementAcknowledgementItems(read()).map((item) => item.id);
    assert.deepEqual(items, ["registration_information", "hotel_terms", "marketing_updates"]);
    assert.match(component, /agreementAcknowledgementItems\(agreement\)/);
    assert.match(component, /\{item\.statement\}/);
  });

  it("7. does not render acknowledgements the read omits as disabled", () => {
    const without = read({
      version: version({ acknowledgements: version().acknowledgements!.slice(0, 1) }),
    });
    assert.deepEqual(Object.keys(agreementAcknowledgementState(without)), ["hotel_terms"]);
  });

  it("8. marks required acknowledgements", () => {
    assert.match(component, /aria-required=\{item\.required\}/);
    assert.match(component, /-required`\}/);
  });

  it("9. does not block signing on optional acknowledgements", () => {
    const flags = { registration_information: true, hotel_terms: true, marketing_updates: false };
    assert.deepEqual(agreementMissingRequired(read(), flags), []);
  });

  it("10. removes the generic reviewed checkbox for configured versions", () => {
    const flags = agreementAcknowledgementState(read());
    assert.equal(CHECKIN_AGREEMENT_REVIEW_FLAG in flags, false);
    assert.doesNotMatch(component, /Reviewed with the guest/);
  });

  it("11. keys flags by the configured acknowledgement ids", () => {
    const seeded = agreementAcknowledgementState(
      read({
        draft: {
          id: "draft-1",
          agreementVersionId: VERSION_ID,
          guestId: "guest-hana",
          reservationRoomId: "unit-205",
          acknowledgements: { hotel_terms: true, stale_key: true },
        },
      }),
    );
    assert.deepEqual(seeded, {
      registration_information: false,
      hotel_terms: true,
      marketing_updates: false,
    });
  });

  it("12. saves with saveCheckInAgreement and refetches", () => {
    const persist = component.slice(
      component.indexOf("async function persistAcknowledgements"),
      component.indexOf("const saveMut"),
    );
    assert.match(persist, /saveAgreement\(/);
    assert.match(persist, /acknowledgements: flags/);
    assert.match(persist, /agreementQuery\.refetch\(\)/);
    assert.match(component, /saveCheckInAgreement/);
  });

  it("13. disables Sign without the required acknowledgements", () => {
    assert.equal(
      agreementSignReady({
        read: read(),
        flags: { registration_information: true, hotel_terms: false },
        strokes: 3,
        guestMatches: true,
      }),
      false,
    );
  });

  it("14. disables Sign without signature strokes", () => {
    assert.equal(
      agreementSignReady({
        read: read(),
        flags: { registration_information: true, hotel_terms: true },
        strokes: 0,
        guestMatches: true,
      }),
      false,
    );
  });

  it("15. enables Sign when the requirements are met", () => {
    assert.equal(
      agreementSignReady({
        read: read(),
        flags: { registration_information: true, hotel_terms: true, marketing_updates: false },
        strokes: 3,
        guestMatches: true,
      }),
      true,
    );
    assert.match(workspace, /disabled=\{!agreementActions\.canSign \|\| agreementActions\.busy\}/);
  });

  it("16. signs with captureCheckInAgreementSignature after persisting acknowledgements", () => {
    const signBody = component.slice(
      component.indexOf("async function sign()"),
      component.indexOf("signRef.current = sign"),
    );
    assert.ok(
      signBody.indexOf("persistAcknowledgements()") < signBody.indexOf("captureSignature("),
    );
    assert.match(signBody, /method: "drawn"/);
    assert.match(component, /captureCheckInAgreementSignature/);
  });

  it("17. makes the signed state read-only", () => {
    assert.equal(
      agreementSignReady({
        read: signedRead,
        flags: { registration_information: true, hotel_terms: true },
        strokes: 3,
        guestMatches: true,
      }),
      false,
    );
    assert.match(component, /disabled=\{readOnly \|\| !guestMatches\}/);
    assert.match(component, /Agreement Signed/);
    assert.match(component, /Create New Signature/);
    assert.doesNotMatch(component, /Edit Signature/i);
  });

  it("18. opens View Full Agreement with sections and acknowledgements", () => {
    assert.match(component, /data-testid="fo-ci-v2-agreement-view-full"/);
    assert.match(component, /setFullView\(true\)/);
    const dialog = documentSource.slice(
      documentSource.indexOf("export function FullAgreementDialog"),
      documentSource.indexOf("const PRINT_CLASS"),
    );
    assert.match(dialog, /AgreementContent/);
    assert.match(dialog, /AcknowledgementSummaryList/);
  });

  it("19. prints a dedicated layout that hides the workspace chrome", () => {
    assert.match(component, /data-testid="fo-ci-v2-agreement-print"/);
    assert.match(component, /window\.print\(\)/);
    assert.match(documentSource, /@media print/);
    assert.match(documentSource, /body \* \{ visibility: hidden; \}/);
    const html = renderPrint(read(), null);
    assert.match(html, /HOTEL REGISTRATION AGREEMENT/);
    assert.match(html, /Test International Hotel/);
    assert.match(html, /NRU-1042/);
    assert.match(html, /Room 205/);
    assert.match(html, /Agreement Version/);
    assert.doesNotMatch(html, /<button|Check-In Summary|fo-ci-v2-stepper|Next: Review/);
  });

  it("20. prints the signature for a signed agreement", () => {
    const html = renderPrint(signedRead, "https://example.test/signature.png");
    assert.match(html, /src="https:\/\/example\.test\/signature\.png"/);
    assert.match(html, /Signed by/);
    assert.match(html, /Recorded by/);
    assert.match(html, /Accepted/);
    assert.doesNotMatch(html, /Unsigned/);
  });

  it("21. prints Unsigned for an unsigned agreement", () => {
    const html = renderPrint(read(), null);
    assert.match(html, /Unsigned/);
    assert.doesNotMatch(html, /Signed by/);
  });

  it("22. uses the unit guest for the signer", () => {
    assert.match(component, /data-testid="fo-ci-v2-signature-signer">\{unit\.primaryGuestName\}/);
    assert.match(component, /agreement\.guestId === unit\.primaryGuestId/);
  });

  it("23. does not leak a sibling unit", () => {
    assert.doesNotMatch(component, /siblings/);
    assert.equal(
      agreementSignReady({
        read: read(),
        flags: { registration_information: true, hotel_terms: true },
        strokes: 3,
        guestMatches: false,
      }),
      false,
    );
  });

  it("24. keeps the legacy no-unit path", () => {
    assert.match(component, /\.\.\.\(reservationRoomId \? \{ reservationRoomId \} : \{\}\)/);
    const legacy = read({
      reservationRoomId: null,
      version: version({ legacy: true, body: "Old text", sections: [], acknowledgements: [] }),
    });
    assert.deepEqual(agreementAcknowledgementState(legacy), {
      [CHECKIN_AGREEMENT_REVIEW_FLAG]: false,
    });
    assert.match(renderPanel(legacy), /Old text/);
  });

  it("25. goes back to Step 3", () => {
    assert.match(workspace, /data-testid="fo-ci-v2-back-payment"/);
    assert.match(workspace, /onClick=\{\(\) => setStep\("payment_guarantee"\)\}/);
  });

  it("26. enables Next once signed", () => {
    assert.equal(agreementCanContinue(signedRead), true);
    assert.equal(agreementCanContinue(read()), false);
    assert.match(workspace, /Next: Review & Check-In/);
  });

  it("27. sends Next only to the Step 5 shell", () => {
    const footer = workspace.slice(workspace.indexOf('data-testid="fo-ci-v2-continue-review"'));
    assert.match(footer.slice(0, 200), /setStep\("review_checkin"\)/);
    assert.match(workspace, /FoCheckInV2Review/);
  });

  it("28. keeps completion out of the agreement step", () => {
    for (const source of [component, documentSource]) {
      assert.doesNotMatch(source, /completeFoCheckIn|Complete Check-In/);
    }
    assert.match(workspace, /FoCheckInV2Review/);
  });

  it("29. removes the inner agreement scroll", () => {
    assert.doesNotMatch(component + documentSource, /max-h-80 overflow-y-auto/);
  });

  it("30. offers Save as Draft only before signing", () => {
    const footer = workspace.slice(workspace.indexOf("agreementSigned ? ("));
    assert.ok(footer.indexOf("fo-ci-v2-continue-review") < footer.indexOf("Save as Draft"));
    assert.match(workspace, /agreementRef\.current\?\.save\(\)/);
  });

  it("31. shows Step 4 completed in progress once signed", () => {
    assert.match(workspace, /agreementSummary\?\.status === "Signed"/);
  });

  it("32. keeps decorative icons hidden and controls labeled", () => {
    assert.match(documentSource, /aria-hidden="true"/);
    assert.match(component, /aria-label="View full agreement"/);
    assert.match(component, /aria-label="Print agreement"/);
    assert.match(component, /aria-label="Signature area/);
    assert.match(component, /<span className="sr-only">\(required\)<\/span>/);
    assert.doesNotMatch(component, /Use Device/);
  });
});
