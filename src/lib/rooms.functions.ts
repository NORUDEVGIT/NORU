import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_AMENITIES,
  IMAGE_EXT_BY_TYPE,
  ROOM_BUCKET,
  ROOM_STATUSES,
  blankToNull,
  canManageRooms,
  canAccessFrontOffice,
  requireFrontOfficeAccess,
  requireRoomManager,
  roomTypeImagePath,
  signRoomImages,
  type RoomStatus,
} from "./rooms.server";
import { callerMembership } from "./workforce.server";

const idSchema = z.string().uuid();

export interface RoomAmenity {
  id: string;
  name: string;
  active: boolean;
}

export interface RoomTypeImage {
  id: string;
  storagePath: string;
  url: string | null;
  displayOrder: number;
  isCover: boolean;
  altText: string | null;
}

export interface RoomType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxOccupancy: number;
  adultCapacity: number;
  childCapacity: number;
  bedType: string | null;
  bedCount: number | null;
  roomSize: string | null;
  roomView: string | null;
  sellable: boolean;
  active: boolean;
  amenityIds: string[];
  roomCount: number;
  coverUrl: string | null;
}

export interface HotelRoom {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string;
  floor: string | null;
  building: string | null;
  wing: string | null;
  smoking: boolean;
  accessible: boolean;
  status: RoomStatus;
  active: boolean;
  notes: string | null;
}

/** Rooms access is owner/manager only; the flag drives nav + UI affordances. */
export const getRoomsAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireFrontOfficeAccess(context as never, data.restaurantId);
    return { role: me.role, canManage: canAccessFrontOffice(me.role), canConfigure: canManageRooms(me.role) };
  });

/* ------------------------------------------------------------------ amenities */

export const listRoomAmenities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<RoomAmenity[]> => {
    await requireRoomManager(context as never, data.restaurantId);

    const { data: existing } = await context.supabase
      .from("room_amenities")
      .select("id, name, active")
      .eq("restaurant_id", data.restaurantId)
      .order("name");

    if (!existing || existing.length === 0) {
      await context.supabase.from("room_amenities").insert(
        DEFAULT_AMENITIES.map((name) => ({ restaurant_id: data.restaurantId, name })),
      );
      const { data: seeded } = await context.supabase
        .from("room_amenities")
        .select("id, name, active")
        .eq("restaurant_id", data.restaurantId)
        .order("name");
      return (seeded ?? []).map((a) => ({ id: a.id, name: a.name, active: a.active }));
    }

    return existing.map((a) => ({ id: a.id, name: a.name, active: a.active }));
  });

/* ----------------------------------------------------------------- room types */

export const listRoomTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, includeInactive: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomType[]> => {
    await requireRoomManager(context as never, data.restaurantId);

    let query = context.supabase
      .from("room_types")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .order("code");
    if (!data.includeInactive) query = query.eq("active", true);

    const [{ data: types }, { data: rooms }, { data: links }, { data: images }] = await Promise.all([
      query,
      context.supabase.from("hotel_rooms").select("id, room_type_id").eq("restaurant_id", data.restaurantId),
      context.supabase
        .from("room_type_amenities")
        .select("room_type_id, amenity_id")
        .eq("restaurant_id", data.restaurantId),
      context.supabase
        .from("room_type_images")
        .select("room_type_id, storage_path, is_cover, display_order")
        .eq("restaurant_id", data.restaurantId)
        .order("display_order"),
    ]);

    const counts = new Map<string, number>();
    for (const r of rooms ?? []) counts.set(r.room_type_id, (counts.get(r.room_type_id) ?? 0) + 1);

    const amenityMap = new Map<string, string[]>();
    for (const l of links ?? []) {
      amenityMap.set(l.room_type_id, [...(amenityMap.get(l.room_type_id) ?? []), l.amenity_id]);
    }

    const coverPath = new Map<string, string>();
    for (const img of images ?? []) {
      if (!coverPath.has(img.room_type_id) || img.is_cover) {
        if (img.is_cover || !coverPath.has(img.room_type_id)) coverPath.set(img.room_type_id, img.storage_path);
      }
    }
    const signed = await signRoomImages([...coverPath.values()]);

    return (types ?? []).map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      maxOccupancy: t.max_occupancy,
      adultCapacity: t.adult_capacity,
      childCapacity: t.child_capacity,
      bedType: t.bed_type,
      bedCount: t.bed_count,
      roomSize: t.room_size,
      roomView: t.room_view,
      sellable: t.sellable,
      active: t.active,
      amenityIds: amenityMap.get(t.id) ?? [],
      roomCount: counts.get(t.id) ?? 0,
      coverUrl: signed.get(coverPath.get(t.id) ?? "") ?? null,
    }));
  });

