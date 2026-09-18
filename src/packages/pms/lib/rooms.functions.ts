import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  IMAGE_EXT_BY_TYPE,
  MAINTENANCE_STATUSES,
  ROOM_BUCKET,
  ROOM_LINK_KINDS,
  ROOM_STATUSES,
  SMOKING_POLICIES,
  blankToNull,
  canManageRooms,
  canAccessFrontOffice,
  requireFrontOfficeAccess,
  requireRoomManager,
  roomTypeImagePath,
  signRoomImages,
  type MaintenanceStatus,
  type RoomLinkKind,
  type RoomStatus,
  type SmokingPolicy,
} from "./rooms.server";
import { HK_STATUSES, type HkStatus } from "./housekeeping.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import type { Json } from "@/integrations/supabase/types";
import {
  batchLabelConflicts,
  card2RoomTypesStepStatus,
  evaluateRoomTypesRoomsReadiness,
  locationHierarchyError,
  mergeCard2RoomTypesStatus,
  normalizeBedRows,
  normalizeRoomFeatures,
  occupancyErrors,
  roomLinkErrors,
  sequentialRoomLabels,
  uniqueViolationMessage,
  type LocationIds,
  type LocationMasters,
  type NormalizedBedRow,
} from "./rooms-card2.server";
import { loadCard2HousekeepingSnapshot } from "./housekeeping-card2.functions";

const idSchema = z.string().uuid();
const smokingPolicySchema = z.enum(SMOKING_POLICIES);
const maintenanceStatusSchema = z.enum(MAINTENANCE_STATUSES);
const hkStatusSchema = z.enum(HK_STATUSES);
const roomLinkKindSchema = z.enum(ROOM_LINK_KINDS);

type DbClient = {
  from: (table: string) => any;
};

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

