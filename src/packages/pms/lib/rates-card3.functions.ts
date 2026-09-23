import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  CARD3_RATES_AUDIT_SECTION,
  CARD3_RATES_UNAVAILABLE,
  evaluateRatesCard3Readiness,
  type Card2RoomTypeRef,
  type RateCalendarRow,
  type RateCategoryRow,
  type RatePlanRow,
  type RatesCard3Snapshot,
} from "./rates-card3.server";

type DbClient = any;

const idSchema = z.string().uuid();
const dateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.");
const setupCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9_]{1,30}$/.test(value), "Use 1–30 letters, numbers, or underscores.");

const categorySchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
});

const planSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  categoryId: idSchema,
  roomTypeId: idSchema,
  code: setupCode,
  name: z.string().trim().min(1).max(120),
  baseRate: z.number().min(0).max(10_000_000),
  active: z.boolean(),
});

const overrideSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  ratePlanId: idSchema,
  rateDate: dateSchema,
  nightlyRate: z.number().min(0).max(10_000_000),
});

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    throw new Error(CARD3_RATES_UNAVAILABLE);
  }
  throw new Error(error?.message ?? CARD3_RATES_UNAVAILABLE);
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
    metadata: { section: CARD3_RATES_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card3-rates] audit", result.error.message);
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

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<RatesCard3Snapshot> {
  const [types, categories, plans, calendar] = await Promise.all([
    db.from("room_types").select("id, code, name, active").eq("restaurant_id", restaurantId).order("code"),
    db.from("hotel_rate_categories").select("id, code, name, active").eq("restaurant_id", restaurantId).order("code"),
    db
      .from("hotel_rate_plans")
      .select("id, code, name, rate_category_id, room_type_id, currency, base_rate, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("hotel_rate_calendar")
      .select("id, rate_plan_id, rate_date, nightly_rate")
      .eq("restaurant_id", restaurantId)
      .order("rate_date", { ascending: false })
      .limit(120),
  ]);
  for (const result of [types, categories, plans, calendar]) {
    if (result.error) unavailable(result.error);
  }
  const roomTypes = (types.data ?? []).map(mapRoomType);
  const categoryRows = (categories.data ?? []).map(mapCategory);
  const typeById = new Map(roomTypes.map((row) => [row.id, row]));
  const categoryById = new Map(categoryRows.map((row) => [row.id, row]));
  const planRows: RatePlanRow[] = (plans.data ?? []).map((row: any) => {
    const type = typeById.get(row.room_type_id);
    const category = categoryById.get(row.rate_category_id);
    return {
      id: row.id,
      code: String(row.code ?? "").toUpperCase(),
      name: String(row.name ?? ""),
      categoryId: row.rate_category_id,
      categoryName: category?.name ?? "",
      roomTypeId: row.room_type_id,
      roomTypeCode: type?.code ?? "",
      roomTypeName: type?.name ?? "",
      currency: String(row.currency ?? ""),
      baseRate: Number(row.base_rate ?? 0),
      active: row.active !== false,
    };
  });
  const planById = new Map(planRows.map((row) => [row.id, row]));
  const calendarRows: RateCalendarRow[] = (calendar.data ?? []).map((row: any) => ({
    id: row.id,
    ratePlanId: row.rate_plan_id,
    ratePlanCode: planById.get(row.rate_plan_id)?.code ?? "",
    rateDate: String(row.rate_date ?? ""),
    nightlyRate: Number(row.nightly_rate ?? 0),
  }));
  return {
    roomTypes,
    categories: categoryRows,
    plans: planRows,
    calendar: calendarRows,
  };
}

export { loadSnapshot as loadRatesCard3Snapshot };

async function loadAudit(db: DbClient, restaurantId: string) {
  const result = await db
    .from("restaurant_staff_audit_log")
    .select("id, action, created_at, metadata")
    .eq("restaurant_id", restaurantId)
    .contains("metadata", { section: CARD3_RATES_AUDIT_SECTION })
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

export const getRatesCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return {
      snapshot,
      readiness: evaluateRatesCard3Readiness(snapshot),
      audit: await loadAudit(db, data.restaurantId),
    };
  });

export const saveRateCategoryCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categorySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
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
    await writeAudit(db, data.restaurantId, context.userId, "card3_rate_category_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard3Readiness(snapshot) };
  });

export const saveRatePlanCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const [category, roomType, restaurant] = await Promise.all([
      db.from("hotel_rate_categories").select("id").eq("id", data.categoryId).eq("restaurant_id", data.restaurantId).maybeSingle(),
      db.from("room_types").select("id").eq("id", data.roomTypeId).eq("restaurant_id", data.restaurantId).maybeSingle(),
      db.from("restaurants").select("currency_code").eq("id", data.restaurantId).maybeSingle(),
    ]);
    if (category.error) unavailable(category.error);
    if (roomType.error) unavailable(roomType.error);
    if (!category.data) throw new Error("That rate category doesn't belong to this property.");
    if (!roomType.data) throw new Error("That room type doesn't belong to this property.");

    const payload = {
      restaurant_id: data.restaurantId,
      rate_category_id: data.categoryId,
      room_type_id: data.roomTypeId,
      code: data.code,
      name: data.name,
      currency: String(restaurant.data?.currency_code ?? "USD"),
      base_rate: data.baseRate,
      active: data.active,
    };
    if (data.id) {
      const updated = await db.from("hotel_rate_plans").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db.from("hotel_rate_plans").insert(payload);
      if (inserted.error) unavailable(inserted.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card3_rate_plan_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard3Readiness(snapshot) };
  });

export const saveRateOverrideCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => overrideSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const plan = await db
      .from("hotel_rate_plans")
      .select("id")
      .eq("id", data.ratePlanId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (plan.error) unavailable(plan.error);
    if (!plan.data) throw new Error("That rate plan doesn't belong to this property.");

    const payload = {
      restaurant_id: data.restaurantId,
      rate_plan_id: data.ratePlanId,
      rate_date: data.rateDate,
      nightly_rate: data.nightlyRate,
    };
    const result = data.id
      ? await db.from("hotel_rate_calendar").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await db.from("hotel_rate_calendar").upsert(payload, { onConflict: "rate_plan_id,rate_date" });
    if (result.error) unavailable(result.error);

    await writeAudit(db, data.restaurantId, context.userId, "card3_rate_override_saved", {
      detail: `${data.rateDate} ${data.nightlyRate}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateRatesCard3Readiness(snapshot) };
  });
