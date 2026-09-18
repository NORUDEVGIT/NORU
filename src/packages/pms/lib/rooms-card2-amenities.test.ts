import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePropertySetupStatus } from "./pms-property-setup-card1.ts";
import {
  AMENITY_CATEGORIES,
  amenityCatalogErrors,
  amenityUniqueViolationMessage,
  card2RoomAmenitiesStepStatus,
  duplicateNormalizedCodes,
  effectiveAmenities,
  evaluateAmenitiesReadiness,
  mappingSaveErrors,
  mergeCard2AmenitiesStatus,
  normalizeAmenityCode,
  overrideSaveErrors,
  uncategorizedAmenityCount,
} from "./rooms-card2-amenities.server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const functions = readFileSync(join(here, "rooms-amenities.functions.ts"), "utf8");
const roomsFns = readFileSync(join(here, "rooms.functions.ts"), "utf8");

const validDraft = {
  name: "Wi-Fi",
  category: "Technology",
  code: "WIFI",
  active: true,
  complimentary: true,
  displayToGuest: true,
  internalOnly: false,
};

describe("Card 2 Phase 2 amenity catalog validators", () => {
  it("requires name and category and rejects non-booleans", () => {
    assert.deepEqual(amenityCatalogErrors({ ...validDraft, name: "  " }), ["Amenity name is required."]);
    assert.deepEqual(amenityCatalogErrors({ ...validDraft, category: "" }), ["Amenity category is required."]);
    assert.ok(
      amenityCatalogErrors({ ...validDraft, active: "yes" as unknown as boolean }).includes(
        "Active must be true or false.",
      ),
    );
    assert.equal(uncategorizedAmenityCount([{ category: "" }, { category: "Technology" }]), 1);
    assert.equal(AMENITY_CATEGORIES.length, 9);
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
  it("blocks incomplete catalog and is ready when mappings and overrides are valid", () => {
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

    const ready = evaluateAmenitiesReadiness({
      catalog: [{ id: "a1", name: "Wifi", category: "Technology", code: "wifi" }],
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

describe("Card 2 Phase 2 amenities API wiring", () => {
  it("keeps authz, tenant filters, overrides table, and room_features separate", () => {
    assert.match(functions, /export const listAmenities/);
    assert.match(functions, /export const saveAmenity/);
    assert.match(functions, /export const listRoomTypeAmenities/);
    assert.match(functions, /export const saveRoomTypeAmenities/);
    assert.match(functions, /export const getRoomAmenityOverrides/);
    assert.match(functions, /export const saveRoomAmenityOverrides/);
    assert.match(functions, /export const getRoomEffectiveAmenities/);
    assert.match(functions, /export const evaluateCard2AmenitiesReadiness/);
    assert.match(functions, /requireRoomManager/);
    assert.match(functions, /requireFrontOfficeAccess/);
    assert.match(functions, /requireSupabaseAuth/);
    assert.match(functions, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(functions, /hotel_room_amenity_overrides/);
    assert.match(functions, /reset: z\.literal\(true\)/);
    assert.doesNotMatch(functions, /room_features/);
    assert.doesNotMatch(functions, /from\("hotel_rooms"\)[\s\S]*room_features/);
    assert.doesNotMatch(functions, /Database\["public"\]/);
    assert.doesNotMatch(functions, /complete=true/);
    assert.match(roomsFns, /persistCard2AmenitiesReadiness/);
    const ui = readFileSync(join(here, "../components/settings/pms-property-setup-card2-amenities.tsx"), "utf8");
    assert.match(ui, /listAmenities/);
    assert.match(ui, /saveAmenity/);
    assert.match(ui, /evaluateCard2AmenitiesReadiness/);
    assert.match(ui, /getRoomEffectiveAmenities/);
    assert.match(ui, /reset: true/);
    assert.match(ui, /Category Required/);
    assert.doesNotMatch(ui, /pmsDb/);
    assert.doesNotMatch(ui, /room_features/);
    assert.doesNotMatch(ui, /effectiveAmenities\(/);
    assert.doesNotMatch(ui, /defaults \+ add/);
    assert.equal(
      amenityUniqueViolationMessage({ code: "23505", message: "room_amenities_restaurant_code_unique" }, "x"),
      "That amenity code already exists.",
    );
  });
});
