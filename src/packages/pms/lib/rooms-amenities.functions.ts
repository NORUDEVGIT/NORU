import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  amenityCatalogErrors,
  amenityUniqueViolationMessage,
  amenitiesHasStarted,
  AMENITY_CATEGORIES,
  card2RoomAmenitiesStepStatus,
  dedupeAmenityIds,
  effectiveAmenities,
  evaluateAmenitiesReadiness,
  mappingSaveErrors,
  mergeCard2AmenitiesStatus,
  normalizeAmenityCode,
  overrideSaveErrors,
  uncategorizedAmenityCount,
  type AmenityOverrideKind,
} from "./rooms-card2-amenities.server";

const idSchema = z.string().uuid();

type DbClient = {
  from: (table: string) => any;
};

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

export type Card2Amenity = {
  id: string;
  name: string;
  code: string;
  category: string;
  description: string;
  icon: string;
  active: boolean;
  complimentary: boolean;
  displayToGuest: boolean;
  internalOnly: boolean;
};

const amenitySelect =
  "id, name, code, category, description, icon, active, complimentary, display_to_guest, internal_only";

function mapAmenity(row: {
  id: string;
  name: string;
  code?: string | null;
  category?: string | null;
  description?: string | null;
  icon?: string | null;
  active: boolean;
  complimentary: boolean;
  display_to_guest: boolean;
  internal_only: boolean;
}): Card2Amenity {
  return {
    id: row.id,
    name: row.name,
    code: String(row.code ?? ""),
    category: String(row.category ?? ""),
    description: String(row.description ?? ""),
    icon: String(row.icon ?? ""),
    active: Boolean(row.active),
    complimentary: Boolean(row.complimentary),
    displayToGuest: Boolean(row.display_to_guest),
    internalOnly: Boolean(row.internal_only),
  };
}

export async function loadAmenitiesReadinessInput(supabase: DbClient, restaurantId: string) {
  const [{ data: catalog }, { data: mappings }, { data: overrides }, { data: roomTypes }, { data: rooms }] =
    await Promise.all([
      supabase
        .from("room_amenities")
        .select("id, name, category, code")
        .eq("restaurant_id", restaurantId),
      supabase
        .from("room_type_amenities")
        .select("room_type_id, amenity_id")
        .eq("restaurant_id", restaurantId),
      supabase
        .from("hotel_room_amenity_overrides")
        .select("room_id, amenity_id, kind")
        .eq("restaurant_id", restaurantId),
      supabase.from("room_types").select("id, active").eq("restaurant_id", restaurantId),
      supabase.from("hotel_rooms").select("id, room_type_id").eq("restaurant_id", restaurantId),
    ]);
  return {
    catalog: (catalog ?? []).map((row: any) => ({
      id: row.id,
      name: String(row.name ?? ""),
      category: row.category ?? null,
      code: row.code ?? null,
    })),
    mappings: (mappings ?? []).map((row: any) => ({
      roomTypeId: row.room_type_id,
      amenityId: row.amenity_id,
    })),
    overrides: (overrides ?? []).map((row: any) => ({
      roomId: row.room_id,
      amenityId: row.amenity_id,
      kind: String(row.kind ?? ""),
    })),
    roomTypes: (roomTypes ?? []).map((row: any) => ({ id: row.id, active: row.active !== false })),
    rooms: (rooms ?? []).map((row: any) => ({
      id: row.id,
      roomTypeId: row.room_type_id ?? null,
    })),
  };
}

export async function persistCard2AmenitiesReadiness(
  supabase: DbClient,
  restaurantId: string,
): Promise<void> {
  const loaded = await loadAmenitiesReadinessInput(supabase, restaurantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("pms_property_setup_status")
    .eq("id", restaurantId)
    .maybeSingle();
  const readiness = evaluateAmenitiesReadiness(loaded);
  const next = mergeCard2AmenitiesStatus(
    restaurant?.pms_property_setup_status,
    card2RoomAmenitiesStepStatus(
      readiness.ready,
      amenitiesHasStarted({
        catalogCount: loaded.catalog.length,
        mappingCount: loaded.mappings.length,
        overrideCount: loaded.overrides.length,
      }),
    ),
  );
  await supabaseAdmin
    .from("restaurants")
    .update({ pms_property_setup_status: next as unknown as Json })
    .eq("id", restaurantId);
}

export const listAmenities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<Card2Amenity[]> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const { data: rows, error } = await pmsDb(context.supabase)
      .from("room_amenities")
      .select(amenitySelect)
      .eq("restaurant_id", data.restaurantId)
      .order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapAmenity);
  });

const saveAmenityInput = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(40).optional().nullable(),
  category: z.enum(AMENITY_CATEGORIES),
  description: z.string().trim().max(500).optional().nullable(),
  icon: z.string().trim().max(80).optional().nullable(),
  active: z.boolean(),
  complimentary: z.boolean(),
  displayToGuest: z.boolean(),
  internalOnly: z.boolean(),
});

