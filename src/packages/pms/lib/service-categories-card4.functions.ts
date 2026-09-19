import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import {
  DEFAULT_SERVICE_CATEGORIES,
  normalizeServiceCategoryCode,
  normalizeServiceCategoryName,
  validateServiceCategoryDraft,
  type ServiceCategoryRecord,
  type ServiceCategorySnapshot,
} from "./service-categories-card4.server";

// Generated schema predates 0083.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    name: z.string().max(80),
    code: z.string().max(20),
    description: z.string().max(400).optional().default(""),
    active: z.boolean(),
    displayOrder: z.number().int().min(1).max(999),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error(
      "Service categories are unavailable until their approved migration is applied.",
    );
  }
  throw new Error(error?.message ?? "Unable to load service categories.");
}

function mapRow(row: {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}): ServiceCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    active: row.active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    metadata: { section: "card4-service-categories", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-service-categories] audit", result.error.message);
}

async function seedDefaults(db: DbClient, restaurantId: string, userId: string) {
  const payload = DEFAULT_SERVICE_CATEGORIES.map((row, index) => ({
    restaurant_id: restaurantId,
    name: row.name,
    code: row.code,
    description: row.description,
    active: true,
    display_order: index + 1,
    updated_by: userId,
  }));
  const result = await db.from("pms_guest_service_categories").insert(payload);
  if (result.error && result.error.code !== "23505") unavailable(result.error);
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
  userId: string,
  seeded = false,
): Promise<ServiceCategorySnapshot> {
  const result = await db
    .from("pms_guest_service_categories")
    .select("id, name, code, description, active, display_order, created_at, updated_at")
    .eq("restaurant_id", restaurantId)
    .order("display_order")
    .order("name");
  if (result.error) unavailable(result.error);
  if ((result.data ?? []).length === 0) {
    if (seeded) throw new Error("Could not seed default service categories.");
    await seedDefaults(db, restaurantId, userId);
    return loadSnapshot(db, restaurantId, userId, true);
  }
  const categories = (result.data ?? []).map(mapRow);
  const lastUpdatedAt = categories.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return { categories, lastUpdatedAt };
}

export const getPmsCard4ServiceCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId, context.userId);
  });

export const savePmsCard4ServiceCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const name = normalizeServiceCategoryName(data.name);
    const code = normalizeServiceCategoryCode(data.code);
    const errors = validateServiceCategoryDraft(
      {
        id: data.id ?? null,
        name,
        code,
        description: data.description,
        active: data.active,
        displayOrder: data.displayOrder,
      },
      snapshot.categories,
    );
    if (errors.length > 0) throw new Error(errors[0]?.message ?? "Fix the category before saving.");
    const payload = {
      restaurant_id: data.restaurantId,
      name,
      code,
      description: data.description.trim() || null,
      active: data.active,
      display_order: data.displayOrder,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_guest_service_categories")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_guest_service_categories").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      throw new Error("This category code is already in use.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save the service category.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_category_saved", {
      id,
      code,
    });
    return { ok: true as const, id };
  });

export const setPmsCard4ServiceCategoryActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_service_categories")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_category_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });

export const deletePmsCard4ServiceCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    // Phase 2 will block deletion when pms_guest_service_types.category_id references this row.
    const result = await db
      .from("pms_guest_service_categories")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_category_deleted", {
      id: data.id,
    });
    return { ok: true as const };
  });
