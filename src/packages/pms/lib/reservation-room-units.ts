export const RESERVATION_ROOM_DRIFT_FIELDS = [
  "roomTypeId",
  "roomId",
  "arrivalDate",
  "departureDate",
  "adults",
  "children",
  "infants",
  "ratePlanId",
  "currency",
  "roomSubtotal",
  "nightlyRates",
  "pricedAt",
] as const;

export type ReservationRoomDriftField = (typeof RESERVATION_ROOM_DRIFT_FIELDS)[number];

export type ReservationRoomNightlyRate = {
  date: string;
  rate: number;
};

export type ReservationRoomUnitValues = {
  roomTypeId: string;
  roomId: string | null;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  infants: number;
  ratePlanId: string | null;
  currency: string | null;
  nightlyRates: ReservationRoomNightlyRate[];
  roomSubtotal: number | null;
  pricedAt: string | null;
};

/** Master room fields that remain the booking authority. Infants may be absent on older reads. */
export type ReservationRoomMasterSlice = Omit<ReservationRoomUnitValues, "infants"> & {
  infants: number | null;
};

export type ReservationRoomUnitRow = {
  id: string;
  unit_sequence: number;
  room_type_id: string;
  room_id: string | null;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  infants: number;
  rate_plan_id: string | null;
  currency: string | null;
  nightly_rate_snapshot: unknown;
  room_subtotal: number | string | null;
  priced_at: string | null;
  status?: string | null;
};

export type ReservationRoomUnit = ReservationRoomUnitValues & {
  id: string;
  unitSequence: number;
  /** Room units own the operational room. `master` remains only on older projections. */
  authority: "master" | "unit";
  matchesMaster: boolean;
  driftedFields: ReservationRoomDriftField[];
  stored: ReservationRoomUnitValues;
  /** Absent until the room-unit status column is applied. */
  status: string | null;
  occupants: ReservationRoomOccupant[];
  /** Names loaded with reservation detail. Older projections omit them. */
  roomTypeName?: string | null;
  roomNumber?: string | null;
  ratePlanName?: string | null;
  assignmentNotes?: string | null;
};

export type ReservationRoomOccupant = {
  guestId: string;
  name: string;
  isPrimary: boolean;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  idDocumentType?: string | null;
  idDocumentNumber?: string | null;
  notes?: string | null;
};

export type ReservationRoomOccupantSource = {
  reservationRoomId: string;
  guestId: string;
  name: string;
  isPrimary: boolean;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  idDocumentType?: string | null;
  idDocumentNumber?: string | null;
  notes?: string | null;
};

function moneyNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function sameMoney(left: number | null, right: number | null): boolean {
  if (left == null || right == null) return left == null && right == null;
  return Math.round(left * 100) === Math.round(right * 100);
}

function sameInstant(left: string | null, right: string | null): boolean {
  if (left == null || right == null) return left == null && right == null;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) return leftMs === rightMs;
  return left === right;
}

export function reservationRoomNightlyRates(raw: unknown): ReservationRoomNightlyRate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is { date: unknown; rate: unknown } => !!row && typeof row === "object")
    .map((row) => ({ date: String(row.date), rate: Number(row.rate) }))
    .filter((row) => row.date.length > 0 && Number.isFinite(row.rate));
}

function sameNightly(
  left: ReservationRoomNightlyRate[],
  right: ReservationRoomNightlyRate[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (row, index) =>
      row.date === right[index]?.date && sameMoney(row.rate, right[index]?.rate ?? null),
  );
}

