import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_PREFERENCE_CATEGORIES,
  DEFAULT_PREFERENCE_TYPES,
  emptyPreferenceCategoryDraft,
  emptyPreferenceTypeDraft,
  enrichPreferenceTypesWithOptions,
  preferenceFlagsForActiveChange,
  preferencesConfigured,
  resolveEffectivePreferences,
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
const card4SettingsSource = readFileSync(
  new URL("../components/settings/pms-card4-preferences.tsx", import.meta.url),
  "utf8",
);
const catalogSheetSource = readFileSync(
  new URL("../components/settings/catalog-sheets/preference-catalog-sheet.tsx", import.meta.url),
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
      DEFAULT_PREFERENCE_TYPES.some((row) => row.code === "ROOM_TYPE" && row.valueType === "single" && row.categoryCode === "ROOM"),
      true,
    );
    assert.equal(
      DEFAULT_PREFERENCE_TYPES.some((row) => row.code === "RATE_PLAN" && row.valueType === "single" && row.categoryCode === "ROOM"),
      true,
    );
    assert.equal(
      DEFAULT_PREFERENCE_TYPES.some((row) => row.code === "MEAL_PLAN" && row.valueType === "single" && row.categoryCode === "DIET"),
      true,
    );
    assert.equal(
      DEFAULT_PREFERENCE_TYPES.some((row) => row.code === "BED_TYPE" && row.valueType === "single"),
      true,
    );
    assert.equal(
      DEFAULT_PREFERENCE_TYPES.some((row) => row.code === "DIET_REST" && row.valueType === "multi"),
      true,
    );
    // Quiet Room and Connecting Room replaced by Room Type and Rate Plan
    assert.equal(
      DEFAULT_PREFERENCE_TYPES.some((row) => row.code === "QUIET" || row.code === "CONNECT"),
      false,
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

  it("enriches ROOM_TYPE, RATE_PLAN and MEAL_PLAN preference types with property active room types, rate plans and meal plans", () => {
    const rawTypes: PreferenceTypeRecord[] = [
      {
        id: "t-room",
        categoryId: "00000000-0000-4000-8000-000000000201",
        name: "Room Type",
        code: "ROOM_TYPE",
        valueType: "single",
        options: [{ id: "opt-1", label: "Standard Room", value: "Standard Room", active: true, displayOrder: 0 }],
        required: false,
        active: true,
        displayOrder: 1,
        createdAt: "2026-09-19T00:00:00.000Z",
        updatedAt: "2026-09-19T00:00:00.000Z",
      },
      {
        id: "t-rate",
        categoryId: "00000000-0000-4000-8000-000000000201",
        name: "Rate Plan",
        code: "RATE_PLAN",
        valueType: "single",
        options: [{ id: "opt-rate", label: "Standard Rate (BAR)", value: "Standard Rate (BAR)", active: true, displayOrder: 0 }],
        required: false,
        active: true,
        displayOrder: 2,
        createdAt: "2026-09-19T00:00:00.000Z",
        updatedAt: "2026-09-19T00:00:00.000Z",
      },
      {
        id: "t-meal",
        categoryId: "00000000-0000-4000-8000-000000000204",
        name: "Meal Plan",
        code: "MEAL_PLAN",
        valueType: "single",
        options: [{ id: "opt-2", label: "Room Only (EP)", value: "Room Only (EP)", active: true, displayOrder: 0 }],
        required: false,
        active: true,
        displayOrder: 3,
        createdAt: "2026-09-19T00:00:00.000Z",
        updatedAt: "2026-09-19T00:00:00.000Z",
      },
    ];

    const hotelRoomTypes = [
      { id: "rt-1", name: "Ocean Villa", code: "OV", active: true },
      { id: "rt-2", name: "Presidential Penthouse", code: "PP", active: true },
      { id: "rt-3", name: "Inactive Chalet", code: "IC", active: false },
    ];

    const hotelRatePlans = [
      { id: "rp-1", name: "Non-Refundable Rate", code: "NRF", active: true },
      { id: "rp-2", name: "Seasonal Promo", code: "SEAS", active: true },
      { id: "rp-3", name: "Discontinued Corporate", code: "DC", active: false },
    ];

    const hotelMealPlans = [
      { id: "mp-1", name: "All Inclusive Plus", code: "AIP", active: true },
      { id: "mp-2", name: "Ultra All Inclusive", code: "UAI", active: false },
    ];

    const enriched = enrichPreferenceTypesWithOptions(rawTypes, hotelRoomTypes, hotelMealPlans, hotelRatePlans);

    const roomTypePref = enriched.find((t) => t.code === "ROOM_TYPE");
    assert.ok(roomTypePref);
    const roomOptionLabels = roomTypePref.options.map((o) => o.label);
    assert.ok(roomOptionLabels.includes("Standard Room"));
    assert.ok(roomOptionLabels.includes("Ocean Villa"));
    assert.ok(roomOptionLabels.includes("Presidential Penthouse"));
    assert.equal(roomOptionLabels.includes("Inactive Chalet"), false);

    const ratePlanPref = enriched.find((t) => t.code === "RATE_PLAN");
    assert.ok(ratePlanPref);
    const rateOptionLabels = ratePlanPref.options.map((o) => o.label);
    assert.ok(rateOptionLabels.includes("Standard Rate (BAR)"));
    assert.ok(rateOptionLabels.includes("Non-Refundable Rate"));
    assert.ok(rateOptionLabels.includes("Seasonal Promo"));
    assert.equal(rateOptionLabels.includes("Discontinued Corporate"), false);

    const mealPlanPref = enriched.find((t) => t.code === "MEAL_PLAN");
    assert.ok(mealPlanPref);
    const mealOptionLabels = mealPlanPref.options.map((o) => o.label);
    assert.ok(mealOptionLabels.includes("Room Only (EP)"));
    assert.ok(mealOptionLabels.includes("All Inclusive Plus"));
    assert.equal(mealOptionLabels.includes("Ultra All Inclusive"), false);
  });

  it("resolves effective preferences with fallbacks even if settings have not been configured", () => {
    const hotelRoomTypes = [{ id: "rt-1", name: "Deluxe Suite", code: "DLX", active: true }];
    const hotelMealPlans = [{ id: "mp-1", name: "Bed & Breakfast", code: "BB", active: true }];
    const hotelRatePlans = [{ id: "rp-1", name: "BAR Flex", code: "BAR", active: true }];

    // 1. Completely empty database (never set in settings)
    const effectiveEmpty = resolveEffectivePreferences([], [], hotelRoomTypes, hotelMealPlans, hotelRatePlans);
    assert.equal(effectiveEmpty.categories.length, 4);
    assert.ok(effectiveEmpty.categories.some((c) => c.code === "ROOM"));
    assert.ok(effectiveEmpty.categories.some((c) => c.code === "COMM"));
    assert.ok(effectiveEmpty.categories.some((c) => c.code === "SVC"));
    assert.ok(effectiveEmpty.categories.some((c) => c.code === "DIET"));

    const emptyCodes = effectiveEmpty.types.map((t) => t.code);
    assert.ok(emptyCodes.includes("ROOM_TYPE"));
    assert.ok(emptyCodes.includes("RATE_PLAN"));
    assert.ok(emptyCodes.includes("BED_TYPE"));
    assert.ok(emptyCodes.includes("FLOOR"));
    assert.ok(emptyCodes.includes("MEAL_PLAN"));
    assert.equal(emptyCodes.includes("QUIET"), false);
    assert.equal(emptyCodes.includes("CONNECT"), false);

    // Dynamic options injected
    const roomType = effectiveEmpty.types.find((t) => t.code === "ROOM_TYPE");
    assert.ok(roomType?.options.some((o) => o.label === "Deluxe Suite"));
    const ratePlan = effectiveEmpty.types.find((t) => t.code === "RATE_PLAN");
    assert.ok(ratePlan?.options.some((o) => o.label === "BAR Flex"));

    // 2. Existing database with legacy QUIET / CONNECT
    const legacyCategories: PreferenceCategoryRecord[] = [
      category({ id: "cat-room", code: "ROOM", name: "Room Preferences" }),
    ];
    const legacyTypes: PreferenceTypeRecord[] = [
      type({ id: "t-quiet", categoryId: "cat-room", code: "QUIET", name: "Quiet Room", valueType: "yes_no", options: [] }),
      type({ id: "t-connect", categoryId: "cat-room", code: "CONNECT", name: "Connecting Room", valueType: "yes_no", options: [] }),
      type({ id: "t-bed", categoryId: "cat-room", code: "BED_TYPE", name: "Bed Type", valueType: "single" }),
    ];

    const effectiveLegacy = resolveEffectivePreferences(legacyCategories, legacyTypes, hotelRoomTypes, hotelMealPlans, hotelRatePlans);
    const legacyResultCodes = effectiveLegacy.types.map((t) => t.code);
    assert.equal(legacyResultCodes.includes("QUIET"), false);
    assert.equal(legacyResultCodes.includes("CONNECT"), false);
    assert.ok(legacyResultCodes.includes("ROOM_TYPE"));
    assert.ok(legacyResultCodes.includes("RATE_PLAN"));
    assert.ok(legacyResultCodes.includes("BED_TYPE"));
  });

  it("exposes server reorder functions and UI controls in Card 4 Settings and Catalog Sheet", () => {
    assert.match(functionsSource, /export const reorderPmsCard4PreferenceCategories/);
    assert.match(functionsSource, /export const reorderPmsCard4PreferenceTypes/);

    // Card 4 Settings page controls
    assert.match(card4SettingsSource, /reorderCategoriesMutation/);
    assert.match(card4SettingsSource, /reorderTypesMutation/);
    assert.match(card4SettingsSource, /handleMoveCategory/);
    assert.match(card4SettingsSource, /handleMoveType/);
    assert.match(card4SettingsSource, /ChevronUp/);
    assert.match(card4SettingsSource, /ChevronDown/);

    // Catalog Sheet controls
    assert.match(catalogSheetSource, /reorderCategoriesMutation/);
    assert.match(catalogSheetSource, /reorderTypesMutation/);
    assert.match(catalogSheetSource, /handleMoveCategory/);
    assert.match(catalogSheetSource, /handleMoveType/);
    assert.match(catalogSheetSource, /moveOption/);
  });
});

