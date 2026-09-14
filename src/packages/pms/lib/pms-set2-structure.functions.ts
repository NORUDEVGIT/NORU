/**
 * PMS-SET2 — load / save structure masters, amenities catalogue, outlets.
 *
 * 0048 tables are optional at runtime: missing relations never crash the hub.
 * Audit insert failure does not roll back the save.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import type { Json } from "@/integrations/supabase/types";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import {
  FLOOR_1_CODE,
  FLOOR_1_NAME,
  MAIN_BUILDING_CODE,
  MAIN_BUILDING_NAME,
  SET2_AUDIT_AMENITY,
  SET2_AUDIT_OUTLET,
  SET2_AUDIT_STRUCTURE,
  activateInputFromSnapshot,
  emptySet2Snapshot,
  isMissingSchemaError,
  parseOutletType,
  structureDeleteBlocked,
  structureDeleteMessage,
  wingParentXor,
  type HotelBuilding,
  type HotelFloor,
  type HotelWing,
  type PmsOutlet,
  type Set2Amenity,
  type Set2Snapshot,
  type StructureKind,
} from "./pms-set2-structure";

const idSchema = z.string().uuid();
const SET2_UNAVAILABLE_STRUCTURE = "Structure is unavailable until migration 0048 is applied.";
const SET2_UNAVAILABLE_OUTLETS = "Outlets are unavailable until migration 0048 is applied.";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function writeAudit(
  supabaseAdmin: Admin,
  params: {
    restaurantId: string;
    actorUserId: string;
    action: string;
    before: unknown;
    after: unknown;
    section?: string;
  },
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("restaurant_staff_audit_log").insert({
    restaurant_id: params.restaurantId,
    actor_user_id: params.actorUserId,
    target_user_id: params.actorUserId,
    action: params.action,
    metadata: {
      section: params.section ?? null,
      before: params.before as Json,
      after: params.after as Json,
      when: new Date().toISOString(),
    },
  });
  if (error) {
    console.error("[pms-set2] audit", error.message);
    return false;
  }
  return true;
}

function countBy(ids: Array<string | null | undefined>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of ids) {
    if (!id) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export async function loadSet2Snapshot(supabaseAdmin: Admin, restaurantId: string): Promise<Set2Snapshot> {
  const snapshot = emptySet2Snapshot();

  const [{ count: typeCount }, { count: roomCount }, amenitiesRes, restaurantRes] = await Promise.all([
    supabaseAdmin.from("room_types").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    supabaseAdmin.from("hotel_rooms").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    supabaseAdmin.from("room_amenities").select("id, name, active, code, category").eq("restaurant_id", restaurantId).order("name"),
    supabaseAdmin.from("restaurants").select("single_building_mode").eq("id", restaurantId).maybeSingle(),
  ]);

  snapshot.roomTypeCount = typeCount ?? 0;
  snapshot.roomCount = roomCount ?? 0;

  if (amenitiesRes.error && isMissingSchemaError(amenitiesRes.error)) {
    const fallback = await supabaseAdmin
      .from("room_amenities")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name");
    snapshot.amenities = ((fallback.data ?? []) as Array<{ id: string; name: string; active: boolean }>).map((row) => ({
      id: row.id,
      name: row.name,
      code: "",
      category: "",
      active: row.active,
    }));
  } else if (!amenitiesRes.error) {
    snapshot.amenities = ((amenitiesRes.data ?? []) as Array<Set2Amenity & { code?: string | null; category?: string | null }>).map(
      (row) => ({
        id: row.id,
        name: row.name,
        code: String(row.code ?? ""),
        category: String(row.category ?? ""),
        active: row.active,
      }),
    );
  }

  if (!restaurantRes.error && restaurantRes.data && "single_building_mode" in restaurantRes.data) {
    snapshot.singleBuildingMode = restaurantRes.data.single_building_mode === true;
  }

  const buildingsRes = await supabaseAdmin
    .from("hotel_buildings")
    .select("id, code, name, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (buildingsRes.error && isMissingSchemaError(buildingsRes.error)) {
    snapshot.structureColumnsAvailable = false;
  } else if (buildingsRes.error) {
    throw new Error(buildingsRes.error.message);
  } else {
    snapshot.structureColumnsAvailable = true;
    snapshot.buildings = (buildingsRes.data ?? []) as HotelBuilding[];
    const [floorsRes, wingsRes, roomsRes] = await Promise.all([
      supabaseAdmin
        .from("hotel_floors")
        .select("id, building_id, code, name, active")
        .eq("restaurant_id", restaurantId)
        .order("name"),
      supabaseAdmin
        .from("hotel_wings")
        .select("id, name, active, parent_building_id, parent_floor_id")
        .eq("restaurant_id", restaurantId)
        .order("name"),
      supabaseAdmin
        .from("hotel_rooms")
        .select("id, active, building_id, floor_id, wing_id, building")
        .eq("restaurant_id", restaurantId),
    ]);
    if (floorsRes.error && !isMissingSchemaError(floorsRes.error)) throw new Error(floorsRes.error.message);
    if (wingsRes.error && !isMissingSchemaError(wingsRes.error)) throw new Error(wingsRes.error.message);
    snapshot.floors = ((floorsRes.data ?? []) as Array<{
      id: string;
      building_id: string;
      code: string;
      name: string;
      active: boolean;
    }>).map((row) => ({
      id: row.id,
      buildingId: row.building_id,
      code: row.code,
      name: row.name,
      active: row.active,
    }));
    snapshot.wings = ((wingsRes.data ?? []) as Array<{
      id: string;
      name: string;
      active: boolean;
      parent_building_id: string | null;
      parent_floor_id: string | null;
    }>).map((row) => ({
      id: row.id,
      name: row.name,
      active: row.active,
      parentBuildingId: row.parent_building_id,
      parentFloorId: row.parent_floor_id,
    }));
    if (roomsRes.error && isMissingSchemaError(roomsRes.error)) {
      const textOnly = await supabaseAdmin
        .from("hotel_rooms")
        .select("id, active, building")
        .eq("restaurant_id", restaurantId);
      const rows = textOnly.data ?? [];
      snapshot.unassignedActiveRoomCount = rows.filter((row) => row.active && !String(row.building ?? "").trim()).length;
    } else if (!roomsRes.error) {
      const rows = (roomsRes.data ?? []) as Array<{
        active: boolean;
        building_id: string | null;
        floor_id: string | null;
        wing_id: string | null;
        building: string | null;
      }>;
      snapshot.assignedByBuilding = countBy(rows.map((row) => row.building_id));
      snapshot.assignedByFloor = countBy(rows.map((row) => row.floor_id));
      snapshot.assignedByWing = countBy(rows.map((row) => row.wing_id));
      snapshot.unassignedActiveRoomCount = rows.filter((row) => row.active && !row.building_id).length;
    }
  }

  const outletsRes = await supabaseAdmin
    .from("pms_outlets")
    .select("id, code, name, type, active, department_text, default_posting_label, is_default_rooms")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (outletsRes.error && isMissingSchemaError(outletsRes.error)) {
    snapshot.outletsColumnsAvailable = false;
  } else if (outletsRes.error) {
    throw new Error(outletsRes.error.message);
  } else {
    snapshot.outletsColumnsAvailable = true;
    snapshot.outlets = ((outletsRes.data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      type: string;
      active: boolean;
      department_text: string | null;
      default_posting_label: string | null;
      is_default_rooms: boolean;
    }>).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      type: parseOutletType(row.type) || "other",
      active: row.active,
      departmentText: String(row.department_text ?? ""),
      defaultPostingLabel: String(row.default_posting_label ?? ""),
      isDefaultRooms: row.is_default_rooms === true,
    }));
  }

  return snapshot;
}

export const getPmsSet2Snapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    return {
      snapshot,
      activate: activateInputFromSnapshot(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

const buildingSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  active: z.boolean(),
});

const floorSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  buildingId: idSchema,
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  active: z.boolean(),
});

const wingSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(120),
  active: z.boolean(),
  parentBuildingId: idSchema.optional().nullable(),
  parentFloorId: idSchema.optional().nullable(),
});

export const saveHotelBuilding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => buildingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.structureColumnsAvailable) throw new Error(SET2_UNAVAILABLE_STRUCTURE);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin.from("hotel_buildings").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("hotel_buildings").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That building code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET2_UNAVAILABLE_STRUCTURE);
      throw new Error(result.error.message);
    }
    if (data.id) {
      await supabaseAdmin
        .from("hotel_rooms")
        .update({ building: data.name })
        .eq("restaurant_id", data.restaurantId)
        .eq("building_id", data.id);
    }
    const after = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET2_AUDIT_STRUCTURE,
      section: "building",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const saveHotelFloor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => floorSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.structureColumnsAvailable) throw new Error(SET2_UNAVAILABLE_STRUCTURE);
    const payload = {
      restaurant_id: data.restaurantId,
      building_id: data.buildingId,
      code: data.code.toUpperCase(),
      name: data.name,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin.from("hotel_floors").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("hotel_floors").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That floor code is already used in this building.");
      if (isMissingSchemaError(result.error)) throw new Error(SET2_UNAVAILABLE_STRUCTURE);
      throw new Error(result.error.message);
    }
    if (data.id) {
      await supabaseAdmin
        .from("hotel_rooms")
        .update({ floor: data.name })
        .eq("restaurant_id", data.restaurantId)
        .eq("floor_id", data.id);
    }
    const after = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET2_AUDIT_STRUCTURE,
      section: "floor",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const saveHotelWing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => wingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const parentBuildingId = data.parentBuildingId || null;
    const parentFloorId = data.parentFloorId || null;
    if (!wingParentXor(parentBuildingId, parentFloorId)) {
      throw new Error("A wing must belong to either a building or a floor, not both.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.structureColumnsAvailable) throw new Error(SET2_UNAVAILABLE_STRUCTURE);
    const payload = {
      restaurant_id: data.restaurantId,
      name: data.name,
      active: data.active,
      parent_building_id: parentBuildingId,
      parent_floor_id: parentFloorId,
    };
    const result = data.id
      ? await supabaseAdmin.from("hotel_wings").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("hotel_wings").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That wing name is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET2_UNAVAILABLE_STRUCTURE);
      throw new Error(result.error.message);
    }
    if (data.id) {
      await supabaseAdmin
        .from("hotel_rooms")
        .update({ wing: data.name })
        .eq("restaurant_id", data.restaurantId)
        .eq("wing_id", data.id);
    }
    const after = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET2_AUDIT_STRUCTURE,
      section: "wing",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

async function assignedCount(
  supabaseAdmin: Admin,
  restaurantId: string,
  kind: StructureKind,
  id: string,
): Promise<number> {
  const column = kind === "building" ? "building_id" : kind === "floor" ? "floor_id" : "wing_id";
  const { count, error } = await supabaseAdmin
    .from("hotel_rooms")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq(column, id);
  if (error) {
    if (isMissingSchemaError(error)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

export const deleteStructureNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        kind: z.enum(["building", "floor", "wing"]),
        id: idSchema,
        reassignToId: idSchema.optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.structureColumnsAvailable) throw new Error(SET2_UNAVAILABLE_STRUCTURE);

    const column = data.kind === "building" ? "building_id" : data.kind === "floor" ? "floor_id" : "wing_id";
    const assigned = await assignedCount(supabaseAdmin, data.restaurantId, data.kind, data.id);
    if (structureDeleteBlocked(assigned) && !data.reassignToId) {
      throw new Error(structureDeleteMessage(data.kind, assigned) ?? "Reassign rooms before deleting.");
    }

    if (data.reassignToId) {
      let nextLabel: string | null = null;
      if (data.kind === "building") {
        const { data: row } = await supabaseAdmin
          .from("hotel_buildings")
          .select("name")
          .eq("id", data.reassignToId)
          .eq("restaurant_id", data.restaurantId)
          .maybeSingle();
        nextLabel = row?.name ?? null;
      } else if (data.kind === "floor") {
        const { data: row } = await supabaseAdmin
          .from("hotel_floors")
          .select("name")
          .eq("id", data.reassignToId)
          .eq("restaurant_id", data.restaurantId)
          .maybeSingle();
        nextLabel = row?.name ?? null;
      } else {
        const { data: row } = await supabaseAdmin
          .from("hotel_wings")
          .select("name")
          .eq("id", data.reassignToId)
          .eq("restaurant_id", data.restaurantId)
          .maybeSingle();
        nextLabel = row?.name ?? null;
      }
      const patch =
        data.kind === "building"
          ? { building_id: data.reassignToId, building: nextLabel }
          : data.kind === "floor"
            ? { floor_id: data.reassignToId, floor: nextLabel }
            : { wing_id: data.reassignToId, wing: nextLabel };
      const moved = await supabaseAdmin
        .from("hotel_rooms")
        .update(patch)
        .eq("restaurant_id", data.restaurantId)
        .eq(column, data.id);
      if (moved.error) throw new Error(moved.error.message);
    }

    if (data.kind === "building") {
      const childFloors = before.floors.filter((row) => row.buildingId === data.id);
      const childWings = before.wings.filter((row) => row.parentBuildingId === data.id);
      if (childFloors.length || childWings.length) {
        throw new Error("Move or delete floors and wings on this building first.");
      }
    }
    if (data.kind === "floor") {
      const childWings = before.wings.filter((row) => row.parentFloorId === data.id);
      if (childWings.length) throw new Error("Move or delete wings on this floor first.");
    }

    const table = data.kind === "building" ? "hotel_buildings" : data.kind === "floor" ? "hotel_floors" : "hotel_wings";
    const { error } = await supabaseAdmin.from(table).delete().eq("id", data.id).eq("restaurant_id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET2_UNAVAILABLE_STRUCTURE);
      throw new Error(error.message);
    }
    const after = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET2_AUDIT_STRUCTURE,
      section: `delete-${data.kind}`,
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const ensureSingleBuildingAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.structureColumnsAvailable) throw new Error(SET2_UNAVAILABLE_STRUCTURE);

    if (data.enabled) {
      let building = before.buildings.find(
        (row) => row.code.toUpperCase() === MAIN_BUILDING_CODE || row.name === MAIN_BUILDING_NAME,
      );
      if (!building) {
        const created = await supabaseAdmin
          .from("hotel_buildings")
          .insert({
            restaurant_id: data.restaurantId,
            code: MAIN_BUILDING_CODE,
            name: MAIN_BUILDING_NAME,
            active: true,
          })
          .select("id, code, name, active")
          .maybeSingle();
        if (created.error) throw new Error(created.error.message);
        if (created.data) building = created.data as HotelBuilding;
      }
      if (building) {
        const existingFloor = before.floors.find(
          (row) =>
            row.buildingId === building!.id &&
            (row.code === FLOOR_1_CODE || row.name === FLOOR_1_NAME),
        );
        if (!existingFloor) {
          const floor = await supabaseAdmin.from("hotel_floors").insert({
            restaurant_id: data.restaurantId,
            building_id: building.id,
            code: FLOOR_1_CODE,
            name: FLOOR_1_NAME,
            active: true,
          });
          if (floor.error && floor.error.code !== "23505") throw new Error(floor.error.message);
        }
      }
    }

    const flag = await supabaseAdmin
      .from("restaurants")
      .update({ single_building_mode: data.enabled })
      .eq("id", data.restaurantId);
    if (flag.error) {
      if (isMissingSchemaError(flag.error)) throw new Error(SET2_UNAVAILABLE_STRUCTURE);
      throw new Error(flag.error.message);
    }

    const after = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET2_AUDIT_STRUCTURE,
      section: "single-building",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const bulkAssignUnassignedRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        buildingId: idSchema,
        floorId: idSchema.optional().nullable(),
        wingId: idSchema.optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.structureColumnsAvailable) throw new Error(SET2_UNAVAILABLE_STRUCTURE);
    const building = before.buildings.find((row) => row.id === data.buildingId);
    if (!building) throw new Error("Choose a building.");
    const floor = data.floorId ? before.floors.find((row) => row.id === data.floorId) : null;
    const wing = data.wingId ? before.wings.find((row) => row.id === data.wingId) : null;
    const { error } = await supabaseAdmin
      .from("hotel_rooms")
      .update({
        building_id: building.id,
        building: building.name,
        floor_id: floor?.id ?? null,
        floor: floor?.name ?? null,
        wing_id: wing?.id ?? null,
        wing: wing?.name ?? null,
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .is("building_id", null);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET2_UNAVAILABLE_STRUCTURE);
      throw new Error(error.message);
    }
    const after = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET2_AUDIT_STRUCTURE,
      section: "bulk-assign",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const amenitySchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(40).optional().nullable(),
  category: z.string().trim().max(40).optional().nullable(),
  active: z.boolean(),
});

export const saveRoomAmenityCatalogue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => amenitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const core = { restaurant_id: data.restaurantId, name: data.name, active: data.active };
    const withExtras = { ...core, code: data.code?.trim() || null, category: data.category?.trim() || null };
    let result = data.id
      ? await supabaseAdmin.from("room_amenities").update(withExtras).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("room_amenities").insert(withExtras);
    if (result.error && isMissingSchemaError(result.error)) {
      result = data.id
        ? await supabaseAdmin.from("room_amenities").update(core).eq("id", data.id).eq("restaurant_id", data.restaurantId)
        : await supabaseAdmin.from("room_amenities").insert(core);
    }
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That amenity name is already used.");
      throw new Error(result.error.message);
    }
    const after = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET2_AUDIT_AMENITY,
      section: "amenity",
      before: before.amenities,
      after: after.amenities,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const outletSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  type: z.enum(["rooms", "restaurant", "bar", "spa", "other"]),
  active: z.boolean(),
  departmentText: z.string().trim().max(80).optional().nullable(),
  defaultPostingLabel: z.string().trim().max(80).optional().nullable(),
  isDefaultRooms: z.boolean(),
});

export const savePmsOutlet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => outletSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    if (data.isDefaultRooms && data.type !== "rooms") {
      throw new Error("Only a Rooms outlet can be the default Rooms outlet.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.outletsColumnsAvailable) throw new Error(SET2_UNAVAILABLE_OUTLETS);
    if (data.isDefaultRooms) {
      await supabaseAdmin.from("pms_outlets").update({ is_default_rooms: false }).eq("restaurant_id", data.restaurantId);
    }
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      type: data.type,
      active: data.active,
      department_text: data.departmentText?.trim() || null,
      default_posting_label: data.defaultPostingLabel?.trim() || null,
      is_default_rooms: data.isDefaultRooms,
    };
    const result = data.id
      ? await supabaseAdmin.from("pms_outlets").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_outlets").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That outlet code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET2_UNAVAILABLE_OUTLETS);
      throw new Error(result.error.message);
    }
    const after = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET2_AUDIT_OUTLET,
      section: "outlet",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export type { HotelBuilding, HotelFloor, HotelWing, PmsOutlet, Set2Amenity, Set2Snapshot };