async function loadLocationMasters(
  supabase: DbClient,
  restaurantId: string,
  ids: LocationIds,
): Promise<LocationMasters> {
  const [building, wing, floor] = await Promise.all([
    ids.buildingId
      ? supabase
          .from("hotel_buildings")
          .select("id, name")
          .eq("id", ids.buildingId)
          .eq("restaurant_id", restaurantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ids.wingId
      ? supabase
          .from("hotel_wings")
          .select("id, name, parent_building_id, parent_floor_id")
          .eq("id", ids.wingId)
          .eq("restaurant_id", restaurantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ids.floorId
      ? supabase
          .from("hotel_floors")
          .select("id, name, building_id, wing_id")
          .eq("id", ids.floorId)
          .eq("restaurant_id", restaurantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    building: building.data ? { id: building.data.id, name: building.data.name } : null,
    wing: wing.data
      ? {
          id: wing.data.id,
          name: wing.data.name,
          parentBuildingId: wing.data.parent_building_id,
          parentFloorId: wing.data.parent_floor_id,
        }
      : null,
    floor: floor.data
      ? {
          id: floor.data.id,
          name: floor.data.name,
          buildingId: floor.data.building_id,
          wingId: floor.data.wing_id,
        }
      : null,
  };
}

export async function persistCard2RoomTypesReadiness(supabase: DbClient, restaurantId: string): Promise<void> {
  const [{ data: types }, { data: beds }, { data: rooms }, { data: floors }, { data: wings }] =
    await Promise.all([
      supabase
        .from("room_types")
        .select(
          "id, code, standard_occupancy, max_occupancy, adult_capacity, child_capacity, infant_capacity",
        )
        .eq("restaurant_id", restaurantId),
      supabase.from("room_type_beds").select("room_type_id, bed_count").eq("restaurant_id", restaurantId),
      supabase
        .from("hotel_rooms")
        .select("id, room_number, room_code, room_type_id, building_id, wing_id, floor_id")
        .eq("restaurant_id", restaurantId),
      supabase.from("hotel_floors").select("id, building_id, wing_id").eq("restaurant_id", restaurantId),
      supabase.from("hotel_wings").select("id, parent_building_id").eq("restaurant_id", restaurantId),
    ]);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("pms_property_setup_status")
    .eq("id", restaurantId)
    .maybeSingle();

  const readiness = evaluateRoomTypesRoomsReadiness({
    types: (types ?? []).map((row: any) => ({
      id: row.id,
      code: String(row.code ?? ""),
      standardOccupancy: Number(row.standard_occupancy ?? 0),
      maxOccupancy: Number(row.max_occupancy ?? 0),
      adultCapacity: Number(row.adult_capacity ?? 0),
      childCapacity: Number(row.child_capacity ?? 0),
      infantCapacity: Number(row.infant_capacity ?? 0),
    })),
    beds: (beds ?? []).map((row: any) => ({
      roomTypeId: row.room_type_id,
      bedCount: Number(row.bed_count ?? 0),
    })),
    rooms: (rooms ?? []).map((row: any) => ({
      id: row.id,
      roomNumber: String(row.room_number ?? ""),
      roomCode: row.room_code ?? null,
      roomTypeId: row.room_type_id ?? null,
      buildingId: row.building_id ?? null,
      wingId: row.wing_id ?? null,
      floorId: row.floor_id ?? null,
    })),
    floors: (floors ?? []).map((row: any) => ({
      id: row.id,
      buildingId: row.building_id,
      wingId: row.wing_id ?? null,
    })),
    wings: (wings ?? []).map((row: any) => ({
      id: row.id,
      parentBuildingId: row.parent_building_id ?? null,
    })),
  });

  const hasStarted = (types ?? []).length > 0 || (rooms ?? []).length > 0;
  const next = mergeCard2RoomTypesStatus(
    restaurant?.pms_property_setup_status,
    card2RoomTypesStepStatus(readiness.ready, hasStarted),
  );
  await supabaseAdmin
    .from("restaurants")
    .update({ pms_property_setup_status: next as unknown as Json })
    .eq("id", restaurantId);
}

async function replaceRoomTypeBeds(
  supabase: DbClient,
  restaurantId: string,
  roomTypeId: string,
  beds: NormalizedBedRow[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error: delError } = await supabase
    .from("room_type_beds")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("room_type_id", roomTypeId);
  if (delError) return { ok: false, message: "Could not update the bed configuration." };
  if (beds.length === 0) return { ok: true };
  const { error } = await supabase.from("room_type_beds").insert(
    beds.map((bed) => ({
      restaurant_id: restaurantId,
      room_type_id: roomTypeId,
      bed_type: bed.bedType,
      bed_size: bed.bedSize,
      bed_count: bed.bedCount,
      sort_order: bed.sortOrder,
    })),
  );
  if (error) return { ok: false, message: "Could not save the bed configuration." };
  return { ok: true };
}

async function replaceRoomLinks(
  supabase: DbClient,
  restaurantId: string,
  roomId: string,
  links: { otherRoomId: string; kind: RoomLinkKind }[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error: delError } = await supabase
    .from("hotel_room_links")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("room_id", roomId);
  if (delError) return { ok: false, message: "Could not update room links." };
  if (links.length === 0) return { ok: true };
  const { error } = await supabase.from("hotel_room_links").insert(
    links.map((link) => ({
      restaurant_id: restaurantId,
      room_id: roomId,
      other_room_id: link.otherRoomId,
      kind: link.kind,
    })),
  );
  if (error?.code === "23505") return { ok: false, message: "Duplicate room relationship." };
  if (error) return { ok: false, message: "Could not save room links." };
  return { ok: true };
}

export interface RoomAmenity {
  id: string;
  name: string;
  active: boolean;
  code: string;
  category: string;
}

export interface RoomTypeImage {
  id: string;
  storagePath: string;
  url: string | null;
  displayOrder: number;
  isCover: boolean;
  altText: string | null;
}

export interface RoomTypeBed {
  id: string;
  bedType: string;
  bedSize: string | null;
  numberOfBeds: number;
  sortOrder: number;
}

export interface RoomType {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  displayName: string | null;
  description: string | null;
  category: string | null;
  class: string | null;
  maxOccupancy: number;
  standardOccupancy: number;
  adultCapacity: number;
  childCapacity: number;
  infantCapacity: number;
  extraGuestAllowed: boolean;
  extraBedAllowed: boolean;
  connectingEligible: boolean;
  accessibleEligible: boolean;
  smokingPolicy: SmokingPolicy;
  bedType: string | null;
  bedCount: number | null;
  roomSize: string | null;
  roomView: string | null;
  sellable: boolean;
  active: boolean;
  defaultBuildingId: string | null;
  defaultWingId: string | null;
  preferredFloorId: string | null;
  beds: RoomTypeBed[];
  amenityIds: string[];
  roomCount: number;
  coverUrl: string | null;
}

export interface HotelRoomLink {
  id: string;
  otherRoomId: string;
  kind: RoomLinkKind;
}

export interface HotelRoom {
  id: string;
  roomNumber: string;
  roomCode: string | null;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string;
  floor: string | null;
  building: string | null;
  wing: string | null;
  buildingId: string | null;
  floorId: string | null;
  wingId: string | null;
  smoking: boolean;
  accessible: boolean;
  status: RoomStatus;
  housekeepingStatus: HkStatus | null;
  maintenanceStatus: MaintenanceStatus;
  sellable: boolean;
  roomFeatures: string[];
  active: boolean;
  notes: string | null;
  links: HotelRoomLink[];
}

/** Rooms access is owner/manager only; the flag drives nav + UI affordances. */
export const getRoomsAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireFrontOfficeAccess(context as never, data.restaurantId);
    return {
      role: me.role,
      canManage: canAccessFrontOffice(me.role),
      canConfigure: canManageRooms(me.role),
    };
  });

/* ------------------------------------------------------------------ amenities */

export const listRoomAmenities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<RoomAmenity[]> => {
    await requireRoomManager(context as never, data.restaurantId);

    const withExtras = await pmsDb(context.supabase)
      .from("room_amenities")
      .select("id, name, active, code, category")
      .eq("restaurant_id", data.restaurantId)
      .order("name");
    if (withExtras.error && isMissingSchemaError(withExtras.error)) {
      const { data: existing } = await pmsDb(context.supabase)
        .from("room_amenities")
        .select("id, name, active")
        .eq("restaurant_id", data.restaurantId)
        .order("name");
      return (existing ?? []).map((a: { id: string; name: string; active: boolean }) => ({ id: a.id, name: a.name, active: a.active, code: "", category: "" }));
    }
    if (withExtras.error) throw new Error(withExtras.error.message);
    return (withExtras.data ?? []).map((a: { id: string; name: string; active: boolean; code?: string | null; category?: string | null }) => ({
      id: a.id,
      name: a.name,
      active: a.active,
      code: String(a.code ?? ""),
      category: String(a.category ?? ""),
    }));
  });

/* ----------------------------------------------------------------- room types */

export const listRoomTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, includeInactive: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomType[]> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);

    let query = pmsDb(context.supabase)
      .from("room_types")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .order("code");
    if (!data.includeInactive) query = query.eq("active", true);

    const [{ data: types }, { data: rooms }, { data: links }, { data: images }, { data: beds }] = await Promise.all(
      [
        query,
        pmsDb(context.supabase)
          .from("hotel_rooms")
          .select("id, room_type_id")
          .eq("restaurant_id", data.restaurantId),
        pmsDb(context.supabase)
          .from("room_type_amenities")
          .select("room_type_id, amenity_id")
          .eq("restaurant_id", data.restaurantId),
        pmsDb(context.supabase)
          .from("room_type_images")
          .select("room_type_id, storage_path, is_cover, display_order")
          .eq("restaurant_id", data.restaurantId)
          .order("display_order"),
        pmsDb(context.supabase)
          .from("room_type_beds")
          .select("id, room_type_id, bed_type, bed_size, bed_count, sort_order")
          .eq("restaurant_id", data.restaurantId)
          .order("sort_order"),
      ],
    );

    const counts = new Map<string, number>();
    for (const r of rooms ?? []) counts.set(r.room_type_id, (counts.get(r.room_type_id) ?? 0) + 1);

    const amenityMap = new Map<string, string[]>();
    for (const l of links ?? []) {
      amenityMap.set(l.room_type_id, [...(amenityMap.get(l.room_type_id) ?? []), l.amenity_id]);
    }

    const coverPath = new Map<string, string>();
    for (const img of images ?? []) {
      if (!coverPath.has(img.room_type_id) || img.is_cover) {
        if (img.is_cover || !coverPath.has(img.room_type_id))
          coverPath.set(img.room_type_id, img.storage_path);
      }
    }
    const signed = await signRoomImages([...coverPath.values()]);

    const bedsByType = new Map<string, RoomTypeBed[]>();
    for (const bed of beds ?? []) {
      const row: RoomTypeBed = {
        id: bed.id,
        bedType: String(bed.bed_type ?? ""),
        bedSize: bed.bed_size ?? null,
        numberOfBeds: Number(bed.bed_count ?? 0),
        sortOrder: Number(bed.sort_order ?? 0),
      };
      bedsByType.set(bed.room_type_id, [...(bedsByType.get(bed.room_type_id) ?? []), row]);
    }

    return (types ?? []).map((t: any) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      shortName: t.short_name ?? null,
      displayName: t.display_name ?? null,
      description: t.description,
      category: t.category ?? null,
      class: t.class ?? null,
      maxOccupancy: t.max_occupancy,
      standardOccupancy: Number(t.standard_occupancy ?? t.max_occupancy ?? 0),
      adultCapacity: t.adult_capacity,
      childCapacity: t.child_capacity,
      infantCapacity: Number(t.infant_capacity ?? 0),
      extraGuestAllowed: t.extra_guest_allowed === true,
      extraBedAllowed: t.extra_bed_allowed === true,
      connectingEligible: t.connecting_eligible === true,
      accessibleEligible: t.accessible_eligible === true,
      smokingPolicy: (SMOKING_POLICIES as readonly string[]).includes(String(t.smoking_policy))
        ? (t.smoking_policy as SmokingPolicy)
        : "non_smoking",
      bedType: t.bed_type,
      bedCount: t.bed_count,
      roomSize: t.room_size,
      roomView: t.room_view,
      sellable: t.sellable,
      active: t.active,
      defaultBuildingId: t.default_building_id ?? null,
      defaultWingId: t.default_wing_id ?? null,
      preferredFloorId: t.preferred_floor_id ?? null,
      beds: bedsByType.get(t.id) ?? [],
      amenityIds: amenityMap.get(t.id) ?? [],
      roomCount: counts.get(t.id) ?? 0,
      coverUrl: signed.get(coverPath.get(t.id) ?? "") ?? null,
    }));
  });

