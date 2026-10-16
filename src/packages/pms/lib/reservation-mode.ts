export const RESERVATION_MODES = ["single", "group"] as const;

export type ReservationMode = (typeof RESERVATION_MODES)[number];

/**
 * Booking mode. `single` owns exactly one room unit. `group` may own one or
 * more. An omitted mode follows the room-unit count so the current create
 * screen keeps working. `roomsRequested` is never the signal.
 */
export function resolveReservationMode(input: {
  requested: string | null | undefined;
  roomUnitCount: number;
}): ReservationMode {
  const count = input.roomUnitCount > 0 ? input.roomUnitCount : 1;
  const requested = typeof input.requested === "string" ? input.requested.trim() : "";
  if (requested === "") return count > 1 ? "group" : "single";
  if (requested !== "single" && requested !== "group") {
    throw new Error("INVALID_RESERVATION_MODE");
  }
  if (requested === "single" && count > 1) {
    throw new Error("SINGLE_RESERVATION_ROOM_LIMIT");
  }
  return requested;
}
