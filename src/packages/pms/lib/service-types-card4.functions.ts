import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import {
  DEFAULT_SERVICE_CATEGORIES,
  type ServiceCategoryRecord,
} from "./service-categories-card4.server";
import {
  DEFAULT_SERVICE_TYPES,
  normalizeServiceTypeCode,
  normalizeServiceTypeName,
  validateServiceTypeDraft,
  type ServiceTypeRecord,
  type ServiceTypeSnapshot,
} from "./service-types-card4.server";

// Generated schema predates 0084.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    categoryId: idSchema,
    name: z.string().max(80),
    code: z.string().max(20),
    description: z.string().max(400).optional().default(""),
    active: z.boolean(),
    displayOrder: z.number().int().min(1).max(999),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error("Service types are unavailable until their approved migration is applied.");
  }
  throw new Error(error?.message ?? "Unable to load service types.");
}

function mapCategory(row: {
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

function mapType(row: {
  id: string;
  category_id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}): ServiceTypeRecord {
  return {
    id: row.id,
    categoryId: row.category_id,
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
    metadata: { section: "card4-service-types", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-service-types] audit", result.error.message);
}

async function seedCategories(db: DbClient, restaurantId: string, userId: string) {
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

async function seedTypes(
  db: DbClient,
  restaurantId: string,
  userId: string,
  categories: Array<{ id: string; code: string }>,
) {
  const byCode = new Map(categories.map((row) => [row.code, row.id]));
  const orderByCategory = new Map<string, number>();
  const payload = DEFAULT_SERVICE_TYPES.flatMap((row) => {
    const categoryId = byCode.get(row.categoryCode);
    if (!categoryId) return [];
    const displayOrder = (orderByCategory.get(row.categoryCode) ?? 0) + 1;
    orderByCategory.set(row.categoryCode, displayOrder);
    return [
      {
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: row.name,
        code: row.code,
        description: row.description,
        active: true,
        display_order: displayOrder,
        updated_by: userId,
      },
    ];
  });
  if (payload.length === 0) return;
  const result = await db.from("pms_guest_service_types").insert(payload);
  if (result.error && result.error.code !== "23505") unavailable(result.error);
}

async function loadCategories(db: DbClient, restaurantId: string) {
  return db
    .from("pms_guest_service_categories")
    .select("id, name, code, description, active, display_order, created_at, updated_at")
    .eq("restaurant_id", restaurantId)
    .order("display_order")
    .order("name");
}

async function loadTypes(db: DbClient, restaurantId: string) {
  return db
    .from("pms_guest_service_types")
    .select(
      "id, category_id, name, code, description, active, display_order, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("display_order")
    .order("name");
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
  userId: string,
): Promise<ServiceTypeSnapshot> {
  let categoriesRes = await loadCategories(db, restaurantId);
  if (categoriesRes.error) unavailable(categoriesRes.error);
  if ((categoriesRes.data ?? []).length === 0) {
    await seedCategories(db, restaurantId, userId);
    categoriesRes = await loadCategories(db, restaurantId);
    if (categoriesRes.error) unavailable(categoriesRes.error);
    if ((categoriesRes.data ?? []).length === 0) {
      throw new Error("Could not seed default service categories.");
    }
  }

  let typesRes = await loadTypes(db, restaurantId);
  if (typesRes.error) unavailable(typesRes.error);
  if ((typesRes.data ?? []).length === 0) {
    await seedTypes(
      db,
      restaurantId,
      userId,
      (categoriesRes.data ?? []).map((row: { id: string; code: string }) => ({
        id: row.id,
        code: row.code,
      })),
    );
    typesRes = await loadTypes(db, restaurantId);
    if (typesRes.error) unavailable(typesRes.error);
  }

  const categories = (categoriesRes.data ?? []).map(mapCategory);
  const types = (typesRes.data ?? []).map(mapType);
  const lastUpdatedAt = [...categories, ...types].reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return { categories, types, lastUpdatedAt };
}

export const getPmsCard4ServiceTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId, context.userId);
  });

export const savePmsCard4ServiceType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const name = normalizeServiceTypeName(data.name);
    const code = normalizeServiceTypeCode(data.code);
    const errors = validateServiceTypeDraft(
      {
        id: data.id ?? null,
        categoryId: data.categoryId,
        name,
        code,
        description: data.description,
        active: data.active,
        displayOrder: data.displayOrder,
      },
      snapshot.types,
      snapshot.categories,
    );
    if (errors.length > 0)
      throw new Error(errors[0]?.message ?? "Fix the service type before saving.");
    const payload = {
      restaurant_id: data.restaurantId,
      category_id: data.categoryId,
      name,
      code,
      description: data.description.trim() || null,
      active: data.active,
      display_order: data.displayOrder,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_guest_service_types")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_guest_service_types").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      const message = `${result.error.message ?? ""} ${result.error.details ?? ""}`;
      if (/name_per_category/i.test(message)) {
        throw new Error("A service type with this name already exists in this category.");
      }
      throw new Error("This service type code is already in use.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save the service type.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_type_saved", {
      id,
      code,
    });
    return { ok: true as const, id };
  });

export const setPmsCard4ServiceTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_service_types")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_type_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });

export const deletePmsCard4ServiceType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const pricing = await db
      .from("pms_guest_service_pricing")
      .select("id", { count: "exact", head: true })
      .eq("service_type_id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (pricing.error && pricing.error.code !== "42P01") unavailable(pricing.error);
    if ((pricing.count ?? 0) > 0) {
      throw new Error("This service type cannot be deleted because pricing is configured.");
    }
    const assignments = await db
      .from("pms_guest_service_department_assignments")
      .select("id", { count: "exact", head: true })
      .eq("service_type_id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (assignments.error && assignments.error.code !== "42P01") unavailable(assignments.error);
    if ((assignments.count ?? 0) > 0) {
      throw new Error("This service type cannot be deleted because a department is assigned.");
    }
    const slaRules = await db
      .from("pms_guest_service_sla_rules")
      .select("id", { count: "exact", head: true })
      .eq("service_type_id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (slaRules.error && slaRules.error.code !== "42P01") unavailable(slaRules.error);
    if ((slaRules.count ?? 0) > 0) {
      throw new Error("This service type cannot be deleted because an SLA rule is configured.");
    }
    const availability = await db
      .from("pms_guest_service_availability")
      .select("id", { count: "exact", head: true })
      .eq("service_type_id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (availability.error && availability.error.code !== "42P01") {
      unavailable(availability.error);
    }
    if ((availability.count ?? 0) > 0) {
      throw new Error("This service type cannot be deleted because availability is configured.");
    }
    const result = await db
      .from("pms_guest_service_types")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error?.code === "23503") {
      throw new Error(
        "This service type cannot be deleted because pricing, a department assignment, an SLA rule, or availability is configured.",
      );
    }
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_type_deleted", {
      id: data.id,
    });
    return { ok: true as const };
  });