const roomTypeBedInput = z.object({
  bedType: z.string().trim().min(1, "Each bed row needs a bed type.").max(80),
  bedSize: z.string().trim().max(40).nullable().optional(),
  numberOfBeds: z.number().int().min(1, "Number of beds must be greater than 0.").max(20),
});

const roomTypeInput = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z.string().trim().min(2, "Enter a code.").max(20),
  name: z.string().trim().min(2, "Enter a name.").max(120),
  shortName: z.string().trim().max(40).nullable().optional(),
  displayName: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  class: z.string().trim().max(80).nullable().optional(),
  maxOccupancy: z.number().int().min(1).max(20),
  standardOccupancy: z.number().int().min(1).max(20).optional(),
  adultCapacity: z.number().int().min(0).max(20),
  childCapacity: z.number().int().min(0).max(20),
  infantCapacity: z.number().int().min(0).max(20).optional(),
  extraGuestAllowed: z.boolean().optional(),
  extraBedAllowed: z.boolean().optional(),
  connectingEligible: z.boolean().optional(),
  accessibleEligible: z.boolean().optional(),
  smokingPolicy: smokingPolicySchema.optional(),
  bedType: z.string().trim().max(80).nullable().optional(),
  bedCount: z.number().int().min(0).max(20).nullable().optional(),
  roomSize: z.string().trim().max(40).nullable().optional(),
  roomView: z.string().trim().max(80).nullable().optional(),
  sellable: z.boolean(),
  active: z.boolean(),
  defaultBuildingId: idSchema.nullable().optional(),
  defaultWingId: idSchema.nullable().optional(),
  preferredFloorId: idSchema.nullable().optional(),
  beds: z.array(roomTypeBedInput).max(20).optional(),
  amenityIds: z.array(idSchema).max(50).optional(),
});

