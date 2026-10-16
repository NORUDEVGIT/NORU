/**
 * Demand read server functions for UI-12–UI-15.
 * Owner/manager only. No snapshot writes. No forecast.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import { demandQuerySchema } from "./demand";
import { loadRevenueDemandOverview } from "./demand.server";
import { DEMAND_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const getRevenueDemandOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => demandQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenueDemandOverview(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, DEMAND_LOAD_ERROR);
    }
  });
