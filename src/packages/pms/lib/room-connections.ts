/**
 * Physical room connections (hotel_room_links).
 *
 * Every stored row is one undirected relationship: a row A→B means A and B are
 * connected (or adjacent) to each other. Reads always look in both directions
 * and a pair is stored once, with one kind. A connecting pair is also adjacent,
 * so it is never stored as adjacent as well.
 *
 * Room type "Contains connecting rooms" (room_types.connecting_eligible) is
 * guidance only. Nothing in this module feeds assignment.
 */
import { ROOM_LINK_IN_USE_REJECTION } from "./room-requirement-rejection";

export const ROOM_LINK_KIND_VALUES = ["connecting", "adjacent"] as const;
export type RoomConnectionKind = (typeof ROOM_LINK_KIND_VALUES)[number];

export const ROOM_LINK_KIND_LABELS: Record<RoomConnectionKind, string> = {
  connecting: "Connecting",
  adjacent: "Adjacent",
};

export const MAX_ROOM_CONNECTIONS = 4;

export const ROOM_CONNECTIONS_TITLE = "Room connections";
export const ROOM_CONNECTIONS_HELP =
  "Physical connecting doors and adjacent rooms. Changes save immediately and apply to both rooms.";
export const ROOM_CONNECTIONS_EMPTY = "No connections recorded for this room.";

export const ROOM_LINK_SELF = "A room cannot connect to itself.";
export const ROOM_LINK_OTHER_PROPERTY = "Linked rooms must belong to this property.";
export const ROOM_LINK_INACTIVE = "Only active rooms can be connected.";
export const ROOM_LINK_DIFFERENT_BUILDINGS =
  "Connecting or adjacent rooms must be in the same building.";
export const ROOM_LINK_DUPLICATE = "These rooms already have a connection.";
export const ROOM_LINK_REMOVED_ALREADY = "This connection no longer exists. Refresh and try again.";
export const ROOM_LINK_NOT_ON_ROOM = "This connection does not belong to this room.";
export const CROSS_BUILDING_LINK_WARNING =
  "This connection links rooms in different buildings and should be reviewed.";

export const CONTAINS_CONNECTING_ROOMS_LABEL = "Contains connecting rooms";
export const CONTAINS_CONNECTING_ROOMS_HELP =
  "Use this as room-type guidance. Physical room connections must still be configured on the individual rooms.";
export const TYPE_GUIDANCE_WITHOUT_CONNECTING_ROOMS =
  "This room type is marked as containing connecting rooms, but no physical room connections are configured.";
export const TYPE_CONNECTING_ROOMS_WITHOUT_GUIDANCE =
  "Some rooms of this type have connecting links even though this room type is not marked as containing connecting rooms.";

export const CONNECTING_RULE_WITHOUT_PAIRS =
  "Connecting room matching is enabled, but no connecting room pairs are configured. Reservations requiring connecting rooms cannot be assigned.";

export const CONNECTING_REVIEW_TITLE = "Connecting room configuration review";
export const CONNECTING_REVIEW_HELP =
  "Review only. Nothing here changes a room, a room type, a connection or the assignment rule.";

export type ConnectionHint = { tone: "warning" | "info"; message: string };

export type ConnectionRoom = {
  id: string;
  roomNumber: string;
  roomTypeId: string | null;
  roomTypeName: string;
  active: boolean;
  buildingId: string | null;
  building: string | null;
  floorId: string | null;
  floor: string | null;
};

export type StoredRoomLink = {
  id: string;
  roomId: string;
  otherRoomId: string;
  kind: RoomConnectionKind;
};

export function isRoomConnectionKind(value: unknown): value is RoomConnectionKind {
  return (ROOM_LINK_KIND_VALUES as readonly unknown[]).includes(value);
}

/** The other room of a link, seen from `roomId`; null when the room is not on the link. */
export function linkPartnerId(
  link: Pick<StoredRoomLink, "roomId" | "otherRoomId">,
  roomId: string,
): string | null {
  if (link.roomId === roomId) return link.otherRoomId;
  if (link.otherRoomId === roomId) return link.roomId;
  return null;
}