export const saveRoomType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roomTypeInput.parse(input))
  .handler(async ({ data, context }) => {
    // Type row then room_type_beds: sequential, fail-closed on beds (ROOM_TYPE_BEDS_SEQUENTIAL_LIMITATION).
    const me = await requireRoomManager(context as never, data.restaurantId);
    const occupancy = {
      standardOccupancy: data.standardOccupancy ?? data.maxOccupancy,
      maxOccupancy: data.maxOccupancy,
      adultCapacity: data.adultCapacity,
      childCapacity: data.childCapacity,
      infantCapacity: data.infantCapacity ?? 0,
    };
    const occupancyIssue = occupancyErrors(occupancy)[0];
    if (occupancyIssue) return { ok: false as const, message: occupancyIssue };

    let normalizedBeds: NormalizedBedRow[] = [];
    if (data.beds) {
      const beds = normalizeBedRows(data.beds);
      if (!beds.ok) return { ok: false as const, message: beds.message };
      normalizedBeds = beds.rows;
    }

    const masters = await loadLocationMasters(pmsDb(context.supabase), data.restaurantId, {
      buildingId: data.defaultBuildingId,
      wingId: data.defaultWingId,
      floorId: data.preferredFloorId,
    });
    const locationIssue = locationHierarchyError(
      {
        buildingId: data.defaultBuildingId,
        wingId: data.defaultWingId,
        floorId: data.preferredFloorId,
      },
      masters,
    );
    if (locationIssue) return { ok: false as const, message: locationIssue };

    const code = data.code.toUpperCase();
    const { data: duplicate } = await pmsDb(context.supabase)
      .from("room_types")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("code", code)
      .maybeSingle();
    if (duplicate && duplicate.id !== data.id) {
      return { ok: false as const, message: "That room type code is already used." };
    }

    const payload = {
      restaurant_id: data.restaurantId,
      code,
      name: data.name,
      short_name: blankToNull(data.shortName),
      display_name: blankToNull(data.displayName) ?? data.name,
      description: blankToNull(data.description),
      category: blankToNull(data.category),
      class: blankToNull(data.class),
      max_occupancy: occupancy.maxOccupancy,
      standard_occupancy: occupancy.standardOccupancy,
      adult_capacity: occupancy.adultCapacity,
      child_capacity: occupancy.childCapacity,
      infant_capacity: occupancy.infantCapacity,
      extra_guest_allowed: data.extraGuestAllowed ?? false,
      extra_bed_allowed: data.extraBedAllowed ?? false,
      connecting_eligible: data.connectingEligible ?? false,
      accessible_eligible: data.accessibleEligible ?? false,
      smoking_policy: data.smokingPolicy ?? "non_smoking",
      bed_type: blankToNull(data.bedType),
      bed_count: data.bedCount ?? null,
      room_size: blankToNull(data.roomSize),
      room_view: blankToNull(data.roomView),
      sellable: data.sellable,
      active: data.active,
      default_building_id: data.defaultBuildingId ?? null,
      default_wing_id: data.defaultWingId ?? null,
      preferred_floor_id: data.preferredFloorId ?? null,
    };

    let roomTypeId = data.id ?? null;
    if (roomTypeId) {
      const { error } = await pmsDb(context.supabase)
        .from("room_types")
        .update(payload)
        .eq("id", roomTypeId)
        .eq("restaurant_id", data.restaurantId);
      if (error) {
        return {
          ok: false as const,
          message: uniqueViolationMessage(error, "Could not save the room type."),
        };
      }
    } else {
      const { data: created, error } = await pmsDb(context.supabase)
        .from("room_types")
        .insert({ ...payload, created_by_staff_membership_id: me.id })
        .select("id")
        .maybeSingle();
      if (error || !created) {
        return {
          ok: false as const,
          message: uniqueViolationMessage(error, "Could not create the room type."),
        };
      }
      roomTypeId = created.id;
    }

    if (!roomTypeId) return { ok: false as const, message: "Could not save the room type." };

    if (data.beds) {
      const bedsWrite = await replaceRoomTypeBeds(
        pmsDb(context.supabase),
        data.restaurantId,
        roomTypeId,
        normalizedBeds,
      );
      if (!bedsWrite.ok) return bedsWrite;
    }

    if (data.amenityIds) {
      // Amenities must belong to this property; anything else is dropped.
      const { data: valid } = await pmsDb(context.supabase)
        .from("room_amenities")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .in(
          "id",
          data.amenityIds.length > 0 ? data.amenityIds : ["00000000-0000-0000-0000-000000000000"],
        );
      const allowed = (valid ?? []).map((a: { id: string }) => a.id);

      await pmsDb(context.supabase)
        .from("room_type_amenities")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("room_type_id", roomTypeId);
      if (allowed.length > 0) {
        await pmsDb(context.supabase).from("room_type_amenities").insert(
          allowed.map((amenityId: string) => ({
            restaurant_id: data.restaurantId,
            room_type_id: roomTypeId!,
            amenity_id: amenityId,
          })),
        );
      }
    }

    await persistCard2RoomTypesReadiness(pmsDb(context.supabase), data.restaurantId);
    return { ok: true as const, id: roomTypeId };
  });

