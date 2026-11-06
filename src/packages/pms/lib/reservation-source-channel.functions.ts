import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePmsActor } from "./pms-permissions.server";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { loadReservationCreateSourceChannel } from "./reservation-source-channel.server";

const idSchema = z.string().uuid();

export const getReservationCreateSourceChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        environment: z.enum(["sandbox", "production"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RESERVATION_VIEW);
    return loadReservationCreateSourceChannel(data);
  });
