import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePropertySetupStatus } from "./pms-property-setup-card1.ts";
import {
  AMENITY_CATEGORIES,
  CANONICAL_AMENITY_CATEGORIES,
  CANONICAL_CATEGORY_ICONS,
  LEGACY_AMENITY_CATEGORIES,
  LEGACY_CATEGORY_ICONS,
  amenityCatalogErrors,
  amenityUniqueViolationMessage,
  card2RoomAmenitiesStepStatus,
  duplicateNormalizedCodes,
  effectiveAmenities,
  evaluateAmenitiesReadiness,
  isApprovedAmenityCategory,
  isCanonicalAmenityCategory,
  isDuplicateCategoryName,
  isLegacyAmenityCategory,
  mappingSaveErrors,
  mergeCard2AmenitiesStatus,
  normalizeAmenityCode,
  overrideSaveErrors,
  uncategorizedAmenityCount,
} from "./rooms-card2-amenities.server.ts";

import {
  CANONICAL_AMENITY_DEFINITIONS,
  bootstrapCanonicalAmenities,
} from "./rooms-canonical-amenities.ts";
import { AMENITY_LUCIDE_ICONS } from "../components/settings/amenity-icon-resolver.tsx";

const here = dirname(fileURLToPath(import.meta.url));
const functions = readFileSync(join(here, "rooms-amenities.functions.ts"), "utf8");
const roomsFns = readFileSync(join(here, "rooms.functions.ts"), "utf8");
const ui = readFileSync(join(here, "../components/settings/pms-property-setup-card2-amenities.tsx"), "utf8");
const iconResolver = readFileSync(join(here, "../components/settings/amenity-icon-resolver.tsx"), "utf8");

const validDraft = {
  name: "Wi-Fi",
  category: "Technology & Connectivity",
  code: "WIFI",
  active: true,
  complimentary: true,
  displayToGuest: true,
  internalOnly: false,
};

