/**
 * Create Reservation Phase 1 — Section 6: Room assignment (Issue #145).
 *
 * Additive expansion of `/restaurant/bookings/new` + `createReservation` →
 * `create_hotel_reservation_priced` (`_room_id` nullable). Reuses CURRENT
 * `listAssignableRooms` (type + dates). Conflict SoT remains
 * `assert_reservation_capacity` (`ROOM_ALREADY_BOOKED` / `ROOM_NOT_ASSIGNABLE`).
 * UI list is advisory. Server / RPC remains source of truth.
 *
 * TIP locked (Rekik APPROVED 2026-09-15):
 * 1. Type-change warn = toast when a specific room clears.
 * 2. Stale room on date change = Unassigned + toast.
 * 3. Occupied rooms stay CURRENT omit (no overbook row).
 * 4. Sticky label Room — `Room {number}` (+ floor if cheap) or Unassigned.
 * 5. FO WalkInDialog room-required stays FO-only. Create path Unassigned OK
 *    even when commercial source is Walk-in.
 * 6. HK chip on picker = omit (HK board OUT).
 * 7. Sticky compose with Section 5 rate/total — do not replace pricing lines.
 *
 * Guest Waves 1–5 + GE1–GE3 stay closed. Section 6 does not claim Phase 1
 * or Create Reservation DONE. Guarantee chrome is Section 7. Packages are
 * Section 8. Migration for this section: NONE. Capability-only — no RLS
 * model change. Flag Abel: NOT required.
 */

export const CREATE_RESERVATION_SECTION6_ISSUE = 145;
export const CREATE_RESERVATION_SECTION6_MIGRATION = "NONE";

/** TIP pick: occupied rooms stay omitted from the success list. */
export const CREATE_RESERVATION_OCCUPIED_DISPLAY = "omit";

/** TIP pick: type-change warn is a visible toast. */
export const CREATE_RESERVATION_TYPE_CHANGE_ROOM_WARN = "toast";

/** TIP pick: stale assigned room on date revalidate clears to Unassigned. */
export const CREATE_RESERVATION_STALE_ROOM_RULE = "clear-to-unassigned-toast";

/** TIP pick: sticky label is Room, not Assignment. */
export const CREATE_RESERVATION_STICKY_ROOM_LABEL = "Room";

/** TIP pick: FO Walk-in room-required stays on WalkInDialog only. */
export const CREATE_RESERVATION_FO_WALKIN_ROOM_REQUIRED = true;

/** TIP pick: housekeeping chip omitted from the create picker. */
export const CREATE_RESERVATION_HK_CHIP = "omit";

export const CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION6 = [
  "AC-CR6-1",
  "AC-CR6-2",
  "AC-CR6-3",
  "AC-CR6-4",
  "AC-CR6-5",
  "AC-CR6-6",
  "AC-CR6-7",
  "AC-CR6-8",
  "AC-CR6-9",
  "AC-CR6-10",
  "AC-CR6-11",
  "AC-CR6-12",
  "AC-CR6-13",
  "AC-CR6-14",
  "AC-CR6-15",
  "AC-CR6-16",
  "AC-CR6-17",
  "AC-CR6-18",
  "AC-CR6-19",
  "AC-CR6-20",
  "AC-CR6-21",
  "AC-CR6-22",
] as const;

export const CREATE_RESERVATION_SECTION6_TIP_AC_MAP = {
  "plan-list-bind-unassigned": ["AC-CR6-1", "AC-CR6-2", "AC-CR6-3", "AC-CR6-4"],
  "plan-conflict-warn-sticky": ["AC-CR6-5", "AC-CR6-6", "AC-CR6-7"],
  "plan-no-second-writer": ["AC-CR6-8", "AC-CR6-9", "AC-CR6-10", "AC-CR6-11"],
  "plan-out-gates": [
    "AC-CR6-12",
    "AC-CR6-13",
    "AC-CR6-14",
    "AC-CR6-15",
    "AC-CR6-16",
    "AC-CR6-17",
    "AC-CR6-18",
    "AC-CR6-19",
    "AC-CR6-20",
    "AC-CR6-21",
    "AC-CR6-22",
  ],
} as const;

