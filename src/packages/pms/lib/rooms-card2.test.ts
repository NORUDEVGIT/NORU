import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parsePropertySetupStatus } from "./pms-property-setup-card1.ts";
import {
  batchLabelConflicts,
  card2RoomTypesStepStatus,
  cascadeLocationIds,
  evaluateRoomTypesRoomsReadiness,
  floorsForBuildingAndWing,
  locationHierarchyError,
  mergeCard2RoomTypesStatus,
  normalizeBedRows,
  occupancyErrors,
  roomLinkErrors,
  sequentialRoomLabels,
  uniqueViolationMessage,
  wingsForBuilding,
  ROOM_TYPE_BEDS_SEQUENTIAL_LIMITATION,
} from "./rooms-card2.server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const functions = readFileSync(join(here, "rooms.functions.ts"), "utf8");
const card1Fns = readFileSync(join(here, "pms-property-setup-card1.functions.ts"), "utf8");

describe("Card 2 Phase 1 room type occupancy and beds", () => {
  it("rejects negative occupancy and adults+children above max", () => {
    assert.ok(occupancyErrors({
      standardOccupancy: 3,
      maxOccupancy: 2,
      adultCapacity: 2,
      childCapacity: 0,
      infantCapacity: 0,
    }).includes("Standard occupancy cannot exceed maximum occupancy."));
    assert.ok(occupancyErrors({
      standardOccupancy: 2,
      maxOccupancy: 2,
      adultCapacity: 2,
      childCapacity: 1,
      infantCapacity: 0,
    }).includes("Adults plus children cannot exceed maximum occupancy."));
    assert.ok(occupancyErrors({
      standardOccupancy: 1,
      maxOccupancy: 2,
      adultCapacity: 0,
      childCapacity: 0,
      infantCapacity: -1,
    }).includes("Occupancy values cannot be negative."));
    assert.equal(occupancyErrors({
      standardOccupancy: 2,
      maxOccupancy: 3,
      adultCapacity: 2,
      childCapacity: 1,
      infantCapacity: 0,
    }).length, 0);
  });

  it("accepts multiple bed rows and rejects empty type or zero quantity", () => {
    const ok = normalizeBedRows([
      { bedType: "King", bedSize: "180cm", numberOfBeds: 1 },
      { bedType: "Single", numberOfBeds: 2 },
    ]);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.rows.length, 2);
    const emptyType = normalizeBedRows([{ bedType: "  ", numberOfBeds: 1 }]);
    assert.equal(emptyType.ok, false);
    const zero = normalizeBedRows([{ bedType: "King", numberOfBeds: 0 }]);
    assert.equal(zero.ok, false);
  });
});