const roomTypeInput = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z.string().trim().min(2, "Enter a code.").max(20),
  name: z.string().trim().min(2, "Enter a name.").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  maxOccupancy: z.number().int().min(1).max(20),
  adultCapacity: z.number().int().min(0).max(20),
  childCapacity: z.number().int().min(0).max(20),
  bedType: z.string().trim().max(80).nullable().optional(),
  bedCount: z.number().int().min(0).max(20).nullable().optional(),
  roomSize: z.string().trim().max(40).nullable().optional(),
  roomView: z.string().trim().max(80).nullable().optional(),
  sellable: z.boolean(),
  active: z.boolean(),
  amenityIds: z.array(idSchema).max(50).optional(),
});

export const saveRoomType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roomTypeInput.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireRoomManager(context as never, data.restaurantId);

    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      description: blankToNull(data.description),
      max_occupancy: data.maxOccupancy,
      adult_capacity: data.adultCapacity,
      child_capacity: data.childCapacity,
      bed_type: blankToNull(data.bedType),
      bed_count: data.bedCount ?? null,
      room_size: blankToNull(data.roomSize),
      room_view: blankToNull(data.roomView),
      sellable: data.sellable,
      active: data.active,
    };

    let roomTypeId = data.id ?? null;
    if (roomTypeId) {
      const { error } = await context.supabase
        .from("room_types")
        .update(payload)
        .eq("id", roomTypeId)
        .eq("restaurant_id", data.restaurantId);
      if (error) {
        return {
          ok: false as const,
          message: error.code === "23505" ? "That room type code is already used." : "Could not save the room type.",
        };
      }
    } else {
      const { data: created, error } = await context.supabase
        .from("room_types")
        .insert({ ...payload, created_by_staff_membership_id: me.id })
        .select("id")
        .maybeSingle();
      if (error || !created) {
        return {
          ok: false as const,
          message: error?.code === "23505" ? "That room type code is already used." : "Could not create the room type.",
        };
      }
      roomTypeId = created.id;
    }

    if (data.amenityIds) {
      // Amenities must belong to this property; anything else is dropped.
      const { data: valid } = await context.supabase
        .from("room_amenities")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .in("id", data.amenityIds.length > 0 ? data.amenityIds : ["00000000-0000-0000-0000-000000000000"]);
      const allowed = (valid ?? []).map((a) => a.id);

      await context.supabase
        .from("room_type_amenities")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("room_type_id", roomTypeId);
      if (allowed.length > 0) {
        await context.supabase.from("room_type_amenities").insert(
          allowed.map((amenityId) => ({
            restaurant_id: data.restaurantId,
            room_type_id: roomTypeId!,
            amenity_id: amenityId,
          })),
        );
      }
    }

    return { ok: true as const, id: roomTypeId };
  });

export const setRoomTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { error } = await context.supabase
      .from("room_types")
      .update({ active: data.active })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not update the room type." };
    return { ok: true as const };
  });

/* ---------------------------------------------------------------------- rooms */

