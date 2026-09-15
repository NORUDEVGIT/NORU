/**
 * Create Reservation Phase 1 — Section 4: Availability / room type (Issue #131).
 *
 * Additive expansion of `/restaurant/bookings/new` + `createReservation` →
 * `create_hotel_reservation_priced`. Maps CURRENT `getRoomTypeAvailability`
 * integers. Server / RPC remains source of truth. No second inventory API,
 * LIVE OTA, RMS, yield, or overbooking product.
 *
 * Guest Waves 1–5 + GE1–GE3 stay closed. Section 4 does not claim Phase 1
 * or Create Reservation DONE. Rate is Section 5. Specific room is Section 6.
 * Confirm chrome is Section 7. Migration for this section: NONE.
 */

import { occupancyBlockMessage, occupancyExceeded } from "./fo-amendments.ts";

export const CREATE_RESERVATION_SECTION4_ISSUE = 131;
export const CREATE_RESERVATION_SECTION4_MIGRATION = "NONE";

/** Documented limited threshold: remaining count in (0, 2]. Not a new inventory product. */
export const CREATE_RESERVATION_LIMITED_AVAILABLE_MAX = 2;

export const CREATE_RESERVATION_STALE_SELECTION_RULE = "keep-selection-disable-submit";

export const CREATE_RESERVATION_CAPACITY_ENFORCEMENT = "maxOccupancy-warn-only";

export const CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION4 = [
  "AC-CR4-1",
  "AC-CR4-2",
  "AC-CR4-3",
  "AC-CR4-4",
  "AC-CR4-5",
  "AC-CR4-6",
  "AC-CR4-7",
  "AC-CR4-8",
  "AC-CR4-9",
  "AC-CR4-10",
  "AC-CR4-11",
  "AC-CR4-12",
  "AC-CR4-13",
  "AC-CR4-14",
  "AC-CR4-15",
  "AC-CR4-16",
  "AC-CR4-17",
  "AC-CR4-18",
  "AC-CR4-19",
  "AC-CR4-20",
  "AC-CR4-21",
] as const;

export const CREATE_RESERVATION_SECTION4_TIP_AC_MAP = {
  "plan-list-states": ["AC-CR4-1", "AC-CR4-2", "AC-CR4-3", "AC-CR4-4"],
  "plan-occupancy-bind-sot": ["AC-CR4-5", "AC-CR4-6", "AC-CR4-7", "AC-CR4-8"],
  "plan-sticky-boundaries": ["AC-CR4-9", "AC-CR4-10", "AC-CR4-11", "AC-CR4-12"],
  "plan-gates-honesty": [
    "AC-CR4-13",
    "AC-CR4-14",
    "AC-CR4-15",
    "AC-CR4-16",
    "AC-CR4-17",
    "AC-CR4-18",
    "AC-CR4-19",
    "AC-CR4-20",
    "AC-CR4-21",
  ],
} as const;

export type RoomTypeAvailabilityState = "available" | "limited" | "none";

export const ROOM_TYPE_AVAILABILITY_LABELS: Record<RoomTypeAvailabilityState, string> = {
  available: "Available",
  limited: "Limited",
  none: "Fully booked",
};

export const CREATE_RESERVATION_LIMITED_THRESHOLD_DOC =
  "available: available > 2; limited: available > 0 && available <= 2; none: available === 0";

export const CREATE_RESERVATION_SECTION4_SCOPE =
  "Section 4 is Availability / room type only. Rate, specific room, guarantee, packages, and send confirmation are later sections.";

export const CREATE_RESERVATION_NO_ROOM_TYPE = "No room type selected";

export const CREATE_RESERVATION_AVAILABILITY_NEEDS_DATES = "Choose valid dates to see availability.";

export const CREATE_RESERVATION_EMPTY_CATALOGUE =
  "No sellable room types yet. Add them in Configuration → Rooms.";

export const CREATE_RESERVATION_CHECKING_AVAILABILITY = "Checking availability…";

export const CREATE_RESERVATION_CAPACITY_DISPLAY_ONLY =
  "Adult and child capacity labels are display-only. Occupancy warn uses max occupancy (adults + children).";

export const CREATE_RESERVATION_OCCUPANCY_WARN_CONTINUE =
  "This is a warning — create is not blocked for occupancy on this section.";

export const CREATE_RESERVATION_SECTION4_MIGRATION_REASON =
  "Section 4 maps CURRENT getRoomTypeAvailability integers and binds the existing roomTypeId → _room_type_id writer. Inventory and create RPCs already exist. No additive columns or SECURITY DEFINER replacements in this section.";

