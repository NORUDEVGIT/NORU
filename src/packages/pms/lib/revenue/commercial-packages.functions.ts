/**
 * RR-P5-UI-02 — Packages workspace / performance reads.
 * Rate Manager only. Does not mutate Property Setup masters.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import { loadPackagePerformanceSummary, loadPackagesWorkspace } from "./commercial-packages.server.ts";
import { COMMERCIAL_PACKAGES_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error.ts";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const workspaceSchema = z.object({
  restaurantId: idSchema,
  fromDate: dateSchema.optional().nullable(),
  toDate: dateSchema.optional().nullable(),
  roomTypeId: idSchema.optional().nullable(),
  ratePlanId: idSchema.optional().nullable(),
});

export const getPackagesWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workspaceSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadPackagesWorkspace(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, COMMERCIAL_PACKAGES_LOAD_ERROR);
    }
  });

export const getPackagePerformanceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    workspaceSchema
      .extend({
        packageId: idSchema.optional(),
        activationId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadPackagePerformanceSummary(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, COMMERCIAL_PACKAGES_LOAD_ERROR);
    }
  });