export const setRoomTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { error } = await pmsDb(context.supabase)
      .from("room_types")
      .update({ active: data.active })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not update the room type." };
    await persistCard2RoomTypesReadiness(pmsDb(context.supabase), data.restaurantId);
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
    await requireFrontOfficeAccess(context as never, data.restaurantId);

    let query = pmsDb(context.supabase)
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
    const roomIds = (rows ?? []).map((r: any) => r.id);
    const { data: linkRows } =
      roomIds.length > 0
        ? await pmsDb(context.supabase)
            .from("hotel_room_links")
            .select("id, room_id, other_room_id, kind")
            .eq("restaurant_id", data.restaurantId)
            .in("room_id", roomIds)
        : { data: [] as { id: string; room_id: string; other_room_id: string; kind: string }[] };

    const linksByRoom = new Map<string, HotelRoomLink[]>();
    for (const link of linkRows ?? []) {
      if (!(ROOM_LINK_KINDS as readonly string[]).includes(link.kind)) continue;
      linksByRoom.set(link.room_id, [
        ...(linksByRoom.get(link.room_id) ?? []),
        { id: link.id, otherRoomId: link.other_room_id, kind: link.kind as RoomLinkKind },
      ]);
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      roomNumber: r.room_number,
      roomCode: r.room_code ?? null,
      roomTypeId: r.room_type_id,
      roomTypeName: r.room_types?.name ?? "",
      roomTypeCode: r.room_types?.code ?? "",
      floor: r.floor,
      building: r.building,
      wing: r.wing,
      buildingId: r.building_id ?? null,
      floorId: r.floor_id ?? null,
      wingId: r.wing_id ?? null,
      smoking: r.smoking,
      accessible: r.accessible,
      status: r.status as RoomStatus,
      housekeepingStatus: (HK_STATUSES as readonly string[]).includes(String(r.housekeeping_status))
        ? (r.housekeeping_status as HkStatus)
        : null,
      maintenanceStatus: (MAINTENANCE_STATUSES as readonly string[]).includes(String(r.maintenance_status))
        ? (r.maintenance_status as MaintenanceStatus)
        : "normal",
      sellable: r.sellable !== false,
      roomFeatures: Array.isArray(r.room_features) ? r.room_features.map((value: unknown) => String(value)) : [],
      active: r.active,
      notes: r.notes,
      links: linksByRoom.get(r.id) ?? [],
    }));
  });

const roomLinkInput = z.object({
  otherRoomId: idSchema,
  kind: roomLinkKindSchema,
});

const roomInput = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  roomTypeId: idSchema,
  roomNumber: z.string().trim().min(1, "Enter a room number.").max(20),
  roomCode: z.string().trim().max(40).nullable().optional(),
  floor: z.string().trim().max(20).nullable().optional(),
  building: z.string().trim().max(80).nullable().optional(),
  wing: z.string().trim().max(80).nullable().optional(),
  buildingId: idSchema.optional().nullable(),
  floorId: idSchema.optional().nullable(),
  wingId: idSchema.optional().nullable(),
  smoking: z.boolean(),
  accessible: z.boolean(),
  status: z.enum(ROOM_STATUSES),
  housekeepingStatus: hkStatusSchema.optional(),
  maintenanceStatus: maintenanceStatusSchema.optional(),
  sellable: z.boolean().optional(),
  roomFeatures: z.array(z.string().trim().max(40)).max(30).optional(),
  active: z.boolean(),
  notes: z.string().trim().max(1000).nullable().optional(),
  links: z.array(roomLinkInput).max(20).optional(),
});

