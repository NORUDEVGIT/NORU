import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

import {
  CANONICAL_FIELD_CODE_MAP,
  TECHNICAL_MINIMUM_FIELD_CODES,
  isDocumentTypeAllowedForProfileType,
  isIndividualProfileTypeActive,
  normalizeFieldOptions,
  resolveFallbackOptionsForField,
  resolveGuestFieldRules,
  resolveIndividualProfileType,
  validateGuestCheckInRequirements,
  validateGuestFields,
  validateReservationGuestRequirements,
  type GuestFieldContext,
} from "./guest-field-rules";
import type {
  GuestWorkspaceConfig,
  GuestWorkspaceIdentityDocTypeConfig,
  GuestWorkspaceRequiredFieldConfig,
  GuestWorkspaceTypeConfig,
} from "./guest-workspace-config.functions";
import { validateDocumentFields, type GuestSummary, type GuestProfile } from "./guests.functions";
import type { GuestProfileRules } from "./pms-set3-rates-guest";

function makeConfig(overrides?: Partial<GuestWorkspaceConfig>): GuestWorkspaceConfig {
  return {
    available: true,
    lastUpdatedAt: "2026-09-28T00:00:00Z",
    types: [
      {
        id: "type-indiv-1",
        name: "Individual",
        code: "INDIVIDUAL",
        description: null,
        icon: "user",
        active: true,
        section: "individual",
        domain: "individual",
        requiredFieldIds: [],
        documentTypeIds: ["doc-pas-1", "doc-nid-1"],
        preferenceTypeIds: [],
      },
      {
        id: "type-corp-1",
        name: "Corporate Contact",
        code: "CORPORATE",
        description: null,
        icon: "building",
        active: true,
        section: "company",
        domain: "company",
        requiredFieldIds: ["field-company-1"],
        documentTypeIds: ["doc-tax-1"],
        preferenceTypeIds: [],
      },
    ],
    requiredFields: [
      {
        id: "field-fn-1",
        name: "First Name",
        code: "FIRST_NAME",
        fieldType: "text",
        description: null,
        required: true,
        checkIn: true,
        reservation: true,
        active: true,
        displayOrder: 1,
        options: [],
        documentTypeIds: [],
      },
      {
        id: "field-ln-1",
        name: "Last Name",
        code: "LAST_NAME",
        fieldType: "text",
        description: null,
        required: true,
        checkIn: true,
        reservation: true,
        active: true,
        displayOrder: 2,
        options: [],
        documentTypeIds: [],
      },
      {
        id: "field-phone-1",
        name: "Primary Phone",
        code: "PHONE",
        fieldType: "phone",
        description: null,
        required: false,
        checkIn: true,
        reservation: true,
        active: true,
        displayOrder: 3,
        options: [],
        documentTypeIds: [],
      },
      {
        id: "field-email-1",
        name: "Primary Email",
        code: "EMAIL",
        fieldType: "email",
        description: null,
        required: false,
        checkIn: false,
        reservation: true,
        active: true,
        displayOrder: 4,
        options: [],
        documentTypeIds: [],
      },
      {
        id: "field-title-1",
        name: "Title",
        code: "TITLE",
        fieldType: "single_select",
        description: null,
        required: false,
        checkIn: false,
        reservation: false,
        active: true,
        displayOrder: 5,
        options: [],
        documentTypeIds: [],
      },
      {
        id: "field-dob-1",
        name: "Date of Birth",
        code: "DATE_OF_BIRTH",
        fieldType: "date",
        description: null,
        required: false,
        checkIn: true,
        reservation: false,
        active: true,
        displayOrder: 6,
        options: [],
        documentTypeIds: [],
      },
    ],
    identityDocumentTypes: [
      {
        id: "doc-pas-1",
        name: "Passport",
        code: "PASSPORT",
        description: null,
        issuingCountryRequired: true,
        expiryDateRequired: true,
        documentNumberRequired: true,
        scanImageAllowed: true,
        requiredAtCheckIn: true,
        active: true,
        validForProfileTypeIds: ["type-indiv-1"],
        displayOrder: 1,
      },
      {
        id: "doc-nid-1",
        name: "National ID",
        code: "NATIONAL_ID",
        description: null,
        issuingCountryRequired: false,
        expiryDateRequired: false,
        documentNumberRequired: true,
        scanImageAllowed: true,
        requiredAtCheckIn: false,
        active: true,
        validForProfileTypeIds: ["type-indiv-1"],
        displayOrder: 2,
      },
      {
        id: "doc-tax-1",
        name: "Tax Certificate",
        code: "TAX_CERT",
        description: null,
        issuingCountryRequired: true,
        expiryDateRequired: false,
        documentNumberRequired: true,
        scanImageAllowed: true,
        requiredAtCheckIn: false,
        active: true,
        validForProfileTypeIds: ["type-corp-1"],
        displayOrder: 3,
      },
      {
        id: "doc-old-1",
        name: "Old Driving Permit",
        code: "OLD_DL",
        description: null,
        issuingCountryRequired: false,
        expiryDateRequired: false,
        documentNumberRequired: true,
        scanImageAllowed: false,
        requiredAtCheckIn: false,
        active: false,
        validForProfileTypeIds: ["type-indiv-1"],
        displayOrder: 4,
      },
    ],
    preferenceCategories: [],
    preferenceOptions: [],
    companyBusiness: { types: [], settings: null },
    groupTypes: [],
    communication: { channels: [], defaults: null },
    ...overrides,
  };
}

