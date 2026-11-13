/**
 * NORU-DATA-INTEGRITY-01 — direct booking cancellation through room units.
 *
 * hotel_reservation_rooms owns stay status. hotel_reservations.status is a
 * rollup written only by rollup_hotel_reservation_status. Cancelling a direct
 * booking therefore never updates the header: it calls one database function
 * that cancels every pending/confirmed unit through cancel_hotel_reservation_unit
 * (which rolls up the header and writes the history row) in a single transaction.
 *
 * Unit transition rule enforced by the database function:
 *   pending, confirmed -> cancelled
 *   cancelled          -> unchanged (idempotent)
 *   checked_in, checked_out, no_show -> whole booking rejected, nothing changes
 */

export const CANCEL_ALL_UNITS_RPC = "cancel_hotel_reservation_all_units";
export const DIRECT_CANCEL_REASON = "Cancelled by the guest online.";

export const DIRECT_CANCEL_NOT_ONLINE =
  "This booking can't be cancelled online. Please contact the property.";
export const DIRECT_CANCEL_FAILED = "We couldn't cancel that booking. Please contact the property.";

type RpcResult = { error: { message?: string | null } | null };

/** The one admin-client method this module needs. Keeps the helper testable. */
export interface CancelRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
}

export type DirectCancelOutcome =
  { ok: true } | { ok: false; reason: "not_cancellable" | "failed"; message: string };

/**
 * Database errors that mean the stay can no longer be cancelled online
 * (a unit is checked in, checked out or no-show, or the booking has no unit to
 * cancel). Everything else is an unexpected failure.
 */
const NOT_CANCELLABLE = /INVALID_TRANSITION|ROOM_UNIT_REQUIRED|RESERVATION_NOT_FOUND/;

export async function cancelDirectBookingUnits(
  db: CancelRpcClient,
  restaurantId: string,
  reservationId: string,
): Promise<DirectCancelOutcome> {
  const { error } = await db.rpc(CANCEL_ALL_UNITS_RPC, {
    _restaurant_id: restaurantId,
    _reservation_id: reservationId,
    _reason: DIRECT_CANCEL_REASON,
    _membership_id: null,
  });
  if (!error) return { ok: true };
  if (NOT_CANCELLABLE.test(error.message ?? "")) {
    return { ok: false, reason: "not_cancellable", message: DIRECT_CANCEL_NOT_ONLINE };
  }
  return { ok: false, reason: "failed", message: DIRECT_CANCEL_FAILED };
}
