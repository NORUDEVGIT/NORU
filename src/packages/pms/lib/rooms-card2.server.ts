/**
 * Card 2 Phase 1 — Room Types & Rooms validators (pure).
 * Occupancy, beds, location hierarchy, sequential numbering, readiness.
 *
 * Known integrity limitation: saveRoomType writes the room_types row, then
 * replaces room_type_beds in a second statement. There is no multi-statement
 * transaction without a new RPC. A bed-write failure must return ok:false
 * (the type row may already exist). Readiness stays incomplete without valid
 * beds. Future (PM-gated): one Postgres function wrapping type + beds, via rpc.
 */
export const ROOM_TYPE_BEDS_SEQUENTIAL_LIMITATION =
  "Room type and bed configuration persist in two statements. A bed-write failure is never reported as success.";
import {
  parsePropertySetupStatus,
  type PropertySetupCardStatus,
  type PropertySetupStatus,
} from "./pms-property-setup-card1.ts";

export const BULK_ROOM_MAX = 200;

export type OccupancyInput = {
  standardOccupancy: number;
  maxOccupancy: number;
  adultCapacity: number;
  childCapacity: number;
  infantCapacity: number;
};

export type RoomTypeBedDraft = {
  bedType: string;
  bedSize?: string | null | undefined;
  numberOfBeds: number;
};

export type NormalizedBedRow = {
  bedType: string;
  bedSize: string | null;
  bedCount: number;
  sortOrder: number;
};

export type LocationIds = {
  buildingId?: string | null | undefined;
  wingId?: string | null | undefined;
  floorId?: string | null | undefined;
};

export type LocationMasters = {
  building: { id: string; name: string } | null;
  wing: { id: string; name: string; parentBuildingId: string | null; parentFloorId: string | null } | null;
  floor: { id: string; name: string; buildingId: string; wingId: string | null } | null;
};

export type SequentialNumberingInput = {
  startNumber: number;
  endNumber?: number | null | undefined;
  quantity?: number | null | undefined;
  prefix?: string | null | undefined;
  suffix?: string | null | undefined;
};

export type GeneratedRoomLabel = {
  roomNumber: string;
  roomCode: string;
  sequence: number;
};

export type ExistingRoomLabel = {
  roomNumber: string;
  roomCode: string | null;
};

export type RoomLinkDraft = {
  otherRoomId: string;
  kind: "connecting" | "adjacent";
};

export type ReadinessRoomType = OccupancyInput & {
  id: string;
  code: string;
};

export type ReadinessBed = {
  roomTypeId: string;
  bedCount: number;
};

export type ReadinessRoom = {
  id: string;
  roomNumber: string;
  roomCode: string | null;
  roomTypeId: string | null;
  buildingId: string | null;
  wingId: string | null;
  floorId: string | null;
};

export type RoomTypesRoomsReadiness = {
  ready: boolean;
  blockers: string[];
};

export function occupancyErrors(input: OccupancyInput): string[] {
  const errors: string[] = [];
  if (
    !Number.isInteger(input.standardOccupancy) ||
    !Number.isInteger(input.maxOccupancy) ||
    !Number.isInteger(input.adultCapacity) ||
    !Number.isInteger(input.childCapacity) ||
    !Number.isInteger(input.infantCapacity)
  ) {
    errors.push("Occupancy values must be whole numbers.");
    return errors;
  }
  if (input.maxOccupancy < 1) errors.push("Maximum occupancy must be at least 1.");
  if (input.standardOccupancy < 1) errors.push("Standard occupancy must be at least 1.");
  if (input.adultCapacity < 0 || input.childCapacity < 0 || input.infantCapacity < 0) {
    errors.push("Occupancy values cannot be negative.");
  }
  if (input.standardOccupancy > input.maxOccupancy) {
    errors.push("Standard occupancy cannot exceed maximum occupancy.");
  }
  if (input.adultCapacity + input.childCapacity > input.maxOccupancy) {
    errors.push("Adults plus children cannot exceed maximum occupancy.");
  }
  return errors;
}

export function occupancyValid(input: OccupancyInput): boolean {
  return occupancyErrors(input).length === 0;
}

