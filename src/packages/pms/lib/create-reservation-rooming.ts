import type { ReservationMode } from "@/packages/pms/lib/reservation-mode";
import { occupancySoftWarn } from "@/packages/pms/lib/create-reservation-phase1-section4";

/** Room 1 plus this many extra units. Matches the create payload cap of 20. */
export const MAX_EXTRA_ROOM_UNITS = 19;

export type RoomOccupantRef = {
  guestId: string;
  fullName: string;
};

export type GroupRoomDraft = {
  key: string;
  roomTypeId: string;
  adults: number;
  children: number;
  infants: number;
  ratePlanId: string | null;
  occupant: RoomOccupantRef | null;
  pmsGroupBlockId?: string | null;
};

export type Step1RoomStay = {
  roomTypeId: string;
  adults: number;
  children: number;
  infants: number;
  ratePlanId: string | null;
  pmsGroupBlockId?: string | null;
};

export type Step1RoomingState = {
  reservationMode: ReservationMode;
  activeRoomIndex: number;
  guestId: string | null;
  arrival: string;
  departure: string;
  room1: Step1RoomStay;
  extras: GroupRoomDraft[];
};

export type RoomGuestAssignmentPayload = {
  unitSequence: number;
  guestId: string;
  isPrimary: boolean;
};

const EMPTY_STAY: Step1RoomStay = {
  roomTypeId: "",
  adults: 1,
  children: 0,
  infants: 0,
  ratePlanId: null,
};

export function initialStep1RoomingState(): Step1RoomingState {
  return {
    reservationMode: "single",
    activeRoomIndex: 0,
    guestId: null,
    arrival: "",
    departure: "",
    room1: { ...EMPTY_STAY },
    extras: [],
  };
}

export function restoreStep1RoomingState(input: {
  reservationMode?: unknown;
  activeRoomIndex?: unknown;
  guestId?: string | null;
  arrival?: string;
  departure?: string;
  room1?: Partial<Step1RoomStay>;
  extras?: GroupRoomDraft[];
}): Step1RoomingState {
  const reservationMode = input.reservationMode === "group" ? "group" : "single";
  const extras = reservationMode === "group" ? [...(input.extras ?? [])] : [];
  const requested = typeof input.activeRoomIndex === "number" ? input.activeRoomIndex : 0;
  return {
    reservationMode,
    activeRoomIndex:
      reservationMode === "group" ? Math.min(Math.max(0, Math.floor(requested)), extras.length) : 0,
    guestId: input.guestId ?? null,
    arrival: input.arrival ?? "",
    departure: input.departure ?? "",
    room1: { ...EMPTY_STAY, ...input.room1 },
    extras,
  };
}

export function selectReservationMode(
  state: Step1RoomingState,
  next: ReservationMode,
): { status: "unchanged" | "applied" | "confirm"; state: Step1RoomingState } {
  if (next === state.reservationMode) return { status: "unchanged", state };
  if (next === "group") {
    return {
      status: "applied",
      state: { ...state, reservationMode: "group", activeRoomIndex: 0 },
    };
  }
  if (state.extras.length > 0) return { status: "confirm", state };
  return {
    status: "applied",
    state: { ...state, reservationMode: "single", activeRoomIndex: 0, extras: [] },
  };
}

export function confirmSingleDowngrade(state: Step1RoomingState): Step1RoomingState {
  return { ...state, reservationMode: "single", activeRoomIndex: 0, extras: [] };
}

export function addGroupRoom(state: Step1RoomingState, key: string): Step1RoomingState {
  if (state.reservationMode !== "group") return state;
  if (state.extras.length >= MAX_EXTRA_ROOM_UNITS) return state;
  return {
    ...state,
    extras: [
      ...state.extras,
      {
        key,
        roomTypeId: "",
        adults: 1,
        children: 0,
        infants: 0,
        ratePlanId: null,
        occupant: null,
        pmsGroupBlockId: null,
      },
    ],
    activeRoomIndex: state.extras.length + 1,
  };
}

export function removeGroupRoom(state: Step1RoomingState, key: string): Step1RoomingState {
  const index = state.extras.findIndex((unit) => unit.key === key);
  if (index < 0) return state;
  const extras = state.extras.filter((unit) => unit.key !== key);
  const removedRoomIndex = index + 1;
  let activeRoomIndex = state.activeRoomIndex;
  if (activeRoomIndex === removedRoomIndex) activeRoomIndex = Math.max(0, removedRoomIndex - 1);
  else if (activeRoomIndex > removedRoomIndex) activeRoomIndex -= 1;
  if (activeRoomIndex > extras.length) activeRoomIndex = extras.length;
  return { ...state, extras, activeRoomIndex };
}

export function activateRoom(state: Step1RoomingState, index: number): Step1RoomingState {
  const next = Math.min(Math.max(0, Math.floor(index)), state.extras.length);
  if (next === state.activeRoomIndex) return state;
  return { ...state, activeRoomIndex: next };
}

