import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_BUSINESS_FIELDS,
  DEFAULT_BUSINESS_PROFILE_TYPES,
  companyBusinessConfigured,
  emptyBusinessTypeDraft,
  settingsDefaultInvalid,
  staleRequiredFieldIds,
  validateBusinessSettings,
  validateBusinessTypeDraft,
  type BusinessProfileTypeRecord,
} from "./company-business-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./company-business-card4.functions.ts", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-company-business.tsx", import.meta.url),
  "utf8",
);
const companyFormSrc = readFileSync(
  new URL("../components/guests/guest-company-form-dialog.tsx", import.meta.url),
  "utf8",
);
const profileTypesSrc = readFileSync(
  new URL("./profile-types-card4.server.ts", import.meta.url),
  "utf8",
);

const FIELD_A = "00000000-0000-4000-8000-000000000401";
const FIELD_B = "00000000-0000-4000-8000-000000000402";
const TYPE_A = "00000000-0000-4000-8000-000000000501";
const TYPE_B = "00000000-0000-4000-8000-000000000502";

function typeRow(partial: Partial<BusinessProfileTypeRecord> = {}): BusinessProfileTypeRecord {
  return {
    id: TYPE_A,
    name: "Corporate Company",
    code: "CORP",
    description: null,
    active: true,
    requiredFieldIds: [FIELD_A],
    staleRequiredFieldIds: [],
    taxIdRequired: true,
    contactRequired: true,
    creditAccountAllowed: true,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    ...partial,
  };
}

describe("Card 4 Company & Business catalogue", () => {
  it("seeds design business types and business-oriented field codes", () => {
    assert.deepEqual(
      DEFAULT_BUSINESS_PROFILE_TYPES.map((row) => row.code),
      ["CORP", "GOV", "NGO", "TRA", "TOU", "DMC", "WHL"],
    );
    assert.deepEqual(
      DEFAULT_BUSINESS_FIELDS.map((row) => row.code),
      ["COMPANY_NAME", "TAX_ID", "CONTACT_PERSON", "BUSINESS_ADDRESS", "BUSINESS_LICENSE"],
    );
    assert.match(profileTypesSrc, /code: "COM"/);
    assert.doesNotMatch(profileTypesSrc, /pms_business_profile_types/);
  });

  it("rejects empty name/code, duplicate codes, and stale required fields", () => {
    const existing = [{ id: TYPE_A, name: "Corporate Company", code: "CORP", active: true }];
    const fields = [
      { id: FIELD_A, active: true },
      { id: FIELD_B, active: false },
    ];
    const empty = validateBusinessTypeDraft(emptyBusinessTypeDraft(), existing, fields);
    assert.equal(
      empty.some((row) => row.field === "name"),
      true,
    );
    assert.equal(
      empty.some((row) => row.field === "code"),
      true,
    );

    const duplicate = validateBusinessTypeDraft(
      { ...emptyBusinessTypeDraft(), name: "Other", code: "CORP", requiredFieldIds: [FIELD_A] },
      existing,
      fields,
    );
    assert.equal(
      duplicate.some((row) => row.message === "This code is already in use."),
      true,
    );

    const stale = validateBusinessTypeDraft(
      {
        ...emptyBusinessTypeDraft(),
        name: "DMC",
        code: "DMC",
        requiredFieldIds: [FIELD_B],
      },
      existing,
      fields,
    );
    assert.equal(
      stale.some((row) => row.field === "requiredFieldIds"),
      true,
    );
    assert.deepEqual(staleRequiredFieldIds([FIELD_B, "missing"], fields), [FIELD_B, "missing"]);
  });

  it("blocks inactive defaults and treats disabled business profiles as configured", () => {
    const types = [
      typeRow(),
      typeRow({ id: TYPE_B, name: "Government", code: "GOV", active: false }),
    ];
    assert.equal(
      validateBusinessSettings({ enabled: true, defaultBusinessTypeId: TYPE_B }, types).length > 0,
      true,
    );
    assert.equal(settingsDefaultInvalid(TYPE_B, types, true), true);
    assert.equal(settingsDefaultInvalid(TYPE_A, types, true), false);
    assert.equal(
      companyBusinessConfigured(types, {
        enabled: false,
        defaultBusinessTypeId: null,
        autoApproval: false,
        defaultInvalid: false,
      }),
      true,
    );
    assert.equal(
      companyBusinessConfigured(types, {
        enabled: true,
        defaultBusinessTypeId: TYPE_A,
        autoApproval: false,
        defaultInvalid: false,
      }),
      true,
    );
  });

  it("does not wire operational company forms or billing", () => {
    assert.match(functionsSrc, /pms_business_profile_types/);
    assert.match(functionsSrc, /pms_business_profile_settings/);
    assert.doesNotMatch(functionsSrc, /guest-company-form-dialog/);
    assert.doesNotMatch(functionsSrc, /invoice|credit ledger|erp/i);
    assert.match(uiSrc, /card4-company-business/);
    assert.doesNotMatch(companyFormSrc, /pms_business_profile_types/);
  });
});