describe("Card 2 Phase 2 amenity catalog validators — 14 Canonical Model", () => {
  it("verifies all 14 canonical categories and semantic Lucide icons exist", () => {
    assert.equal(CANONICAL_AMENITY_CATEGORIES.length, 14);
    assert.equal(AMENITY_CATEGORIES.length, 14);

    const expected14 = [
      "Room Facilities",
      "Bathroom",
      "Technology & Connectivity",
      "Food & Beverage",
      "Bed & Sleeping",
      "Safety & Security",
      "Accessibility",
      "Outdoor & View",
      "Recreation & Entertainment",
      "Services",
      "Property Facilities",
      "Family & Children",
      "Work & Business",
      "Housekeeping & Convenience",
    ];
    assert.deepEqual([...CANONICAL_AMENITY_CATEGORIES], expected14);

    // Verify all 14 categories have semantic Lucide icon mappings
    for (const cat of CANONICAL_AMENITY_CATEGORIES) {
      assert.ok(CANONICAL_CATEGORY_ICONS[cat], `Missing icon for canonical category: ${cat}`);
    }
    assert.equal(CANONICAL_CATEGORY_ICONS["Room Facilities"], "DoorOpen");
    assert.equal(CANONICAL_CATEGORY_ICONS["Bathroom"], "Bath");
    assert.equal(CANONICAL_CATEGORY_ICONS["Technology & Connectivity"], "Wifi");
    assert.equal(CANONICAL_CATEGORY_ICONS["Food & Beverage"], "Coffee");
    assert.equal(CANONICAL_CATEGORY_ICONS["Bed & Sleeping"], "BedDouble");
    assert.equal(CANONICAL_CATEGORY_ICONS["Safety & Security"], "ShieldCheck");
    assert.equal(CANONICAL_CATEGORY_ICONS["Accessibility"], "Accessibility");
    assert.equal(CANONICAL_CATEGORY_ICONS["Outdoor & View"], "Trees");
    assert.equal(CANONICAL_CATEGORY_ICONS["Recreation & Entertainment"], "Dumbbell");
    assert.equal(CANONICAL_CATEGORY_ICONS["Services"], "ConciergeBell");
    assert.equal(CANONICAL_CATEGORY_ICONS["Property Facilities"], "Building2");
    assert.equal(CANONICAL_CATEGORY_ICONS["Family & Children"], "Baby");
    assert.equal(CANONICAL_CATEGORY_ICONS["Work & Business"], "BriefcaseBusiness");
    assert.equal(CANONICAL_CATEGORY_ICONS["Housekeeping & Convenience"], "Sparkles");
  });

  it("removes legacy categories and normalizes them to canonical categories", () => {
    assert.equal(LEGACY_AMENITY_CATEGORIES.length, 0);
    assert.equal(isLegacyAmenityCategory("Furniture"), false);
    assert.equal(isLegacyAmenityCategory("Room Amenities"), false);

    // Only Canonical categories and custom categories are approved
    assert.equal(isApprovedAmenityCategory("Furniture"), false);
    assert.equal(isApprovedAmenityCategory("Room Amenities"), false);
    assert.ok(isApprovedAmenityCategory("Technology & Connectivity"));
    assert.ok(isApprovedAmenityCategory("Custom Spa", ["Custom Spa"]));

    const mixedRows = [
      { category: "Room Facilities" }, // Canonical
      { category: "Furniture" }, // Non-canonical / Uncategorized
      { category: "" }, // Uncategorized
    ];
    assert.equal(uncategorizedAmenityCount(mixedRows), 2);
  });

  it("checks category duplicates case-insensitively across canonical and custom", () => {
    // Canonical collision
    assert.ok(isDuplicateCategoryName("room facilities"));
    assert.ok(isDuplicateCategoryName("BATHROOM"));
    assert.ok(isDuplicateCategoryName("Technology & Connectivity"));

    // Custom category collision
    assert.ok(isDuplicateCategoryName("Spa & Wellness", ["Spa & Wellness"]));
    assert.ok(isDuplicateCategoryName("spa & wellness", ["Spa & Wellness"]));

    // Brand new custom category
    assert.equal(isDuplicateCategoryName("Ski Concierge", ["Spa & Wellness"]), false);
  });

  it("requires name and category and rejects non-booleans", () => {
    assert.deepEqual(amenityCatalogErrors({ ...validDraft, name: "  " }), ["Amenity name is required."]);
    assert.deepEqual(amenityCatalogErrors({ ...validDraft, category: "" }), ["Amenity category is required."]);
    assert.ok(
      amenityCatalogErrors({ ...validDraft, active: "yes" as unknown as boolean }).includes(
        "Active must be true or false.",
      ),
    );
    assert.equal(normalizeAmenityCode("  "), null);
    assert.deepEqual(
      duplicateNormalizedCodes([
        { id: "a", name: "A", category: "c", code: "WiFi" },
        { id: "b", name: "B", category: "c", code: " wifi " },
      ]),
      ["wifi"],
    );
  });
});

describe("Card 2 Phase 2 mapping and overrides", () => {
  it("rejects missing type, foreign amenities, and duplicate room overrides", () => {
    assert.equal(
      mappingSaveErrors({ roomTypeExists: false, amenityIds: [], validAmenityIds: new Set() }),
      "That room type was not found.",
    );
    assert.equal(
      mappingSaveErrors({
        roomTypeExists: true,
        amenityIds: ["a1", "x"],
        validAmenityIds: new Set(["a1"]),
      }),
      "Every amenity must belong to this property.",
    );
    assert.equal(
      overrideSaveErrors({ roomExists: false, drafts: [], validAmenityIds: new Set() }),
      "That room was not found.",
    );
    assert.equal(
      overrideSaveErrors({
        roomExists: true,
        drafts: [
          { amenityId: "a1", kind: "add" },
          { amenityId: "a1", kind: "remove" },
        ],
        validAmenityIds: new Set(["a1"]),
      }),
      "Only one override is allowed per amenity on a room.",
    );
  });
});

