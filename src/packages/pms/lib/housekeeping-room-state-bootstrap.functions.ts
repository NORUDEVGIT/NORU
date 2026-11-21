/**
 * Persists first Go-Live housekeeping room-state bootstrap and the explicit
 * already-live legacy seed-dirty repair. Housekeeping owns cleanliness;
 * Activation only triggers first-live bootstrap once.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { requirePmsSetupActor } from "./pms-permissions.server";
import {
  HK_ROOM_STATE_BOOTSTRAP_AUDIT,
  HK_ROOM_STATE_REPAIR_AUDIT,
  planFirstLiveHousekeepingBootstrap,
  planLegacySeedDirtyHousekeepingRepair,
  type HkRoomBootstrapPlan,
} from "./housekeeping-room-state-bootstrap.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

export type FirstLiveHkBootstrapResult = HkRoomBootstrapPlan & {
  updatedCount: number;
  auditWritten: boolean;
};

export type LegacySeedDirtyRepairPreview = ReturnType<typeof planLegacySeedDirtyHousekeepingRepair> & {
  restaurantId: string;
  propertyName: string;
  propertyIsLive: boolean;
  configuredDefault: string | null;
  totalRooms: number;
  dirtyRoomCount: number;
};

export type LegacySeedDirtyRepairResult = LegacySeedDirtyRepairPreview & {
  dryRun: boolean;
  updatedCount: number;
  updatedRoomIds: string[];
  auditWritten: boolean;
};

async function loadHousekeepingBootstrapContext(db: DbClient, restaurantId: string) {
  const [propertyRes, settingsRes, roomsRes, historyRes, tasksRes] = await Promise.all([
    db.from("restaurants").select("id, name, pms_set1_live").eq("id", restaurantId).maybeSingle(),
    db
      .from("pms_housekeeping_settings")
      .select("default_housekeeping_status")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    db
      .from("hotel_rooms")
      .select("id, status, housekeeping_status, active")
      .eq("restaurant_id", restaurantId),
    db.from("housekeeping_history").select("room_id").eq("restaurant_id", restaurantId),
    db.from("housekeeping_tasks").select("room_id").eq("restaurant_id", restaurantId),
  ]);

  if (propertyRes.error) throw new Error(propertyRes.error.message);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (roomsRes.error) throw new Error(roomsRes.error.message);
  if (historyRes.error) throw new Error(historyRes.error.message);
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (!propertyRes.data) throw new Error("Property not found.");

  const rooms = (
    (roomsRes.data ?? []) as Array<{
      id: string;
      status: string;
      housekeeping_status: string | null;
      active: boolean;
    }>
  ).map((row) => ({
    id: row.id,
    status: String(row.status ?? ""),
    housekeepingStatus: row.housekeeping_status,
    active: row.active !== false,
  }));

  return {
    property: {
      id: String(propertyRes.data.id),
      name: String(propertyRes.data.name ?? "Property"),
      isLive: propertyRes.data.pms_set1_live === true,
    },
    configuredDefault: (settingsRes.data?.default_housekeeping_status as string | null) ?? null,
    rooms,
    roomIdsWithHistory: new Set(
      ((historyRes.data ?? []) as Array<{ room_id: string | null }>)
        .map((row) => row.room_id)
        .filter((id): id is string => Boolean(id)),
    ),
    roomIdsWithTasks: new Set(
      ((tasksRes.data ?? []) as Array<{ room_id: string | null }>)
        .map((row) => row.room_id)
        .filter((id): id is string => Boolean(id)),
    ),
  };
}

async function writeBootstrapAudit(
  db: DbClient,
  input: {
    restaurantId: string;
    actorUserId: string;
    plan: HkRoomBootstrapPlan;
    updatedCount: number;
  },
): Promise<boolean> {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: input.restaurantId,
    actor_user_id: input.actorUserId,
    action: HK_ROOM_STATE_BOOTSTRAP_AUDIT,
    metadata: {
      section: "housekeeping-room-state",
      targetStatus: input.plan.targetStatus,
      eligibleCount: input.plan.eligibleRoomIds.length,
      updatedCount: input.updatedCount,
      skippedExistingOperational: input.plan.skippedExistingOperational,
      skippedRestricted: input.plan.skippedRestricted,
      skippedInactive: input.plan.skippedInactive,
      skippedByReason: input.plan.skippedByReason,
    } as unknown as Json,
  });
  if (result.error) {
    console.error("[hk-room-state-bootstrap] audit", result.error.message);
    return false;
  }
  return true;
}

async function writeRepairAudit(
  db: DbClient,
  input: {
    restaurantId: string;
    actorUserId: string | null;
    plan: HkRoomBootstrapPlan;
    updatedCount: number;
    dryRun: boolean;
  },
): Promise<boolean> {
  if (input.dryRun || input.updatedCount === 0) return false;
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: input.restaurantId,
    actor_user_id: input.actorUserId,
    action: HK_ROOM_STATE_REPAIR_AUDIT,
    metadata: {
      section: "housekeeping-room-state",
      reason: "legacy seed/default repair",
      previousState: "dirty",
      newState: "clean",
      property: input.restaurantId,
      roomCount: input.updatedCount,
      eligibleCount: input.plan.eligibleRoomIds.length,
      skippedByReason: input.plan.skippedByReason,
    } as unknown as Json,
  });
  if (result.error) {
    console.error("[hk-room-state-repair] audit", result.error.message);
    return false;
  }
  return true;
}

/**
 * Idempotent first-live bootstrap. Safe to call only on pms_set1_live false→true.
 * Does not create tasks, attendants, or inspection history.
 */
