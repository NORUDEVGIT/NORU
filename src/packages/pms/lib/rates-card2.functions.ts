import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  deadlineHoursFromWindow,
  parseCancellationPenaltyType,
  parseCancellationPolicyKind,
  parseCancellationWindowUnit,
  parseCutoffTime,
  penaltyNeedsValue,
  windowFromDeadlineHours,
} from "./cancellation-policy-rules";
import {
  CANCELLATION_PENALTY_TYPES,
  CANCELLATION_POLICY_KINDS,
  CANCELLATION_WINDOW_UNITS,
  CARD2_RATES_AUDIT_SECTION,
  CARD2_RATES_UNAVAILABLE,
  POLICY_PENALTY_TYPES,
  RATE_REFUNDABILITY_KINDS,
  evaluateRatesCard2Readiness,
  findMatchingPredefinedCategory,
  type Card2DepositPolicyRef,
  type Card2MealPlanRef,
  type Card2RoomTypeRef,
  type PolicyPenaltyType,
  type RateCancellationPolicyRow,
  type RateCategoryRow,
  type RateEarlyDeparturePolicyRow,
  type RateNoShowPolicyRow,
  type RatePlanRow,
  type RateRefundabilityKind,
  type RateRefundabilityRow,
  type RatesCard2Snapshot,
} from "./rates-card2.server";
import {
  EARLY_DEPARTURE_PENALTY_TYPES,
  resolvedEarlyDeparturePenaltyValue,
} from "./early-departure-policy";
import { foreignRatePlanPolicyMessage } from "./rate-plan-policy-link";
import { ratePlanOccupancyValidationError } from "./occupancy-allocation";

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

const planSchema = z
  .object({
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
    depositPolicyId: idSchema.nullable().optional(),
    noShowPolicyId: idSchema.nullable().optional(),
    earlyDeparturePolicyId: idSchema.nullable().optional(),
    includedOccupancy: z.number().int().min(1).max(20).nullable().optional(),
    extraAdultRate: z.number().min(0).max(10_000_000).nullable().optional(),
    extraChildRate: z.number().min(0).max(10_000_000).nullable().optional(),
    active: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validTo"],
        message: "Valid until cannot be before valid from.",
      });
    }
  });

const cancellationSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: setupCode,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    policyKind: z.enum(CANCELLATION_POLICY_KINDS),
    windowValue: z.number().int().min(0).max(24 * 365).nullable().optional(),
    windowUnit: z.enum(CANCELLATION_WINDOW_UNITS),
    cutoffTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm.")
      .nullable()
      .optional(),
    penaltyType: z.enum(CANCELLATION_PENALTY_TYPES),
    penaltyValue: z.number().min(0).max(10_000_000),
    active: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.policyKind !== "non_refundable" && value.windowValue == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["windowValue"],
        message: "Enter a cancellation window.",
      });
    }
    if (penaltyNeedsValue(value.penaltyType) && !(value.penaltyValue > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["penaltyValue"],
        message: "Enter a penalty value.",
      });
    }
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

const noShowPolicySchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  penaltyType: z.enum(POLICY_PENALTY_TYPES),
  penaltyValue: z.number().min(0).max(10_000_000),
  releaseHour: z.number().int().min(0).max(23),
  isDefault: z.boolean(),
  active: z.boolean(),
});

const earlyDeparturePolicySchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: setupCode,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    penaltyType: z.enum(EARLY_DEPARTURE_PENALTY_TYPES),
    penaltyValue: z.number().min(0).max(10_000_000),
    active: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const resolved = resolvedEarlyDeparturePenaltyValue(value.penaltyType, value.penaltyValue);
    if (!resolved.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["penaltyValue"],
        message: resolved.message,
      });
    }
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
    baseNightlyRate:
      row.base_nightly_rate == null || row.base_nightly_rate === ""
        ? null
        : Number(row.base_nightly_rate),
    standardOccupancy: Number(row.standard_occupancy ?? 1),
    extraAdultRateDefault:
      row.extra_adult_rate_default == null || row.extra_adult_rate_default === ""
        ? null
        : Number(row.extra_adult_rate_default),
    extraChildRateDefault:
      row.extra_child_rate_default == null || row.extra_child_rate_default === ""
        ? null
        : Number(row.extra_child_rate_default),
    maxOccupancy: row.max_occupancy == null || row.max_occupancy === "" ? null : Number(row.max_occupancy),
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