export const saveRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roomInput.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireRoomManager(context as never, data.restaurantId);
    const housekeepingPolicy = await loadCard2HousekeepingSnapshot(
      (await import("@/integrations/supabase/client.server")).supabaseAdmin,
      data.restaurantId,
    );
    let effectiveHousekeepingStatus =
      data.housekeepingStatus ?? housekeepingPolicy.settings.defaultStatus;
    if (!data.id && !housekeepingPolicy.settings.manualStatusChangeAllowed) {
      effectiveHousekeepingStatus = housekeepingPolicy.settings.defaultStatus;
    }
    if (data.id && data.housekeepingStatus && !housekeepingPolicy.settings.manualStatusChangeAllowed) {
      const { data: existingRoom } = await pmsDb(context.supabase)
        .from("hotel_rooms")
        .select("housekeeping_status")
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (existingRoom && existingRoom.housekeeping_status !== data.housekeepingStatus) {
        return {
          ok: false as const,
          message: "Manual housekeeping status changes are disabled in Housekeeping Setup.",
        };
      }
      effectiveHousekeepingStatus = existingRoom?.housekeeping_status ?? housekeepingPolicy.settings.defaultStatus;
    }

    const { data: type } = await pmsDb(context.supabase)
      .from("room_types")
      .select("id")
      .eq("id", data.roomTypeId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!type)
      return { ok: false as const, message: "That room type doesn't belong to this property." };

    const masters = await loadLocationMasters(pmsDb(context.supabase), data.restaurantId, {
      buildingId: data.buildingId,
      wingId: data.wingId,
      floorId: data.floorId,
    });
    const locationIssue = locationHierarchyError(
      { buildingId: data.buildingId, wingId: data.wingId, floorId: data.floorId },
      masters,
    );
    if (locationIssue) return { ok: false as const, message: locationIssue };

    const roomNumber = data.roomNumber.trim();
    const roomCode = (blankToNull(data.roomCode) ?? roomNumber).trim();
    const [{ data: numberDup }, { data: codeDup }] = await Promise.all([
      pmsDb(context.supabase)
        .from("hotel_rooms")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("room_number", roomNumber)
        .maybeSingle(),
      pmsDb(context.supabase)
        .from("hotel_rooms")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("room_code", roomCode)
        .maybeSingle(),
    ]);
    if (numberDup && numberDup.id !== data.id) {
      return { ok: false as const, message: "That room number already exists." };
    }
    if (codeDup && codeDup.id !== data.id) {
      return { ok: false as const, message: "That room code already exists." };
    }

    let building = blankToNull(data.building) ?? masters.building?.name ?? null;
    let floor = blankToNull(data.floor) ?? masters.floor?.name ?? null;
    let wing = blankToNull(data.wing) ?? masters.wing?.name ?? null;

    const payload = {
      restaurant_id: data.restaurantId,
      room_type_id: data.roomTypeId,
      room_number: roomNumber,
      room_code: roomCode,
      floor,
      building,
      wing,
      building_id: data.buildingId ?? null,
      floor_id: data.floorId ?? null,
      wing_id: data.wingId ?? null,
      smoking: data.smoking,
      accessible: data.accessible,
      status: data.status,
      housekeeping_status: effectiveHousekeepingStatus,
      maintenance_status: data.maintenanceStatus ?? "normal",
      sellable: data.sellable ?? true,
      room_features: normalizeRoomFeatures(data.roomFeatures),
      active: data.active,
      notes: blankToNull(data.notes),
    };

    let roomId = data.id ?? null;
    if (roomId) {
      const { error } = await pmsDb(context.supabase)
        .from("hotel_rooms")
        .update(payload)
        .eq("id", roomId)
        .eq("restaurant_id", data.restaurantId);
      if (error) {
        return { ok: false as const, message: uniqueViolationMessage(error, "Could not save the room.") };
      }
    } else {
      const { data: created, error } = await pmsDb(context.supabase)
        .from("hotel_rooms")
        .insert({ ...payload, created_by_staff_membership_id: me.id })
        .select("id")
        .maybeSingle();
      if (error || !created) {
        return { ok: false as const, message: uniqueViolationMessage(error, "Could not save the room.") };
      }
      roomId = created.id;
    }

    if (!roomId) return { ok: false as const, message: "Could not save the room." };

    if (data.links) {
      const targetIds = [...new Set(data.links.map((link) => link.otherRoomId))];
      const { data: targets } =
        targetIds.length > 0
          ? await pmsDb(context.supabase)
              .from("hotel_rooms")
              .select("id")
              .eq("restaurant_id", data.restaurantId)
              .in("id", targetIds)
          : { data: [] as { id: string }[] };
      const allowed = new Set<string>((targets ?? []).map((row: { id: string }) => row.id));
      const linkIssue = roomLinkErrors(roomId, data.links, allowed);
      if (linkIssue) return { ok: false as const, message: linkIssue };
      const linksWrite = await replaceRoomLinks(pmsDb(context.supabase), data.restaurantId, roomId, data.links);
      if (!linksWrite.ok) return linksWrite;
    }

    await persistCard2RoomTypesReadiness(pmsDb(context.supabase), data.restaurantId);
    return { ok: true as const, id: roomId };
  });

export const setRoomActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { error } = await pmsDb(context.supabase)
      .from("hotel_rooms")
      .update({ active: data.active })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not update the room." };
    await persistCard2RoomTypesReadiness(pmsDb(context.supabase), data.restaurantId);
    return { ok: true as const };
  });

const bulkCreateRoomsInput = z.object({
  restaurantId: idSchema,
  roomTypeId: idSchema,
  buildingId: idSchema,
  wingId: idSchema.nullable().optional(),
  floorId: idSchema.nullable().optional(),
  startNumber: z.number().int(),
  endNumber: z.number().int().nullable().optional(),
  quantity: z.number().int().nullable().optional(),
  prefix: z.string().trim().max(10).nullable().optional(),
  suffix: z.string().trim().max(10).nullable().optional(),
  smoking: z.boolean().optional(),
  accessible: z.boolean().optional(),
  status: z.enum(ROOM_STATUSES).optional(),
  housekeepingStatus: hkStatusSchema.optional(),
  maintenanceStatus: maintenanceStatusSchema.optional(),
  sellable: z.boolean().optional(),
  active: z.boolean().optional(),
});

