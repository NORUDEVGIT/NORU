import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { requirePmsActor } from "./pms-permissions.server";
import {
  addRoomConnectionWith,
  buildConnectingReview,
  connectionCandidates,
  isRoomConnectionKind,
  linkPartnerId,
  removeRoomConnectionWith,
  sameBuilding,
  ROOM_LINK_KIND_VALUES,
  type ConnectingReview,
  type ConnectionRoom,
  type RoomConnectionKind,
  type RoomConnectionWriteResult,
  type RoomLinkStore,
  type StoredRoomLink,
} from "./room-connections";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = { from: (table: string) => any };

const ROOM_COLUMNS =
  "id, room_number, room_type_id, active, building_id, building, floor_id, floor, room_types(name, display_name)";

type RoomRow = {
  id: string;
  room_number: string;
  room_type_id: string | null;
  active: boolean | null;
  building_id: string | null;
  building: string | null;
  floor_id: string | null;
  floor: string | null;
  room_types: { name: string | null; display_name: string | null } | null;
};

type LinkRow = { id: string; room_id: string; other_room_id: string; kind: string };

function toConnectionRoom(row: RoomRow): ConnectionRoom {
  return {
    id: row.id,
    roomNumber: row.room_number,
    roomTypeId: row.room_type_id,
    roomTypeName:
      (row.room_types?.display_name ?? "").trim() || (row.room_types?.name ?? "").trim(),
    active: row.active !== false,
    buildingId: row.building_id,
    building: row.building,
    floorId: row.floor_id,
    floor: row.floor,
  };
}

function toStoredLinks(rows: LinkRow[] | null | undefined): StoredRoomLink[] {
  return (rows ?? [])
    .filter((row) => isRoomConnectionKind(row.kind))
    .map((row) => ({
      id: row.id,
      roomId: row.room_id,
      otherRoomId: row.other_room_id,
      kind: row.kind as RoomConnectionKind,
    }));
}

/** Every query is scoped to the property. */
export function supabaseRoomLinkStore(db: DbClient, restaurantId: string): RoomLinkStore {
  return {
    async loadRooms(ids) {
      const { data, error } = await db
        .from("hotel_rooms")
        .select(ROOM_COLUMNS)
        .eq("restaurant_id", restaurantId)
        .in("id", ids);
      if (error) throw new Error("Could not load rooms.");
      return ((data ?? []) as RoomRow[]).map(toConnectionRoom);
    },
    async loadLinksTouching(roomIds) {
      const list = roomIds.join(",");
      const { data, error } = await db
        .from("hotel_room_links")
        .select("id, room_id, other_room_id, kind")
        .eq("restaurant_id", restaurantId)
        .or(`room_id.in.(${list}),other_room_id.in.(${list})`);
      if (error) throw new Error("Could not load room connections.");
      return toStoredLinks(data as LinkRow[]);
    },
    async insertLink(row) {
      const { data, error } = await db
        .from("hotel_room_links")
        .insert({
          restaurant_id: restaurantId,
          room_id: row.roomId,
          other_room_id: row.otherRoomId,
          kind: row.kind,
        })
        .select("id")
        .maybeSingle();
      if (error || !data) return { ok: false, duplicate: error?.code === "23505" };
      return { ok: true, id: (data as { id: string }).id };
    },
    async loadLink(linkId) {
      const { data, error } = await db
        .from("hotel_room_links")
        .select("id, room_id, other_room_id, kind")
        .eq("restaurant_id", restaurantId)
        .eq("id", linkId)
        .maybeSingle();
      if (error) throw new Error("Could not load the connection.");
      return data ? (toStoredLinks([data as LinkRow])[0] ?? null) : null;
    },
    async deleteLink(linkId) {
      const { data, error } = await db
        .from("hotel_room_links")
        .delete()
        .eq("restaurant_id", restaurantId)
        .eq("id", linkId)
        .select("id");
      // The database refuses to drop a connection an active paired stay stands on.
      if (error && /ROOM_LINK_USED_BY_ACTIVE_PAIR/.test(error.message ?? "")) return "in_use";
      return !error && Array.isArray(data) && data.length === 1;
    },
  };
}

export type RoomConnectionView = {
  id: string;
  kind: RoomConnectionKind;
  partner: ConnectionRoom;
  crossBuilding: boolean;
};

