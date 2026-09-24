/**
 * Rate Change server functions for UI-03 / UI-04 / UI-05 / UI-06.
 * Owner/manager only. Preview is read-only. Apply is one transactional RPC.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import {
  rateChangeHistoryQuerySchema,
  rateChangeOperationQuerySchema,
  rateChangeRequestSchema,
} from "./rate-change";
import {
  applyRateChanges as applyRateChangesOnServer,
  getRateChangeOperationDetail as loadRateChangeOperationDetail,
  listRateChangeHistory as loadRateChangeHistory,
  previewRateChanges as previewRateChangesOnServer,
} from "./rate-change.server";

export const previewRateChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rateChangeRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    return previewRateChangesOnServer(context.supabase, data);
  });

export const applyRateChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rateChangeRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return applyRateChangesOnServer(context.supabase, supabaseAdmin, data, {
      membershipId: me.id,
      userId: context.userId,
    });
  });

export const listRateChangeHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rateChangeHistoryQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    return loadRateChangeHistory(context.supabase, data);
  });

export const getRateChangeOperationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rateChangeOperationQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    return loadRateChangeOperationDetail(context.supabase, data);
  });
