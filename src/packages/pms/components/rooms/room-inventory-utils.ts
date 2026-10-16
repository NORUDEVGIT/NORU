const ELIGIBILITY_LABELS: Record<string, string> = {
  ROOM_OPERATIONALLY_UNAVAILABLE: "Room operationally unavailable",
  ROOM_TYPE_MISMATCH: "Room type mismatch",
  ROOM_NOT_SELLABLE: "Room not sellable",
  OCCUPANCY_EXCEEDED: "Occupancy exceeded",
  BED_TYPE_MISMATCH: "Bed type mismatch",
  ACCESSIBILITY_MISMATCH: "Accessibility mismatch",
  CONNECTING_ROOM_REQUIRED: "Connecting room required",
  ROOM_ALREADY_BOOKED: "Room already booked",
  ROOM_BLOCKED: "Room blocked",
  MAINTENANCE_NOT_CLEAR: "Maintenance not clear",
  HOUSEKEEPING_NOT_READY: "Housekeeping not ready",
  WARNING_BLOCK: "Operational warning",
  BUILDING_PREFERENCE_MISS: "Building preference missed",
  FLOOR_PREFERENCE_MISS: "Floor preference missed",
  GUEST_PREFERENCE_MISS: "Guest preference missed",
};

export function eligibilityCodeLabel(code: string): string {
  return (
    ELIGIBILITY_LABELS[code] ??
    code
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

const PREFERENCE_REASON_LABELS: Record<string, string> = {
  building_match: "Building preference matched",
  floor_match: "Floor preference matched",
  guest_preference_match: "Guest preference matched",
};

export function preferenceReasonLabel(reason: string): string {
  return PREFERENCE_REASON_LABELS[reason] ?? eligibilityCodeLabel(reason);
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nightlyDemand(night: {
  pinnedRoomClaims: number;
  unrepresentedReservationDemand: number;
}): number {
  return night.pinnedRoomClaims + night.unrepresentedReservationDemand;
}

export function nightlyBlocked(night: {
  typeHold: boolean;
  physicalCapacity: number;
  quantityHoldApplied: number;
}): number {
  return night.typeHold ? night.physicalCapacity : night.quantityHoldApplied;
}

export function stayDemand(row: {
  reserved: number | null;
  nightly: Array<{ pinnedRoomClaims: number; unrepresentedReservationDemand: number }>;
}): number | null {
  if (row.reserved != null) return row.reserved;
  if (row.nightly.length === 0) return null;
  return Math.max(0, ...row.nightly.map(nightlyDemand));
}

export function stayBlocked(row: {
  nightly: Array<{
    typeHold: boolean;
    physicalCapacity: number;
    quantityHoldApplied: number;
  }>;
}): number | null {
  if (row.nightly.length === 0) return null;
  return Math.max(0, ...row.nightly.map(nightlyBlocked));
}
