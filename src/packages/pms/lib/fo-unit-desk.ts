/**
 * FO-04 — operational desk rows are reservation units.
 * The reservation header stays the aggregate. A desk never picks a sibling room.
 */
import type { FrontOfficeStay } from "./frontoffice.functions";
import type { FrontOfficeRoomTarget } from "./reservation-room-units";
import { nightsBetween, type ReservationStatus } from "./reservations.server";

export type FoDeskKind = "arrivals" | "in_house" | "departures";

export type FoSiblingUnit = {
  reservationRoomId: string;
  unitSequence: number;
  status: string;
  roomNumber: string | null;
};

const ARRIVAL_STATUSES = new Set(["pending", "confirmed"]);

export function frontOfficeStayKey(stay: {
  id: string;
  reservationRoomId?: string | null;
}): string {
  return stay.reservationRoomId ? `${stay.id}:${stay.reservationRoomId}` : stay.id;
}

export function siblingUnitSummary(stay: Pick<FrontOfficeStay, "siblingUnits">): string | null {
  const siblings = stay.siblingUnits ?? [];
  if (siblings.length === 0) return null;
  return siblings
    .map((unit) => {
      const room = unit.roomNumber ? `Room ${unit.roomNumber}` : "Unassigned";
      return `${room} ${unit.status.replaceAll("_", " ")}`;
    })
    .join(" · ");
}

/** Date changes stay on the existing reservation writer, which updates every room on the same window. */
export function stayDateTargetsOneRoom(stay: Pick<FrontOfficeStay, "roomUnits">): boolean {
  const units = stay.roomUnits ?? [];
  if (units.length <= 1) return true;
  const active = units.filter((unit) => unit.status == null || openRoomStatus(unit.status));
  return active.length <= 1;
}

function openRoomStatus(status: string): boolean {
  return status !== "cancelled" && status !== "no_show" && status !== "checked_out";
}

function unitMatchesDesk(
  status: string,
  arrivalDate: string,
  departureDate: string,
  kind: FoDeskKind,
  businessDate: string,
): boolean {
  if (kind === "arrivals") return ARRIVAL_STATUSES.has(status) && arrivalDate === businessDate;
  if (kind === "in_house") return status === "checked_in";
  if (status === "checked_in" && departureDate <= businessDate) return true;
  return ARRIVAL_STATUSES.has(status) && departureDate === businessDate;
}

function siblingUnits(
  units: FrontOfficeRoomTarget[],
  selectedId: string,
  fallbackStatus: string,
): FoSiblingUnit[] {
  return units
    .filter((unit) => unit.id !== selectedId)
    .map((unit) => ({
      reservationRoomId: unit.id,
      unitSequence: unit.unitSequence,
      status: unit.status ?? fallbackStatus,
      roomNumber: unit.roomNumber ?? null,
    }));
}

function overlayUnit(
  stay: FrontOfficeStay,
  unit: FrontOfficeRoomTarget,
  businessDate: string,
): FrontOfficeStay {
  const status = (unit.status ?? stay.status) as ReservationStatus;
  const arrivalDate = unit.arrivalDate || stay.arrivalDate;
  const departureDate = unit.departureDate || stay.departureDate;
  const units = stay.roomUnits ?? [];
  return {
    ...stay,
    reservationRoomId: unit.id,
    status,
    roomTypeId: unit.roomTypeId,
    roomTypeName:
      unit.roomTypeName ||
      (unit.roomTypeId === stay.roomTypeId ? stay.roomTypeName : stay.roomTypeName),
    roomId: unit.roomId,
    roomNumber: unit.roomNumber ?? null,
    arrivalDate,
    departureDate,
    nights: nightsBetween(arrivalDate, departureDate),
    adults: unit.adults,
    children: unit.children ?? stay.children,
    overstay: status === "checked_in" && departureDate < businessDate,
    siblingUnits: siblingUnits(units, unit.id, stay.status),
  };
}

/**
 * One row per room that belongs on this desk. A reservation with no unit rows
 * stays one header row. A header is not emitted beside its units.
 */
export function projectOperationalStayRows(
  stays: FrontOfficeStay[],
  kind: FoDeskKind,
  businessDate: string,
): FrontOfficeStay[] {
  const rows: FrontOfficeStay[] = [];
  const seen = new Set<string>();
  for (const stay of stays) {
    if (seen.has(stay.id)) continue;
    seen.add(stay.id);
    const units = stay.roomUnits ?? [];
    if (units.length === 0) {
      rows.push(stay);
      continue;
    }
    const matched = units
      .filter((unit) =>
        unitMatchesDesk(
          unit.status ?? stay.status,
          unit.arrivalDate || stay.arrivalDate,
          unit.departureDate || stay.departureDate,
          kind,
          businessDate,
        ),
      )
      .sort((left, right) => left.unitSequence - right.unitSequence);
    for (const unit of matched) rows.push(overlayUnit(stay, unit, businessDate));
  }
  return rows;
}

export function focusFrontOfficeStay(
  stay: FrontOfficeStay,
  reservationRoomId: string | null | undefined,
  businessDate: string,
): FrontOfficeStay {
  const units = stay.roomUnits ?? [];
  if (!reservationRoomId) {
    if (units.length === 1) return overlayUnit(stay, units[0]!, businessDate);
    return stay;
  }
  const unit = units.find((row) => row.id === reservationRoomId);
  if (!unit) return stay;
  return overlayUnit(stay, unit, businessDate);
}
