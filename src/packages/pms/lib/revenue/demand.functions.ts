/**
 * Demand read server functions for UI-12–UI-15.
 * Owner/manager only. No snapshot writes. No forecast.
 */

import { requirePmsActor } from "../pms-permissions.server";
import { PMS_PERMISSIONS } from "../pms-permissions";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { demandQuerySchema } from "./demand";
import { loadRevenueDemandOverview } from "./demand.server";
import { DEMAND_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const getRevenueDemandOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => demandQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenueDemandOverview(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, DEMAND_LOAD_ERROR);
    }
  });
