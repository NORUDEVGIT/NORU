/**
 * Issue #18 — Restaurant Management refunds, server-only guards.
 *
 * Confirm is manager-level by default. Cashiers are denied unless an explicit
 * `rm_refund` action grant exists. Restaurant Management package + membership
 * are re-checked on every call. Standalone POS is not consulted.
 */
import type { AuthedCtx, Membership } from "@/core/lib/workforce.server";
import { callerMembership } from "@/core/lib/workforce.server";
import { requireRestaurantManagement } from "./restaurant-package.server";
import {
  authorizeRmRefundConfirm,
  canAttemptRmRefund,
  RM_REFUND_ACTION,
  type RmRefundMethod,
} from "./rm-refunds";

const NO_REFUND = "You don't have permission to refund a restaurant sale.";

export async function loadRmRefundGrant(
  admin: { from: (t: string) => any },
  restaurantId: string,
  membershipId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("staff_action_grants")
    .select("enabled")
    .eq("restaurant_id", restaurantId)
    .eq("membership_id", membershipId)
    .eq("action_key", RM_REFUND_ACTION)
    .maybeSingle();
  return data?.enabled === true;
}

export async function requireRmRefundViewer(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const membership = await callerMembership(context, restaurantId);
  await requireRestaurantManagement(restaurantId);
  return membership;
}

export async function resolveRmRefundPermission(
  context: AuthedCtx,
  restaurantId: string,
): Promise<{ membership: Membership; cashierGranted: boolean; canRefund: boolean }> {
  const membership = await requireRmRefundViewer(context, restaurantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cashierGranted =
    membership.role === "cashier" ? await loadRmRefundGrant(supabaseAdmin, restaurantId, membership.id) : false;
  return {
    membership,
    cashierGranted,
    canRefund: canAttemptRmRefund(membership.role, cashierGranted),
  };
}

export async function requireRmRefundConfirm(
  context: AuthedCtx,
  restaurantId: string,
  method: RmRefundMethod,
  hasOpenShift: boolean,
): Promise<{ membership: Membership; correctionWithoutShift: boolean }> {
  const { membership, cashierGranted } = await resolveRmRefundPermission(context, restaurantId);
  const decision = authorizeRmRefundConfirm({
    role: membership.role,
    cashierGranted,
    method,
    hasOpenShift,
  });
  if (!decision.ok) throw new Error(decision.message || NO_REFUND);
  return { membership, correctionWithoutShift: decision.correctionWithoutShift };
}

export const RM_REFUND_ERRORS: Record<string, string> = {
  ORDER_NOT_FOUND: "That restaurant sale could not be found for this property.",
  ORDER_NOT_PAID: "This restaurant sale has not been paid.",
  ROOM_CHARGE_USE_REVERSE: "Room charges are reversed on the folio. The refund was not recorded.",
  PAYMENT_NOT_FOUND: "That tender is not on this restaurant sale.",
  INVALID_PAYMENT_METHOD: "That payment method isn't supported.",
  INVALID_AMOUNT: "Enter an amount greater than zero.",
  REASON_REQUIRED: "Give a reason for the refund.",
  REFUND_LINES_REQUIRED: "Select at least one line to refund.",
  REFUND_LINE_NOT_FOUND: "A selected line is not on this restaurant sale.",
  DOUBLE_REFUND: "This restaurant sale has already been fully refunded.",
  OVER_REFUND: "That's more than the amount still refundable on this restaurant sale.",
  TENDER_OVER: "That's more than the amount still refundable on that tender.",
  LINE_OVER: "That's more than the amount still refundable on a selected line.",
  AMOUNT_MISMATCH: "Selected lines must add up to the refund amount.",
  SHIFT_NOT_FOUND: "Open a cashier shift before refunding cash.",
  SHIFT_ALREADY_CLOSED: "That cashier shift is closed.",
};

export function rmRefundError(message: string): Error {
  for (const [code, text] of Object.entries(RM_REFUND_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}
