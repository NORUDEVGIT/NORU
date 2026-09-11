/**
 * Issue #24 — Restaurant Management discounts & comps, server-only guards.
 *
 * Confirm is manager-level by default. Cashiers are denied unless an explicit
 * `rm_discount` / `rm_comp` action grant exists. Restaurant Management package
 * + membership are re-checked on every call. Standalone POS is not consulted.
 */
import type { AuthedCtx, Membership } from "@/core/lib/workforce.server";
import { callerMembership } from "@/core/lib/workforce.server";
import { requireRestaurantManagement } from "./restaurant-package.server";
import {
  authorizeRmAdjustConfirm,
  canAttemptRmAdjust,
  RM_COMP_ACTION,
  RM_DISCOUNT_ACTION,
  type RmAdjustAction,
} from "./rm-adjust";

const NO_DISCOUNT = "You don't have permission to discount a restaurant check.";
const NO_COMP = "You don't have permission to comp a restaurant check.";

export async function loadStaffActionGrant(
  admin: { from: (t: string) => any },
  restaurantId: string,
  membershipId: string,
  actionKey: string,
): Promise<boolean> {
  const { data } = await admin
    .from("staff_action_grants")
    .select("enabled")
    .eq("restaurant_id", restaurantId)
    .eq("membership_id", membershipId)
    .eq("action_key", actionKey)
    .maybeSingle();
  return data?.enabled === true;
}

export async function requireRmAdjustViewer(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const membership = await callerMembership(context, restaurantId);
  await requireRestaurantManagement(restaurantId);
  return membership;
}

export async function resolveRmAdjustPermission(
  context: AuthedCtx,
  restaurantId: string,
  action: RmAdjustAction,
): Promise<{ membership: Membership; staffGranted: boolean; allowed: boolean }> {
  const membership = await requireRmAdjustViewer(context, restaurantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const staffGranted =
    membership.role === "cashier"
      ? await loadStaffActionGrant(supabaseAdmin, restaurantId, membership.id, action)
      : false;
  return {
    membership,
    staffGranted,
    allowed: canAttemptRmAdjust(membership.role, staffGranted),
  };
}

export async function requireRmAdjustConfirm(
  context: AuthedCtx,
  restaurantId: string,
  action: RmAdjustAction,
): Promise<Membership> {
  const { membership, staffGranted } = await resolveRmAdjustPermission(context, restaurantId, action);
  const decision = authorizeRmAdjustConfirm({
    role: membership.role,
    staffGranted,
    action,
  });
  if (!decision.ok) {
    throw new Error(decision.message || (action === RM_COMP_ACTION ? NO_COMP : NO_DISCOUNT));
  }
  return membership;
}

export async function resolveRmAdjustCapabilities(
  context: AuthedCtx,
  restaurantId: string,
): Promise<{
  membership: Membership;
  canDiscount: boolean;
  canComp: boolean;
}> {
  const membership = await requireRmAdjustViewer(context, restaurantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let discountGranted = false;
  let compGranted = false;
  if (membership.role === "cashier") {
    [discountGranted, compGranted] = await Promise.all([
      loadStaffActionGrant(supabaseAdmin, restaurantId, membership.id, RM_DISCOUNT_ACTION),
      loadStaffActionGrant(supabaseAdmin, restaurantId, membership.id, RM_COMP_ACTION),
    ]);
  }
  return {
    membership,
    canDiscount: canAttemptRmAdjust(membership.role, discountGranted),
    canComp: canAttemptRmAdjust(membership.role, compGranted),
  };
}

export const RM_ADJUST_ERRORS: Record<string, string> = {
  ORDER_NOT_FOUND: "That restaurant check could not be found for this property.",
  ORDER_PAID: "This restaurant check is already paid. Use Refund.",
  ORDER_CANCELLED: "This restaurant check was cancelled.",
  REASON_REQUIRED: "Give a reason for the adjustment.",
  INVALID_AMOUNT: "Enter an amount greater than zero.",
  INVALID_PERCENT: "Discount percent must be between 0 and 100.",
  OVER_DISCOUNT: "That's more than the eligible merchandise after comps.",
  COMP_LINES_REQUIRED: "Select at least one line to comp.",
  COMP_LINE_NOT_FOUND: "A selected line is not on this restaurant check.",
  LINE_OVER: "A selected line is already fully comped.",
  ALREADY_COMPED: "This restaurant check is already fully comped.",
  PAYABLE_NOT_ZERO: "Payable must be zero before this check can be completed as comped.",
};

export function rmAdjustError(message: string): Error {
  for (const [code, text] of Object.entries(RM_ADJUST_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}
