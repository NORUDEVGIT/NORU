/**
 * RR-P5-UI-01 — Commercial Overview / Promotions reads.
 * Rate Manager only. Does not mutate Property Setup masters.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import {
  loadCommercialOverviewWorkspace,
  loadPromotionPerformanceSummary,
  loadPromotionsWorkspace,
} from "./commercial-overview.server.ts";
import {
  COMMERCIAL_OVERVIEW_LOAD_ERROR,
  COMMERCIAL_PROMOTIONS_LOAD_ERROR,
  toRevenueReadError,
} from "./revenue-read-error.ts";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const workspaceSchema = z.object({
  restaurantId: idSchema,
  fromDate: dateSchema.optional().nullable(),
  toDate: dateSchema.optional().nullable(),
  roomTypeId: idSchema.optional().nullable(),
  ratePlanId: idSchema.optional().nullable(),
});

export const getCommercialOverviewWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workspaceSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadCommercialOverviewWorkspace(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, COMMERCIAL_OVERVIEW_LOAD_ERROR);
    }
  });

export const getPromotionsWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workspaceSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadPromotionsWorkspace(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, COMMERCIAL_PROMOTIONS_LOAD_ERROR);
    }
  });

export const getPromotionPerformanceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    workspaceSchema.extend({ activationId: idSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadPromotionPerformanceSummary(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, COMMERCIAL_PROMOTIONS_LOAD_ERROR);
    }
  });
