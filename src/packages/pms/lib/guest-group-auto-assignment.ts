/**
 * AutoAssignmentService — group room assignment against Room Inventory.
 * Never fakes a successful assignment. Failures are returned as explicit results.
 */
import type { AssignableRoom } from "./reservations.functions";
import { PAIR_PARTNER_UNAVAILABLE_REJECTION } from "./room-requirement-rejection";

export type AutoAssignmentNeed = {
  reservationId: string;
  /** The room unit to fill. Its stored requirements decide which rooms qualify. */
  reservationRoomId?: string | null;
  roomTypeId: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  currentRoomId: string | null;
  preferenceNote: string | null;
  /** The room unit this one is paired with for connecting rooms, when it has an active pair. */
  pairPartnerReservationRoomId?: string | null;
};

export type AutoAssignmentResult = {
  reservationId: string;
  reservationRoomId?: string | null;
  roomId: string | null;
  roomNumber: string | null;
  assigned: boolean;
  reason: string | null;
  /** The partner unit when this room was chosen together with the partner's room. */
  pairedWith?: string | null;
};

export type AutoAssignmentInventory = {
  listAssignableRooms: (input: {
    restaurantId: string;
    roomTypeId: string;
    arrival: string;
    departure: string;
    excludeReservationId?: string;
    reservationRoomId?: string;
  }) => Promise<AssignableRoom[]>;
  /** Rooms with a physical connecting link to this room. Needed to place paired units. */
  connectingRoomIds?: (input: { restaurantId: string; roomId: string }) => Promise<string[]>;
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

function unitOf(need: AutoAssignmentNeed): { reservationRoomId?: string } {
  return need.reservationRoomId ? { reservationRoomId: need.reservationRoomId } : {};
}

function failed(need: AutoAssignmentNeed, reason: string): AutoAssignmentResult {
  return {
    reservationId: need.reservationId,
    ...unitOf(need),
    roomId: null,
    roomNumber: null,
    assigned: false,
    reason,
  };
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : "Rooms could not be checked.";
}

function listFor(
  input: { restaurantId: string; inventory: AutoAssignmentInventory },
  need: AutoAssignmentNeed,
): Promise<AssignableRoom[]> {
  // The inventory read applies the stored requirements and the pair of this need's room unit
  // through the canonical evaluators. Without a unit on a reservation with several rooms it
  // refuses to guess, so a thrown error is reported for this need and the loop goes on.
  return input.inventory.listAssignableRooms({
    restaurantId: input.restaurantId,
    roomTypeId: need.roomTypeId,
    arrival: need.arrival,
    departure: need.departure,
    excludeReservationId: need.reservationId,
    ...(need.reservationRoomId ? { reservationRoomId: need.reservationRoomId } : {}),
  });
}

function bestFirst(rooms: AssignableRoom[], need: AutoAssignmentNeed): AssignableRoom[] {
  return [...rooms].sort(
    (a, b) =>
      scoreCandidate(b, need) - scoreCandidate(a, need) || a.roomNumber.localeCompare(b.roomNumber),
  );
}

/**
 * Two unassigned paired units are placed together: a room for the first, and a room
 * that physically connects to it for the second, each judged against its own unit's
 * requirements. If no such combination exists neither unit gets a room, so one side is
 * never assigned while the other has no eligible connecting partner.
 */
async function proposePair(
  input: { restaurantId: string; inventory: AutoAssignmentInventory },
  first: AutoAssignmentNeed,
  second: AutoAssignmentNeed,
  used: Set<string>,
): Promise<[AutoAssignmentResult, AutoAssignmentResult]> {
  const noPair = (): [AutoAssignmentResult, AutoAssignmentResult] => [
    failed(first, PAIR_PARTNER_UNAVAILABLE_REJECTION),
    failed(second, PAIR_PARTNER_UNAVAILABLE_REJECTION),
  ];
  const connecting = input.inventory.connectingRoomIds;
  if (!connecting) return noPair();

  let firstRooms: AssignableRoom[];
  let secondRooms: AssignableRoom[];
  try {
    [firstRooms, secondRooms] = await Promise.all([listFor(input, first), listFor(input, second)]);
  } catch (error) {
    const reason = errorReason(error);
    return [failed(first, reason), failed(second, reason)];
  }
  const secondById = new Map(
    secondRooms.filter((room) => !used.has(room.id)).map((room) => [room.id, room]),
  );

  let best: { a: AssignableRoom; b: AssignableRoom; score: number } | null = null;
  for (const a of bestFirst(
    firstRooms.filter((room) => !used.has(room.id)),
    first,
  )) {
    let linked: string[];
    try {
      linked = await connecting({ restaurantId: input.restaurantId, roomId: a.id });
    } catch (error) {
      const reason = errorReason(error);
      return [failed(first, reason), failed(second, reason)];
    }
    const partners = linked
      .filter((id) => id !== a.id)
      .map((id) => secondById.get(id))
      .filter((room): room is AssignableRoom => room !== undefined);
    if (partners.length === 0) continue;
    const b = bestFirst(partners, second)[0]!;
    const score = scoreCandidate(a, first) + scoreCandidate(b, second);
    if (!best || score > best.score) best = { a, b, score };
  }
  if (!best) return noPair();
  used.add(best.a.id);
  used.add(best.b.id);
  return [
    {
      reservationId: first.reservationId,
      ...unitOf(first),
      roomId: best.a.id,
      roomNumber: best.a.roomNumber,
      assigned: true,
      reason: null,
      pairedWith: second.reservationRoomId ?? null,
    },
    {
      reservationId: second.reservationId,
      ...unitOf(second),
      roomId: best.b.id,
      roomNumber: best.b.roomNumber,
      assigned: true,
      reason: null,
      pairedWith: first.reservationRoomId ?? null,
    },
  ];
}

export const roomInventoryAutoAssignment: AutoAssignmentService = {
  async propose(input) {
    // Rooms already held by any need, including sibling units of the same reservation,
    // which the inventory read does not exclude.
    const used = new Set<string>(
      input.needs.flatMap((need) => (need.currentRoomId ? [need.currentRoomId] : [])),
    );
    const resultByNeed = new Map<AutoAssignmentNeed, AutoAssignmentResult>();

    // Paired units go first, while the rooms that connect are still free. A pair whose
    // partner already holds a room is not placed here: the pair-aware list for the open
    // unit only offers rooms that connect to that room.
    const needByUnit = new Map<string, AutoAssignmentNeed>();
    for (const need of input.needs) {
      if (need.reservationRoomId) needByUnit.set(need.reservationRoomId, need);
    }
    for (const need of input.needs) {
      if (resultByNeed.has(need) || need.currentRoomId) continue;
      const partner = need.pairPartnerReservationRoomId
        ? needByUnit.get(need.pairPartnerReservationRoomId)
        : undefined;
      if (!partner || partner === need || partner.currentRoomId || resultByNeed.has(partner)) continue;
      const [first, second] = await proposePair(input, need, partner, used);
      resultByNeed.set(need, first);
      resultByNeed.set(partner, second);
    }

    for (const need of input.needs) {
      if (resultByNeed.has(need)) continue;
      if (need.currentRoomId) {
        used.add(need.currentRoomId);
        resultByNeed.set(need, {
          reservationId: need.reservationId,
          ...unitOf(need),
          roomId: need.currentRoomId,
          roomNumber: null,
          assigned: false,
          reason: "Already assigned.",
        });
        continue;
      }
      let available: AssignableRoom[];
      try {
        available = await listFor(input, need);
      } catch (error) {
        resultByNeed.set(need, failed(need, errorReason(error)));
        continue;
      }
      const unused = available.filter((room) => !used.has(room.id));
      if (unused.length === 0) {
        resultByNeed.set(need, failed(need, "No available room of this type for the stay dates."));
        continue;
      }
      const pick = bestFirst(unused, need)[0]!;
      used.add(pick.id);
      resultByNeed.set(need, {
        reservationId: need.reservationId,
        ...unitOf(need),
        roomId: pick.id,
        roomNumber: pick.roomNumber,
        assigned: true,
        reason: null,
      });
    }
    return input.needs.map((need) => resultByNeed.get(need)!);
  },
};
