/**
 * Phase 7A — Restaurant "Charge to Room", server-only helpers.
 *
 * Owners and managers may post and reverse. Waiters may only post for an order
 * they are allowed to operate under the existing waiter rules (the order is
 * theirs and their shift is currently active). Kitchen never.
 */
import { MANAGE_ROLES, getRestaurantSettings, resolveCurrentShift } from "@/core/lib/workforce.server";

/** Order statuses that may be charged to a room. */
export const CHARGEABLE_ORDER_STATUSES = ["served"] as const;

const ROOM_CHARGE_ERRORS: Record<string, string> = {
  ORDER_NOT_FOUND: "Order not found for this property.",
  ORDER_NOT_ELIGIBLE: "Only served orders with a positive total can be charged to a room.",
  ORDER_CANCELLED: "Cancelled orders can't be charged to a room.",
  ORDER_ALREADY_POSTED: "This order has already been charged to a room.",
  RESERVATION_NOT_CHECKED_IN: "That stay isn't checked in, so it can't take charges.",
  FOLIO_NOT_FOUND: "Folio not found for this property.",
  FOLIO_CLOSED: "This folio is closed. Nothing more can be posted to it.",
  CURRENCY_MISMATCH: "The folio currency doesn't match the property currency.",
  REVERSAL_REASON_REQUIRED: "Give a reason for the reversal.",
  CHARGE_NOT_FOUND: "There is no room charge on this order.",
  CHARGE_ALREADY_REVERSED: "This room charge has already been reversed.",
};

export function roomChargeError(message: string): Error {
  if (/duplicate key value/i.test(message) && message.includes("restaurant_order_once")) {
    return new Error("This order has already been charged to a room, or the charge was reversed.");
  }
  for (const [code, text] of Object.entries(ROOM_CHARGE_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}

export function isManagerRole(role: string): boolean {
  return (MANAGE_ROLES as readonly string[]).includes(role);
}

/**
 * Can this membership post the given order to a room?
 * Managers always; waiters only for their own order while their shift is live.
 */
export async function canPostRoomCharge(
  admin: any,
  restaurantId: string,
  membership: { id: string; role: string },
  order: {
    assigned_waiter_membership_id: string | null;
    created_by_staff_membership_id: string | null;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (isManagerRole(membership.role)) return { ok: true };
  if (membership.role !== "waiter") {
    return { ok: false, message: "You don't have permission to charge orders to a room." };
  }
  const isTheirs =
    order.assigned_waiter_membership_id === membership.id ||
    order.created_by_staff_membership_id === membership.id;
  if (!isTheirs) {
    return { ok: false, message: "You can only charge orders you are responsible for." };
  }
  const settings = await getRestaurantSettings(admin, restaurantId);
  const resolved = await resolveCurrentShift(
    admin,
    restaurantId,
    membership.id,
    settings.timezone,
    new Date(),
  );
  if (!resolved.isActive) {
    return { ok: false, message: "Check in for your shift before charging orders to a room." };
  }
  return { ok: true };
}
