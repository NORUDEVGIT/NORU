import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  MEAL_PLAN_TYPES,
  PACKAGE_TYPES,
  TAX_POSTURES,
  type MealPlanType,
  type PackageType,
  type TaxPosture,
} from "./pms-set3-rates-guest";
import {
  CARD3_MEALS_AUDIT_SECTION,
  CARD3_MEALS_UNAVAILABLE,
  MEAL_PLAN_TYPE_LABELS,
  PACKAGE_COMPONENT_KIND_LABELS,
  PACKAGE_TYPE_LABELS,
  TAX_POSTURE_LABELS,
  evaluateMealsCard3Readiness,
  type Card3FoServiceRef,
  type Card3RatePlanRef,
  type Card3RoomAmenityRef,
  type Card3RoomTypeRef,
  type MealPlanCard3Row,
  type MealsCard3Snapshot,
  type PackageCard3Row,
  type PackageComponentCard3Row,
  type PackageComponentKind,
} from "./meals-card3.server";

// 0072 is intentionally not represented in generated types.ts until its approved apply.
// Keep the untyped database boundary isolated to this functions module.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

const idSchema = z.string().uuid();
const setupCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9_]{1,20}$/.test(value), "Use 1–20 letters, numbers, or underscores.");
const descriptionSchema = z.string().trim().max(500).optional();

const mealPlanSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(120),
  type: z.enum(MEAL_PLAN_TYPES),
  description: descriptionSchema,
  includesBreakfast: z.boolean(),
  includesLunch: z.boolean(),
  includesDinner: z.boolean(),
  taxPosture: z.enum(TAX_POSTURES),
  active: z.boolean(),
});

const packageSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(120),
  type: z.enum(PACKAGE_TYPES),
  description: descriptionSchema,
  packagePrice: z.number().min(0, "Package price cannot be negative.").max(10_000_000),
  active: z.boolean(),
  roomTypeIds: z.array(idSchema).max(200),
  ratePlanIds: z.array(idSchema).max(200),
});

const componentBase = {
  restaurantId: idSchema,
  id: idSchema.optional(),
  packageId: idSchema,
  quantity: z.number().positive("Quantity must be greater than zero.").max(1_000_000),
  sortOrder: z.number().int().min(0).max(1_000_000),
};
const componentSchema = z.discriminatedUnion("kind", [
  z.object({ ...componentBase, kind: z.literal("meal_plan"), mealPlanId: idSchema }),
  z.object({ ...componentBase, kind: z.literal("room_amenity"), roomAmenityId: idSchema }),
  z.object({ ...componentBase, kind: z.literal("fo_service"), foServiceId: idSchema }),
]);

function unavailable(error: { code?: string; message?: string } | null): never {
  if (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    error?.code === "PGRST204"
  ) {
    throw new Error(CARD3_MEALS_UNAVAILABLE);
  }
  throw new Error(error?.message ?? CARD3_MEALS_UNAVAILABLE);
}

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function asMealPlanType(value: unknown): MealPlanType {
  return (MEAL_PLAN_TYPES as readonly string[]).includes(String(value))
    ? (value as MealPlanType)
    : "custom";
}

function asPackageType(value: unknown): PackageType {
  return (PACKAGE_TYPES as readonly string[]).includes(String(value))
    ? (value as PackageType)
    : "custom";
}

function asTaxPosture(value: unknown): TaxPosture {
  return (TAX_POSTURES as readonly string[]).includes(String(value))
    ? (value as TaxPosture)
    : "inherit";
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
    metadata: { section: CARD3_MEALS_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card3-meals] audit", result.error.message);
}

