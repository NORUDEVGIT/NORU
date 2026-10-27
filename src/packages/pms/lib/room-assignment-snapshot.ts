/**
 * FO-06 expected snapshot for assigning one reservation room unit.
 * Read from the selected unit only — never the reservation header room
 * (which mirrors the first unit) and never a sibling unit.
 */

export type RoomAssignmentSnapshot = {
  expectedRoomId: string | null;
  expectedUpdatedAt: string | null;
};

export function unitAssignmentSnapshot(input: {
  units: ReadonlyArray<{ id: string; roomId: string | null }>;
  reservationRoomId: string;
  headerRoomId: string | null;
  updatedAt: string | null | undefined;
}): RoomAssignmentSnapshot {
  const expectedUpdatedAt = input.updatedAt || null;
  if (input.units.length === 0) {
    return { expectedRoomId: input.headerRoomId, expectedUpdatedAt };
  }
  const unit = input.reservationRoomId
    ? input.units.find((row) => row.id === input.reservationRoomId)
    : input.units.length === 1
      ? input.units[0]
      : undefined;
  // null skips the RPC room check, so an unassigned unit relies on
  // expectedUpdatedAt: every unit assignment rolls up into the header row
  // (rollup_hotel_reservation_status), bumping hotel_reservations.updated_at.
  return { expectedRoomId: unit?.roomId ?? null, expectedUpdatedAt };
}