export const saveAmenity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveAmenityInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const catalogIssue = amenityCatalogErrors({
      name: data.name,
      category: data.category,
      code: data.code,
      description: data.description,
      icon: data.icon,
      active: data.active,
      complimentary: data.complimentary,
      displayToGuest: data.displayToGuest,
      internalOnly: data.internalOnly,
    })[0];
    if (catalogIssue) return { ok: false as const, message: catalogIssue };

    const codeKey = normalizeAmenityCode(data.code);
    if (codeKey) {
      const { data: existingCodes } = await pmsDb(context.supabase)
        .from("room_amenities")
        .select("id, code")
        .eq("restaurant_id", data.restaurantId);
      const clash = (existingCodes ?? []).find((row: { id: string; code: string | null }) => {
        if (data.id && row.id === data.id) return false;
        return normalizeAmenityCode(row.code) === codeKey;
      });
      if (clash) return { ok: false as const, message: "That amenity code already exists." };
    }

    const payload = {
      restaurant_id: data.restaurantId,
      name: data.name.trim(),
      code: codeKey ? data.code?.trim() || null : null,
      category: data.category.trim(),
      description: data.description?.trim() || null,
      icon: data.icon?.trim() || null,
      active: data.active,
      complimentary: data.complimentary,
      display_to_guest: data.displayToGuest,
      internal_only: data.internalOnly,
    };

    const result = data.id
      ? await pmsDb(context.supabase)
          .from("room_amenities")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await pmsDb(context.supabase).from("room_amenities").insert(payload).select("id").maybeSingle();

    if (result.error) {
      return {
        ok: false as const,
        message: amenityUniqueViolationMessage(result.error, "Could not save the amenity."),
      };
    }
    if (data.id && !result.data) return { ok: false as const, message: "That amenity was not found." };
    await persistCard2AmenitiesReadiness(pmsDb(context.supabase), data.restaurantId);
    return { ok: true as const, id: result.data?.id ?? data.id };
  });

export const listRoomTypeAmenities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomTypeId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const { data: typeRow } = await pmsDb(context.supabase)
      .from("room_types")
      .select("id")
      .eq("id", data.roomTypeId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!typeRow) return { ok: false as const, message: "That room type was not found." };

    const { data: rows, error } = await pmsDb(context.supabase)
      .from("room_type_amenities")
      .select("amenity_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId);
    if (error) throw new Error(error.message);
    return {
      ok: true as const,
      roomTypeId: data.roomTypeId,
      amenityIds: (rows ?? []).map((row: { amenity_id: string }) => row.amenity_id),
    };
  });

export const saveRoomTypeAmenities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
        amenityIds: z.array(idSchema).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const amenityIds = dedupeAmenityIds(data.amenityIds);
    const { data: typeRow } = await pmsDb(context.supabase)
      .from("room_types")
      .select("id")
      .eq("id", data.roomTypeId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    const { data: validAmenities } = await pmsDb(context.supabase)
      .from("room_amenities")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .in("id", amenityIds.length > 0 ? amenityIds : ["00000000-0000-0000-0000-000000000000"]);
    const validIds = new Set((validAmenities ?? []).map((row: { id: string }) => row.id));
    const mappingIssue = mappingSaveErrors({
      roomTypeExists: Boolean(typeRow),
      amenityIds,
      validAmenityIds: validIds,
    });
    if (mappingIssue) return { ok: false as const, message: mappingIssue };

    await pmsDb(context.supabase)
      .from("room_type_amenities")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId);
    if (amenityIds.length > 0) {
      const { error } = await pmsDb(context.supabase).from("room_type_amenities").insert(
        amenityIds.map((amenityId) => ({
          restaurant_id: data.restaurantId,
          room_type_id: data.roomTypeId,
          amenity_id: amenityId,
        })),
      );
      if (error) {
        return { ok: false as const, message: "Could not save room type amenities." };
      }
    }
    await persistCard2AmenitiesReadiness(pmsDb(context.supabase), data.restaurantId);
    return { ok: true as const };
  });

export const getRoomAmenityOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const { data: room } = await pmsDb(context.supabase)
      .from("hotel_rooms")
      .select("id")
      .eq("id", data.roomId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!room) return { ok: false as const, message: "That room was not found." };
    const { data: rows, error } = await pmsDb(context.supabase)
      .from("hotel_room_amenity_overrides")
      .select("amenity_id, kind")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_id", data.roomId);
    if (error) throw new Error(error.message);
    return {
      ok: true as const,
      roomId: data.roomId,
      overrides: (rows ?? []).map((row: { amenity_id: string; kind: AmenityOverrideKind }) => ({
        amenityId: row.amenity_id,
        kind: row.kind,
      })),
    };
  });

const overrideDraftSchema = z.object({
  amenityId: idSchema,
  kind: z.enum(["add", "remove"]),
});

