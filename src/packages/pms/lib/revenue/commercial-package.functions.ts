/**
 * P5A-03 — Package consumption during reservation quoting.
 * Uses reservation-manager access, not Rate Manager.
 * Activation management stays a later owner/manager prompt.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateError } from "../rates.server";
import { requireReservationManager, reservationError } from "../reservations.server";
import {
  getReservationCommercialAttribution as loadReservationCommercialAttribution,
  getReservationPackageAttributions as loadReservationPackageAttributions,
  getReservationUnitPackageRead,
  listStoredEligiblePackages,
} from "./commercial-package.server.ts";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const stayQuerySchema = z.object({
  restaurantId: idSchema,
  ratePlanId: idSchema,
  roomTypeId: idSchema,
  arrivalDate: dateSchema,
  departureDate: dateSchema,
  reservationId: idSchema.optional(),
});

export const listEligiblePackageActivations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => stayQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await listStoredEligiblePackages(supabaseAdmin, data);
    } catch (error) {
      throw rateError(error instanceof Error ? error.message : String(error));
    }
  });

export const getReservationPackageAttributions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadReservationPackageAttributions(supabaseAdmin, data);
  });

export const getReservationUnitPackages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await getReservationUnitPackageRead(supabaseAdmin, data);
    } catch (error) {
      throw reservationError(error instanceof Error ? error.message : String(error));
    }
  });

export const getReservationCommercialAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        roomSubtotal: z.number().nonnegative().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadReservationCommercialAttribution(supabaseAdmin, data);
  });
