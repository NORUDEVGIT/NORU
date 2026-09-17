/**
 * PMS-SET2 — Structure · Rooms deep-link · Amenities · Outlets (Issue #62).
 *
 * Live inspect 2026-09-14 (qcwptraosaudcbjasmul / main, after #63 + 0048):
 * - hotel_buildings / hotel_floors / hotel_wings / pms_outlets exist and are empty.
 * - hotel_rooms has text building/floor/wing plus nullable FKs (all FK-null).
 * - Live free-text still mixes "1" and "f1". Do not infer masters from it.
 * - hotel_rooms RLS is SELECT/INSERT/UPDATE — no DELETE. Soft-deactivate rooms.
 * - room_types, room_amenities (24), room_type_amenities, room_type_images exist.
 * - pms_set1_live exists and is false on every restaurant.
 * - folio_transactions has no outlet_id.
 * - Pre-merge hub labelled Outlets as SET3 Coming soon with no href. Spec puts
 *   Outlets in SET2 — unmute as a Live card with Configure #outlets.
 *
 * Single expanding Activate on pms_set1_live. Amenities empty = Warning.
 * Sync text labels only on assign/reassign. Never backfill FKs from "1"/"f1".
 * 0048 tables/columns are additive and may be absent — never crash.
 */

import type { Set1DomainReport, Set1Readiness } from "./pms-set1-foundation";

export const SET2_STRUCTURE_UNAVAILABLE = "Unavailable — structure columns are not applied yet.";
export const SET2_OUTLETS_UNAVAILABLE = "Unavailable — outlet columns are not applied yet.";
export const SET2_AMENITIES_WARNING = "No amenities in the catalogue yet. This is a warning, not a block.";
export const SET2_DEFAULT_OUTLET_WARN = "This is the default Rooms outlet. Prefer deactivate over delete.";
export const SET2_RI_HREF = "/restaurant/pms/room-inventory";
export const SET2_RI_ROOMS_HREF = "/restaurant/pms/room-inventory?tab=rooms";
export const SET2_RI_TYPES_HREF = "/restaurant/pms/room-inventory?tab=room-types";
export const SET2_AUDIT_STRUCTURE = "pms_set2_structure_updated";
export const SET2_AUDIT_OUTLET = "pms_set2_outlet_updated";
export const SET2_AUDIT_AMENITY = "pms_set2_amenity_updated";
export const SET2_DEACTIVATE_WARN = "Rooms still assigned here will keep their labels. Prefer deactivate unless you intend to reassign.";

export const MAIN_BUILDING_CODE = "MAIN";
export const MAIN_BUILDING_NAME = "Main building";
export const FLOOR_1_CODE = "1";
export const FLOOR_1_NAME = "Floor 1";

export const OUTLET_TYPES = ["rooms", "restaurant", "bar", "spa", "other"] as const;
export type OutletType = (typeof OUTLET_TYPES)[number];

export const OUTLET_TYPE_LABELS: Record<OutletType, string> = {
  rooms: "Rooms",
  restaurant: "Restaurant",
  bar: "Bar",
  spa: "Spa",
  other: "Other",
};

export type StructureKind = "building" | "floor" | "wing";

export type HotelBuilding = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  floorCount: number | null;
  buildingType: string;
  description: string;
  location: string;
  status: string;
};

export type HotelFloor = {
  id: string;
  buildingId: string;
  code: string;
  name: string;
  active: boolean;
  floorNumber: number | null;
  description: string;
  status: string;
  wingId: string | null;
};

export type HotelWing = {
  id: string;
  name: string;
  active: boolean;
  parentBuildingId: string | null;
  parentFloorId: string | null;
  code: string;
  description: string;
  status: string;
};

export type PmsOutlet = {
  id: string;
  code: string;
  name: string;
  type: OutletType;
  active: boolean;
  departmentText: string;
  defaultPostingLabel: string;
  isDefaultRooms: boolean;
};

export type Set2Amenity = {
  id: string;
  name: string;
  code: string;
  category: string;
  active: boolean;
};

export type Set2ActivateInput = {
  structureColumnsAvailable: boolean;
  outletsColumnsAvailable: boolean;
  activeBuildingCount: number;
  activeFloorCount: number;
  roomTypeCount: number;
  roomCount: number;
  amenityCount: number;
  hasActiveRoomsOutlet: boolean;
};

export type Set2Snapshot = {
  structureColumnsAvailable: boolean;
  outletsColumnsAvailable: boolean;
  singleBuildingMode: boolean;
  buildings: HotelBuilding[];
  floors: HotelFloor[];
  wings: HotelWing[];
  outlets: PmsOutlet[];
  amenities: Set2Amenity[];
  roomTypeCount: number;
  roomCount: number;
  unassignedActiveRoomCount: number;
  assignedByBuilding: Record<string, number>;
  assignedByFloor: Record<string, number>;
  assignedByWing: Record<string, number>;
};

export function emptySet2Activate(partial?: Partial<Set2ActivateInput>): Set2ActivateInput {
  return {
    structureColumnsAvailable: false,
    outletsColumnsAvailable: false,
    activeBuildingCount: 0,
    activeFloorCount: 0,
    roomTypeCount: 0,
    roomCount: 0,
    amenityCount: 0,
    hasActiveRoomsOutlet: false,
    ...partial,
  };
}