export function normalizeBedRows(rows: RoomTypeBedDraft[]): { ok: true; rows: NormalizedBedRow[] } | { ok: false; message: string } {
  const out: NormalizedBedRow[] = [];
  for (const [index, row] of rows.entries()) {
    const bedType = (row.bedType ?? "").trim();
    const bedSize = (row.bedSize ?? "").trim();
    if (!bedType) return { ok: false, message: "Each bed row needs a bed type." };
    if (!Number.isInteger(row.numberOfBeds) || row.numberOfBeds < 1) {
      return { ok: false, message: "Number of beds must be greater than 0." };
    }
    out.push({
      bedType,
      bedSize: bedSize === "" ? null : bedSize,
      bedCount: row.numberOfBeds,
      sortOrder: index,
    });
  }
  return { ok: true, rows: out };
}

export function locationHierarchyError(
  ids: LocationIds,
  masters: LocationMasters,
  options?: { requireBuilding?: boolean },
): string | null {
  const buildingId = ids.buildingId ?? null;
  const wingId = ids.wingId ?? null;
  const floorId = ids.floorId ?? null;

  if (options?.requireBuilding && !buildingId) {
    return "Choose a building for this room.";
  }
  if (buildingId && !masters.building) {
    return "That building doesn't belong to this property.";
  }
  if (wingId && !masters.wing) {
    return "That wing doesn't belong to this property.";
  }
  if (floorId && !masters.floor) {
    return "That floor doesn't belong to this property.";
  }
  if (buildingId && masters.wing?.parentBuildingId && masters.wing.parentBuildingId !== buildingId) {
    return "That wing does not belong to the selected building.";
  }
  if (buildingId && masters.floor && masters.floor.buildingId !== buildingId) {
    return "That floor does not belong to the selected building.";
  }
  if (floorId && masters.wing?.parentFloorId && masters.wing.parentFloorId !== floorId) {
    return "That wing does not belong to the selected floor.";
  }
  if (wingId && masters.floor?.wingId && masters.floor.wingId !== wingId) {
    return "That floor does not belong to the selected wing.";
  }
  if (!buildingId && masters.floor && masters.wing?.parentBuildingId && masters.wing.parentBuildingId !== masters.floor.buildingId) {
    return "Wing and floor must belong to the same building.";
  }
  return null;
}

export type CascadeWing = {
  id: string;
  parentBuildingId: string | null;
  parentFloorId: string | null;
};

export type CascadeFloor = {
  id: string;
  buildingId: string;
  wingId: string | null;
};

/** Wings whose parent is this building, or whose parent floor lives in this building. */
export function wingsForBuilding<T extends CascadeWing>(
  wings: T[],
  floors: CascadeFloor[],
  buildingId: string | null | undefined,
): T[] {
  if (!buildingId) return [];
  const floorIds = new Set(floors.filter((row) => row.buildingId === buildingId).map((row) => row.id));
  return wings.filter(
    (row) =>
      row.parentBuildingId === buildingId ||
      (row.parentFloorId != null && floorIds.has(row.parentFloorId)),
  );
}

export function floorsForBuildingAndWing<T extends CascadeFloor>(
  floors: T[],
  wings: CascadeWing[],
  buildingId: string | null | undefined,
  wingId: string | null | undefined,
): T[] {
  if (!buildingId) return [];
  const inBuilding = floors.filter((row) => row.buildingId === buildingId);
  if (!wingId) return inBuilding;
  const wing = wings.find((row) => row.id === wingId);
  if (!wing) return [];
  if (wing.parentFloorId) return inBuilding.filter((row) => row.id === wing.parentFloorId);
  return inBuilding.filter((row) => row.wingId == null || row.wingId === wingId);
}

/** Drop wing/floor that are invalid after a parent change. Empty building clears both. */
export function cascadeLocationIds(input: {
  buildingId: string;
  wingId: string;
  floorId: string;
  wings: CascadeWing[];
  floors: CascadeFloor[];
  changed: "building" | "wing";
}): { buildingId: string; wingId: string; floorId: string } {
  const buildingId = input.buildingId;
  if (!buildingId) return { buildingId: "", wingId: "", floorId: "" };

  let wingId = input.wingId;
  const allowedWings = wingsForBuilding(input.wings, input.floors, buildingId);
  if (input.changed === "building" && wingId && !allowedWings.some((row) => row.id === wingId)) {
    wingId = "";
  }
  if (wingId && !allowedWings.some((row) => row.id === wingId)) wingId = "";

  let floorId = input.floorId;
  const allowedFloors = floorsForBuildingAndWing(input.floors, input.wings, buildingId, wingId);
  if (floorId && !allowedFloors.some((row) => row.id === floorId)) floorId = "";

  return { buildingId, wingId, floorId };
}

