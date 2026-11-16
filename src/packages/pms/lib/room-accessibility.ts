/**
 * Room accessibility semantics for staff configuration screens.
 *
 * The hard rule "Accessible room required" is decided only by the room's own
 * Accessible room setting (hotel_rooms.accessible), inside
 * pms_evaluate_room_assignment. Nothing in this module may feed assignment:
 *
 * - Room type "Contains accessible rooms" (room_types.accessible_eligible) is
 *   guidance only. It never makes a room accessible.
 * - Accessibility amenities (type mappings, plus room additions, minus room
 *   removals) describe the room. They never make a room accessible.
 *
 * These helpers only label, count and flag configuration for staff review.
 */

export const ACCESSIBLE_ROOM_LABEL = "Accessible room";
export const ACCESSIBLE_ROOM_HELP_TEXT = "Used when a stay requires an accessible room.";
export const ACCESSIBLE_ROOM_RULE_TEXT =
  "This setting determines whether the room can satisfy the Accessible room required assignment rule.";

export const ACCESSIBILITY_FEATURES_TITLE = "Accessibility features";
export const ACCESSIBILITY_FEATURES_HELP =
  "These features describe the room. The Accessible room setting controls hard assignment eligibility.";
export const ACCESSIBILITY_FEATURES_EMPTY = "No accessibility features recorded.";
export const ACCESSIBILITY_FEATURE_ADDED_TO_ROOM = "Added to this room";

export const ROOM_ACCESSIBLE_WITHOUT_FEATURES =
  "This room is marked accessible but has no accessibility features recorded.";
export const ROOM_FEATURES_WITHOUT_ACCESSIBLE =
  "Accessibility features are recorded, but this room is not marked as an accessible room.";

export const CONTAINS_ACCESSIBLE_ROOMS_LABEL = "Contains accessible rooms";
export const CONTAINS_ACCESSIBLE_ROOMS_HELP =
  "Use this as room-type guidance. Each physical room must still be marked Accessible room individually.";
export const TYPE_GUIDANCE_WITHOUT_ACCESSIBLE_ROOMS =
  "This room type is marked as containing accessible rooms, but no rooms are currently marked accessible.";
export const TYPE_ACCESSIBLE_ROOMS_WITHOUT_GUIDANCE =
  "Some rooms are marked accessible even though this room type is not marked as containing accessible rooms.";

export const SINGLE_CREATE_ACCESSIBLE_SUGGESTION =
  "This room type contains accessible rooms. Confirm whether this physical room is accessible.";
export const BULK_CREATE_ACCESSIBLE_WARNING =
  "This room type contains accessible rooms. Newly created rooms will not be marked accessible automatically.";

export const ACCESSIBILITY_RULE_WITHOUT_ACCESSIBLE_ROOMS =
  "Accessibility matching is enabled, but no rooms are marked accessible. Reservations requiring an accessible room cannot be assigned.";

export const ACCESSIBILITY_REVIEW_TITLE = "Accessibility configuration review";
export const ACCESSIBILITY_REVIEW_HELP =
  "Review only. Nothing here changes a room, a room type or the assignment rule.";

export type AccessibilityHint = { tone: "warning" | "info"; message: string };

const ACCESSIBILITY_CATEGORY = "accessibility";
const ACCESSIBILITY_CODE_PREFIX = "ACC_";

/** Catalogue items in the Accessibility category or with an ACC_ code. */
export function isAccessibilityAmenity(amenity: {
  code?: string | null;
  category?: string | null;
}): boolean {
  const code = (amenity.code ?? "").trim().toUpperCase();
  if (code.startsWith(ACCESSIBILITY_CODE_PREFIX)) return true;
  return (amenity.category ?? "").trim().toLowerCase() === ACCESSIBILITY_CATEGORY;
}

export type AccessibleRoomCount = { accessible: number; total: number };

