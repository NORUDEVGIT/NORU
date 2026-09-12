/**
 * FO-CLEAN1 — load / save existing 0042 restaurants fee columns only.
 *
 * No new columns. Audit prefers restaurant_staff_audit_log; a failed insert
 * does not roll back the four-column update.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import {
  FO_FEE_DEFAULTS_AUDIT_ACTION,
  FO_FEE_DEFAULTS_DENIED,
  canEditFoFeeDefaults,
  normalizeFoFeeDefaults,
  validateFoFeeDefaults,
  type FoFeeDefaults,
} from "./fo-fee-defaults";

const idSchema = z.string().uuid();

const defaultsSchema = z.object({
  restaurantId: idSchema,
  cancelFeeRequired: z.boolean(),
  cancelFeeDefault: z.number().min(0),
  noshowFeeRequired: z.boolean(),
  noshowFeeDefault: z.number().min(0),
});

type FeeRow = {
  fo_cancel_fee_required?: boolean | null;
  fo_cancel_fee_default?: number | string | null;
  fo_noshow_fee_required?: boolean | null;
  fo_noshow_fee_default?: number | string | null;
};

function rowToDefaults(row: FeeRow | null): FoFeeDefaults {
  return normalizeFoFeeDefaults({
    cancelFeeRequired: row?.fo_cancel_fee_required ?? true,
    cancelFeeDefault: Number(row?.fo_cancel_fee_default ?? 0) || 0,
    noshowFeeRequired: row?.fo_noshow_fee_required ?? true,
    noshowFeeDefault: Number(row?.fo_noshow_fee_default ?? 0) || 0,
  });
}

async function loadFeeRow(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
): Promise<FoFeeDefaults> {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("fo_cancel_fee_required, fo_cancel_fee_default, fo_noshow_fee_required, fo_noshow_fee_default")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return rowToDefaults(data as FeeRow | null);
}

export const getFoFeeDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ defaults: FoFeeDefaults; canEdit: boolean }> => {
      const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const defaults = await loadFeeRow(supabaseAdmin, data.restaurantId);
      return { defaults, canEdit: canEditFoFeeDefaults(me.role) };
    },
  );

export const saveFoFeeDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => defaultsSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; defaults: FoFeeDefaults; auditWritten: boolean }> => {
      const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
      if (!canEditFoFeeDefaults(me.role)) {
        throw new Error(FO_FEE_DEFAULTS_DENIED);
      }

      const after = normalizeFoFeeDefaults({
        cancelFeeRequired: data.cancelFeeRequired,
        cancelFeeDefault: data.cancelFeeDefault,
        noshowFeeRequired: data.noshowFeeRequired,
        noshowFeeDefault: data.noshowFeeDefault,
      });
      const invalid = validateFoFeeDefaults(after);
      if (invalid) throw new Error(invalid);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const before = await loadFeeRow(supabaseAdmin, data.restaurantId);

      const { error } = await supabaseAdmin
        .from("restaurants")
        .update({
          fo_cancel_fee_required: after.cancelFeeRequired,
          fo_cancel_fee_default: after.cancelFeeDefault,
          fo_noshow_fee_required: after.noshowFeeRequired,
          fo_noshow_fee_default: after.noshowFeeDefault,
        })
        .eq("id", data.restaurantId);
      if (error) throw new Error(error.message);

      let auditWritten = false;
      const { error: auditError } = await supabaseAdmin.from("restaurant_staff_audit_log").insert({
        restaurant_id: data.restaurantId,
        actor_user_id: context.userId,
        target_user_id: context.userId,
        action: FO_FEE_DEFAULTS_AUDIT_ACTION,
        metadata: { before, after },
      });
      if (auditError) {
        console.error("[saveFoFeeDefaults] audit", auditError.message);
      } else {
        auditWritten = true;
      }

      return { ok: true, defaults: after, auditWritten };
    },
  );