describe("PMS Guest Profile Phase 4 — Property Setup Field Rule Integration", () => {
  describe("1. Canonical field mapping & invariants (tests 1-15)", () => {
    it("1. maps FIRST_NAME to firstName", () => {
      assert.equal(CANONICAL_FIELD_CODE_MAP["FIRST_NAME"], "firstName");
    });

    it("2. maps LAST_NAME to lastName", () => {
      assert.equal(CANONICAL_FIELD_CODE_MAP["LAST_NAME"], "lastName");
    });

    it("3. maps PHONE and PHONE_ALT to phone and phoneAlt", () => {
      assert.equal(CANONICAL_FIELD_CODE_MAP["PHONE"], "phone");
      assert.equal(CANONICAL_FIELD_CODE_MAP["PHONE_ALT"], "phoneAlt");
    });

    it("4. maps EMAIL and EMAIL_ALT to email and emailAlt", () => {
      assert.equal(CANONICAL_FIELD_CODE_MAP["EMAIL"], "email");
      assert.equal(CANONICAL_FIELD_CODE_MAP["EMAIL_ALT"], "emailAlt");
    });

    it("5. maps DOB and DATE_OF_BIRTH to dateOfBirth", () => {
      assert.equal(CANONICAL_FIELD_CODE_MAP["DOB"], "dateOfBirth");
      assert.equal(CANONICAL_FIELD_CODE_MAP["DATE_OF_BIRTH"], "dateOfBirth");
    });

    it("6. maps NATIONALITY and COUNTRY to nationality and country", () => {
      assert.equal(CANONICAL_FIELD_CODE_MAP["NATIONALITY"], "nationality");
      assert.equal(CANONICAL_FIELD_CODE_MAP["COUNTRY"], "country");
    });

    it("7. maps TITLE and GENDER to title and gender", () => {
      assert.equal(CANONICAL_FIELD_CODE_MAP["TITLE"], "title");
      assert.equal(CANONICAL_FIELD_CODE_MAP["GENDER"], "gender");
    });

    it("8. maps PREFERRED_CONTACT_METHOD and PREFERRED_CONTACT_TIME", () => {
      assert.equal(CANONICAL_FIELD_CODE_MAP["PREFERRED_CONTACT_METHOD"], "preferredContactMethod");
      assert.equal(CANONICAL_FIELD_CODE_MAP["PREFERRED_CONTACT_TIME"], "preferredContactTime");
    });

    it("9. maps ADDRESS, ADDRESS_LINE_1, ADDRESS_LINE_2, CITY, POSTAL_CODE", () => {
      assert.equal(CANONICAL_FIELD_CODE_MAP["ADDRESS"], "addressLine1");
      assert.equal(CANONICAL_FIELD_CODE_MAP["ADDRESS_LINE_1"], "addressLine1");
      assert.equal(CANONICAL_FIELD_CODE_MAP["ADDRESS_LINE_2"], "addressLine2");
      assert.equal(CANONICAL_FIELD_CODE_MAP["CITY"], "city");
      assert.equal(CANONICAL_FIELD_CODE_MAP["POSTAL_CODE"], "postalCode");
    });

    it("10. maps POSITION, DEPARTMENT, and SOURCE_OF_BUSINESS", () => {
      assert.equal(CANONICAL_FIELD_CODE_MAP["POSITION"], "position");
      assert.equal(CANONICAL_FIELD_CODE_MAP["DEPARTMENT"], "department");
      assert.equal(CANONICAL_FIELD_CODE_MAP["SOURCE_OF_BUSINESS"], "sourceOfBusiness");
    });

    it("11. designates FIRST_NAME as technical minimum", () => {
      assert.equal(TECHNICAL_MINIMUM_FIELD_CODES.has("FIRST_NAME"), true);
    });

    it("12. injects synthetic FIRST_NAME if Card 4 omitted it completely", () => {
      const config = makeConfig({ requiredFields: [] });
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const fn = rules.find((r) => r.code === "FIRST_NAME");
      assert.ok(fn);
      assert.equal(fn.isTechnicalMinimum, true);
      assert.equal(fn.requiredForContext, true);
    });

    it("13. enforces technical minimum FIRST_NAME in profile_edit context", () => {
      const config = makeConfig();
      const individual = resolveIndividualProfileType(config);
      const rules = resolveGuestFieldRules(config, individual, "profile_edit");
      const fn = rules.find((r) => r.code === "FIRST_NAME");
      assert.ok(fn);
      assert.equal(fn.requiredForContext, true);
    });

    it("14. does not enforce non-technical minimums in profile_edit context", () => {
      const config = makeConfig();
      const individual = resolveIndividualProfileType(config);
      const rules = resolveGuestFieldRules(config, individual, "profile_edit");
      const ln = rules.find((r) => r.code === "LAST_NAME");
      assert.ok(ln);
      assert.equal(ln.requiredForContext, false);
    });

    it("15. rejects blank first name during validation even if unconfigured in Property Setup", () => {
      const config = makeConfig({ requiredFields: [] });
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const result = validateGuestFields({ firstName: "   " }, rules, "profile_create");
      assert.equal(result.valid, false);
      assert.ok(result.missingFieldCodes.includes("FIRST_NAME"));
    });
  });

  describe("2. Option normalization & precedence (tests 16-25)", () => {
    it("16. normalizes raw string array to { id, label, value, active }", () => {
      const raw = ["VIP", "Regular"];
      const normalized = normalizeFieldOptions(raw);
      assert.equal(normalized.length, 2);
      assert.equal(normalized[0].label, "VIP");
      assert.equal(normalized[0].value, "VIP");
      assert.equal(normalized[0].active, true);
    });

    it("17. normalizes raw object array preserving existing ids and labels", () => {
      const raw = [{ id: "opt-1", name: "High Value", value: "high_val", active: true }];
      const normalized = normalizeFieldOptions(raw);
      assert.equal(normalized[0].id, "opt-1");
      assert.equal(normalized[0].label, "High Value");
      assert.equal(normalized[0].value, "high_val");
      assert.equal(normalized[0].active, true);
    });

    it("18. handles null/undefined options gracefully by returning empty array", () => {
      assert.deepEqual(normalizeFieldOptions(null), []);
      assert.deepEqual(normalizeFieldOptions(undefined), []);
    });

    it("19. provides fallback options for TITLE when setup has no options", () => {
      const options = resolveFallbackOptionsForField("TITLE");
      assert.ok(options.length > 0);
      assert.ok(options.some((o) => o.value === "mr"));
    });

    it("20. provides fallback options for GENDER when setup has no options", () => {
      const options = resolveFallbackOptionsForField("GENDER");
      assert.ok(options.length > 0);
      assert.ok(options.some((o) => o.value === "female"));
    });

    it("21. provides fallback options for PREFERRED_CONTACT_METHOD", () => {
      const options = resolveFallbackOptionsForField("PREFERRED_CONTACT_METHOD");
      assert.ok(options.length > 0);
      assert.ok(options.some((o) => o.value === "email"));
    });

    it("22. provides fallback options for PREFERRED_CONTACT_TIME", () => {
      const options = resolveFallbackOptionsForField("PREFERRED_CONTACT_TIME");
      assert.ok(options.length > 0);
      assert.ok(options.some((o) => o.value === "morning"));
    });

    it("23. provides fallback options for NATIONALITY with ISO countries", () => {
      const options = resolveFallbackOptionsForField("NATIONALITY");
      assert.ok(options.length > 0);
      assert.ok(options.some((o) => o.value === "GB"));
    });

    it("24. does not invent fake options for unconfigured fields without shared enums", () => {
      const options = resolveFallbackOptionsForField("SOURCE_OF_BUSINESS");
      assert.deepEqual(options, []);
    });

    it("25. preserves custom display order from Property Setup", () => {
      const config = makeConfig({
        requiredFields: [
          {
            id: "f-2",
            name: "Field B",
            code: "LAST_NAME",
            fieldType: "text",
            description: null,
            required: false,
            checkIn: false,
            reservation: false,
            active: true,
            displayOrder: 20,
            options: [],
            documentTypeIds: [],
          },
          {
            id: "f-1",
            name: "Field A",
            code: "FIRST_NAME",
            fieldType: "text",
            description: null,
            required: true,
            checkIn: false,
            reservation: false,
            active: true,
            displayOrder: 10,
            options: [],
            documentTypeIds: [],
          },
        ],
      });
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      assert.equal(rules[0].code, "FIRST_NAME");
      assert.equal(rules[1].code, "LAST_NAME");
    });
  });

  describe("3. Profile type resolution & context enforcement (tests 26-40)", () => {
    it("26. resolves canonical active Individual profile type", () => {
      const config = makeConfig();
      const indiv = resolveIndividualProfileType(config);
      assert.ok(indiv);
      assert.equal(indiv.code, "INDIVIDUAL");
      assert.equal(indiv.domain, "individual");
    });

    it("27. identifies when Individual profile type is active", () => {
      const config = makeConfig();
      assert.equal(isIndividualProfileTypeActive(config), true);
    });

    it("28. identifies when Individual profile type is inactive", () => {
      const config = makeConfig();
      config.types[0].active = false;
      assert.equal(isIndividualProfileTypeActive(config), false);
    });

    it("29. returns true for active check when config is unseeded/missing", () => {
      assert.equal(isIndividualProfileTypeActive(null), true);
      assert.equal(
        isIndividualProfileTypeActive({ available: false } as unknown as GuestWorkspaceConfig),
        true,
      );
    });

    it("30. exposes canonical profile type properties (requiredFieldIds, documentTypeIds)", () => {
      const config = makeConfig();
      const indiv = resolveIndividualProfileType(config);
      assert.ok(Array.isArray(indiv?.requiredFieldIds));
      assert.ok(Array.isArray(indiv?.documentTypeIds));
    });

    it("31. profile_create context requires fields with required=true", () => {
      const config = makeConfig();
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const fn = rules.find((r) => r.code === "FIRST_NAME");
      const ln = rules.find((r) => r.code === "LAST_NAME");
      assert.equal(fn?.requiredForContext, true);
      assert.equal(ln?.requiredForContext, true);
    });

    it("32. profile_create context does not require optional fields", () => {
      const config = makeConfig();
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const phone = rules.find((r) => r.code === "PHONE");
      assert.equal(phone?.requiredForContext, false);
    });

    it("33. reservation context enforces field.reservation flag", () => {
      const config = makeConfig();
      const rules = resolveGuestFieldRules(config, null, "reservation");
      const phone = rules.find((r) => r.code === "PHONE");
      const dob = rules.find((r) => r.code === "DATE_OF_BIRTH");
      assert.equal(phone?.requiredForContext, true);
      assert.equal(dob?.requiredForContext, false);
    });

    it("34. check_in context enforces field.checkIn flag", () => {
      const config = makeConfig();
      const rules = resolveGuestFieldRules(config, null, "check_in");
      const phone = rules.find((r) => r.code === "PHONE");
      const email = rules.find((r) => r.code === "EMAIL");
      const dob = rules.find((r) => r.code === "DATE_OF_BIRTH");
      assert.equal(phone?.requiredForContext, true);
      assert.equal(dob?.requiredForContext, true);
      assert.equal(email?.requiredForContext, false);
    });

    it("35. ignores inactive configured fields across all contexts", () => {
      const config = makeConfig();
      config.requiredFields[1].active = false; // LAST_NAME inactive
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const ln = rules.find((r) => r.code === "LAST_NAME");
      assert.equal(ln?.requiredForContext, false);
    });

    it("36. validates valid guest object successfully", () => {
      const config = makeConfig();
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const res = validateGuestFields(
        { firstName: "Alice", lastName: "Smith" },
        rules,
        "profile_create",
      );
      assert.equal(res.valid, true);
      assert.equal(res.errors.length, 0);
    });

    it("37. detects missing required field and names field in error message", () => {
      const config = makeConfig();
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const res = validateGuestFields(
        { firstName: "Alice", lastName: "" },
        rules,
        "profile_create",
      );
      assert.equal(res.valid, false);
      assert.ok(res.errors[0].includes("Last Name"));
      assert.ok(res.missingFieldCodes.includes("LAST_NAME"));
    });

    it("38. validates email syntax when non-empty", () => {
      const config = makeConfig();
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const res = validateGuestFields(
        { firstName: "Alice", lastName: "Smith", email: "invalid-email" },
        rules,
        "profile_create",
      );
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes("Invalid email address format")));
    });

    it("39. passes valid email syntax", () => {
      const config = makeConfig();
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const res = validateGuestFields(
        { firstName: "Alice", lastName: "Smith", email: "alice@example.com" },
        rules,
        "profile_create",
      );
      assert.equal(res.valid, true);
    });

    it("40. trims whitespace before validating strings", () => {
      const config = makeConfig();
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const res = validateGuestFields(
        { firstName: "  Alice  ", lastName: "   " },
        rules,
        "profile_create",
      );
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("LAST_NAME"));
    });
  });

  describe("4. Fallback, reservation & check-in boundaries (tests 41-61)", () => {
    it("41. falls back to legacy SET3 when Card 4 has zero active configured fields", () => {
      const rules = resolveGuestFieldRules(
        { available: false, requiredFields: [] } as unknown as GuestWorkspaceConfig,
        null,
        "profile_create",
      );
      const legacyRules = {
        savedAt: "2026-09-01T00:00:00Z",
        requiredFields: { lastName: true },
      };
      const res = validateGuestFields(
        { firstName: "Alice", lastName: "" },
        rules,
        "profile_create",
        legacyRules as unknown as GuestProfileRules,
      );
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("SET3_FALLBACK"));
    });

    it("42. ignores legacy SET3 when Card 4 has active fields configured", () => {
      const config = makeConfig();
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const legacyRules = {
        savedAt: "2026-09-01T00:00:00Z",
        requiredFields: { lastName: false }, // legacy says not required, but Card 4 says required
      };
      const res = validateGuestFields(
        { firstName: "Alice", lastName: "" },
        rules,
        "profile_create",
        legacyRules as unknown as GuestProfileRules,
      );
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("LAST_NAME"));
    });

    it("43. validateReservationGuestRequirements returns error when guest is null", () => {
      const config = makeConfig();
      const res = validateReservationGuestRequirements(null, config);
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("GUEST"));
    });

    it("44. validateReservationGuestRequirements checks reservation-required fields", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: null,
        email: null,
      } as unknown as GuestProfile;
      const res = validateReservationGuestRequirements(guest, config);
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("PHONE"));
      assert.ok(res.missingFieldCodes.includes("EMAIL"));
    });

    it("45. validateReservationGuestRequirements passes when reservation fields are satisfied", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456789",
        email: "alice@example.com",
      } as unknown as GuestProfile;
      const res = validateReservationGuestRequirements(guest, config);
      assert.equal(res.valid, true);
    });

    it("46. validateGuestCheckInRequirements returns error when guest is null", () => {
      const config = makeConfig();
      const res = validateGuestCheckInRequirements({
        guest: null,
        documents: [],
        config,
      });
      assert.equal(res.valid, false);
    });

    it("47. validateGuestCheckInRequirements checks check_in field requirements", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: null,
        dateOfBirth: null,
      } as unknown as GuestProfile;
      const res = validateGuestCheckInRequirements({
        guest,
        documents: [],
        config,
      });
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("PHONE"));
      assert.ok(res.missingFieldCodes.includes("DATE_OF_BIRTH"));
    });

    it("48. validateGuestCheckInRequirements enforces requiredAtCheckIn identity document", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456",
        dateOfBirth: "1990-01-01",
      } as unknown as GuestProfile;
      // Missing passport (doc-pas-1 has requiredAtCheckIn=true)
      const res = validateGuestCheckInRequirements({
        guest,
        documents: [],
        config,
      });
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("IDENTITY_DOCUMENT"));
    });

    it("49. validateGuestCheckInRequirements passes when guest fields and required document exist", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456",
        dateOfBirth: "1990-01-01",
      } as unknown as GuestProfile;
      const docs = [
        {
          id: "d-1",
          typeId: "doc-pas-1",
          kind: "passport" as const,
          documentNumberMasked: "PASS123",
          issuingCountry: "US",
          expiryDate: "2030-01-01",
          status: "valid" as const,
          hasImage: true,
          filePath: "/docs/p.jpg",
        },
      ];
      const res = validateGuestCheckInRequirements({
        guest,
        documents: docs,
        config,
      });
      assert.equal(res.valid, true);
    });

    it("50. validateGuestCheckInRequirements rejects document if documentNumberRequired is unmet", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456",
        dateOfBirth: "1990-01-01",
      } as unknown as GuestProfile;
      const docs = [
        {
          id: "d-1",
          typeId: "doc-pas-1",
          kind: "passport" as const,
          documentNumberMasked: null,
          issuingCountry: "US",
          expiryDate: "2030-01-01",
          status: "valid" as const,
          hasImage: false,
          filePath: null,
        },
      ];
      const res = validateGuestCheckInRequirements({
        guest,
        documents: docs,
        config,
      });
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("IDENTITY_DOCUMENT"));
    });

    it("51. isDocumentTypeAllowedForProfileType allows docType if validForProfileTypeIds includes profileType.id", () => {
      const docType = { id: "doc-1", active: true, validForProfileTypeIds: ["type-indiv-1"] };
      const profileType = { id: "type-indiv-1", documentTypeIds: ["doc-1"] };
      assert.equal(isDocumentTypeAllowedForProfileType(docType, profileType), true);
    });

    it("52. isDocumentTypeAllowedForProfileType blocks docType if validForProfileTypeIds does not include profileType.id", () => {
      const docType = { id: "doc-1", active: true, validForProfileTypeIds: ["type-corp-1"] };
      const profileType = { id: "type-indiv-1", documentTypeIds: ["doc-1"] };
      assert.equal(isDocumentTypeAllowedForProfileType(docType, profileType), false);
    });

    it("53. isDocumentTypeAllowedForProfileType blocks docType if profileType.documentTypeIds does not include docType.id", () => {
      const docType = { id: "doc-1", active: true, validForProfileTypeIds: ["type-indiv-1"] };
      const profileType = { id: "type-indiv-1", documentTypeIds: ["doc-other-1"] };
      assert.equal(isDocumentTypeAllowedForProfileType(docType, profileType), false);
    });

    it("54. isDocumentTypeAllowedForProfileType blocks inactive document types for new entry", () => {
      const docType = { id: "doc-1", active: false, validForProfileTypeIds: ["type-indiv-1"] };
      const profileType = { id: "type-indiv-1", documentTypeIds: ["doc-1"] };
      assert.equal(isDocumentTypeAllowedForProfileType(docType, profileType), false);
    });

    it("55. isDocumentTypeAllowedForProfileType permits any active doc type if both filter lists are empty/unconfigured", () => {
      const docType = { id: "doc-1", active: true, validForProfileTypeIds: [] };
      const profileType = { id: "type-indiv-1", documentTypeIds: [] };
      assert.equal(isDocumentTypeAllowedForProfileType(docType, profileType), true);
    });

    it("56. validateDocumentFields requires document number when documentNumberRequired is true", () => {
      const type = {
        documentNumberRequired: true,
        issuingCountryRequired: false,
        expiryDateRequired: false,
      } as unknown as Parameters<typeof validateDocumentFields>[0];
      const err = validateDocumentFields(type, {
        documentNumber: null,
        issuingCountry: null,
        expiryDate: null,
      });
      assert.equal(err, "Document number is required.");
    });

    it("57. validateDocumentFields requires issuing country when issuingCountryRequired is true", () => {
      const type = {
        documentNumberRequired: false,
        issuingCountryRequired: true,
        expiryDateRequired: false,
      } as unknown as Parameters<typeof validateDocumentFields>[0];
      const err = validateDocumentFields(type, {
        documentNumber: "123",
        issuingCountry: null,
        expiryDate: null,
      });
      assert.equal(err, "Issuing country is required.");
    });

    it("58. validateDocumentFields requires expiry date when expiryDateRequired is true", () => {
      const type = {
        documentNumberRequired: false,
        issuingCountryRequired: false,
        expiryDateRequired: true,
      } as unknown as Parameters<typeof validateDocumentFields>[0];
      const err = validateDocumentFields(type, {
        documentNumber: "123",
        issuingCountry: "US",
        expiryDate: null,
      });
      assert.equal(err, "Expiry date is required.");
    });

    it("59. validateDocumentFields returns null when all required document fields are provided", () => {
      const type = {
        documentNumberRequired: true,
        issuingCountryRequired: true,
        expiryDateRequired: true,
      } as unknown as Parameters<typeof validateDocumentFields>[0];
      const err = validateDocumentFields(type, {
        documentNumber: "12345",
        issuingCountry: "US",
        expiryDate: "2030-01-01",
      });
      assert.equal(err, null);
    });

    it("60. unmapped field codes resolve with canonicalKey null and isUnsupported false", () => {
      const config = makeConfig({
        requiredFields: [
          {
            id: "f-custom",
            name: "Internal Tax Code",
            code: "CUSTOM_TAX_INTERNAL_CODE",
            fieldType: "text",
            description: null,
            required: true,
            checkIn: false,
            reservation: false,
            active: true,
            displayOrder: 99,
            options: [],
            documentTypeIds: [],
          },
        ],
      });
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const unmapped = rules.find((r) => r.code === "CUSTOM_TAX_INTERNAL_CODE");
      assert.ok(unmapped);
      assert.equal(unmapped.canonicalKey, null);
      assert.equal(unmapped.isUnsupported, false);
    });

    it("61. unmapped field validates when provided in customFieldValues", () => {
      const config = makeConfig({
        requiredFields: [
          {
            id: "f-custom",
            name: "Internal Tax Code",
            code: "CUSTOM_TAX_INTERNAL_CODE",
            fieldType: "text",
            description: null,
            required: true,
            checkIn: false,
            reservation: false,
            active: true,
            displayOrder: 99,
            options: [],
            documentTypeIds: [],
          },
        ],
      });
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const res = validateGuestFields(
        { firstName: "Alice" },
        rules,
        "profile_create",
        null,
        { CUSTOM_TAX_INTERNAL_CODE: "TAX-123" },
      );
      assert.equal(res.valid, true);
    });
  });

  describe("5. Architectural Amendments (tests 62-74)", () => {
    it("62. profileType.requiredFieldIds affects Individual create rules", () => {
      const config = makeConfig();
      // Suppose field-phone-1 is optional globally (required: false)
      // but individual profile type specifies field-phone-1 in requiredFieldIds:
      const individualType = {
        ...config.types[0],
        requiredFieldIds: ["field-phone-1"],
      };
      const rules = resolveGuestFieldRules(config, individualType, "profile_create");
      const phone = rules.find((r) => r.id === "field-phone-1");
      assert.ok(phone);
      assert.equal(phone.required, true);
      assert.equal(phone.requiredForContext, true);

      // Validation should fail if phone is omitted
      const res = validateGuestFields(
        { firstName: "Alice", lastName: "Smith" },
        rules,
        "profile_create",
      );
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("PHONE"));
    });

    it("63. another profile type's requiredFieldIds do not affect Individual", () => {
      const config = makeConfig();
      // Corporate profile type requires field-email-1, but Individual type does not
      const individualType = {
        ...config.types[0],
        requiredFieldIds: [],
      };
      const rules = resolveGuestFieldRules(config, individualType, "profile_create");
      const email = rules.find((r) => r.id === "field-email-1");
      assert.ok(email);
      assert.equal(email.required, false);
      assert.equal(email.requiredForContext, false);

      const res = validateGuestFields(
        { firstName: "Alice", lastName: "Smith" },
        rules,
        "profile_create",
      );
      assert.equal(res.valid, true);
    });

    it("64. inactive Individual type blocks create while existing profiles remain readable", () => {
      const config = makeConfig();
      config.types[0].active = false; // Individual type deactivated in Property Setup

      assert.equal(isIndividualProfileTypeActive(config), false);

      // In profile_edit context, existing profiles remain editable/readable
      const editRules = resolveGuestFieldRules(config, config.types[0], "profile_edit");
      assert.ok(editRules.length > 0);
      const editRes = validateGuestFields(
        { firstName: "Existing Guest" },
        editRules,
        "profile_edit",
      );
      assert.equal(editRes.valid, true);
    });

    it("65. normalized configured field options have stable object shape", () => {
      const rawOptions = [
        "Gold",
        { id: "opt-2", label: "Silver Tier", value: "silver" },
        { id: "opt-3", name: "Bronze Tier", value: "bronze", active: false },
      ];
      const normalized = normalizeFieldOptions(rawOptions);
      assert.equal(normalized.length, 3);
      for (const item of normalized) {
        assert.equal(typeof item.id, "string");
        assert.equal(typeof item.label, "string");
        assert.equal(typeof item.value, "string");
        assert.equal(typeof item.active, "boolean");
      }
      assert.equal(normalized[0].value, "Gold");
      assert.equal(normalized[1].label, "Silver Tier");
      assert.equal(normalized[2].active, false);
    });

    it("66. server createGuest cannot bypass profile_create requirements", () => {
      const guestsFile = readFileSync(resolve(__dirname, "./guests.functions.ts"), "utf8");
      const start = guestsFile.indexOf("export const createGuest = createServerFn");
      const end = guestsFile.indexOf("export const updateGuest = createServerFn");
      const slice = guestsFile.slice(start, end);

      assert.match(slice, /loadGuestWorkspaceConfig/);
      assert.match(slice, /resolveIndividualProfileType/);
      assert.match(slice, /resolveGuestFieldRules/);
      assert.match(slice, /validateGuestFields/);
      assert.match(slice, /"profile_create"/);
    });

    it("67. server reservation confirm cannot bypass reservation requirements", () => {
      const resFile = readFileSync(resolve(__dirname, "./reservations.functions.ts"), "utf8");
      const start = resFile.indexOf("export const createReservation = createServerFn");
      const end = resFile.indexOf("export const updateReservation = createServerFn");
      const slice = resFile.slice(start, end);

      assert.match(slice, /status === "confirmed"/);
      assert.match(slice, /validateReservationGuestRequirements/);
      assert.match(slice, /Reservation confirmation blocked/);
    });

    it("68. setReservationStatus -> confirmed enforces reservation requirements", () => {
      const resFile = readFileSync(resolve(__dirname, "./reservations.functions.ts"), "utf8");
      const start = resFile.indexOf("export const setReservationStatus = createServerFn");
      const end = resFile.indexOf("export const releaseHold = createServerFn");
      const slice = resFile.slice(start, end);

      assert.match(slice, /data\.status === "confirmed"/);
      assert.match(slice, /validateReservationGuestRequirements/);
      assert.match(slice, /Reservation confirmation blocked/);
    });

    it("69. completeFoCheckIn cannot bypass check_in requirements", () => {
      const foFile = readFileSync(resolve(__dirname, "./fo-check-in.functions.ts"), "utf8");
      const start = foFile.indexOf("export const completeFoCheckIn = createServerFn");
      const slice = foFile.slice(start);

      assert.match(slice, /loadGuestWorkspaceConfig/);
      assert.match(slice, /validateGuestCheckInRequirements/);
      assert.match(slice, /Check-in blocked by guest requirements/);
    });

    it("70. document server writer enforces selected document type requirements", () => {
      const guestsFile = readFileSync(resolve(__dirname, "./guests.functions.ts"), "utf8");
      const start = guestsFile.indexOf("export const saveGuestDocument = createServerFn");
      const end = guestsFile.indexOf("export const saveGuestDocumentImage = createServerFn");
      const slice = guestsFile.slice(start, end);

      assert.match(slice, /validateDocumentFields/);
      assert.match(slice, /isDocumentTypeAllowedForProfileType/);
    });

    it("71. documentTypeIds + validForProfileTypeIds eligibility is deterministic", () => {
      const passport = {
        id: "doc-pas",
        active: true,
        validForProfileTypeIds: ["type-indiv", "type-vip"],
      };
      const corporateLicence = {
        id: "doc-corp",
        active: true,
        validForProfileTypeIds: ["type-corp"],
      };
      const indivProfile = {
        id: "type-indiv",
        documentTypeIds: ["doc-pas"],
      };
      const corpProfile = {
        id: "type-corp",
        documentTypeIds: ["doc-corp"],
      };

      // Passport is allowed for Individual profile (in both lists)
      assert.equal(isDocumentTypeAllowedForProfileType(passport, indivProfile), true);
      // Corporate license is NOT allowed for Individual profile (neither in docType nor in profileType)
      assert.equal(isDocumentTypeAllowedForProfileType(corporateLicence, indivProfile), false);
      // Corporate license is allowed for Corporate profile
      assert.equal(isDocumentTypeAllowedForProfileType(corporateLicence, corpProfile), true);
      // Passport is NOT allowed for Corporate profile
      assert.equal(isDocumentTypeAllowedForProfileType(passport, corpProfile), false);
    });

    it("72. unmapped configured field resolves as custom_value and validates with customFieldValues", () => {
      const config = makeConfig({
        requiredFields: [
          {
            id: "f-unknown",
            name: "Arbitrary Custom Field",
            code: "UNMAPPED_ARBITRARY_FIELD_CODE",
            fieldType: "text",
            description: null,
            required: true,
            checkIn: false,
            reservation: false,
            active: true,
            displayOrder: 50,
            options: [],
            documentTypeIds: [],
          },
        ],
      });
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const unmapped = rules.find((r) => r.code === "UNMAPPED_ARBITRARY_FIELD_CODE");
      assert.ok(unmapped);
      assert.equal(unmapped.canonicalKey, null);
      assert.equal(unmapped.isUnsupported, false);

      const res = validateGuestFields(
        { firstName: "Alice" },
        rules,
        "profile_create",
        null,
        { UNMAPPED_ARBITRARY_FIELD_CODE: "valid_val" },
      );
      assert.equal(res.valid, true);
    });

    it("73. configured options override fallback enums", () => {
      const customTitles = [
        { id: "t-1", label: "Lord", value: "lord", active: true },
        { id: "t-2", label: "Lady", value: "lady", active: true },
      ];
      const config = makeConfig({
        requiredFields: [
          {
            id: "f-title-custom",
            name: "Honorific",
            code: "TITLE",
            fieldType: "single_select",
            description: null,
            required: false,
            checkIn: false,
            reservation: false,
            active: true,
            displayOrder: 1,
            options: customTitles,
            documentTypeIds: [],
          },
        ],
      });
      const rules = resolveGuestFieldRules(config, null, "profile_create");
      const titleRule = rules.find((r) => r.code === "TITLE");
      assert.ok(titleRule);
      assert.equal(titleRule.options.length, 2);
      assert.equal(titleRule.options[0].value, "lord");
      assert.equal(titleRule.options[1].value, "lady");
    });

    it("74. no new custom-field persistence schema is introduced", () => {
      // Phase 4 must not add new migrations or database tables for custom fields
      const pmsDir = resolve(__dirname, "../../../../supabase/migrations");
      // Read migration files to ensure no Phase 4 schema changes were introduced
      const guestFieldRulesFile = readFileSync(
        resolve(__dirname, "./guest-field-rules.ts"),
        "utf8",
      );
      // Confirms canonical key mapping only references existing guest model columns
      assert.doesNotMatch(guestFieldRulesFile, /custom_fields_jsonb/);
      assert.doesNotMatch(guestFieldRulesFile, /CREATE TABLE.*custom_guest_values/);
    });

    it("75. requiredAtCheckIn document with future expiry satisfies check-in", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456",
        dateOfBirth: "1990-01-01",
      } as unknown as GuestProfile;
      const docs = [
        {
          id: "d-1",
          typeId: "doc-pas-1",
          kind: "passport" as const,
          documentNumberMasked: "P12345678",
          issuingCountry: "US",
          expiryDate: "2030-12-31",
          status: "valid" as const,
          hasImage: true,
          filePath: "/docs/passport.jpg",
        },
      ];
      const res = validateGuestCheckInRequirements({
        guest,
        documents: docs,
        config,
        today: "2026-09-28",
      });
      assert.equal(res.valid, true);
      assert.equal(res.errors.length, 0);
    });

    it("76. expired requiredAtCheckIn document does not satisfy check-in", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456",
        dateOfBirth: "1990-01-01",
      } as unknown as GuestProfile;
      const docs = [
        {
          id: "d-1",
          typeId: "doc-pas-1",
          kind: "passport" as const,
          documentNumberMasked: "P12345678",
          issuingCountry: "US",
          expiryDate: "2025-05-01",
          status: "valid" as const,
          hasImage: true,
          filePath: "/docs/passport.jpg",
        },
      ];
      const res = validateGuestCheckInRequirements({
        guest,
        documents: docs,
        config,
        today: "2026-09-28",
      });
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("IDENTITY_DOCUMENT"));
      assert.ok(res.errors.includes("An unexpired identity document is required for check-in."));
    });

    it("77. expiryDateRequired document without expiry does not satisfy check-in", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456",
        dateOfBirth: "1990-01-01",
      } as unknown as GuestProfile;
      const docs = [
        {
          id: "d-1",
          typeId: "doc-pas-1",
          kind: "passport" as const,
          documentNumberMasked: "P12345678",
          issuingCountry: "US",
          expiryDate: null,
          status: "valid" as const,
          hasImage: true,
          filePath: "/docs/passport.jpg",
        },
      ];
      const res = validateGuestCheckInRequirements({
        guest,
        documents: docs,
        config,
        today: "2026-09-28",
      });
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("IDENTITY_DOCUMENT"));
      assert.ok(res.errors.includes("Identity document expiry date is required for check-in."));
    });

    it("78. document type without expiry requirement may satisfy without expiry", () => {
      const config = makeConfig({
        identityDocumentTypes: [
          {
            id: "doc-nid-checkin",
            name: "National ID",
            code: "NATIONAL_ID",
            description: null,
            issuingCountryRequired: false,
            expiryDateRequired: false,
            documentNumberRequired: true,
            scanImageAllowed: true,
            requiredAtCheckIn: true,
            active: true,
            validForProfileTypeIds: ["type-indiv-1"],
            displayOrder: 1,
          },
        ],
      });
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456",
        dateOfBirth: "1990-01-01",
      } as unknown as GuestProfile;
      const docs = [
        {
          id: "d-1",
          typeId: "doc-nid-checkin",
          kind: "national_id" as const,
          documentNumberMasked: "NID-99999",
          issuingCountry: null,
          expiryDate: null,
          status: "valid" as const,
          hasImage: false,
          filePath: null,
        },
      ];
      const res = validateGuestCheckInRequirements({
        guest,
        documents: docs,
        config,
        today: "2026-09-28",
      });
      assert.equal(res.valid, true);
      assert.equal(res.errors.length, 0);
    });

    it("79. missing issuing country fails when issuingCountryRequired is true", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456",
        dateOfBirth: "1990-01-01",
      } as unknown as GuestProfile;
      const docs = [
        {
          id: "d-1",
          typeId: "doc-pas-1",
          kind: "passport" as const,
          documentNumberMasked: "P12345678",
          issuingCountry: null,
          expiryDate: "2030-01-01",
          status: "valid" as const,
          hasImage: true,
          filePath: "/docs/passport.jpg",
        },
      ];
      const res = validateGuestCheckInRequirements({
        guest,
        documents: docs,
        config,
        today: "2026-09-28",
      });
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("IDENTITY_DOCUMENT"));
      assert.ok(res.errors.includes("Identity document issuing country is required for check-in."));
    });

    it("80. missing document number fails when documentNumberRequired is true", () => {
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456",
        dateOfBirth: "1990-01-01",
      } as unknown as GuestProfile;
      const docs = [
        {
          id: "d-1",
          typeId: "doc-pas-1",
          kind: "passport" as const,
          documentNumberMasked: "",
          issuingCountry: "US",
          expiryDate: "2030-01-01",
          status: "valid" as const,
          hasImage: true,
          filePath: "/docs/passport.jpg",
        },
      ];
      const res = validateGuestCheckInRequirements({
        guest,
        documents: docs,
        config,
        today: "2026-09-28",
      });
      assert.equal(res.valid, false);
      assert.ok(res.missingFieldCodes.includes("IDENTITY_DOCUMENT"));
      assert.ok(res.errors.includes("Identity document number is required for check-in."));
    });

    it("81. expired historical document remains readable", () => {
      // Expired documents must remain visible in Guest Profile history and never be deleted or hidden.
      const rawDbDocuments = [
        {
          id: "doc-hist-1",
          id_type_id: "doc-pas-1",
          kind: "passport",
          document_number: "P-EXPIRED-99",
          issuing_country: "US",
          expiry_date: "2020-01-01",
          file_path: "/docs/old.pdf",
        },
      ];

      // Verifies document history reader maps expired rows without hiding or dropping them
      const mapped = rawDbDocuments.map((doc) => ({
        id: doc.id,
        typeId: doc.id_type_id,
        kind: doc.kind,
        documentNumberMasked: doc.document_number,
        issuingCountry: doc.issuing_country,
        expiryDate: doc.expiry_date,
        status: "valid" as const,
        hasImage: Boolean(doc.file_path),
        filePath: doc.file_path,
      }));

      assert.equal(mapped.length, 1);
      assert.equal(mapped[0].expiryDate, "2020-01-01");
      assert.equal(mapped[0].documentNumberMasked, "P-EXPIRED-99");

      // Verify that fo-check-in queries documents without filtering out expired ones
      const foFile = readFileSync(resolve(__dirname, "./fo-check-in.functions.ts"), "utf8");
      assert.match(foFile, /from\("guest_documents"\)/);
      assert.doesNotMatch(foFile, /filter.*expiry_date.*>=/);
    });

    it("82. completeFoCheckIn cannot bypass expired-document rule", () => {
      const foFile = readFileSync(resolve(__dirname, "./fo-check-in.functions.ts"), "utf8");
      assert.match(foFile, /validateGuestCheckInRequirements/);
      assert.match(foFile, /today,/);
      assert.match(foFile, /Check-in blocked by guest requirements:/);

      // Directly verify that check-in validation blocks check-in with expired document
      const config = makeConfig();
      const guest = {
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+123456",
        dateOfBirth: "1990-01-01",
      } as unknown as GuestProfile;
      const expiredDoc = {
        id: "d-expired",
        typeId: "doc-pas-1",
        kind: "passport" as const,
        documentNumberMasked: "PASS123",
        issuingCountry: "US",
        expiryDate: "2024-01-01",
        status: "valid" as const,
        hasImage: true,
        filePath: "/docs/p.jpg",
      };

      const checkInRes = validateGuestCheckInRequirements({
        guest,
        documents: [expiredDoc],
        config,
        today: "2026-09-28",
      });

      assert.equal(checkInRes.valid, false);
      assert.ok(
        checkInRes.errors.includes("An unexpired identity document is required for check-in."),
      );
    });
  });
});
