import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireReservationManager } from "./reservations.server";
import { previewPostedRoomCharge } from "./room-charge-guest-total";
import { loadRoomChargeRules } from "./room-charge-guest-total.server";

const idSchema = z.string().uuid();

/** Room rate plus the taxes the folio posts. Does not change the stored rate. */
export const quoteReservationRoomGuestTotal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        amounts: z.array(z.number().finite().nonnegative()).min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ total: number }> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rules = await loadRoomChargeRules(supabaseAdmin as never, data.restaurantId);
    const total = data.amounts.reduce((sum, amount) => {
      if (!(amount > 0)) return sum;
      return sum + previewPostedRoomCharge(amount, rules.taxes, rules.services).total;
    }, 0);
    return { total: Math.round(total * 100) / 100 };
  });
