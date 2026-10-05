/**
 * Server Functions for Travel Agency Step 3: Commission & Rates.
 * Exposes:
 *  - getTravelAgencyCommissionRatesConfig
 *  - saveTravelAgencyCommissionRates
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware.ts";
import { requireGuestManager } from "./guests.server.ts";
import {
  loadTravelAgencyCommissionRatesConfig,
  validateTravelAgencyCommissionRates,
  executeSaveTravelAgencyCommissionRates,
  type TravelAgencyCommissionRatesConfig,
  type TravelAgencyCommissionRatesPayload,
} from "./guest-travel-agency-step3-commission-rates.server.ts";

const idSchema = z.string().uuid();

export const getTravelAgencyCommissionRatesConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema.optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<TravelAgencyCommissionRatesConfig> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadTravelAgencyCommissionRatesConfig(
      supabaseAdmin as any,
      data.restaurantId,
      data.agencyId,
    );
  });

export const saveTravelAgencyCommissionRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        commercialModel: z.enum(["commissionable", "net_rate"]),
        commissionCurrency: z.string().optional().nullable(),
        commissionEffectiveOn: z.string().optional().nullable(),
        commissionExpiresOn: z.string().optional().nullable(),
        commissionNotes: z.string().optional().nullable(),
        commissionRules: z
          .array(
            z.object({
              id: z.string().optional(),
              scopeType: z.enum(["all", "room_type", "rate_plan"]),
              roomTypeId: z.string().optional().nullable(),
              ratePlanId: z.string().optional().nullable(),
              commissionType: z.enum(["percent", "fixed"]),
              commissionValue: z.number(),
            }),
          )
          .optional(),
        agencyRateDefaults: z
          .array(
            z.object({
              roomTypeId: z.string(),
              ratePlanId: z.string(),
            }),
          )
          .optional(),
        netPricingMethod: z.enum(["rate_plan", "rate_plan_discount", "contracted_rates"]).optional().nullable(),
        netRoomTypeId: z.string().optional().nullable(),
        netRatePlanId: z.string().optional().nullable(),
        netDiscountType: z.enum(["percent", "fixed"]).optional().nullable(),
        netDiscountValue: z.number().optional().nullable(),
        netCurrencyCode: z.string().optional().nullable(),
        netValidFrom: z.string().optional().nullable(),
        netValidUntil: z.string().optional().nullable(),
        contractedRates: z
          .array(
            z.object({
              roomTypeId: z.string(),
              amount: z.number(),
            }),
          )
          .optional(),
        commercialNotes: z.string().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    // Load active config for validation context
    const config = await loadTravelAgencyCommissionRatesConfig(db, data.restaurantId, data.agencyId);

    // Validate strictly server-side
    validateTravelAgencyCommissionRates(data as TravelAgencyCommissionRatesPayload, {
      roomTypes: config.roomTypes,
      ratePlans: config.ratePlans,
    });

    // Execute transactional persistence
    return executeSaveTravelAgencyCommissionRates(db, data as TravelAgencyCommissionRatesPayload);
  });