export function sequentialRoomLabels(
  input: SequentialNumberingInput,
): { ok: true; labels: GeneratedRoomLabel[] } | { ok: false; validationErrors: string[] } {
  const errors: string[] = [];
  if (!Number.isInteger(input.startNumber) || input.startNumber < 0) {
    errors.push("Starting number must be a whole number of 0 or more.");
  }
  const prefix = (input.prefix ?? "").trim();
  const suffix = (input.suffix ?? "").trim();
  const hasEnd = input.endNumber != null;
  const hasQty = input.quantity != null;

  if (!hasEnd && !hasQty) {
    errors.push("Provide an ending number or a quantity.");
  }
  if (hasEnd && (!Number.isInteger(input.endNumber) || (input.endNumber ?? 0) < 0)) {
    errors.push("Ending number must be a whole number of 0 or more.");
  }
  if (hasQty && (!Number.isInteger(input.quantity) || (input.quantity ?? 0) < 1)) {
    errors.push("Quantity must be at least 1.");
  }
  if (hasEnd && input.endNumber != null && input.endNumber < input.startNumber) {
    errors.push("Ending number cannot be before the starting number.");
  }

  if (errors.length > 0) return { ok: false, validationErrors: errors };

  let sequences: number[] = [];
  if (hasEnd && input.endNumber != null) {
    sequences = Array.from(
      { length: input.endNumber - input.startNumber + 1 },
      (_, i) => input.startNumber + i,
    );
  } else {
    sequences = Array.from({ length: input.quantity ?? 0 }, (_, i) => input.startNumber + i);
  }

  if (hasEnd && hasQty && sequences.length !== input.quantity) {
    return {
      ok: false,
      validationErrors: ["Quantity does not match the starting and ending numbers."],
    };
  }
  if (sequences.length < 1) {
    return { ok: false, validationErrors: ["Quantity must be at least 1."] };
  }
  if (sequences.length > BULK_ROOM_MAX) {
    return { ok: false, validationErrors: [`Cannot create more than ${BULK_ROOM_MAX} rooms in one batch.`] };
  }

  const labels = sequences.map((sequence) => {
    const token = String(sequence);
    const label = `${prefix}${token}${suffix}`;
    return { roomNumber: label, roomCode: label, sequence };
  });
  return { ok: true, labels };
}

export function batchLabelConflicts(
  labels: GeneratedRoomLabel[],
  existing: ExistingRoomLabel[],
): { numbers: string[]; codes: string[] } {
  const numbers: string[] = [];
  const codes: string[] = [];
  const seenNumbers = new Set<string>();
  const seenCodes = new Set<string>();
  for (const row of labels) {
    if (seenNumbers.has(row.roomNumber) && !numbers.includes(row.roomNumber)) numbers.push(row.roomNumber);
    if (seenCodes.has(row.roomCode) && !codes.includes(row.roomCode)) codes.push(row.roomCode);
    seenNumbers.add(row.roomNumber);
    seenCodes.add(row.roomCode);
  }
  const existingNumbers = new Set(existing.map((row) => row.roomNumber));
  const existingCodes = new Set(
    existing.map((row) => (row.roomCode ?? "").trim()).filter(Boolean),
  );
  for (const row of labels) {
    if (existingNumbers.has(row.roomNumber) && !numbers.includes(row.roomNumber)) numbers.push(row.roomNumber);
    if (existingCodes.has(row.roomCode) && !codes.includes(row.roomCode)) codes.push(row.roomCode);
  }
  return { numbers, codes };
}

