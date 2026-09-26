/**
 * RR-P8-UI-40 — CSV Export Server Functions.
 * Rate Manager only. Generates downloadable RFC-4180 CSV reports.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import {
  exportCommercialPerformance,
  exportRevenuePerformance,
  exportUnifiedRevenueAudit,
} from "./revenue-export.server.ts";
import { REVENUE_EXPORT_ERROR, toRevenueReadError } from "./revenue-read-error.ts";

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

const auditFilterSchema = z.object({
  restaurantId: idSchema,
  fromDate: dateSchema.optional().nullable(),
  toDate: dateSchema.optional().nullable(),
  domain: z.enum(["all", "rates", "restrictions", "commercial", "approvals"]).optional().nullable(),
  action: z.string().optional().nullable(),
  actorMembershipId: z.string().optional().nullable(),
  search: z.string().optional().nullable(),
});

export const exportRevenuePerformanceCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revenuePerformanceQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await exportRevenuePerformance(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, REVENUE_EXPORT_ERROR);
    }
  });

export const exportCommercialPerformanceCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => commercialPerformanceQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await exportCommercialPerformance(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, REVENUE_EXPORT_ERROR);
    }
  });

export const exportUnifiedRevenueAuditCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => auditFilterSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await exportUnifiedRevenueAudit(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, REVENUE_EXPORT_ERROR);
    }
  });