function mapCancellationPolicy(row: any): RateCancellationPolicyRow {
  const policyKind = parseCancellationPolicyKind(row.policy_kind);
  const fromHours = windowFromDeadlineHours(
    row.deadline_hours == null ? null : Number(row.deadline_hours),
  );
  const windowUnit = row.window_unit
    ? parseCancellationWindowUnit(row.window_unit)
    : fromHours.windowUnit;
  const windowValue =
    row.window_value == null
      ? fromHours.windowValue
      : Number.isFinite(Number(row.window_value))
        ? Number(row.window_value)
        : null;
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    policyKind,
    windowValue,
    windowUnit,
    cutoffTime: parseCutoffTime(row.cutoff_time),
    penaltyType: parseCancellationPenaltyType(row.penalty_type),
    penaltyValue: Number(row.penalty_value ?? 0),
    deadlineHours: row.deadline_hours == null ? null : Number(row.deadline_hours),
    active: row.active !== false,
  };
}

export async function loadRatesCard2Snapshot(
  db: DbClient,
  restaurantId: string,
): Promise<RatesCard2Snapshot> {
  const legacyPlanSelect =
    "id, code, name, description, rate_category_id, room_type_id, currency, base_rate, valid_from, valid_to, active";
  const basePlanSelect = `${legacyPlanSelect}, included_occupancy, extra_adult_rate, extra_child_rate`;
  const compositionPlanSelect = `${basePlanSelect}, meal_plan_id, cancellation_policy_id, refundability_id, deposit_policy_id, no_show_policy_id, early_departure_policy_id`;

  let typesQuery = await db
    .from("room_types")
    .select(
      "id, code, name, active, standard_occupancy, max_occupancy, base_nightly_rate, extra_adult_rate_default, extra_child_rate_default",
    )
    .eq("restaurant_id", restaurantId)
    .order("code");
  if (typesQuery.error && (typesQuery.error.code === "42703" || typesQuery.error.code === "PGRST204")) {
    typesQuery = await db
      .from("room_types")
      .select("id, code, name, active, standard_occupancy, max_occupancy")
      .eq("restaurant_id", restaurantId)
      .order("code");
  }

  const [
    categories,
    meals,
    cancellations,
    refundability,
    deposits,
    noShows,
    earlyDepartures,
    composedPlans,
    restaurant,
  ] = await Promise.all([
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
      .select(
        "id, code, name, description, active, policy_kind, window_value, window_unit, cutoff_time, penalty_type, penalty_value, deadline_hours",
      )
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_rate_refundability_codes")
      .select("id, code, name, description, kind, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_deposit_policies")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_no_show_policies")
      .select(
        "id, code, name, description, penalty_type, penalty_value, release_hour, is_default, active",
      )
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_early_departure_policies")
      .select("id, code, name, description, penalty_type, penalty_value, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("hotel_rate_plans")
      .select(compositionPlanSelect)
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("restaurants")
      .select("currency_code")
      .eq("id", restaurantId)
      .maybeSingle(),
  ]);

  for (const result of [typesQuery, categories]) {
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
    : (cancellations.data ?? []).map(mapCancellationPolicy);

  if (cancellations.error && (cancellations.error.code === "42703" || cancellations.error.code === "PGRST204")) {
    const fallback = await db
      .from("pms_rate_cancellation_policies")
      .select("id, code, name, description, active, deadline_hours, penalty_type, penalty_value")
      .eq("restaurant_id", restaurantId)
      .order("code");
    if (!fallback.error) {
      cancellationPolicies.length = 0;
      cancellationPolicies.push(...(fallback.data ?? []).map(mapCancellationPolicy));
    }
  }

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

  const depositPolicies: Card2DepositPolicyRef[] = deposits.error
    ? []
    : (deposits.data ?? []).map((row: any) => ({
        id: row.id,
        code: String(row.code ?? "").toUpperCase(),
        name: String(row.name ?? ""),
        active: row.active !== false,
      }));

  const noShowPolicies: RateNoShowPolicyRow[] = noShows.error
    ? []
    : (noShows.data ?? []).map((row: any) => ({
        id: row.id,
        code: String(row.code ?? "").toUpperCase(),
        name: String(row.name ?? ""),
        description: String(row.description ?? ""),
        penaltyType: (row.penalty_type ?? "none") as PolicyPenaltyType,
        penaltyValue: Number(row.penalty_value ?? 0),
        releaseHour: Number(row.release_hour ?? 18),
        isDefault: Boolean(row.is_default),
        active: row.active !== false,
      }));

  const earlyDeparturePolicies: RateEarlyDeparturePolicyRow[] = earlyDepartures.error
    ? []
    : (earlyDepartures.data ?? []).map((row: any) => ({
        id: row.id,
        code: String(row.code ?? "").toUpperCase(),
        name: String(row.name ?? ""),
        description: String(row.description ?? ""),
        penaltyType: (EARLY_DEPARTURE_PENALTY_TYPES as readonly string[]).includes(
          String(row.penalty_type),
        )
          ? row.penalty_type
          : "none",
        penaltyValue: Number(row.penalty_value ?? 0),
        active: row.active !== false,
      }));

  let planData = composedPlans.data;
  if (composedPlans.error) {
    const code = composedPlans.error.code;
    if (code === "42703" || code === "PGRST204") {
      const withOccupancy = await db
        .from("hotel_rate_plans")
        .select(basePlanSelect)
        .eq("restaurant_id", restaurantId)
        .order("code");
      if (!withOccupancy.error) {
        planData = withOccupancy.data;
      } else {
        const fallback = await db
          .from("hotel_rate_plans")
          .select(legacyPlanSelect)
          .eq("restaurant_id", restaurantId)
          .order("code");
        if (fallback.error) unavailable(fallback.error);
        planData = fallback.data;
      }
    } else {
      unavailable(composedPlans.error);
    }
  }

  const roomTypes = (typesQuery.data ?? []).map(mapRoomType);
  const categoryRows = (categories.data ?? []).map(mapCategory);
  const typeById = new Map(roomTypes.map((row) => [row.id, row]));
  const categoryById = new Map(categoryRows.map((row) => [row.id, row]));
  const mealById = new Map(mealPlans.map((row) => [row.id, row]));
  const cancelById = new Map(cancellationPolicies.map((row) => [row.id, row]));
  const refundById = new Map(refundabilityCodes.map((row) => [row.id, row]));
  const depositById = new Map(depositPolicies.map((row) => [row.id, row]));
  const noShowById = new Map(noShowPolicies.map((row) => [row.id, row]));
  const earlyDepartureById = new Map(earlyDeparturePolicies.map((row) => [row.id, row]));

  const planRows: RatePlanRow[] = (planData ?? []).map((row: any) => {
    const type = typeById.get(row.room_type_id);
    const category = categoryById.get(row.rate_category_id);
    const meal = row.meal_plan_id ? mealById.get(row.meal_plan_id) : undefined;
    const cancel = row.cancellation_policy_id
      ? cancelById.get(row.cancellation_policy_id)
      : undefined;
    const refund = row.refundability_id ? refundById.get(row.refundability_id) : undefined;
    const deposit = row.deposit_policy_id ? depositById.get(row.deposit_policy_id) : undefined;
    const noShow = row.no_show_policy_id ? noShowById.get(row.no_show_policy_id) : undefined;
    const earlyDeparture = row.early_departure_policy_id
      ? earlyDepartureById.get(row.early_departure_policy_id)
      : undefined;
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
      depositPolicyId: row.deposit_policy_id ?? null,
      depositPolicyName: deposit?.name ?? "",
      noShowPolicyId: row.no_show_policy_id ?? null,
      noShowPolicyName: noShow?.name ?? "",
      earlyDeparturePolicyId: row.early_departure_policy_id ?? null,
      earlyDeparturePolicyName: earlyDeparture?.name ?? "",
      includedOccupancy:
        row.included_occupancy == null ? null : Number(row.included_occupancy),
      extraAdultRate: row.extra_adult_rate == null ? null : Number(row.extra_adult_rate),
      extraChildRate: row.extra_child_rate == null ? null : Number(row.extra_child_rate),
      active: row.active !== false,
    };
  });

  return {
    roomTypes,
    categories: categoryRows,
    mealPlans,
    cancellationPolicies,
    refundabilityCodes,
    depositPolicies,
    noShowPolicies,
    earlyDeparturePolicies,
    plans: planRows,
    currencyCode: String((restaurant?.data as any)?.currency_code ?? "USD").toUpperCase(),
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
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
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
  .validator((input: unknown) => categorySchema.parse(input))
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
  .validator((input: unknown) => planSchema.parse(input))
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
        .select("id, max_occupancy")
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
      data.depositPolicyId
        ? db
            .from("pms_deposit_policies")
            .select("id")
            .eq("id", data.depositPolicyId)
            .eq("restaurant_id", data.restaurantId)
            .maybeSingle()
        : Promise.resolve({ data: { id: true }, error: null }),
      data.noShowPolicyId
        ? db
            .from("pms_no_show_policies")
            .select("id")
            .eq("id", data.noShowPolicyId)
            .eq("restaurant_id", data.restaurantId)
            .maybeSingle()
        : Promise.resolve({ data: { id: true }, error: null }),
      data.earlyDeparturePolicyId
        ? db
            .from("pms_early_departure_policies")
            .select("id")
            .eq("id", data.earlyDeparturePolicyId)
            .eq("restaurant_id", data.restaurantId)
            .maybeSingle()
        : Promise.resolve({ data: { id: true }, error: null }),
    ]);
    const [category, roomType, restaurant, meal, cancel, refund, deposit, noShow, earlyDeparture] =
      lookups;

    if (category.error) unavailable(category.error);
    if (roomType.error) unavailable(roomType.error);
    if (!category.data) throw new Error("That rate category doesn't belong to this property.");
    if (!roomType.data) throw new Error("That room type doesn't belong to this property.");
    const occupancyError = ratePlanOccupancyValidationError({
      includedOccupancy: data.includedOccupancy,
      extraAdultRate: data.extraAdultRate,
      extraChildRate: data.extraChildRate,
      maxOccupancy:
        (roomType.data as { max_occupancy?: number | null }).max_occupancy == null
          ? null
          : Number((roomType.data as { max_occupancy?: number | null }).max_occupancy),
    });
    if (occupancyError) throw new Error(occupancyError);
    if (data.mealPlanId && (meal.error || !meal.data)) {
      throw new Error("That meal plan doesn't belong to this property.");
    }
    if (data.cancellationPolicyId && (cancel.error || !cancel.data)) {
      throw new Error("That cancellation policy doesn't belong to this property.");
    }
    if (data.refundabilityId && (refund.error || !refund.data)) {
      throw new Error("That refundability code doesn't belong to this property.");
    }
    const depositMessage = foreignRatePlanPolicyMessage(
      "deposit",
      data.depositPolicyId,
      !deposit.error && Boolean(deposit.data),
    );
    if (depositMessage) throw new Error(depositMessage);
    const noShowMessage = foreignRatePlanPolicyMessage(
      "no-show",
      data.noShowPolicyId,
      !noShow.error && Boolean(noShow.data),
    );
    if (noShowMessage) throw new Error(noShowMessage);
    const earlyDepartureMessage = foreignRatePlanPolicyMessage(
      "early-departure",
      data.earlyDeparturePolicyId,
      !earlyDeparture.error && Boolean(earlyDeparture.data),
    );
    if (earlyDepartureMessage) throw new Error(earlyDepartureMessage);

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
      deposit_policy_id: data.depositPolicyId || null,
      no_show_policy_id: data.noShowPolicyId || null,
      early_departure_policy_id: data.earlyDeparturePolicyId || null,
      included_occupancy: data.includedOccupancy ?? null,
      extra_adult_rate: data.extraAdultRate ?? null,
      extra_child_rate: data.extraChildRate ?? null,
      active: data.active,
    };

    const occupancyConfigured =
      data.includedOccupancy != null || data.extraAdultRate != null || data.extraChildRate != null;
    const occupancyUnavailable =
      "Rate Plan occupancy pricing is unavailable until migration 0191 is applied.";

    async function writePlan(body: typeof payload | Record<string, unknown>) {
      return data.id
        ? db.from("hotel_rate_plans").update(body).eq("id", data.id).eq("restaurant_id", data.restaurantId)
        : db.from("hotel_rate_plans").insert(body);
    }

    const written = await writePlan(payload);
    if (written.error && (written.error.code === "42703" || written.error.code === "PGRST204")) {
      const {
        meal_plan_id: _meal,
        cancellation_policy_id: _cancel,
        refundability_id: _refund,
        deposit_policy_id: _deposit,
        no_show_policy_id: _noShow,
        early_departure_policy_id: _earlyDeparture,
        ...withoutComposition
      } = payload;
      const retryOccupancy = await writePlan(withoutComposition);
      if (retryOccupancy.error && (retryOccupancy.error.code === "42703" || retryOccupancy.error.code === "PGRST204")) {
        if (occupancyConfigured) throw new Error(occupancyUnavailable);
        const {
          included_occupancy: _included,
          extra_adult_rate: _extraAdult,
          extra_child_rate: _extraChild,
          ...basePayload
        } = withoutComposition;
        const retry = await writePlan(basePayload);
        if (retry.error) unavailable(retry.error);
      } else if (retryOccupancy.error) {
        unavailable(retryOccupancy.error);
      }
    } else if (written.error) {
      unavailable(written.error);
    }

    await writeAudit(db, data.restaurantId, context.userId, "card2_rate_plan_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadRatesCard2Snapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard2Readiness(snapshot) };
  });

