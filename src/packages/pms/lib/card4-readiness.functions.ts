/**
 * Server functions for Card 4 status loading and persistence.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import { canEditSet1, SET1_DENIED } from "./pms-set1-foundation";
import {
  loadCard4StatusReport,
  persistCard4Status,
  type Card4StatusReport,
} from "./card4-readiness.server";

export { type Card4StatusReport };

export const getPmsCard4Status = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      restaurantId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadCard4StatusReport(supabaseAdmin, data.restaurantId, context.userId);
  });

export const persistPmsCard4Status = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      restaurantId: z.string().uuid(),
      status: z.enum(["not_started", "in_progress", "complete"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return persistCard4Status(supabaseAdmin, data.restaurantId, data.status);
  });
