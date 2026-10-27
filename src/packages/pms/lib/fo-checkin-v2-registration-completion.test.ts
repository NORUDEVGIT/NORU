import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { assertCheckInWaiverRole } from "./fo-check-in-waiver";
import {
  evaluateCheckInReadiness,
  registrationCompletionProjection,
  registrationSnapshotIsComplete,
  type CheckInReadinessFacts,
} from "./fo-check-in-readiness";
import {
  buildRegistrationSave,
  registrationDocumentState,
  registrationIdentitySelection,
} from "./fo-checkin-v2-registration-model";
import { identityReviewTone } from "./fo-checkin-v2-review-model";
import { registrationProgressLabel } from "./fo-checkin-v2-model";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

function ready(patch: Partial<CheckInReadinessFacts> = {}): CheckInReadinessFacts {
  return {
    unitRequired: false,
    hasSiblings: false,
    target: {
      reservationRoomId: "unit-1",
      guestId: "guest-1",
      guestSource: "unit_primary",
      status: "confirmed",
      roomId: "room-1",
    },
    registrationComplete: true,
    registrationWaived: false,
    registrationWaiverReason: null,
    registrationWaivedBy: null,
    registrationWaivedAt: null,
    guestFieldErrors: [],
    identityDocumentErrors: [],
    verificationWarnings: [],
    verificationBlockers: [],
    roomEligible: true,
    roomReady: true,
    roomReadyReason: null,
    deposit: {
      requiredAmount: 0,
      receivedAmount: 0,
      outstanding: 0,
      satisfied: true,
      waived: false,
      waiverReason: null,
      waiverActor: null,
      waiverAt: null,
      guaranteeMethod: null,
    },
    agreementVersionId: "version-1",
    agreementSigned: true,
    keyRecorded: true,
    keyWaived: false,
    keyWaiverReason: null,
    keyWaivedBy: null,
    keyWaivedAt: null,
    earlyArrival: false,
    earlyCheckInAllowed: true,
    earlyCheckInNeedsApproval: false,
    ...patch,
  };
}

function project(facts: CheckInReadinessFacts, savedSnapshotExists = false) {
  const readiness = evaluateCheckInReadiness(facts);
  return {
    readiness,
    registration: registrationCompletionProjection({
      complete: readiness.registration.complete,
      waived: readiness.registration.waived,
      savedSnapshotExists,
      identitySatisfied:
        readiness.identity.valid &&
        !readiness.blockers.some((item) => item.code === "IDENTITY_DOCUMENT"),
      missingRequirements: readiness.blockers
        .filter((item) => item.code === "GUEST_FIELDS")
        .map((item) => item.message),
    }),
  };
}

