import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadRevenueAccess } from "./revenue-access.server";

const restaurantSchema = z.object({ restaurantId: z.string().uuid() });

export const getRevenueAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantSchema.parse(input))
  .handler(async ({ data, context }) => {
    return loadRevenueAccess(context as never, data.restaurantId);
  });
