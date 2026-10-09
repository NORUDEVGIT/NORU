import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  REVENUE_STATUSES,
  blankToNull,
  canManageRates,
  eachDate,
  parseSnapshot,
  rateError,
  requireRateManager,
  toQuote,
  type StayQuote,
} from "./rates.server";
import { callerMembership } from "@/core/lib/workforce.server";
import { requireModuleRole } from "@/core/lib/module-access.server";
import { REPORTS_ROLES } from "@/core/lib/module-access";
import { selectCompanyBookingDefaults } from "./create-reservation-step3";
import { requireReservationManager } from "./reservations.server";
import { computeBookedRevenueOverview } from "./revenue/revenue-metrics";
import { loadQuoteMerchandising } from "./rate-quote-read-model.server";
import { breakfastLabelFromMealPlan, deriveCancellationDisplay } from "./cancellation-deadline";
import {
  parsePackageInclusionType,
  type RatePlanPackageLink,
} from "./rate-plan-package-inclusion";

const idSchema = z.string().uuid();

export type SaveResult = { ok: true; id: string } | { ok: false; message: string };
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/* ------------------------------------------------------------------- types */

export interface RateCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface RatePlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  roomTypeId: string;
  roomTypeName: string;
  currency: string;
  baseRate: number;
  validFrom: string | null;
  validTo: string | null;
  mealPlanId: string | null;
  mealPlanName: string;
  breakfastIncluded: boolean;
  cancellationPolicyId: string | null;
  cancellationName: string;
  refundabilityId: string | null;
  refundabilityName: string;
  refundabilityKind: string | null;
  minAdvanceDays: number | null;
  maxAdvanceDays: number | null;
  packages: RatePlanPackageLink[];
  active: boolean;
}

export interface RateCalendarRow {
  date: string;
  baseRate: number;
  overrideRate: number | null;
  effectiveRate: number;
}

export interface RateRestrictionRow {
  date: string;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
}

export interface RevenueOverview {
  from: string;
  to: string;
  currency: string;
  availableRoomNights: number;
  soldRoomNights: number;
  roomRevenue: number;
  occupancyPercent: number;
  adr: number;
  revPar: number;
  pricedShare: number;
}

export type { StayQuote } from "./rates.server";

/* ------------------------------------------------------------------ access */

export const getRatesAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context as never, data.restaurantId);
    return { role: me.role, canManage: canManageRates(me.role) };
  });

/* -------------------------------------------------------------- categories */

export const listRateCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<RateCategory[]> => {
    await requireRateManager(context as never, data.restaurantId);
    const { data: rows, error } = await context.supabase
      .from("hotel_rate_categories")
      .select("id, code, name, description, active")
      .eq("restaurant_id", data.restaurantId)
      .order("code");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      active: r.active,
    }));
  });

export const saveRateCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        categoryId: idSchema.optional(),
        code: z.string().min(1).max(20),
        name: z.string().min(1).max(80),
        description: z.string().max(500).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<SaveResult> => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      description: blankToNull(data.description),
      active: data.active ?? true,
    };

    if (data.categoryId) {
      const { error } = await context.supabase
        .from("hotel_rate_categories")
        .update(payload)
        .eq("id", data.categoryId)
        .eq("restaurant_id", data.restaurantId);
      if (error) return { ok: false, message: rateError(error.message).message };
      return { ok: true, id: data.categoryId };
    }

    const { data: created, error } = await context.supabase
      .from("hotel_rate_categories")
      .insert({ ...payload, created_by_membership_id: me.id })
      .select("id")
      .single();
    if (error) return { ok: false, message: rateError(error.message).message };
    return { ok: true, id: created.id };
  });

/* ------------------------------------------------------------------- plans */

const PLAN_SELECT_BASE = `
  id, code, name, description, rate_category_id, room_type_id, currency, base_rate,
  valid_from, valid_to, cancellation_policy_id, refundability_id, min_advance_days, max_advance_days, active,
  hotel_rate_categories!hotel_rate_plans_category_same_property ( name ),
  room_types!hotel_rate_plans_type_same_property ( name )
`;
const PLAN_SELECT = `
  id, code, name, description, rate_category_id, room_type_id, currency, base_rate,
  valid_from, valid_to, meal_plan_id, cancellation_policy_id, refundability_id, min_advance_days, max_advance_days, active,
  hotel_rate_categories!hotel_rate_plans_category_same_property ( name ),
  room_types!hotel_rate_plans_type_same_property ( name )
`;

function missingColumn(error: { code?: string } | null | undefined) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  rate_category_id: string;
  room_type_id: string;
  currency: string;
  base_rate: number | string;
  valid_from: string | null;
  valid_to: string | null;
  meal_plan_id?: string | null;
  cancellation_policy_id: string | null;
  refundability_id: string | null;
  min_advance_days: number | null;
  max_advance_days: number | null;
  active: boolean;
  hotel_rate_categories: { name: string } | null;
  room_types: { name: string } | null;
};

