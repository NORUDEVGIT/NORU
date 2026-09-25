/**
 * P5A-02 — Promotion consumption during reservation quoting.
 * Uses reservation-manager access, not Rate Manager.
 * Activation management stays a later owner/manager prompt.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateError } from "../rates.server";
import { requireReservationManager } from "../reservations.server";
import {
  getReservationPromotionAttribution as loadReservationPromotionAttribution,
  listStoredEligiblePromotions,
  loadPropertyBusinessDate,
  quoteHotelStayCommercial,
} from "./commercial-promotion.server.ts";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const stayQuerySchema = z.object({
  restaurantId: idSchema,
  ratePlanId: idSchema,
  roomTypeId: idSchema,
  arrivalDate: dateSchema,
  departureDate: dateSchema,
  promotionActivationId: idSchema.optional(),
  packageActivationIds: z.array(idSchema).optional(),
  reservationId: idSchema.optional(),
});

export const quoteHotelStayCommercialFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stayQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await quoteHotelStayCommercial(supabaseAdmin, data);
    } catch (error) {
      throw rateError(error instanceof Error ? error.message : String(error));
    }
  });

export const listEligiblePromotionActivations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    stayQuerySchema
      .extend({
        baseRoomSubtotal: z.number().nonnegative().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bookingBusinessDate = await loadPropertyBusinessDate(supabaseAdmin, data.restaurantId);
    const quote = data.baseRoomSubtotal == null
      ? await quoteHotelStayCommercial(supabaseAdmin, { ...data, includeEligible: false })
      : null;
    return listStoredEligiblePromotions(supabaseAdmin, {
      restaurantId: data.restaurantId,
      bookingBusinessDate,
      arrivalDate: data.arrivalDate,
      departureDate: data.departureDate,
      roomTypeId: data.roomTypeId,
      ratePlanId: data.ratePlanId,
      baseRoomSubtotal: data.baseRoomSubtotal ?? quote?.baseRoomSubtotal ?? 0,
      reservationId: data.reservationId,
    });
  });

export const getReservationPromotionAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadReservationPromotionAttribution(supabaseAdmin, data);
  });
