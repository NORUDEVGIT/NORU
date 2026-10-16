import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  PREDEFINED_ROOM_CATEGORIES,
  PREDEFINED_ROOM_CLASSES,
  isDuplicateClassification,
  mergeClassificationLists,
  mergeCustomClassifications,
} from "./rooms-classification.ts";
import {
  emptyCard1Draft,
  emptyPropertySetupStatus,
  markCard1Complete,
  markStepComplete,
  markStepInProgress,
  parsePropertySetupStatus,
  type PropertySetupStatus,
} from "./pms-property-setup-card1.ts";
import { mergeCard2RoomTypesStatus } from "./rooms-card2.server.ts";

describe("PMS Card 2 Room Classification Canonical Predefined Lists", () => {
  it("defines exactly the 16 canonical predefined room categories in order", () => {
    assert.equal(PREDEFINED_ROOM_CATEGORIES.length, 16);
    assert.deepEqual(PREDEFINED_ROOM_CATEGORIES, [
      "Single Room",
      "Double Room",
      "Twin Room",
      "Triple Room",
      "Quadruple Room",
      "Family Room",
      "Studio",
      "Suite",
      "Junior Suite",
      "Executive Suite",
      "Presidential Suite",
      "Connecting Room",
      "Accessible Room",
      "Villa",
      "Apartment",
      "Dormitory",
    ]);
  });

  it("defines exactly the 8 canonical predefined room classes in order", () => {
    assert.equal(PREDEFINED_ROOM_CLASSES.length, 8);
    assert.deepEqual(PREDEFINED_ROOM_CLASSES, [
      "Standard",
      "Superior",
      "Deluxe",
      "Executive",
      "Premium",
      "Luxury",
      "Business",
      "Presidential",
    ]);
  });
});

describe("PMS Card 2 Room Classification Case-Insensitive Deduplication", () => {
  it("detects duplicates case-insensitively with trimming", () => {
    assert.equal(isDuplicateClassification(["Standard", "Deluxe", "Suite"], "Deluxe"), true);
    assert.equal(isDuplicateClassification(["Standard", "Deluxe", "Suite"], "deluxe"), true);
    assert.equal(isDuplicateClassification("  DELUXE  ", ["Standard", "Deluxe", "Suite"]), true);
    assert.equal(isDuplicateClassification(["Standard", "Deluxe", "Suite"], "Penthouse"), false);
    assert.equal(isDuplicateClassification(["Standard", "Deluxe", "Suite"], ""), false);
  });

  it("merges lists preserving casing of the primary source and filtering duplicates", () => {
    const merged = mergeClassificationLists(
      ["Standard", "Superior"],
      ["standard", "Deluxe", "deluxe"],
      ["SUPERIOR", "Presidential"],
    );
    assert.deepEqual(merged, ["Standard", "Superior", "Deluxe", "Presidential"]);
  });
});