export const saveRoomAmenityOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .union([
        z.object({
          restaurantId: idSchema,
          roomId: idSchema,
          reset: z.literal(true),
        }),
        z.object({
          restaurantId: idSchema,
          roomId: idSchema,
          overrides: z.array(overrideDraftSchema).max(100),
        }),
      ])
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { data: room } = await pmsDb(context.supabase)
      .from("hotel_rooms")
      .select("id")
      .eq("id", data.roomId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();

    if ("reset" in data && data.reset) {
      if (!room) return { ok: false as const, message: "That room was not found." };
      const { error } = await pmsDb(context.supabase)
        .from("hotel_room_amenity_overrides")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("room_id", data.roomId);
      if (error) return { ok: false as const, message: "Could not reset room amenities." };
      await persistCard2AmenitiesReadiness(pmsDb(context.supabase), data.restaurantId);
      return { ok: true as const, reset: true as const };
    }

    const drafts = "overrides" in data ? data.overrides : [];
    const amenityIds = dedupeAmenityIds(drafts.map((row) => row.amenityId));
    const { data: validAmenities } = await pmsDb(context.supabase)
      .from("room_amenities")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .in("id", amenityIds.length > 0 ? amenityIds : ["00000000-0000-0000-0000-000000000000"]);
    const validIds = new Set((validAmenities ?? []).map((row: { id: string }) => row.id));
    const overrideIssue = overrideSaveErrors({
      roomExists: Boolean(room),
      drafts,
      validAmenityIds: validIds,
    });
    if (overrideIssue) return { ok: false as const, message: overrideIssue };

    await pmsDb(context.supabase)
      .from("hotel_room_amenity_overrides")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("room_id", data.roomId);
    if (drafts.length > 0) {
      const { error } = await pmsDb(context.supabase).from("hotel_room_amenity_overrides").insert(
        drafts.map((row) => ({
          restaurant_id: data.restaurantId,
          room_id: data.roomId,
          amenity_id: row.amenityId,
          kind: row.kind,
        })),
      );
      if (error) {
        return {
          ok: false as const,
          message: amenityUniqueViolationMessage(error, "Could not save room amenity overrides."),
        };
      }
    }
    await persistCard2AmenitiesReadiness(pmsDb(context.supabase), data.restaurantId);
    return { ok: true as const };
  });

export const getRoomEffectiveAmenities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const { data: room } = await pmsDb(context.supabase)
      .from("hotel_rooms")
      .select("id, room_type_id")
      .eq("id", data.roomId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!room) return { ok: false as const, message: "That room was not found." };
    if (!room.room_type_id) {
      return { ok: false as const, message: "That room has no room type." };
    }

    const [{ data: mappings }, { data: overrideRows }, { data: catalog }] = await Promise.all([
      pmsDb(context.supabase)
        .from("room_type_amenities")
        .select("amenity_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("room_type_id", room.room_type_id),
      pmsDb(context.supabase)
        .from("hotel_room_amenity_overrides")
        .select("amenity_id, kind")
        .eq("restaurant_id", data.restaurantId)
        .eq("room_id", data.roomId),
      pmsDb(context.supabase)
        .from("room_amenities")
        .select(amenitySelect)
        .eq("restaurant_id", data.restaurantId),
    ]);

    const computed = effectiveAmenities({
      typeAmenityIds: (mappings ?? []).map((row: { amenity_id: string }) => row.amenity_id),
      overrides: (overrideRows ?? []).map((row: { amenity_id: string; kind: AmenityOverrideKind }) => ({
        amenityId: row.amenity_id,
        kind: row.kind,
      })),
    });
    const byId = new Map((catalog ?? []).map((row: Parameters<typeof mapAmenity>[0]) => [row.id, mapAmenity(row)]));
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as Card2Amenity[];
    return {
      ok: true as const,
      roomId: data.roomId,
      roomTypeId: room.room_type_id as string,
      inherited: pick(computed.inherited),
      added: pick(computed.added),
      removed: pick(computed.removed),
      effective: pick(computed.effective),
    };
  });

export const evaluateCard2AmenitiesReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const loaded = await loadAmenitiesReadinessInput(pmsDb(context.supabase), data.restaurantId);
    const readiness = evaluateAmenitiesReadiness(loaded);
    await persistCard2AmenitiesReadiness(pmsDb(context.supabase), data.restaurantId);
    const mappedTypes = new Set(loaded.mappings.map((row) => row.roomTypeId));
    return {
      ...readiness,
      stepStatus: card2RoomAmenitiesStepStatus(
        readiness.ready,
        amenitiesHasStarted({
          catalogCount: loaded.catalog.length,
          mappingCount: loaded.mappings.length,
          overrideCount: loaded.overrides.length,
        }),
      ),
      catalogCount: loaded.catalog.length,
      activeCatalogCount: loaded.catalog.length,
      uncategorizedCount: uncategorizedAmenityCount(loaded.catalog),
      typesConfigured: loaded.roomTypes.filter((row) => row.active !== false && mappedTypes.has(row.id)).length,
      roomsWithOverrides: new Set(loaded.overrides.map((row) => row.roomId)).size,
    };
  });
