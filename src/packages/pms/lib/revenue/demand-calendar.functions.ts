/**
 * Demand Calendar server function for UI-15.
 * Owner/manager only. Reuses live demand, rate calendar, and pickup loaders.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import { demandCalendarQuerySchema } from "./demand-calendar";
import { loadRevenueDemandCalendar } from "./demand-calendar.server";
import { DEMAND_CALENDAR_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const getRevenueDemandCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => demandCalendarQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenueDemandCalendar(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, DEMAND_CALENDAR_LOAD_ERROR);
    }
  });
