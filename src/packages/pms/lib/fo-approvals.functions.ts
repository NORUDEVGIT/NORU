/**
 * FO Phase 8 — approval/authorization read model.
 * Reads pms_approval_rules for display. Live gate remains restaurant_users.role.
 * No approval_requests table and no inbox writer.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPermissionDeniedMessage } from "./front-office-shell";
import { isMissingSchemaError } from "./pms-set2-structure";
import { requireReservationManager } from "./reservations.server";
import { CARD7_SECURITY_UNAVAILABLE } from "./security-roles-card7.server";
import {
  evaluateFoApprovalRequirement,
  FO_AUTHORIZATION_KEYS,
  FO_AUTHORIZATION_META,
  type FoApprovalRequirement,
  type FoAuthorizationKey,
} from "./fo-approvals";

const idSchema = z.string().uuid();

export const getFrontOfficeApprovalRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        actionKey: z.enum(FO_AUTHORIZATION_KEYS),
        amount: z.number().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<FoApprovalRequirement> => {
    let membership;
    try {
      membership = await requireReservationManager(context as never, data.restaurantId);
    } catch (error) {
      if (isPermissionDeniedMessage(error)) {
        return evaluateFoApprovalRequirement({
          actionKey: data.actionKey,
          staffRole: "receptionist",
          catalogueConfigured: false,
          ruleActive: false,
          approverRoleName: null,
          thresholdAmount: null,
          thresholdUnit: null,
          amount: data.amount ?? null,
          policyNeedsApproval: data.actionKey === "late_checkout.authorize" ? true : null,
          unavailable: true,
          unavailableMessage: "You don't have access to Front Office authorization for this property.",
        });
      }
      throw error;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let policyNeedsApproval: boolean | null = null;
    if (data.actionKey === "late_checkout.authorize") {
      const { data: property } = await supabaseAdmin
        .from("restaurants")
        .select("late_checkout_needs_approval")
        .eq("id", data.restaurantId)
        .maybeSingle();
      policyNeedsApproval = property?.late_checkout_needs_approval === true;
    }

    const metaCode = FO_AUTHORIZATION_META[data.actionKey as FoAuthorizationKey].permissionCode;

    let catalogueConfigured = false;
    let ruleActive = false;
    let approverRoleName: string | null = null;
    let thresholdAmount: number | null = null;
    let thresholdUnit: "amount" | "percent" | null = null;
    let unavailable = false;
    let unavailableMessage: string | null = null;

    if (metaCode) {
      const permission = await supabaseAdmin
        .from("pms_permissions")
        .select("id, code, active")
        .eq("code", metaCode)
        .maybeSingle();
      if (permission.error && isMissingSchemaError(permission.error)) {
        unavailable = true;
        unavailableMessage = CARD7_SECURITY_UNAVAILABLE;
      } else if (permission.error) {
        unavailable = true;
        unavailableMessage = permission.error.message;
      } else if (permission.data?.id) {
        catalogueConfigured = permission.data.active !== false;
        const rule = await supabaseAdmin
          .from("pms_approval_rules")
          .select("id, active, threshold_amount, threshold_unit, approver_role_id")
          .eq("restaurant_id", data.restaurantId)
          .eq("permission_id", permission.data.id)
          .eq("active", true)
          .maybeSingle();
        if (rule.error && isMissingSchemaError(rule.error)) {
          unavailable = true;
          unavailableMessage = CARD7_SECURITY_UNAVAILABLE;
        } else if (rule.data) {
          ruleActive = rule.data.active === true;
          thresholdAmount = rule.data.threshold_amount == null ? null : Number(rule.data.threshold_amount);
          thresholdUnit =
            rule.data.threshold_unit === "percent" || rule.data.threshold_unit === "amount"
              ? rule.data.threshold_unit
              : null;
          const role = await supabaseAdmin
            .from("pms_hotel_roles")
            .select("name")
            .eq("restaurant_id", data.restaurantId)
            .eq("id", rule.data.approver_role_id)
            .maybeSingle();
          approverRoleName = role.data?.name ?? null;
        }
      }
    }

    return evaluateFoApprovalRequirement({
      actionKey: data.actionKey,
      staffRole: membership.role,
      catalogueConfigured,
      ruleActive,
      approverRoleName,
      thresholdAmount,
      thresholdUnit,
      amount: data.amount ?? null,
      policyNeedsApproval,
      unavailable,
      unavailableMessage,
    });
  });
