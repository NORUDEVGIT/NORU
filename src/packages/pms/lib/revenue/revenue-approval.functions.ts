/**
 * P7-STEP-02/03 — Approval policy and lifecycle server functions.
 * Rate Manager only.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateError, requireRateManager } from "../rates.server";
import {
  revenueApprovalDetailQuerySchema,
  revenueApprovalListQuerySchema,
} from "./revenue-approval.ts";
import {
  approveRevenueApprovalRequest,
  cancelRevenueApprovalRequest,
  getRevenueApprovalPolicy,
  getRevenueApprovalRequestDetail,
  listRevenueApprovalActors,
  listRevenueApprovalRequests,
  rejectRevenueApprovalRequest,
  setRevenueApprovalPolicy,
  submitRevenueApprovalRequest,
} from "./revenue-approval.server.ts";

const idSchema = z.string().uuid();

export const getRevenueApprovalPolicyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return getRevenueApprovalPolicy(supabaseAdmin, data.restaurantId);
  });

export const setRevenueApprovalPolicyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return setRevenueApprovalPolicy(supabaseAdmin, data);
  });

export const submitRevenueApprovalRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        domain: z.enum(["rate", "restriction", "promotion_activation", "package_activation"]),
        proposal: z.unknown(),
        requestReason: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await submitRevenueApprovalRequest(supabaseAdmin, data, {
        membershipId: me.id,
        userId: context.userId,
      });
    } catch (error) {
      throw rateError(error instanceof Error ? error.message : String(error));
    }
  });

export const cancelRevenueApprovalRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, approvalRequestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await cancelRevenueApprovalRequest(supabaseAdmin, data, {
        membershipId: me.id,
        userId: context.userId,
      });
    } catch (error) {
      throw rateError(error instanceof Error ? error.message : String(error));
    }
  });

export const rejectRevenueApprovalRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        approvalRequestId: idSchema,
        reviewReason: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await rejectRevenueApprovalRequest(supabaseAdmin, data, {
        membershipId: me.id,
        userId: context.userId,
      });
    } catch (error) {
      throw rateError(error instanceof Error ? error.message : String(error));
    }
  });

export const approveRevenueApprovalRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        approvalRequestId: idSchema,
        reviewReason: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await approveRevenueApprovalRequest(supabaseAdmin, data, {
        membershipId: me.id,
        userId: context.userId,
      });
    } catch (error) {
      throw rateError(error instanceof Error ? error.message : String(error));
    }
  });

export const listRevenueApprovalRequestsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revenueApprovalListQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return listRevenueApprovalRequests(supabaseAdmin, data);
  });

export const getRevenueApprovalRequestDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revenueApprovalDetailQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return getRevenueApprovalRequestDetail(supabaseAdmin, data, { membershipId: me.id });
  });

export const listRevenueApprovalActorsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return listRevenueApprovalActors(supabaseAdmin, data.restaurantId);
  });
