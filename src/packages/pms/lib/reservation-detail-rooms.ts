import { REVIEW_ROOM_PREFERENCE_FLAGS } from "@/packages/pms/lib/create-reservation-review";
import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
import type { ReservationRoomDisplay } from "@/packages/pms/lib/reservation-room-display.functions";
import type { AssignableRoom, ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import type { HotelRoom, RoomType } from "@/packages/pms/lib/rooms.functions";
import { formatStayDate } from "@/shared/lib/property-dates";

export const ASSIGNMENT_NOTES_MAX = 500;

export const ASSIGNMENT_NOTES_GAP_COPY =
  "Assignment notes are not stored on the reservation. Stay notes remain on Notes & Traces.";

export const ROOM_PREF_SAVE_COPY =
  "Room preferences for this stay are stored as reservation special requests. Guest Profile preferences are not overwritten.";

export const ROOM_ASSIGNMENT_PREFS = [
  { id: "high_floor", label: "High Floor", aliases: ["high floor"] },
  { id: "king_bed", label: "King bed", aliases: ["king bed", "king"] },
  { id: "quiet_room", label: "Quiet room", aliases: ["quiet room", "quiet"] },
  { id: "connecting", label: "Connecting room (if available)", aliases: ["connecting"] },
  { id: "twin_bed", label: "Twin bed", aliases: ["twin bed", "twin"] },
  { id: "mountain_view", label: "Mountain view (if available)", aliases: ["mountain view"] },
  { id: "near_elevator", label: "Near elevator", aliases: ["near elevator", "elevator"] },
] as const;

export type RoomAssignmentPrefId = (typeof ROOM_ASSIGNMENT_PREFS)[number]["id"];

export type RoomAssignmentFilters = {
  floor: string;
  view: string;
  status: string;
  feature: string;
  search: string;
};

export type RoomAssignmentRow = {
  id: string;
  roomNumber: string;
  roomTypeName: string;
  floor: string | null;
  view: string | null;
  bedType: string | null;
  statusLabel: string;
  statusTone: "ready" | "warn" | "blocked";
  features: string[];
  eligible: boolean;
  blockerCode: string | null;
  occupiedUntil: string | null;
};

export function assignmentLabel(reservation: ReservationDetail): "Assigned" | "Not Assigned" {
  return reservation.roomId && reservation.roomNumber ? "Assigned" : "Not Assigned";
}

export function emptyRoomFilters(): RoomAssignmentFilters {
  return { floor: "", view: "", status: "", feature: "", search: "" };
}

export function roomStatusLabel(
  room: Pick<HotelRoom, "status" | "housekeepingStatus" | "maintenanceStatus">,
): {
  label: string;
  tone: RoomAssignmentRow["statusTone"];
} {
  if (room.status === "out_of_order" || room.maintenanceStatus === "out_of_order") {
    return { label: "Out of Order", tone: "blocked" };
  }
  if (room.status === "out_of_service" || room.maintenanceStatus === "out_of_service") {
    return { label: "Out of Service", tone: "blocked" };
  }
  const hk = room.housekeepingStatus;
  if (hk === "dirty") return { label: "Dirty", tone: "warn" };
  if (hk === "pickup") return { label: "Pickup", tone: "warn" };
  if (hk === "inspected" || hk === "clean") return { label: "Ready", tone: "ready" };
  if (room.status === "available") return { label: "Ready", tone: "ready" };
  return { label: room.status.replaceAll("_", " ") || DETAIL_DASH, tone: "warn" };
}

export function buildRoomAssignmentRows(input: {
  rooms: HotelRoom[];
  assignable: AssignableRoom[];
  roomType: RoomType | null | undefined;
  display?: ReservationRoomDisplay[];
}): RoomAssignmentRow[] {
  const eligibleIds = new Set(input.assignable.map((row) => row.id));
  const displayById = new Map((input.display ?? []).map((row) => [row.id, row]));
  const view = input.roomType?.roomView?.trim() || null;
  const bedType =
    input.roomType?.beds?.[0]?.bedType?.trim() || input.roomType?.bedType?.trim() || null;
  const byId = new Map(input.rooms.map((row) => [row.id, row]));
  for (const assignable of input.assignable) {
    if (byId.has(assignable.id)) continue;
    byId.set(assignable.id, {
      id: assignable.id,
      roomNumber: assignable.roomNumber,
      roomCode: null,
      roomTypeId: input.roomType?.id ?? "",
      roomTypeName: input.roomType?.name ?? "",
      roomTypeCode: input.roomType?.code ?? "",
      floor: assignable.floor,
      building: assignable.building,
      wing: null,
      buildingId: null,
      floorId: null,
      wingId: null,
      smoking: false,
      accessible: false,
      status: "available",
      housekeepingStatus:
        (assignable.housekeepingStatus as HotelRoom["housekeepingStatus"]) ?? null,
      maintenanceStatus: "normal",
      restrictionReason: null,
      restrictionExpectedReturn: null,
      sellable: true,
      roomFeatures: [],
      active: true,
      notes: null,
      links: [],
    });
  }
  return [...byId.values()]
    .map((room) => {
      const status = roomStatusLabel(room);
      const display = displayById.get(room.id);
      return {
        id: room.id,
        roomNumber: room.roomNumber,
        roomTypeName: room.roomTypeName || input.roomType?.name || DETAIL_DASH,
        floor: room.floor,
        view,
        bedType,
        statusLabel: status.label,
        statusTone: status.tone,
        features: room.roomFeatures,
        eligible: display ? display.eligible : eligibleIds.has(room.id),
        blockerCode: display?.blockerCode ?? null,
        occupiedUntil: display?.occupiedUntil ?? null,
      };
    })
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
}

export function filterRoomAssignmentRows(
  rows: RoomAssignmentRow[],
  filters: RoomAssignmentFilters,
): RoomAssignmentRow[] {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.floor && row.floor !== filters.floor) return false;
    if (filters.view && (row.view ?? "") !== filters.view) return false;
    if (filters.status && row.statusLabel !== filters.status) return false;
    if (filters.feature && !row.features.includes(filters.feature)) return false;
    if (search && !row.roomNumber.toLowerCase().includes(search)) return false;
    return true;
  });
}