function mapMealPlan(row: any): MealPlanCard3Row {
  const type = asMealPlanType(row.type);
  const taxPosture = asTaxPosture(row.tax_posture);
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    type,
    typeLabel: MEAL_PLAN_TYPE_LABELS[type],
    description: String(row.description ?? ""),
    includesBreakfast: row.includes_breakfast === true,
    includesLunch: row.includes_lunch === true,
    includesDinner: row.includes_dinner === true,
    taxPosture,
    taxPostureLabel: TAX_POSTURE_LABELS[taxPosture],
    active: row.active !== false,
  };
}

function mapRoomType(row: any): Card3RoomTypeRef {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    active: row.active !== false,
  };
}

function mapRoomAmenity(row: any): Card3RoomAmenityRef {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    category: String(row.category ?? ""),
    active: row.active !== false,
  };
}

function mapRatePlan(row: any): Card3RatePlanRef {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    active: row.active !== false,
  };
}

function mapFoService(row: any): Card3FoServiceRef {
  return {
    id: row.id,
    name: String(row.name ?? ""),
    active: row.active !== false,
  };
}

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<MealsCard3Snapshot> {
  const [
    restaurant,
    meals,
    packages,
    roomMappings,
    rateMappings,
    components,
    roomTypes,
    roomAmenities,
    ratePlans,
    foServices,
  ] = await Promise.all([
    db.from("restaurants").select("currency_code").eq("id", restaurantId).maybeSingle(),
    db
      .from("pms_meal_plans")
      .select(
        "id, code, name, type, description, includes_breakfast, includes_lunch, includes_dinner, tax_posture, active",
      )
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_packages")
      .select("id, code, name, type, description, package_price, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_package_room_types")
      .select("package_id, room_type_id")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_package_rate_plans")
      .select("package_id, rate_plan_id")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_package_components")
      .select(
        "id, package_id, component_kind, meal_plan_id, room_amenity_id, fo_service_id, quantity, sort_order",
      )
      .eq("restaurant_id", restaurantId)
      .order("sort_order"),
    db
      .from("room_types")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("room_amenities")
      .select("id, code, name, category, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("hotel_rate_plans")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("fo_service_catalogue")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
  ]);
  for (const result of [
    restaurant,
    meals,
    packages,
    roomMappings,
    rateMappings,
    components,
    roomTypes,
    roomAmenities,
    ratePlans,
    foServices,
  ]) {
    if (result.error) unavailable(result.error);
  }

  const mealRows = (meals.data ?? []).map(mapMealPlan);
  const roomTypeRows = (roomTypes.data ?? []).map(mapRoomType);
  const roomAmenityRows = (roomAmenities.data ?? []).map(mapRoomAmenity);
  const ratePlanRows = (ratePlans.data ?? []).map(mapRatePlan);
  const foServiceRows = (foServices.data ?? []).map(mapFoService);
  const mealById = new Map(mealRows.map((row) => [row.id, row.name]));
  const amenityById = new Map(roomAmenityRows.map((row) => [row.id, row.name]));
  const serviceById = new Map(foServiceRows.map((row) => [row.id, row.name]));
  const roomTypeIdsByPackage = new Map<string, string[]>();
  const ratePlanIdsByPackage = new Map<string, string[]>();

  for (const row of roomMappings.data ?? []) {
    const list = roomTypeIdsByPackage.get(String(row.package_id)) ?? [];
    list.push(String(row.room_type_id));
    roomTypeIdsByPackage.set(String(row.package_id), list);
  }
  for (const row of rateMappings.data ?? []) {
    const list = ratePlanIdsByPackage.get(String(row.package_id)) ?? [];
    list.push(String(row.rate_plan_id));
    ratePlanIdsByPackage.set(String(row.package_id), list);
  }

  const packageRows: PackageCard3Row[] = (packages.data ?? []).map((row: any) => {
    const type = asPackageType(row.type);
    return {
      id: row.id,
      code: String(row.code ?? "").toUpperCase(),
      name: String(row.name ?? ""),
      type,
      typeLabel: PACKAGE_TYPE_LABELS[type],
      description: String(row.description ?? ""),
      packagePrice: Number(row.package_price ?? 0),
      active: row.active !== false,
      roomTypeIds: roomTypeIdsByPackage.get(row.id) ?? [],
      ratePlanIds: ratePlanIdsByPackage.get(row.id) ?? [],
    };
  });

  const componentRows: PackageComponentCard3Row[] = (components.data ?? []).map((row: any) => {
    const kind = String(row.component_kind) as PackageComponentKind;
    const mealPlanId = row.meal_plan_id ? String(row.meal_plan_id) : null;
    const roomAmenityId = row.room_amenity_id ? String(row.room_amenity_id) : null;
    const foServiceId = row.fo_service_id ? String(row.fo_service_id) : null;
    return {
      id: row.id,
      packageId: String(row.package_id),
      kind,
      kindLabel: PACKAGE_COMPONENT_KIND_LABELS[kind] ?? String(row.component_kind),
      mealPlanId,
      roomAmenityId,
      foServiceId,
      sourceLabel:
        (mealPlanId && mealById.get(mealPlanId)) ||
        (roomAmenityId && amenityById.get(roomAmenityId)) ||
        (foServiceId && serviceById.get(foServiceId)) ||
        "",
      quantity: Number(row.quantity ?? 0),
      sortOrder: Number(row.sort_order ?? 0),
    };
  });

  return {
    currencyCode: String(restaurant.data?.currency_code ?? ""),
    mealPlans: mealRows,
    packages: packageRows,
    components: componentRows,
    roomTypes: roomTypeRows,
    roomAmenities: roomAmenityRows,
    ratePlans: ratePlanRows,
    foServices: foServiceRows,
  };
}

export { loadSnapshot as loadMealsCard3Snapshot };

async function loadAudit(db: DbClient, restaurantId: string) {
  const result = await db
    .from("restaurant_staff_audit_log")
    .select("id, action, created_at, metadata")
    .eq("restaurant_id", restaurantId)
    .contains("metadata", { section: CARD3_MEALS_AUDIT_SECTION })
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

async function requireOwnedIds(
  db: DbClient,
  table: string,
  restaurantId: string,
  ids: string[],
  message: string,
) {
  if (ids.length === 0) return;
  const result = await db.from(table).select("id").eq("restaurant_id", restaurantId).in("id", ids);
  if (result.error) unavailable(result.error);
  if ((result.data ?? []).length !== ids.length) throw new Error(message);
}

async function requireOwnedRecord(
  db: DbClient,
  table: string,
  restaurantId: string,
  id: string,
  message: string,
) {
  const result = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error(message);
}

export const getMealsCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return {
      snapshot,
      readiness: evaluateMealsCard3Readiness(snapshot),
      audit: await loadAudit(db, data.restaurantId),
    };
  });