export const listRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        includeInactive: z.boolean().optional(),
        roomTypeId: idSchema.optional(),
        floor: z.string().trim().max(20).optional(),
        building: z.string().trim().max(80).optional(),
        status: z.enum(ROOM_STATUSES).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<HotelRoom[]> => {
    await requireRoomManager(context as never, data.restaurantId);

    let query = context.supabase
      .from("hotel_rooms")
      .select("*, room_types(name, code)")
      .eq("restaurant_id", data.restaurantId)
      .order("room_number");
    if (!data.includeInactive) query = query.eq("active", true);
    if (data.roomTypeId) query = query.eq("room_type_id", data.roomTypeId);
    if (data.floor) query = query.eq("floor", data.floor);
    if (data.building) query = query.eq("building", data.building);
    if (data.status) query = query.eq("status", data.status);

    const { data: rows } = await query;
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      roomNumber: r.room_number,
      roomTypeId: r.room_type_id,
      roomTypeName: r.room_types?.name ?? "",
      roomTypeCode: r.room_types?.code ?? "",
      floor: r.floor,
      building: r.building,
      wing: r.wing,
      smoking: r.smoking,
      accessible: r.accessible,
      status: r.status as RoomStatus,
      active: r.active,
      notes: r.notes,
    }));
  });

const roomInput = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  roomTypeId: idSchema,
  roomNumber: z.string().trim().min(1, "Enter a room number.").max(20),
  floor: z.string().trim().max(20).nullable().optional(),
  building: z.string().trim().max(80).nullable().optional(),
  wing: z.string().trim().max(80).nullable().optional(),
  smoking: z.boolean(),
  accessible: z.boolean(),
  status: z.enum(ROOM_STATUSES),
  active: z.boolean(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const saveRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roomInput.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireRoomManager(context as never, data.restaurantId);

    // The room type must belong to this property.
    const { data: type } = await context.supabase
      .from("room_types")
      .select("id")
      .eq("id", data.roomTypeId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!type) return { ok: false as const, message: "That room type doesn't belong to this property." };

    const payload = {
      restaurant_id: data.restaurantId,
      room_type_id: data.roomTypeId,
      room_number: data.roomNumber,
      floor: blankToNull(data.floor),
      building: blankToNull(data.building),
      wing: blankToNull(data.wing),
      smoking: data.smoking,
      accessible: data.accessible,
      status: data.status,
      active: data.active,
      notes: blankToNull(data.notes),
    };

    const { error } = data.id
      ? await context.supabase
          .from("hotel_rooms")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await context.supabase
          .from("hotel_rooms")
          .insert({ ...payload, created_by_staff_membership_id: me.id });

    if (error) {
      return {
        ok: false as const,
        message: error.code === "23505" ? "That room number already exists." : "Could not save the room.",
      };
    }
    return { ok: true as const };
  });

export const setRoomActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { error } = await context.supabase
      .from("hotel_rooms")
      .update({ active: data.active })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not update the room." };
    return { ok: true as const };
  });

/* --------------------------------------------------------------------- images */

export const listRoomTypeImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomTypeId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomTypeImage[]> => {
    await requireRoomManager(context as never, data.restaurantId);
    const { data: rows } = await context.supabase
      .from("room_type_images")
      .select("id, storage_path, display_order, is_cover, alt_text")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId)
      .order("display_order");
    const signed = await signRoomImages((rows ?? []).map((r) => r.storage_path));
    return (rows ?? []).map((r) => ({
      id: r.id,
      storagePath: r.storage_path,
      url: signed.get(r.storage_path) ?? null,
      displayOrder: r.display_order,
      isCover: r.is_cover,
      altText: r.alt_text,
    }));
  });

/**
 * Issues a one-shot signed upload URL inside this property's own namespace.
 * The path is generated server-side; the original filename is never trusted.
 */
export const createRoomTypeImageUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        size: z.number().int().positive().max(8 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { data: type } = await context.supabase
      .from("room_types")
      .select("id")
      .eq("id", data.roomTypeId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!type) return { ok: false as const, message: "That room type doesn't belong to this property." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = roomTypeImagePath(data.restaurantId, data.roomTypeId, IMAGE_EXT_BY_TYPE[data.contentType]!);
    const { data: signed, error } = await supabaseAdmin.storage.from(ROOM_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) return { ok: false as const, message: "Could not start the upload." };
    return { ok: true as const, path, token: signed.token };
  });

