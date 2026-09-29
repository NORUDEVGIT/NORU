import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CANONICAL_PROFILE_TYPE_CODES,
  DEFAULT_PROFILE_TYPES,
  isCanonicalProfileTypeCode,
  validateProfileTypeDraft,
  emptyProfileTypeDraft,
  type ProfileTypeDraft,
} from "./profile-types-card4.server.ts";
import {
  CANONICAL_FIELD_CODE_MAP,
  classifyGuestField,
  resolveGuestFieldRules,
  validateGuestFields,
  validateReservationGuestRequirements,
  validateGuestCheckInRequirements,
  type ResolvedGuestFieldRule,
} from "./guest-field-rules.ts";
import {
  normalizeCustomFieldValue,
  validateCustomFieldValue,
  formatCustomFieldValueForDisplay,
} from "./guest-custom-fields.server.ts";

const repoRoot = join(import.meta.dirname, "../../../..");

// Source files for structural and architectural assertions
const migration0116Supabase = readFileSync(
  join(repoRoot, "supabase/migrations/0116_pms_guest_profile_types_fixed.sql"),
  "utf8",
);
const migration0116Drizzle = readFileSync(
  join(repoRoot, "drizzle/migrations/0116_pms_guest_profile_types_fixed.sql"),
  "utf8",
);
const migration0117Supabase = readFileSync(
  join(repoRoot, "supabase/migrations/0117_pms_guest_dynamic_fields.sql"),
  "utf8",
);
const migration0117Drizzle = readFileSync(
  join(repoRoot, "drizzle/migrations/0117_pms_guest_dynamic_fields.sql"),
  "utf8",
);
const profileTypesUiSrc = readFileSync(
  join(repoRoot, "src/packages/pms/components/settings/pms-card4-profile-types.tsx"),
  "utf8",
);
const requiredFieldsUiSrc = readFileSync(
  join(repoRoot, "src/packages/pms/components/settings/pms-card4-required-fields.tsx"),
  "utf8",
);
const profileTypesFnSrc = readFileSync(
  join(repoRoot, "src/packages/pms/lib/profile-types-card4.functions.ts"),
  "utf8",
);
const requiredFieldsFnSrc = readFileSync(
  join(repoRoot, "src/packages/pms/lib/required-fields-card4.functions.ts"),
  "utf8",
);
const customFieldsFnSrc = readFileSync(
  join(repoRoot, "src/packages/pms/lib/guest-custom-fields.functions.ts"),
  "utf8",
);
const guestsFnSrc = readFileSync(
  join(repoRoot, "src/packages/pms/lib/guests.functions.ts"),
  "utf8",
);
const privacyFnSrc = readFileSync(
  join(repoRoot, "src/packages/pms/lib/guest-privacy.functions.ts"),
  "utf8",
);
const reservationsFnSrc = readFileSync(
  join(repoRoot, "src/packages/pms/lib/reservations.functions.ts"),
  "utf8",
);
const foCheckInFnSrc = readFileSync(
  join(repoRoot, "src/packages/pms/lib/fo-check-in.functions.ts"),
  "utf8",
);
const guestFormDialogSrc = readFileSync(
  join(repoRoot, "src/packages/pms/components/guests/guest-form-dialog.tsx"),
  "utf8",
);
const guestPersonalViewSrc = readFileSync(
  join(repoRoot, "src/packages/pms/components/guests/guest-personal-contact-view.tsx"),
  "utf8",
);

