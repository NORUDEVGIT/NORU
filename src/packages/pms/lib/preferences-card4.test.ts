import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_PREFERENCE_CATEGORIES,
  DEFAULT_PREFERENCE_TYPES,
  emptyPreferenceCategoryDraft,
  emptyPreferenceTypeDraft,
  preferenceFlagsForActiveChange,
  preferencesConfigured,
  validatePreferenceCategoryDraft,
  validatePreferenceTypeDraft,
  type PreferenceCategoryRecord,
  type PreferenceTypeRecord,
} from "./preferences-card4.server.ts";

const functionsSource = readFileSync(
  new URL("./preferences-card4.functions.ts", import.meta.url),
  "utf8",
);
const guestsSource = readFileSync(new URL("./guests.functions.ts", import.meta.url), "utf8");
const wave2Source = readFileSync(
  new URL("./pms-preference-options.functions.ts", import.meta.url),
  "utf8",
);

function category(partial: Partial<PreferenceCategoryRecord> = {}): PreferenceCategoryRecord {
  return {
    id: "00000000-0000-4000-8000-000000000201",
    name: "Room Preferences",
    code: "ROOM",
    description: null,
    active: true,
    displayOrder: 1,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    ...partial,
  };
}

function type(partial: Partial<PreferenceTypeRecord> = {}): PreferenceTypeRecord {
  return {
    id: "00000000-0000-4000-8000-000000000301",
    categoryId: "00000000-0000-4000-8000-000000000201",
    name: "Bed Type",
    code: "BED_TYPE",
    valueType: "single",
    options: [{ id: "1", label: "King", value: "king", active: true, displayOrder: 0 }],
    required: true,
    active: true,
    displayOrder: 1,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    ...partial,
  };
}

describe("Card 4 Preferences catalogue", () => {
  it("seeds four categories and room/communication/service/dietary types", () => {
    assert.deepEqual(
      DEFAULT_PREFERENCE_CATEGORIES.map((row) => row.code),
      ["ROOM", "COMM", "SVC", "DIET"],
    );
    assert.equal(
      DEFAULT_PREFERENCE_TYPES.some((row) => row.code === "BED_TYPE" && row.valueType === "single"),
      true,
    );
    assert.equal(
      DEFAULT_PREFERENCE_TYPES.some((row) => row.code === "DIET_REST" && row.valueType === "multi"),
      true,
    );
    assert.equal(preferencesConfigured([category()], [type()]), true);
  });

  it("rejects duplicate names/codes, missing options, and inactive required types", () => {
    const categoryErrors = validatePreferenceCategoryDraft(
      { ...emptyPreferenceCategoryDraft(1), name: "room preferences", code: "ROOM" },
      [{ id: "a", name: "Room Preferences", code: "ROOM" }],
    );
    assert.ok(categoryErrors.some((error) => error.field === "name"));
    const typeErrors = validatePreferenceTypeDraft(
      {
        ...emptyPreferenceTypeDraft("00000000-0000-4000-8000-000000000201"),
        name: "Bed Type",
        code: "BED_TYPE",
        active: false,
        required: true,
      },
      [
        {
          id: "t",
          name: "Bed Type",
          code: "BED_TYPE",
          categoryId: "00000000-0000-4000-8000-000000000201",
        },
      ],
      ["00000000-0000-4000-8000-000000000201"],
    );
    assert.ok(typeErrors.some((error) => error.field === "name"));
    assert.ok(typeErrors.some((error) => error.field === "code"));
    assert.ok(typeErrors.some((error) => error.field === "required"));
    assert.ok(typeErrors.some((error) => error.field === "options"));
    assert.deepEqual(preferenceFlagsForActiveChange(false, true), {
      active: false,
      required: false,
    });
  });

  it("does not write Wave 2 option catalogues or guest preference values", () => {
    assert.match(functionsSource, /pms_guest_preference_categories/);
    assert.match(functionsSource, /pms_guest_preference_types/);
    assert.doesNotMatch(functionsSource, /pms_preference_options/);
    assert.doesNotMatch(functionsSource, /guest_preferences/);
    assert.doesNotMatch(functionsSource, /bed_preference|room_preference/);
    assert.match(wave2Source, /pms_preference_options/);
    assert.match(guestsSource, /guest_preferences/);
  });
});