export const saveRateCancellationPolicyCard2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => cancellationSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const cutoffTime = parseCutoffTime(data.cutoffTime);
    const windowValue = data.policyKind === "non_refundable" ? null : (data.windowValue ?? null);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      policy_kind: data.policyKind,
      window_value: windowValue,
      window_unit: data.windowUnit,
      cutoff_time: cutoffTime,
      penalty_type: data.penaltyType,
      penalty_value: penaltyNeedsValue(data.penaltyType) ? data.penaltyValue : 0,
      deadline_hours: deadlineHoursFromWindow(data.policyKind, windowValue, data.windowUnit),
      active: data.active,
    };
    const write = data.id
      ? (body: typeof payload | Record<string, unknown>) =>
          db
            .from("pms_rate_cancellation_policies")
            .update(body)
            .eq("id", data.id)
            .eq("restaurant_id", data.restaurantId)
      : (body: typeof payload | Record<string, unknown>) =>
          db.from("pms_rate_cancellation_policies").insert(body);
    const result = await write(payload);
    if (result.error && (result.error.code === "42703" || result.error.code === "PGRST204")) {
      const {
        policy_kind: _kind,
        window_value: _window,
        window_unit: _unit,
        cutoff_time: _cutoff,
        ...legacy
      } = payload;
      const retry = await write(legacy);
      if (retry.error) unavailable(retry.error);
    } else if (result.error) {
      unavailable(result.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card2_rate_cancellation_saved", {
      detail: `${data.code} ${data.name}`,
    });

    const snapshot = await loadRatesCard2Snapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard2Readiness(snapshot) };
  });

