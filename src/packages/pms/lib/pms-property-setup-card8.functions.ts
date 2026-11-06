/** Card 8 Phase 5 Validate — read-only overall readiness. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callerMembership } from "@/core/lib/workforce.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadCard8ReadinessReport } from "./card8-readiness.functions";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { hasPmsPermission } from "./pms-permissions.server";
import { withPmsPackage } from "./pms-package.server";

export const getCard8Readiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actorCanActivate = await hasPmsPermission(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.CONFIG_PROPERTY_ACTIVATE,
    );
    return loadCard8ReadinessReport(supabaseAdmin, data.restaurantId, context.userId, me.role, actorCanActivate);
  });