export const CREATE_RESERVATION_SECTION6_SCOPE =
  "Section 6 is Room assignment. Guarantee chrome, packages, and send confirmation remain later sections.";

export const CREATE_RESERVATION_SECTION6_PROGRAMME_RULE =
  "Reference Room pick functionality (optional assign, type+dates list) with modern NORU UI. Do not clone legacy chrome. + create room OUT. Corporate and Group remain later separate products.";

export const CREATE_RESERVATION_UNASSIGNED_LABEL = "Unassigned";

export const CREATE_RESERVATION_ROOM_NEEDS_TYPE = "Pick a room type to assign a specific room.";

export const CREATE_RESERVATION_ROOM_CHECKING = "Checking rooms for this stay…";

export const CREATE_RESERVATION_ROOM_EMPTY =
  "No free rooms of this type for those dates — the stay can still be booked and assigned later.";

export const CREATE_RESERVATION_ASSIGN_LATER = "Assign later";

export const CREATE_RESERVATION_ROOM_TYPE_CHANGE_WARN =
  "Room assignment was cleared because the room type changed. The stay is Unassigned.";

export const CREATE_RESERVATION_ROOM_STALE_DATE_WARN =
  "Room assignment was cleared because that room is not free for the new dates. The stay is Unassigned.";

export const CREATE_RESERVATION_SECTION6_MIGRATION_REASON =
  "hotel_reservations.room_id is already nullable. listAssignableRooms, createReservation → create_hotel_reservation_priced (_room_id), and assert_reservation_capacity already exist. Section 6 is Room assignment UX + sticky/warn only. No new columns. No SECURITY DEFINER replace. Dual-lane APPLY not required. Flag Abel: NOT required.";

export const CREATE_RESERVATION_SECTION6_PERMISSION_DOC =
  "Assigning an existing room on create uses requireReservationManager (owner|manager|receptionist). requireRoomManager stays Configuration saveRoom only. Capability-only — no RLS / entitlement model change.";

export const CREATE_RESERVATION_SECTION6_LOCKED_NON_GOALS = [
  "+ create room / saveRoom on this page",
  "overbooking invent",
  "RTC",
  "HK board filter",
  "LIVE OTA / RMS / allotment",
  "second writer (assignReservationRoom stays post-create)",
  "Guarantee + Confirm product",
  "packages",
  "email/SMS send confirmation",
  "parent Company Reservation CR-100",
  "new entitlement / RLS architecture",
  "Phase 1 / Create Reservation DONE claim",
] as const;

export type AssignedRoomView = {
  id: string;
  roomNumber: string;
  floor: string | null;
};

export function formatAssignedRoomLabel(room: Pick<AssignedRoomView, "roomNumber" | "floor">): string {
  return room.floor ? `Room ${room.roomNumber} · Floor ${room.floor}` : `Room ${room.roomNumber}`;
}

export function stickyRoomAssignmentLabel(input: {
  roomTypeId: string;
  roomId: string;
  unassignedValue: string;
  room: Pick<AssignedRoomView, "roomNumber" | "floor"> | null;
}): string {
  if (!input.roomTypeId || input.roomId === input.unassignedValue || !input.room) {
    return CREATE_RESERVATION_UNASSIGNED_LABEL;
  }
  return formatAssignedRoomLabel(input.room);
}

export function shouldWarnRoomClearedOnTypeChange(input: {
  previousRoomId: string;
  unassignedValue: string;
}): boolean {
  return Boolean(input.previousRoomId) && input.previousRoomId !== input.unassignedValue;
}

export function shouldClearStaleAssignedRoom(input: {
  roomId: string;
  unassignedValue: string;
  roomsReady: boolean;
  assignableIds: readonly string[];
}): boolean {
  if (!input.roomId || input.roomId === input.unassignedValue) return false;
  if (!input.roomsReady) return false;
  return !input.assignableIds.includes(input.roomId);
}