describe("Card 2 Phase 1 location, numbering, links", () => {
  it("rejects wing/floor that do not belong to the building", () => {
    const err = locationHierarchyError(
      { buildingId: "b1", wingId: "w1", floorId: "f1" },
      {
        building: { id: "b1", name: "Main" },
        wing: { id: "w1", name: "East", parentBuildingId: "b2", parentFloorId: null },
        floor: { id: "f1", name: "1", buildingId: "b1", wingId: null },
      },
    );
    assert.equal(err, "That wing does not belong to the selected building.");
    const missing = locationHierarchyError(
      { buildingId: "b9" },
      { building: null, wing: null, floor: null },
    );
    assert.equal(missing, "That building doesn't belong to this property.");
    const bulkNeed = locationHierarchyError(
      {},
      { building: null, wing: null, floor: null },
      { requireBuilding: true },
    );
    assert.equal(bulkNeed, "Choose a building for this room.");
  });

  it("filters wings and floors by building and clears invalid children on cascade", () => {
    const wings = [
      { id: "w-main", parentBuildingId: "b-main", parentFloorId: null },
      { id: "w-b3", parentBuildingId: "b3", parentFloorId: null },
      { id: "w-floor", parentBuildingId: null, parentFloorId: "f-main" },
    ];
    const floors = [
      { id: "f-main", buildingId: "b-main", wingId: null },
      { id: "f-b3", buildingId: "b3", wingId: "w-b3" },
      { id: "f-b3-open", buildingId: "b3", wingId: null },
    ];
    assert.deepEqual(
      wingsForBuilding(wings, floors, "b3").map((row) => row.id),
      ["w-b3"],
    );
    assert.deepEqual(
      wingsForBuilding(wings, floors, "b-main").map((row) => row.id),
      ["w-main", "w-floor"],
    );
    assert.deepEqual(wingsForBuilding(wings, floors, ""), []);
    assert.deepEqual(
      floorsForBuildingAndWing(floors, wings, "b3", "").map((row) => row.id),
      ["f-b3", "f-b3-open"],
    );
    assert.deepEqual(
      floorsForBuildingAndWing(floors, wings, "b3", "w-b3").map((row) => row.id),
      ["f-b3", "f-b3-open"],
    );
    assert.deepEqual(
      floorsForBuildingAndWing(floors, wings, "b-main", "w-floor").map((row) => row.id),
      ["f-main"],
    );
    const cleared = cascadeLocationIds({
      buildingId: "b3",
      wingId: "w-main",
      floorId: "f-main",
      wings,
      floors,
      changed: "building",
    });
    assert.deepEqual(cleared, { buildingId: "b3", wingId: "", floorId: "" });
    const wingChange = cascadeLocationIds({
      buildingId: "b-main",
      wingId: "w-floor",
      floorId: "f-b3",
      wings,
      floors,
      changed: "wing",
    });
    assert.equal(wingChange.floorId, "");
    assert.deepEqual(
      cascadeLocationIds({
        buildingId: "",
        wingId: "w-b3",
        floorId: "f-b3",
        wings,
        floors,
        changed: "building",
      }),
      { buildingId: "", wingId: "", floorId: "" },
    );
  });

  it("generates sequential prefix/suffix labels and detects duplicates", () => {
    const labels = sequentialRoomLabels({ startNumber: 101, quantity: 3, prefix: "A", suffix: "" });
    assert.equal(labels.ok, true);
    if (labels.ok) {
      assert.deepEqual(labels.labels.map((row) => row.roomNumber), ["A101", "A102", "A103"]);
    }
    const range = sequentialRoomLabels({ startNumber: 1, endNumber: 2, prefix: "", suffix: "B" });
    assert.equal(range.ok, true);
    if (range.ok) {
      const conflicts = batchLabelConflicts(range.labels, [{ roomNumber: "1B", roomCode: "1B" }]);
      assert.deepEqual(conflicts.numbers, ["1B"]);
      assert.deepEqual(conflicts.codes, ["1B"]);
    }
    const mismatch = sequentialRoomLabels({ startNumber: 1, endNumber: 3, quantity: 2 });
    assert.equal(mismatch.ok, false);
  });

  it("rejects self-links, cross-tenant targets, and duplicate pairs", () => {
    assert.equal(roomLinkErrors("r1", [{ otherRoomId: "r1", kind: "connecting" }], new Set(["r1"])), "A room cannot link to itself.");
    assert.equal(roomLinkErrors("r1", [{ otherRoomId: "r2", kind: "adjacent" }], new Set()), "Linked rooms must belong to this property.");
    assert.equal(
      roomLinkErrors(
        "r1",
        [
          { otherRoomId: "r2", kind: "connecting" },
          { otherRoomId: "r2", kind: "connecting" },
        ],
        new Set(["r2"]),
      ),
      "Duplicate room relationship.",
    );
    assert.equal(roomLinkErrors("r1", [{ otherRoomId: "r2", kind: "connecting" }], new Set(["r2"])), null);
  });
});

