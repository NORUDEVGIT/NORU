/**
 * Read-only PMS permission snapshot for the signed-in membership.
 * Does not change live require* gates.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthedCtx } from "@/core/lib/workforce.server";
import { resolveEffectivePermissions } from "./pms-permissions.server";
import { requirePmsPackage } from "./pms-package.server";

const idSchema = z.string().uuid();

export const getMyPmsPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsPackage(data.restaurantId);
    const resolved = await resolveEffectivePermissions(context as AuthedCtx, data.restaurantId);
    return {
      membershipId: resolved.membershipId,
      restaurantId: resolved.restaurantId,
      isOwner: resolved.isOwner,
      codes: [...resolved.codes],
    };
  });
