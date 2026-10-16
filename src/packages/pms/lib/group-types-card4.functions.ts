import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { GROUP_WORKSPACE_UNAVAILABLE } from "./guest-group-detail-workspace";
import { loadGroupTypes, type GroupTypeRow } from "./guest-group-types";
import {
  normalizeGroupTypeCode,
  normalizeGroupTypeName,
  validateGroupTypeDraft,
  type GroupTypeRecord,
} from "./group-types-card4.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: z.string().max(12),
    name: z.string().max(120),
    description: z.string().max(400).optional().default(""),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(999),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error && isMissingSchemaError(error)) throw new Error(GROUP_WORKSPACE_UNAVAILABLE);
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error(GROUP_WORKSPACE_UNAVAILABLE);
  }
  throw new Error(error?.message ?? "Group types are unavailable.");
}

function toRecord(row: GroupTypeRow): GroupTypeRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

async function writeAudit(
  db: DbClient,
  restaurantId: string,
  userId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action,
    metadata: { section: "card4-group-types", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-group-types] audit", result.error.message);
}

export type GroupTypeSnapshot = {
  types: GroupTypeRecord[];
  lastUpdatedAt: string | null;
};

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<GroupTypeSnapshot> {
  const types = (await loadGroupTypes(restaurantId, db)).map(toRecord);
  return {
    types,
    lastUpdatedAt: types.length > 0 ? new Date().toISOString() : null,
  };
}

export const getPmsCard4GroupTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4GroupType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const name = normalizeGroupTypeName(data.name);
    const code = normalizeGroupTypeCode(data.code);
    const errors = validateGroupTypeDraft(
      {
        id: data.id ?? null,
        name,
        code,
        description: data.description,
        active: data.active,
        sortOrder: data.sortOrder,
      },
      snapshot.types,
    );
    if (errors.length > 0) throw new Error(errors[0]?.message ?? "Fix the group type before saving.");

    const payload = {
      restaurant_id: data.restaurantId,
      code,
      name,
      description: data.description.trim(),
      active: data.active,
      sort_order: data.sortOrder,
    };

    let id = data.id;
    if (data.id) {
      const result = await db
        .from("pms_group_types")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .select("id")
        .maybeSingle();
      if (result.error?.code === "23505") throw new Error("A group type with this name or code already exists.");
      if (result.error) unavailable(result.error);
      id = result.data?.id;
    } else {
      const result = await db
        .from("pms_group_types")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (result.error?.code === "23505") throw new Error("A group type with this name or code already exists.");
      if (result.error) unavailable(result.error);
      id = result.data?.id;
    }
    if (!id) throw new Error("Could not save the group type.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_group_type_saved", { id, code });
    const next = await loadSnapshot(db, data.restaurantId);
    return {
      ok: true as const,
      type: next.types.find((row) => row.id === id) ?? null,
      snapshot: next,
    };
  });

export const setPmsCard4GroupTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("pms_group_types")
      .update({ active: data.active })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    if (!result.data) throw new Error("That group type no longer exists.");
    await writeAudit(supabaseAdmin, data.restaurantId, context.userId, "pms_card4_group_type_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });

export const deletePmsCard4GroupType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("pms_group_types")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(supabaseAdmin, data.restaurantId, context.userId, "pms_card4_group_type_deleted", {
      id: data.id,
    });
    return { ok: true as const };
  });
