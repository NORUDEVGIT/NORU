/**
 * Rate Change server functions for UI-03 / UI-04 / UI-05 / UI-06.
 * Owner/manager only. Preview is read-only. Apply is one transactional RPC.
 */

import { requirePmsActor } from "../pms-permissions.server";
import { PMS_PERMISSIONS } from "../pms-permissions";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  rateChangeHistoryQuerySchema,
  rateChangeOperationQuerySchema,
  rateChangeRequestSchema } from "./rate-change";
import {
  getRateChangeOperationDetail as loadRateChangeOperationDetail,
  listRateChangeHistory as loadRateChangeHistory,
  previewRateChanges as previewRateChangesOnServer } from "./rate-change.server";
import { executeOrSubmitRateChange } from "./revenue-approval.server";
import { RATE_HISTORY_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const previewRateChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => rateChangeRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    return previewRateChangesOnServer(context.supabase, data);
  });

export const applyRateChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => rateChangeRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_CALENDAR_OVERRIDE);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return executeOrSubmitRateChange(context.supabase, supabaseAdmin, data, {
      membershipId: me.id,
      userId: context.userId });
  });

export const listRateChangeHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => rateChangeHistoryQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRateChangeHistory(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, RATE_HISTORY_LOAD_ERROR);
    }
  });

export const getRateChangeOperationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => rateChangeOperationQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRateChangeOperationDetail(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, RATE_HISTORY_LOAD_ERROR);
    }
  });
