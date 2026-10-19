/**
 * Reservation Detail editability. Property business date is supplied by the caller.
 * Browser time is not a lifecycle input.
 */

export const CLOSED_RESERVATION_STATUSES = ["checked_out", "cancelled", "no_show"] as const;

export type RoomMenuAction = "assign" | "change_room" | "unassign" | "change_room_type";

export type ReservationLifecycleInput = {
  status: string;
  arrivalDate: string;
  businessDate: string;
  canManage: boolean;
};

export function isClosedReservation(status: string): boolean {
  return (CLOSED_RESERVATION_STATUSES as readonly string[]).includes(status);
}

/** Pending or confirmed stay whose arrival is before the property business date. */
export function isUnarrivedPastStay(input: {
  status: string;
  arrivalDate: string;
  businessDate: string;
}): boolean {
  if (input.status !== "pending" && input.status !== "confirmed") return false;
  return input.arrivalDate < input.businessDate;
}

export function reservationMutationBlock(input: {
  status: string;
  arrivalDate: string;
  businessDate: string;
}): string | null {
  if (isClosedReservation(input.status)) {
    return "This reservation is closed and cannot be changed.";
  }
  if (isUnarrivedPastStay(input)) {
    return "This arrival has passed without check-in. Mark the reservation no-show before changing it.";
  }
  return null;
}

export function reservationDetailEditable(input: ReservationLifecycleInput): boolean {
  return input.canManage && reservationMutationBlock(input) == null;
}

export function roomMenuActions(
  input: ReservationLifecycleInput & { roomId: string | null },
): RoomMenuAction[] {
  if (!reservationDetailEditable(input)) return [];
  const beforeCheckIn = input.status === "pending" || input.status === "confirmed";
  const actions: RoomMenuAction[] = [];
  if (beforeCheckIn && !input.roomId) actions.push("assign");
  if (beforeCheckIn && input.roomId) {
    actions.push("change_room");
    actions.push("unassign");
  }
  if (input.status === "checked_in" && input.roomId) actions.push("change_room");
  if (beforeCheckIn) actions.push("change_room_type");
  return actions;
}

export function roomMenuLabel(action: RoomMenuAction): string {
  if (action === "assign") return "Assign Room";
  if (action === "change_room") return "Change Room";
  if (action === "unassign") return "Unassign Room";
  return "Change Room Type";
}
