import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { guestRowForCheckInRules } from "./fo-check-in-registration.ts";
import {
  registrationCanonicalKey,
  registrationCustomErrors,
  registrationRequiredErrors,
} from "./fo-checkin-v2-registration-model.ts";
import {
  CHECK_IN_WITHOUT_PARTY_LINKS,
  checkInFieldParty,
  checkInRegistrationCollects,
  checkInRequirementApplies,
  resolveGuestFieldRules,
  identityDocumentOnFile,
  validateGuestCheckInRequirements,
} from "./guest-field-rules.ts";

describe("check-in field requirements", () => {
  it("keeps a guest field required when Check-in is on", () => {
    assert.equal(
      checkInRequirementApplies(
        { code: "PHONE", active: true, checkIn: true },
        CHECK_IN_WITHOUT_PARTY_LINKS,
      ),
      true,
    );
    assert.equal(
      checkInRequirementApplies(
        { code: "PHONE", active: true, checkIn: false },
        CHECK_IN_WITHOUT_PARTY_LINKS,
      ),
      false,
    );
  });

  it("requires a company, agency, or group field only when that party is linked", () => {
    const company = { code: "COMPANY_NAME", active: true, checkIn: true };
    assert.equal(checkInFieldParty("COMPANY"), "company");
    assert.equal(checkInRequirementApplies(company, CHECK_IN_WITHOUT_PARTY_LINKS), false);
    assert.equal(
      checkInRequirementApplies(company, { company: true, travelAgency: false, group: false }),
      true,
    );
    assert.equal(
      checkInRequirementApplies(
        { code: "TA_NAME", active: true, checkIn: true },
        { company: false, travelAgency: false, group: false },
      ),
      false,
    );
    assert.equal(
      checkInRequirementApplies(
        { code: "GROUP_NAME", active: true, checkIn: true },
        { company: false, travelAgency: false, group: true },
      ),
      true,
    );
  });

  it("collects profile and custom guest fields, and leaves party fields off the guest form", () => {
    assert.equal(
      checkInRegistrationCollects({ code: "EMAIL", category: "core_mapped", canonicalKey: "email" }),
      true,
    );
    assert.equal(
      checkInRegistrationCollects({
        code: "LOYALTY_CODE",
        category: "custom_value",
        canonicalKey: null,
      }),
      true,
    );
    assert.equal(
      checkInRegistrationCollects({
        code: "COMPANY_NAME",
        category: "core_mapped",
        canonicalKey: null,
      }),
      false,
    );
  });

  it("reads snake_case profile columns as the check-in rule keys", () => {
    const values = guestRowForCheckInRules({
      first_name: "Ada",
      date_of_birth: "1990-01-01",
      phone: "+251911",
    });
    assert.equal(values.firstName, "Ada");
    assert.equal(values.dateOfBirth, "1990-01-01");
    assert.equal(values.phone, "+251911");
  });

  it("treats Check-in on as required at check-in even when Required is off", () => {
    const config = {
      fields: [
        {
          id: "phone-field",
          code: "PHONE",
          name: "Phone",
          fieldType: "phone",
          required: false,
          checkIn: true,
          reservation: true,
          active: true,
          displayOrder: 1,
          options: [],
          documentTypeIds: [],
        },
      ],
      profileTypes: [],
      idTypes: [],
      identityDocumentActive: false,
    } as unknown as Parameters<typeof resolveGuestFieldRules>[0];
    const rules = resolveGuestFieldRules(config, undefined, "check_in", CHECK_IN_WITHOUT_PARTY_LINKS);
    const phone = rules.find((rule) => rule.code === "PHONE");
    assert.equal(phone?.required, false);
    assert.equal(phone?.requiredForContext, true);
    assert.equal(registrationCanonicalKey("PHONE"), "phone");

    const blocked = validateGuestCheckInRequirements({
      guest: { first_name: "Ada", phone: "" } as unknown as Parameters<typeof validateGuestCheckInRequirements>[0]["guest"],
      documents: [],
      config,
      customFieldValues: {},
    });
    assert.equal(blocked.valid, false);
    assert.ok(blocked.errors.some((error) => error.includes("Phone is required.")));
  });

  it("keeps First Name required at check-in even when its saved row is inactive", () => {
    const config = {
      fields: [
        {
          id: "f1",
          code: "FIRST_NAME",
          name: "First Name",
          fieldType: "text",
          required: false,
          checkIn: true,
          reservation: true,
          active: false,
          displayOrder: 1,
          options: [],
          documentTypeIds: [],
        },
        {
          id: "f2",
          code: "PHONE",
          name: "Phone",
          fieldType: "phone",
          required: false,
          checkIn: false,
          reservation: false,
          active: true,
          displayOrder: 2,
          options: [],
          documentTypeIds: [],
        },
      ],
      profileTypes: [],
      idTypes: [],
    } as unknown as Parameters<typeof resolveGuestFieldRules>[0];
    const rules = resolveGuestFieldRules(config, "IND", "check_in", CHECK_IN_WITHOUT_PARTY_LINKS);
    const first = rules.find((rule) => rule.code === "FIRST_NAME");
    assert.equal(first?.requiredForContext, true);
    assert.equal(first?.active, true);
    assert.equal(rules.find((rule) => rule.code === "PHONE")?.requiredForContext, false);
  });

  it("accepts the identity document saved at registration for ID / Passport", () => {
    const config = {
      identityDocumentActive: true,
      identityDocumentTypes: [],
      fields: [
        {
          id: "id-field",
          code: "IDENTITY_DOCUMENT",
          name: "ID / Passport",
          fieldType: "document",
          required: true,
          checkIn: true,
          reservation: false,
          active: true,
          displayOrder: 1,
          options: [],
        },
      ],
    } as unknown as Parameters<typeof validateGuestCheckInRequirements>[0]["config"];
    const guest = { firstName: "Ada", lastName: "Lovelace" } as unknown as Parameters<
      typeof validateGuestCheckInRequirements
    >[0]["guest"];
    const saved = [
      {
        id: "doc-1",
        typeId: "type-passport",
        kind: "passport",
        documentNumberMasked: "P123456",
        issuingCountry: "ET",
        expiryDate: "2030-01-01",
      },
    ];
    assert.equal(identityDocumentOnFile(saved), true);
    const accepted = validateGuestCheckInRequirements({
      guest,
      documents: saved,
      config,
    });
    assert.equal(
      accepted.errors.some((error) => error.includes("ID / Passport")),
      false,
    );

    const missing = validateGuestCheckInRequirements({
      guest,
      documents: [],
      config,
    });
    assert.ok(missing.errors.some((error) => error.includes("ID / Passport is required.")));
  });

  it("does not block registration on a field the form cannot edit", () => {
    assert.deepEqual(
      registrationRequiredErrors(
        [{ code: "COMPANY_NAME", label: "Company name", required: true, value: null }],
        { firstName: "Ada" },
      ),
      [],
    );
    assert.deepEqual(
      registrationCustomErrors(
        [{ fieldId: "field-1", label: "Loyalty code" }],
        { "field-1": "" },
      ),
      ["Loyalty code is required."],
    );
  });
});