export function reservationRoomDriftFields(
  master: ReservationRoomMasterSlice,
  stored: ReservationRoomUnitValues,
): ReservationRoomDriftField[] {
  const masterInfants = master.infants ?? 0;
  const drifted: ReservationRoomDriftField[] = [];
  if (master.roomTypeId !== stored.roomTypeId) drifted.push("roomTypeId");
  if ((master.roomId ?? null) !== (stored.roomId ?? null)) drifted.push("roomId");
  if (master.arrivalDate !== stored.arrivalDate) drifted.push("arrivalDate");
  if (master.departureDate !== stored.departureDate) drifted.push("departureDate");
  if (master.adults !== stored.adults) drifted.push("adults");
  if (master.children !== stored.children) drifted.push("children");
  if (masterInfants !== stored.infants) drifted.push("infants");
  if ((master.ratePlanId ?? null) !== (stored.ratePlanId ?? null)) drifted.push("ratePlanId");
  if ((master.currency ?? null) !== (stored.currency ?? null)) drifted.push("currency");
  if (!sameMoney(master.roomSubtotal, stored.roomSubtotal)) drifted.push("roomSubtotal");
  if (!sameNightly(master.nightlyRates, stored.nightlyRates)) drifted.push("nightlyRates");
  if (!sameInstant(master.pricedAt, stored.pricedAt)) drifted.push("pricedAt");
  return drifted;
}

export function storedReservationRoomUnit(row: ReservationRoomUnitRow): ReservationRoomUnitValues {
  return {
    roomTypeId: row.room_type_id,
    roomId: row.room_id,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    ratePlanId: row.rate_plan_id,
    currency: row.currency,
    nightlyRates: reservationRoomNightlyRates(row.nightly_rate_snapshot),
    roomSubtotal: moneyNumber(row.room_subtotal),
    pricedAt: row.priced_at,
  };
}

/**
 * Every unit publishes its own stored room. Drift against the master is still
 * reported. The master copy is an aggregate, not the operational room.
 */
export type CreateRoomUnitInput = {
  roomTypeId: string;
  adults: number;
  children: number;
  infants: number;
  ratePlanId: string | null;
  pmsGroupBlockId?: string | null;
};

/** One room keeps the existing rooms multiplier. Extra rooms price the master as one room. */
export function createReservationRoomUnitPayload(input: {
  roomTypeId: string;
  adults: number;
  children: number;
  infants: number;
  ratePlanId: string | null;
  roomsRequested: number;
  extraUnits: CreateRoomUnitInput[];
  pmsGroupBlockId?: string | null;
}): { rooms: number; roomUnits: CreateRoomUnitInput[] | null } {
  if (input.extraUnits.length === 0) {
    return { rooms: input.roomsRequested, roomUnits: null };
  }
  const includeBlock =
    input.pmsGroupBlockId !== undefined ||
    input.extraUnits.some((unit) => "pmsGroupBlockId" in unit);
  const first: CreateRoomUnitInput = {
    roomTypeId: input.roomTypeId,
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    ratePlanId: input.ratePlanId,
    ...(includeBlock ? { pmsGroupBlockId: input.pmsGroupBlockId ?? null } : {}),
  };
  return {
    rooms: 1,
    roomUnits: [first, ...input.extraUnits],
  };
}

export type InventoryDemandReservation = {
  id: string;
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  ratePlanId?: string | null;
  nightly?: unknown;
  createdAt?: string | null;
  /** Ignored. Inventory counts room units, never this multiplier. */
  roomsRequested?: number | null;
};

export type InventoryDemandUnit = {
  reservationId: string;
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  ratePlanId?: string | null;
  nightly?: unknown;
  roomId?: string | null;
};

export type InventoryDemandStay = {
  reservationId: string;
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  ratePlanId: string | null;
  nightly: unknown;
  createdAt: string | null;
};

/**
 * One stay row per room unit. A booking with no units still counts as one room.
 * `roomsRequested` is not read.
 */
