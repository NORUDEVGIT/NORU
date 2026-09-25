/**
 * P5A-04 — Promotion activation preview/apply and reads.
 * Rate Manager only. Activation management is not a reservation-manager task.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateError, requireRateManager } from "../rates.server";
import {
  applyStoredPromotionActivation,
  getPromotionActivationDetail as loadPromotionActivationDetail,
  listPromotionActivations as loadPromotionActivations,
  previewStoredPromotionActivation,
} from "./commercial-promotion-activation.server.ts";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const previewSchema = z.object({
  restaurantId: idSchema,
  operation: z.enum(["CREATE", "EDIT", "DEACTIVATE"]),
  promotionId: idSchema.optional(),
  activationId: idSchema.optional(),
  validFrom: dateSchema.optional(),
  validTo: dateSchema.optional(),
  bookingFrom: dateSchema.optional(),
  bookingTo: dateSchema.optional(),
  priority: z.number().int().min(0).optional(),
  roomTypeIds: z.array(idSchema).optional(),
  ratePlanIds: z.array(idSchema).optional(),
  reason: z.string().max(500).nullable().optional(),
  expectedVersion: z.string().min(1).optional(),
});

export const previewPromotionActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => previewSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await previewStoredPromotionActivation(supabaseAdmin, data);
    } catch (error) {
      throw rateError(error instanceof Error ? error.message : String(error));
    }
  });

export const applyPromotionActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => previewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await applyStoredPromotionActivation(supabaseAdmin, data, me.id);
    } catch (error) {
      throw rateError(error instanceof Error ? error.message : String(error));
    }
  });

export const listPromotionActivations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadPromotionActivations(supabaseAdmin, data);
  });

export const getPromotionActivationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, activationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadPromotionActivationDetail(supabaseAdmin, data);
  });
