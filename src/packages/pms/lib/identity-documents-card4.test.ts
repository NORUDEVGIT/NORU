import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_IDENTITY_DOCUMENT_TYPES,
  emptyIdentityDocumentTypeDraft,
  identityDocumentFlagsForActiveChange,
  identityDocumentTypesConfigured,
  normalizeIdentityDocumentCode,
  validateIdentityDocumentTypeDraft,
  type IdentityDocumentProfileTypeOption,
  type IdentityDocumentTypeRecord,
} from "./identity-documents-card4.server.ts";

const functionsSource = readFileSync(
  new URL("./identity-documents-card4.functions.ts", import.meta.url),
  "utf8",
);
const profileTypesSource = readFileSync(
  new URL("./profile-types-card4.functions.ts", import.meta.url),
  "utf8",
);
const requiredFieldsSource = readFileSync(
  new URL("./required-fields-card4.functions.ts", import.meta.url),
  "utf8",
);
const checkInSource = readFileSync(new URL("./fo-check-in.ts", import.meta.url), "utf8");

const profiles: IdentityDocumentProfileTypeOption[] = [
  { id: "00000000-0000-4000-8000-000000000101", name: "Individual Guest", active: true },
  { id: "00000000-0000-4000-8000-000000000102", name: "Company", active: false },
];

function sample(partial: Partial<IdentityDocumentTypeRecord> = {}): IdentityDocumentTypeRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Passport",
    code: "PAS",
    description: null,
    documentNumberActive: true,
    documentNumberRequired: true,
    issuingCountryActive: true,
    issuingCountryRequired: true,
    issueDateActive: true,
    issueDateRequired: false,
    expiryDateActive: true,
    expiryDateRequired: true,
    issuingAuthorityActive: true,
    issuingAuthorityRequired: false,
    scanImageAllowed: true,
    scanImageRequired: false,
    requiredAtCheckIn: true,
    active: true,
    validForProfileTypeIds: [profiles[0]!.id],
    displayOrder: 1,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    ...partial,
  };
}

