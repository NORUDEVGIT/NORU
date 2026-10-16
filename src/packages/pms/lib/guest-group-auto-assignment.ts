/**
 * AutoAssignmentService — group room assignment against Room Inventory.
 * Never fakes a successful assignment. Failures are returned as explicit results.
 */
import type { AssignableRoom } from "./reservations.functions";

export type AutoAssignmentNeed = {
  reservationId: string;
  roomTypeId: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  currentRoomId: string | null;
  preferenceNote: string | null;
};

export type AutoAssignmentResult = {
  reservationId: string;
  roomId: string | null;
  roomNumber: string | null;
  assigned: boolean;
  reason: string | null;
};

export type AutoAssignmentInventory = {
  listAssignableRooms: (input: {
    restaurantId: string;
    roomTypeId: string;
    arrival: string;
    departure: string;
    excludeReservationId?: string;
  }) => Promise<AssignableRoom[]>;
};

export interface AutoAssignmentService {
  propose(input: {
    restaurantId: string;
    needs: AutoAssignmentNeed[];
    inventory: AutoAssignmentInventory;
  }): Promise<AutoAssignmentResult[]>;
}

function preferenceHint(note: string | null | undefined): string {
  return (note ?? "").toLowerCase();
}

function scoreCandidate(room: AssignableRoom, need: AutoAssignmentNeed): number {
  let score = 0;
  const hint = preferenceHint(need.preferenceNote);
  if (hint && room.roomNumber.toLowerCase().includes(hint)) score += 4;
  if (hint && (room.building ?? "").toLowerCase().includes(hint)) score += 2;
  if (hint && (room.floor ?? "").toLowerCase().includes(hint)) score += 1;
  if (room.housekeepingStatus === "clean" || room.housekeepingStatus === "inspected") score += 2;
  return score;
}

export const roomInventoryAutoAssignment: AutoAssignmentService = {
  async propose(input) {
    const used = new Set<string>();
    const results: AutoAssignmentResult[] = [];
    for (const need of input.needs) {
      if (need.currentRoomId) {
        used.add(need.currentRoomId);
        results.push({
          reservationId: need.reservationId,
          roomId: need.currentRoomId,
          roomNumber: null,
          assigned: false,
          reason: "Already assigned.",
        });
        continue;
      }
      const available = await input.inventory.listAssignableRooms({
        restaurantId: input.restaurantId,
        roomTypeId: need.roomTypeId,
        arrival: need.arrival,
        departure: need.departure,
        excludeReservationId: need.reservationId,
      });
      const unused = available.filter((room) => !used.has(room.id));
      if (unused.length === 0) {
        results.push({
          reservationId: need.reservationId,
          roomId: null,
          roomNumber: null,
          assigned: false,
          reason: "No available room of this type for the stay dates.",
        });
        continue;
      }
      unused.sort((a, b) => scoreCandidate(b, need) - scoreCandidate(a, need) || a.roomNumber.localeCompare(b.roomNumber));
      const pick = unused[0];
      used.add(pick.id);
      results.push({
        reservationId: need.reservationId,
        roomId: pick.id,
        roomNumber: pick.roomNumber,
        assigned: true,
        reason: null,
      });
    }
    return results;
  },
};
