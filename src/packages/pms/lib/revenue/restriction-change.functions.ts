/**
 * Restriction Change server functions for UI-08 / UI-09 / UI-10 / UI-11.
 * Owner/manager only. Preview is read-only. Apply is one transactional RPC.
 */

import { requirePmsActor } from "../pms-permissions.server";
import { PMS_PERMISSIONS } from "../pms-permissions";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  restrictionChangeHistoryQuerySchema,
  restrictionChangeOperationQuerySchema,
  restrictionChangeRequestSchema } from "./restriction-change";
import {
  getRestrictionOperationDetail as loadRestrictionOperationDetail,
  listRestrictionChangeHistory as loadRestrictionChangeHistory,
  previewRestrictionChanges as previewRestrictionChangesOnServer } from "./restriction-change.server";
import { executeOrSubmitRestrictionChange } from "./revenue-approval.server";
import { RESTRICTION_HISTORY_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const previewRestrictionChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => restrictionChangeRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    return previewRestrictionChangesOnServer(context.supabase, data);
  });

export const applyRestrictionChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => restrictionChangeRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_RESTRICTION_CONFIGURE);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return executeOrSubmitRestrictionChange(context.supabase, supabaseAdmin, data, {
      membershipId: me.id,
      userId: context.userId });
  });

export const listRestrictionChangeHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => restrictionChangeHistoryQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRestrictionChangeHistory(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, RESTRICTION_HISTORY_LOAD_ERROR);
    }
  });

export const getRestrictionOperationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => restrictionChangeOperationQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRestrictionOperationDetail(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, RESTRICTION_HISTORY_LOAD_ERROR);
    }
  });
