import type {
  ReservationRoomOccupant,
  ReservationRoomUnit,
} from "@/packages/pms/lib/reservation-room-units";

/** Named guests do not change the booked adult, child, or infant counts. */
export const ROOM_OCCUPANT_IDENTITY_NOTE =
  "Named guests identify who is in the room. Booked occupancy stays unchanged.";

export const ROOM_PRIMARY_REMOVAL_NOTE =
  "Choose another primary occupant before removing this guest.";

const HISTORICAL_ROOM_STATUSES = new Set(["cancelled", "checked_out", "no_show"]);

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export type RoomOperationAction = "assign_room" | "check_in" | "check_out" | "change_room";

/** Named slots follow booked adults and children. Infants are not a named slot. */
export function roomOccupantCapacity(adults: number, children: number): number {
  return Math.max(0, adults) + Math.max(0, children);
}

export function roomOccupantsMutable(status: string | null | undefined): boolean {
  return !status || !HISTORICAL_ROOM_STATUSES.has(status);
}

export function roomStatusLabel(status: string | null | undefined): string {
  if (!status) return "Pending";
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function roomOccupancyText(adults: number, children: number, infants: number): string {
  return `${adults} Adult${adults === 1 ? "" : "s"} · ${children} Child${children === 1 ? "" : "ren"} · ${infants} Infant${infants === 1 ? "" : "s"}`;
}

export function primaryRoomOccupant(
  occupants: readonly ReservationRoomOccupant[],
): ReservationRoomOccupant | null {
  return occupants.find((occupant) => occupant.isPrimary) ?? null;
}

/**
 * Name to show for one room. The guest in that room wins. The reservation's
 * primary guest is only used when this room has no occupant of its own.
 */
export function roomGuestDisplayName(
  occupants: readonly Pick<ReservationRoomOccupant, "name" | "isPrimary">[],
  headerGuestName: string,
): string {
  const primary = occupants.find((occupant) => occupant.isPrimary && occupant.name.trim());
  if (primary) return primary.name;
  const named = occupants.find((occupant) => occupant.name.trim());
  return named?.name ?? headerGuestName;
}

export function additionalRoomOccupants(
  occupants: readonly ReservationRoomOccupant[],
): ReservationRoomOccupant[] {
  return occupants.filter((occupant) => !occupant.isPrimary);
}

export function roomOperationActions(status: string | null | undefined): RoomOperationAction[] {
  if (status === "pending") return ["assign_room"];
  if (status === "confirmed") return ["assign_room", "check_in"];
  if (status === "checked_in") return ["change_room", "check_out"];
  return [];
}

/** One-room stays keep the existing guest line unless this room has its own occupant list. */
export function shouldShowRoomOccupantContext(input: {
  unitCount: number;
  selected: boolean;
  occupants: readonly { guestId: string; isPrimary: boolean }[];
  bookerGuestId: string | null;
}): boolean {
  if (input.unitCount > 1) return input.selected;
  if (input.occupants.length > 1) return true;
  const primary = input.occupants.find((occupant) => occupant.isPrimary);
  return Boolean(primary && input.bookerGuestId && primary.guestId !== input.bookerGuestId);
}

export function roomDisplayName(
  unit: Pick<ReservationRoomUnit, "roomTypeId" | "roomTypeName">,
  fallbackTypeId: string,
  fallbackName: string | null,
): string {
  if (unit.roomTypeName) return unit.roomTypeName;
  if (unit.roomTypeId === fallbackTypeId && fallbackName) return fallbackName;
  return "Room type";
}