/** Active rooms only: inactive rooms are not offered for assignment. */
export function accessibleRoomCount(
  rooms: ReadonlyArray<{ accessible: boolean; active: boolean }>,
): AccessibleRoomCount {
  const active = rooms.filter((room) => room.active);
  return { accessible: active.filter((room) => room.accessible).length, total: active.length };
}

export function accessibleRoomCountLabel(count: AccessibleRoomCount): string {
  return `Accessible rooms: ${count.accessible} of ${count.total}`;
}

export function roomAccessibilityHint(
  accessible: boolean,
  accessibilityFeatureCount: number,
): AccessibilityHint | null {
  if (accessible && accessibilityFeatureCount === 0) {
    return { tone: "warning", message: ROOM_ACCESSIBLE_WITHOUT_FEATURES };
  }
  if (!accessible && accessibilityFeatureCount > 0) {
    return { tone: "warning", message: ROOM_FEATURES_WITHOUT_ACCESSIBLE };
  }
  return null;
}

export function roomTypeAccessibilityHint(
  containsAccessibleRooms: boolean,
  accessibleRooms: number,
): AccessibilityHint | null {
  if (containsAccessibleRooms && accessibleRooms === 0) {
    return { tone: "warning", message: TYPE_GUIDANCE_WITHOUT_ACCESSIBLE_ROOMS };
  }
  if (!containsAccessibleRooms && accessibleRooms > 0) {
    return { tone: "info", message: TYPE_ACCESSIBLE_ROOMS_WITHOUT_GUIDANCE };
  }
  return null;
}

export function accessibilityReadinessWarning(
  accessibilityRuleOn: boolean,
  accessibleRooms: number,
): string | null {
  return accessibilityRuleOn && accessibleRooms === 0
    ? ACCESSIBILITY_RULE_WITHOUT_ACCESSIBLE_ROOMS
    : null;
}

export const ACCESSIBILITY_REVIEW_CATEGORIES = [
  {
    id: "accessible_room_type_not_marked",
    label: "Accessible rooms whose room type is not marked as containing accessible rooms",
  },
  {
    id: "type_marked_without_accessible_rooms",
    label: "Room types marked as containing accessible rooms, with no rooms marked accessible",
  },
  {
    id: "accessible_room_without_features",
    label: "Accessible rooms with no accessibility features recorded",
  },
  {
    id: "features_room_not_accessible",
    label: "Rooms with accessibility features that are not marked accessible",
  },
  {
    id: "rule_without_accessible_rooms",
    label: "Accessibility matching is enabled with no accessible rooms",
  },
] as const;

export type AccessibilityReviewCategory = (typeof ACCESSIBILITY_REVIEW_CATEGORIES)[number]["id"];

export type AccessibilityReviewInput = {
  accessibilityRuleOn: boolean;
  roomTypes: ReadonlyArray<{
    id: string;
    name: string;
    containsAccessibleRooms: boolean;
    active: boolean;
  }>;
  rooms: ReadonlyArray<{
    roomNumber: string;
    roomTypeId: string | null;
    accessible: boolean;
    active: boolean;
    accessibilityFeatureCount: number;
  }>;
};

export type AccessibilityReviewGroup = {
  category: AccessibilityReviewCategory;
  label: string;
  items: string[];
};

export type AccessibilityReview = {
  accessibilityRuleOn: boolean;
  counts: {
    accessibleRooms: number;
    typesContainingAccessibleRooms: number;
    typesMarkedWithoutAccessibleRooms: number;
    accessibleRoomsWithoutFeatures: number;
    roomsWithFeaturesNotAccessible: number;
  };
  readinessWarning: string | null;
  groups: AccessibilityReviewGroup[];
};