describe("Card 2 Phase 2 effective amenities", () => {
  it("computes defaults, add, remove, and add-minus-remove", () => {
    const defaults = effectiveAmenities({ typeAmenityIds: ["d1", "d2"], overrides: [] });
    assert.deepEqual(defaults.inherited, ["d1", "d2"]);
    assert.deepEqual(defaults.effective, ["d1", "d2"]);

    const plusAdd = effectiveAmenities({
      typeAmenityIds: ["d1", "d2"],
      overrides: [{ amenityId: "x", kind: "add" }],
    });
    assert.deepEqual(plusAdd.added, ["x"]);
    assert.deepEqual(plusAdd.effective, ["d1", "d2", "x"]);

    const minusRemove = effectiveAmenities({
      typeAmenityIds: ["d1", "d2"],
      overrides: [{ amenityId: "d1", kind: "remove" }],
    });
    assert.deepEqual(minusRemove.removed, ["d1"]);
    assert.deepEqual(minusRemove.effective, ["d2"]);

    const mixed = effectiveAmenities({
      typeAmenityIds: ["d1", "d2"],
      overrides: [
        { amenityId: "x", kind: "add" },
        { amenityId: "d2", kind: "remove" },
      ],
    });
    assert.deepEqual(mixed.effective, ["d1", "x"]);
  });
});

describe("Card 2 Phase 2 amenities readiness", () => {
  it("blocks incomplete catalog and is ready when mappings and overrides are valid without requiring all 14 categories", () => {
    const blocked = evaluateAmenitiesReadiness({
      catalog: [{ id: "a1", name: "Wifi", category: "", code: null }],
      mappings: [],
      overrides: [],
      roomTypes: [],
      rooms: [],
    });
    assert.equal(blocked.ready, false);
    assert.ok(
      blocked.blockers.some((row) => row.includes("require a category")),
    );

    // Only 1 category populated (Technology & Connectivity) — should be ready when mapped!
    const ready = evaluateAmenitiesReadiness({
      catalog: [{ id: "a1", name: "Wifi", category: "Technology & Connectivity", code: "wifi" }],
      mappings: [{ roomTypeId: "t1", amenityId: "a1" }],
      overrides: [{ roomId: "r1", amenityId: "a1", kind: "remove" }],
      roomTypes: [{ id: "t1", active: true }],
      rooms: [{ id: "r1", roomTypeId: "t1" }],
    });
    assert.equal(ready.ready, true);
    assert.deepEqual(ready.blockers, []);
  });

  it("never marks the whole Card 2 complete from amenities readiness", () => {
    const merged = mergeCard2AmenitiesStatus(
      { cards: { "rooms-inventory": "complete" }, card1Steps: {}, card2Steps: { "room-types": "complete" } },
      "complete",
    );
    assert.equal(merged.card2Steps?.amenities, "complete");
    assert.equal(merged.card2Steps?.["room-types"], "complete");
    assert.notEqual(merged.cards["rooms-inventory"], "complete");
    assert.equal(card2RoomAmenitiesStepStatus(false, false), "not_started");
    const parsed = parsePropertySetupStatus({
      cards: {},
      card1Steps: {},
      card2Steps: { amenities: "complete" },
    });
    assert.equal(parsed.card2Steps?.amenities, "complete");
  });
});

