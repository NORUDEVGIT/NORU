/**
 * Revenue Control server function. Owner/manager only — not the Reports overview path.
 */

import { requirePmsActor } from "../pms-permissions.server";
import { PMS_PERMISSIONS } from "../pms-permissions";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { revenueControlQuerySchema } from "./revenue-control";
import { loadRevenueControlWorkspace } from "./revenue-control.server";
import { REVENUE_CONTROL_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const getRevenueControlWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => revenueControlQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenueControlWorkspace(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, REVENUE_CONTROL_LOAD_ERROR);
    }
  });