function byRoomNumber(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function buildAccessibilityReview(input: AccessibilityReviewInput): AccessibilityReview {
  const typeName = new Map(input.roomTypes.map((type) => [type.id, type.name.trim() || "Room type"]));
  const typeMarked = new Map(input.roomTypes.map((type) => [type.id, type.containsAccessibleRooms]));
  const rooms = input.rooms.filter((room) => room.active);
  const roomLabel = (room: (typeof rooms)[number]) => {
    const type = room.roomTypeId ? typeName.get(room.roomTypeId) : undefined;
    return type ? `Room ${room.roomNumber} · ${type}` : `Room ${room.roomNumber}`;
  };
  const sortedRooms = [...rooms].sort((a, b) => byRoomNumber(a.roomNumber, b.roomNumber));

  const accessibleRooms = rooms.filter((room) => room.accessible);
  const accessibleByType = new Map<string, number>();
  for (const room of accessibleRooms) {
    if (room.roomTypeId) {
      accessibleByType.set(room.roomTypeId, (accessibleByType.get(room.roomTypeId) ?? 0) + 1);
    }
  }
  const markedTypes = input.roomTypes.filter((type) => type.active && type.containsAccessibleRooms);

  const items: Record<AccessibilityReviewCategory, string[]> = {
    accessible_room_type_not_marked: sortedRooms
      .filter((room) => room.accessible && !(room.roomTypeId && typeMarked.get(room.roomTypeId)))
      .map(roomLabel),
    type_marked_without_accessible_rooms: markedTypes
      .filter((type) => !accessibleByType.get(type.id))
      .map((type) => typeName.get(type.id)!)
      .sort(byRoomNumber),
    accessible_room_without_features: sortedRooms
      .filter((room) => room.accessible && room.accessibilityFeatureCount === 0)
      .map(roomLabel),
    features_room_not_accessible: sortedRooms
      .filter((room) => !room.accessible && room.accessibilityFeatureCount > 0)
      .map(roomLabel),
    rule_without_accessible_rooms: [],
  };

  const readinessWarning = accessibilityReadinessWarning(
    input.accessibilityRuleOn,
    accessibleRooms.length,
  );
  if (readinessWarning) items.rule_without_accessible_rooms.push(readinessWarning);

  return {
    accessibilityRuleOn: input.accessibilityRuleOn,
    counts: {
      accessibleRooms: accessibleRooms.length,
      typesContainingAccessibleRooms: markedTypes.length,
      typesMarkedWithoutAccessibleRooms: items.type_marked_without_accessible_rooms.length,
      accessibleRoomsWithoutFeatures: items.accessible_room_without_features.length,
      roomsWithFeaturesNotAccessible: items.features_room_not_accessible.length,
    },
    readinessWarning,
    groups: ACCESSIBILITY_REVIEW_CATEGORIES.map((category) => ({
      category: category.id,
      label: category.label,
      items: items[category.id],
    })).filter((group) => group.items.length > 0),
  };
}

export function accessibilityReviewCountRows(
  review: AccessibilityReview,
): Array<[label: string, value: number]> {
  return [
    ["Accessible rooms", review.counts.accessibleRooms],
    ["Room types marked as containing accessible rooms", review.counts.typesContainingAccessibleRooms],
    ["Types marked accessible with no accessible rooms", review.counts.typesMarkedWithoutAccessibleRooms],
    ["Accessible rooms with no recorded accessibility features", review.counts.accessibleRoomsWithoutFeatures],
    ["Rooms with accessibility features but not marked accessible", review.counts.roomsWithFeaturesNotAccessible],
  ];
}

/** Non-blocking System Validation messages. Never critical. */
export function accessibilityValidationWarnings(review: AccessibilityReview): string[] {
  const warnings: string[] = [];
  if (review.readinessWarning) warnings.push(review.readinessWarning);
  const toReview = review.groups
    .filter((group) => group.category !== "rule_without_accessible_rooms")
    .reduce((sum, group) => sum + group.items.length, 0);
  if (toReview > 0) {
    warnings.push(
      `Accessibility configuration has ${toReview} item${toReview === 1 ? "" : "s"} to review in Inventory Rules.`,
    );
  }
  return warnings;
}