export const saveRateRefundabilityCard2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => refundabilitySchema.parse(input))
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

export const saveRateNoShowPolicyCard2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => noShowPolicySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);

    // Default policy rule: If setting isDefault to true, unset any existing default first
    if (data.isDefault) {
      await db
        .from("pms_no_show_policies")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("restaurant_id", data.restaurantId)
        .eq("is_default", true);
    }

    const penaltyValue =
      data.penaltyType === "none" || data.penaltyType === "first_night" || data.penaltyType === "full_stay"
        ? 0
        : data.penaltyValue;

    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      penalty_type: data.penaltyType,
      penalty_value: penaltyValue,
      release_hour: data.releaseHour,
      is_default: data.isDefault,
      active: data.active,
    };

    const result = data.id
      ? await db
          .from("pms_no_show_policies")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_no_show_policies").insert(payload);

    if (result.error) unavailable(result.error);

    await writeAudit(db, data.restaurantId, context.userId, "card2_rate_no_show_saved", {
      detail: `${data.code} ${data.name}`,
    });

    const snapshot = await loadRatesCard2Snapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard2Readiness(snapshot) };
  });

export const saveRateEarlyDeparturePolicyCard2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => earlyDeparturePolicySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const resolved = resolvedEarlyDeparturePenaltyValue(data.penaltyType, data.penaltyValue);
    if (!resolved.ok) throw new Error(resolved.message);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      penalty_type: data.penaltyType,
      penalty_value: resolved.penaltyValue,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_early_departure_policies")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_early_departure_policies").insert(payload);
    if (result.error?.code === "23505") {
      throw new Error("That early departure policy code is already used for this property.");
    }
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "card2_rate_early_departure_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadRatesCard2Snapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard2Readiness(snapshot) };
  });

export const setRateEarlyDeparturePolicyActiveCard2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const result = await db
      .from("pms_early_departure_policies")
      .update({ active: data.active })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    const snapshot = await loadRatesCard2Snapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard2Readiness(snapshot) };
  });
