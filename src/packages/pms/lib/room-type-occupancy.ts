/**
 * Room-type hard occupancy eligibility.
 *
 * Hard capacity (eligibility):
 * - room_types.max_occupancy — adults + children ceiling
 * - room_types.adult_capacity — max adults when configured (> 0)
 * - room_types.child_capacity — max children (0 means no children)
 *
 * Pricing (not capacity):
 * - hotel_rate_plans.included_occupancy / extra_adult_rate / extra_child_rate
 *
 * Infants do not consume hard capacity.
 */

export type RoomTypeOccupancyCapacity = {
  maxOccupancy: number;
  adultCapacity: number;
  childCapacity: number;
};

export type RoomTypeOccupancyIssue = "maxOccupancy" | "adultCapacity" | "childCapacity";

export type RoomTypeOccupancyIneligibility = {
  issues: RoomTypeOccupancyIssue[];
  reason: string;
  maximum: string;
  message: string;
};

export function formatPartyOccupancy(adults: number, children: number): string {
  const adultLabel = adults === 1 ? "1 adult" : `${Math.max(0, adults)} adults`;
  const childLabel = children === 1 ? "1 child" : `${Math.max(0, children)} children`;
  return `${adultLabel} + ${childLabel}`;
}

export function formatConfiguredRoomTypeOccupancy(
  capacity: RoomTypeOccupancyCapacity,
): string {
  const adultConfigured =
    Number.isFinite(capacity.adultCapacity) && capacity.adultCapacity > 0;
  const childConfigured = Number.isFinite(capacity.childCapacity);
  if (adultConfigured || childConfigured) {
    const adults = adultConfigured ? capacity.adultCapacity : 0;
    const children = childConfigured ? Math.max(0, capacity.childCapacity) : 0;
    return formatPartyOccupancy(adults, children);
  }
  const max = Math.max(0, capacity.maxOccupancy);
  return max === 1 ? "1 guest" : `${max} guests`;
}

export function roomTypeOccupancyIssues(
  adults: number,
  children: number,
  capacity: RoomTypeOccupancyCapacity | null | undefined,
): RoomTypeOccupancyIssue[] {
  if (!capacity) return [];
  const issues: RoomTypeOccupancyIssue[] = [];
  const total = Math.max(0, adults) + Math.max(0, children);
  if (
    Number.isFinite(capacity.maxOccupancy) &&
    capacity.maxOccupancy > 0 &&
    total > capacity.maxOccupancy
  ) {
    issues.push("maxOccupancy");
  }
  if (
    Number.isFinite(capacity.adultCapacity) &&
    capacity.adultCapacity > 0 &&
    adults > capacity.adultCapacity
  ) {
    issues.push("adultCapacity");
  }
  if (
    Number.isFinite(capacity.childCapacity) &&
    children > capacity.childCapacity
  ) {
    issues.push("childCapacity");
  }
  return issues;
}

export function roomTypeOccupancyFits(
  adults: number,
  children: number,
  capacity: RoomTypeOccupancyCapacity | null | undefined,
): boolean {
  return roomTypeOccupancyIssues(adults, children, capacity).length === 0;
}

export function roomTypeOccupancyIneligibility(
  adults: number,
  children: number,
  capacity: RoomTypeOccupancyCapacity | null | undefined,
): RoomTypeOccupancyIneligibility | null {
  const issues = roomTypeOccupancyIssues(adults, children, capacity);
  if (!capacity || issues.length === 0) return null;
  const reason = `Not eligible for ${formatPartyOccupancy(adults, children)}`;
  const maximum = `Maximum occupancy: ${formatConfiguredRoomTypeOccupancy(capacity)}`;
  return {
    issues,
    reason,
    maximum,
    message: `${reason}. ${maximum}.`,
  };
}

export function roomTypeCapacityFromRow(row: {
  max_occupancy?: number | null;
  adult_capacity?: number | null;
  child_capacity?: number | null;
  maxOccupancy?: number | null;
  adultCapacity?: number | null;
  childCapacity?: number | null;
} | null | undefined): RoomTypeOccupancyCapacity | null {
  if (!row) return null;
  const maxOccupancy = Number(row.maxOccupancy ?? row.max_occupancy ?? 0);
  const adultCapacity = Number(row.adultCapacity ?? row.adult_capacity ?? 0);
  const childCapacity = Number(row.childCapacity ?? row.child_capacity ?? 0);
  return {
    maxOccupancy: Number.isFinite(maxOccupancy) ? maxOccupancy : 0,
    adultCapacity: Number.isFinite(adultCapacity) ? adultCapacity : 0,
    childCapacity: Number.isFinite(childCapacity) ? childCapacity : 0,
  };
}

/** Staff-safe domain error when party exceeds configured hard capacity. */
export function assertRoomTypePartyOccupancy(
  adults: number,
  children: number,
  capacity: RoomTypeOccupancyCapacity | number | null | undefined,
): void {
  if (capacity == null) return;
  if (typeof capacity === "number") {
    const total = Math.max(0, adults) + Math.max(0, children);
    if (Number.isFinite(capacity) && capacity > 0 && total > capacity) {
      throw new Error(
        `Not eligible for ${formatPartyOccupancy(adults, children)}. Maximum occupancy: ${
          capacity === 1 ? "1 guest" : `${capacity} guests`
        }.`,
      );
    }
    return;
  }
  const blocked = roomTypeOccupancyIneligibility(adults, children, capacity);
  if (blocked) throw new Error(blocked.message);
}
