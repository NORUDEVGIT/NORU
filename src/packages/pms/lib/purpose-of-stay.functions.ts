import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import { requireReservationManager } from "./reservations.server";
import type { ContextPickOption } from "./create-reservation-phase1";

const idSchema = z.string().uuid();

export type PurposeOfStayRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
};

function mapRow(row: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
}): PurposeOfStayRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    active: row.active,
  };
}

export function purposeOptionsFromRows(rows: PurposeOfStayRow[] | null | undefined): ContextPickOption[] {
  return (rows ?? [])
    .filter((row) => row.active)
    .map((row) => ({ value: row.code, label: row.name, origin: "set6" as const }));
}

export const listPurposeOfStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<{ items: PurposeOfStayRow[]; available: boolean }> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { data: rows, error } = await context.supabase
      .from("pms_purpose_of_stay")
      .select("id, code, name, description, active")
      .eq("restaurant_id", data.restaurantId)
      .order("code");
    if (error && isMissingSchemaError(error)) return { items: [], available: false };
    if (error) throw new Error(error.message);
    return { items: ((rows ?? []) as never[]).map((row) => mapRow(row as never)), available: true };
  });

export const savePurposeOfStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema.optional(),
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(240).optional(),
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      description: data.description ?? "",
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin
          .from("pms_purpose_of_stay")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_purpose_of_stay").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That purpose-of-stay code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error("Purpose of stay is unavailable until its migration is applied.");
      throw new Error(result.error.message);
    }
    return { ok: true as const };
  });