export const saveMealPlanCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mealPlanSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    if (data.id) {
      await requireOwnedRecord(
        db,
        "pms_meal_plans",
        data.restaurantId,
        data.id,
        "That meal plan doesn't belong to this property.",
      );
    }
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      type: data.type,
      description: data.description?.trim() ? data.description.trim() : null,
      includes_breakfast: data.includesBreakfast,
      includes_lunch: data.includesLunch,
      includes_dinner: data.includesDinner,
      tax_posture: data.taxPosture,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_meal_plans")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_meal_plans").insert(payload);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "card3_meal_plan_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateMealsCard3Readiness(snapshot) };
  });

export const savePackageCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => packageSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const roomTypeIds = [...new Set(data.roomTypeIds)];
    const ratePlanIds = [...new Set(data.ratePlanIds)];
    await Promise.all([
      requireOwnedIds(
        db,
        "room_types",
        data.restaurantId,
        roomTypeIds,
        "Package room types must belong to this property.",
      ),
      requireOwnedIds(
        db,
        "hotel_rate_plans",
        data.restaurantId,
        ratePlanIds,
        "Package rate plans must belong to this property.",
      ),
      data.id
        ? requireOwnedRecord(
            db,
            "pms_packages",
            data.restaurantId,
            data.id,
            "That package doesn't belong to this property.",
          )
        : Promise.resolve(),
    ]);

    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      type: data.type,
      description: data.description?.trim() ? data.description.trim() : null,
      package_price: data.packagePrice,
      active: data.active,
    };
    let packageId = data.id;
    if (data.id) {
      const updated = await db
        .from("pms_packages")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db.from("pms_packages").insert(payload).select("id").maybeSingle();
      if (inserted.error) unavailable(inserted.error);
      packageId = inserted.data?.id;
    }
    if (!packageId) throw new Error("Package could not be saved.");

    const [removedRooms, removedRates] = await Promise.all([
      db
        .from("pms_package_room_types")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("package_id", packageId),
      db
        .from("pms_package_rate_plans")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("package_id", packageId),
    ]);
    if (removedRooms.error) unavailable(removedRooms.error);
    if (removedRates.error) unavailable(removedRates.error);

    const mappingWrites = [];
    if (roomTypeIds.length > 0) {
      mappingWrites.push(
        db.from("pms_package_room_types").insert(
          roomTypeIds.map((roomTypeId) => ({
            restaurant_id: data.restaurantId,
            package_id: packageId,
            room_type_id: roomTypeId,
          })),
        ),
      );
    }
    if (ratePlanIds.length > 0) {
      mappingWrites.push(
        db.from("pms_package_rate_plans").insert(
          ratePlanIds.map((ratePlanId) => ({
            restaurant_id: data.restaurantId,
            package_id: packageId,
            rate_plan_id: ratePlanId,
          })),
        ),
      );
    }
    for (const write of await Promise.all(mappingWrites)) {
      if (write.error) unavailable(write.error);
    }

    await writeAudit(db, data.restaurantId, context.userId, "card3_package_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateMealsCard3Readiness(snapshot) };
  });

