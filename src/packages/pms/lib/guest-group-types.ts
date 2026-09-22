/**
 * Group Type catalogue. Values live on pms_group_types — never hardcoded in Group UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireGuestManager } from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { GROUP_WORKSPACE_UNAVAILABLE } from "./guest-group-detail-workspace";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

export type GroupTypeRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
};

export async function loadGroupTypes(
  restaurantId: string,
  supabase: { from: (table: string) => unknown },
): Promise<GroupTypeRow[]> {
  const result = await admin(supabase)
    .from("pms_group_types")
    .select("id, code, name, description, active, sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order")
    .order("name");
  if (result.error && isMissingSchemaError(result.error)) return [];
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    active: boolean;
    sort_order: number;
  }>).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    active: row.active,
    sortOrder: row.sort_order,
  }));
}

export async function assertActiveGroupType(
  restaurantId: string,
  groupTypeId: string | null | undefined,
  supabase: { from: (table: string) => unknown },
): Promise<void> {
  if (!groupTypeId) return;
  const types = await loadGroupTypes(restaurantId, supabase);
  const match = types.find((row) => row.id === groupTypeId);
  if (!match) throw new Error("That group type is not configured for this property.");
  if (!match.active) throw new Error("That group type is inactive.");
}

export const listGroupTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GroupTypeRow[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    return loadGroupTypes(data.restaurantId, context.supabase);
  });

export const saveGroupType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        typeId: idSchema.optional(),
        code: z.string().trim().min(1).max(40),
        name: z.string().trim().min(1).max(120),
        description: z.string().max(400).optional().nullable(),
        active: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireGuestManager(context as never, data.restaurantId);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      description: data.description?.trim() || "",
      active: data.active ?? true,
      sort_order: data.sortOrder ?? 0,
    };
    if (data.typeId) {
      const updated = await admin(context.supabase)
        .from("pms_group_types")
        .update(payload)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.typeId)
        .select("id")
        .maybeSingle();
      if (updated.error && isMissingSchemaError(updated.error)) throw new Error(GROUP_WORKSPACE_UNAVAILABLE);
      if (updated.error) throw new Error(updated.error.message);
      if (!updated.data) throw new Error("That group type could not be found.");
      return { id: updated.data.id };
    }
    const inserted = await admin(context.supabase)
      .from("pms_group_types")
      .insert(payload)
      .select("id")
      .single();
    if (inserted.error && isMissingSchemaError(inserted.error)) throw new Error(GROUP_WORKSPACE_UNAVAILABLE);
    if (inserted.error) {
      if (inserted.error.code === "23505") throw new Error("A group type with that code already exists.");
      throw new Error(inserted.error.message);
    }
    if (!inserted.data) throw new Error("Could not save this group type.");
    return { id: inserted.data.id };
  });
