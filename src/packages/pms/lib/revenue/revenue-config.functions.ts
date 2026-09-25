import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateManager } from "../rates.server";
import {
  loadRevenueBaseConfig,
  loadRevenueCatalogues,
  loadRevenueCommercialMasters,
  loadRevenueCorporateAgreements,
  loadRevenuePackages,
  loadRevenueRatePlans,
  loadRevenueRoomTypes,
} from "./revenue-config.server";
import { REVENUE_CONFIG_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

const idSchema = z.string().uuid();
const restaurantSchema = z.object({ restaurantId: idSchema });

export const REVENUE_CONFIG_STALE_MS = 60_000;

export const getRevenueBaseConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenueBaseConfig(supabaseAdmin, data.restaurantId, "");
    } catch (error) {
      throw toRevenueReadError(error, REVENUE_CONFIG_LOAD_ERROR);
    }
  });

export const listRevenueRoomTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenueRoomTypes(supabaseAdmin, data.restaurantId);
    } catch (error) {
      throw toRevenueReadError(error, REVENUE_CONFIG_LOAD_ERROR);
    }
  });

export const listRevenueRatePlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomTypeId: idSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadRevenueRatePlans(supabaseAdmin, data.restaurantId, data.roomTypeId);
    } catch (error) {
      throw toRevenueReadError(error, REVENUE_CONFIG_LOAD_ERROR);
    }
  });

export const listRevenueCatalogues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadRevenueCatalogues(supabaseAdmin, data.restaurantId);
  });

export const listRevenueCommercialMasters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadRevenueCommercialMasters(supabaseAdmin, data.restaurantId);
  });

export const listRevenuePackages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadRevenuePackages(supabaseAdmin, data.restaurantId);
  });

export const listRevenueCorporateAgreements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadRevenueCorporateAgreements(supabaseAdmin, data.restaurantId);
  });