export function applyActiveRoomSelection(
  state: Step1RoomingState,
  selection: { roomTypeId: string; ratePlanId: string | null },
): Step1RoomingState {
  if (state.activeRoomIndex <= 0) {
    return { ...state, room1: { ...state.room1, ...selection } };
  }
  return {
    ...state,
    extras: state.extras.map((unit, index) =>
      index === state.activeRoomIndex - 1 ? { ...unit, ...selection } : unit,
    ),
  };
}

export function applyRoomOccupancy(
  state: Step1RoomingState,
  roomIndex: number,
  patch: { adults?: number; children?: number; infants?: number },
): Step1RoomingState {
  const nextIndex = Math.min(Math.max(0, roomIndex), state.extras.length);
  if (nextIndex === 0) {
    return { ...state, activeRoomIndex: 0, room1: { ...state.room1, ...patch } };
  }
  return {
    ...state,
    activeRoomIndex: nextIndex,
    extras: state.extras.map((unit, index) =>
      index === nextIndex - 1 ? { ...unit, ...patch } : unit,
    ),
  };
}

export function assignExtraOccupant(
  state: Step1RoomingState,
  key: string,
  occupant: RoomOccupantRef | null,
): Step1RoomingState {
  if (!state.extras.some((unit) => unit.key === key)) return state;
  return {
    ...state,
    extras: state.extras.map((unit) => (unit.key === key ? { ...unit, occupant } : unit)),
  };
}

export function activeRoomTarget(state: Step1RoomingState): {
  unitSequence: number;
  roomTypeId: string;
  adults: number;
  children: number;
  infants: number;
  ratePlanId: string | null;
} {
  const extra = state.activeRoomIndex > 0 ? state.extras[state.activeRoomIndex - 1] : null;
  const room = extra ?? state.room1;
  return {
    unitSequence: extra ? state.activeRoomIndex + 1 : 1,
    roomTypeId: room.roomTypeId,
    adults: room.adults,
    children: room.children,
    infants: room.infants,
    ratePlanId: room.ratePlanId,
  };
}

export function groupStayTotals(state: Step1RoomingState): {
  rooms: number;
  adults: number;
  children: number;
  infants: number;
} {
  return {
    rooms: 1 + state.extras.length,
    adults: state.room1.adults + state.extras.reduce((sum, unit) => sum + unit.adults, 0),
    children: state.room1.children + state.extras.reduce((sum, unit) => sum + unit.children, 0),
    infants: state.room1.infants + state.extras.reduce((sum, unit) => sum + unit.infants, 0),
  };
}

export function formatRoomOccupancy(adults: number, children: number, infants: number): string {
  const parts = [
    `${adults} ${adults === 1 ? "Adult" : "Adults"}`,
    `${children} ${children === 1 ? "Child" : "Children"}`,
  ];
  if (infants > 0) parts.push(`${infants} ${infants === 1 ? "Infant" : "Infants"}`);
  return parts.join(" · ");
}

/** Room 1 is the lead guest. Extra rooms contribute their own primary occupant. */
export function buildGroupRoomGuestAssignments(
  state: Step1RoomingState,
): RoomGuestAssignmentPayload[] {
  const assignments: RoomGuestAssignmentPayload[] = [];
  if (state.guestId) {
    assignments.push({ unitSequence: 1, guestId: state.guestId, isPrimary: true });
  }
  state.extras.forEach((unit, index) => {
    if (!unit.occupant?.guestId) return;
    assignments.push({
      unitSequence: index + 2,
      guestId: unit.occupant.guestId,
      isPrimary: true,
    });
  });
  return assignments;
}

export function step1CreateFields(state: Step1RoomingState): {
  reservationMode?: "group";
  roomGuestAssignments?: RoomGuestAssignmentPayload[];
} {
  if (state.reservationMode !== "group") return {};
  return {
    reservationMode: "group",
    roomGuestAssignments: buildGroupRoomGuestAssignments(state),
  };
}

export function groupStep1Issue(input: {
  hasGuest: boolean;
  datesValid: boolean;
  canCreateUnpriced: boolean;
  allowPhysicalShortage?: boolean;
  room1: Step1RoomStay & { maxOccupancy?: number; available?: number };
  extras: Array<
    Step1RoomStay & { occupantGuestId: string | null; maxOccupancy?: number; available?: number }
  >;
}): string | null {
  if (!input.hasGuest) return "Select a lead guest before continuing.";
  if (!input.datesValid) return "Choose arrival and departure dates before continuing.";
  const rooms = [
    { ...input.room1, occupantGuestId: input.hasGuest ? "lead" : null },
    ...input.extras,
  ];
  for (const [index, room] of rooms.entries()) {
    const label = `Room ${index + 1}`;
    if (room.adults < 1) return `${label} needs at least 1 adult.`;
    const occupancy = occupancySoftWarn(room.adults, room.children, room.maxOccupancy);
    if (occupancy) return `${label}: ${occupancy}`;
    if (!room.roomTypeId.trim()) return `Choose a room type for ${label}.`;
    if (room.available != null && room.available <= 0 && !input.allowPhysicalShortage) {
      return `${label} is not available for these dates.`;
    }
    if (!input.canCreateUnpriced && !room.ratePlanId) return `Choose a rate for ${label}.`;
    if (index > 0 && !room.occupantGuestId) return `Choose a primary occupant for ${label}.`;
  }
  return null;
}
