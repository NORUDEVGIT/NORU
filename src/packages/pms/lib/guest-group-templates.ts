/**
 * Group templates are reusable creation defaults.
 * Applying a template copies payload into a new group — it is not a second group.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireGuestManager } from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { emptyGuestGroupCreateDraft, type GuestGroupCreateDraft } from "./guest-group-create-workspace";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

export type GroupTemplatePayload = {
  groupTypeId?: string | null;
  marketSegmentId?: string | null;
  sourceCodeId?: string | null;
  expectedPax?: number | null;
  expectedRooms?: number | null;
  notes?: string | null;
  specialRequests?: string | null;
  billingArrangement?: string | null;
  mealPlanId?: string | null;
  ratePlanId?: string | null;
  packageId?: string | null;
  stayNights?: number | null;
};

export type GroupTemplateRow = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  payload: GroupTemplatePayload;
  createdAt: string;
  updatedAt: string;
};

export const GROUP_TEMPLATE_COPY =
  "A template copies defaults into a new group. It is not a live group and does not share an ID.";

export function applyGroupTemplateToDraft(payload: GroupTemplatePayload): GuestGroupCreateDraft {
  const draft = emptyGuestGroupCreateDraft();
  draft.groupTypeId = payload.groupTypeId ?? "";
  draft.marketSegmentId = payload.marketSegmentId ?? "";
  draft.sourceCodeId = payload.sourceCodeId ?? "";
  draft.expectedPax = payload.expectedPax != null ? String(payload.expectedPax) : "";
  draft.expectedRooms = payload.expectedRooms != null ? String(payload.expectedRooms) : "";
  draft.notes = payload.notes ?? "";
  draft.specialRequests = payload.specialRequests ?? "";
  draft.billingArrangement = payload.billingArrangement ?? "";
  draft.mealPlanId = payload.mealPlanId ?? "";
  draft.ratePlanId = payload.ratePlanId ?? "";
  draft.packageId = payload.packageId ?? "";
  return draft;
}

function mapTemplate(row: Record<string, unknown>): GroupTemplateRow {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    active: Boolean(row.active),
    payload: (row.payload && typeof row.payload === "object" ? row.payload : {}) as GroupTemplatePayload,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export const listGroupTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GroupTemplateRow[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await admin(supabaseAdmin)
      .from("pms_group_templates")
      .select("id, name, description, active, payload, created_at, updated_at")
      .eq("restaurant_id", data.restaurantId)
      .order("name");
    if (result.error && isMissingSchemaError(result.error)) return [];
    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as Array<Record<string, unknown>>).map(mapTemplate);
  });

export const saveGroupTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        templateId: idSchema.optional(),
        name: z.string().trim().min(1).max(200),
        description: z.string().max(2000).optional().nullable(),
        active: z.boolean().optional(),
        payload: z.record(z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const columns = {
      name: data.name.trim(),
      description: data.description?.trim() ?? "",
      active: data.active ?? true,
      payload: data.payload ?? {},
    };
    if (data.templateId) {
      const updated = await db
        .from("pms_group_templates")
        .update(columns)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.templateId)
        .select("id")
        .maybeSingle();
      if (updated.error) throw new Error(updated.error.message);
      if (!updated.data) throw new Error("That template could not be found.");
      return { id: data.templateId };
    }
    const inserted = await db
      .from("pms_group_templates")
      .insert({ ...columns, restaurant_id: data.restaurantId })
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    return { id: inserted.data.id as string };
  });

export const deleteGroupTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, templateId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await admin(supabaseAdmin)
      .from("pms_group_templates")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.templateId);
    if (result.error && !isMissingSchemaError(result.error)) throw new Error(result.error.message);
    return { ok: true as const };
  });