describe("check-in v2 registration completion", () => {
  const workspace = readRel("../components/frontoffice/fo-checkin-v2-workspace.tsx");
  const registration = readRel("../components/frontoffice/fo-checkin-v2-registration.tsx");
  const review = readRel("../components/frontoffice/fo-checkin-v2-review.tsx");
  const registrationRead = readRel("./fo-check-in-registration.functions.ts");
  const waiver = readRel("./fo-check-in-waiver.functions.ts");

  it("keeps a saved snapshot incomplete when required registration data is missing", () => {
    const snapshot = { guestId: "guest-1", guestSource: "unit_primary", fields: { first_name: "Hana" } };
    assert.equal(registrationSnapshotIsComplete(snapshot), false);
    const view = project(ready({ registrationComplete: false }), true);
    assert.equal(view.registration.label, "Incomplete");
    assert.equal(view.registration.savedSnapshotExists, true);
    assert.equal(view.registration.state, "incomplete");
    assert.ok(view.readiness.blockers.some((item) => item.code === "REGISTRATION_INCOMPLETE"));
    assert.equal(view.readiness.canCheckIn, false);
  });

  it("marks registration complete only from the readiness result", () => {
    const snapshot = {
      guestId: "guest-1",
      fields: { first_name: "Hana", last_name: "Kebede", email: "hana@example.com" },
    };
    assert.equal(registrationSnapshotIsComplete(snapshot), true);
    const view = project(ready({ registrationComplete: true }), true);
    assert.equal(view.registration.label, "Complete");
    assert.equal(
      view.readiness.blockers.some((item) => item.code === "REGISTRATION_INCOMPLETE"),
      false,
    );
  });

  it("keeps identity satisfied while another registration requirement is missing", () => {
    const view = project(
      ready({
        registrationComplete: false,
        guestFieldErrors: ["Postal code is required."],
      }),
    );
    assert.equal(view.registration.identitySatisfied, true);
    assert.equal(identityReviewTone(view.readiness), "satisfied");
    assert.equal(view.registration.label, "Incomplete");
    assert.match(view.registration.detail ?? "", /Postal code is required/);
  });

  it("hydrates the authoritative guest document and does not call an empty record verified", () => {
    const documents = [
      {
        id: "empty",
        typeId: null,
        documentNumber: null,
        issuingCountry: null,
        issueDate: null,
        expiryDate: "2030-01-01",
        verificationStatus: "verified",
      },
      {
        id: "passport",
        typeId: "type-passport",
        documentNumber: "P100",
        issuingCountry: "ET",
        issueDate: "2024-01-02",
        expiryDate: "2030-01-01",
        verificationStatus: "verified",
      },
    ];
    const selected = registrationIdentitySelection(documents, "2026-10-22");
    assert.equal(selected?.id, "passport");
    assert.equal(selected?.issueDate, "2024-01-02");
    const empty = registrationDocumentState({
      documents: [documents[0]!],
      warnings: [],
      today: "2026-10-22",
    });
    assert.notEqual(empty.label, "Verified");
    assert.equal(empty.summary, "Identity details incomplete");
    const verified = registrationDocumentState({
      documents: [documents[1]!],
      warnings: [],
      today: "2026-10-22",
    });
    assert.equal(verified.label, "Verified");
    assert.notEqual(verified.summary, "Complete");
    assert.match(registration, /registrationIdentitySelection/);
    assert.match(registration, /identity\?\.issueDate/);
    assert.match(registrationRead, /issue_date/);
  });

  it("preserves guest profile address and name fields on save", () => {
    const saved = buildRegistrationSave({
      draft: {
        title: "ms",
        preferredName: "Hana",
        addressLine2: "Suite 4",
        region: "Addis Ababa",
        postalCode: "1000",
      },
      document: null,
    });
    assert.equal(saved.fields.title, "ms");
    assert.equal(saved.fields.preferred_name, "Hana");
    assert.equal(saved.fields.address_line2, "Suite 4");
    assert.equal(saved.fields.region, "Addis Ababa");
    assert.equal(saved.fields.postal_code, "1000");
  });

  it("treats an authorized registration waiver as waived, not complete", () => {
    assert.doesNotThrow(() => assertCheckInWaiverRole("owner"));
    assert.doesNotThrow(() => assertCheckInWaiverRole("manager"));
    assert.throws(() => assertCheckInWaiverRole("receptionist"));
    const view = project(
      ready({
        registrationComplete: false,
        registrationWaived: true,
        registrationWaiverReason: "Guest documents arrive later",
        registrationWaivedBy: "manager-1",
        registrationWaivedAt: "2026-10-22T08:00:00.000Z",
      }),
    );
    assert.equal(view.registration.label, "Waived");
    assert.equal(view.registration.detail, "Registration data incomplete — Waived");
    assert.equal(
      view.readiness.blockers.some((item) => item.code === "REGISTRATION_INCOMPLETE"),
      false,
    );
    assert.match(waiver, /requirement: z\.enum\(\["registration", "deposit", "key"\]\)/);
    assert.match(waiver, /reason: z\.string\(\)\.trim\(\)\.min\(1\)/);
    assert.match(waiver, /reservationRoomId: target\.reservationRoomId/);
    assert.match(waiver, /notes: "Check-in requirement waived\."/);
    assert.match(waiver, /assertCheckInWaiverRole/);
  });

  it("evaluates each room unit's registration snapshot on its own", () => {
    const unitOne = {
      guestId: "guest-1",
      fields: { first_name: "Hana", last_name: "Kebede", phone: "0911" },
    };
    const unitTwo = { guestId: "guest-2", fields: { first_name: "Kidus" } };
    assert.equal(registrationSnapshotIsComplete(unitOne), true);
    assert.equal(registrationSnapshotIsComplete(unitTwo), false);
    const base = ready();
    const one = project(
      ready({
        registrationComplete: true,
        target: { ...base.target!, reservationRoomId: "unit-1" },
      }),
    );
    const two = project(
      ready({
        registrationComplete: false,
        target: { ...base.target!, reservationRoomId: "unit-2" },
      }),
    );
    assert.equal(one.registration.label, "Complete");
    assert.equal(one.readiness.target?.reservationRoomId, "unit-1");
    assert.equal(two.registration.label, "Incomplete");
    assert.equal(two.readiness.target?.reservationRoomId, "unit-2");
    assert.match(workspace, /fo-ci-v2-readiness", restaurantId, reservationId, activeRoomId/);
    assert.match(registration, /reservationRoomId/);
  });

  it("uses one readiness projection for the step, rail, wizard, and review", () => {
    assert.equal(
      registrationProgressLabel({ current: false, visited: true, completion: null }),
      "Visited",
    );
    assert.equal(
      registrationProgressLabel({
        current: true,
        visited: false,
        completion: registrationCompletionProjection({ complete: false, waived: false }),
      }),
      "In progress",
    );
    assert.equal(
      registrationProgressLabel({
        current: false,
        visited: true,
        completion: registrationCompletionProjection({ complete: true, waived: false }),
      }),
      "Completed",
    );
    assert.match(workspace, /registrationCompletionProjection/);
    assert.match(workspace, /registrationCompletion\?\.label/);
    assert.match(workspace, /registrationProgressLabel/);
    assert.doesNotMatch(workspace, /registrationStatus\.summary/);
    assert.match(registration, /registrationCompletion\?\.label/);
    assert.match(registration, /fo-ci-v2-readiness", restaurantId, reservationId, reservationRoomId/);
    assert.match(review, /registrationCompletionProjection/);
    assert.match(review, /fo-ci-v2-review-registration-state/);
    assert.doesNotMatch(review, /Registration is not complete/);
  });
});
