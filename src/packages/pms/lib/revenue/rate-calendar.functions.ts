/**
 * Rate Calendar server function. Owner/manager only.
 * Trusted property/catalogue reads use supabaseAdmin after requireRateManager.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import { rateCalendarQuerySchema } from "./rate-calendar";
import { loadRevenueRateCalendar } from "./rate-calendar.server";
import { RATE_CALENDAR_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const getRevenueRateCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rateCalendarQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenueRateCalendar(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, RATE_CALENDAR_LOAD_ERROR);
    }
  });
