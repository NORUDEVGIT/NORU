/**
 * Phase 0 — rack/stay mutation freshness. No new concurrency table.
 * Callers pass the room/dates/updated_at they acted on; the writer re-reads.
 */

export const STAY_MUTATION_CONFLICT =
  "This stay changed since you opened it. Refresh Front Office and try again.";

export type StayMutationSnapshot = {
  roomId: string | null;
  arrival: string;
  departure: string;
  updatedAt: string | null;
};

export type StayMutationExpectation = {
  expectedRoomId?: string | null;
  expectedArrival?: string;
  expectedDeparture?: string;
  expectedUpdatedAt?: string | null;
};

export function stayMutationIsStale(
  expected: StayMutationExpectation,
  current: StayMutationSnapshot,
): boolean {
  if (expected.expectedRoomId !== undefined && (expected.expectedRoomId ?? null) !== (current.roomId ?? null)) {
    return true;
  }
  if (expected.expectedArrival !== undefined && expected.expectedArrival !== current.arrival) {
    return true;
  }
  if (expected.expectedDeparture !== undefined && expected.expectedDeparture !== current.departure) {
    return true;
  }
  if (
    expected.expectedUpdatedAt !== undefined &&
    expected.expectedUpdatedAt !== null &&
    expected.expectedUpdatedAt !== "" &&
    expected.expectedUpdatedAt !== current.updatedAt
  ) {
    return true;
  }
  return false;
}
