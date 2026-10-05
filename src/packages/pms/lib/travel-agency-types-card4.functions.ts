import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  loadTravelAgencyTypes,
  saveTravelAgencyTypesFallback,
  type TravelAgencyTypeRow,
} from "./guest-travel-agency-types";
import {
  normalizeTravelAgencyTypeCode,
  normalizeTravelAgencyTypeName,
  validateTravelAgencyTypeDraft,
  type TravelAgencyTypeRecord,
} from "./travel-agency-types-card4.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: z.string().max(12),
    name: z.string().max(120),
    description: z.string().max(400).optional().default(""),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(999),
  })
  .strict();

function toRecord(row: TravelAgencyTypeRow): TravelAgencyTypeRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
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
    metadata: { section: "card4-travel-agency-types", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-travel-agency-types] audit", result.error.message);
}

export type TravelAgencyTypeSnapshot = {
  types: TravelAgencyTypeRecord[];
  lastUpdatedAt: string | null;
};

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<TravelAgencyTypeSnapshot> {
  const types = (await loadTravelAgencyTypes(restaurantId, db)).map(toRecord);
  return {
    types,
    lastUpdatedAt: types.length > 0 ? new Date().toISOString() : null,
  };
}

export const getPmsCard4TravelAgencyTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4TravelAgencyType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const name = normalizeTravelAgencyTypeName(data.name);
    const code = normalizeTravelAgencyTypeCode(data.code);
    const errors = validateTravelAgencyTypeDraft(
      {
        id: data.id ?? null,
        code,
        name,
        description: data.description ?? "",
        active: data.active,
        sortOrder: data.sortOrder,
      },
      snapshot.types,
    );
    if (errors.length > 0) throw new Error(errors[0]!.message);

    const payload = {
      restaurant_id: data.restaurantId,
      code,
      name,
      description: data.description ? data.description.trim() : null,
      active: data.active,
      sort_order: data.sortOrder,
      updated_at: new Date().toISOString(),
    };

    let targetId = data.id;

    if (data.id && !data.id.startsWith("default-ta-type-")) {
      const updateResult = await db
        .from("pms_travel_agency_types")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updateResult.error && !isMissingSchemaError(updateResult.error)) {
        throw new Error(updateResult.error.message);
      }
    } else {
      const insertResult = await db
        .from("pms_travel_agency_types")
        .insert(payload)
        .select("id")
        .single();
      if (insertResult.error && !isMissingSchemaError(insertResult.error)) {
        throw new Error(insertResult.error.message);
      }
      targetId = insertResult.data?.id ?? data.id ?? `ta-type-${code.toLowerCase()}`;
    }

    const createdId = targetId ?? `ta-type-${code.toLowerCase()}`;
    const nextList: TravelAgencyTypeRecord[] = [...snapshot.types];
    const existingIndex = nextList.findIndex((t) => t.id === createdId || t.code === code);
    const newRecord: TravelAgencyTypeRecord = {
      id: createdId,
      code,
      name,
      description: data.description ? data.description.trim() : "",
      active: data.active,
      sortOrder: data.sortOrder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (existingIndex >= 0) {
      nextList[existingIndex] = newRecord;
    } else {
      nextList.push(newRecord);
    }
    await saveTravelAgencyTypesFallback(
      data.restaurantId,
      db,
      nextList.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        active: r.active,
        sortOrder: r.sortOrder,
      })),
    );

    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      data.id ? "travel_agency_type.updated" : "travel_agency_type.created",
      {
        id: createdId,
        code,
        name,
      },
    );
    return { id: createdId };
  });

export const setPmsCard4TravelAgencyTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: unknown) =>
      z
        .object({
          restaurantId: idSchema,
          id: z.string(),
          active: z.boolean(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;

    if (!data.id.startsWith("default-ta-type-")) {
      const updateResult = await db
        .from("pms_travel_agency_types")
        .update({ active: data.active, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updateResult.error && !isMissingSchemaError(updateResult.error)) {
        throw new Error(updateResult.error.message);
      }
    }

    const snapshot = await loadSnapshot(db, data.restaurantId);
    const targetCode = data.id.replace("default-ta-type-", "").toLowerCase();
    const updated = snapshot.types.map((t) =>
      t.id === data.id || t.code.toLowerCase() === targetCode
        ? { ...t, active: data.active }
        : t,
    );
    await saveTravelAgencyTypesFallback(
      data.restaurantId,
      db,
      updated.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        active: r.active,
        sortOrder: r.sortOrder,
      })),
    );

    await writeAudit(db, data.restaurantId, context.userId, "travel_agency_type.active_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });

export const deletePmsCard4TravelAgencyType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: unknown) =>
      z
        .object({
          restaurantId: idSchema,
          id: z.string(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    if (!data.id.startsWith("default-ta-type-")) {
      const result = await db
        .from("pms_travel_agency_types")
        .delete()
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (result.error && !isMissingSchemaError(result.error)) {
        throw new Error(result.error.message);
      }
    }

    const snapshot = await loadSnapshot(db, data.restaurantId);
    const targetCode = data.id.replace("default-ta-type-", "").toLowerCase();
    const nextList = snapshot.types.filter(
      (t) =>
        t.id !== data.id &&
        t.code.toLowerCase() !== targetCode,
    );
    await saveTravelAgencyTypesFallback(
      data.restaurantId,
      db,
      nextList.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        active: r.active,
        sortOrder: r.sortOrder,
      })),
    );

    await writeAudit(db, data.restaurantId, context.userId, "travel_agency_type.deleted", { id: data.id });
    return { ok: true as const };
  });