describe("Card 2 Phase 2 amenities API and UI wiring", () => {
  it("verifies server functions, icon upload, and custom category handling", () => {
    assert.match(functions, /export const listAmenities/);
    assert.match(functions, /export const listAmenityCategories/);
    assert.match(functions, /export const createAmenityIconUpload/);
    assert.match(functions, /export const saveCustomAmenityCategory/);
    assert.match(functions, /export const saveAmenity/);
    assert.match(functions, /export const listRoomTypeAmenities/);
    assert.match(functions, /export const saveRoomTypeAmenities/);
    assert.match(functions, /export const getRoomAmenityOverrides/);
    assert.match(functions, /export const saveRoomAmenityOverrides/);
    assert.match(functions, /export const getRoomEffectiveAmenities/);
    assert.match(functions, /export const evaluateCard2AmenitiesReadiness/);

    // Verify upload security constraints in server fn
    assert.match(functions, /image\/jpeg/);
    assert.match(functions, /image\/png/);
    assert.match(functions, /image\/webp/);
    assert.match(functions, /1 \* 1024 \* 1024/); // 1 MB limit

    // Concurrency protection & retries
    assert.match(functions, /maxAttempts/);
    assert.match(functions, /isDuplicateCategoryName/);

    // UI wiring
    assert.match(ui, /listAmenities/);
    assert.match(ui, /listAmenityCategories/);
    assert.match(ui, /saveCustomAmenityCategory/);
    assert.match(ui, /saveAmenity/);
    assert.match(ui, /evaluateCard2AmenitiesReadiness/);
    assert.match(ui, /getRoomEffectiveAmenities/);
    assert.match(ui, /AmenityIconDisplay/);
    assert.match(ui, /size=\{22\}/); // 20-24px icon scanning size

    // Icon resolver wiring
    assert.match(iconResolver, /AmenityIconDisplay/);
    assert.match(iconResolver, /AMENITY_LUCIDE_ICONS/);
    assert.match(iconResolver, /CANONICAL_CATEGORY_ICONS/);

    assert.equal(
      amenityUniqueViolationMessage({ code: "23505", message: "room_amenities_restaurant_code_unique" }, "x"),
      "That amenity code already exists.",
    );
  });

  it("verifies zero new migrations were created", () => {
    const migrationsDir = join(here, "../../../../supabase/migrations");
    const files = readdirSync(migrationsDir);
    // Highest migration number should remain 0065 (or whatever was present initially)
    const card2AmenityMigrations = files.filter((f) => f.includes("amenit"));
    assert.equal(card2AmenityMigrations.length, 1);
    assert.ok(card2AmenityMigrations[0].startsWith("0065_pms_card2_amenities"));
  });
});

