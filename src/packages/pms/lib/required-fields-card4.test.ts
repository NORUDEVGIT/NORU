import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { GUEST_PROFILE_TYPES } from "./guest-profile-wave1.ts";
import {
  DEFAULT_GUEST_FIELDS,
  emptyGuestFieldDraft,
  flagsForActiveChange,
  guestFieldsConfigured,
  normalizeGuestFieldCode,
  validateGuestFieldDraft,
  type GuestFieldRecord,
} from "./required-fields-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./required-fields-card4.functions.ts", import.meta.url),
  "utf8",
);
const set3Src = readFileSync(
  new URL("./pms-set3-rates-guest.functions.ts", import.meta.url),
  "utf8",
);
const wave1Src = readFileSync(new URL("./guest-profile-wave1.ts", import.meta.url), "utf8");

function sample(partial: Partial<GuestFieldRecord> = {}): GuestFieldRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "First Name",
    code: "FIRST_NAME",
    fieldType: "text",
    description: null,
    options: [],
    required: true,
    checkIn: true,
    reservation: true,
    active: true,
    displayOrder: 0,
    lookupSource: null,
    documentTypeIds: [],
    minValue: null,
    maxValue: null,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    ...partial,
  };
}

describe("Card 4 Required Fields catalogue", () => {
  it("seeds nine defaults with independent check-in and reservation flags", () => {
    assert.equal(DEFAULT_GUEST_FIELDS.length, 9);
    assert.deepEqual(
      DEFAULT_GUEST_FIELDS.map((row) => row.code),
      [
        "FIRST_NAME",
        "LAST_NAME",
        "PHONE",
        "EMAIL",
        "NATIONALITY",
        "DATE_OF_BIRTH",
        "IDENTITY_DOCUMENT",
        "ADDRESS",
        "COMPANY",
      ],
    );
    const email = DEFAULT_GUEST_FIELDS.find((row) => row.code === "EMAIL");
    assert.equal(email?.required, false);
    assert.equal(email?.checkIn, true);
    assert.equal(email?.reservation, true);
    const nationality = DEFAULT_GUEST_FIELDS.find((row) => row.code === "NATIONALITY");
    assert.equal(nationality?.fieldType, "select");
    assert.equal(nationality?.options.length, 4);
    assert.equal(
      guestFieldsConfigured(
        DEFAULT_GUEST_FIELDS.map((row, i) => sample({ id: String(i), ...row })),
      ),
      true,
    );
  });

  it("rejects duplicate name/code and inactive required fields", () => {
    const existing = [
      { id: "a", name: "First Name", code: "FIRST_NAME" },
      { id: "b", name: "Email", code: "EMAIL" },
    ];
    const clash = validateGuestFieldDraft(
      { ...emptyGuestFieldDraft(), name: "first name", code: "OTHER" },
      existing,
    );
    assert.ok(clash.some((row) => row.field === "name"));
    const inactiveRequired = validateGuestFieldDraft(
      { ...emptyGuestFieldDraft(), name: "Other", code: "OTHER", required: true, active: false },
      existing,
    );
    assert.ok(
      inactiveRequired.some((row) => row.message === "An inactive field cannot be required."),
    );
    const selectEmpty = validateGuestFieldDraft(
      { ...emptyGuestFieldDraft(), name: "Nation", code: "NATION", fieldType: "select" },
      existing,
    );
    assert.ok(selectEmpty.some((row) => row.field === "options"));
    assert.deepEqual(flagsForActiveChange(false, true), { active: false, required: false });
    assert.equal(normalizeGuestFieldCode(" first name "), "FIRST_NAME");
  });

  it("does not write SET3 guest rules or operational GUEST_PROFILE_TYPES", () => {
    assert.doesNotMatch(functionsSrc, /GUEST_PROFILE_TYPES/);
    assert.doesNotMatch(functionsSrc, /guestRules/);
    assert.doesNotMatch(functionsSrc, /requiredFields: \{ firstName/);
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /seedDefaults/);
    assert.doesNotMatch(set3Src, /pms_guest_fields/);
    assert.doesNotMatch(wave1Src, /pms_guest_fields/);
    assert.equal(GUEST_PROFILE_TYPES.length, 4);
  });
});
