/**
 * Setup-owned guest preference options (Wave 2).
 *
 * Bed / view / food / communication catalogues live here. Room types and
 * hotel floors stay on SET2 tables. Meal plans are never food preferences.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  PREFERENCE_OPTION_CATEGORIES,
  WAVE2_MIGRATION_UNAVAILABLE,
  type PreferenceOptionCategory,
} from "./guest-profile-wave2";

const idSchema = z.string().uuid();

export type PmsPreferenceOption = {
  id: string;
  category: PreferenceOptionCategory;
  code: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

export const PREFERENCE_OPTION_AUDIT = "pms_preference_option_updated";

function mapOption(row: {
  id: string;
  category: string;
  code: string;
  name: string;
  active: boolean;
  sort_order: number;
}): PmsPreferenceOption {
  return {
    id: row.id,
    category: row.category as PreferenceOptionCategory,
    code: row.code,
    name: row.name,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

export const listPmsPreferenceOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(
    async ({ data, context }): Promise<{ available: boolean; options: PmsPreferenceOption[] }> => {
      await withPmsPackage(
        data.restaurantId,
        callerMembership(context as never, data.restaurantId),
      );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error } = await supabaseAdmin
        .from("pms_preference_options")
        .select("id, category, code, name, active, sort_order")
        .eq("restaurant_id", data.restaurantId)
        .order("category")
        .order("sort_order");
      if (error) {
        if (isMissingSchemaError(error)) return { available: false, options: [] };
        throw new Error(error.message);
      }
      return { available: true, options: (rows ?? []).map(mapOption) };
    },
  );

export const savePmsPreferenceOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema.optional(),
        category: z.enum(PREFERENCE_OPTION_CATEGORIES),
        code: z.string().trim().min(1).max(40),
        name: z.string().trim().min(1).max(120),
        active: z.boolean(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      restaurant_id: data.restaurantId,
      category: data.category,
      code: data.code.toUpperCase(),
      name: data.name,
      active: data.active,
      sort_order: data.sortOrder ?? 0,
    };
    const result = data.id
      ? await supabaseAdmin
          .from("pms_preference_options")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_preference_options").insert(payload);
    if (result.error) {
      if (result.error.code === "23505")
        throw new Error("That preference option code is already used for this category.");
      if (isMissingSchemaError(result.error)) throw new Error(WAVE2_MIGRATION_UNAVAILABLE);
      throw new Error(result.error.message);
    }
    return { ok: true as const };
  });
