/**
 * Pickup & Pace server function for UI-13.
 * Owner/manager only. Snapshot reads only. No capture. No forecast.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import { pickupPaceQuerySchema } from "./pickup-pace";
import { loadRevenuePickupPace } from "./pickup-pace.server";
import { PICKUP_PACE_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const getRevenuePickupPace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pickupPaceQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenuePickupPace(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, PICKUP_PACE_LOAD_ERROR);
    }
  });
