/**
 * Card 5 overall Validate — read-only. Does not persist programme status.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import { buildCard5ValidationReport } from "./card5-readiness.server";
import { loadCard5ValidationSnapshots } from "./card5-readiness.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

export const getCard5Validation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshots = await loadCard5ValidationSnapshots(pmsDb(supabaseAdmin), data.restaurantId);
    return buildCard5ValidationReport(snapshots.departments, snapshots.facilities, snapshots.sales);
  });