function toPlan(row: PlanRow): RatePlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    categoryId: row.rate_category_id,
    categoryName: row.hotel_rate_categories?.name ?? "Category",
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? "Room type",
    currency: row.currency,
    baseRate: Number(row.base_rate),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    mealPlanId: row.meal_plan_id ?? null,
    mealPlanName: "",
    breakfastIncluded: false,
    cancellationPolicyId: row.cancellation_policy_id,
    cancellationName: "",
    refundabilityId: row.refundability_id,
    refundabilityName: "",
    refundabilityKind: null,
    minAdvanceDays: row.min_advance_days == null ? null : Number(row.min_advance_days),
    maxAdvanceDays: row.max_advance_days == null ? null : Number(row.max_advance_days),
    packages: [],
    active: row.active,
  };
}

async function hydrateRatePlanMerchandising(
  db: { from: (table: string) => any },
  restaurantId: string,
  plans: RatePlan[],
): Promise<RatePlan[]> {
  const mealIds = [...new Set(plans.map((row) => row.mealPlanId).filter((id): id is string => Boolean(id)))];
  const cancelIds = [
    ...new Set(plans.map((row) => row.cancellationPolicyId).filter((id): id is string => Boolean(id))),
  ];
  const refundIds = [
    ...new Set(plans.map((row) => row.refundabilityId).filter((id): id is string => Boolean(id))),
  ];

  const [meals, cancellations, refundability] = await Promise.all([
    mealIds.length
      ? db
          .from("pms_meal_plans")
          .select("id, name, includes_breakfast")
          .eq("restaurant_id", restaurantId)
          .in("id", mealIds)
      : Promise.resolve({ data: [], error: null }),
    cancelIds.length
      ? db
          .from("pms_rate_cancellation_policies")
          .select("id, name, policy_kind, window_value, window_unit, cutoff_time, deadline_hours")
          .eq("restaurant_id", restaurantId)
          .in("id", cancelIds)
      : Promise.resolve({ data: [], error: null }),
    refundIds.length
      ? db
          .from("pms_rate_refundability_codes")
          .select("id, name, kind")
          .eq("restaurant_id", restaurantId)
          .in("id", refundIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  let cancelRows = cancellations;
  if (cancellations.error && missingColumn(cancellations.error) && cancelIds.length > 0) {
    cancelRows = await db
      .from("pms_rate_cancellation_policies")
      .select("id, name, deadline_hours")
      .eq("restaurant_id", restaurantId)
      .in("id", cancelIds);
  }

  const mealById = new Map(
    ((meals.data ?? []) as { id: string; name: string; includes_breakfast: boolean | null }[]).map((row) => [
      row.id,
      row,
    ]),
  );
  const cancelById = new Map(
    ((cancelRows.data ?? []) as { id: string; name: string }[]).map((row) => [row.id, row]),
  );
  const refundById = new Map(
    ((refundability.data ?? []) as { id: string; name: string; kind: string | null }[]).map((row) => [row.id, row]),
  );

  const packagesByPlan = await loadRatePlanPackageLinks(
    db,
    restaurantId,
    plans.map((row) => row.id),
  );

  return plans.map((plan) => {
    const meal = plan.mealPlanId ? mealById.get(plan.mealPlanId) : undefined;
    const cancel = plan.cancellationPolicyId ? cancelById.get(plan.cancellationPolicyId) : undefined;
    const refund = plan.refundabilityId ? refundById.get(plan.refundabilityId) : undefined;
    return {
      ...plan,
      mealPlanName: meal?.name ?? "",
      breakfastIncluded: meal?.includes_breakfast === true,
      cancellationName: cancel?.name ?? "",
      refundabilityName: refund?.name ?? "",
      refundabilityKind: refund?.kind ?? null,
      packages: packagesByPlan.get(plan.id) ?? [],
    };
  });
}

async function loadRatePlanPackageLinks(
  db: { from: (table: string) => any },
  restaurantId: string,
  planIds: string[],
): Promise<Map<string, RatePlanPackageLink[]>> {
  const byPlan = new Map<string, RatePlanPackageLink[]>();
  if (planIds.length === 0) return byPlan;

  let mapping = await db
    .from("pms_package_rate_plans")
    .select("package_id, rate_plan_id, inclusion_type")
    .eq("restaurant_id", restaurantId)
    .in("rate_plan_id", planIds);
  if (mapping.error && (mapping.error.code === "42703" || mapping.error.code === "PGRST204")) {
    mapping = await db
      .from("pms_package_rate_plans")
      .select("package_id, rate_plan_id")
      .eq("restaurant_id", restaurantId)
      .in("rate_plan_id", planIds);
  }
  if (mapping.error) return byPlan;

  const rows = (mapping.data ?? []) as Array<{
    package_id: string;
    rate_plan_id: string;
    inclusion_type?: string | null;
  }>;
  const packageIds = [...new Set(rows.map((row) => row.package_id))];
  if (packageIds.length === 0) return byPlan;

  const [packages, components] = await Promise.all([
    db
      .from("pms_packages")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .in("id", packageIds),
    db
      .from("pms_package_components")
      .select("package_id, component_kind, meal_plan_id, room_amenity_id, fo_service_id")
      .eq("restaurant_id", restaurantId)
      .in("package_id", packageIds),
  ]);
  if (packages.error) return byPlan;

  const packageById = new Map(
    ((packages.data ?? []) as { id: string; name: string; active: boolean | null }[])
      .filter((row) => row.active !== false)
      .map((row) => [row.id, row]),
  );
  const componentMealIds = [
    ...new Set(
      ((components.data ?? []) as { meal_plan_id?: string | null }[])
        .map((row) => row.meal_plan_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const componentAmenityIds = [
    ...new Set(
      ((components.data ?? []) as { room_amenity_id?: string | null }[])
        .map((row) => row.room_amenity_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const componentServiceIds = [
    ...new Set(
      ((components.data ?? []) as { fo_service_id?: string | null }[])
        .map((row) => row.fo_service_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [meals, amenities, services] = await Promise.all([
    componentMealIds.length
      ? db.from("pms_meal_plans").select("id, name").eq("restaurant_id", restaurantId).in("id", componentMealIds)
      : Promise.resolve({ data: [], error: null }),
    componentAmenityIds.length
      ? db
          .from("room_amenities")
          .select("id, name")
          .eq("restaurant_id", restaurantId)
          .in("id", componentAmenityIds)
      : Promise.resolve({ data: [], error: null }),
    componentServiceIds.length
      ? db
          .from("fo_service_catalogue")
          .select("id, name")
          .eq("restaurant_id", restaurantId)
          .in("id", componentServiceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const mealName = new Map(((meals.data ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]));
  const amenityName = new Map(
    ((amenities.data ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]),
  );
  const serviceName = new Map(
    ((services.data ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]),
  );
  const componentsByPackage = new Map<string, RatePlanPackageLink["components"]>();
  for (const row of (components.data ?? []) as Array<{
    package_id: string;
    component_kind: string;
    meal_plan_id?: string | null;
    room_amenity_id?: string | null;
    fo_service_id?: string | null;
  }>) {
    const list = componentsByPackage.get(row.package_id) ?? [];
    const mealPlanId = row.meal_plan_id ?? null;
    list.push({
      kind: row.component_kind,
      mealPlanId,
      label:
        (mealPlanId && mealName.get(mealPlanId)) ||
        (row.room_amenity_id && amenityName.get(row.room_amenity_id)) ||
        (row.fo_service_id && serviceName.get(row.fo_service_id)) ||
        row.component_kind,
    });
    componentsByPackage.set(row.package_id, list);
  }

  for (const row of rows) {
    const pkg = packageById.get(row.package_id);
    if (!pkg) continue;
    const list = byPlan.get(row.rate_plan_id) ?? [];
    list.push({
      packageId: row.package_id,
      packageName: pkg.name,
      inclusionType: parsePackageInclusionType(row.inclusion_type),
      components: componentsByPackage.get(row.package_id) ?? [],
    });
    byPlan.set(row.rate_plan_id, list);
  }
  return byPlan;
}

async function loadRatePlans(
  supabase: { from: (table: string) => any },
  restaurantId: string,
  apply: (query: any) => any,
): Promise<RatePlan[]> {
  const composed = await apply(
    supabase.from("hotel_rate_plans").select(PLAN_SELECT).eq("restaurant_id", restaurantId).order("code"),
  );
  let rows = composed.data;
  if (composed.error) {
    if (!missingColumn(composed.error)) throw new Error(composed.error.message);
    const fallback = await apply(
      supabase.from("hotel_rate_plans").select(PLAN_SELECT_BASE).eq("restaurant_id", restaurantId).order("code"),
    );
    if (fallback.error) throw new Error(fallback.error.message);
    rows = fallback.data;
  }
  const plans = ((rows ?? []) as unknown as PlanRow[]).map(toPlan);
  return hydrateRatePlanMerchandising(supabase, restaurantId, plans);
}

export const listRatePlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema.optional(),
        activeOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RatePlan[]> => {
    await requireRateManager(context as never, data.restaurantId);
    return loadRatePlans(context.supabase, data.restaurantId, (query) => {
      let next = query;
      if (data.roomTypeId) next = next.eq("room_type_id", data.roomTypeId);
      if (data.activeOnly) next = next.eq("active", true);
      return next;
    });
  });

export const saveRatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        ratePlanId: idSchema.optional(),
        rateCategoryId: idSchema,
        roomTypeId: idSchema,
        code: z.string().min(1).max(30),
        name: z.string().min(1).max(120),
        description: z.string().max(1000).nullable().optional(),
        baseRate: z.number().min(0).max(10_000_000),
        validFrom: dateSchema.nullable().optional(),
        validTo: dateSchema.nullable().optional(),
        cancellationPolicyId: idSchema.nullable().optional(),
        refundabilityId: idSchema.nullable().optional(),
        minAdvanceDays: z.number().int().min(0).max(365).nullable().optional(),
        maxAdvanceDays: z.number().int().min(0).max(365).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<SaveResult> => {
    const me = await requireRateManager(context as never, data.restaurantId);

    // Category and room type must both belong to this property.
    const [{ data: category }, { data: roomType }, { data: restaurant }] = await Promise.all([
      context.supabase
        .from("hotel_rate_categories")
        .select("id")
        .eq("id", data.rateCategoryId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle(),
      context.supabase
        .from("room_types")
        .select("id")
        .eq("id", data.roomTypeId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle(),
      context.supabase.from("restaurants").select("currency_code").eq("id", data.restaurantId).maybeSingle(),
    ]);
    if (!category) return { ok: false, message: "That rate category doesn't belong to this property." };
    if (!roomType) return { ok: false, message: "That room type doesn't belong to this property." };

    const payload = {
      restaurant_id: data.restaurantId,
      rate_category_id: data.rateCategoryId,
      room_type_id: data.roomTypeId,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      description: blankToNull(data.description),
      currency: restaurant?.currency_code ?? "USD",
      base_rate: data.baseRate,
      valid_from: data.validFrom ?? null,
      valid_to: data.validTo ?? null,
      cancellation_policy_id: data.cancellationPolicyId ?? null,
      refundability_id: data.refundabilityId ?? null,
      min_advance_days: data.minAdvanceDays ?? null,
      max_advance_days: data.maxAdvanceDays ?? null,
      active: data.active ?? true,
    };

    if (data.ratePlanId) {
      const { error } = await context.supabase
        .from("hotel_rate_plans")
        .update(payload)
        .eq("id", data.ratePlanId)
        .eq("restaurant_id", data.restaurantId);
      if (error) return { ok: false, message: rateError(error.message).message };
      return { ok: true, id: data.ratePlanId };
    }

    const { data: created, error } = await context.supabase
      .from("hotel_rate_plans")
      .insert({ ...payload, created_by_membership_id: me.id })
      .select("id")
      .single();
    if (error) return { ok: false, message: rateError(error.message).message };
    return { ok: true, id: created.id };
  });

export const setRatePlanActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, ratePlanId: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; active: boolean }> => {
    await requireRateManager(context as never, data.restaurantId);
    const { error } = await context.supabase
      .from("hotel_rate_plans")
      .update({ active: data.active })
      .eq("id", data.ratePlanId)
      .eq("restaurant_id", data.restaurantId);
    if (error) throw rateError(error.message);
    return { id: data.ratePlanId, active: data.active };
  });

/** A rate plan id that must belong to this property. */
async function assertPlan(context: { supabase: never }, restaurantId: string, ratePlanId: string) {
  const client = context.supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string,
        ) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { base_rate: number | string } | null }> } };
      };
    };
  };
  const { data } = await client
    .from("hotel_rate_plans")
    .select("base_rate")
    .eq("id", ratePlanId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That rate plan doesn't belong to this property.");
  return { baseRate: Number(data.base_rate) };
}

/* ---------------------------------------------------------------- calendar */

export const listRateCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, ratePlanId: idSchema, from: dateSchema, to: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RateCalendarRow[]> => {
    await requireRateManager(context as never, data.restaurantId);
    const plan = await assertPlan(context as never, data.restaurantId, data.ratePlanId);

    const { data: rows, error } = await context.supabase
      .from("hotel_rate_calendar")
      .select("rate_date, nightly_rate")
      .eq("restaurant_id", data.restaurantId)
      .eq("rate_plan_id", data.ratePlanId)
      .gte("rate_date", data.from)
      .lte("rate_date", data.to);
    if (error) throw new Error(error.message);

    const overrides = new Map<string, number>();
    for (const r of rows ?? []) overrides.set(r.rate_date, Number(r.nightly_rate));

    return eachDate(data.from, data.to).map((date) => {
      const override = overrides.get(date) ?? null;
      return {
        date,
        baseRate: plan.baseRate,
        overrideRate: override,
        effectiveRate: override ?? plan.baseRate,
      };
    });
  });

export const saveRateOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        ratePlanId: idSchema,
        date: dateSchema,
        nightlyRate: z.number().min(0).max(10_000_000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ date: string }> => {
    // Compatibility Rate Calendar writer. Official Phase 2 apply is applyRateChanges
    // (RPC apply_hotel_rate_changes + hotel_rate_change_events). UI-03 should migrate
    // this path after 0101 is applied. Do not loop this function for bulk apply.
    // Card 3 also writes hotel_rate_calendar via saveRateOverrideCard3.
    const me = await requireRateManager(context as never, data.restaurantId);
    await assertPlan(context as never, data.restaurantId, data.ratePlanId);

    if (data.nightlyRate === null) {
      const { error } = await context.supabase
        .from("hotel_rate_calendar")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("rate_plan_id", data.ratePlanId)
        .eq("rate_date", data.date);
      if (error) throw rateError(error.message);
      return { date: data.date };
    }

    const { error } = await context.supabase.from("hotel_rate_calendar").upsert(
      {
        restaurant_id: data.restaurantId,
        rate_plan_id: data.ratePlanId,
        rate_date: data.date,
        nightly_rate: data.nightlyRate,
        created_by_membership_id: me.id,
      },
      { onConflict: "rate_plan_id,rate_date" },
    );
    if (error) throw rateError(error.message);
    return { date: data.date };
  });

/* ------------------------------------------------------------ restrictions */

export const listRateRestrictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, ratePlanId: idSchema, from: dateSchema, to: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RateRestrictionRow[]> => {
    await requireRateManager(context as never, data.restaurantId);
    await assertPlan(context as never, data.restaurantId, data.ratePlanId);

    const { data: rows, error } = await context.supabase
      .from("hotel_rate_restrictions")
      .select("restriction_date, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell")
      .eq("restaurant_id", data.restaurantId)
      .eq("rate_plan_id", data.ratePlanId)
      .gte("restriction_date", data.from)
      .lte("restriction_date", data.to);
    if (error) throw new Error(error.message);

    const byDate = new Map<string, RateRestrictionRow>();
    for (const r of rows ?? []) {
      byDate.set(r.restriction_date, {
        date: r.restriction_date,
        minStay: r.min_stay,
        maxStay: r.max_stay,
        closedToArrival: r.closed_to_arrival,
        closedToDeparture: r.closed_to_departure,
        stopSell: r.stop_sell,
      });
    }

    return eachDate(data.from, data.to).map(
      (date) =>
        byDate.get(date) ?? {
          date,
          minStay: null,
          maxStay: null,
          closedToArrival: false,
          closedToDeparture: false,
          stopSell: false,
        },
    );
  });

/** Compatibility Restriction Calendar writer. Official Phase 3 writes use applyRestrictionChanges. */
export const saveRateRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        ratePlanId: idSchema,
        date: dateSchema,
        minStay: z.number().int().min(1).max(365).nullable(),
        maxStay: z.number().int().min(1).max(365).nullable(),
        closedToArrival: z.boolean(),
        closedToDeparture: z.boolean(),
        stopSell: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ date: string }> => {
    const me = await requireRateManager(context as never, data.restaurantId);
    await assertPlan(context as never, data.restaurantId, data.ratePlanId);

    if (data.minStay !== null && data.maxStay !== null && data.maxStay < data.minStay) {
      throw new Error("Maximum stay must be at least the minimum stay.");
    }

    const empty =
      data.minStay === null &&
      data.maxStay === null &&
      !data.closedToArrival &&
      !data.closedToDeparture &&
      !data.stopSell;

    if (empty) {
      const { error } = await context.supabase
        .from("hotel_rate_restrictions")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("rate_plan_id", data.ratePlanId)
        .eq("restriction_date", data.date);
      if (error) throw rateError(error.message);
      return { date: data.date };
    }

    const { error } = await context.supabase.from("hotel_rate_restrictions").upsert(
      {
        restaurant_id: data.restaurantId,
        rate_plan_id: data.ratePlanId,
        restriction_date: data.date,
        min_stay: data.minStay,
        max_stay: data.maxStay,
        closed_to_arrival: data.closedToArrival,
        closed_to_departure: data.closedToDeparture,
        stop_sell: data.stopSell,
        created_by_membership_id: me.id,
      },
      { onConflict: "rate_plan_id,restriction_date" },
    );
    if (error) throw rateError(error.message);
    return { date: data.date };
  });

/* ----------------------------------------------------------------- quoting */

export interface RatePlanQuote {
  plan: RatePlan;
  quote: StayQuote | null;
  unavailableReason: string | null;
  breakfastLabel: string;
  includedServicesLabel: string;
  restrictionSummary: string | null;
  cancellationLabel: string;
  refundabilityLabel: string;
  refundabilityKind: string | null;
}

/** Authoritative server pricing for every plan of a room type across a stay. */
export const quoteStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
        arrival: dateSchema,
        departure: dateSchema,
        ratePlanId: idSchema.optional(),
        rooms: z.number().int().min(1).max(20).optional(),
        adults: z.number().int().min(1).max(20).optional(),
        children: z.number().int().min(0).max(20).optional(),
        infants: z.number().int().min(0).max(20).optional(),
        quoteCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RatePlanQuote[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    if (data.departure <= data.arrival) throw new Error("Departure must be after arrival.");

    const plans = await loadRatePlans(context.supabase, data.restaurantId, (query) => {
      let next = query.eq("room_type_id", data.roomTypeId).eq("active", true);
      if (data.ratePlanId) next = next.eq("id", data.ratePlanId);
      return next;
    });
    if (plans.length === 0) return [];

    const policyLabels = new Map<
      string,
      { cancellationLabel: string; refundabilityLabel: string; refundabilityKind: string | null }
    >();
    const cancelIds = [...new Set(plans.map((plan) => plan.cancellationPolicyId).filter((id): id is string => Boolean(id)))];
    const refundIds = [...new Set(plans.map((plan) => plan.refundabilityId).filter((id): id is string => Boolean(id)))];
    const cancelNames = new Map<
      string,
      {
        name: string;
        policy_kind?: string | null;
        window_value?: number | null;
        window_unit?: string | null;
        cutoff_time?: string | null;
        deadline_hours?: number | null;
      }
    >();
    const refundNames = new Map<string, string>();
    const refundKinds = new Map<string, string>();
    const { data: propertyRow } = await context.supabase
      .from("restaurants")
      .select("timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    const timeZone = (propertyRow as { timezone?: string | null } | null)?.timezone ?? null;
    if (cancelIds.length > 0) {
      let cancelQuery = await context.supabase
        .from("pms_rate_cancellation_policies")
        .select("id, name, policy_kind, window_value, window_unit, cutoff_time, deadline_hours")
        .eq("restaurant_id", data.restaurantId)
        .in("id", cancelIds);
      if (cancelQuery.error && missingColumn(cancelQuery.error)) {
        cancelQuery = await context.supabase
          .from("pms_rate_cancellation_policies")
          .select("id, name, deadline_hours")
          .eq("restaurant_id", data.restaurantId)
          .in("id", cancelIds);
      }
      for (const row of cancelQuery.data ?? []) {
        cancelNames.set(row.id, row as never);
      }
    }
    if (refundIds.length > 0) {
      const { data: refundRows } = await context.supabase
        .from("pms_rate_refundability_codes")
        .select("id, name, kind")
        .eq("restaurant_id", data.restaurantId)
        .in("id", refundIds);
      for (const row of refundRows ?? []) {
        refundNames.set(row.id, row.name);
        refundKinds.set(row.id, String(row.kind ?? ""));
      }
    }
    for (const plan of plans) {
      const cancel = plan.cancellationPolicyId ? cancelNames.get(plan.cancellationPolicyId) : undefined;
      const derived = cancel
        ? deriveCancellationDisplay({
            policyName: cancel.name,
            policyKind: cancel.policy_kind,
            windowValue: cancel.window_value == null ? null : Number(cancel.window_value),
            windowUnit: cancel.window_unit,
            cutoffTime: cancel.cutoff_time,
            deadlineHours: cancel.deadline_hours == null ? null : Number(cancel.deadline_hours),
            arrivalDate: data.arrival,
            timeZone,
          })
        : null;
      policyLabels.set(plan.id, {
        cancellationLabel: derived?.label ?? (cancel?.name || "—"),
        refundabilityLabel: plan.refundabilityId ? refundNames.get(plan.refundabilityId) ?? "—" : "—",
        refundabilityKind: plan.refundabilityId ? refundKinds.get(plan.refundabilityId) || null : null,
      });
    }

    const merchandising = await loadQuoteMerchandising(
      context.supabase as never,
      data.restaurantId,
      plans.map((plan) => plan.id),
      data.arrival,
      data.departure,
      policyLabels,
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const out: RatePlanQuote[] = [];
    for (const plan of plans) {
      const extra = merchandising.get(plan.id);
      const { data: pricing, error: priceError } = await supabaseAdmin.rpc("price_hotel_stay", {
        _restaurant_id: data.restaurantId,
        _rate_plan_id: plan.id,
        _room_type_id: data.roomTypeId,
        _arrival: data.arrival,
        _departure: data.departure,
        _rooms: data.rooms ?? 1,
        _adults: data.adults ?? 1,
        _children: data.children ?? 0,
        _infants: data.infants ?? 0,
        _quote_currency: data.quoteCurrency ?? undefined,
      });
      if (priceError) {
        out.push({
          plan,
          quote: null,
          unavailableReason: rateError(priceError.message).message,
          breakfastLabel: breakfastLabelFromMealPlan(plan),
          includedServicesLabel: extra?.includedServicesLabel ?? "—",
          restrictionSummary: extra?.restrictionSummary ?? null,
          cancellationLabel: extra?.cancellationLabel ?? "—",
          refundabilityLabel: extra?.refundabilityLabel ?? "—",
          refundabilityKind: extra?.refundabilityKind ?? null,
        });
        continue;
      }
      out.push({
        plan,
        quote: toQuote(pricing),
        unavailableReason: null,
        breakfastLabel: breakfastLabelFromMealPlan(plan),
        includedServicesLabel: extra?.includedServicesLabel ?? "—",
        restrictionSummary: extra?.restrictionSummary ?? null,
        cancellationLabel: extra?.cancellationLabel ?? "—",
        refundabilityLabel: extra?.refundabilityLabel ?? "—",
        refundabilityKind: extra?.refundabilityKind ?? null,
      });
    }
    return out;
  });

export type FlexibleStayWindow = {
  arrival: string;
  departure: string;
  offsetDays: number;
  subtotal: number | null;
  currency: string | null;
  available: boolean;
};

/** Adjacent-date quotes for one selected plan. Does not invent a yield engine. */
export const quoteFlexibleStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
        ratePlanId: idSchema,
        arrival: dateSchema,
        departure: dateSchema,
        rooms: z.number().int().min(1).max(20).optional(),
        adults: z.number().int().min(1).max(20).optional(),
        children: z.number().int().min(0).max(20).optional(),
        infants: z.number().int().min(0).max(20).optional(),
        quoteCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ windows: FlexibleStayWindow[] }> => {
    await requireReservationManager(context as never, data.restaurantId);
    if (data.departure <= data.arrival) throw new Error("Departure must be after arrival.");
    const { addDaysIso, FLEXIBLE_DATE_OFFSETS } = await import("./create-reservation-step3");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const windows: FlexibleStayWindow[] = [];
    for (const offsetDays of FLEXIBLE_DATE_OFFSETS) {
      const arrival = addDaysIso(data.arrival, offsetDays);
      const departure = addDaysIso(data.departure, offsetDays);
      const { data: pricing, error } = await supabaseAdmin.rpc("price_hotel_stay", {
        _restaurant_id: data.restaurantId,
        _rate_plan_id: data.ratePlanId,
        _room_type_id: data.roomTypeId,
        _arrival: arrival,
        _departure: departure,
        _rooms: data.rooms ?? 1,
        _adults: data.adults ?? 1,
        _children: data.children ?? 0,
        _infants: data.infants ?? 0,
        _quote_currency: data.quoteCurrency ?? undefined,
      });
      const quote = error || pricing == null ? null : toQuote(pricing);
      windows.push({
        arrival,
        departure,
        offsetDays,
        subtotal: quote?.subtotal ?? null,
        currency: quote?.currency ?? null,
        available: quote != null,
      });
    }
    return { windows };
  });

export type AccountRatePlanHint = {
  planId: string | null;
  label: string;
  matched: boolean;
};

function agreementRatePlanIds(row: Record<string, unknown>): string[] {
  const ids: string[] = [];
  if (typeof row.rate_plan_id === "string" && row.rate_plan_id) ids.push(row.rate_plan_id);
  const extra = row.rate_plan_ids;
  if (Array.isArray(extra)) {
    for (const item of extra) {
      if (typeof item === "string" && item) ids.push(item);
    }
  }
  return ids;
}

/** Maps the company's saved agreement and billing rule onto the reservation. */
export const listAccountRatePlanHints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
        roomTypeId: idSchema.optional(),
        arrival: dateSchema.optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      hints: AccountRatePlanHint[];
      defaultBillingRuleId: string | null;
      agreementLabel: string | null;
    }> => {
      await requireReservationManager(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let accountResult = await supabaseAdmin
        .from("guest_account_masters")
        .select("id, name, code, negotiated_rate_reference, default_billing_rule_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.accountId)
        .maybeSingle();
      if (accountResult.error?.code === "42703") {
        accountResult = await supabaseAdmin
          .from("guest_account_masters")
          .select("id, name, code, negotiated_rate_reference")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", data.accountId)
          .maybeSingle();
      }
      if (accountResult.error) throw new Error(accountResult.error.message);
      const account = accountResult.data as {
        id: string;
        name: string;
        code: string | null;
        negotiated_rate_reference: string | null;
        default_billing_rule_id?: string | null;
      } | null;
      if (!account) {
        return { hints: [], defaultBillingRuleId: null, agreementLabel: null, contractRates: [] };
      }

      let plansQuery = supabaseAdmin
        .from("hotel_rate_plans")
        .select("id, code, name")
        .eq("restaurant_id", data.restaurantId)
        .eq("active", true);
      if (data.roomTypeId) plansQuery = plansQuery.eq("room_type_id", data.roomTypeId);
      const { data: plans } = await plansQuery;
      const planRows = (plans ?? []) as Array<{ id: string; code: string; name: string }>;

      let agreementResult = await supabaseAdmin
        .from("pms_corporate_agreements")
        .select("id, name, code, status, active, valid_from, valid_to, currency_code, pricing_method, rate_plan_scope, discount_type, discount_value, rate_plan_id, rate_plan_ids")
        .eq("restaurant_id", data.restaurantId)
        .eq("company_id", data.accountId)
        .order("valid_from", { ascending: false });
      if (agreementResult.error?.code === "42703" || agreementResult.error?.code === "PGRST204") {
        agreementResult = await supabaseAdmin
          .from("pms_corporate_agreements")
          .select("id, name, code, status, active, valid_from, valid_to, currency_code, rate_plan_id")
          .eq("restaurant_id", data.restaurantId)
          .eq("company_id", data.accountId)
          .order("valid_from", { ascending: false });
      }
      const agreementRows =
        agreementResult.error || !agreementResult.data
          ? []
          : (agreementResult.data as Array<Record<string, unknown>>);
      const agreementIds = agreementRows.map((row) => String(row.id));
      const currencyByAgreement = new Map(
        agreementRows.map((row) => [String(row.id), String(row.currency_code ?? "")]),
      );
      let contractRateRows: Array<Record<string, unknown>> = [];
      if (agreementIds.length > 0) {
        const ratesResult = await supabaseAdmin
          .from("pms_contract_rates")
          .select("agreement_id, room_type_id, amount, active")
          .eq("restaurant_id", data.restaurantId)
          .in("agreement_id", agreementIds);
        if (!ratesResult.error && ratesResult.data) {
          contractRateRows = ratesResult.data as Array<Record<string, unknown>>;
        }
      }
      const roomTypeIds = [
        ...new Set(
          contractRateRows
            .map((row) => (typeof row.room_type_id === "string" ? row.room_type_id : ""))
            .filter(Boolean),
        ),
      ];
      const roomNames = new Map<string, string>();
      if (roomTypeIds.length > 0) {
        const roomsResult = await supabaseAdmin
          .from("room_types")
          .select("id, name")
          .eq("restaurant_id", data.restaurantId)
          .in("id", roomTypeIds);
        for (const row of (roomsResult.data ?? []) as Array<{ id: string; name: string }>) {
          roomNames.set(row.id, row.name);
        }
      }

      const selected = selectCompanyBookingDefaults({
        arrival: data.arrival ?? null,
        defaultBillingRuleId: account.default_billing_rule_id ?? null,
        negotiatedReference: account.negotiated_rate_reference,
        accountCode: account.code,
        plans: planRows,
        agreements: agreementRows.map((row) => ({
          id: String(row.id),
          name: String(row.name ?? ""),
          code: String(row.code ?? ""),
          active: row.active !== false,
          status: row.status == null ? null : String(row.status),
          validFrom: String(row.valid_from ?? ""),
          validTo: String(row.valid_to ?? ""),
          ratePlanId: typeof row.rate_plan_id === "string" ? row.rate_plan_id : null,
          ratePlanIds: agreementRatePlanIds(row).filter((id) => id !== row.rate_plan_id),
          pricingMethod: row.pricing_method == null ? null : String(row.pricing_method),
          ratePlanScope: row.rate_plan_scope == null ? null : String(row.rate_plan_scope),
          discountType: row.discount_type == null ? null : String(row.discount_type),
          discountValue: row.discount_value == null ? null : Number(row.discount_value),
        })),
        contractRates: contractRateRows
          .filter((row) => row.active !== false && typeof row.room_type_id === "string")
          .map((row) => ({
            roomTypeId: String(row.room_type_id),
            roomTypeName: roomNames.get(String(row.room_type_id)) ?? "",
            amount: Number(row.amount ?? 0),
            currency: currencyByAgreement.get(String(row.agreement_id ?? "")) ?? "",
          })),
      });
      return selected;
    },
  );

/* --------------------------------------------------------------- repricing */

export const repriceReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema, ratePlanId: idSchema }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | {
          ok: true;
          id: string;
          subtotal: number;
          promotionDiscount: number;
          roomSubtotalAfterPromotion: number;
          promotionDropped: boolean;
        }
      | { ok: false; message: string }
    > => {
      const me = await requireRateManager(context as never, data.restaurantId);

      const { data: reservation } = await context.supabase
        .from("hotel_reservations")
        .select("id")
        .eq("id", data.reservationId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!reservation) return { ok: false, message: "Reservation not found for this property." };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: updated, error } = await supabaseAdmin.rpc("reprice_hotel_reservation", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _rate_plan_id: data.ratePlanId,
        _membership_id: me.id,
      });
      // Restriction / rate-plan rejections are expected outcomes, not server faults.
      if (error) return { ok: false, message: rateError(error.message).message };

      const row = updated as unknown as { id: string; room_subtotal: number | string };
      const { getReservationPromotionAttribution } = await import("./revenue/commercial-promotion.server");
      const attribution = await getReservationPromotionAttribution(supabaseAdmin, {
        restaurantId: data.restaurantId,
        reservationId: row.id,
      });
      const subtotal = Number(row.room_subtotal ?? 0);
      return {
        ok: true,
        id: row.id,
        subtotal,
        promotionDiscount: attribution?.discountAmount ?? 0,
        roomSubtotalAfterPromotion: attribution?.roomSubtotalAfterPromotion ?? subtotal,
        promotionDropped: !attribution,
      };
    },
  );