export async function bootstrapHousekeepingRoomStateOnFirstLive(
  db: DbClient,
  restaurantId: string,
  actorUserId: string,
): Promise<FirstLiveHkBootstrapResult> {
  const ctx = await loadHousekeepingBootstrapContext(db, restaurantId);
  const plan = planFirstLiveHousekeepingBootstrap({
    configuredDefault: ctx.configuredDefault,
    rooms: ctx.rooms,
    roomIdsWithHistory: ctx.roomIdsWithHistory,
    roomIdsWithTasks: ctx.roomIdsWithTasks,
  });

  let updatedCount = 0;
  if (plan.eligibleRoomIds.length > 0) {
    const updateRes = await db
      .from("hotel_rooms")
      .update({ housekeeping_status: plan.targetStatus })
      .eq("restaurant_id", restaurantId)
      .in("id", plan.eligibleRoomIds)
      .eq("status", "available")
      .eq("active", true);
    if (updateRes.error) throw new Error(updateRes.error.message);
    updatedCount = plan.eligibleRoomIds.length;
  }

  const auditWritten = await writeBootstrapAudit(db, {
    restaurantId,
    actorUserId,
    plan,
    updatedCount,
  });

  return { ...plan, updatedCount, auditWritten };
}

export async function previewLegacySeedDirtyHousekeepingRepair(
  db: DbClient,
  restaurantId: string,
): Promise<LegacySeedDirtyRepairPreview> {
  const ctx = await loadHousekeepingBootstrapContext(db, restaurantId);
  const plan = planLegacySeedDirtyHousekeepingRepair({
    propertyIsLive: ctx.property.isLive,
    configuredDefault: ctx.configuredDefault,
    rooms: ctx.rooms,
    roomIdsWithHistory: ctx.roomIdsWithHistory,
    roomIdsWithTasks: ctx.roomIdsWithTasks,
  });
  return {
    restaurantId,
    propertyName: ctx.property.name,
    propertyIsLive: ctx.property.isLive,
    configuredDefault: ctx.configuredDefault,
    totalRooms: ctx.rooms.length,
    dirtyRoomCount: ctx.rooms.filter((row) => row.housekeepingStatus === "dirty").length,
    ...plan,
  };
}

/**
 * Explicit already-live repair. Never auto-runs on page load.
 * dryRun=true returns preview only; dryRun=false updates eligible rows only.
 */
export async function repairLegacySeedDirtyHousekeepingRoomState(
  db: DbClient,
  restaurantId: string,
  actorUserId: string | null,
  dryRun: boolean,
): Promise<LegacySeedDirtyRepairResult> {
  const preview = await previewLegacySeedDirtyHousekeepingRepair(db, restaurantId);
  if (dryRun || preview.eligibleRoomIds.length === 0 || preview.blockedReason) {
    return {
      ...preview,
      dryRun,
      updatedCount: 0,
      updatedRoomIds: [],
      auditWritten: false,
    };
  }

  const updateRes = await db
    .from("hotel_rooms")
    .update({ housekeeping_status: "clean" })
    .eq("restaurant_id", restaurantId)
    .in("id", preview.eligibleRoomIds)
    .eq("status", "available")
    .eq("active", true)
    .eq("housekeeping_status", "dirty");
  if (updateRes.error) throw new Error(updateRes.error.message);

  const updatedRoomIds = [...preview.eligibleRoomIds];
  const updatedCount = updatedRoomIds.length;
  const auditWritten = await writeRepairAudit(db, {
    restaurantId,
    actorUserId,
    plan: preview,
    updatedCount,
    dryRun: false,
  });

  return {
    ...preview,
    dryRun: false,
    updatedCount,
    updatedRoomIds,
    auditWritten,
  };
}

const repairInput = z.object({
  restaurantId: z.string().uuid(),
  dryRun: z.boolean().default(true),
});

/** Explicit owner/admin repair action — never invoked by ordinary page loads. */
export const repairLegacySeedDirtyHousekeepingRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => repairInput.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requirePmsSetupActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.CONFIG_ROOMS_OPS_CONFIGURE,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return repairLegacySeedDirtyHousekeepingRoomState(
      supabaseAdmin,
      data.restaurantId,
      context.userId ?? me.id,
      data.dryRun,
    );
  });
