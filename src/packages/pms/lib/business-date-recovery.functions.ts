/**
 * Owner-only Business Date recovery server action. The date change and its
 * immutable audit row are written together by adjust_business_date, which
 * locks the property row and re-checks the expected date, the active Night
 * Audit run, and closed history. It never touches night_audit_runs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import {
  BUSINESS_DATE_OWNER_ONLY_MESSAGE,
  BUSINESS_DATE_REASON_MAX,
  businessDateAdjustmentError,
  businessDateAdjustmentProblem,
  canAdjustBusinessDate,
} from "./business-date-recovery";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type BusinessDateAdjustmentResult =
  | {
      ok: true;
      oldBusinessDate: string | null;
      newBusinessDate: string;
      changedAt: string;
      changedByMembershipId: string;
    }
  | { ok: false; message: string };

export const adjustBusinessDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: z.string().uuid(),
        /** The stored business date the owner saw. Null when it was never initialized. */
        expectedBusinessDate: dateSchema.nullable(),
        newBusinessDate: z.string(),
        reason: z.string().max(BUSINESS_DATE_REASON_MAX * 2),
        confirmation: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<BusinessDateAdjustmentResult> => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canAdjustBusinessDate(me.role))
      return { ok: false, message: BUSINESS_DATE_OWNER_ONLY_MESSAGE };

    const problem = businessDateAdjustmentProblem({
      currentBusinessDate: data.expectedBusinessDate,
      newBusinessDate: data.newBusinessDate,
      reason: data.reason,
      confirmation: data.confirmation,
    });
    if (problem) return { ok: false, message: problem };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabaseAdmin as any).rpc("adjust_business_date", {
      _restaurant_id: data.restaurantId,
      _expected_business_date: data.expectedBusinessDate,
      _new_business_date: data.newBusinessDate,
      _reason: data.reason.trim(),
      _membership_id: me.id,
    });
    if (error)
      return { ok: false, message: businessDateAdjustmentError(String(error.message ?? "")) };

    const saved = row as {
      old_business_date: string | null;
      new_business_date: string;
      changed_at: string;
      changed_by_membership_id: string;
    };
    return {
      ok: true,
      oldBusinessDate: saved.old_business_date ? saved.old_business_date.slice(0, 10) : null,
      newBusinessDate: saved.new_business_date.slice(0, 10),
      changedAt: saved.changed_at,
      changedByMembershipId: saved.changed_by_membership_id,
    };
  });
