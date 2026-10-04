import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  CARD2_RATES_AUDIT_SECTION,
  CARD2_RATES_UNAVAILABLE,
  RATE_REFUNDABILITY_KINDS,
  evaluateRatesCard2Readiness,
  findMatchingPredefinedCategory,
  type Card2MealPlanRef,
  type Card2RoomTypeRef,
  type RateCancellationPolicyRow,
  type RateCategoryRow,
  type RatePlanRow,
  type RateRefundabilityKind,
  type RateRefundabilityRow,
  type RatesCard2Snapshot,
} from "./rates-card2.server";

type DbClient = any;

const idSchema = z.string().uuid();
const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.")
  .optional()
  .nullable();

const setupCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => /^[A-Z0-9_]{1,30}$/.test(value),
    "Use 1–30 letters, numbers, or underscores.",
  );

const categorySchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
  isCustom: z.boolean().optional(),
});

const planSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  categoryId: idSchema,
  roomTypeId: idSchema,
  code: setupCode,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  baseRate: z.number().min(0).max(10_000_000),
  validFrom: dateSchema,
  validTo: dateSchema,
  mealPlanId: idSchema.nullable().optional(),
  cancellationPolicyId: idSchema.nullable().optional(),
  refundabilityId: idSchema.nullable().optional(),
  active: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validTo"],
      message: "Valid until cannot be before valid from.",
    });
  }
});

const cancellationSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  active: z.boolean(),
});

const refundabilitySchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  kind: z.enum(RATE_REFUNDABILITY_KINDS),
  active: z.boolean(),
});

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    throw new Error(CARD2_RATES_UNAVAILABLE);
  }
  throw new Error(error?.message ?? CARD2_RATES_UNAVAILABLE);
}

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
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
    metadata: { section: CARD2_RATES_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card2-rates] audit", result.error.message);
}

function mapRoomType(row: any): Card2RoomTypeRef {
  return {
    id: row.id,
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    active: row.active !== false,
  };
}

function mapCategory(row: any): RateCategoryRow {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    active: row.active !== false,
  };
}

