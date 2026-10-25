/**
 * Police / Guest Stay register. Internal stay list, not a government submission.
 *
 * One row is one named guest on one reservation room unit:
 * hotel_reservation_rooms → hotel_reservation_room_guests → guest_profiles.
 *
 * Unnamed booked adults and children are counted. They are never invented as rows.
 * Infants are not named slots. fo_stay_companions, guest_documents, and
 * group rooming-list text are not occupant sources.
 */
import { roomOccupantCapacity } from "./reservation-room-occupants.ts";
import {
  DEFAULT_REPORT_PAGE_SIZE,
  REPORT_PAGE_SIZES,
  type ReportPageSize,
} from "./reports-shell.ts";

export const POLICE_STAY_PRESENCE = ["IN_HOUSE", "HISTORICAL"] as const;
export type PoliceStayPresence = (typeof POLICE_STAY_PRESENCE)[number];

/** Assembled rows kept in memory for one property-date read. Above this, the read fails closed. */
export const POLICE_STAY_REPORT_SAFETY_LIMIT = 5000;

/** Distinct from a database failure so the screen does not treat a capped read as an empty register. */
export const POLICE_STAY_TOO_LARGE_MESSAGE =
  "This report is too large to print at once. Narrow the filters and try again.";

export const POLICE_STAY_IN_HOUSE_STATUSES = ["checked_in"] as const;
export const POLICE_STAY_HISTORICAL_STATUSES = ["checked_in", "checked_out"] as const;

export type PoliceStayReportFilters = {
  stayDate: string;
  name?: string | undefined;
  nationality?: string | undefined;
  presence?: PoliceStayPresence | undefined;
  room?: string | undefined;
  page?: number | undefined;
  pageSize?: ReportPageSize | undefined;
  export?: boolean | undefined;
};

export type PoliceStayOccupantSource = {
  guestProfileId: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  idDocumentType: string | null;
  idDocumentNumber: string | null;
};

export type PoliceStayUnitSource = {
  restaurantId: string;
  reservationRoomId: string;
  reservationId: string;
  arrivalDate: string;
  departureDate: string;
  status: string;
  adults: number;
  children: number;
  infants: number;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
  building: string | null;
  floor: string | null;
  confirmationNumber: string | null;
  reservationMode: string | null;
  reservationSource: string | null;
  occupants: readonly PoliceStayOccupantSource[];
};

export type PoliceStayReportRow = {
  guestProfileId: string;
  reservationId: string;
  reservationRoomId: string;
  guestName: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  phone: string | null;
  nationality: string | null;
  email: string | null;
  checkInDate: string;
  checkOutDate: string;
  idDocumentType: string | null;
  idDocumentNumber: string | null;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
  building: string | null;
  floor: string | null;
  confirmationNumber: string | null;
  reservationMode: string | null;
  reservationSource: string | null;
  roomStatus: string;
};

export type PoliceStayRoomGap = {
  reservationRoomId: string;
  reservationId: string;
  roomNumber: string | null;
  namedOccupants: number;
  expectedNamedOccupants: number;
  unnamedOccupants: number;
};

export type PoliceStayReportResult = {
  rows: PoliceStayReportRow[];
  page: number;
  pageSize: number;
  total: number;
  summary: {
    namedGuestCount: number;
    unnamedOccupantCount: number;
    rooms: PoliceStayRoomGap[];
  };
  context: {
    stayDate: string;
    businessDate: string;
    timezone: string;
    presence: PoliceStayPresence;
  };
};

export class PoliceStayReportError extends Error {
  readonly code = "LOAD_FAILED" as const;

  constructor(message = "The police stay report could not be loaded.") {
    super(message);
    this.name = "PoliceStayReportError";
  }
}

export function policeStayStatuses(presence: PoliceStayPresence): readonly string[] {
  return presence === "HISTORICAL"
    ? POLICE_STAY_HISTORICAL_STATUSES
    : POLICE_STAY_IN_HOUSE_STATUSES;
}

/** Property-local calendar overlap. Checkout morning is outside the stay date. */
export function policeStayOverlaps(
  arrivalDate: string,
  departureDate: string,
  stayDate: string,
): boolean {
  return arrivalDate <= stayDate && departureDate > stayDate;
}