export function linksTouchingRoom<T extends Pick<StoredRoomLink, "roomId" | "otherRoomId">>(
  links: readonly T[],
  roomId: string,
): T[] {
  return links.filter((link) => linkPartnerId(link, roomId) !== null);
}

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

type Located = Pick<ConnectionRoom, "buildingId" | "building" | "floorId" | "floor">;

/** true / false when both rooms record a building; null when either is unknown. */
export function sameBuilding(a: Located, b: Located): boolean | null {
  if (a.buildingId && b.buildingId) return a.buildingId === b.buildingId;
  const left = text(a.building).toLowerCase();
  const right = text(b.building).toLowerCase();
  if (!left || !right) return null;
  return left === right;
}

export function sameFloor(a: Located, b: Located): boolean | null {
  if (a.floorId && b.floorId) return a.floorId === b.floorId;
  const left = text(a.floor).toLowerCase();
  const right = text(b.floor).toLowerCase();
  if (!left || !right) return null;
  return left === right;
}

export function buildingLabel(room: Located): string {
  return text(room.building) || "Building not recorded";
}

export function floorLabel(room: Located): string {
  return text(room.floor) || "Floor not recorded";
}

function buildingUnknown(room: Located): boolean {
  return !room.buildingId && !text(room.building);
}

function floorUnknown(room: Located): boolean {
  return !room.floorId && !text(room.floor);
}

export function hasUnknownLocation(room: Located): boolean {
  return buildingUnknown(room) || floorUnknown(room);
}

/** "Room 302 · Deluxe Twin · Building 2 · Floor 3" */
export function connectionRoomLabel(room: ConnectionRoom): string {
  return [
    `Room ${room.roomNumber}`,
    text(room.roomTypeName) || "Room type not recorded",
    buildingLabel(room),
    floorLabel(room),
  ].join(" · ");
}

export function differentFloorWarning(kind: RoomConnectionKind): string {
  return kind === "connecting"
    ? "Connecting rooms are normally on the same floor."
    : "Adjacent rooms are normally on the same floor.";
}

/** Non-blocking notes for a pair that passes validation. */
export function roomConnectionWarnings(
  source: ConnectionRoom,
  target: ConnectionRoom,
  kind: RoomConnectionKind,
): string[] {
  const warnings: string[] = [];
  const building = sameBuilding(source, target);
  for (const room of [source, target]) {
    if (buildingUnknown(room)) {
      warnings.push(
        `Building is not recorded for Room ${room.roomNumber}. Confirm both rooms are in the same building.`,
      );
    }
  }
  if (building === false) return warnings;
  const floor = sameFloor(source, target);
  if (floor === false) warnings.push(differentFloorWarning(kind));
  for (const room of [source, target]) {
    if (floorUnknown(room)) warnings.push(`Floor is not recorded for Room ${room.roomNumber}.`);
  }
  return warnings;
}