describe("Card 4 Identity Documents catalogue", () => {
  it("defines the four requested defaults without guest identity values", () => {
    assert.deepEqual(
      DEFAULT_IDENTITY_DOCUMENT_TYPES.map((row) => [row.name, row.code]),
      [
        ["Passport", "PAS"],
        ["National ID", "NID"],
        ["Driving License", "DL"],
        ["Other ID", "OID"],
      ],
    );
    assert.equal(normalizeIdentityDocumentCode(" driving license "), "DRIVING_LICENSE");
    assert.equal(identityDocumentTypesConfigured([sample()]), true);
  });

  it("rejects duplicate names, codes, orders, missing profile types, and contradictory flags", () => {
    const existing = [
      { id: "a", name: "Passport", code: "PAS", displayOrder: 1 },
      { id: "b", name: "National ID", code: "NID", displayOrder: 2 },
    ];
    const duplicate = validateIdentityDocumentTypeDraft(
      {
        ...emptyIdentityDocumentTypeDraft(1),
        name: "passport",
        code: "NID",
        active: false,
        requiredAtCheckIn: true,
      },
      existing,
      profiles,
    );
    assert.ok(duplicate.some((error) => error.field === "name"));
    assert.ok(duplicate.some((error) => error.field === "code"));
    assert.ok(duplicate.some((error) => error.field === "displayOrder"));
    assert.ok(duplicate.some((error) => error.field === "validForProfileTypeIds"));
    assert.ok(duplicate.some((error) => error.field === "requiredAtCheckIn"));
    assert.deepEqual(identityDocumentFlagsForActiveChange(false, true), {
      active: false,
      requiredAtCheckIn: false,
    });
  });

  it("enforces that inactive fields cannot be marked as required", () => {
    const existing: Array<{ id: string; name: string; code: string; displayOrder: number }> = [];
    const base = emptyIdentityDocumentTypeDraft(1);
    base.name = "Custom ID";
    base.code = "CID";
    base.validForProfileTypeIds = [profiles[0]!.id];

    // Inactive document number cannot be required
    const errDocNum = validateIdentityDocumentTypeDraft(
      { ...base, documentNumberActive: false, documentNumberRequired: true },
      existing,
      profiles,
    );
    assert.ok(errDocNum.some((e) => e.field === "documentNumberRequired"));

    // Inactive issuing country cannot be required
    const errCountry = validateIdentityDocumentTypeDraft(
      { ...base, issuingCountryActive: false, issuingCountryRequired: true },
      existing,
      profiles,
    );
    assert.ok(errCountry.some((e) => e.field === "issuingCountryRequired"));

    // Inactive issue date cannot be required
    const errIssue = validateIdentityDocumentTypeDraft(
      { ...base, issueDateActive: false, issueDateRequired: true },
      existing,
      profiles,
    );
    assert.ok(errIssue.some((e) => e.field === "issueDateRequired"));

    // Inactive expiry date cannot be required
    const errExpiry = validateIdentityDocumentTypeDraft(
      { ...base, expiryDateActive: false, expiryDateRequired: true },
      existing,
      profiles,
    );
    assert.ok(errExpiry.some((e) => e.field === "expiryDateRequired"));

    // Inactive issuing authority cannot be required
    const errAuth = validateIdentityDocumentTypeDraft(
      { ...base, issuingAuthorityActive: false, issuingAuthorityRequired: true },
      existing,
      profiles,
    );
    assert.ok(errAuth.some((e) => e.field === "issuingAuthorityRequired"));

    // Disallowed scan images cannot be required
    const errScan = validateIdentityDocumentTypeDraft(
      { ...base, scanImageAllowed: false, scanImageRequired: true },
      existing,
      profiles,
    );
    assert.ok(errScan.some((e) => e.field === "scanImageRequired"));

    // Valid configuration with granular controls passes without errors
    const valid = validateIdentityDocumentTypeDraft(
      {
        ...base,
        documentNumberActive: true,
        documentNumberRequired: true,
        issuingCountryActive: true,
        issuingCountryRequired: false,
        issueDateActive: true,
        issueDateRequired: true,
        expiryDateActive: true,
        expiryDateRequired: true,
        issuingAuthorityActive: false,
        issuingAuthorityRequired: false,
        scanImageAllowed: true,
        scanImageRequired: true,
      },
      existing,
      profiles,
    );
    assert.equal(valid.length, 0);
  });

  it("includes all granular field control columns in migration 0119", () => {
    const migrationSupabase = readFileSync(
      new URL("../../../../supabase/migrations/0119_pms_card4_identity_document_field_controls.sql", import.meta.url),
      "utf8",
    );
    const migrationDrizzle = readFileSync(
      new URL("../../../../drizzle/migrations/0119_pms_card4_identity_document_field_controls.sql", import.meta.url),
      "utf8",
    );
    for (const sql of [migrationSupabase, migrationDrizzle]) {
      assert.match(sql, /document_number_active/);
      assert.match(sql, /issuing_country_active/);
      assert.match(sql, /issue_date_active/);
      assert.match(sql, /issue_date_required/);
      assert.match(sql, /expiry_date_active/);
      assert.match(sql, /scan_image_required/);
      assert.match(sql, /issuing_authority_active/);
      assert.match(sql, /issuing_authority_required/);
    }
  });

  it("dynamically excludes identity documents step when global switch is inactive", async () => {
    const { resolveGuestCreateSteps } = await import("./guest-create-workspace.ts");
    const activeSteps = resolveGuestCreateSteps(true);
    assert.equal(activeSteps.length, 6);
    assert.ok(activeSteps.some((s) => s.id === "identity"));
    assert.equal(activeSteps[1]?.number, 2);

    const inactiveSteps = resolveGuestCreateSteps(false);
    assert.equal(inactiveSteps.length, 5);
    assert.ok(!inactiveSteps.some((s) => s.id === "identity"));
    // Steps are renumbered sequentially 1 through 5
    assert.deepEqual(
      inactiveSteps.map((s) => ({ id: s.id, number: s.number })),
      [
        { id: "basic", number: 1 },
        { id: "preferences", number: 2 },
        { id: "business", number: 3 },
        { id: "additional", number: 4 },
        { id: "review", number: 5 },
      ],
    );
  });

  it("bypasses identity document check-in validation when global switch is inactive", async () => {
    const { validateGuestCheckInRequirements } = await import("./guest-field-rules.ts");
    const mockGuest = {
      id: "guest-1",
      firstName: "John",
      lastName: "Doe",
    } as any;

    const configWithDocsRequired = {
      identityDocumentActive: false,
      identityDocumentTypes: [
        {
          id: "doc-passport",
          code: "PASSPORT",
          name: "Passport",
          active: true,
          requiredAtCheckIn: true,
          validForProfileTypeIds: ["p-ind"],
        },
      ],
      requiredFields: [
        { id: "f1", code: "FIRST_NAME", name: "First Name", active: true, required: true, checkIn: true },
      ],
    } as any;

    // With identityDocumentActive = false, missing documents should NOT fail validation
    const res = validateGuestCheckInRequirements({
      guest: mockGuest,
      documents: [],
      config: configWithDocsRequired,
      profileType: { id: "p-ind", code: "IND", name: "Individual", active: true } as any,
    });

    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
    assert.ok(!res.missingFieldCodes.includes("IDENTITY_DOCUMENT"));

    // When identityDocumentActive = true, missing passport should fail validation
    const resActive = validateGuestCheckInRequirements({
      guest: mockGuest,
      documents: [],
      config: { ...configWithDocsRequired, identityDocumentActive: true },
      profileType: { id: "p-ind", code: "IND", name: "Individual", active: true } as any,
    });

    assert.equal(resActive.valid, false);
    assert.ok(resActive.missingFieldCodes.includes("IDENTITY_DOCUMENT"));
    assert.ok(resActive.errors.some((e) => e.includes("identity document is required for check-in")));
  });
});