export function policeGuestName(parts: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

export function assemblePoliceStayReport(input: {
  restaurantId: string;
  stayDate: string;
  businessDate: string;
  timezone: string;
  units: readonly PoliceStayUnitSource[];
  filters?: PoliceStayReportFilters;
}): PoliceStayReportResult {
  const presence = input.filters?.presence ?? "IN_HOUSE";
  const statuses = new Set(policeStayStatuses(presence));
  const nameNeedle = (input.filters?.name ?? "").trim().toLowerCase();
  const nationalityNeedle = (input.filters?.nationality ?? "").trim().toLowerCase();
  const roomNeedle = (input.filters?.room ?? "").trim().toLowerCase();
  const exportAll = input.filters?.export === true;

  const inScope = input.units.filter(
    (unit) =>
      unit.restaurantId === input.restaurantId &&
      statuses.has(unit.status) &&
      policeStayOverlaps(unit.arrivalDate, unit.departureDate, input.stayDate) &&
      roomMatches(unit, roomNeedle),
  );

  const gaps = inScope.map((unit) => roomGap(unit)).filter((gap) => gap.unnamedOccupants > 0);

  const rows = inScope
    .flatMap((unit) =>
      unit.occupants
        .filter((occupant) => occupant.guestProfileId.trim().length > 0)
        .filter((occupant) => nameMatches(occupant, nameNeedle))
        .filter((occupant) => nationalityMatches(occupant, nationalityNeedle))
        .map((occupant) => toRow(unit, occupant)),
    )
    .sort(comparePoliceStayRows);

  if (
    rows.length > POLICE_STAY_REPORT_SAFETY_LIMIT ||
    inScope.length > POLICE_STAY_REPORT_SAFETY_LIMIT
  ) {
    throw new PoliceStayReportError(POLICE_STAY_TOO_LARGE_MESSAGE);
  }

  const pageSize = normalizePageSize(input.filters?.pageSize);
  const page = normalizePage(input.filters?.page);
  const pageRows = exportAll ? rows : rows.slice((page - 1) * pageSize, page * pageSize);

  return {
    rows: pageRows,
    page: exportAll ? 1 : page,
    pageSize: exportAll ? rows.length : pageSize,
    total: rows.length,
    summary: {
      namedGuestCount: rows.length,
      unnamedOccupantCount: gaps.reduce((sum, gap) => sum + gap.unnamedOccupants, 0),
      rooms: gaps,
    },
    context: {
      stayDate: input.stayDate,
      businessDate: input.businessDate,
      timezone: input.timezone,
      presence,
    },
  };
}

function roomGap(unit: PoliceStayUnitSource): PoliceStayRoomGap {
  const expectedNamedOccupants = roomOccupantCapacity(unit.adults, unit.children);
  const namedOccupants = unit.occupants.filter(
    (occupant) => occupant.guestProfileId.trim().length > 0,
  ).length;
  return {
    reservationRoomId: unit.reservationRoomId,
    reservationId: unit.reservationId,
    roomNumber: unit.roomNumber,
    namedOccupants,
    expectedNamedOccupants,
    unnamedOccupants: Math.max(0, expectedNamedOccupants - namedOccupants),
  };
}

function toRow(
  unit: PoliceStayUnitSource,
  occupant: PoliceStayOccupantSource,
): PoliceStayReportRow {
  return {
    guestProfileId: occupant.guestProfileId,
    reservationId: unit.reservationId,
    reservationRoomId: unit.reservationRoomId,
    guestName: policeGuestName(occupant),
    firstName: blank(occupant.firstName),
    middleName: blank(occupant.middleName),
    lastName: blank(occupant.lastName),
    phone: blank(occupant.phone),
    nationality: blank(occupant.nationality),
    email: blank(occupant.email),
    checkInDate: unit.arrivalDate,
    checkOutDate: unit.departureDate,
    idDocumentType: blank(occupant.idDocumentType),
    idDocumentNumber: blank(occupant.idDocumentNumber),
    roomId: unit.roomId,
    roomNumber: blank(unit.roomNumber),
    roomTypeId: unit.roomTypeId,
    roomTypeName: blank(unit.roomTypeName),
    building: blank(unit.building),
    floor: blank(unit.floor),
    confirmationNumber: blank(unit.confirmationNumber),
    reservationMode: blank(unit.reservationMode),
    reservationSource: blank(unit.reservationSource),
    roomStatus: unit.status,
  };
}

function nameMatches(occupant: PoliceStayOccupantSource, needle: string): boolean {
  if (!needle) return true;
  const combined = policeGuestName(occupant).toLowerCase();
  const parts = [occupant.firstName, occupant.middleName, occupant.lastName, combined];
  return parts.some((part) => (part ?? "").toLowerCase().includes(needle));
}

function nationalityMatches(occupant: PoliceStayOccupantSource, needle: string): boolean {
  if (!needle) return true;
  return (occupant.nationality ?? "").trim().toLowerCase() === needle;
}

function roomMatches(unit: PoliceStayUnitSource, needle: string): boolean {
  if (!needle) return true;
  if ((unit.roomId ?? "").toLowerCase() === needle) return true;
  return (unit.roomNumber ?? "").trim().toLowerCase() === needle;
}

function comparePoliceStayRows(left: PoliceStayReportRow, right: PoliceStayReportRow): number {
  const room = roomSortKey(left.roomNumber).localeCompare(
    roomSortKey(right.roomNumber),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
  if (room !== 0) return room;
  const name = left.guestName.localeCompare(right.guestName, undefined, { sensitivity: "base" });
  if (name !== 0) return name;
  const guest = left.guestProfileId.localeCompare(right.guestProfileId);
  if (guest !== 0) return guest;
  return left.reservationRoomId.localeCompare(right.reservationRoomId);
}

function roomSortKey(roomNumber: string | null): string {
  const trimmed = (roomNumber ?? "").trim();
  return trimmed.length > 0 ? trimmed : "\uffff";
}

function blank(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePage(page: number | undefined): number {
  if (!page || !Number.isInteger(page) || page < 1) return 1;
  return page;
}

function normalizePageSize(pageSize: number | undefined): ReportPageSize {
  if (pageSize && (REPORT_PAGE_SIZES as readonly number[]).includes(pageSize)) {
    return pageSize as ReportPageSize;
  }
  return DEFAULT_REPORT_PAGE_SIZE;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_CHUNK = 100;

type DbError = { message?: string } | null;
type DbResult<T> = { data: T[] | null; error: DbError };
type SingleResult<T> = { data: T | null; error: DbError };

export type PoliceStayQuery = {
  eq: (column: string, value: string) => PoliceStayQuery;
  in: (column: string, values: readonly string[]) => PoliceStayQuery;
  lte: (column: string, value: string) => PoliceStayQuery;
  gt: (column: string, value: string) => PoliceStayQuery;
  maybeSingle: () => Promise<SingleResult<Record<string, unknown>>>;
  then: PromiseLike<DbResult<Record<string, unknown>>>["then"];
};

export type PoliceStayDb = {
  from: (table: string) => {
    select: (columns: string) => PoliceStayQuery;
  };
};

type UnitRow = {
  id?: string;
  restaurant_id?: string;
  reservation_id?: string;
  arrival_date?: string;
  departure_date?: string;
  status?: string;
  adults?: number;
  children?: number;
  infants?: number;
  room_id?: string | null;
  room_type_id?: string | null;
};

type ReservationRow = {
  id?: string;
  restaurant_id?: string;
  confirmation_number?: string | null;
  reservation_mode?: string | null;
  source?: string | null;
};

type OccupantRow = {
  reservation_room_id?: string;
  guest_id?: string;
  restaurant_id?: string;
};

type ProfileRow = {
  id?: string;
  restaurant_id?: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  nationality?: string | null;
  id_document_type?: string | null;
  id_document_number?: string | null;
};

type RoomRow = {
  id?: string;
  restaurant_id?: string;
  room_number?: string | null;
  building?: string | null;
  floor?: string | null;
};

type RoomTypeRow = {
  id?: string;
  restaurant_id?: string;
  name?: string | null;
};

/**
 * Property-scoped read. Business-date resolution is injected so this module
 * does not import the server graph. A query error throws and is never [].
 */
export async function loadPoliceStayDataset(
  db: PoliceStayDb,
  restaurantId: string,
  filters: PoliceStayReportFilters,
  resolveBusinessDate: (persistedBusinessDate: string | null, timezone: string) => string,
): Promise<PoliceStayReportResult> {
  const stayDate = assertStayDate(filters.stayDate);
  const presence = filters.presence ?? "IN_HOUSE";
  const property = await loadProperty(db, restaurantId, resolveBusinessDate);
  const units = await listUnits(db, restaurantId, stayDate, presence, filters.room);
  if (units.length > POLICE_STAY_REPORT_SAFETY_LIMIT) {
    throw new PoliceStayReportError(POLICE_STAY_TOO_LARGE_MESSAGE);
  }
  const reservationIds = unique(units.map((unit) => text(unit.reservation_id)).filter(Boolean));
  const unitIds = unique(units.map((unit) => text(unit.id)).filter(Boolean));
  const roomIds = unique(units.map((unit) => text(unit.room_id)).filter(Boolean));
  const typeIds = unique(units.map((unit) => text(unit.room_type_id)).filter(Boolean));

  const [reservations, occupants, rooms, roomTypes] = await Promise.all([
    selectIn(db, "hotel_reservations", RESERVATION_COLUMNS, "id", reservationIds, restaurantId),
    selectIn(
      db,
      "hotel_reservation_room_guests",
      OCCUPANT_COLUMNS,
      "reservation_room_id",
      unitIds,
      restaurantId,
    ),
    selectIn(db, "hotel_rooms", ROOM_COLUMNS, "id", roomIds, restaurantId),
    selectIn(db, "room_types", ROOM_TYPE_COLUMNS, "id", typeIds, restaurantId),
  ]);
  const guestIds = unique(
    (occupants as OccupantRow[]).map((row) => text(row.guest_id)).filter(Boolean),
  );
  const profiles = await selectIn(
    db,
    "guest_profiles",
    PROFILE_COLUMNS,
    "id",
    guestIds,
    restaurantId,
  );

  return assemblePoliceStayReport({
    restaurantId,
    stayDate,
    businessDate: property.businessDate,
    timezone: property.timezone,
    units: projectUnits({
      restaurantId,
      units,
      reservations: reservations as ReservationRow[],
      occupants: occupants as OccupantRow[],
      profiles: profiles as ProfileRow[],
      rooms: rooms as RoomRow[],
      roomTypes: roomTypes as RoomTypeRow[],
    }),
    filters: { ...filters, stayDate, presence },
  });
}

const UNIT_COLUMNS =
  "id, restaurant_id, reservation_id, arrival_date, departure_date, status, adults, children, infants, room_id, room_type_id";
const RESERVATION_COLUMNS = "id, restaurant_id, confirmation_number, reservation_mode, source";
const OCCUPANT_COLUMNS = "reservation_room_id, guest_id, restaurant_id";
const PROFILE_COLUMNS =
  "id, restaurant_id, first_name, middle_name, last_name, phone, email, nationality, id_document_type, id_document_number";
const ROOM_COLUMNS = "id, restaurant_id, room_number, building, floor";
const ROOM_TYPE_COLUMNS = "id, restaurant_id, name";

function assertStayDate(value: string): string {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("Stay date must be a valid date.");
  }
  return value;
}

async function loadProperty(
  db: PoliceStayDb,
  restaurantId: string,
  resolveBusinessDate: (persistedBusinessDate: string | null, timezone: string) => string,
): Promise<{ businessDate: string; timezone: string }> {
  const result = await db
    .from("restaurants")
    .select("timezone, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error || !result.data) throw new PoliceStayReportError();
  const timezone = text(result.data["timezone"]);
  if (!timezone) throw new PoliceStayReportError();
  const persisted = text(result.data["business_date"]);
  return {
    timezone,
    businessDate: resolveBusinessDate(persisted ? persisted.slice(0, 10) : null, timezone),
  };
}

async function listUnits(
  db: PoliceStayDb,
  restaurantId: string,
  stayDate: string,
  presence: PoliceStayPresence,
  room: string | undefined,
): Promise<UnitRow[]> {
  let query = db
    .from("hotel_reservation_rooms")
    .select(UNIT_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .lte("arrival_date", stayDate)
    .gt("departure_date", stayDate)
    .in("status", policeStayStatuses(presence));
  if (room && isUuid(room)) query = query.eq("room_id", room);
  const result = await query;
  if (result.error) throw new PoliceStayReportError();
  return ((result.data ?? []) as UnitRow[]).filter(
    (row) => text(row.restaurant_id) === restaurantId,
  );
}

async function selectIn(
  db: PoliceStayDb,
  table: string,
  columns: string,
  column: string,
  ids: string[],
  restaurantId: string,
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const result = await db
      .from(table)
      .select(columns)
      .eq("restaurant_id", restaurantId)
      .in(column, ids.slice(index, index + ID_CHUNK));
    if (result.error) throw new PoliceStayReportError();
    for (const row of result.data ?? []) {
      if (text(row["restaurant_id"]) === restaurantId) rows.push(row);
    }
  }
  return rows;
}

function projectUnits(input: {
  restaurantId: string;
  units: UnitRow[];
  reservations: ReservationRow[];
  occupants: OccupantRow[];
  profiles: ProfileRow[];
  rooms: RoomRow[];
  roomTypes: RoomTypeRow[];
}): PoliceStayUnitSource[] {
  const reservations = new Map(
    input.reservations
      .filter((row) => text(row.restaurant_id) === input.restaurantId && text(row.id))
      .map((row) => [text(row.id), row]),
  );
  const profiles = new Map(
    input.profiles
      .filter((row) => text(row.restaurant_id) === input.restaurantId && text(row.id))
      .map((row) => [text(row.id), row]),
  );
  const rooms = new Map(
    input.rooms
      .filter((row) => text(row.restaurant_id) === input.restaurantId && text(row.id))
      .map((row) => [text(row.id), row]),
  );
  const roomTypes = new Map(
    input.roomTypes
      .filter((row) => text(row.restaurant_id) === input.restaurantId && text(row.id))
      .map((row) => [text(row.id), row]),
  );
  const occupantsByRoom = new Map<string, PoliceStayOccupantSource[]>();
  for (const occupant of input.occupants) {
    if (text(occupant.restaurant_id) !== input.restaurantId) continue;
    const roomId = text(occupant.reservation_room_id);
    const profile = profiles.get(text(occupant.guest_id));
    if (!roomId || !profile) continue;
    const list = occupantsByRoom.get(roomId) ?? [];
    list.push(projectOccupant(profile));
    occupantsByRoom.set(roomId, list);
  }

  return input.units.flatMap((unit) => {
    const id = text(unit.id);
    const reservationId = text(unit.reservation_id);
    if (!id || text(unit.restaurant_id) !== input.restaurantId || !reservationId) return [];
    const reservation = reservations.get(reservationId);
    const room = rooms.get(text(unit.room_id));
    const roomType = roomTypes.get(text(unit.room_type_id));
    return [
      {
        restaurantId: input.restaurantId,
        reservationRoomId: id,
        reservationId,
        arrivalDate: text(unit.arrival_date),
        departureDate: text(unit.departure_date),
        status: text(unit.status),
        adults: numberOr(unit.adults, 0),
        children: numberOr(unit.children, 0),
        infants: numberOr(unit.infants, 0),
        roomId: text(unit.room_id) || null,
        roomNumber: text(room?.room_number) || null,
        roomTypeId: text(unit.room_type_id) || null,
        roomTypeName: text(roomType?.name) || null,
        building: text(room?.building) || null,
        floor: text(room?.floor) || null,
        confirmationNumber: text(reservation?.confirmation_number) || null,
        reservationMode: text(reservation?.reservation_mode) || null,
        reservationSource: text(reservation?.source) || null,
        occupants: occupantsByRoom.get(id) ?? [],
      },
    ];
  });
}

function projectOccupant(profile: ProfileRow): PoliceStayOccupantSource {
  return {
    guestProfileId: text(profile.id),
    firstName: text(profile.first_name) || null,
    middleName: text(profile.middle_name) || null,
    lastName: text(profile.last_name) || null,
    phone: text(profile.phone) || null,
    email: text(profile.email) || null,
    nationality: text(profile.nationality) || null,
    idDocumentType: text(profile.id_document_type) || null,
    idDocumentNumber: text(profile.id_document_number) || null,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}