export async function loadRatesCard2Snapshot(
  db: DbClient,
  restaurantId: string,
): Promise<RatesCard2Snapshot> {
  const basePlanSelect =
    "id, code, name, description, rate_category_id, room_type_id, currency, base_rate, valid_from, valid_to, active";
  const compositionPlanSelect = `${basePlanSelect}, meal_plan_id, cancellation_policy_id, refundability_id`;

  const [types, categories, meals, cancellations, refundability, composedPlans] = await Promise.all([
    db
      .from("room_types")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("hotel_rate_categories")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_meal_plans")
      .select("id, code, name, includes_breakfast, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_rate_cancellation_policies")
      .select("id, code, name, description, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_rate_refundability_codes")
      .select("id, code, name, description, kind, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("hotel_rate_plans")
      .select(compositionPlanSelect)
      .eq("restaurant_id", restaurantId)
      .order("code"),
  ]);

  for (const result of [types, categories]) {
    if (result.error) unavailable(result.error);
  }

  const mealPlans: Card2MealPlanRef[] = meals.error
    ? []
    : (meals.data ?? []).map((row: any) => ({
        id: row.id,
        code: String(row.code ?? "").toUpperCase(),
        name: String(row.name ?? ""),
        includesBreakfast: row.includes_breakfast === true,
        active: row.active !== false,
      }));

  const cancellationPolicies: RateCancellationPolicyRow[] = cancellations.error
    ? []
    : (cancellations.data ?? []).map((row: any) => ({
        id: row.id,
        code: String(row.code ?? "").toUpperCase(),
        name: String(row.name ?? ""),
        description: String(row.description ?? ""),
        active: row.active !== false,
      }));

  const refundabilityCodes: RateRefundabilityRow[] = refundability.error
    ? []
    : (refundability.data ?? []).map((row: any) => {
        const kind = String(row.kind ?? "refundable");
        return {
          id: row.id,
          code: String(row.code ?? "").toUpperCase(),
          name: String(row.name ?? ""),
          description: String(row.description ?? ""),
          kind: (RATE_REFUNDABILITY_KINDS as readonly string[]).includes(kind)
            ? (kind as RateRefundabilityKind)
            : "refundable",
          active: row.active !== false,
        };
      });

  let planData = composedPlans.data;
  if (composedPlans.error) {
    const code = composedPlans.error.code;
    if (code === "42703" || code === "PGRST204") {
      const fallback = await db
        .from("hotel_rate_plans")
        .select(basePlanSelect)
        .eq("restaurant_id", restaurantId)
        .order("code");
      if (fallback.error) unavailable(fallback.error);
      planData = fallback.data;
    } else {
      unavailable(composedPlans.error);
    }
  }

  const roomTypes = (types.data ?? []).map(mapRoomType);
  const categoryRows = (categories.data ?? []).map(mapCategory);
  const typeById = new Map(roomTypes.map((row) => [row.id, row]));
  const categoryById = new Map(categoryRows.map((row) => [row.id, row]));
  const mealById = new Map(mealPlans.map((row) => [row.id, row]));
  const cancelById = new Map(cancellationPolicies.map((row) => [row.id, row]));
  const refundById = new Map(refundabilityCodes.map((row) => [row.id, row]));

  const planRows: RatePlanRow[] = (planData ?? []).map((row: any) => {
    const type = typeById.get(row.room_type_id);
    const category = categoryById.get(row.rate_category_id);
    const meal = row.meal_plan_id ? mealById.get(row.meal_plan_id) : undefined;
    const cancel = row.cancellation_policy_id
      ? cancelById.get(row.cancellation_policy_id)
      : undefined;
    const refund = row.refundability_id ? refundById.get(row.refundability_id) : undefined;
    return {
      id: row.id,
      code: String(row.code ?? "").toUpperCase(),
      name: String(row.name ?? ""),
      description: String(row.description ?? ""),
      categoryId: row.rate_category_id,
      categoryName: category?.name ?? "",
      roomTypeId: row.room_type_id,
      roomTypeCode: type?.code ?? "",
      roomTypeName: type?.name ?? "",
      currency: String(row.currency ?? ""),
      baseRate: Number(row.base_rate ?? 0),
      validFrom: row.valid_from ? String(row.valid_from) : null,
      validTo: row.valid_to ? String(row.valid_to) : null,
      mealPlanId: row.meal_plan_id ?? null,
      mealPlanName: meal?.name ?? "",
      breakfastIncluded: meal?.includesBreakfast === true,
      cancellationPolicyId: row.cancellation_policy_id ?? null,
      cancellationName: cancel?.name ?? "",
      refundabilityId: row.refundability_id ?? null,
      refundabilityName: refund?.name ?? "",
      refundabilityKind: refund?.kind ?? null,
      active: row.active !== false,
    };
  });

  return {
    roomTypes,
    categories: categoryRows,
    mealPlans,
    cancellationPolicies,
    refundabilityCodes,
    plans: planRows,
  };
}

async function loadAudit(db: DbClient, restaurantId: string) {
  const result = await db
    .from("restaurant_staff_audit_log")
    .select("id, action, created_at, metadata")
    .eq("restaurant_id", restaurantId)
    .contains("metadata", { section: CARD2_RATES_AUDIT_SECTION })
    .order("created_at", { ascending: false })
    .limit(20);
  if (result.error) return [];
  return (result.data ?? []).map((row: any) => ({
    id: row.id,
    action: String(row.action ?? ""),
    createdAt: String(row.created_at ?? ""),
    detail: typeof row.metadata?.detail === "string" ? row.metadata.detail : null,
  }));
}

export const getRatesCard2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const snapshot = await loadRatesCard2Snapshot(db, data.restaurantId);
    return {
      snapshot,
      readiness: evaluateRatesCard2Readiness(snapshot),
      audit: await loadAudit(db, data.restaurantId),
    };
  });

export const saveRateCategoryCard2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categorySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);

    if (data.isCustom) {
      const match = findMatchingPredefinedCategory(data.name, data.code);
      if (match) {
        throw new Error(
          `${match.name} is already available in the predefined Rate Categories. Select it from the predefined list.`,
        );
      }
    }

    const existingRes = await db
      .from("hotel_rate_categories")
      .select("id, code, name")
      .eq("restaurant_id", data.restaurantId);

    if (!existingRes.error && existingRes.data) {
      const existing = existingRes.data as Array<{ id: string; code: string; name: string }>;
      for (const row of existing) {
        if (data.id && row.id === data.id) continue;
        if (row.code.toUpperCase().trim() === data.code.toUpperCase().trim()) {
          throw new Error(`A rate category with code "${data.code}" already exists.`);
        }
        if (row.name.trim().toLowerCase() === data.name.trim().toLowerCase()) {
          throw new Error(`A rate category with name "${data.name}" already exists.`);
        }
      }
    }

    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      active: data.active,
    };
    if (data.id) {
      const updated = await db
        .from("hotel_rate_categories")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db.from("hotel_rate_categories").insert(payload);
      if (inserted.error) unavailable(inserted.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card2_rate_category_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadRatesCard2Snapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard2Readiness(snapshot) };
  });