export const savePackageComponentCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => componentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const source =
      data.kind === "meal_plan"
        ? { table: "pms_meal_plans", id: data.mealPlanId, label: "meal plan" }
        : data.kind === "room_amenity"
          ? { table: "room_amenities", id: data.roomAmenityId, label: "room amenity" }
          : { table: "fo_service_catalogue", id: data.foServiceId, label: "front-office service" };
    await Promise.all([
      requireOwnedRecord(
        db,
        "pms_packages",
        data.restaurantId,
        data.packageId,
        "That package doesn't belong to this property.",
      ),
      requireOwnedRecord(
        db,
        source.table,
        data.restaurantId,
        source.id,
        `That ${source.label} doesn't belong to this property.`,
      ),
      data.id
        ? requireOwnedRecord(
            db,
            "pms_package_components",
            data.restaurantId,
            data.id,
            "That package component doesn't belong to this property.",
          )
        : Promise.resolve(),
    ]);

    const payload = {
      restaurant_id: data.restaurantId,
      package_id: data.packageId,
      component_kind: data.kind,
      meal_plan_id: data.kind === "meal_plan" ? data.mealPlanId : null,
      room_amenity_id: data.kind === "room_amenity" ? data.roomAmenityId : null,
      fo_service_id: data.kind === "fo_service" ? data.foServiceId : null,
      quantity: data.quantity,
      sort_order: data.sortOrder,
    };
    const result = data.id
      ? await db
          .from("pms_package_components")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_package_components").insert(payload);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "card3_package_component_saved", {
      detail: `${data.kind} ${source.id}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateMealsCard3Readiness(snapshot) };
  });

export const deletePackageComponentCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    await requireOwnedRecord(
      db,
      "pms_package_components",
      data.restaurantId,
      data.id,
      "That package component doesn't belong to this property.",
    );
    const result = await db
      .from("pms_package_components")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "card3_package_component_deleted", {
      detail: data.id,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateMealsCard3Readiness(snapshot) };
  });
