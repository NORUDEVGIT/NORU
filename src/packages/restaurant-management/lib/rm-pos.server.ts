/**
 * Phase 7D — POS (point of sale), server-only guards.
 *
 * Entry into the till is a module decision (`pos`); taking money is an action
 * decision (operator roles). Both are re-derived from the caller's membership
 * on every call — a restaurant id from the browser only selects which
 * membership applies.
 */
import type { AuthedCtx, Membership } from "@/core/lib/workforce.server";
import { requireModuleAccess, requireModuleRole } from "@/core/lib/module-access.server";

/** Roles that may operate the till. */
export const POS_OPERATOR_ROLES = ["owner", "manager", "cashier", "waiter"] as const;

const NO_POS = "You don't have access to POS for this property.";
const NO_POS_ACTION = "You don't have permission to take POS sales.";

export async function requirePosAccess(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  let membership: Membership;
  try {
    membership = await requireModuleAccess(context, restaurantId, "pos");
  } catch {
    throw new Error(NO_POS);
  }
  // Phase 8E1: today's POS is Restaurant Management POS, so the till requires
  // the restaurant_management package, not the (unbuilt) standalone pos one.
  const { requireRestaurantManagement } = await import("./restaurant-package.server");
  await requireRestaurantManagement(restaurantId);
  return membership;
}

export async function requirePosOperator(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const membership = await requireModuleRole(
    context,
    restaurantId,
    "pos",
    POS_OPERATOR_ROLES,
    NO_POS_ACTION,
  );
  const { requireRestaurantManagement } = await import("./restaurant-package.server");
  await requireRestaurantManagement(restaurantId);
  return membership;
}


const POS_ERRORS: Record<string, string> = {
  ORDER_NOT_FOUND: "That sale could not be found for this property.",
  ORDER_ALREADY_PAID: "This sale has already been settled.",
  INVALID_PAYMENT_METHOD: "That payment method isn't supported.",
  INVALID_AMOUNT: "Enter an amount greater than zero.",
  INSUFFICIENT_TENDER: "The cash tendered is less than the amount due.",
  SHIFT_NOT_FOUND: "Open a cashier shift before taking payments.",
  SHIFT_ALREADY_CLOSED: "Your cashier shift is closed. Open a new one to continue.",
  SHIFT_ALREADY_OPEN: "You already have an open cashier shift.",
  INVALID_CLOSING_CASH: "Enter a closing cash amount of zero or more.",
};

export function posError(message: string): Error {
  if (/cashier_shifts_one_open/i.test(message)) {
    return new Error("You already have an open cashier shift.");
  }
  for (const [code, text] of Object.entries(POS_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}