export function projectInventoryDemand(
  reservations: InventoryDemandReservation[],
  units: InventoryDemandUnit[],
): InventoryDemandStay[] {
  const unitsByReservation = new Map<string, InventoryDemandUnit[]>();
  for (const unit of units) {
    const owned = unitsByReservation.get(unit.reservationId) ?? [];
    owned.push(unit);
    unitsByReservation.set(unit.reservationId, owned);
  }
  const stays: InventoryDemandStay[] = [];
  for (const reservation of reservations) {
    const owned = unitsByReservation.get(reservation.id) ?? [];
    if (owned.length === 0) {
      stays.push({
        reservationId: reservation.id,
        roomTypeId: reservation.roomTypeId,
        arrivalDate: reservation.arrivalDate,
        departureDate: reservation.departureDate,
        ratePlanId: reservation.ratePlanId ?? null,
        nightly: reservation.nightly ?? null,
        createdAt: reservation.createdAt ?? null,
      });
      continue;
    }
    for (const unit of owned) {
      stays.push({
        reservationId: reservation.id,
        roomTypeId: unit.roomTypeId,
        arrivalDate: unit.arrivalDate,
        departureDate: unit.departureDate,
        ratePlanId: unit.ratePlanId ?? null,
        nightly: unit.nightly ?? null,
        createdAt: reservation.createdAt ?? null,
      });
    }
  }
  return stays;
}

/** Sum of unit room subtotals. An empty priced set stays null. */
export function aggregateRoomSubtotals(amounts: Array<number | null>): number | null {
  const priced = amounts.filter(
    (amount): amount is number => amount != null && Number.isFinite(amount),
  );
  if (priced.length === 0) return null;
  return Math.round(priced.reduce((sum, amount) => sum + amount, 0) * 100) / 100;
}

export function projectReservationRoomUnits(
  master: ReservationRoomMasterSlice,
  rows: ReservationRoomUnitRow[],
): ReservationRoomUnit[] {
  return rows.map((row) => {
    const stored = storedReservationRoomUnit(row);
    const driftedFields = reservationRoomDriftFields(master, stored);
    return {
      id: row.id,
      unitSequence: row.unit_sequence,
      authority: "unit" as const,
      matchesMaster: driftedFields.length === 0,
      driftedFields,
      ...stored,
      stored,
      status: row.status ?? null,
      occupants: [],
    };
  });
}

/** Attach guest-profile occupants to the room unit that owns them. */
export function attachRoomOccupants(
  units: ReservationRoomUnit[],
  occupants: ReservationRoomOccupantSource[],
): ReservationRoomUnit[] {
  return units.map((unit) => ({
    ...unit,
    occupants: occupants
      .filter((occupant) => occupant.reservationRoomId === unit.id)
      .map((occupant) => ({
        guestId: occupant.guestId,
        name: occupant.name,
        isPrimary: occupant.isPrimary,
        ...(occupant.phone !== undefined ? { phone: occupant.phone } : {}),
        ...(occupant.gender !== undefined ? { gender: occupant.gender } : {}),
        ...(occupant.idDocumentNumber !== undefined
          ? { idDocumentNumber: occupant.idDocumentNumber }
          : {}),
        ...(occupant.notes !== undefined ? { notes: occupant.notes } : {}),
      }))
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary)),
  }));
}

export const RESERVATION_UNIT_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
] as const;

export type ReservationUnitStatus = (typeof RESERVATION_UNIT_STATUSES)[number];

/**
 * Master status from unit states. First match:
 * all cancelled, remaining units no-show, any checked in, completed stay,
 * any confirmed, otherwise pending.
 */
export function rollupReservationStatus(
  statuses: readonly ReservationUnitStatus[],
): ReservationUnitStatus {
  if (statuses.length === 0) return "pending";
  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  const remaining = statuses.filter((status) => status !== "cancelled");
  if (remaining.length > 0 && remaining.every((status) => status === "no_show")) return "no_show";
  if (statuses.some((status) => status === "checked_in")) return "checked_in";
  if (
    statuses.some((status) => status === "checked_out") &&
    statuses.every(
      (status) => status === "checked_out" || status === "cancelled" || status === "no_show",
    )
  ) {
    return "checked_out";
  }
  if (statuses.some((status) => status === "confirmed")) return "confirmed";
  return "pending";
}

export type FrontOfficeRoomTarget = {
  id: string;
  unitSequence: number;
  roomTypeId: string;
  roomId: string | null;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  status: string | null;
  children?: number;
  infants?: number;
  roomTypeName?: string | null;
  roomNumber?: string | null;
  ratePlanName?: string | null;
  occupants?: ReservationRoomOccupant[];
};

