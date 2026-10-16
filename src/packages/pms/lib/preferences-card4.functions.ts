import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import {
  DEFAULT_PREFERENCE_CATEGORIES,
  DEFAULT_PREFERENCE_TYPES,
  enrichPreferenceTypesWithOptions,
  isPreferenceValueType,
  normalizePreferenceCode,
  normalizePreferenceName,
  normalizePreferenceOptions,
  preferenceFlagsForActiveChange,
  validatePreferenceCategoryDraft,
  validatePreferenceTypeDraft,
  type PreferenceCategoryRecord,
  type PreferenceOption,
  type PreferenceSnapshot,
  type PreferenceTypeRecord,
  type PreferenceValueType,
} from "./preferences-card4.server";

// Generated schema predates 0081.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();

const optionSchema = z
  .object({
    id: z.string().max(80),
    label: z.string().max(80),
    value: z.string().max(80),
    active: z.boolean(),
    displayOrder: z.number().int().min(0).max(999),
  })
  .strict();

const categorySaveSchema = z
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

const typeSaveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    categoryId: idSchema,
    name: z.string().max(80),
    code: z.string().max(32),
    valueType: z.enum(["single", "multi", "yes_no", "text", "number"]),
    options: z.array(optionSchema).max(80),
    required: z.boolean(),
    active: z.boolean(),
    displayOrder: z.number().int().min(1).max(999),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error("Preferences are unavailable until their approved migration is applied.");
  }
  throw new Error(error?.message ?? "Preferences are unavailable.");
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
}): PreferenceCategoryRecord {
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
  value_type: string;
  options: unknown;
  required: boolean;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}): PreferenceTypeRecord {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    code: row.code,
    valueType: isPreferenceValueType(row.value_type) ? row.value_type : "single",
    options: normalizePreferenceOptions(row.options),
    required: row.required,
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
    metadata: { section: "card4-preferences", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-preferences] audit", result.error.message);
}

