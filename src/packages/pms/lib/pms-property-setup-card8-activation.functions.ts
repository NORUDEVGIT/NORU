import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callerMembership } from "@/core/lib/workforce.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withPmsPackage } from "./pms-package.server";
import { loadSet1ActivationState } from "./pms-set1-foundation.functions";
import { loadCard8ActivationEligibility } from "./pms-property-setup-card8-activation.server";

export const getCard8ActivationEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const set1 = await loadSet1ActivationState(supabaseAdmin, data.restaurantId, me.role);
    return loadCard8ActivationEligibility(
      supabaseAdmin,
      data.restaurantId,
      context.userId,
      me.role,
      set1.checklist.canActivate,
    );
  });
