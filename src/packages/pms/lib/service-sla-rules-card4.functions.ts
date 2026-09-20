import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import type { ServiceCategoryRecord } from "./service-categories-card4.server";
import {
  parsePositiveMinutes,
  validateServiceSlaRuleDraft,
  type ServiceSlaRuleRecord,
  type ServiceSlaRuleSnapshot,
} from "./service-sla-rules-card4.server";
import type { ServiceTypeRecord } from "./service-types-card4.server";

// Generated schema predates 0087.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();
const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    serviceTypeId: idSchema,
    responseMinutes: z.string().trim().min(1).max(10),
    resolutionMinutes: z.string().trim().min(1).max(10),
    active: z.boolean(),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error("SLA rules are unavailable until their approved migration is applied.");
  }
  throw new Error(error?.message ?? "Unable to load SLA rules.");
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

function mapRule(row: {
  id: string;
  service_type_id: string;
  response_minutes: number;
  resolution_minutes: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}): ServiceSlaRuleRecord {
  return {
    id: row.id,
    serviceTypeId: row.service_type_id,
    responseMinutes: Number(row.response_minutes),
    resolutionMinutes: Number(row.resolution_minutes),
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
    metadata: { section: "card4-service-sla-rules", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-service-sla-rules] audit", result.error.message);
}

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<ServiceSlaRuleSnapshot> {
  const [categoriesRes, serviceTypesRes, rulesRes] = await Promise.all([
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
      .from("pms_guest_service_sla_rules")
      .select(
        "id, service_type_id, response_minutes, resolution_minutes, active, created_at, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at"),
  ]);

  if (categoriesRes.error) unavailable(categoriesRes.error);
  if (serviceTypesRes.error) unavailable(serviceTypesRes.error);
  if (rulesRes.error) unavailable(rulesRes.error);

  const categories = (categoriesRes.data ?? []).map(mapCategory);
  const serviceTypes = (serviceTypesRes.data ?? []).map(mapServiceType);
  const rules = (rulesRes.data ?? []).map(mapRule);
  const lastUpdatedAt = rules.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return { categories, serviceTypes, rules, lastUpdatedAt };
}

export { loadSnapshot as loadServiceSlaRulesCard4Snapshot };

export const getPmsCard4ServiceSlaRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4ServiceSlaRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const errors = validateServiceSlaRuleDraft(
      {
        id: data.id ?? null,
        serviceTypeId: data.serviceTypeId,
        responseMinutes: data.responseMinutes,
        resolutionMinutes: data.resolutionMinutes,
        active: data.active,
      },
      snapshot.rules,
      snapshot.serviceTypes,
    );
    if (errors.length > 0) {
      throw new Error(errors[0]?.message ?? "Fix the SLA rule before saving.");
    }
    const responseMinutes = parsePositiveMinutes(data.responseMinutes);
    const resolutionMinutes = parsePositiveMinutes(data.resolutionMinutes);
    if (responseMinutes === null || resolutionMinutes === null) {
      throw new Error("Enter valid positive whole-number durations.");
    }

    const payload = {
      restaurant_id: data.restaurantId,
      service_type_id: data.serviceTypeId,
      response_minutes: responseMinutes,
      resolution_minutes: resolutionMinutes,
      active: data.active,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_guest_service_sla_rules")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_guest_service_sla_rules").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      throw new Error("This service type already has an SLA rule.");
    }
    if (result.error?.code === "23503") {
      throw new Error("Select a valid service type for this property.");
    }
    if (result.error?.code === "23514") {
      throw new Error("SLA durations must be positive whole numbers of minutes.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save SLA rule.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_sla_rule_saved", {
      id,
      serviceTypeId: data.serviceTypeId,
      responseMinutes,
      resolutionMinutes,
    });
    return { ok: true as const, id };
  });

export const setPmsCard4ServiceSlaRuleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_service_sla_rules")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_sla_rule_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });

export const deletePmsCard4ServiceSlaRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_service_sla_rules")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error?.code === "23503") {
      throw new Error("This SLA rule cannot be deleted because it is already in use.");
    }
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_service_sla_rule_deleted", {
      id: data.id,
    });
    return { ok: true as const };
  });
