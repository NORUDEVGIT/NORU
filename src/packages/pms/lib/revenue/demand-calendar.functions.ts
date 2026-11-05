/**
 * Demand Calendar server function for UI-15.
 * Owner/manager only. Reuses live demand, rate calendar, and pickup loaders.
 */

import { requirePmsActor } from "../pms-permissions.server";
import { PMS_PERMISSIONS } from "../pms-permissions";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { demandCalendarQuerySchema } from "./demand-calendar";
import { loadRevenueDemandCalendar } from "./demand-calendar.server";
import { DEMAND_CALENDAR_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const getRevenueDemandCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => demandCalendarQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenueDemandCalendar(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, DEMAND_CALENDAR_LOAD_ERROR);
    }
  });