describe("PMS Card 2 Concurrency Safeguards & State Integrity", () => {
  it("two category additions do not lose either value", () => {
    const initialStatus: PropertySetupStatus = {
      ...emptyPropertySetupStatus(),
      customRoomCategories: ["Bungalow"],
    };

    // Client A adds "Penthouse"
    const statusA = mergeCustomClassifications(initialStatus, "category", "Penthouse");
    assert.deepEqual(statusA.customRoomCategories, ["Bungalow", "Penthouse"]);

    // Client B adds "Cabana" starting from base or concurrent status
    // When merged with optimistic concurrency / verification:
    const statusB = mergeCustomClassifications(statusA, "category", "Cabana");
    assert.deepEqual(statusB.customRoomCategories, ["Bungalow", "Penthouse", "Cabana"]);

    // Neither value is lost
    assert.ok(statusB.customRoomCategories?.includes("Penthouse"));
    assert.ok(statusB.customRoomCategories?.includes("Cabana"));
    assert.ok(statusB.customRoomCategories?.includes("Bungalow"));
  });

  it("category + class additions do not overwrite each other", () => {
    const initialStatus: PropertySetupStatus = {
      ...emptyPropertySetupStatus(),
      customRoomCategories: ["Chalet"],
      customRoomClasses: ["Ultra VIP"],
    };

    // Step 1: Add a category
    const afterCategory = mergeCustomClassifications(initialStatus, "category", "Overwater Villa");
    assert.deepEqual(afterCategory.customRoomCategories, ["Chalet", "Overwater Villa"]);
    // Verify customRoomClasses was untouched
    assert.deepEqual(afterCategory.customRoomClasses, ["Ultra VIP"]);

    // Step 2: Add a class
    const afterClass = mergeCustomClassifications(afterCategory, "class", "Royal");
    assert.deepEqual(afterClass.customRoomClasses, ["Ultra VIP", "Royal"]);
    // Verify customRoomCategories remained intact
    assert.deepEqual(afterClass.customRoomCategories, ["Chalet", "Overwater Villa"]);
  });

  it("classification save does not remove progress state", () => {
    const complexStatus: PropertySetupStatus = {
      cards: {
        "property-business": "complete",
        "rooms-inventory": "in_progress",
        "rates-guest-rules": "not_started",
      },
      card1Steps: {
        identity: "complete",
        address: "complete",
        checkin: "complete",
      },
      card2Steps: {
        "room-types": "complete",
        amenities: "in_progress",
      },
      customRoomCategories: ["Existing Cat"],
      customRoomClasses: ["Existing Class"],
    };

    const updated = mergeCustomClassifications(complexStatus, "category", "New Cat");

    // Check custom lists
    assert.deepEqual(updated.customRoomCategories, ["Existing Cat", "New Cat"]);
    assert.deepEqual(updated.customRoomClasses, ["Existing Class"]);

    // Check all progress state survived without any loss
    assert.deepEqual(updated.cards, complexStatus.cards);
    assert.deepEqual(updated.card1Steps, complexStatus.card1Steps);
    assert.deepEqual(updated.card2Steps, complexStatus.card2Steps);
  });

  it("progress save does not remove classifications", () => {
    const statusWithCustom: PropertySetupStatus = {
      cards: {
        "property-business": "in_progress",
      },
      card1Steps: {
        "property-identity": "in_progress",
      },
      customRoomCategories: ["Safari Tent"],
      customRoomClasses: ["Ultra Luxury"],
    };

    // Card 1 progress step: markStepComplete
    const draft = emptyCard1Draft();
    const stepCompleted = markStepComplete(statusWithCustom, "property-identity", draft);
    assert.deepEqual(stepCompleted.customRoomCategories, ["Safari Tent"]);
    assert.deepEqual(stepCompleted.customRoomClasses, ["Ultra Luxury"]);

    // Card 1 progress step: markStepInProgress
    const stepInProgress = markStepInProgress(stepCompleted, "general-information");
    assert.deepEqual(stepInProgress.customRoomCategories, ["Safari Tent"]);
    assert.deepEqual(stepInProgress.customRoomClasses, ["Ultra Luxury"]);

    // Card 1 finish: markCard1Complete
    const cardCompleted = markCard1Complete(stepInProgress);
    assert.deepEqual(cardCompleted.customRoomCategories, ["Safari Tent"]);
    assert.deepEqual(cardCompleted.customRoomClasses, ["Ultra Luxury"]);
    assert.equal(cardCompleted.cards["property-business"], "complete");

    // Card 2 step update: mergeCard2RoomTypesStatus
    const card2Updated = mergeCard2RoomTypesStatus(cardCompleted, "complete");
    assert.deepEqual(card2Updated.customRoomCategories, ["Safari Tent"]);
    assert.deepEqual(card2Updated.customRoomClasses, ["Ultra Luxury"]);
    assert.equal(card2Updated.card2Steps?.["room-types"], "complete");
  });

  it("duplicate prevention remains case-insensitive under retry", () => {
    const currentStatus: PropertySetupStatus = {
      ...emptyPropertySetupStatus(),
      customRoomCategories: ["Bungalow"],
    };

    // Attempting to add "bungalow" or "  BUNGALOW  "
    const isDup = isDuplicateClassification("bungalow", [
      ...PREDEFINED_ROOM_CATEGORIES,
      ...(currentStatus.customRoomCategories ?? []),
    ]);
    assert.equal(isDup, true);

    // mergeCustomClassifications does not duplicate the entry
    const merged = mergeCustomClassifications(currentStatus, "category", "bungalow");
    assert.deepEqual(merged.customRoomCategories, ["Bungalow"]);
  });

  it("parsePropertySetupStatus parses and preserves custom classifications correctly", () => {
    const parsed = parsePropertySetupStatus({
      cards: { "property-business": "complete" },
      customRoomCategories: ["Villa", "Lodge", "   ", "Villa"],
      customRoomClasses: ["Diamond"],
    });

    assert.deepEqual(parsed.customRoomCategories, ["Villa", "Lodge"]);
    assert.deepEqual(parsed.customRoomClasses, ["Diamond"]);
    assert.equal(parsed.cards["property-business"], "complete");
  });
});