export function normalizeRoomFeatures(values: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function roomLinkErrors(
  sourceRoomId: string | null,
  links: RoomLinkDraft[],
  allowedTargetIds: Set<string>,
): string | null {
  const seen = new Set<string>();
  for (const link of links) {
    if (sourceRoomId && link.otherRoomId === sourceRoomId) {
      return "A room cannot link to itself.";
    }
    if (!allowedTargetIds.has(link.otherRoomId)) {
      return "Linked rooms must belong to this property.";
    }
    const key = `${link.otherRoomId}:${link.kind}`;
    if (seen.has(key)) return "Duplicate room relationship.";
    seen.add(key);
  }
  return null;
}

export function evaluateRoomTypesRoomsReadiness(input: {
  types: ReadinessRoomType[];
  beds: ReadinessBed[];
  rooms: ReadinessRoom[];
  floors?: { id: string; buildingId: string; wingId: string | null }[];
  wings?: { id: string; parentBuildingId: string | null }[];
}): RoomTypesRoomsReadiness {
  const blockers: string[] = [];
  if (input.types.length === 0) blockers.push("Add at least one room type.");
  if (input.rooms.length === 0) blockers.push("Add at least one physical room.");

  const codes = input.types.map((row) => row.code.trim().toUpperCase()).filter(Boolean);
  if (input.types.some((row) => !row.code.trim())) blockers.push("Every room type needs a unique code.");
  if (new Set(codes).size !== codes.length) blockers.push("Room type codes must be unique.");

  for (const type of input.types) {
    if (!occupancyValid(type)) {
      blockers.push("Room type occupancy rules are invalid.");
      break;
    }
  }

  const bedsByType = new Map<string, number>();
  for (const bed of input.beds) {
    if (bed.bedCount > 0) bedsByType.set(bed.roomTypeId, (bedsByType.get(bed.roomTypeId) ?? 0) + bed.bedCount);
  }
  if (input.types.some((type) => (bedsByType.get(type.id) ?? 0) < 1)) {
    blockers.push("Every room type needs a valid bed configuration.");
  }

  const numbers = input.rooms.map((row) => row.roomNumber.trim()).filter(Boolean);
  const codesRooms = input.rooms.map((row) => (row.roomCode ?? "").trim()).filter(Boolean);
  if (input.rooms.some((row) => !row.roomNumber.trim())) blockers.push("Every room needs a unique number.");
  if (new Set(numbers).size !== numbers.length) blockers.push("Room numbers must be unique.");
  if (input.rooms.some((row) => !(row.roomCode ?? "").trim())) blockers.push("Every room needs a unique code.");
  if (new Set(codesRooms).size !== codesRooms.length) blockers.push("Room codes must be unique.");
  if (input.rooms.some((row) => !row.roomTypeId)) blockers.push("Every room must belong to a room type.");

  const typeIds = new Set(input.types.map((row) => row.id));
  if (input.rooms.some((row) => row.roomTypeId && !typeIds.has(row.roomTypeId))) {
    blockers.push("Every room must belong to a room type.");
  }

  const floorById = new Map((input.floors ?? []).map((row) => [row.id, row]));
  const wingById = new Map((input.wings ?? []).map((row) => [row.id, row]));
  for (const room of input.rooms) {
    if (!room.buildingId) {
      blockers.push("Every room needs a valid property location.");
      break;
    }
    const floor = room.floorId ? floorById.get(room.floorId) : undefined;
    const wing = room.wingId ? wingById.get(room.wingId) : undefined;
    if (room.floorId && !floor) {
      blockers.push("Every room needs a valid property location.");
      break;
    }
    if (room.wingId && !wing) {
      blockers.push("Every room needs a valid property location.");
      break;
    }
    if (floor && floor.buildingId !== room.buildingId) {
      blockers.push("Every room needs a valid property location.");
      break;
    }
    if (wing?.parentBuildingId && wing.parentBuildingId !== room.buildingId) {
      blockers.push("Every room needs a valid property location.");
      break;
    }
  }

  return { ready: blockers.length === 0, blockers: Array.from(new Set(blockers)) };
}

export function card2RoomTypesStepStatus(ready: boolean, hasStarted: boolean): PropertySetupCardStatus {
  if (ready) return "complete";
  if (hasStarted) return "in_progress";
  return "not_started";
}

export function mergeCard2RoomTypesStatus(
  stored: unknown,
  stepStatus: PropertySetupCardStatus,
): PropertySetupStatus {
  const parsed = parsePropertySetupStatus(stored);
  const cards = { ...parsed.cards };
  if (cards["rooms-inventory"] === "complete") {
    cards["rooms-inventory"] = "in_progress";
  } else if (stepStatus !== "not_started" && cards["rooms-inventory"] !== "in_progress") {
    cards["rooms-inventory"] = "in_progress";
  }
  return {
    ...parsed,
    cards,
    card2Steps: { ...parsed.card2Steps, "room-types": stepStatus },
  };
}

export function uniqueViolationMessage(
  error: { code?: string; message?: string; details?: string } | null,
  fallback: string,
): string {
  if (error?.code !== "23505") return fallback;
  const blob = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (blob.includes("room_code") || blob.includes("code_unique")) return "That room code already exists.";
  if (blob.includes("room_number") || blob.includes("number")) return "That room number already exists.";
  if (blob.includes("room_types") || blob.includes("code")) return "That room type code is already used.";
  return fallback;
}