export const CREATE_RESERVATION_SECTION4_LOCKED_NON_GOALS = [
  "LIVE OTA connector",
  "RMS / yield engine",
  "overbooking policy",
  "second inventory API",
  "specific room assign expand",
  "forced rate plan",
  "Confirm product",
  "group block / allotment / rooming list",
  "parent Company Reservation CR-100",
  "Company-TA inventory",
  "closed-to-arrival / min-stay engine",
  "new entitlement / RLS architecture",
] as const;

export type SelectedRoomTypeMeta = {
  roomTypeId: string;
  name: string;
  code: string;
  maxOccupancy: number;
  adultCapacity: number;
  childCapacity: number;
};

export type LiveRoomTypeAvailability = {
  available: number;
  totalRooms: number;
};

export type StickyAvailability =
  | { kind: "unset" }
  | { kind: "needs_dates" }
  | { kind: "loading" }
  | { kind: "state"; state: RoomTypeAvailabilityState; available: number; totalRooms: number };

/**
 * Map CURRENT inventory integers to staff-visible states.
 * Does not invent blocked / closed / OTA stop-sell signals.
 */
export function roomTypeAvailabilityState(available: number): RoomTypeAvailabilityState {
  if (!Number.isFinite(available) || available <= 0) return "none";
  if (available <= CREATE_RESERVATION_LIMITED_AVAILABLE_MAX) return "limited";
  return "available";
}

export function isRoomTypeSelectable(available: number): boolean {
  return roomTypeAvailabilityState(available) !== "none";
}

export function remainingCountCopy(available: number): string {
  const n = Math.max(0, Number.isFinite(available) ? available : 0);
  if (n === 0) return "none remaining";
  if (n === 1) return "1 remaining";
  return `${n} remaining`;
}

export function roomTypeAvailabilityCopy(available: number, totalRooms: number): string {
  const state = roomTypeAvailabilityState(available);
  const remaining = remainingCountCopy(available);
  const ofTotal = `${Math.max(0, available)} of ${totalRooms} available`;
  if (state === "none") return `Fully booked · ${remaining}`;
  if (state === "limited") return `Limited · ${remaining} · ${ofTotal}`;
  return `Available · ${remaining} · ${ofTotal}`;
}

export function roomTypeCapacityDisplay(adultCapacity: number, childCapacity: number): string {
  return `Adult capacity ${adultCapacity} · Child capacity ${childCapacity} (display only)`;
}

export function stickyRoomTypeLabel(selected: { name: string; code: string } | null | undefined): string {
  if (!selected) return CREATE_RESERVATION_NO_ROOM_TYPE;
  return `${selected.name} (${selected.code})`;
}

export function stickyAvailability(input: {
  roomTypeId: string;
  datesValid: boolean;
  loading: boolean;
  live: LiveRoomTypeAvailability | undefined;
}): StickyAvailability {
  if (!input.roomTypeId) return { kind: "unset" };
  if (!input.datesValid) return { kind: "needs_dates" };
  if (input.loading && !input.live) return { kind: "loading" };
  if (!input.live) {
    return { kind: "state", state: "none", available: 0, totalRooms: 0 };
  }
  return {
    kind: "state",
    state: roomTypeAvailabilityState(input.live.available),
    available: input.live.available,
    totalRooms: input.live.totalRooms,
  };
}

export function stickyAvailabilityCopy(row: StickyAvailability): string {
  if (row.kind === "unset") return "No availability until a room type is selected.";
  if (row.kind === "needs_dates") return CREATE_RESERVATION_AVAILABILITY_NEEDS_DATES;
  if (row.kind === "loading") return CREATE_RESERVATION_CHECKING_AVAILABILITY;
  if (row.state === "none") return `Fully booked (none) · ${remainingCountCopy(row.available)}`;
  return `${ROOM_TYPE_AVAILABILITY_LABELS[row.state]} · ${remainingCountCopy(row.available)}`;
}

/** Warn-only. Does not add a create-RPC occupancy hard-block. */
export function occupancySoftWarn(
  adults: number,
  children: number,
  maxOccupancy: number | undefined,
): string | null {
  if (maxOccupancy == null) return null;
  if (!occupancyExceeded(adults, children, maxOccupancy)) return null;
  return occupancyBlockMessage(adults, children, maxOccupancy);
}
