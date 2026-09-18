/**
 * Card 2 Phase 2 — Amenities validators (pure).
 * Catalog, type mappings, room overrides, effective set, readiness.
 * Effective amenities are derived, never flattened onto hotel_rooms.
 */
import {
  parsePropertySetupStatus,
  type PropertySetupCardStatus,
  type PropertySetupStatus,
} from "./pms-property-setup-card1.ts";

export const AMENITY_OVERRIDE_KINDS = ["add", "remove"] as const;
export type AmenityOverrideKind = (typeof AMENITY_OVERRIDE_KINDS)[number];

export const AMENITY_CATEGORIES = [
  "Room Amenities",
  "Bathroom Amenities",
  "Technology",
  "Furniture",
  "Safety",
  "Accessibility",
  "Guest Comfort",
  "Kitchen / Pantry",
  "Outdoor Features",
] as const;
export type AmenityCategory = (typeof AMENITY_CATEGORIES)[number];

export function isApprovedAmenityCategory(value: string | null | undefined): value is AmenityCategory {
  return AMENITY_CATEGORIES.includes((value ?? "").trim() as AmenityCategory);
}

export function uncategorizedAmenityCount(rows: { category?: string | null }[]): number {
  return rows.filter((row) => !isApprovedAmenityCategory(row.category)).length;
}

export type AmenityCatalogDraft = {
  name: string;
  category: string;
  code?: string | null | undefined;
  description?: string | null | undefined;
  icon?: string | null | undefined;
  active: boolean;
  complimentary: boolean;
  displayToGuest: boolean;
  internalOnly: boolean;
};

export type AmenityCatalogRow = {
  id: string;
  name: string;
  category: string | null;
  code: string | null;
};

export type AmenityOverrideDraft = {
  amenityId: string;
  kind: AmenityOverrideKind;
};

export type RoomTypeAmenityMapRow = {
  roomTypeId: string;
  amenityId: string;
};

export type RoomAmenityOverrideRow = {
  roomId: string;
  amenityId: string;
  kind: string;
};

export type ReadinessRoom = {
  id: string;
  roomTypeId: string | null;
};