export function completeSet2Activate(partial?: Partial<Set2ActivateInput>): Set2ActivateInput {
  return emptySet2Activate({
    structureColumnsAvailable: true,
    outletsColumnsAvailable: true,
    activeBuildingCount: 1,
    activeFloorCount: 1,
    roomTypeCount: 1,
    roomCount: 1,
    amenityCount: 1,
    hasActiveRoomsOutlet: true,
    ...partial,
  });
}

export function emptySet2Snapshot(partial?: Partial<Set2Snapshot>): Set2Snapshot {
  return {
    structureColumnsAvailable: false,
    outletsColumnsAvailable: false,
    singleBuildingMode: false,
    buildings: [],
    floors: [],
    wings: [],
    outlets: [],
    amenities: [],
    roomTypeCount: 0,
    roomCount: 0,
    unassignedActiveRoomCount: 0,
    assignedByBuilding: {},
    assignedByFloor: {},
    assignedByWing: {},
    ...partial,
  };
}

export function activateInputFromSnapshot(snapshot: Set2Snapshot): Set2ActivateInput {
  return {
    structureColumnsAvailable: snapshot.structureColumnsAvailable,
    outletsColumnsAvailable: snapshot.outletsColumnsAvailable,
    activeBuildingCount: snapshot.buildings.filter((row) => row.active).length,
    activeFloorCount: snapshot.floors.filter((row) => row.active).length,
    roomTypeCount: snapshot.roomTypeCount,
    roomCount: snapshot.roomCount,
    amenityCount: snapshot.amenities.filter((row) => row.active).length,
    hasActiveRoomsOutlet: snapshot.outlets.some(
      (row) => row.active && (row.type === "rooms" || row.isDefaultRooms),
    ),
  };
}

export function isMissingSchemaError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "42P01" || error.code === "PGRST204" || error.code === "PGRST205") {
    return true;
  }
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the") ||
    /column .* (was )?not found/.test(msg)
  );
}

export function parseOutletType(value: unknown): OutletType | "" {
  return (OUTLET_TYPES as readonly string[]).includes(String(value)) ? (value as OutletType) : "";
}

export function wingParentXor(parentBuildingId: string | null | undefined, parentFloorId: string | null | undefined): boolean {
  const hasBuilding = Boolean(parentBuildingId);
  const hasFloor = Boolean(parentFloorId);
  return hasBuilding !== hasFloor;
}

export function structureDeleteBlocked(assignedRoomCount: number): boolean {
  return assignedRoomCount > 0;
}

export function structureDeleteMessage(kind: StructureKind, assignedRoomCount: number): string | null {
  if (!structureDeleteBlocked(assignedRoomCount)) return null;
  const noun = assignedRoomCount === 1 ? "room" : "rooms";
  return `Reassign ${assignedRoomCount} ${noun} before deleting this ${kind}.`;
}

export function structureMandatoryComplete(input: Pick<Set2ActivateInput, "structureColumnsAvailable" | "activeBuildingCount" | "activeFloorCount">): boolean {
  return input.structureColumnsAvailable && input.activeBuildingCount >= 1 && input.activeFloorCount >= 1;
}

export function roomsMandatoryComplete(input: Pick<Set2ActivateInput, "roomTypeCount" | "roomCount">): boolean {
  return input.roomTypeCount >= 1 && input.roomCount >= 1;
}

export function outletsMandatoryComplete(input: Pick<Set2ActivateInput, "outletsColumnsAvailable" | "hasActiveRoomsOutlet">): boolean {
  return input.outletsColumnsAvailable && input.hasActiveRoomsOutlet;
}

export function amenitiesEmptyWarning(amenityCount: number): boolean {
  return amenityCount === 0;
}

/** Unassigned to a master = no FK. Historical free-text is ignored. */
export function roomNeedsStructureAssign(buildingId: string | null | undefined): boolean {
  return !buildingId;
}

/** Live floor labels include "1" and "f1". Never invent a master from that text. */
export function inferMasterFromFreeText(_label: string | null | undefined): null {
  return null;
}

function domain(
  id: Set1DomainReport["id"],
  missing: string[],
  warnings: string[],
): Set1DomainReport {
  const readiness: Set1Readiness = missing.length ? "incomplete" : warnings.length ? "warning" : "complete";
  return { id, readiness, missing, warnings };
}

export function evaluateStructure(input: Set2ActivateInput): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!input.structureColumnsAvailable) {
    missing.push("Building");
    missing.push("Floor");
    warnings.push(SET2_STRUCTURE_UNAVAILABLE);
    return domain("structure", missing, warnings);
  }
  if (input.activeBuildingCount < 1) missing.push("Building");
  if (input.activeFloorCount < 1) missing.push("Floor");
  return domain("structure", missing, warnings);
}

export function evaluateRooms(input: Set2ActivateInput): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (input.roomTypeCount < 1) missing.push("Room type");
  if (input.roomCount < 1) missing.push("Room");
  if (amenitiesEmptyWarning(input.amenityCount)) warnings.push(SET2_AMENITIES_WARNING);
  return domain("rooms", missing, warnings);
}

export function evaluateOutlets(input: Set2ActivateInput): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!input.outletsColumnsAvailable) {
    missing.push("Rooms outlet");
    warnings.push(SET2_OUTLETS_UNAVAILABLE);
    return domain("outlets", missing, warnings);
  }
  if (!input.hasActiveRoomsOutlet) missing.push("Rooms outlet");
  return domain("outlets", missing, warnings);
}

export function set2MandatoryMissing(input: Set2ActivateInput): string[] {
  return [...evaluateStructure(input).missing, ...evaluateRooms(input).missing, ...evaluateOutlets(input).missing];
}
