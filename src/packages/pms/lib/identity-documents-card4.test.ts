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
    issuingCountryRequired: true,
    expiryDateRequired: true,
    documentNumberRequired: true,
    scanImageAllowed: true,
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

  it("uses shared UUID references without changing operational check-in", () => {
    assert.match(functionsSource, /pms_guest_profile_types/);
    assert.match(functionsSource, /pms_guest_fields/);
    assert.match(functionsSource, /document_type_ids/);
    assert.match(profileTypesSource, /pms_guest_id_types/);
    assert.match(requiredFieldsSource, /pms_guest_id_types/);
    assert.doesNotMatch(functionsSource, /id_document_number|id_document_expiry/);
    assert.match(checkInSource, /"passport", "national_id", "driving_licence", "other"/);
    assert.doesNotMatch(checkInSource, /pms_guest_id_types/);
  });
});
