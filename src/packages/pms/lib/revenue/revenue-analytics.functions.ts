/**
 * RR-P8-UI-31-35 — Revenue Performance & Commercial Analytics Server Functions.
 * Rate Manager only. Pure read models over authoritative stay-date snapshot allocations.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import {
  loadCommercialPerformance,
  loadRevenuePerformanceOverview,
} from "./revenue-analytics.server.ts";
import {
  COMMERCIAL_PERFORMANCE_LOAD_ERROR,
  REVENUE_ANALYTICS_LOAD_ERROR,
  toRevenueReadError,
} from "./revenue-read-error.ts";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const revenuePerformanceQuerySchema = z.object({
  restaurantId: idSchema,
  fromDate: dateSchema,
  toDate: dateSchema,
  roomTypeId: idSchema.optional().nullable(),
  ratePlanId: idSchema.optional().nullable(),
  marketSegmentId: z.string().optional().nullable(),
  commercialSourceId: z.string().optional().nullable(),
  technicalOrigin: z.string().optional().nullable(),
  salesChannelId: z.string().optional().nullable(),
});

const commercialPerformanceQuerySchema = z.object({
  restaurantId: idSchema,
  fromDate: dateSchema,
  toDate: dateSchema,
  roomTypeId: idSchema.optional().nullable(),
  ratePlanId: idSchema.optional().nullable(),
});

export const getRevenuePerformanceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revenuePerformanceQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenuePerformanceOverview(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, REVENUE_ANALYTICS_LOAD_ERROR);
    }
  });

export const getCommercialPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => commercialPerformanceQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadCommercialPerformance(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, COMMERCIAL_PERFORMANCE_LOAD_ERROR);
    }
  });