export type BulkCreateRoomsResult = {
  success: boolean;
  createdCount: number;
  conflicts: { roomNumbers: string[]; roomCodes: string[] };
  validationErrors: string[];
};

export const bulkCreateRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkCreateRoomsInput.parse(input))
  .handler(async ({ data, context }): Promise<BulkCreateRoomsResult> => {
    const empty = {
      success: false,
      createdCount: 0,
      conflicts: { roomNumbers: [] as string[], roomCodes: [] as string[] },
      validationErrors: [] as string[],
    };
    const me = await requireRoomManager(context as never, data.restaurantId);
    const housekeepingPolicy = await loadCard2HousekeepingSnapshot(
      (await import("@/integrations/supabase/client.server")).supabaseAdmin,
      data.restaurantId,
    );
    const defaultHousekeepingStatus =
      housekeepingPolicy.settings.manualStatusChangeAllowed && data.housekeepingStatus
        ? data.housekeepingStatus
        : housekeepingPolicy.settings.defaultStatus;

    const generated = sequentialRoomLabels({
      startNumber: data.startNumber,
      endNumber: data.endNumber,
      quantity: data.quantity,
      prefix: data.prefix,
      suffix: data.suffix,
    });
    if (!generated.ok) {
      return { ...empty, validationErrors: generated.validationErrors };
    }

    const { data: type } = await pmsDb(context.supabase)
      .from("room_types")
      .select("id")
      .eq("id", data.roomTypeId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!type) {
      return { ...empty, validationErrors: ["That room type doesn't belong to this property."] };
    }

    const masters = await loadLocationMasters(pmsDb(context.supabase), data.restaurantId, {
      buildingId: data.buildingId,
      wingId: data.wingId,
      floorId: data.floorId,
    });
    const locationIssue = locationHierarchyError(
      { buildingId: data.buildingId, wingId: data.wingId, floorId: data.floorId },
      masters,
      { requireBuilding: true },
    );
    if (locationIssue) return { ...empty, validationErrors: [locationIssue] };

    const { data: existing } = await pmsDb(context.supabase)
      .from("hotel_rooms")
      .select("room_number, room_code")
      .eq("restaurant_id", data.restaurantId);
    const conflicts = batchLabelConflicts(
      generated.labels,
      (existing ?? []).map((row: any) => ({ roomNumber: row.room_number, roomCode: row.room_code })),
    );
    if (conflicts.numbers.length > 0 || conflicts.codes.length > 0) {
      return {
        ...empty,
        conflicts: { roomNumbers: conflicts.numbers, roomCodes: conflicts.codes },
        validationErrors: ["One or more room numbers or codes already exist."],
      };
    }

    const rows = generated.labels.map((label) => ({
      restaurant_id: data.restaurantId,
      room_type_id: data.roomTypeId,
      room_number: label.roomNumber,
      room_code: label.roomCode,
      building: masters.building?.name ?? null,
      floor: masters.floor?.name ?? null,
      wing: masters.wing?.name ?? null,
      building_id: data.buildingId,
      floor_id: data.floorId ?? null,
      wing_id: data.wingId ?? null,
      smoking: data.smoking ?? false,
      accessible: data.accessible ?? false,
      status: data.status ?? "available",
      housekeeping_status: defaultHousekeepingStatus,
      maintenance_status: data.maintenanceStatus ?? "normal",
      sellable: data.sellable ?? true,
      room_features: [] as string[],
      active: data.active ?? true,
      created_by_staff_membership_id: me.id,
    }));

    const { error } = await pmsDb(context.supabase).from("hotel_rooms").insert(rows);
    if (error) {
      return {
        ...empty,
        validationErrors: [uniqueViolationMessage(error, "Could not create the rooms.")],
      };
    }

    await persistCard2RoomTypesReadiness(pmsDb(context.supabase), data.restaurantId);
    return {
      success: true,
      createdCount: rows.length,
      conflicts: { roomNumbers: [], roomCodes: [] },
      validationErrors: [],
    };
  });

