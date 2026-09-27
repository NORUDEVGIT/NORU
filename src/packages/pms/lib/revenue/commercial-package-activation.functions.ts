/**
 * P5A-04 — Package activation preview/apply and reads.
 * Rate Manager only.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateError, requireRateManager } from "../rates.server";
import {
  getPackageActivationDetail as loadPackageActivationDetail,
  listPackageActivations as loadPackageActivations,
  previewStoredPackageActivation,
} from "./commercial-package-activation.server.ts";
import { executeOrSubmitPackageActivation } from "./revenue-approval.server.ts";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const previewSchema = z.object({
  restaurantId: idSchema,
  operation: z.enum(["CREATE", "EDIT", "DEACTIVATE"]),
  packageId: idSchema.optional(),
  activationId: idSchema.optional(),
  validFrom: dateSchema.optional(),
  validTo: dateSchema.optional(),
  roomTypeIds: z.array(idSchema).optional(),
  ratePlanIds: z.array(idSchema).optional(),
  reason: z.string().max(500).nullable().optional(),
  expectedVersion: z.string().min(1).optional(),
});

export const previewPackageActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => previewSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await previewStoredPackageActivation(supabaseAdmin, data);
    } catch (error) {
      throw rateError(error instanceof Error ? error.message : String(error));
    }
  });

export const applyPackageActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => previewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await executeOrSubmitPackageActivation(supabaseAdmin, data, {
        membershipId: me.id,
        userId: context.userId,
      });
    } catch (error) {
      throw rateError(error instanceof Error ? error.message : String(error));
    }
  });

export const listPackageActivations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadPackageActivations(supabaseAdmin, data);
  });

export const getPackageActivationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, activationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadPackageActivationDetail(supabaseAdmin, data);
  });
