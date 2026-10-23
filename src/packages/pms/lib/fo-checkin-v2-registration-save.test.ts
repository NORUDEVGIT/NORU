import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  registrationCountryValue,
  registrationIssuingCountry,
  registrationNationalityValue,
  registrationProfileColumns,
} from "./fo-check-in-registration";
import {
  registrationSnapshotGaps,
  registrationSnapshotIsComplete,
} from "./fo-check-in-readiness";
import { buildRegistrationSave } from "./fo-checkin-v2-registration-model";
import { canonicalRegistrationPhone } from "./pms-property-setup-phone";

const here = dirname(fileURLToPath(import.meta.url));
const registrationFn = readFileSync(join(here, "fo-check-in-registration.functions.ts"), "utf8");
const registrationUi = readFileSync(
  join(here, "../components/frontoffice/fo-checkin-v2-registration.tsx"),
  "utf8",
);

describe("check-in registration save path", () => {
  it("writes the guest profile columns, including the fields added on step 2", () => {
    const columns = registrationProfileColumns({
      title: "ms",
      firstName: "Hana",
      middleName: "Ali",
      lastName: "Kebede",
      preferredName: "Hana",
      nationality: "Ethiopian",
      phone: "+251911234567",
      email: "hana@example.com",
      addressLine1: "Bole Road",
      addressLine2: "Suite 4",
      city: "Addis Ababa",
      region: "Addis Ababa",
      postalCode: "1000",
      country: "Ethiopia",
    });
    assert.equal(columns.title, "ms");
    assert.equal(columns.first_name, "Hana");
    assert.equal(columns.middle_name, "Ali");
    assert.equal(columns.last_name, "Kebede");
    assert.equal(columns.preferred_name, "Hana");
    assert.equal(columns.nationality, "Ethiopian");
    assert.equal(columns.phone, "+251911234567");
    assert.equal(columns.email, "hana@example.com");
    assert.equal(columns.address_line1, "Bole Road");
    assert.equal(columns.address_line2, "Suite 4");
    assert.equal(columns.city, "Addis Ababa");
    assert.equal(columns.region, "Addis Ababa");
    assert.equal(columns.postal_code, "1000");
    assert.equal(columns.country, "Ethiopia");
  });

  it("normalizes a calling code without duplicating it", () => {
    assert.equal(canonicalRegistrationPhone("+251911234567"), "+251911234567");
    assert.equal(canonicalRegistrationPhone("+251 911 234 567"), "+251911234567");
    assert.equal(canonicalRegistrationPhone("+251251911234567"), "+251911234567");
    assert.equal(
      canonicalRegistrationPhone(canonicalRegistrationPhone("+251911234567")),
      "+251911234567",
    );
    assert.equal(canonicalRegistrationPhone("+251911234567").includes("🇪🇹"), false);
  });

  it("stores country and nationality without the flag label", () => {
    assert.equal(registrationNationalityValue("🇪🇹 Ethiopian (Ethiopia)"), "Ethiopian");
    assert.equal(registrationNationalityValue("Ethiopian"), "Ethiopian");
    assert.equal(registrationCountryValue("🇪🇹 Ethiopia"), "Ethiopia");
    assert.equal(registrationCountryValue("ET"), "Ethiopia");
    assert.equal(registrationIssuingCountry("🇪🇹 Ethiopia"), "ET");
    assert.equal(registrationIssuingCountry("ET"), "ET");
    const roundTrip = registrationProfileColumns({
      nationality: "🇪🇹 Ethiopian (Ethiopia)",
      country: "🇪🇹 Ethiopia",
    });
    assert.equal(roundTrip.nationality, "Ethiopian");
    assert.equal(roundTrip.country, "Ethiopia");
    assert.equal(registrationCountryValue(roundTrip.country ?? ""), "Ethiopia");
  });

  it("saves identity metadata on the same registration payload", () => {
    const saved = buildRegistrationSave({
      draft: { firstName: "Hana", lastName: "Kebede", phone: "+251911234567" },
      document: {
        documentId: "doc-1",
        idTypeId: "type-passport",
        documentNumber: "P100",
        issuingCountry: "Ethiopia",
        issueDate: "2024-01-02",
        expiryDate: "2030-01-01",
      },
    });
    assert.equal(saved.document?.idTypeId, "type-passport");
    assert.equal(saved.document?.documentNumber, "P100");
    assert.equal(saved.document?.issuingCountry, "ET");
    assert.equal(saved.document?.issueDate, "2024-01-02");
    assert.equal(saved.document?.expiryDate, "2030-01-01");
    assert.match(registrationFn, /saveGuestDocument/);
    assert.match(registrationUi, /Save ID/);
    assert.match(registrationUi, /document: payload.document/);
  });

  it("keeps the unit snapshot on the saved snake_case values for that room", () => {
    const saved = buildRegistrationSave({
      draft: { firstName: "Hana", lastName: "Kebede", phone: "+251911234567" },
      document: null,
    });
    const stored = registrationProfileColumns(saved.fields);
    assert.equal(stored.first_name, "Hana");
    assert.equal(stored.last_name, "Kebede");
    assert.equal(stored.phone, "+251911234567");
    assert.equal(
      registrationSnapshotIsComplete({
        guestId: "guest-1",
        guestSource: "unit_primary",
        fields: stored,
      }),
      true,
    );
    const save = registrationFn.slice(registrationFn.indexOf("export const saveCheckInUnitRegistration"));
    assert.match(save, /reservationRoomId: target\.reservationRoomId/);
    assert.match(save, /fields: columns/);
    const profileWrite = save.indexOf('.from("guest_profiles")');
    const snapshotWrite = save.indexOf("writeCheckInUnitProgress");
    assert.ok(profileWrite > -1 && profileWrite < snapshotWrite);
  });

  it("follows name plus phone or email and nothing weaker", () => {
    const phone = { fields: { first_name: "Hana", last_name: "Kebede", phone: "+251911234567" } };
    const email = { fields: { first_name: "Hana", last_name: "Kebede", email: "hana@example.com" } };
    const neither = { fields: { first_name: "Hana", last_name: "Kebede" } };
    assert.equal(registrationSnapshotIsComplete(phone), true);
    assert.equal(registrationSnapshotIsComplete(email), true);
    assert.equal(registrationSnapshotIsComplete(neither), false);
    assert.deepEqual(registrationSnapshotGaps(neither), ["Phone or email is required."]);
    assert.deepEqual(registrationSnapshotGaps({ fields: { phone: "+251911234567" } }), [
      "First and last name are required.",
    ]);
  });

  it("uses the form values in the snapshot instead of a second dropped mapping", () => {
    const stale = registrationProfileColumns({
      first_name: "Old",
      last_name: "Name",
      phone: "+251900000000",
    });
    const saved = buildRegistrationSave({
      draft: { firstName: "Hana", lastName: "Kebede", phone: "+251911234567", email: "" },
      document: null,
    });
    const snapshot = registrationProfileColumns(saved.fields);
    assert.notEqual(snapshot.first_name, stale.first_name);
    assert.equal(snapshot.first_name, "Hana");
    assert.equal(snapshot.phone, "+251911234567");
    assert.equal(registrationSnapshotIsComplete({ fields: snapshot }), true);
  });

  it("refetches readiness for this unit before continuing", () => {
    assert.match(registrationUi, /getCheckInReadiness/);
    assert.match(
      registrationUi,
      /fo-ci-v2-readiness", restaurantId, reservationId, reservationRoomId/,
    );
    assert.match(registrationUi, /registrationSnapshotGaps/);
    assert.match(registrationUi, /if \(!readiness\.registration\.complete && !readiness\.registration\.waived\)/);
    assert.doesNotMatch(registrationUi, /recordCheckInKey|completeFoCheckIn|postCheckInDeposit/);
  });
});