export function uniqueFilterOptions(rows: RoomAssignmentRow[]): {
  floors: string[];
  views: string[];
  statuses: string[];
  features: string[];
} {
  const floors = new Set<string>();
  const views = new Set<string>();
  const statuses = new Set<string>();
  const features = new Set<string>();
  for (const row of rows) {
    if (row.floor) floors.add(row.floor);
    if (row.view) views.add(row.view);
    statuses.add(row.statusLabel);
    for (const feature of row.features) if (feature) features.add(feature);
  }
  const collator = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return {
    floors: [...floors].sort(collator),
    views: [...views].sort(collator),
    statuses: [...statuses].sort(collator),
    features: [...features].sort(collator),
  };
}

export type RoomAssignmentIntent = "assign" | "change_room";

/** Draft selection for one room unit. It is not part of the page save draft. */
export type RoomAssignmentSelection = {
  intent: RoomAssignmentIntent;
  reservationRoomId: string;
  unitSequence: number;
  currentRoomId: string | null;
};

export const ROOM_NO_LONGER_AVAILABLE =
  "This room is no longer available. Select another eligible room.";

export function roomSelectionNotice(selection: RoomAssignmentSelection): string {
  return `Select an eligible room to assign to Room ${selection.unitSequence}.`;
}

/**
 * Radios become assignment controls only in selection mode.
 * Eligibility is the server Room & Inventory result. Dirty housekeeping does not block selection.
 */
/** Why a room cannot be chosen. The current room keeps its Assigned badge instead. */
export function roomHoldReason(input: {
  eligible: boolean;
  current: boolean;
  occupiedUntil: string | null;
  statusLabel: string;
  blockerCode: string | null;
}): string | null {
  if (input.current || input.eligible) return null;
  if (input.occupiedUntil) return `Occupied until ${formatStayDate(input.occupiedUntil)}`;
  if (input.blockerCode === "ROOM_ALREADY_BOOKED") return "Occupied";
  if (input.blockerCode === "ROOM_BLOCKED") return "Blocked";
  if (input.statusLabel === "Out of Order" || input.statusLabel === "Out of Service") {
    return input.statusLabel;
  }
  return null;
}

export function roomCanBeSelected(input: {
  selecting: boolean;
  eligible: boolean;
  current: boolean;
}): boolean {
  return input.selecting && input.eligible && !input.current;
}

export function assignmentAvailabilityMessage(serverMessage: string): string | null {
  if (
    /closed and cannot be changed|no-show|Front Office room move|permission|not found/i.test(
      serverMessage,
    )
  ) {
    return null;
  }
  if (
    /eligible|available|assignable|overlap|occupied|out of order|out of service|blocked/i.test(
      serverMessage,
    )
  ) {
    return ROOM_NO_LONGER_AVAILABLE;
  }
  return null;
}

export function roomsDraftDirty(input: {
  prefs: Record<RoomAssignmentPrefId, boolean>;
  savedPrefs: Record<RoomAssignmentPrefId, boolean>;
  notes: string;
  savedNotes: string;
}): boolean {
  const prefsChanged = ROOM_ASSIGNMENT_PREFS.some(
    (pref) => input.prefs[pref.id] !== input.savedPrefs[pref.id],
  );
  return prefsChanged || input.notes.trim() !== input.savedNotes.trim();
}

export function preferenceChecked(
  specialRequests: string | null | undefined,
  pref: { label: string; aliases: readonly string[] },
): boolean {
  const hay = String(specialRequests ?? "").toLowerCase();
  if (!hay.trim()) return false;
  return pref.aliases.some((alias) => hay.includes(alias.toLowerCase()));
}

export function buildRoomPrefDraft(
  specialRequests: string | null | undefined,
): Record<RoomAssignmentPrefId, boolean> {
  const draft = {} as Record<RoomAssignmentPrefId, boolean>;
  for (const pref of ROOM_ASSIGNMENT_PREFS) {
    draft[pref.id] = preferenceChecked(specialRequests, pref);
  }
  for (const flag of REVIEW_ROOM_PREFERENCE_FLAGS) {
    const match = ROOM_ASSIGNMENT_PREFS.find((pref) =>
      pref.aliases.includes(flag.label.toLowerCase()),
    );
    if (match && !draft[match.id]) {
      draft[match.id] = preferenceChecked(specialRequests, match);
    }
  }
  return draft;
}

export function specialRequestsFromPrefs(
  current: string | null | undefined,
  draft: Record<RoomAssignmentPrefId, boolean>,
): string {
  const other = String(current ?? "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => {
      const lower = line.toLowerCase();
      return !ROOM_ASSIGNMENT_PREFS.some((pref) =>
        pref.aliases.some((alias) => lower === alias || lower === pref.label.toLowerCase()),
      );
    });
  const flags = ROOM_ASSIGNMENT_PREFS.filter((pref) => draft[pref.id]).map((pref) => pref.label);
  return [...flags, ...other].join("\n");
}
