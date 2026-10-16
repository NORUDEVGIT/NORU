/**
 * Restriction Change server functions for UI-08 / UI-09 / UI-10 / UI-11.
 * Owner/manager only. Preview is read-only. Apply is one transactional RPC.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import {
  restrictionChangeHistoryQuerySchema,
  restrictionChangeOperationQuerySchema,
  restrictionChangeRequestSchema,
} from "./restriction-change";
import {
  getRestrictionOperationDetail as loadRestrictionOperationDetail,
  listRestrictionChangeHistory as loadRestrictionChangeHistory,
  previewRestrictionChanges as previewRestrictionChangesOnServer,
} from "./restriction-change.server";
import { executeOrSubmitRestrictionChange } from "./revenue-approval.server";
import { RESTRICTION_HISTORY_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const previewRestrictionChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restrictionChangeRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    return previewRestrictionChangesOnServer(context.supabase, data);
  });

export const applyRestrictionChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restrictionChangeRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return executeOrSubmitRestrictionChange(context.supabase, supabaseAdmin, data, {
      membershipId: me.id,
      userId: context.userId,
    });
  });

export const listRestrictionChangeHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restrictionChangeHistoryQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRestrictionChangeHistory(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, RESTRICTION_HISTORY_LOAD_ERROR);
    }
  });

export const getRestrictionOperationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restrictionChangeOperationQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRestrictionOperationDetail(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, RESTRICTION_HISTORY_LOAD_ERROR);
    }
  });