describe("Card 4 Hardening — Part A: Profile Types (Fixed Operational Domains)", () => {
  it("1. Default canonical codes: IND, COM, TRA, GRP", () => {
    assert.deepEqual(CANONICAL_PROFILE_TYPE_CODES, ["IND", "COM", "TRA", "GRP"]);
    assert.deepEqual(
      DEFAULT_PROFILE_TYPES.map((t) => t.code),
      ["IND", "COM", "TRA", "GRP"],
    );
  });

  it("2. System domains: Individual, Company, Travel Agency, Group", () => {
    const names = DEFAULT_PROFILE_TYPES.map((t) => t.name);
    assert.ok(names.includes("Individual Guest"));
    assert.ok(names.includes("Company"));
    assert.ok(names.includes("Travel Agency"));
    assert.ok(names.includes("Group"));
  });

  it("3. Canonical codes immutable (code field readonly/disabled in UI)", () => {
    assert.match(profileTypesUiSrc, /disabled=\{true\}/);
    assert.match(profileTypesUiSrc, /Canonical system code cannot be changed/);
  });

  it("4. UI add button removed", () => {
    assert.doesNotMatch(profileTypesUiSrc, /Add Profile Type/i);
    assert.doesNotMatch(profileTypesUiSrc, /create-profile-type/i);
  });

  it("5. Cannot create arbitrary 5th profile type", () => {
    const draft: ProfileTypeDraft = {
      ...emptyProfileTypeDraft(),
      id: null,
      name: "VIP Domain",
      code: "VIP",
    };
    const errors = validateProfileTypeDraft(draft, []);
    assert.ok(errors.some((e) => e.field === "code" && e.message.includes("Arbitrary profile type creation is not supported")));
  });

  it("6. Cannot delete canonical profile type", () => {
    assert.match(profileTypesFnSrc, /System profile types cannot be deleted/);
    assert.doesNotMatch(profileTypesUiSrc, /delete-profile-type/i);
  });

  it("7. Active/inactive toggle preserved", () => {
    assert.match(profileTypesUiSrc, /onCheckedChange/);
    assert.match(profileTypesUiSrc, /active/);
  });

  it("8. Inactive IND blocks New Guest creation", () => {
    assert.match(guestFormDialogSrc, /isIndividualActive/);
    assert.match(guestFormDialogSrc, /Individual guest profile creation is currently inactive/);
  });

  it("9. Inactive COM/TRA/GRP blocks company/travel/group directory creation", () => {
    assert.match(profileTypesUiSrc, /Profile types are system-defined\. Configure which supported profile types are active/);
    assert.match(profileTypesUiSrc, /id="pt-active"/);
  });

  it("10. Editing name/description preserved", () => {
    const existing = [
      { id: "1", name: "Individual Guest", code: "IND" },
    ];
    const draft: ProfileTypeDraft = {
      ...emptyProfileTypeDraft(),
      id: "1",
      name: "Custom Individual",
      code: "IND",
      description: "My custom description",
    };
    const errors = validateProfileTypeDraft(draft, existing);
    assert.equal(errors.length, 0);
  });

  it("11. Migration cleans up non-canonical types", () => {
    assert.match(migration0116Supabase, /DELETE FROM .*pms_guest_profile_types/);
    assert.match(migration0116Drizzle, /DELETE FROM .*pms_guest_profile_types/);
    assert.match(migration0116Supabase, /NOT IN \('IND', 'COM', 'TRA', 'GRP'\)/);
  });

  it("12. Migration remaps non-canonical references to IND", () => {
    assert.match(migration0116Supabase, /UPDATE .*guest_profiles/);
    assert.match(migration0116Drizzle, /UPDATE .*guest_profiles/);
  });

  it("13. Migration adds check constraint for canonical codes", () => {
    assert.match(migration0116Supabase, /CHECK \(code IN \('IND', 'COM', 'TRA', 'GRP'\)\)/);
    assert.match(migration0116Drizzle, /CHECK \(code IN \('IND', 'COM', 'TRA', 'GRP'\)\)/);
  });

  it("14. Canonical profile types present in database / catalogue", () => {
    for (const code of ["IND", "COM", "TRA", "GRP"]) {
      assert.ok(isCanonicalProfileTypeCode(code));
    }
  });

  it("15. Profile types API returns canonical types with active status", () => {
    assert.match(profileTypesFnSrc, /seedDefaults/);
    assert.match(profileTypesFnSrc, /ensureMissingDefaults/);
  });

  it("16. Non-canonical profile type creation rejected server-side", () => {
    assert.match(profileTypesFnSrc, /Arbitrary profile type creation is not supported/);
  });

  it("17. Canonical profile type deletion rejected server-side", () => {
    assert.match(profileTypesFnSrc, /System profile types cannot be deleted/);
  });

  it("18. Profile types guide target count is 4", () => {
    assert.match(profileTypesUiSrc, /Math\.max\(configuredCount,\s*4\)/);
  });
});