/** Dialog targets. A single room stays on the master fields and does not need a picker. */
export function frontOfficeRoomTargets(
  rooms:
    | Array<{
        id: string;
        unitSequence: number;
        roomTypeId: string;
        roomId: string | null;
        arrivalDate: string;
        departureDate: string;
        adults: number;
        children?: number;
        infants?: number;
        status?: string | null;
        roomTypeName?: string | null;
        roomNumber?: string | null;
        ratePlanName?: string | null;
        occupants?: ReservationRoomOccupant[];
      }>
    | undefined,
): FrontOfficeRoomTarget[] {
  return (rooms ?? []).map((room) => ({
    id: room.id,
    unitSequence: room.unitSequence,
    roomTypeId: room.roomTypeId,
    roomId: room.roomId,
    arrivalDate: room.arrivalDate,
    departureDate: room.departureDate,
    adults: room.adults,
    children: room.children,
    infants: room.infants,
    status: room.status ?? null,
    roomTypeName: room.roomTypeName ?? null,
    roomNumber: room.roomNumber ?? null,
    ratePlanName: room.ratePlanName ?? null,
    occupants: room.occupants ?? [],
  }));
}

/** Label for a folio line or package row that names a room unit. Null stays unlabeled. */
export function roomUnitAttributionLabel(unitSequence: number | null | undefined): string | null {
  if (unitSequence == null || !Number.isInteger(unitSequence) || unitSequence < 1) return null;
  return `Room ${unitSequence}`;
}

export function isActiveRoomUnit(status: string | null | undefined): boolean {
  return status !== "cancelled" && status !== "no_show";
}

export type StayRoomSlice = {
  reservationId: string;
  roomId: string | null;
  status: string;
  arrivalDate: string;
  departureDate: string;
  unitSequence: number | null;
  reservationRoomId: string | null;
};

/**
 * One operational room per unit. A booking with no unit rows stays one master room.
 * `units === null` means the unit table could not be read.
 */
export function expandStayRooms(
  reservations: ReadonlyArray<{
    id: string;
    roomId: string | null;
    status: string;
    arrivalDate: string;
    departureDate: string;
  }>,
  units: ReadonlyArray<{
    id?: string;
    reservationId: string;
    roomId: string | null;
    status: string | null;
    arrivalDate: string;
    departureDate: string;
    unitSequence: number;
  }> | null,
): StayRoomSlice[] {
  if (units == null) {
    return reservations.map((row) => ({
      reservationId: row.id,
      roomId: row.roomId,
      status: row.status,
      arrivalDate: row.arrivalDate,
      departureDate: row.departureDate,
      unitSequence: null,
      reservationRoomId: null,
    }));
  }
  const byReservation = new Map<string, Array<(typeof units)[number]>>();
  for (const unit of units) {
    const owned = byReservation.get(unit.reservationId) ?? [];
    owned.push(unit);
    byReservation.set(unit.reservationId, owned);
  }
  const stays: StayRoomSlice[] = [];
  for (const reservation of reservations) {
    const owned = byReservation.get(reservation.id);
    if (!owned || owned.length === 0) {
      stays.push({
        reservationId: reservation.id,
        roomId: reservation.roomId,
        status: reservation.status,
        arrivalDate: reservation.arrivalDate,
        departureDate: reservation.departureDate,
        unitSequence: null,
        reservationRoomId: null,
      });
      continue;
    }
    for (const unit of owned) {
      const status = unit.status ?? reservation.status;
      if (!isActiveRoomUnit(status)) continue;
      stays.push({
        reservationId: reservation.id,
        roomId: unit.roomId,
        status,
        arrivalDate: unit.arrivalDate,
        departureDate: unit.departureDate,
        unitSequence: unit.unitSequence,
        reservationRoomId: unit.id ?? null,
      });
    }
  }
  return stays;
}

/** Distinct physical rooms occupied by checked-in units. */
export function checkedInRoomIds(stays: ReadonlyArray<StayRoomSlice>): string[] {
  return [
    ...new Set(
      stays
        .filter((stay) => stay.status === "checked_in" && stay.roomId)
        .map((stay) => stay.roomId as string),
    ),
  ];
}