export type RoomConnectionsResult =
  | {
      ok: true;
      room: ConnectionRoom;
      connections: RoomConnectionView[];
      candidates: ConnectionRoom[];
    }
  | { ok: false; message: string };

async function loadPropertyRoomsAndLinks(db: DbClient, restaurantId: string) {
  const [{ data: rooms, error: roomsError }, { data: links, error: linksError }] =
    await Promise.all([
      db.from("hotel_rooms").select(ROOM_COLUMNS).eq("restaurant_id", restaurantId),
      db
        .from("hotel_room_links")
        .select("id, room_id, other_room_id, kind")
        .eq("restaurant_id", restaurantId),
    ]);
  if (roomsError || linksError) return null;
  return {
    rooms: ((rooms ?? []) as RoomRow[]).map(toConnectionRoom),
    links: toStoredLinks(links as LinkRow[]),
  };
}

const idSchema = z.string().uuid();

export const listRoomConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomConnectionsResult> => {
    await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.CONFIG_ROOMS_OPS_VIEW,
    );
    const loaded = await loadPropertyRoomsAndLinks(
      context.supabase as unknown as DbClient,
      data.restaurantId,
    );
    if (!loaded) return { ok: false, message: "Room connections could not be loaded." };
    const room = loaded.rooms.find((row) => row.id === data.roomId);
    if (!room) return { ok: false, message: "Room not found." };
    const roomsById = new Map(loaded.rooms.map((row) => [row.id, row]));
    const connections = loaded.links
      .map((link) => {
        const partner = roomsById.get(linkPartnerId(link, room.id) ?? "");
        return partner
          ? {
              id: link.id,
              kind: link.kind,
              partner,
              crossBuilding: sameBuilding(room, partner) === false,
            }
          : null;
      })
      .filter((row): row is RoomConnectionView => row !== null)
      .sort((a, b) =>
        a.partner.roomNumber.localeCompare(b.partner.roomNumber, undefined, { numeric: true }),
      );
    return {
      ok: true,
      room,
      connections,
      candidates: connectionCandidates(room, loaded.rooms, loaded.links),
    };
  });

export const addRoomConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomId: idSchema,
        otherRoomId: idSchema,
        kind: z.enum(ROOM_LINK_KIND_VALUES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomConnectionWriteResult> => {
    await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.CONFIG_ROOMS_OPS_CONFIGURE,
    );
    return addRoomConnectionWith(
      supabaseRoomLinkStore(context.supabase as unknown as DbClient, data.restaurantId),
      {
        roomId: data.roomId,
        otherRoomId: data.otherRoomId,
        kind: data.kind,
      },
    );
  });

export const removeRoomConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomId: idSchema, linkId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomConnectionWriteResult> => {
    await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.CONFIG_ROOMS_OPS_CONFIGURE,
    );
    return removeRoomConnectionWith(
      supabaseRoomLinkStore(context.supabase as unknown as DbClient, data.restaurantId),
      {
        roomId: data.roomId,
        linkId: data.linkId,
      },
    );
  });

/** Read-only. Loads configuration for staff review; never writes. */
export async function loadConnectingReview(
  db: DbClient,
  restaurantId: string,
): Promise<ConnectingReview> {
  const [loaded, { data: roomTypes }, { data: rules }] = await Promise.all([
    loadPropertyRoomsAndLinks(db, restaurantId),
    db
      .from("room_types")
      .select("id, name, display_name, connecting_eligible, active")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_inventory_rules")
      .select("require_connecting_room_match")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);
  if (!loaded) throw new Error("Connecting room configuration could not be loaded.");
  return buildConnectingReview({
    connectingRuleOn: Boolean(
      (rules as { require_connecting_room_match?: boolean } | null)?.require_connecting_room_match,
    ),
    roomTypes: (
      (roomTypes ?? []) as Array<{
        id: string;
        name: string | null;
        display_name: string | null;
        connecting_eligible: boolean | null;
        active: boolean | null;
      }>
    ).map((type) => ({
      id: type.id,
      name: (type.display_name ?? "").trim() || (type.name ?? ""),
      containsConnectingRooms: type.connecting_eligible === true,
      active: type.active !== false,
    })),
    rooms: loaded.rooms,
    links: loaded.links,
  });
}

export const getConnectingReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.CONFIG_ROOMS_OPS_VIEW,
    );
    return loadConnectingReview(context.supabase as unknown as DbClient, data.restaurantId);
  });
