/**
 * P6-STEP-01 — Competitor setup server functions.
 * Rate Manager only. Observation/fetch-run writes are not exposed here.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateError, requireRateManager } from "../rates.server";
import { COMPETITOR_SETUP_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error.ts";
import {
  createCompetitorProviderMapping as saveProviderMapping,
  createCompetitorRoomMapping as saveRoomMapping,
  createHotelCompetitor as saveCompetitor,
  getCompetitorSetupWorkspace as loadCompetitorSetupWorkspace,
  getHotelCompetitor as loadHotelCompetitor,
  listCompetitorProviderMappings as loadProviderMappings,
  listCompetitorRoomMappings as loadRoomMappings,
  listHotelCompetitors as loadHotelCompetitors,
  updateCompetitorProviderMapping as patchProviderMapping,
  updateCompetitorRoomMapping as patchRoomMapping,
  updateHotelCompetitor as patchCompetitor,
} from "./rate-shopping.server.ts";

const idSchema = z.string().uuid();

const restaurantSchema = z.object({ restaurantId: idSchema });
const competitorSchema = z.object({ restaurantId: idSchema, competitorId: idSchema });

const createCompetitorSchema = z.object({
  restaurantId: idSchema,
  name: z.string().min(1).max(160),
  locationLabel: z.string().max(160).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
});

const updateCompetitorSchema = z.object({
  restaurantId: idSchema,
  competitorId: idSchema,
  name: z.string().min(1).max(160).optional(),
  locationLabel: z.string().max(160).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
});

const createProviderSchema = z.object({
  restaurantId: idSchema,
  competitorId: idSchema,
  provider: z.string().min(1).max(80),
  externalPropertyId: z.string().min(1).max(160),
  externalPropertyName: z.string().max(160).nullable().optional(),
  active: z.boolean().optional(),
});

const updateProviderSchema = z.object({
  restaurantId: idSchema,
  mappingId: idSchema,
  provider: z.string().min(1).max(80).optional(),
  externalPropertyId: z.string().min(1).max(160).optional(),
  externalPropertyName: z.string().max(160).nullable().optional(),
  active: z.boolean().optional(),
});

const createRoomSchema = z.object({
  restaurantId: idSchema,
  competitorId: idSchema,
  provider: z.string().min(1).max(80),
  ourRoomTypeId: idSchema,
  externalRoomId: z.string().min(1).max(160),
  externalRoomName: z.string().max(160).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
});

const updateRoomSchema = z.object({
  restaurantId: idSchema,
  mappingId: idSchema,
  provider: z.string().min(1).max(80).optional(),
  ourRoomTypeId: idSchema.optional(),
  externalRoomId: z.string().min(1).max(160).optional(),
  externalRoomName: z.string().max(160).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
});

function writeError(error: unknown): never {
  throw rateError(error instanceof Error ? error.message : String(error));
}

export const getCompetitorSetupWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await loadCompetitorSetupWorkspace(supabaseAdmin, data.restaurantId);
    } catch (error) {
      throw toRevenueReadError(error, COMPETITOR_SETUP_LOAD_ERROR);
    }
  });

export const listHotelCompetitors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadHotelCompetitors(supabaseAdmin, data.restaurantId);
  });

export const getHotelCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => competitorSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadHotelCompetitor(supabaseAdmin, data);
  });

export const createHotelCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createCompetitorSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await saveCompetitor(supabaseAdmin, data);
    } catch (error) {
      writeError(error);
    }
  });

export const updateHotelCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateCompetitorSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await patchCompetitor(supabaseAdmin, data);
    } catch (error) {
      writeError(error);
    }
  });

export const listCompetitorProviderMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    restaurantSchema.extend({ competitorId: idSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadProviderMappings(supabaseAdmin, data);
  });

export const createCompetitorProviderMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createProviderSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await saveProviderMapping(supabaseAdmin, data);
    } catch (error) {
      writeError(error);
    }
  });

export const updateCompetitorProviderMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateProviderSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await patchProviderMapping(supabaseAdmin, data);
    } catch (error) {
      writeError(error);
    }
  });

export const listCompetitorRoomMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    restaurantSchema.extend({ competitorId: idSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadRoomMappings(supabaseAdmin, data);
  });

export const createCompetitorRoomMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createRoomSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await saveRoomMapping(supabaseAdmin, data);
    } catch (error) {
      writeError(error);
    }
  });

export const updateCompetitorRoomMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateRoomSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await patchRoomMapping(supabaseAdmin, data);
    } catch (error) {
      writeError(error);
    }
  });
