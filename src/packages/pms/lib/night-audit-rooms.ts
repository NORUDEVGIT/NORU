/**
 * Room-unit occupancy findings for Night Audit.
 *
 * One checked-in reservation room unit is one occupancy. Header room_id is not
 * copied onto sibling units. This module does not change room or housekeeping state.
 */
import type { StayRoomSlice } from "./reservation-room-units.ts";

function isOpenDiscrepancyStatus(status: string): boolean {
  return status === "open" || status === "unresolved";
}

export type RoomAuditException = {
  exceptionType: string;
  severity: "warning" | "blocking";
  referenceType: string | null;
  referenceId: string | null;
  message: string;
};

/** Checked-in reservation room units. Not travelers, and not reservation headers. */
export const NIGHT_AUDIT_IN_HOUSE_GRAIN = "checked_in_reservation_room_units" as const;

export function roomUnitIntegrityExceptions(input: {
  stays: readonly StayRoomSlice[];
  reservations: readonly { id: string; confirmationNumber: string }[];
  rooms: readonly { id: string; roomNumber: string; status: string }[];
}): RoomAuditException[] {
  const exceptions: RoomAuditException[] = [];
  const reservationById = new Map(input.reservations.map((row) => [row.id, row]));
  const roomById = new Map(input.rooms.map((row) => [row.id, row]));
  const occupants = new Map<string, string[]>();

  for (const stay of input.stays) {
    if (stay.status !== "checked_in") continue;
    const reservation = reservationById.get(stay.reservationId);
    if (!reservation) continue;
    if (!stay.roomId) {
      exceptions.push({
        exceptionType: "checked_in_without_room",
        severity: "blocking",
        referenceType: "reservation",
        referenceId: reservation.id,
        message: `${reservation.confirmationNumber} is checked in without an assigned room.`,
      });
      continue;
    }
    const names = occupants.get(stay.roomId) ?? [];
    names.push(reservation.confirmationNumber);
    occupants.set(stay.roomId, names);
    const physical = roomById.get(stay.roomId);
    if (physical && (physical.status === "out_of_order" || physical.status === "out_of_service")) {
      exceptions.push({
        exceptionType: "occupied_restricted_room",
        severity: "blocking",
        referenceType: "reservation",
        referenceId: reservation.id,
        message: `${reservation.confirmationNumber} occupies room ${physical.roomNumber}, which is ${physical.status.replaceAll("_", " ")}.`,
      });
    }
  }

  for (const [roomId, names] of occupants) {
    if (names.length < 2) continue;
    const roomNumber = roomById.get(roomId)?.roomNumber ?? roomId;
    exceptions.push({
      exceptionType: "room_double_occupancy",
      severity: "blocking",
      referenceType: "room",
      referenceId: roomId,
      message: `Room ${roomNumber} has ${names.length} overlapping checked-in stays (${names.join(", ")}).`,
    });
  }

  return exceptions;
}

export function housekeepingNightAuditExceptions(input: {
  rooms: readonly {
    id: string;
    roomNumber: string;
    status: string;
    housekeepingStatus: string;
    restrictionReason: string | null;
    active: boolean;
  }[];
  occupiedRoomIds: ReadonlySet<string>;
  openTaskRoomIds: ReadonlySet<string>;
  discrepancies: readonly { roomId: string; status: string }[];
}): RoomAuditException[] {
  const exceptions: RoomAuditException[] = [];
  const roomNumberById = new Map(input.rooms.map((room) => [room.id, room.roomNumber]));

  for (const room of input.rooms) {
    if (
      room.housekeepingStatus === "dirty" &&
      !input.occupiedRoomIds.has(room.id) &&
      !input.openTaskRoomIds.has(room.id)
    ) {
      exceptions.push({
        exceptionType: "dirty_room_without_task",
        severity: "warning",
        referenceType: "room",
        referenceId: room.id,
        message: `Room ${room.roomNumber} is vacant and dirty with no open cleaning task.`,
      });
    }
    if ((room.status === "out_of_order" || room.status === "out_of_service") && !room.restrictionReason) {
      exceptions.push({
        exceptionType: "restriction_without_reason",
        severity: "warning",
        referenceType: "room",
        referenceId: room.id,
        message: `Room ${room.roomNumber} is ${room.status.replaceAll("_", " ")} without a reason recorded.`,
      });
    }
    if (input.occupiedRoomIds.has(room.id) && room.housekeepingStatus === "inspected" && !room.active) {
      exceptions.push({
        exceptionType: "inconsistent_room_state",
        severity: "warning",
        referenceType: "room",
        referenceId: room.id,
        message: `Room ${room.roomNumber} is occupied but marked inactive.`,
      });
    }
  }

  for (const row of input.discrepancies) {
    if (!isOpenDiscrepancyStatus(row.status)) continue;
    if (!input.occupiedRoomIds.has(row.roomId)) continue;
    exceptions.push({
      exceptionType: "hk_conflict",
      severity: "blocking",
      referenceType: "room",
      referenceId: row.roomId,
      message: `Occupied room ${roomNumberById.get(row.roomId) ?? row.roomId} has an open housekeeping discrepancy.`,
    });
  }

  return exceptions;
}