export const saveRatePlanCard2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const lookups = await Promise.all([
      db
        .from("hotel_rate_categories")
        .select("id")
        .eq("id", data.categoryId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle(),
      db
        .from("room_types")
        .select("id")
        .eq("id", data.roomTypeId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle(),
      db.from("restaurants").select("currency_code").eq("id", data.restaurantId).maybeSingle(),
      data.mealPlanId
        ? db
            .from("pms_meal_plans")
            .select("id")
            .eq("id", data.mealPlanId)
            .eq("restaurant_id", data.restaurantId)
            .maybeSingle()
        : Promise.resolve({ data: { id: true }, error: null }),
      data.cancellationPolicyId
        ? db
            .from("pms_rate_cancellation_policies")
            .select("id")
            .eq("id", data.cancellationPolicyId)
            .eq("restaurant_id", data.restaurantId)
            .maybeSingle()
        : Promise.resolve({ data: { id: true }, error: null }),
      data.refundabilityId
        ? db
            .from("pms_rate_refundability_codes")
            .select("id")
            .eq("id", data.refundabilityId)
            .eq("restaurant_id", data.restaurantId)
            .maybeSingle()
        : Promise.resolve({ data: { id: true }, error: null }),
    ]);
    const [category, roomType, restaurant, meal, cancel, refund] = lookups;

    if (category.error) unavailable(category.error);
    if (roomType.error) unavailable(roomType.error);
    if (!category.data) throw new Error("That rate category doesn't belong to this property.");
    if (!roomType.data) throw new Error("That room type doesn't belong to this property.");
    if (data.mealPlanId && (meal.error || !meal.data)) {
      throw new Error("That meal plan doesn't belong to this property.");
    }
    if (data.cancellationPolicyId && (cancel.error || !cancel.data)) {
      throw new Error("That cancellation policy doesn't belong to this property.");
    }
    if (data.refundabilityId && (refund.error || !refund.data)) {
      throw new Error("That refundability code doesn't belong to this property.");
    }

    const payload = {
      restaurant_id: data.restaurantId,
      rate_category_id: data.categoryId,
      room_type_id: data.roomTypeId,
      code: data.code,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      currency: String(restaurant.data?.currency_code ?? "USD"),
      base_rate: data.baseRate,
      valid_from: data.validFrom || null,
      valid_to: data.validTo || null,
      meal_plan_id: data.mealPlanId || null,
      cancellation_policy_id: data.cancellationPolicyId || null,
      refundability_id: data.refundabilityId || null,
      active: data.active,
    };

    if (data.id) {
      const updated = await db
        .from("hotel_rate_plans")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error && (updated.error.code === "42703" || updated.error.code === "PGRST204")) {
        const {
          meal_plan_id: _meal,
          cancellation_policy_id: _cancel,
          refundability_id: _refund,
          ...basePayload
        } = payload;
        const retry = await db
          .from("hotel_rate_plans")
          .update(basePayload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId);
        if (retry.error) unavailable(retry.error);
      } else if (updated.error) {
        unavailable(updated.error);
      }
    } else {
      const inserted = await db.from("hotel_rate_plans").insert(payload);
      if (inserted.error && (inserted.error.code === "42703" || inserted.error.code === "PGRST204")) {
        const {
          meal_plan_id: _meal,
          cancellation_policy_id: _cancel,
          refundability_id: _refund,
          ...basePayload
        } = payload;
        const retry = await db.from("hotel_rate_plans").insert(basePayload);
        if (retry.error) unavailable(retry.error);
      } else if (inserted.error) {
        unavailable(inserted.error);
      }
    }

    await writeAudit(db, data.restaurantId, context.userId, "card2_rate_plan_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadRatesCard2Snapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard2Readiness(snapshot) };
  });

export const saveRateCancellationPolicyCard2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancellationSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_rate_cancellation_policies")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_rate_cancellation_policies").insert(payload);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "card2_rate_cancellation_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadRatesCard2Snapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard2Readiness(snapshot) };
  });

export const saveRateRefundabilityCard2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => refundabilitySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      kind: data.kind,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_rate_refundability_codes")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_rate_refundability_codes").insert(payload);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "card2_rate_refundability_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadRatesCard2Snapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard2Readiness(snapshot) };
  });