export function normalizeAmenityCode(code: string | null | undefined): string | null {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export function amenityCatalogErrors(draft: AmenityCatalogDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Amenity name is required.");
  if (!draft.category.trim()) errors.push("Amenity category is required.");
  else if (!isApprovedAmenityCategory(draft.category)) errors.push("Choose an approved amenity category.");
  if (typeof draft.active !== "boolean") errors.push("Active must be true or false.");
  if (typeof draft.complimentary !== "boolean") errors.push("Complimentary must be true or false.");
  if (typeof draft.displayToGuest !== "boolean") errors.push("Display to guest must be true or false.");
  if (typeof draft.internalOnly !== "boolean") errors.push("Internal only must be true or false.");
  return errors;
}

export function duplicateNormalizedCodes(rows: AmenityCatalogRow[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeAmenityCode(row.code);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key);
}

export function dedupeAmenityIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function mappingSaveErrors(input: {
  roomTypeExists: boolean;
  amenityIds: string[];
  validAmenityIds: Set<string>;
}): string | null {
  if (!input.roomTypeExists) return "That room type was not found.";
  const unique = dedupeAmenityIds(input.amenityIds);
  if (unique.some((id) => !input.validAmenityIds.has(id))) {
    return "Every amenity must belong to this property.";
  }
  return null;
}

export function overrideSaveErrors(input: {
  roomExists: boolean;
  drafts: AmenityOverrideDraft[];
  validAmenityIds: Set<string>;
}): string | null {
  if (!input.roomExists) return "That room was not found.";
  const seen = new Set<string>();
  for (const draft of input.drafts) {
    if (draft.kind !== "add" && draft.kind !== "remove") {
      return "Override kind must be add or remove.";
    }
    if (!input.validAmenityIds.has(draft.amenityId)) {
      return "Every amenity must belong to this property.";
    }
    if (seen.has(draft.amenityId)) return "Only one override is allowed per amenity on a room.";
    seen.add(draft.amenityId);
  }
  return null;
}

export type EffectiveAmenitySet = {
  inherited: string[];
  added: string[];
  removed: string[];
  effective: string[];
};

export function effectiveAmenities(input: {
  typeAmenityIds: string[];
  overrides: AmenityOverrideDraft[];
}): EffectiveAmenitySet {
  const inherited = dedupeAmenityIds(input.typeAmenityIds);
  const inheritedSet = new Set(inherited);
  const added: string[] = [];
  const removed: string[] = [];
  const addSet = new Set<string>();
  const removeSet = new Set<string>();

  for (const row of input.overrides) {
    if (row.kind === "add") {
      if (!inheritedSet.has(row.amenityId) && !addSet.has(row.amenityId)) {
        added.push(row.amenityId);
        addSet.add(row.amenityId);
      }
    } else if (row.kind === "remove") {
      if (!removeSet.has(row.amenityId)) {
        removed.push(row.amenityId);
        removeSet.add(row.amenityId);
      }
    }
  }

  const effective = [
    ...inherited.filter((id) => !removeSet.has(id)),
    ...added.filter((id) => !removeSet.has(id)),
  ];
  return { inherited, added, removed, effective };
}

export function evaluateAmenitiesReadiness(input: {
  catalog: AmenityCatalogRow[];
  mappings: RoomTypeAmenityMapRow[];
  overrides: RoomAmenityOverrideRow[];
  roomTypes: { id: string; active?: boolean }[];
  rooms: ReadinessRoom[];
}): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const typeIds = new Set(input.roomTypes.map((row) => row.id));
  const amenityIds = new Set(input.catalog.map((row) => row.id));
  const roomIds = new Set(input.rooms.map((row) => row.id));

  if (input.catalog.some((row) => !row.name.trim())) {
    blockers.push("Every amenity needs a name and category.");
  }
  const missingCategory = uncategorizedAmenityCount(input.catalog);
  if (missingCategory > 0) {
    blockers.push(
      `${missingCategory} amenities require a category before Amenities setup can be completed.`,
    );
  }
  if (duplicateNormalizedCodes(input.catalog).length > 0) {
    blockers.push("Amenity codes must be unique.");
  }

  const mappingKeys = new Set<string>();
  for (const row of input.mappings) {
    const key = `${row.roomTypeId}:${row.amenityId}`;
    if (mappingKeys.has(key)) {
      blockers.push("Room type amenity mappings must be unique.");
      break;
    }
    mappingKeys.add(key);
    if (!typeIds.has(row.roomTypeId) || !amenityIds.has(row.amenityId)) {
      blockers.push("Room type mappings must reference amenities in this property.");
      break;
    }
  }

  const overrideKeys = new Set<string>();
  for (const row of input.overrides) {
    const key = `${row.roomId}:${row.amenityId}`;
    if (overrideKeys.has(key)) {
      blockers.push("Room amenity overrides must be unique.");
      break;
    }
    overrideKeys.add(key);
    if (row.kind !== "add" && row.kind !== "remove") {
      blockers.push("Room amenity overrides must be add or remove.");
      break;
    }
    if (!roomIds.has(row.roomId) || !amenityIds.has(row.amenityId)) {
      blockers.push("Room overrides must reference rooms and amenities in this property.");
      break;
    }
  }

  const mappingsByType = new Map<string, string[]>();
  for (const row of input.mappings) {
    const list = mappingsByType.get(row.roomTypeId) ?? [];
    list.push(row.amenityId);
    mappingsByType.set(row.roomTypeId, list);
  }
  const overridesByRoom = new Map<string, AmenityOverrideDraft[]>();
  for (const row of input.overrides) {
    if (row.kind !== "add" && row.kind !== "remove") continue;
    const list = overridesByRoom.get(row.roomId) ?? [];
    list.push({ amenityId: row.amenityId, kind: row.kind });
    overridesByRoom.set(row.roomId, list);
  }

  for (const room of input.rooms) {
    if (!room.roomTypeId) continue;
    if (!typeIds.has(room.roomTypeId)) {
      blockers.push("Effective amenities need a valid room type on every mapped room.");
      break;
    }
    effectiveAmenities({
      typeAmenityIds: mappingsByType.get(room.roomTypeId) ?? [],
      overrides: overridesByRoom.get(room.id) ?? [],
    });
  }

  const activeWithoutDefaults = input.roomTypes.filter(
    (row) => row.active !== false && (mappingsByType.get(row.id) ?? []).length === 0,
  );
  if (activeWithoutDefaults.length > 0) {
    blockers.push(`${activeWithoutDefaults.length} active room types have no amenity defaults.`);
  }

  return { ready: blockers.length === 0, blockers: Array.from(new Set(blockers)) };
}

export function amenitiesHasStarted(input: {
  catalogCount: number;
  mappingCount: number;
  overrideCount: number;
}): boolean {
  return input.catalogCount > 0 || input.mappingCount > 0 || input.overrideCount > 0;
}

export function card2RoomAmenitiesStepStatus(
  ready: boolean,
  hasStarted: boolean,
): PropertySetupCardStatus {
  if (ready) return "complete";
  if (hasStarted) return "in_progress";
  return "not_started";
}

export function mergeCard2AmenitiesStatus(
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
    card2Steps: { ...parsed.card2Steps, amenities: stepStatus },
  };
}

export function amenityUniqueViolationMessage(
  error: { code?: string; message?: string; details?: string } | null,
  fallback: string,
): string {
  if (error?.code !== "23505") return fallback;
  const blob = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (blob.includes("restaurant_code") || blob.includes("code_unique") || blob.includes("(code)")) {
    return "That amenity code already exists.";
  }
  if (blob.includes("name")) return "That amenity name is already used.";
  return fallback;
}
