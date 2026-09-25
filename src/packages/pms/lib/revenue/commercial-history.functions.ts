/**
 * P5A-04 — Commercial history list/detail.
 * Rate Manager only.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import { COMMERCIAL_ACTION_TYPES, COMMERCIAL_ENTITY_TYPES } from "./commercial-engine.ts";
import { getCommercialOperationDetail as loadCommercialOperationDetail, listCommercialChangeHistory as loadCommercialChangeHistory } from "./commercial-history.server.ts";
import { COMMERCIAL_HISTORY_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error.ts";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const historyQuerySchema = z.object({
  restaurantId: idSchema,
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  entityType: z.enum(COMMERCIAL_ENTITY_TYPES).optional(),
  actionType: z.enum(COMMERCIAL_ACTION_TYPES).optional(),
  masterId: idSchema.optional(),
  entityId: idSchema.optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const listCommercialChangeHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => historyQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadCommercialChangeHistory(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, COMMERCIAL_HISTORY_LOAD_ERROR);
    }
  });

export const getCommercialOperationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, operationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadCommercialOperationDetail(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, COMMERCIAL_HISTORY_LOAD_ERROR);
    }
  });