describe("Card 4 Hardening — Part B: Dynamic Guest Fields (Hardening)", () => {
  it("19. Dynamic field definition schema supports all field types", () => {
    assert.match(migration0117Supabase, /guest_custom_field_values/);
    assert.match(migration0117Drizzle, /guest_custom_field_values/);
  });

  it("20. Guest field creation validates code format", () => {
    assert.match(requiredFieldsFnSrc, /code/);
  });

  it("21. Guest field creation validates field type", () => {
    assert.match(requiredFieldsFnSrc, /fieldType/);
  });

  it("22. Duplicate field code within property rejected", () => {
    assert.match(requiredFieldsFnSrc, /A field with this name or code already exists/);
  });

  it("23. Core mapped field codes classified as core_mapped", () => {
    assert.equal(classifyGuestField("FIRST_NAME", "text"), "core_mapped");
    assert.equal(classifyGuestField("LAST_NAME", "text"), "core_mapped");
    assert.equal(classifyGuestField("PHONE", "phone"), "core_mapped");
    assert.equal(classifyGuestField("EMAIL", "email"), "core_mapped");
    assert.equal(classifyGuestField("DOB", "date"), "core_mapped");
    assert.equal(classifyGuestField("ADDRESS", "text"), "core_mapped");
  });

  it("24. Document fields classified as document", () => {
    assert.equal(classifyGuestField("MY_CUSTOM_PASSPORT", "document"), "document");
  });

  it("25. Lookup fields classified as lookup", () => {
    assert.equal(classifyGuestField("MY_CORPORATE_AFFILIATION", "lookup"), "lookup");
  });

  it("26. Custom fields classified as custom_value", () => {
    assert.equal(classifyGuestField("SHOE_SIZE", "number"), "custom_value");
    assert.equal(classifyGuestField("FAVORITE_AIRLINE", "text"), "custom_value");
    assert.equal(classifyGuestField("MEMBERSHIP_TIER", "select"), "custom_value");
    assert.equal(classifyGuestField("DIETARY_FLAGS", "multi_select"), "custom_value");
  });

  it("27. isUnsupported is false for custom fields", () => {
    const rules = resolveGuestFieldRules(
      {
        requiredFields: [
          {
            id: "f-shoe",
            name: "Shoe Size",
            code: "SHOE_SIZE",
            fieldType: "number",
            required: false,
            checkIn: false,
            reservation: false,
            active: true,
            displayOrder: 1,
            options: [],
            documentTypeIds: [],
          },
        ],
      },
      null,
      "profile_create",
    );
    const shoeRule = rules.find((r) => r.code === "SHOE_SIZE");
    assert.ok(shoeRule);
    assert.equal(shoeRule.isUnsupported, false);
    assert.equal(shoeRule.category, "custom_value");
  });

  it("28. Custom field values table exists with tenant-safe FKs", () => {
    assert.match(migration0117Supabase, /ON DELETE CASCADE/);
    assert.match(migration0117Supabase, /ON DELETE RESTRICT/);
    assert.match(migration0117Drizzle, /ON DELETE CASCADE/);
  });

  it("29. Custom field values table has unique constraint on guest_id + field_id", () => {
    assert.match(
      migration0117Supabase,
      /CONSTRAINT guest_custom_field_values_unique UNIQUE \(guest_id, field_id\)/,
    );
  });

  it("30. Custom field values RLS matches guest profile permissions", () => {
    assert.match(migration0117Supabase, /CREATE POLICY "Front office read custom field values"/);
    assert.match(migration0117Supabase, /CREATE POLICY "Managers insert custom field values"/);
    assert.match(migration0117Supabase, /receptionist/);
    assert.match(migration0117Supabase, /manager/);
  });

  it("31. Custom text value stored in value_text and value_json", () => {
    const norm = normalizeCustomFieldValue("text", "  Golden Member  ");
    assert.equal(norm, "Golden Member");
  });

  it("32. Custom number value stored in value_number and value_json", () => {
    const norm = normalizeCustomFieldValue("number", "42.5");
    assert.equal(norm, 42.5);
  });

  it("33. Custom date value stored in value_date and value_json", () => {
    const norm = normalizeCustomFieldValue("date", "2026-05-15");
    assert.equal(norm, "2026-05-15");
  });

  it("34. Custom select value stored in value_text and value_json", () => {
    const norm = normalizeCustomFieldValue("select", "gold");
    assert.equal(norm, "gold");
    const field = {
      name: "Tier",
      code: "TIER",
      fieldType: "select" as const,
      active: true,
      options: [{ id: "1", value: "gold", label: "Gold", active: true }],
    };
    assert.equal(validateCustomFieldValue(field, norm, true), null);
    assert.notEqual(validateCustomFieldValue(field, "silver", true), null);
  });

  it("35. Custom multi_select value stored in value_json", () => {
    const norm = normalizeCustomFieldValue("multi_select", ["vegan", "halal"]);
    assert.deepEqual(norm, ["vegan", "halal"]);
    const field = {
      name: "Dietary",
      code: "DIETARY",
      fieldType: "multi_select" as const,
      active: true,
      options: [
        { id: "1", value: "vegan", label: "Vegan", active: true },
        { id: "2", value: "halal", label: "Halal", active: true },
      ],
    };
    assert.equal(validateCustomFieldValue(field, norm, true), null);
  });

  it("36. Value normalization for text (trimmed)", () => {
    assert.equal(normalizeCustomFieldValue("text", "   hello world   "), "hello world");
    assert.equal(normalizeCustomFieldValue("text", "    "), null);
  });

  it("37. Value normalization for number (numeric conversion)", () => {
    assert.equal(normalizeCustomFieldValue("number", "123"), 123);
    assert.equal(normalizeCustomFieldValue("number", "invalid"), null);
  });

  it("38. Value normalization for date (YYYY-MM-DD validation)", () => {
    assert.equal(normalizeCustomFieldValue("date", "2026-12-31"), "2026-12-31");
    assert.equal(normalizeCustomFieldValue("date", "not-a-date"), null);
  });

  it("39. Value normalization for select (validates against options)", () => {
    const field = {
      name: "Color",
      code: "COLOR",
      fieldType: "select" as const,
      active: true,
      options: [{ id: "1", value: "blue", label: "Blue", active: true }],
    };
    const norm = normalizeCustomFieldValue("select", "blue");
    assert.equal(norm, "blue");
    assert.equal(validateCustomFieldValue(field, norm, true), null);
    assert.notEqual(validateCustomFieldValue(field, "unknown_option", true), null);
  });

  it("40. Value normalization for multi_select (array of valid options)", () => {
    const field = {
      name: "Letters",
      code: "LETTERS",
      fieldType: "multi_select" as const,
      active: true,
      options: [
        { id: "1", value: "a", label: "A", active: true },
        { id: "2", value: "b", label: "B", active: true },
      ],
    };
    const norm = normalizeCustomFieldValue("multi_select", ["a", "b"]);
    assert.deepEqual(norm, ["a", "b"]);
    assert.equal(validateCustomFieldValue(field, norm, true), null);
  });

  it("41. Value formatting for display (text, number, date, select, multi_select)", () => {
    assert.equal(formatCustomFieldValueForDisplay({ fieldType: "text", options: [] }, "Test Val"), "Test Val");
    assert.equal(formatCustomFieldValueForDisplay({ fieldType: "number", options: [] }, 42), "42");
    assert.equal(formatCustomFieldValueForDisplay({ fieldType: "date", options: [] }, "2026-05-15"), "2026-05-15");
    const selectField = {
      fieldType: "select",
      options: [{ id: "1", value: "opt1", label: "Option One", active: true }],
    };
    assert.equal(formatCustomFieldValueForDisplay(selectField, "opt1"), "Option One");
    const multiField = {
      fieldType: "multi_select",
      options: [
        { id: "1", value: "m1", label: "Multi 1", active: true },
        { id: "2", value: "m2", label: "Multi 2", active: true },
      ],
    };
    assert.equal(formatCustomFieldValueForDisplay(multiField, ["m1", "m2"]), "Multi 1, Multi 2");
  });

  it("42. Inactive field with existing value displays formatted value with '(Inactive)'", () => {
    assert.match(guestPersonalViewSrc, /Inactive/);
    assert.match(guestPersonalViewSrc, /field\.formattedValue/);
  });

  it("43. Inactive field with no value not displayed in edit mode", () => {
    const sectionSrc = readFileSync(
      join(repoRoot, "src/packages/pms/components/guests/guest-dynamic-fields-section.tsx"),
      "utf8",
    );
    assert.match(sectionSrc, /f\.active \|\| hasValue/);
  });

  it("44. Inactive field not displayed in create mode", () => {
    const sectionSrc = readFileSync(
      join(repoRoot, "src/packages/pms/components/guests/guest-dynamic-fields-section.tsx"),
      "utf8",
    );
    assert.match(sectionSrc, /if \(isCreateMode\) return f\.active;/);
  });

  it("45. Inactive field cannot accept new values", () => {
    const sectionSrc = readFileSync(
      join(repoRoot, "src/packages/pms/components/guests/guest-dynamic-fields-section.tsx"),
      "utf8",
    );
    assert.match(sectionSrc, /disabled=\{disabled \|\| \(!field\.active && !isCreateMode\)\}/);
  });

  it("46. Required at profile_create enforced when required=true", () => {
    const rules: ResolvedGuestFieldRule[] = [
      {
        id: "f-req",
        code: "PASSPORT_COUNTRY",
        canonicalKey: null,
        category: "custom_value",
        label: "Passport Country",
        fieldType: "text",
        active: true,
        required: true,
        requiredForContext: true,
        displayOrder: 1,
        options: [],
        isTechnicalMinimum: false,
        isUnsupported: false,
      },
    ];
    const invalid = validateGuestFields({ firstName: "Alice" }, rules, "profile_create", null, {});
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some((e) => e.includes("Passport Country is required.")));

    const valid = validateGuestFields({ firstName: "Alice" }, rules, "profile_create", null, {
      PASSPORT_COUNTRY: "France",
    });
    assert.equal(valid.valid, true);
  });

  it("47. Required at reservation enforced when reservation=true", () => {
    const config = {
      requiredFields: [
        {
          id: "f-res",
          name: "Arrival Flight",
          code: "ARRIVAL_FLIGHT",
          fieldType: "text",
          required: false,
          checkIn: false,
          reservation: true,
          active: true,
          displayOrder: 1,
          options: [],
          documentTypeIds: [],
        },
      ],
    };
    const invalid = validateReservationGuestRequirements({ firstName: "Alice" }, config, null, {});
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some((e) => e.includes("Arrival Flight is required.")));

    const valid = validateReservationGuestRequirements({ firstName: "Alice" }, config, null, {
      ARRIVAL_FLIGHT: "EK202",
    });
    assert.equal(valid.valid, true);
  });

  it("48. Required at check_in enforced when check_in=true", () => {
    const config = {
      requiredFields: [
        {
          id: "f-ci",
          name: "Registration Card Sign",
          code: "REG_CARD_SIGN",
          fieldType: "text",
          required: false,
          checkIn: true,
          reservation: false,
          active: true,
          displayOrder: 1,
          options: [],
          documentTypeIds: [],
        },
      ],
    };
    const invalid = validateGuestCheckInRequirements({
      guest: { firstName: "Alice" },
      documents: [],
      config,
      customFieldValues: {},
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some((e) => e.includes("Registration Card Sign is required.")));

    const valid = validateGuestCheckInRequirements({
      guest: { firstName: "Alice" },
      documents: [],
      config,
      customFieldValues: { REG_CARD_SIGN: "signed-token" },
    });
    assert.equal(valid.valid, true);
  });

  it("49. Optional field not required at any context", () => {
    const rules: ResolvedGuestFieldRule[] = [
      {
        id: "f-opt",
        code: "FAV_COLOR",
        canonicalKey: null,
        category: "custom_value",
        label: "Favorite Color",
        fieldType: "text",
        active: true,
        required: false,
        requiredForContext: false,
        displayOrder: 1,
        options: [],
        isTechnicalMinimum: false,
        isUnsupported: false,
      },
    ];
    const res = validateGuestFields({ firstName: "Alice" }, rules, "profile_create", null, {});
    assert.equal(res.valid, true);
  });

  it("50. Multiple context requirements (required=true, reservation=true, check_in=true)", () => {
    const field = {
      id: "f-multi",
      name: "Emergency Note",
      code: "EMERGENCY_NOTE",
      fieldType: "text",
      required: true,
      reservation: true,
      checkIn: true,
      active: true,
      displayOrder: 1,
      options: [],
      documentTypeIds: [],
    };
    const config = { requiredFields: [field] };
    const createRules = resolveGuestFieldRules(config, null, "profile_create");
    assert.equal(createRules.find((r) => r.code === "EMERGENCY_NOTE")?.requiredForContext, true);

    const resRules = resolveGuestFieldRules(config, null, "reservation");
    assert.equal(resRules.find((r) => r.code === "EMERGENCY_NOTE")?.requiredForContext, true);

    const ciRules = resolveGuestFieldRules(config, null, "check_in");
    assert.equal(ciRules.find((r) => r.code === "EMERGENCY_NOTE")?.requiredForContext, true);
  });

  it("51. Custom field values saved on New Guest creation", () => {
    assert.match(guestFormDialogSrc, /saveCustomValues/);
    assert.match(guestFormDialogSrc, /values: customValues/);
  });

  it("52. Custom field values saved on Guest Edit", () => {
    assert.match(guestFormDialogSrc, /listGuestCustomFieldValues/);
    assert.match(guestFormDialogSrc, /customValuesQuery/);
  });

  it("53. Custom field values updated on Guest Edit", () => {
    assert.match(customFieldsFnSrc, /upsert/);
  });

  it("54. Custom field values cleared when blanked in Guest Edit", () => {
    assert.match(customFieldsFnSrc, /delete\(\)/);
  });

  it("55. Custom field values audit event recorded on update", () => {
    assert.match(customFieldsFnSrc, /recordGuestEvent/);
    assert.match(customFieldsFnSrc, /Guest additional custom fields updated/);
  });

  it("56. Saving custom values rejects core mapped field codes", () => {
    assert.match(customFieldsFnSrc, /Core mapped guest field .* cannot be stored in custom field values/);
  });

  it("57. Saving custom values rejects document field types", () => {
    assert.match(customFieldsFnSrc, /Document fields must be managed via guest identity documents/);
  });

  it("58. Saving custom values rejects lookup field types", () => {
    assert.match(customFieldsFnSrc, /Lookup fields must be managed via guest account links/);
  });

  it("59. Guest field definition deletion blocked when values exist", () => {
    assert.match(requiredFieldsFnSrc, /This field already has guest data\. Disable it instead of deleting it\./);
  });

  it("60. Guest field definition code/type locked when values exist", () => {
    assert.match(requiredFieldsFnSrc, /Field code and type cannot be changed after operational guest data has been recorded\./);
  });

  it("61. Dynamic preferences rendered in New Guest registration", () => {
    assert.match(guestFormDialogSrc, /GuestRegistrationPreferences/);
    assert.match(guestFormDialogSrc, /id="preferences"/);
  });

  it("62. Focused preference saving to guest_preference_values", () => {
    assert.match(guestsFnSrc, /saveGuestPreferenceAnswers/);
    assert.match(guestsFnSrc, /guest_preference_values/);
  });

  it("63. Focused preference saving does not overwrite contact defaults", () => {
    // Assert saveGuestPreferenceAnswers only touches guest_preference_values
    const fnSlice = guestsFnSrc.slice(guestsFnSrc.indexOf("saveGuestPreferenceAnswers"));
    const endSlice = fnSlice.slice(0, 1000);
    assert.doesNotMatch(endSlice, /preferred_contact_method/);
    assert.doesNotMatch(endSlice, /preferred_contact_time/);
  });

  it("64. Focused preference saving does not overwrite apply_to_future_reservations", () => {
    const fnSlice = guestsFnSrc.slice(guestsFnSrc.indexOf("saveGuestPreferenceAnswers"));
    const endSlice = fnSlice.slice(0, 1000);
    assert.doesNotMatch(endSlice, /apply_to_future_reservations/);
  });

  it("65. Anonymisation scrubs guest_custom_field_values", () => {
    assert.match(privacyFnSrc, /guest_custom_field_values/);
    const anonymiseSlice = privacyFnSrc.slice(privacyFnSrc.indexOf("anonymiseGuest"));
    assert.match(anonymiseSlice, /\.from\("guest_custom_field_values"\)\s*\.delete\(\)/);
  });

  it("66. Anonymisation of already anonymised profile rejected", () => {
    assert.match(privacyFnSrc, /This profile is already anonymised/);
  });

  it("67. Held data export includes custom fields with labels and codes", () => {
    assert.match(privacyFnSrc, /customFields/);
    assert.match(privacyFnSrc, /pms_guest_fields\(id, code, name, field_type\)/);
  });

  it("68. Held data export formats custom values properly", () => {
    const exportSlice = privacyFnSrc.slice(privacyFnSrc.indexOf("exportGuestProfile"));
    assert.match(exportSlice, /customFields/);
    assert.match(exportSlice, /row\.value_json \?\? row\.value_text/);
  });

  it("69. Guest merge copies non-conflicting custom field values to survivor", () => {
    assert.match(guestsFnSrc, /survivorCustomRows/);
    assert.match(guestsFnSrc, /copiedCustomFieldIds/);
  });

  it("70. Guest merge conflict: survivor value preserved operationally", () => {
    assert.match(guestsFnSrc, /customFieldConflicts/);
  });

  it("71. Guest merge conflict: retired value preserved in audit/ledger", () => {
    assert.match(guestsFnSrc, /customFieldConflicts: customFieldConflicts\.length > 0/);
    assert.match(guestsFnSrc, /custom_field_conflicts/);
  });

  it("72. Guest merge conflict does not silently discard retired value", () => {
    assert.match(guestsFnSrc, /customFieldConflicts\.push\(\{/);
    assert.match(guestsFnSrc, /retiredValue: retiredVal/);
  });

  it("73. Guest merge deletes retired guest's custom field values", () => {
    const mergeSlice = guestsFnSrc.slice(guestsFnSrc.indexOf("mergeGuests"));
    assert.match(mergeSlice, /\.from\("guest_custom_field_values"\)\s*\.delete\(\)\s*\.eq\("restaurant_id", data\.restaurantId\)\s*\.eq\("guest_id", data\.retiredId\)/);
  });

  it("74. Front office check-in gate enforces check_in custom fields", () => {
    assert.match(foCheckInFnSrc, /customFieldValues: customValues/);
  });

  it("75. Front office check-in saves custom fields in registration step", () => {
    assert.match(foCheckInFnSrc, /data\.customFields/);
    assert.match(foCheckInFnSrc, /guest_custom_field_values/);
  });

  it("76. Reservation confirmation blocked when reservation custom field missing", () => {
    assert.match(reservationsFnSrc, /guest_custom_field_values/);
    assert.match(reservationsFnSrc, /validateReservationGuestRequirements\(/);
  });
});
