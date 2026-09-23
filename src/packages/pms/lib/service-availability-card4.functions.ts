import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import type { ServiceCategoryRecord } from "./service-categories-card4.server";
import {
  normalizeWeeklySchedule,
  parseWeeklySchedule,
  validateServiceAvailabilityDraft,
  type ServiceAvailabilityRecord,
  type ServiceAvailabilitySnapshot,
} from "./service-availability-card4.server";
import type { ServiceTypeRecord } from "./service-types-card4.server";

// Generated schema predates 0088.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();
const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    serviceTypeId: idSchema,
    weeklySchedule: z.unknown(),
    active: z.boolean(),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error("Service availability is unavailable until its approved migration is applied.");
  }
  throw new Error(error?.message ?? "Unable to load service availability.");
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

function mapAvailability(row: {
  id: string;
  service_type_id: string;
  weekly_schedule: unknown;
  active: boolean;
  created_at: string;
  updated_at: string;
}): ServiceAvailabilityRecord {
  return {
    id: row.id,
    serviceTypeId: row.service_type_id,
    weeklySchedule: parseWeeklySchedule(row.weekly_schedule),
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
    metadata: { section: "card4-service-availability", ...metadata } as unknown as Json,
  });
  if (result.error) {
    console.error("[card4-service-availability] audit", result.error.message);
  }
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<ServiceAvailabilitySnapshot> {
  const [propertyRes, categoriesRes, serviceTypesRes, availabilityRes] = await Promise.all([
    db.from("restaurants").select("timezone").eq("id", restaurantId).maybeSingle(),
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
      .from("pms_guest_service_availability")
      .select("id, service_type_id, weekly_schedule, active, created_at, updated_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at"),
  ]);

  if (propertyRes.error) unavailable(propertyRes.error);
  if (!propertyRes.data) throw new Error("Property not found.");
  if (categoriesRes.error) unavailable(categoriesRes.error);
  if (serviceTypesRes.error) unavailable(serviceTypesRes.error);
  if (availabilityRes.error) unavailable(availabilityRes.error);

  const categories = (categoriesRes.data ?? []).map(mapCategory);
  const serviceTypes = (serviceTypesRes.data ?? []).map(mapServiceType);
  const availability = (availabilityRes.data ?? []).map(mapAvailability);
  const lastUpdatedAt = availability.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return {
    categories,
    serviceTypes,
    availability,
    timezone: String(propertyRes.data.timezone ?? "UTC"),
    lastUpdatedAt,
  };
}

export { loadSnapshot as loadServiceAvailabilityCard4Snapshot };

export const getPmsCard4ServiceAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4ServiceAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const weeklySchedule = normalizeWeeklySchedule(parseWeeklySchedule(data.weeklySchedule));
    const errors = validateServiceAvailabilityDraft(
      {
        id: data.id ?? null,
        serviceTypeId: data.serviceTypeId,
        weeklySchedule,
        active: data.active,
      },
      snapshot.availability,
      snapshot.serviceTypes,
    );
    if (errors.length > 0) {
      throw new Error(errors[0]?.message ?? "Fix the availability schedule before saving.");
    }

    const payload = {
      restaurant_id: data.restaurantId,
      service_type_id: data.serviceTypeId,
      weekly_schedule: weeklySchedule as unknown as Json,
      active: data.active,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_guest_service_availability")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_guest_service_availability").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      throw new Error("This service type already has availability configured.");
    }
    if (result.error?.code === "23503") {
      throw new Error("Select a valid service type for this property.");
    }
    if (result.error?.code === "23514") {
      throw new Error("The weekly schedule must use a valid structured format.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save service availability.");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_service_availability_saved",
      { id, serviceTypeId: data.serviceTypeId },
    );
    return { ok: true as const, id };
  });

export const setPmsCard4ServiceAvailabilityActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_service_availability")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    if (!result.data) throw new Error("Availability configuration not found.");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_service_availability_toggled",
      { id: data.id, active: data.active },
    );
    return { ok: true as const };
  });

export const deletePmsCard4ServiceAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_service_availability")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error?.code === "23503") {
      throw new Error(
        "This availability configuration cannot be deleted because it is already in use.",
      );
    }
    if (result.error) unavailable(result.error);
    if (!result.data) throw new Error("Availability configuration not found.");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_service_availability_deleted",
      { id: data.id },
    );
    return { ok: true as const };
  });
