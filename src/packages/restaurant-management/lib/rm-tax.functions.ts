/**
 * Issue #22 — owner/manager load + save of RM tax & service settings.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { callerMembership, MANAGE_ROLES } from "@/core/lib/workforce.server";
import {
  DEFAULT_RM_TAX_SETTINGS,
  normalizeRmTaxSettings,
  type RmTaxSettings,
} from "./rm-tax";
import { loadRestaurantTaxSettings } from "./rm-tax.server";

const TAX_DENIED = "Only an owner or manager can change tax & service settings.";

async function requireTaxManager(context: { supabase: { from: (t: string) => any }; userId: string }, restaurantId: string) {
  const me = await callerMembership(context, restaurantId);
  if (!(MANAGE_ROLES as readonly string[]).includes(me.role)) {
    throw new Error(TAX_DENIED);
  }
  return me;
}

const idSchema = z.string().uuid();

const settingsSchema = z.object({
  restaurantId: idSchema,
  taxRate: z.number().min(0).max(100),
  taxInclusive: z.boolean(),
  serviceEnabled: z.boolean(),
  serviceRate: z.number().min(0).max(100),
});

export const getRestaurantTaxSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<RmTaxSettings> => {
    await requireTaxManager(context as never, data.restaurantId);
    const { requireRestaurantManagement } = await import("./restaurant-package.server");
    await requireRestaurantManagement(data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadRestaurantTaxSettings(supabaseAdmin, data.restaurantId);
  });

export const saveRestaurantTaxSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; settings: RmTaxSettings } | { ok: false; message: string }> => {
      try {
        await requireTaxManager(context as never, data.restaurantId);
        const { requireRestaurantManagement } = await import("./restaurant-package.server");
        await requireRestaurantManagement(data.restaurantId);
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }

      const settings = normalizeRmTaxSettings({
        taxRate: data.taxRate,
        taxInclusive: data.taxInclusive,
        serviceEnabled: data.serviceEnabled,
        serviceRate: data.serviceEnabled ? data.serviceRate : data.serviceRate,
      });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("restaurants")
        .update({
          tax_rate: settings.taxRate,
          tax_inclusive: settings.taxInclusive,
          service_enabled: settings.serviceEnabled,
          service_rate: settings.serviceRate,
        })
        .eq("id", data.restaurantId);

      if (error) {
        console.error("[saveRestaurantTaxSettings]", error.message);
        return { ok: false, message: "We couldn't save those tax & service settings. Please try again." };
      }

      return { ok: true, settings };
    },
  );

export { DEFAULT_RM_TAX_SETTINGS };