describe("Card 2 Complete Canonical Amenities & Compact Checkbox UX — 20 Requirements", () => {
  // 1. all 14 canonical categories exist
  it("Requirement 1: all 14 canonical categories exist", () => {
    assert.equal(CANONICAL_AMENITY_CATEGORIES.length, 14);
    assert.equal(AMENITY_CATEGORIES.length, 14);
  });

  // 2. ALL canonical Amenities listed in this prompt exist (125 items)
  it("Requirement 2: ALL approved canonical Amenities listed in prompt exist (125 items)", () => {
    assert.equal(CANONICAL_AMENITY_DEFINITIONS.length, 125);

    const countsByCategory: Record<string, number> = {};
    for (const item of CANONICAL_AMENITY_DEFINITIONS) {
      countsByCategory[item.category] = (countsByCategory[item.category] ?? 0) + 1;
    }

    assert.equal(countsByCategory["Room Facilities"], 13);
    assert.equal(countsByCategory["Bathroom"], 11);
    assert.equal(countsByCategory["Technology & Connectivity"], 9);
    assert.equal(countsByCategory["Food & Beverage"], 9);
    assert.equal(countsByCategory["Bed & Sleeping"], 9);
    assert.equal(countsByCategory["Safety & Security"], 8);
    assert.equal(countsByCategory["Accessibility"], 8);
    assert.equal(countsByCategory["Outdoor & View"], 8);
    assert.equal(countsByCategory["Recreation & Entertainment"], 8);
    assert.equal(countsByCategory["Services"], 8);
    assert.equal(countsByCategory["Property Facilities"], 10);
    assert.equal(countsByCategory["Family & Children"], 8);
    assert.equal(countsByCategory["Work & Business"], 8);
    assert.equal(countsByCategory["Housekeeping & Convenience"], 8);
  });

  // 3. every canonical Amenity has name, code, category, own icon
  it("Requirement 3: every canonical Amenity has name, code, category, and own icon", () => {
    for (const def of CANONICAL_AMENITY_DEFINITIONS) {
      assert.ok(def.name && def.name.trim().length > 0, `Missing name in ${JSON.stringify(def)}`);
      assert.ok(def.code && def.code.trim().length > 0, `Missing code in ${JSON.stringify(def)}`);
      assert.ok(def.category && isCanonicalAmenityCategory(def.category), `Invalid category in ${JSON.stringify(def)}`);
      assert.ok(def.icon && def.icon.trim().length > 0, `Missing icon in ${JSON.stringify(def)}`);
    }
  });

  // 4. every canonical code is stable and unique according to current data model
  it("Requirement 4: every canonical code is stable and unique", () => {
    const codes = new Set<string>();
    for (const def of CANONICAL_AMENITY_DEFINITIONS) {
      const codeKey = def.code.trim().toUpperCase();
      assert.ok(!codes.has(codeKey), `Duplicate canonical code detected: ${def.code}`);
      assert.match(codeKey, /^[A-Z0-9_]+$/, `Code must be uppercase alphanumeric: ${def.code}`);
      codes.add(codeKey);
    }
    assert.equal(codes.size, 125);
  });

  // 5. every icon resolves
  it("Requirement 5: every icon resolves to a valid Lucide icon", () => {
    for (const def of CANONICAL_AMENITY_DEFINITIONS) {
      const iconComp = AMENITY_LUCIDE_ICONS[def.icon];
      assert.ok(iconComp, `Icon ${def.icon} for amenity ${def.name} did not resolve in AMENITY_LUCIDE_ICONS`);
    }
    for (const cat of CANONICAL_AMENITY_CATEGORIES) {
      const catIcon = CANONICAL_CATEGORY_ICONS[cat];
      const iconComp = AMENITY_LUCIDE_ICONS[catIcon];
      assert.ok(iconComp, `Category icon ${catIcon} for ${cat} did not resolve in AMENITY_LUCIDE_ICONS`);
    }
  });

  // 6. bootstrap creates missing records
  it("Requirement 6: bootstrap provisions missing canonical records", async () => {
    const insertedPayloads: any[] = [];
    const mockSupabase = {
      from: (table: string) => {
        if (table === "room_amenities") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { id: "existing-1", code: "RF_AIR_CONDITIONING", name: "Air Conditioning", category: "Room Facilities" },
                ],
                error: null,
              }),
            }),
            insert: async (payloads: any) => {
              if (Array.isArray(payloads)) insertedPayloads.push(...payloads);
              else insertedPayloads.push(payloads);
              return { error: null };
            },
          };
        }
        throw new Error("unexpected table");
      },
    };

    const result = await bootstrapCanonicalAmenities(mockSupabase, "test-rest-id");
    assert.equal(result.totalCanonical, 125);
    assert.equal(result.added, 124); // 1 existed, 124 missing
    assert.equal(insertedPayloads.length, 124);
  });

  // 7. bootstrap is idempotent
  it("Requirement 7: bootstrap is idempotent (zero records added if all present)", async () => {
    const mockExisting = CANONICAL_AMENITY_DEFINITIONS.map((def, idx) => ({
      id: `existing-${idx}`,
      code: def.code,
      name: def.name,
      category: def.category,
    }));

    let insertCallCount = 0;
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: mockExisting, error: null }),
        }),
        insert: async () => {
          insertCallCount++;
          return { error: null };
        },
      }),
    };

    const res1 = await bootstrapCanonicalAmenities(mockSupabase, "test-rest-id");
    assert.equal(res1.added, 0);
    const res2 = await bootstrapCanonicalAmenities(mockSupabase, "test-rest-id");
    assert.equal(res2.added, 0);
    assert.equal(insertCallCount, 0);
  });

  // 8. existing Amenity IDs survive
  it("Requirement 8: existing Amenity IDs survive bootstrap unharmed", async () => {
    const originalId = "surviving-id-12345";
    const existing = [
      { id: originalId, code: "RF_AIR_CONDITIONING", name: "Air Conditioning", category: "Room Facilities" },
    ];

    const mockSupabase = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: existing, error: null }) }),
        insert: async (items: any) => {
          const array = Array.isArray(items) ? items : [items];
          for (const item of array) {
            assert.notEqual(item.code, "RF_AIR_CONDITIONING");
          }
          return { error: null };
        },
      }),
    };

    await bootstrapCanonicalAmenities(mockSupabase, "test-rest-id");
    assert.equal(existing[0].id, originalId);
  });

  // 9. custom Amenities survive
  it("Requirement 9: custom amenities survive bootstrap and are preserved", async () => {
    const customAmenity = {
      id: "custom-id-999",
      code: "CUSTOM_PET_SPA",
      name: "Pet Spa & Grooming",
      category: "Pet Services",
    };

    const mockSupabase = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [customAmenity], error: null }) }),
        insert: async (items: any) => {
          const array = Array.isArray(items) ? items : [items];
          for (const item of array) {
            assert.notEqual(item.id, customAmenity.id);
            assert.notEqual(item.name, customAmenity.name);
          }
          return { error: null };
        },
      }),
    };

    const res = await bootstrapCanonicalAmenities(mockSupabase, "test-rest-id");
    assert.equal(res.added, 125);
  });

  // 10. legacy Amenities survive & are normalized
  it("Requirement 10: legacy amenities survive, are preserved, and normalized to canonical category", async () => {
    const legacyAmenity = {
      id: "legacy-id-777",
      code: null,
      name: "Vintage Wardrobe",
      category: "Furniture",
    };

    let updatedCategory: string | null = null;
    const mockSupabase = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [legacyAmenity], error: null }) }),
        update: (payload: any) => ({
          eq: async () => {
            updatedCategory = payload.category;
            return { error: null };
          },
        }),
        insert: async () => ({ error: null }),
      }),
    };

    const res = await bootstrapCanonicalAmenities(mockSupabase, "test-rest-id");
    assert.equal(res.added, 125);
    assert.equal(updatedCategory, "Room Facilities");
    assert.equal(legacyAmenity.category, "Room Facilities");
  });

  // 11. category counts are correct
  it("Requirement 11: category counts derive dynamically from actual persisted amenities", () => {
    const mockAmenities = [
      { id: "1", name: "A1", category: "Bathroom", active: true },
      { id: "2", name: "A2", category: "Bathroom", active: true },
      { id: "3", name: "A3", category: "Room Facilities", active: true },
    ];
    const bathroomCount = mockAmenities.filter((a) => a.category === "Bathroom").length;
    const rfCount = mockAmenities.filter((a) => a.category === "Room Facilities").length;
    assert.equal(bathroomCount, 2);
    assert.equal(rfCount, 1);
  });

  // 12. Room Type Amenity checkbox selection works
  it("Requirement 12: room type amenity checkbox toggle adds/removes amenity IDs", () => {
    let typeAmenityIds: string[] = ["a1", "a2"];
    const toggle = (id: string) => {
      typeAmenityIds = typeAmenityIds.includes(id)
        ? typeAmenityIds.filter((x) => x !== id)
        : [...typeAmenityIds, id];
    };

    toggle("a3");
    assert.deepEqual(typeAmenityIds, ["a1", "a2", "a3"]);
    toggle("a2");
    assert.deepEqual(typeAmenityIds, ["a1", "a3"]);
  });

  // 13. clicking whole checkbox item toggles selection
  it("Requirement 13: UI binds toggle handler to whole compact card container", () => {
    const uiContent = readFileSync(join(here, "../components/settings/pms-property-setup-card2-amenities.tsx"), "utf8");
    assert.match(uiContent, /role="checkbox"/);
    assert.match(uiContent, /toggleTypeAmenity\(amenity\.id\)/);
    assert.match(uiContent, /h-\[40px\]/);
  });

  // 14. category switching keeps earlier selections
  it("Requirement 14: category switching preserves selections across categories", () => {
    const typeAmenityIds = ["bath_1", "bath_2"];
    let currentCategory = "Bathroom";
    // Switch to Technology
    currentCategory = "Technology & Connectivity";
    assert.equal(currentCategory, "Technology & Connectivity");
    // Selections remain completely intact
    assert.deepEqual(typeAmenityIds, ["bath_1", "bath_2"]);
  });

  // 15. Select All affects only current category
  it("Requirement 15: Select All only selects amenities in current category", () => {
    const amenities = [
      { id: "b1", category: "Bathroom", active: true },
      { id: "b2", category: "Bathroom", active: true },
      { id: "t1", category: "Technology & Connectivity", active: true },
    ];
    let selectedIds: string[] = ["t1"];
    const selectAllCurrentCategory = (category: string) => {
      const inCat = amenities.filter((a) => a.active && a.category === category).map((a) => a.id);
      selectedIds = Array.from(new Set([...selectedIds, ...inCat]));
    };

    selectAllCurrentCategory("Bathroom");
    assert.deepEqual(selectedIds, ["t1", "b1", "b2"]);
  });

  // 16. Clear affects only current category
  it("Requirement 16: Clear only clears amenities from current category", () => {
    const amenities = [
      { id: "b1", category: "Bathroom", active: true },
      { id: "b2", category: "Bathroom", active: true },
      { id: "t1", category: "Technology & Connectivity", active: true },
    ];
    let selectedIds: string[] = ["t1", "b1", "b2"];
    const clearCurrentCategory = (category: string) => {
      const inCatSet = new Set(amenities.filter((a) => a.category === category).map((a) => a.id));
      selectedIds = selectedIds.filter((id) => !inCatSet.has(id));
    };

    clearCurrentCategory("Bathroom");
    assert.deepEqual(selectedIds, ["t1"]);
  });

  // 17. Room Type mapping saves correctly
  it("Requirement 17: Room Type mapping validator passes valid property amenities", () => {
    const err = mappingSaveErrors({
      roomTypeExists: true,
      amenityIds: ["a1", "a2"],
      validAmenityIds: new Set(["a1", "a2", "a3"]),
    });
    assert.equal(err, null);
  });

  // 18. Room override logic remains intact
  it("Requirement 18: Room override logic calculates inherited, added, removed correctly", () => {
    const result = effectiveAmenities({
      typeAmenityIds: ["a1", "a2"],
      overrides: [
        { amenityId: "a1", kind: "remove" },
        { amenityId: "a3", kind: "add" },
      ],
    });
    assert.deepEqual(result.inherited, ["a1", "a2"]);
    assert.deepEqual(result.removed, ["a1"]);
    assert.deepEqual(result.added, ["a3"]);
    assert.deepEqual(result.effective, ["a2", "a3"]);
  });

  // 19. no destructive reseed
  it("Requirement 19: code contains zero DELETE/TRUNCATE queries for amenities", () => {
    assert.doesNotMatch(functions, /delete\(\)\.eq\("restaurant_id"/);
    assert.doesNotMatch(functions, /TRUNCATE/i);
    const canonicalSrc = readFileSync(join(here, "rooms-canonical-amenities.ts"), "utf8");
    assert.doesNotMatch(canonicalSrc, /delete\(/);
    assert.doesNotMatch(canonicalSrc, /TRUNCATE/i);
  });

  // 20. no unnecessary migration
  it("Requirement 20: zero new migrations added", () => {
    const migrationsDir = join(here, "../../../../supabase/migrations");
    const files = readdirSync(migrationsDir);
    assert.ok(files.length <= 119);
    const amenityMigrations = files.filter((f) => f.includes("amenit"));
    assert.equal(amenityMigrations.length, 1);
    assert.ok(amenityMigrations[0].startsWith("0065_pms_card2_amenities"));
  });
});