function byRoomNumber(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Active rooms other than `source` and its current partners; same floor first. */
export function connectionCandidates(
  source: ConnectionRoom,
  rooms: readonly ConnectionRoom[],
  links: readonly StoredRoomLink[],
): ConnectionRoom[] {
  const partners = new Set(
    links.map((link) => linkPartnerId(link, source.id)).filter((id): id is string => id !== null),
  );
  const rank = (room: ConnectionRoom) => {
    if (sameBuilding(source, room) === false) return 3;
    const floor = sameFloor(source, room);
    if (floor === true) return 0;
    return floor === null ? 2 : 1;
  };
  return rooms
    .filter((room) => room.active && room.id !== source.id && !partners.has(room.id))
    .sort((a, b) => rank(a) - rank(b) || byRoomNumber(a.roomNumber, b.roomNumber));
}

export type RoomConnectionPlan = { ok: true; warnings: string[] } | { ok: false; message: string };

function kindPhrase(kind: RoomConnectionKind): string {
  return `${kind === "adjacent" ? "an" : "a"} ${ROOM_LINK_KIND_LABELS[kind]} connection`;
}

function connectionCount(links: readonly StoredRoomLink[], roomId: string): number {
  return linksTouchingRoom(links, roomId).length;
}

/**
 * Server-authoritative validation for adding a connection. `target` is null
 * when the room is not found in this property. `links` must hold every stored
 * link touching either room.
 */
export function planRoomConnection(input: {
  source: ConnectionRoom | null;
  target: ConnectionRoom | null;
  targetId: string;
  kind: RoomConnectionKind;
  links: readonly StoredRoomLink[];
}): RoomConnectionPlan {
  const { source, target, kind, links } = input;
  if (!source) return { ok: false, message: ROOM_LINK_OTHER_PROPERTY };
  if (input.targetId === source.id) return { ok: false, message: ROOM_LINK_SELF };
  if (!target) return { ok: false, message: ROOM_LINK_OTHER_PROPERTY };
  if (!source.active || !target.active) return { ok: false, message: ROOM_LINK_INACTIVE };

  const existing = links.find((link) => linkPartnerId(link, source.id) === target.id);
  if (existing) {
    const pair = `Room ${source.roomNumber} and Room ${target.roomNumber}`;
    const already = `${pair} already have ${kindPhrase(existing.kind)}.`;
    if (existing.kind === kind) return { ok: false, message: already };
    return { ok: false, message: `${already} Remove it before adding ${kindPhrase(kind)}.` };
  }

  if (sameBuilding(source, target) === false)
    return { ok: false, message: ROOM_LINK_DIFFERENT_BUILDINGS };

  for (const room of [source, target]) {
    if (connectionCount(links, room.id) >= MAX_ROOM_CONNECTIONS) {
      return {
        ok: false,
        message: `Room ${room.roomNumber} already has ${MAX_ROOM_CONNECTIONS} connections. Remove one before adding another.`,
      };
    }
  }

  return { ok: true, warnings: roomConnectionWarnings(source, target, kind) };
}

export function removeConnectionConfirmText(
  kind: RoomConnectionKind,
  roomNumber: string,
  partnerRoomNumber: string,
): string {
  return `Remove the ${ROOM_LINK_KIND_LABELS[kind]} connection between Room ${roomNumber} and Room ${partnerRoomNumber}?`;
}

/* -------------------------------------------------------------- write flow */

/** Property-scoped persistence used by the add / remove actions. */
export type RoomLinkStore = {
  loadRooms(ids: string[]): Promise<ConnectionRoom[]>;
  loadLinksTouching(roomIds: string[]): Promise<StoredRoomLink[]>;
  insertLink(row: {
    roomId: string;
    otherRoomId: string;
    kind: RoomConnectionKind;
  }): Promise<{ ok: true; id: string } | { ok: false; duplicate: boolean }>;
  loadLink(linkId: string): Promise<StoredRoomLink | null>;
  /** True when the row was removed, "in_use" when an active paired stay still needs this connection. */
  deleteLink(linkId: string): Promise<boolean | "in_use">;
};

export type RoomConnectionWriteResult =
  { ok: true; warnings: string[] } | { ok: false; message: string };

export async function addRoomConnectionWith(
  store: RoomLinkStore,
  input: { roomId: string; otherRoomId: string; kind: RoomConnectionKind },
): Promise<RoomConnectionWriteResult> {
  if (input.roomId === input.otherRoomId) return { ok: false, message: ROOM_LINK_SELF };
  const [rooms, links] = await Promise.all([
    store.loadRooms([input.roomId, input.otherRoomId]),
    store.loadLinksTouching([input.roomId, input.otherRoomId]),
  ]);
  const plan = planRoomConnection({
    source: rooms.find((room) => room.id === input.roomId) ?? null,
    target: rooms.find((room) => room.id === input.otherRoomId) ?? null,
    targetId: input.otherRoomId,
    kind: input.kind,
    links,
  });
  if (!plan.ok) return plan;
  const inserted = await store.insertLink(input);
  if (!inserted.ok) {
    return {
      ok: false,
      message: inserted.duplicate ? ROOM_LINK_DUPLICATE : "Could not save the connection.",
    };
  }
  return { ok: true, warnings: plan.warnings };
}

/** Deletes the one stored row, whichever room it was opened from. */
export async function removeRoomConnectionWith(
  store: RoomLinkStore,
  input: { roomId: string; linkId: string },
): Promise<RoomConnectionWriteResult> {
  const link = await store.loadLink(input.linkId);
  if (!link) return { ok: false, message: ROOM_LINK_REMOVED_ALREADY };
  if (linkPartnerId(link, input.roomId) === null)
    return { ok: false, message: ROOM_LINK_NOT_ON_ROOM };
  const deleted = await store.deleteLink(link.id);
  if (deleted === "in_use") return { ok: false, message: ROOM_LINK_IN_USE_REJECTION };
  if (!deleted) return { ok: false, message: "Could not remove the connection." };
  return { ok: true, warnings: [] };
}

/* ------------------------------------------------------------ room types */

export type ConnectingRoomCount = { connected: number; total: number };

export function connectingRoomCount(
  rooms: ReadonlyArray<{ active: boolean; hasConnectingLink?: boolean }>,
): ConnectingRoomCount {
  const active = rooms.filter((room) => room.active);
  return {
    connected: active.filter((room) => room.hasConnectingLink === true).length,
    total: active.length,
  };
}

export function connectingRoomCountLabel(count: ConnectingRoomCount): string {
  return `Rooms with connecting links: ${count.connected} of ${count.total}`;
}

export function roomTypeConnectingHint(
  containsConnectingRooms: boolean,
  connectedRooms: number,
): ConnectionHint | null {
  if (containsConnectingRooms && connectedRooms === 0) {
    return { tone: "warning", message: TYPE_GUIDANCE_WITHOUT_CONNECTING_ROOMS };
  }
  if (!containsConnectingRooms && connectedRooms > 0) {
    return { tone: "info", message: TYPE_CONNECTING_ROOMS_WITHOUT_GUIDANCE };
  }
  return null;
}

/* --------------------------------------------------------------- review */

export function connectingReadinessWarning(
  connectingRuleOn: boolean,
  connectingPairs: number,
): string | null {
  return connectingRuleOn && connectingPairs === 0 ? CONNECTING_RULE_WITHOUT_PAIRS : null;
}

export const CONNECTING_REVIEW_CATEGORIES = [
  {
    id: "cross_building_links",
    label: "Connections between rooms in different buildings",
  },
  {
    id: "type_marked_without_pairs",
    label: "Room types marked as containing connecting rooms, with no physical connections",
  },
  {
    id: "type_pairs_not_marked",
    label: "Room types with connecting rooms that are not marked as containing connecting rooms",
  },
] as const;

export type ConnectingReviewCategory = (typeof CONNECTING_REVIEW_CATEGORIES)[number]["id"];

export type ConnectingReviewInput = {
  connectingRuleOn: boolean;
  roomTypes: ReadonlyArray<{
    id: string;
    name: string;
    containsConnectingRooms: boolean;
    active: boolean;
  }>;
  rooms: readonly ConnectionRoom[];
  links: readonly StoredRoomLink[];
};

export type ConnectingReview = {
  connectingRuleOn: boolean;
  counts: {
    roomsWithConnectingLinks: number;
    connectingPairs: number;
    typesContainingConnectingRooms: number;
    typesMarkedWithoutPairs: number;
    crossBuildingLinks: number;
  };
  readinessWarning: string | null;
  groups: Array<{ category: ConnectingReviewCategory; label: string; items: string[] }>;
};

export function buildConnectingReview(input: ConnectingReviewInput): ConnectingReview {
  const roomsById = new Map(input.rooms.map((room) => [room.id, room]));
  const typeName = new Map(
    input.roomTypes.map((type) => [type.id, type.name.trim() || "Room type"]),
  );
  const shortLabel = (room: ConnectionRoom) => {
    const type = room.roomTypeId ? typeName.get(room.roomTypeId) : undefined;
    return type ? `Room ${room.roomNumber} · ${type}` : `Room ${room.roomNumber}`;
  };

  const resolved = input.links
    .map((link) => ({ link, a: roomsById.get(link.roomId), b: roomsById.get(link.otherRoomId) }))
    .filter((row): row is { link: StoredRoomLink; a: ConnectionRoom; b: ConnectionRoom } =>
      Boolean(row.a && row.b),
    );

  const activeConnecting = resolved.filter(
    (row) => row.link.kind === "connecting" && row.a.active && row.b.active,
  );
  const connectedRooms = new Set(activeConnecting.flatMap((row) => [row.a.id, row.b.id]));
  const connectedByType = new Map<string, number>();
  for (const id of connectedRooms) {
    const typeId = roomsById.get(id)?.roomTypeId;
    if (typeId) connectedByType.set(typeId, (connectedByType.get(typeId) ?? 0) + 1);
  }
  const activeTypes = input.roomTypes.filter((type) => type.active);
  const markedTypes = activeTypes.filter((type) => type.containsConnectingRooms);

  const items: Record<ConnectingReviewCategory, string[]> = {
    cross_building_links: resolved
      .filter((row) => sameBuilding(row.a, row.b) === false)
      .map((row) => {
        const [first, second] = [row.a, row.b].sort((x, y) =>
          byRoomNumber(x.roomNumber, y.roomNumber),
        );
        return `${shortLabel(first!)} ↔ ${shortLabel(second!)} · ${ROOM_LINK_KIND_LABELS[row.link.kind]}`;
      })
      .sort(byRoomNumber),
    type_marked_without_pairs: markedTypes
      .filter((type) => !connectedByType.get(type.id))
      .map((type) => typeName.get(type.id)!)
      .sort(byRoomNumber),
    type_pairs_not_marked: activeTypes
      .filter((type) => !type.containsConnectingRooms && (connectedByType.get(type.id) ?? 0) > 0)
      .map((type) => typeName.get(type.id)!)
      .sort(byRoomNumber),
  };

  return {
    connectingRuleOn: input.connectingRuleOn,
    counts: {
      roomsWithConnectingLinks: connectedRooms.size,
      connectingPairs: activeConnecting.length,
      typesContainingConnectingRooms: markedTypes.length,
      typesMarkedWithoutPairs: items.type_marked_without_pairs.length,
      crossBuildingLinks: items.cross_building_links.length,
    },
    readinessWarning: connectingReadinessWarning(input.connectingRuleOn, activeConnecting.length),
    groups: CONNECTING_REVIEW_CATEGORIES.map((category) => ({
      category: category.id,
      label: category.label,
      items: items[category.id],
    })).filter((group) => group.items.length > 0),
  };
}

export function connectingReviewCountRows(
  review: ConnectingReview,
): Array<[label: string, value: number]> {
  return [
    ["Rooms with connecting links", review.counts.roomsWithConnectingLinks],
    ["Connecting pairs", review.counts.connectingPairs],
    [
      "Room types marked as containing connecting rooms",
      review.counts.typesContainingConnectingRooms,
    ],
    ["Marked room types with no physical pairs", review.counts.typesMarkedWithoutPairs],
    ["Cross-building connections to review", review.counts.crossBuildingLinks],
  ];
}

/** Non-blocking System Validation messages. Never critical. */
export function connectingValidationWarnings(review: ConnectingReview): string[] {
  const warnings: string[] = [];
  if (review.readinessWarning) warnings.push(review.readinessWarning);
  const toReview = review.groups.reduce((sum, group) => sum + group.items.length, 0);
  if (toReview > 0) {
    warnings.push(
      `Connecting room configuration has ${toReview} item${toReview === 1 ? "" : "s"} to review in Inventory Rules.`,
    );
  }
  return warnings;
}
