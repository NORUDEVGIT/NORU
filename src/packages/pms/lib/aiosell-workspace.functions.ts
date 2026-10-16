/**
 * AIOS-07 Aiosell operator actions.
 * Owner and manager only, same gate as Distribution.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncAiosellPropertyMetadata } from "./distribution/aiosell-ari.server";
import {
  recordAiosellValidationResult,
  setAiosellRateMappingActive,
  setAiosellRoomMappingActive,
  activateAiosellBookingChannel,
  upsertAiosellConnectionRecord,
  upsertAiosellRateMappingRecord,
  upsertAiosellRoomMappingRecord,
} from "./distribution/aiosell-connection.server";
import { reconcileAiosellPropertyReservations } from "./distribution/aiosell-reconcile.server";
import {
  aiosellReconcileDisplay,
  aiosellValidationMessage,
} from "./distribution/aiosell-workspace";
import { loadAiosellWorkspace } from "./distribution/aiosell-workspace.server";
import { requireDistributionManager } from "./distribution.server";

const idSchema = z.string().uuid();
const environmentSchema = z.enum(["sandbox", "production"]);

const scope = z.object({
  restaurantId: idSchema,
  environment: environmentSchema,
});

export const getAiosellWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => scope.parse(input))
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    return loadAiosellWorkspace(data);
  });

export const saveAiosellConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    scope
      .extend({
        partnerSlug: z.string().trim().min(1),
        hotelCode: z.string().trim().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    await upsertAiosellConnectionRecord({
      restaurantId: data.restaurantId,
      provider: "aiosell",
      environment: data.environment,
      partnerSlug: data.partnerSlug,
      hotelCode: data.hotelCode,
    });
    return loadAiosellWorkspace(data);
  });

export const validateAiosellConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => scope.parse(input))
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    const result = await syncAiosellPropertyMetadata(data);
    const error = aiosellValidationMessage({
      ready: result.ready,
      error: result.error,
      reasons: result.comparison?.reasons ?? [],
    });
    await recordAiosellValidationResult({
      restaurantId: data.restaurantId,
      environment: data.environment,
      error,
    });
    return {
      ok: result.ready,
      error,
      currencyCompatible: result.comparison?.currencyCompatible ?? null,
      timezoneCompatible: result.comparison?.timezoneCompatible ?? null,
      workspace: await loadAiosellWorkspace(data),
    };
  });

export const saveAiosellRoomMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    scope
      .extend({
        roomTypeId: idSchema,
        roomCode: z.string().trim().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    await upsertAiosellRoomMappingRecord(data);
    return loadAiosellWorkspace(data);
  });

export const setAiosellRoomMappingState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    scope.extend({ roomTypeId: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    await setAiosellRoomMappingActive(data);
    return loadAiosellWorkspace(data);
  });

export const saveAiosellRateMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    scope
      .extend({
        ratePlanId: idSchema,
        roomCode: z.string().trim().min(1),
        rateplanCode: z.string().trim().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    await upsertAiosellRateMappingRecord(data);
    return loadAiosellWorkspace(data);
  });

export const setAiosellRateMappingState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    scope.extend({ ratePlanId: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    await setAiosellRateMappingActive(data);
    return loadAiosellWorkspace(data);
  });

export const runAiosellReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    scope
      .extend({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    const summary = await reconcileAiosellPropertyReservations(data);
    return aiosellReconcileDisplay(summary);
  });

export const activateAiosellBookingComChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => scope.parse(input))
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    await activateAiosellBookingChannel(data);
    return loadAiosellWorkspace(data);
  });
