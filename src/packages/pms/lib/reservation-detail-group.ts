const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GROUP_COPY_UNAVAILABLE =
  "Copy Reservation is not available for multi-room reservations yet.";

export const GROUP_AMEND_UNAVAILABLE =
  "Multi-room date amendments are not supported from this workspace yet.";

export const GROUP_RATE_CHANGE_PER_ROOM =
  "Rate plan changes apply to the selected room. The booking total rolls up from the room units.";

export const GROUP_OCCUPANCY_NOTE = "Room occupancy is managed per room under Rooms.";

export const GROUP_PROFILE_PREFERENCE_NOTE =
  "These are saved guest-profile preferences, not booked room configuration.";

export const GROUP_PACKAGE_NOTE =
  "Choose a room to manage its packages. Stay packages are labeled separately and apply to the whole reservation.";

export type GroupOccupantSlice = {
  guestId: string;
  name: string;
  isPrimary: boolean;
};

export type GroupRoomSlice = {
  id: string;
  unitSequence: number;
  roomId?: string | null;
  roomNumber?: string | null;
  roomTypeName?: string | null;
  ratePlanId?: string | null;
  ratePlanName?: string | null;
  adults: number;
  children: number;
  infants: number;
  status?: string | null;
  roomSubtotal?: number | null;
  nightlyRates?: Array<{ date: string; rate: number }>;
  occupants?: GroupOccupantSlice[];
};

export type GroupReservationSlice = {
  reservationMode?: string | null;
  rooms?: readonly GroupRoomSlice[] | null;
  guestId?: string | null;
  guestName?: string | null;
  roomId?: string | null;
  roomNumber?: string | null;
  roomTypeName?: string | null;
  roomSubtotal?: number | null;
};

export function isGroupReservation(reservation: GroupReservationSlice): boolean {
  return reservation.reservationMode === "group" || (reservation.rooms?.length ?? 0) > 1;
}

export function groupRoomUnits(reservation: GroupReservationSlice): GroupRoomSlice[] {
  return [...(reservation.rooms ?? [])];
}

function activeUnits(reservation: GroupReservationSlice): GroupRoomSlice[] {
  return groupRoomUnits(reservation).filter(
    (unit) => unit.status !== "cancelled" && unit.status !== "no_show",
  );
}

export function groupOccupancyTotals(reservation: GroupReservationSlice): {
  rooms: number;
  adults: number;
  children: number;
  infants: number;
} {
  const units = activeUnits(reservation);
  return {
    rooms: groupRoomUnits(reservation).length,
    adults: units.reduce((sum, unit) => sum + unit.adults, 0),
    children: units.reduce((sum, unit) => sum + unit.children, 0),
    infants: units.reduce((sum, unit) => sum + unit.infants, 0),
  };
}

export function groupAssignmentSummary(reservation: GroupReservationSlice): {
  assigned: number;
  total: number;
  label: string;
  headerValue: string;
  headerHint: string;
} {
  const units = groupRoomUnits(reservation);
  const assigned = units.filter((unit) => Boolean(unit.roomId)).length;
  const total = units.length;
  return {
    assigned,
    total,
    label: `${assigned} of ${total} rooms assigned`,
    headerValue: `${total} room${total === 1 ? "" : "s"}`,
    headerHint: assigned === total && total > 0 ? "All assigned" : `${assigned} assigned`,
  };
}

export function groupCombinedSubtotal(reservation: GroupReservationSlice): number | null {
  const amounts = groupRoomUnits(reservation).map((unit) => unit.roomSubtotal);
  if (amounts.length > 0 && amounts.every((amount) => amount != null && Number.isFinite(amount))) {
    return Math.round(amounts.reduce((sum, amount) => sum + (amount ?? 0), 0) * 100) / 100;
  }
  return reservation.roomSubtotal ?? null;
}

export function primaryOccupantName(unit: GroupRoomSlice): string {
  return unit.occupants?.find((occupant) => occupant.isPrimary)?.name ?? "No primary occupant";
}

export function additionalOccupants(unit: GroupRoomSlice): GroupOccupantSlice[] {
  return (unit.occupants ?? []).filter((occupant) => !occupant.isPrimary);
}

export function groupRoomSummaryLines(reservation: GroupReservationSlice): string[] {
  return groupRoomUnits(reservation).map(
    (unit) =>
      `Room ${unit.unitSequence} · ${primaryOccupantName(unit)} · ${unit.roomTypeName ?? "Room type"}`,
  );
}

export function uniformNightlyRate(unit: GroupRoomSlice): number | null {
  const rates = (unit.nightlyRates ?? [])
    .map((row) => row.rate)
    .filter((rate) => Number.isFinite(rate));
  if (rates.length === 0) return null;
  const first = rates[0];
  return rates.every((rate) => rate === first) ? first : null;
}

export type GroupRoomRateSection = {
  sequence: number;
  occupant: string;
  roomTypeName: string;
  ratePlanName: string;
  nights: Array<{ date: string; rate: number }>;
  uniformRate: number | null;
  subtotal: number | null;
};

