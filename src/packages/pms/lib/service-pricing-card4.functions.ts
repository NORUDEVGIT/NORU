import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import type { ServiceCategoryRecord } from "./service-categories-card4.server";
import {
  SERVICE_PRICING_UNITS,
  normalizeServicePricingAmount,
  validateServicePricingDraft,
  type ServicePricingRecord,
  type ServicePricingSnapshot,
} from "./service-pricing-card4.server";
import type { ServiceTypeRecord } from "./service-types-card4.server";

// Generated schema predates 0085.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    serviceTypeId: idSchema,
    amount: z.string().trim().min(1).max(14),
    pricingUnit: z.enum(SERVICE_PRICING_UNITS),
    active: z.boolean(),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error("Service pricing is unavailable until its approved migration is applied.");
  }
  throw new Error(error?.message ?? "Unable to load service pricing.");
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

function mapServiceType(row: {
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

function mapPricing(row: {
  id: string;
  service_type_id: string;
  amount: string | number;
  currency_code: string;
  pricing_unit: ServicePricingRecord["pricingUnit"];
  active: boolean;
  created_at: string;
  updated_at: string;
}): ServicePricingRecord {
  return {
    id: row.id,
    serviceTypeId: row.service_type_id,
    amount: Number(row.amount).toFixed(2),
    currencyCode: row.currency_code,
    pricingUnit: row.pricing_unit,
    active: row.active,
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
    metadata: { section: "card4-service-pricing", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-service-pricing] audit", result.error.message);
}

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<ServicePricingSnapshot> {
  const [restaurantRes, categoriesRes, serviceTypesRes, pricingRes] = await Promise.all([
    db.from("restaurants").select("currency_code").eq("id", restaurantId).maybeSingle(),
    db
      .from("pms_guest_service_categories")
      .select("id, name, code, description, active, display_order, created_at, updated_at")
      .eq("restaurant_id", restaurantId)
      .order("display_order")
      .order("name"),
    db
      .from("pms_guest_service_types")
      .select(
        "id, category_id, name, code, description, active, display_order, created_at, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("display_order")
      .order("name"),
    db
      .from("pms_guest_service_pricing")
      .select(
        "id, service_type_id, amount, currency_code, pricing_unit, active, created_at, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at"),
  ]);

  if (restaurantRes.error) unavailable(restaurantRes.error);
  if (categoriesRes.error) unavailable(categoriesRes.error);
  if (serviceTypesRes.error) unavailable(serviceTypesRes.error);
  if (pricingRes.error) unavailable(pricingRes.error);

  const currencyCode = String(restaurantRes.data?.currency_code ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("Configure the property's primary currency before adding service pricing.");
  }

  const categories = (categoriesRes.data ?? []).map(mapCategory);
  const serviceTypes = (serviceTypesRes.data ?? []).map(mapServiceType);
  const pricing = (pricingRes.data ?? []).map(mapPricing);
  const lastUpdatedAt = pricing.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return { currencyCode, categories, serviceTypes, pricing, lastUpdatedAt };
}

export { loadSnapshot as loadServicePricingCard4Snapshot };

export const getPmsCard4ServicePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4ServicePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const errors = validateServicePricingDraft(
      {
        id: data.id ?? null,
        serviceTypeId: data.serviceTypeId,
        amount: data.amount,
        pricingUnit: data.pricingUnit,
        active: data.active,
      },
      snapshot.pricing,
      snapshot.serviceTypes,
    );
    if (errors.length > 0) {
      throw new Error(errors[0]?.message ?? "Fix the pricing record before saving.");
    }
    const amount = normalizeServicePricingAmount(data.amount);
    if (amount === null) throw new Error("Enter a valid non-negative amount.");

    const payload = {
      restaurant_id: data.restaurantId,
      service_type_id: data.serviceTypeId,
      amount,
      currency_code: snapshot.currencyCode,
      pricing_unit: data.pricingUnit,
      active: data.active,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_guest_service_pricing")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_guest_service_pricing").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      throw new Error("This service type already has pricing configured.");
    }
    if (result.error?.code === "23503") {
      throw new Error("Select a valid service type for this property.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save service pricing.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_pricing_saved", {
      id,
      serviceTypeId: data.serviceTypeId,
      pricingUnit: data.pricingUnit,
    });
    return { ok: true as const, id };
  });

export const setPmsCard4ServicePricingActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_service_pricing")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_pricing_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });

export const deletePmsCard4ServicePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_service_pricing")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error?.code === "23503") {
      throw new Error("This pricing cannot be deleted because it is already in use.");
    }
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_pricing_deleted", {
      id: data.id,
    });
    return { ok: true as const };
  });
