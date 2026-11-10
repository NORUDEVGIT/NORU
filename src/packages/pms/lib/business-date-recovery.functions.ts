/**
 * Business Date recovery, separate from End of Day. adjust_business_date locks
 * the property row and re-checks the expected date, the active Night Audit run,
 * and closed history. A blocker-free open run on the old date is marked
 * superseded (never deleted); closed runs are never changed. The caller must
 * hold night_audit.business_date.recover.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit } from "@/core/lib/workforce.server";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { requirePmsActor } from "./pms-permissions.server";
import {
  BUSINESS_DATE_REASON_MAX,
  businessDateAdjustmentError,
  businessDateAdjustmentProblem,
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
    const me = await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE,
    );

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
    try {
      await audit(supabaseAdmin, {
        restaurantId: data.restaurantId,
        actorUserId: (context as { userId: string }).userId,
        targetUserId: null,
        action: "business_date_recovered",
        metadata: {
          section: "night_audit",
          oldBusinessDate: saved.old_business_date ? saved.old_business_date.slice(0, 10) : null,
          newBusinessDate: saved.new_business_date.slice(0, 10),
          membershipId: me.id,
        },
      });
    } catch (auditError) {
      console.error(
        "[business-date-recovery] audit",
        auditError instanceof Error ? auditError.message : auditError,
      );
    }
    return {
      ok: true,
      oldBusinessDate: saved.old_business_date ? saved.old_business_date.slice(0, 10) : null,
      newBusinessDate: saved.new_business_date.slice(0, 10),
      changedAt: saved.changed_at,
      changedByMembershipId: saved.changed_by_membership_id,
    };
  });