export function groupRoomRateSections(reservation: GroupReservationSlice): GroupRoomRateSection[] {
  return groupRoomUnits(reservation).map((unit) => ({
    sequence: unit.unitSequence,
    occupant: primaryOccupantName(unit),
    roomTypeName: unit.roomTypeName ?? "Room type",
    ratePlanName: unit.ratePlanName ?? "No rate plan",
    nights: (unit.nightlyRates ?? []).filter((row) => row.date && Number.isFinite(row.rate)),
    uniformRate: uniformNightlyRate(unit),
    subtotal: unit.roomSubtotal ?? null,
  }));
}

export function groupPoliciesNote(reservation: GroupReservationSlice): string {
  const units = groupRoomUnits(reservation);
  const plans = new Set(units.map((unit) => unit.ratePlanId ?? ""));
  return plans.size <= 1 ? `Applies to all ${units.length} rooms` : "Policies vary by room";
}

export function reservationHeaderGuestLabel(reservation: GroupReservationSlice): string | null {
  return isGroupReservation(reservation) ? "Primary Guest / Booker" : null;
}

export function reservationHeaderRoomKpi(reservation: GroupReservationSlice): {
  label: string;
  value: string;
  hint: string | null;
} {
  if (isGroupReservation(reservation)) {
    const summary = groupAssignmentSummary(reservation);
    return { label: "Rooms", value: summary.headerValue, hint: summary.headerHint };
  }
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  return {
    label: "Room",
    value: assigned ? `Room ${reservation.roomNumber}` : "Not Assigned",
    hint: assigned ? (reservation.roomTypeName ?? null) : "Not Assigned",
  };
}

export function groupActionGate(action: "copy" | "amend" | "rate", group: boolean): string | null {
  if (!group) return null;
  if (action === "copy") return GROUP_COPY_UNAVAILABLE;
  if (action === "amend") return GROUP_AMEND_UNAVAILABLE;
  return null;
}

export function historyGuestName(guestId: string, reservation: GroupReservationSlice): string {
  if (reservation.guestId && guestId === reservation.guestId && reservation.guestName) {
    return reservation.guestName;
  }
  for (const unit of groupRoomUnits(reservation)) {
    const occupant = unit.occupants?.find((row) => row.guestId === guestId);
    if (occupant?.name) return occupant.name;
  }
  return "Guest";
}

export function historyRoomLabel(roomUnitId: string, reservation: GroupReservationSlice): string {
  const unit = groupRoomUnits(reservation).find((row) => row.id === roomUnitId);
  if (!unit) return "Room";
  return unit.roomNumber
    ? `Room ${unit.unitSequence} · ${unit.roomNumber}`
    : `Room ${unit.unitSequence}`;
}

function historyPhysicalRoomLabel(roomId: string, reservation: GroupReservationSlice): string {
  const unit = groupRoomUnits(reservation).find((row) => row.roomId === roomId);
  if (!unit) return "Room";
  return unit.roomNumber
    ? `Room ${unit.unitSequence} · ${unit.roomNumber}`
    : `Room ${unit.unitSequence}`;
}

export function resolveHistoryField(
  key: string,
  value: unknown,
  reservation: GroupReservationSlice,
): string | null {
  if (value == null || value === "") return null;
  if (key === "unit_sequence" && (typeof value === "number" || typeof value === "string")) {
    return `Room ${value}`;
  }
  if (key === "reservation_room_id" && typeof value === "string") {
    return historyRoomLabel(value, reservation);
  }
  if (key === "room_id" && typeof value === "string") {
    return historyPhysicalRoomLabel(value, reservation);
  }
  if (key === "guest_id" && typeof value === "string") {
    return historyGuestName(value, reservation);
  }
  if (typeof value === "string" && UUID_RE.test(value) && /room|guest/i.test(key)) {
    return /guest/i.test(key) ? "Guest" : "Room";
  }
  return null;
}

export function historyContextLine(
  previousValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
  reservation: GroupReservationSlice,
): string | null {
  const next = newValues ?? {};
  const prev = previousValues ?? {};
  const roomUnitId = next.reservation_room_id ?? prev.reservation_room_id;
  const sequence = next.unit_sequence ?? prev.unit_sequence;
  const physicalId = next.room_id ?? prev.room_id;
  const guestId = next.guest_id ?? prev.guest_id;
  const room =
    typeof roomUnitId === "string"
      ? historyRoomLabel(roomUnitId, reservation)
      : sequence != null
        ? `Room ${sequence}`
        : typeof physicalId === "string"
          ? historyPhysicalRoomLabel(physicalId, reservation)
          : null;
  const guest = typeof guestId === "string" ? historyGuestName(guestId, reservation) : null;
  if (room && guest && guest !== "Guest") return `${room} · ${guest}`;
  if (room && room !== "Room") return room;
  if (guest && guest !== "Guest") return guest;
  return null;
}

export function traceRoomTargets(
  reservation: GroupReservationSlice,
): Array<{ roomId: string; label: string }> {
  if (!isGroupReservation(reservation)) {
    return reservation.roomId ? [{ roomId: reservation.roomId, label: "Room" }] : [];
  }
  return groupRoomUnits(reservation).flatMap((unit) =>
    unit.roomId
      ? [
          {
            roomId: unit.roomId,
            label: unit.roomNumber
              ? `Room ${unit.unitSequence} · ${unit.roomNumber}`
              : `Room ${unit.unitSequence}`,
          },
        ]
      : [],
  );
}