export const evaluateCard2RoomTypesReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const [{ data: types }, { data: beds }, { data: rooms }, { data: floors }, { data: wings }] = await Promise.all([
      pmsDb(context.supabase)
        .from("room_types")
        .select("id, code, standard_occupancy, max_occupancy, adult_capacity, child_capacity, infant_capacity")
        .eq("restaurant_id", data.restaurantId),
      pmsDb(context.supabase).from("room_type_beds").select("room_type_id, bed_count").eq("restaurant_id", data.restaurantId),
      pmsDb(context.supabase)
        .from("hotel_rooms")
        .select("id, room_number, room_code, room_type_id, building_id, wing_id, floor_id")
        .eq("restaurant_id", data.restaurantId),
      pmsDb(context.supabase).from("hotel_floors").select("id, building_id, wing_id").eq("restaurant_id", data.restaurantId),
      pmsDb(context.supabase).from("hotel_wings").select("id, parent_building_id").eq("restaurant_id", data.restaurantId),
    ]);
    const readiness = evaluateRoomTypesRoomsReadiness({
      types: (types ?? []).map((row: any) => ({
        id: row.id,
        code: String(row.code ?? ""),
        standardOccupancy: Number(row.standard_occupancy ?? 0),
        maxOccupancy: Number(row.max_occupancy ?? 0),
        adultCapacity: Number(row.adult_capacity ?? 0),
        childCapacity: Number(row.child_capacity ?? 0),
        infantCapacity: Number(row.infant_capacity ?? 0),
      })),
      beds: (beds ?? []).map((row: any) => ({
        roomTypeId: row.room_type_id,
        bedCount: Number(row.bed_count ?? 0),
      })),
      rooms: (rooms ?? []).map((row: any) => ({
        id: row.id,
        roomNumber: String(row.room_number ?? ""),
        roomCode: row.room_code ?? null,
        roomTypeId: row.room_type_id ?? null,
        buildingId: row.building_id ?? null,
        wingId: row.wing_id ?? null,
        floorId: row.floor_id ?? null,
      })),
      floors: (floors ?? []).map((row: any) => ({
        id: row.id,
        buildingId: row.building_id,
        wingId: row.wing_id ?? null,
      })),
      wings: (wings ?? []).map((row: any) => ({
        id: row.id,
        parentBuildingId: row.parent_building_id ?? null,
      })),
    });
    await persistCard2RoomTypesReadiness(pmsDb(context.supabase), data.restaurantId);
    return { ...readiness, stepStatus: card2RoomTypesStepStatus(readiness.ready, (types ?? []).length > 0 || (rooms ?? []).length > 0) };
  });

/* --------------------------------------------------------------------- images */

export const listRoomTypeImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomTypeId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomTypeImage[]> => {
    await requireRoomManager(context as never, data.restaurantId);
    const { data: rows } = await pmsDb(context.supabase)
      .from("room_type_images")
      .select("id, storage_path, display_order, is_cover, alt_text")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId)
      .order("display_order");
    const signed = await signRoomImages((rows ?? []).map((r: { storage_path: string }) => r.storage_path));
    return (rows ?? []).map((r: { id: string; storage_path: string; display_order: number; is_cover: boolean; alt_text: string | null }) => ({
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
        size: z
          .number()
          .int()
          .positive()
          .max(8 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { data: type } = await pmsDb(context.supabase)
      .from("room_types")
      .select("id")
      .eq("id", data.roomTypeId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!type)
      return { ok: false as const, message: "That room type doesn't belong to this property." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = roomTypeImagePath(
      data.restaurantId,
      data.roomTypeId,
      IMAGE_EXT_BY_TYPE[data.contentType]!,
    );
    const { data: signed, error } = await supabaseAdmin.storage
      .from(ROOM_BUCKET)
      .createSignedUploadUrl(path);
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

    const { data: existing } = await pmsDb(context.supabase)
      .from("room_type_images")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId);
    const count = existing?.length ?? 0;

    const { error } = await pmsDb(context.supabase).from("room_type_images").insert({
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
    await pmsDb(context.supabase)
      .from("room_type_images")
      .update({ is_cover: false })
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId);
    const { error } = await pmsDb(context.supabase)
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
      await pmsDb(context.supabase)
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

    const { data: row } = await pmsDb(context.supabase)
      .from("room_type_images")
      .select("id, storage_path, is_cover")
      .eq("id", data.imageId)
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId)
      .maybeSingle();
    if (!row) return { ok: false as const, message: "That image could not be found." };

    const { error } = await pmsDb(context.supabase)
      .from("room_type_images")
      .delete()
      .eq("id", row.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not delete the image." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(ROOM_BUCKET).remove([row.storage_path]);

    if (row.is_cover) {
      const { data: next } = await pmsDb(context.supabase)
        .from("room_type_images")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("room_type_id", data.roomTypeId)
        .order("display_order")
        .limit(1);
      if (next && next[0]) {
        await pmsDb(context.supabase)
          .from("room_type_images")
          .update({ is_cover: true })
          .eq("id", next[0].id);
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
    await requireFrontOfficeAccess(context as never, data.restaurantId);

    const [{ data: rooms }, { data: types }] = await Promise.all([
      pmsDb(context.supabase)
        .from("hotel_rooms")
        .select("id, status, active, room_type_id")
        .eq("restaurant_id", data.restaurantId),
      pmsDb(context.supabase)
        .from("room_types")
        .select("id, name, code, sellable")
        .eq("restaurant_id", data.restaurantId),
    ]);

    const all = (rooms ?? []) as { id: string; status: string; active: boolean; room_type_id: string }[];
    const typeRows = (types ?? []) as { id: string; name: string; code: string; sellable: boolean }[];
    const sellableTypes = new Set(typeRows.filter((t) => t.sellable).map((t) => t.id));
    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.room_type_id, (counts.get(r.room_type_id) ?? 0) + 1);

    return {
      totalRooms: all.length,
      activeRooms: all.filter((r) => r.active).length,
      sellableRooms: all.filter((r) => r.active && sellableTypes.has(r.room_type_id)).length,
      availableRooms: all.filter((r) => r.active && r.status === "available").length,
      outOfOrder: all.filter((r) => r.status === "out_of_order").length,
      outOfService: all.filter((r) => r.status === "out_of_service").length,
      byType: typeRows.map((t) => ({
        name: t.name,
        code: t.code,
        count: counts.get(t.id) ?? 0,
      })),
    };
  });
