/**
 * FO Phase 8 — approval/authorization read model.
 * Reads pms_approval_rules for display. Live gate is the catalogue permission.
 * No approval_requests table and no inbox writer.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPermissionDeniedMessage } from "./front-office-shell";
import { isMissingSchemaError } from "./pms-set2-structure";
import { hasEffectivePermission, requirePmsActor, resolveEffectivePermissions } from "./pms-permissions.server";
import { PMS_PERMISSIONS, type PmsPermissionCode } from "./pms-permissions";
import { CARD7_SECURITY_UNAVAILABLE } from "./security-roles-card7.server";
import {
  evaluateFoApprovalRequirement,
  FO_AUTHORIZATION_KEYS,
  FO_AUTHORIZATION_META,
  type FoApprovalRequirement,
  type FoAuthorizationKey,
} from "./fo-approvals";

const idSchema = z.string().uuid();

const APPROVAL_GRANT: Partial<Record<FoAuthorizationKey, PmsPermissionCode>> = {
  "front_office.check_in.override": PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN_OVERRIDE,
  "front_office.check_out.override": PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT_OVERRIDE,
  "front_office.fee.override": PMS_PERMISSIONS.FRONT_OFFICE_FEE_OVERRIDE,
  "late_checkout.authorize": PMS_PERMISSIONS.FRONT_OFFICE_FEE_OVERRIDE,
};

export const getFrontOfficeApprovalRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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
      membership = await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.FRONT_OFFICE_VIEW);
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
          lateCheckoutFee: null,
          unavailable: true,
          unavailableMessage: "You don't have access to Front Office authorization for this property.",
        });
      }
      throw error;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let policyNeedsApproval: boolean | null = null;
    let lateCheckoutFee: number | null = null;
    if (data.actionKey === "late_checkout.authorize") {
      const { data: property } = await supabaseAdmin
        .from("restaurants")
        .select("late_checkout_needs_approval, late_checkout_fee, late_checkout_allowed, checkin_ops")
        .eq("id", data.restaurantId)
        .maybeSingle();
      policyNeedsApproval = property?.late_checkout_needs_approval === true;
      const { resolveLateCheckoutPolicy } = await import("./reservation-workspace/arrivals-departures");
      const policy = resolveLateCheckoutPolicy(property ?? {});
      lateCheckoutFee = policy.fee;
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

    const grant = APPROVAL_GRANT[data.actionKey as FoAuthorizationKey];
    const canAuthorize = grant
      ? hasEffectivePermission(await resolveEffectivePermissions(context as never, data.restaurantId), grant)
      : false;

    return evaluateFoApprovalRequirement({
      actionKey: data.actionKey,
      canAuthorize,
      catalogueConfigured,
      ruleActive,
      approverRoleName,
      thresholdAmount,
      thresholdUnit,
      amount: data.amount ?? null,
      policyNeedsApproval,
      lateCheckoutFee,
      unavailable,
      unavailableMessage,
    });
  });
