/**
 * Server functions for Card 4 status loading and persistence.
 */
import { requirePmsActor } from "./pms-permissions.server";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadCard4StatusReport,
  persistCard4Status,
  type Card4StatusReport } from "./card4-readiness.server";

export { type Card4StatusReport };

export const getPmsCard4Status = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      restaurantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.CONFIG_GUEST_SETUP_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadCard4StatusReport(supabaseAdmin, data.restaurantId, context.userId);
  });

export const persistPmsCard4Status = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      restaurantId: z.string().uuid(),
      status: z.enum(["not_started", "in_progress", "complete"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.CONFIG_GUEST_SETUP_CONFIGURE);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return persistCard4Status(supabaseAdmin, data.restaurantId, data.status);
  });