describe("PMS Card 2 Room Types Form UI Component Contract", () => {
  const uiSrc = readFileSync(
    new URL("../components/settings/pms-property-setup-card2-room-types.tsx", import.meta.url),
    "utf8",
  );

  it("renders Room Category and Room Class with ClassificationSelect dropdowns", () => {
    assert.match(uiSrc, /<ClassificationSelect[\s\S]*label="Room Category"/);
    assert.match(uiSrc, /<ClassificationSelect[\s\S]*label="Room Class"/);
    assert.match(uiSrc, /addCategoryOpen/);
    assert.match(uiSrc, /addClassOpen/);
    assert.match(uiSrc, /AddClassificationDialog/);
  });

  it("removes Short Name from table summary header and rows", () => {
    assert.doesNotMatch(uiSrc, /<th[^>]*>Short Name<\/th>/);
    assert.match(uiSrc, /<th[^>]*>Category<\/th>/);
    assert.match(uiSrc, /<th[^>]*>Class<\/th>/);
  });

  it("removes Short Name input field from the editor form grid", () => {
    assert.doesNotMatch(uiSrc, /<PropertySetupField label="Short Name">/);
  });

  it("preserves legacy shortName in state and on save", () => {
    // Hidden in state so legacy values are not wiped during edit
    assert.match(uiSrc, /shortName: row\.shortName \?\? ""/);
    assert.match(uiSrc, /shortName: typeForm\.shortName\.trim\(\) \|\| null/);
  });

  it("keeps Room Type Code intact and required", () => {
    assert.match(uiSrc, /<PropertySetupField label="Room Type Code">/);
    assert.match(uiSrc, /code: typeForm\.code\.trim\(\)/);
  });

  it("reuses existing room type image CRUD instead of a second media writer", () => {
    assert.match(uiSrc, /RoomTypeImagesDialog/);
    assert.match(uiSrc, /listRoomTypes/);
    assert.doesNotMatch(uiSrc, /createRoomTypeImageUpload/);
    assert.doesNotMatch(uiSrc, /CREATE TABLE/);
  });
});

describe("PMS Card 2 Physical Room Setup Form UI Contract", () => {
  const uiSrc = readFileSync(
    new URL("../components/settings/pms-property-setup-card2-room-types.tsx", import.meta.url),
    "utf8",
  );

  it("removes Housekeeping Status and Maintenance Status from the physical room setup form", () => {
    assert.doesNotMatch(uiSrc, /<PropertySetupField label="Housekeeping Status">/);
    assert.doesNotMatch(uiSrc, /<PropertySetupField label="Maintenance Status">/);
  });

  it("removes HK and Maint. columns from the Physical Rooms summary table", () => {
    assert.doesNotMatch(uiSrc, /<th[^>]*>HK<\/th>/);
    assert.doesNotMatch(uiSrc, /<th[^>]*>Maint\.<\/th>/);
  });

  it("reorders main location/identity fields to Building -> Floor -> Wing -> Room Type -> Room Number -> Room Code", () => {
    const buildingIdx = uiSrc.indexOf('<PropertySetupField label="Building">');
    const floorIdx = uiSrc.indexOf('<PropertySetupField label="Floor">');
    const wingIdx = uiSrc.indexOf('<PropertySetupField label="Wing">');
    const roomTypeIdx = uiSrc.indexOf('<PropertySetupField label="Room Type">');
    const roomNumberIdx = uiSrc.indexOf('<PropertySetupField label="Room Number">');
    const roomCodeIdx = uiSrc.indexOf('<PropertySetupField label="Room Code">');

    assert.ok(buildingIdx > 0, "Building field must exist");
    assert.ok(floorIdx > buildingIdx, "Floor must be after Building");
    assert.ok(wingIdx > floorIdx, "Wing must be after Floor");
    assert.ok(roomTypeIdx > wingIdx, "Room Type must be after Wing");
    assert.ok(roomNumberIdx > roomTypeIdx, "Room Number must be after Room Type");
    assert.ok(roomCodeIdx > roomNumberIdx, "Room Code must be after Room Number");
  });

  it("preserves operational status and room state on room save", () => {
    assert.match(uiSrc, /saveRoomFn/);
    assert.match(uiSrc, /housekeepingStatus: roomForm\.housekeepingStatus/);
    assert.match(uiSrc, /maintenanceStatus: roomForm\.maintenanceStatus/);
  });
});