/* ---------------------------------------------------------------- overview */

export const getRevenueOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, from: dateSchema, to: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RevenueOverview> => {
    await requireModuleRole(context as never, data.restaurantId, "reports_analytics", REPORTS_ROLES, "You don't have access to Reports & Analytics for this property.");
    // Phase 8E2 — hotel revenue reporting is a PMS-owned read.
    const { requirePmsPackage } = await import("./pms-package.server");
    await requirePmsPackage(data.restaurantId);
    // An inverted range is normal mid-edit in the date pickers — normalize instead of failing.
    const from = data.to < data.from ? data.to : data.from;
    const to = data.to < data.from ? data.from : data.to;

    const dates = new Set(eachDate(from, to, 400));
    const days = dates.size;

    const { data: restaurant } = await context.supabase
      .from("restaurants")
      .select("currency_code")
      .eq("id", data.restaurantId)
      .maybeSingle();

    const { count: sellableRooms } = await context.supabase
      .from("hotel_rooms")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true);

    // Departure is exclusive, so a stay counts only while it overlaps the range.
    const { data: rows, error } = await context.supabase
      .from("hotel_reservations")
      .select("arrival_date, departure_date, room_subtotal, nightly_rate_snapshot")
      .eq("restaurant_id", data.restaurantId)
      .in("status", REVENUE_STATUSES as unknown as string[])
      .lte("arrival_date", to)
      .gt("departure_date", from);
    if (error) throw new Error(error.message);

    let soldNights = 0;
    let revenue = 0;
    let pricedNights = 0;

    for (const row of rows ?? []) {
      const nightly = parseSnapshot(row.nightly_rate_snapshot);
      const stayNights = eachDate(row.arrival_date, row.departure_date, 400).filter(
        (d) => d < row.departure_date && dates.has(d),
      );
      soldNights += stayNights.length;
      if (nightly.length === 0) continue;
      for (const night of nightly) {
        if (!dates.has(night.date)) continue;
        revenue += night.rate;
        pricedNights += 1;
      }
    }

    const availableRoomNights = (sellableRooms ?? 0) * days;
    const metrics = computeBookedRevenueOverview({
      soldRoomNights: soldNights,
      availableRoomNights,
      bookedRoomRevenue: revenue,
      pricedNights,
    });

    return {
      from,
      to,
      currency: restaurant?.currency_code ?? "USD",
      ...metrics,
    };
  });