export const registerRoomTypeImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
        storagePath: z.string().trim().min(1).max(500),
        altText: z.string().trim().max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireRoomManager(context as never, data.restaurantId);
    // The path must sit inside this property's namespace for this room type.
    const prefix = `${data.restaurantId}/room-types/${data.roomTypeId}/`;
    if (!data.storagePath.startsWith(prefix)) {
      return { ok: false as const, message: "Invalid image reference." };
    }

    const { data: existing } = await context.supabase
      .from("room_type_images")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId);
    const count = existing?.length ?? 0;

    const { error } = await context.supabase.from("room_type_images").insert({
      restaurant_id: data.restaurantId,
      room_type_id: data.roomTypeId,
      storage_path: data.storagePath,
      display_order: count,
      is_cover: count === 0,
      alt_text: blankToNull(data.altText),
      uploaded_by_staff_membership_id: me.id,
    });
    if (error) return { ok: false as const, message: "Could not save the image." };
    return { ok: true as const };
  });

export const setRoomTypeImageCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomTypeId: idSchema, imageId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    await context.supabase
      .from("room_type_images")
      .update({ is_cover: false })
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId);
    const { error } = await context.supabase
      .from("room_type_images")
      .update({ is_cover: true })
      .eq("id", data.imageId)
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId);
    if (error) return { ok: false as const, message: "Could not set the cover image." };
    return { ok: true as const };
  });

export const reorderRoomTypeImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, roomTypeId: idSchema, imageIds: z.array(idSchema).max(50) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    for (const [index, imageId] of data.imageIds.entries()) {
      await context.supabase
        .from("room_type_images")
        .update({ display_order: index })
        .eq("id", imageId)
        .eq("restaurant_id", data.restaurantId)
        .eq("room_type_id", data.roomTypeId);
    }
    return { ok: true as const };
  });

/** Removes the metadata row and the storage object together — no orphans. */
export const deleteRoomTypeImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomTypeId: idSchema, imageId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);

    const { data: row } = await context.supabase
      .from("room_type_images")
      .select("id, storage_path, is_cover")
      .eq("id", data.imageId)
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId)
      .maybeSingle();
    if (!row) return { ok: false as const, message: "That image could not be found." };

    const { error } = await context.supabase
      .from("room_type_images")
      .delete()
      .eq("id", row.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not delete the image." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(ROOM_BUCKET).remove([row.storage_path]);

    if (row.is_cover) {
      const { data: next } = await context.supabase
        .from("room_type_images")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("room_type_id", data.roomTypeId)
        .order("display_order")
        .limit(1);
      if (next && next[0]) {
        await context.supabase.from("room_type_images").update({ is_cover: true }).eq("id", next[0].id);
      }
    }
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ dashboard */

export interface RoomsDashboard {
  totalRooms: number;
  activeRooms: number;
  sellableRooms: number;
  availableRooms: number;
  outOfOrder: number;
  outOfService: number;
  byType: { name: string; code: string; count: number }[];
}

export const getRoomsDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<RoomsDashboard> => {
    await requireRoomManager(context as never, data.restaurantId);

    const [{ data: rooms }, { data: types }] = await Promise.all([
      context.supabase
        .from("hotel_rooms")
        .select("id, status, active, room_type_id")
        .eq("restaurant_id", data.restaurantId),
      context.supabase
        .from("room_types")
        .select("id, name, code, sellable")
        .eq("restaurant_id", data.restaurantId),
    ]);

    const all = rooms ?? [];
    const sellableTypes = new Set((types ?? []).filter((t) => t.sellable).map((t) => t.id));
    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.room_type_id, (counts.get(r.room_type_id) ?? 0) + 1);

    return {
      totalRooms: all.length,
      activeRooms: all.filter((r) => r.active).length,
      sellableRooms: all.filter((r) => r.active && sellableTypes.has(r.room_type_id)).length,
      availableRooms: all.filter((r) => r.active && r.status === "available").length,
      outOfOrder: all.filter((r) => r.status === "out_of_order").length,
      outOfService: all.filter((r) => r.status === "out_of_service").length,
      byType: (types ?? []).map((t) => ({ name: t.name, code: t.code, count: counts.get(t.id) ?? 0 })),
    };
  });