function seedOptionRows(options: Array<{ label: string; value: string }>): PreferenceOption[] {
  return options.map((row, index) => ({
    id: `seed-${row.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: row.label,
    value: row.value,
    active: true,
    displayOrder: index,
  }));
}

async function seedDefaults(db: DbClient, restaurantId: string, userId: string) {
  const categoryPayload = DEFAULT_PREFERENCE_CATEGORIES.map((row, index) => ({
    restaurant_id: restaurantId,
    name: row.name,
    code: row.code,
    description: row.description,
    active: true,
    display_order: index + 1,
    updated_by: userId,
  }));
  const categoryResult = await db
    .from("pms_guest_preference_categories")
    .insert(categoryPayload)
    .select("id, code");
  if (categoryResult.error && categoryResult.error.code !== "23505") {
    unavailable(categoryResult.error);
  }
  const categories = (categoryResult.data ?? []) as Array<{ id: string; code: string }>;
  const byCode = new Map(categories.map((row) => [row.code, row.id]));

  const [roomTypesRes, mealPlansRes] = await Promise.all([
    db
      .from("room_types")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_meal_plans")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("hotel_rate_plans")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
  ]);

  const orderByCategory = new Map<string, number>();
  const typePayload = DEFAULT_PREFERENCE_TYPES.flatMap((row) => {
    const categoryId = byCode.get(row.categoryCode);
    if (!categoryId) return [];
    const displayOrder = (orderByCategory.get(row.categoryCode) ?? 0) + 1;
    orderByCategory.set(row.categoryCode, displayOrder);

    let optionsToSeed = row.options;
    if (row.code === "ROOM_TYPE" && (roomTypesRes.data ?? []).length > 0) {
      optionsToSeed = (roomTypesRes.data as Array<{ id: string; name: string }>).map((rt) => ({
        label: rt.name,
        value: rt.id,
      }));
    } else if (row.code === "RATE_PLAN" && (ratePlansRes.data ?? []).length > 0) {
      optionsToSeed = (ratePlansRes.data as Array<{ id: string; name: string }>).map((rp) => ({
        label: rp.name,
        value: rp.id,
      }));
    } else if (row.code === "MEAL_PLAN" && (mealPlansRes.data ?? []).length > 0) {
      optionsToSeed = (mealPlansRes.data as Array<{ id: string; name: string }>).map((mp) => ({
        label: mp.name,
        value: mp.id,
      }));
    }

    return [
      {
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: row.name,
        code: row.code,
        value_type: row.valueType,
        options: seedOptionRows(optionsToSeed),
        required: row.required,
        active: true,
        display_order: displayOrder,
        updated_by: userId,
      },
    ];
  });
  if (typePayload.length === 0) return;
  const typeResult = await db.from("pms_guest_preference_types").insert(typePayload);
  if (typeResult.error && typeResult.error.code !== "23505") unavailable(typeResult.error);
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
  userId: string,
  seeded = false,
  seedMissing = true,
): Promise<PreferenceSnapshot> {
  const categoriesRes = await db
    .from("pms_guest_preference_categories")
    .select("id, name, code, description, active, display_order, created_at, updated_at")
    .eq("restaurant_id", restaurantId)
    .order("display_order")
    .order("name");
  if (categoriesRes.error) unavailable(categoriesRes.error);

  if ((categoriesRes.data ?? []).length === 0) {
    if (!seedMissing) return { categories: [], types: [], lastUpdatedAt: null };
    if (seeded) throw new Error("Could not seed default preference categories.");
    await seedDefaults(db, restaurantId, userId);
    return loadSnapshot(db, restaurantId, userId, true, seedMissing);
  }

  // Remove deprecated QUIET and CONNECT if present in database
  await db
    .from("pms_guest_preference_types")
    .delete()
    .eq("restaurant_id", restaurantId)
    .in("code", ["QUIET", "CONNECT"]);

  let typesRes = await db
    .from("pms_guest_preference_types")
    .select(
      "id, category_id, name, code, value_type, options, required, active, display_order, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("display_order")
    .order("name");
  if (typesRes.error) unavailable(typesRes.error);

  // Auto-provision ROOM_TYPE, RATE_PLAN, and MEAL_PLAN if missing for existing properties
  const existingCodes = new Set((typesRes.data ?? []).map((row: any) => String(row.code)));
  const missingDefs = DEFAULT_PREFERENCE_TYPES.filter(
    (def) => (def.code === "ROOM_TYPE" || def.code === "RATE_PLAN" || def.code === "MEAL_PLAN") && !existingCodes.has(def.code),
  );
  if (missingDefs.length > 0) {
    const catByCode = new Map(((categoriesRes.data ?? []) as any[]).map((c) => [c.code, c.id]));
    const [rtRes, mpRes, rpRes] = await Promise.all([
      db
        .from("room_types")
        .select("id, name, code, active")
        .eq("restaurant_id", restaurantId)
        .order("name"),
      db
        .from("pms_meal_plans")
        .select("id, name, code, active")
        .eq("restaurant_id", restaurantId)
        .order("name"),
      db
        .from("hotel_rate_plans")
        .select("id, name, code, active")
        .eq("restaurant_id", restaurantId)
        .order("name"),
    ]);
    const insertPayload: any[] = [];
    for (const def of missingDefs) {
      const catId = catByCode.get(def.categoryCode);
      if (!catId) continue;
      let opts = def.options;
      if (def.code === "ROOM_TYPE" && (rtRes.data ?? []).length > 0) {
        opts = (rtRes.data as Array<{ id: string; name: string }>).map((rt) => ({
          label: rt.name,
          value: rt.id,
        }));
      } else if (def.code === "RATE_PLAN" && (rpRes.data ?? []).length > 0) {
        opts = (rpRes.data as Array<{ id: string; name: string }>).map((rp) => ({
          label: rp.name,
          value: rp.id,
        }));
      } else if (def.code === "MEAL_PLAN" && (mpRes.data ?? []).length > 0) {
        opts = (mpRes.data as Array<{ id: string; name: string }>).map((mp) => ({
          label: mp.name,
          value: mp.id,
        }));
      }
      insertPayload.push({
        restaurant_id: restaurantId,
        category_id: catId,
        name: def.name,
        code: def.code,
        value_type: def.valueType,
        options: seedOptionRows(opts),
        required: def.required,
        active: true,
        display_order: def.code === "ROOM_TYPE" ? 1 : def.code === "RATE_PLAN" ? 2 : 3,
        updated_by: userId,
      });
    }
    if (insertPayload.length > 0) {
      await db.from("pms_guest_preference_types").insert(insertPayload);
      typesRes = await db
        .from("pms_guest_preference_types")
        .select(
          "id, category_id, name, code, value_type, options, required, active, display_order, created_at, updated_at",
        )
        .eq("restaurant_id", restaurantId)
        .order("display_order")
        .order("name");
    }
  }

  const [propRoomTypes, propMealPlans, propRatePlans] = await Promise.all([
    db
      .from("room_types")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_meal_plans")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("hotel_rate_plans")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
  ]);

  const categories = (categoriesRes.data ?? []).map(mapCategory);
  const rawTypes = (typesRes.data ?? []).map(mapType);
  const types = enrichPreferenceTypesWithOptions(
    rawTypes,
    propRoomTypes.data as any,
    propMealPlans.data as any,
    propRatePlans.data as any,
  );
  const timestamps = [
    ...categories.map((row) => row.updatedAt),
    ...types.map((row) => row.updatedAt),
  ];
  const lastUpdatedAt = timestamps.reduce<string | null>((latest, value) => {
    if (!latest || value > latest) return value;
    return latest;
  }, null);
  return { categories, types, lastUpdatedAt };
}

export { loadSnapshot as loadPreferencesCard4Snapshot };

export const getPmsCard4Preferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId, context.userId);
  });

export const savePmsCard4PreferenceCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categorySaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const draft = {
      id: data.id ?? null,
      name: data.name,
      code: data.code,
      description: data.description,
      active: data.active,
      displayOrder: data.displayOrder,
    };
    const errors = validatePreferenceCategoryDraft(draft, snapshot.categories);
    if (errors.length > 0) throw new Error(errors[0]?.message ?? "Invalid category.");
    const payload = {
      restaurant_id: data.restaurantId,
      name: normalizePreferenceName(data.name),
      code: normalizePreferenceCode(data.code),
      description: data.description.trim() || null,
      active: data.active,
      display_order: data.displayOrder,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_guest_preference_categories")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_guest_preference_categories").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      throw new Error("A category with this name or code already exists.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save the category.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_preference_category_saved", {
      id,
      code: payload.code,
    });
    return { ok: true as const, id };
  });

export const setPmsCard4PreferenceCategoryActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_preference_categories")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_preference_category_toggled",
      {
        id: data.id,
        active: data.active,
      },
    );
    return { ok: true as const };
  });

export const savePmsCard4PreferenceType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => typeSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const flags = preferenceFlagsForActiveChange(data.active, data.required);
    const options = data.options.filter((row) => row.label.trim() && row.value.trim());
    const draft = {
      id: data.id ?? null,
      categoryId: data.categoryId,
      name: data.name,
      code: data.code,
      valueType: data.valueType as PreferenceValueType,
      options,
      required: flags.required,
      active: flags.active,
      displayOrder: data.displayOrder,
    };
    const errors = validatePreferenceTypeDraft(
      draft,
      snapshot.types,
      snapshot.categories.map((row) => row.id),
    );
    if (errors.length > 0) throw new Error(errors[0]?.message ?? "Invalid preference type.");
    const payload = {
      restaurant_id: data.restaurantId,
      category_id: data.categoryId,
      name: normalizePreferenceName(data.name),
      code: normalizePreferenceCode(data.code),
      value_type: data.valueType,
      options,
      required: flags.required,
      active: flags.active,
      display_order: data.displayOrder,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_guest_preference_types")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_guest_preference_types").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      throw new Error("A preference type with this name or code already exists.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save the preference type.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_preference_type_saved", {
      id,
      code: payload.code,
    });
    return { ok: true as const, id };
  });

export const setPmsCard4PreferenceTypeFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
        required: z.boolean().optional(),
        active: z.boolean().optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const current = await db
      .from("pms_guest_preference_types")
      .select("required, active")
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (current.error) unavailable(current.error);
    if (!current.data) throw new Error("That preference type no longer exists.");
    const flags = preferenceFlagsForActiveChange(
      data.active ?? current.data.active,
      data.required ?? current.data.required,
    );
    const result = await db
      .from("pms_guest_preference_types")
      .update({
        active: flags.active,
        required: flags.required,
        updated_by: context.userId,
      })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    return { ok: true as const };
  });

export const reorderPmsCard4PreferenceTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, ids: z.array(idSchema).min(1).max(80) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    if (new Set(data.ids).size !== data.ids.length) {
      throw new Error("Preference order must be unique.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    for (const [index, id] of data.ids.entries()) {
      const result = await db
        .from("pms_guest_preference_types")
        .update({ display_order: index + 1, updated_by: context.userId })
        .eq("id", id)
        .eq("restaurant_id", data.restaurantId);
      if (result.error) unavailable(result.error);
    }
    return { ok: true as const };
  });

export const reorderPmsCard4PreferenceCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, ids: z.array(idSchema).min(1).max(40) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    if (new Set(data.ids).size !== data.ids.length) {
      throw new Error("Category order must be unique.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    for (const [index, id] of data.ids.entries()) {
      const result = await db
        .from("pms_guest_preference_categories")
        .update({ display_order: index + 1, updated_by: context.userId })
        .eq("id", id)
        .eq("restaurant_id", data.restaurantId);
      if (result.error) unavailable(result.error);
    }
    return { ok: true as const };
  });

export const deletePmsCard4PreferenceType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const referenced = await db
      .from("pms_guest_profile_types")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .contains("preference_type_ids", [data.id])
      .limit(1);
    if (referenced.error && referenced.error.code !== "42P01") unavailable(referenced.error);
    if ((referenced.data ?? []).length > 0) {
      throw new Error("This preference is used by a profile type. Disable it instead of deleting.");
    }
    const result = await db
      .from("pms_guest_preference_types")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_preference_type_deleted", {
      id: data.id,
    });
    return { ok: true as const };
  });
