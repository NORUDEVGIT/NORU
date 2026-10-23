import { isGroupPickupStatus } from "./groups";

export const GROUP_OPERATIONAL_UNIT_LIMIT = 2000;

/**
 * `contributesToPickup` is eligibility for allotment pickup on overlapping nights:
 * pickup-status AND this group's block id. It is not a claim that the unit occupies
 * every block night. Authoritative nightly occupancy stays on `blocks[].nights`
 * via `nightlyAllotment`; `blocks[].totals.pickedUp` is the peak night.
 */
export interface GroupOperationalUnit {
  reservationId: string;
  confirmationNumber: string;
  reservationRoomId: string;
  guestId: string | null;
  guestName: string | null;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
  arrivalDate: string;
  departureDate: string;
  reservationStatus: string;
  unitStatus: string;
  blockId: string | null;
  blockLabel: string | null;
  isGroupOnlyLink: boolean;
  contributesToPickup: boolean;
}

export interface GroupOperationalIdentity {
  id: string;
  confirmationNumber: string;
  name: string;
  code: string | null;
}

export function guestDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : null;
}

export function unitContributesToGroupPickup(input: {
  status: string;
  blockId: string | null | undefined;
  groupBlockIds: ReadonlySet<string>;
}): boolean {
  if (!input.blockId) return false;
  if (!input.groupBlockIds.has(input.blockId)) return false;
  return isGroupPickupStatus(input.status);
}

export function mapGroupOperationalUnit(input: {
  unit: {
    id: string;
    reservation_id: string;
    room_type_id: string | null;
    room_id: string | null;
    arrival_date: string;
    departure_date: string;
    status: string | null;
    pms_group_block_id: string | null;
  };
  header: {
    id: string;
    confirmation_number: string;
    guest_id: string | null;
    pms_group_id: string | null;
    status: string;
  };
  groupId: string;
  groupBlockIds: ReadonlySet<string>;
  blockLabel: string | null;
  guestName: string | null;
  roomNumber: string | null;
  roomTypeName: string | null;
}): GroupOperationalUnit {
  const unitStatus = input.unit.status ?? input.header.status;
  const blockId = input.unit.pms_group_block_id;
  return {
    reservationId: input.header.id,
    confirmationNumber: input.header.confirmation_number,
    reservationRoomId: input.unit.id,
    guestId: input.header.guest_id,
    guestName: input.guestName,
    roomId: input.unit.room_id,
    roomNumber: input.roomNumber,
    roomTypeId: input.unit.room_type_id,
    roomTypeName: input.roomTypeName,
    arrivalDate: input.unit.arrival_date,
    departureDate: input.unit.departure_date,
    reservationStatus: input.header.status,
    unitStatus,
    blockId,
    blockLabel: blockId ? input.blockLabel : null,
    isGroupOnlyLink: input.header.pms_group_id === input.groupId && !blockId,
    contributesToPickup: unitContributesToGroupPickup({
      status: unitStatus,
      blockId,
      groupBlockIds: input.groupBlockIds,
    }),
  };
}
