/**
 * RR-P8-UI-36-39 — Unified Revenue Audit Server Functions.
 * Rate Manager only. Provides unified audit trail and detailed operation diffs.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import { loadAuditOperationDetail, loadUnifiedRevenueAudit } from "./revenue-audit.server.ts";
import {
  REVENUE_AUDIT_DETAIL_LOAD_ERROR,
  REVENUE_AUDIT_LOAD_ERROR,
  toRevenueReadError,
} from "./revenue-read-error.ts";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const auditFilterSchema = z.object({
  restaurantId: idSchema,
  fromDate: dateSchema.optional().nullable(),
  toDate: dateSchema.optional().nullable(),
  domain: z
    .enum(["all", "rates", "restrictions", "commercial", "approvals", "overrides"])
    .optional()
    .nullable(),
  action: z.string().optional().nullable(),
  actorMembershipId: z.string().optional().nullable(),
  search: z.string().optional().nullable(),
  page: z.number().int().min(1).optional().nullable(),
  pageSize: z.number().int().min(1).max(100).optional().nullable(),
});

const auditDetailSchema = z.object({
  restaurantId: idSchema,
  eventId: z.string().min(1),
  sourceTable: z.string().min(1),
  operationId: z.string().optional().nullable(),
});

export const getUnifiedRevenueAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => auditFilterSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadUnifiedRevenueAudit(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, REVENUE_AUDIT_LOAD_ERROR);
    }
  });

export const getAuditOperationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => auditDetailSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadAuditOperationDetail(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, REVENUE_AUDIT_DETAIL_LOAD_ERROR);
    }
  });