describe("Card 2 Phase 1 readiness and status json", () => {
  it("is not ready with blockers and ready when inventory rules pass", () => {
    const blocked = evaluateRoomTypesRoomsReadiness({ types: [], beds: [], rooms: [] });
    assert.equal(blocked.ready, false);
    assert.ok(blocked.blockers.length > 0);
    const ready = evaluateRoomTypesRoomsReadiness({
      types: [{
        id: "t1",
        code: "DLX",
        standardOccupancy: 2,
        maxOccupancy: 3,
        adultCapacity: 2,
        childCapacity: 1,
        infantCapacity: 0,
      }],
      beds: [{ roomTypeId: "t1", bedCount: 1 }],
      rooms: [{
        id: "r1",
        roomNumber: "101",
        roomCode: "101",
        roomTypeId: "t1",
        buildingId: "b1",
        wingId: null,
        floorId: "f1",
      }],
      floors: [{ id: "f1", buildingId: "b1", wingId: null }],
      wings: [],
    });
    assert.equal(ready.ready, true);
    assert.deepEqual(ready.blockers, []);
  });

  it("keeps readiness false when a room floor belongs to another building", () => {
    const mismatched = evaluateRoomTypesRoomsReadiness({
      types: [{
        id: "t1",
        code: "DLX",
        standardOccupancy: 2,
        maxOccupancy: 3,
        adultCapacity: 2,
        childCapacity: 1,
        infantCapacity: 0,
      }],
      beds: [{ roomTypeId: "t1", bedCount: 1 }],
      rooms: [{
        id: "r1",
        roomNumber: "101",
        roomCode: "101",
        roomTypeId: "t1",
        buildingId: "b3",
        wingId: null,
        floorId: "f-main",
      }],
      floors: [{ id: "f-main", buildingId: "b-main", wingId: null }],
      wings: [],
    });
    assert.equal(mismatched.ready, false);
    assert.ok(mismatched.blockers.includes("Every room needs a valid property location."));
  });

  it("never marks the whole Card 2 complete from room-types readiness", () => {
    const merged = mergeCard2RoomTypesStatus(
      { cards: { "rooms-inventory": "complete" }, card1Steps: {} },
      "complete",
    );
    assert.equal(merged.card2Steps?.["room-types"], "complete");
    assert.notEqual(merged.cards["rooms-inventory"], "complete");
    assert.equal(card2RoomTypesStepStatus(false, false), "not_started");
    assert.equal(card2RoomTypesStepStatus(false, true), "in_progress");
    const parsed = parsePropertySetupStatus({
      cards: {},
      card1Steps: {},
      card2Steps: { "room-types": "complete", amenities: "complete" },
    });
    assert.equal(parsed.card2Steps?.["room-types"], "complete");
    assert.equal(parsed.card2Steps?.amenities, "complete");
  });
});

describe("Card 2 Phase 1 API wiring", () => {
  it("keeps authz, tenant filters, single bulk insert, and independent status columns", () => {
    assert.match(functions, /export const saveRoomType/);
    assert.match(functions, /export const saveRoom/);
    assert.match(functions, /export const bulkCreateRooms/);
    assert.match(functions, /export const evaluateCard2RoomTypesReadiness/);
    assert.match(functions, /requireRoomManager/);
    assert.match(functions, /requireSupabaseAuth/);
    assert.match(functions, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(functions, /from\("room_type_beds"\)/);
    assert.match(functions, /from\("hotel_room_links"\)/);
    assert.match(functions, /from\("hotel_rooms"\)\.insert\(rows\)/);
    assert.doesNotMatch(functions, /for \(const .+ of generated\.labels\)[\s\S]*saveRoom/);
    assert.match(functions, /housekeeping_status/);
    assert.match(functions, /maintenance_status/);
    assert.match(functions, /room_features/);
    assert.match(functions, /createdCount: 0/);
    assert.match(card1Fns, /persistCard2RoomTypesReadiness/);
    assert.doesNotMatch(functions, /complete=true/);
    assert.match(functions, /sequential, fail-closed on beds/);
    assert.match(ROOM_TYPE_BEDS_SEQUENTIAL_LIMITATION, /two statements/);
  });

  it("maps unique violations distinctly for number vs code", () => {
    assert.equal(
      uniqueViolationMessage({ code: "23505", message: "hotel_rooms_code_unique" }, "fail"),
      "That room code already exists.",
    );
    assert.equal(
      uniqueViolationMessage({ code: "23505", message: "hotel_rooms_room_number_key" }, "fail"),
      "That room number already exists.",
    );
  });
});
