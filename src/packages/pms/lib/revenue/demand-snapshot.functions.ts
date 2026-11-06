/**
 * Historical OTB snapshot reads for future UI-13.
 * Owner/manager only. Capture stays server/internal — not exported here.
 */

import { requirePmsActor } from "../pms-permissions.server";
import { PMS_PERMISSIONS } from "../pms-permissions";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { otbSnapshotQuerySchema } from "./demand-snapshot";
import { listRevenueOtbSnapshots, loadOtbSnapshotHistoryStart } from "./demand-snapshot.server";
import { OTB_SNAPSHOT_LOAD_ERROR, toRevenueReadError } from "./revenue-read-error";

export const getRevenueOtbSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => otbSnapshotQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await listRevenueOtbSnapshots(supabaseAdmin, data);
    } catch (error) {
      throw toRevenueReadError(error, OTB_SNAPSHOT_LOAD_ERROR);
    }
  });

export const getRevenueOtbSnapshotHistoryStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RATES_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return { startsAt: await loadOtbSnapshotHistoryStart(supabaseAdmin, data.restaurantId) };
    } catch (error) {
      throw toRevenueReadError(error, OTB_SNAPSHOT_LOAD_ERROR);
    }
  });
