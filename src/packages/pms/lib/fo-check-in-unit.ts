import type { RegistrationDraft } from "@/packages/pms/lib/fo-check-in";
import { reservationError } from "@/packages/pms/lib/reservations.server";

/**
 * B01.1 — Check-In target for one room unit.
 * B01.2 — progress for that unit. Registration, money, and completion stay later.
 */

export type CheckInGuestSource = "unit_primary" | "booker";

export type CheckInUnitOccupant = {
  guestId: string;
  name: string;
  isPrimary: boolean;
};

export type CheckInUnitPackage = {
  id: string;
  packageId: string;
  packageName: string;
  appliedAmount: number;
};

/** Sibling summary. Occupants, packages, and rate stay off this object. */
export type CheckInSiblingUnit = {
  id: string;
  sequence: number;
  status: string | null;
  roomId: string | null;
  roomNumber: string | null;
};

export type CheckInUnitTarget = {
  reservationRoomId: string | null;
  sequence: number | null;
  status: string | null;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  infants: number | null;
  roomTypeId: string;
  roomTypeName: string | null;
  roomId: string | null;
  roomNumber: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  subtotal: number | null;
  currency: string | null;
  guestSource: CheckInGuestSource;
  primaryGuestId: string;
  primaryGuestName: string;
  occupants: CheckInUnitOccupant[];
  packages: CheckInUnitPackage[];
  siblings: CheckInSiblingUnit[];
};

export type CheckInUnitRow = {
  id: string;
  sequence: number;
  status: string | null;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  infants: number | null;
  roomTypeId: string;
  roomTypeName: string | null;
  roomId: string | null;
  roomNumber: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  subtotal: number | null;
  currency: string | null;
};

export type CheckInUnitPackageSource = CheckInUnitPackage & {
  reservationRoomId: string | null;
};

export type CheckInUnitOccupantSource = CheckInUnitOccupant & {
  reservationRoomId: string;
};

export type CheckInUnitMaster = {
  guestId: string;
  guestName: string;
  status: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  infants: number | null;
  roomTypeId: string;
  roomTypeName: string | null;
  roomId: string | null;
  roomNumber: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  subtotal: number | null;
  currency: string | null;
};

export type CheckInUnitResolveInput = {
  reservationRoomId?: string | null;
  master: CheckInUnitMaster;
  units: CheckInUnitRow[];
  occupants: CheckInUnitOccupantSource[];
  packages: CheckInUnitPackageSource[];
};

function siblingOf(unit: CheckInUnitRow): CheckInSiblingUnit {
  return {
    id: unit.id,
    sequence: unit.sequence,
    status: unit.status,
    roomId: unit.roomId,
    roomNumber: unit.roomNumber,
  };
}

function targetFromUnit(unit: CheckInUnitRow, input: CheckInUnitResolveInput): CheckInUnitTarget {
  const occupants = input.occupants
    .filter((occupant) => occupant.reservationRoomId === unit.id)
    .map((occupant) => ({
      guestId: occupant.guestId,
      name: occupant.name,
      isPrimary: occupant.isPrimary,
    }));
  const primary = occupants.find((occupant) => occupant.isPrimary) ?? null;
  return {
    reservationRoomId: unit.id,
    sequence: unit.sequence,
    status: unit.status,
    arrivalDate: unit.arrivalDate,
    departureDate: unit.departureDate,
    adults: unit.adults,
    children: unit.children,
    infants: unit.infants,
    roomTypeId: unit.roomTypeId,
    roomTypeName: unit.roomTypeName,
    roomId: unit.roomId,
    roomNumber: unit.roomNumber,
    ratePlanId: unit.ratePlanId,
    ratePlanName: unit.ratePlanName,
    subtotal: unit.subtotal,
    currency: unit.currency,
    guestSource: primary ? "unit_primary" : "booker",
    primaryGuestId: primary ? primary.guestId : input.master.guestId,
    primaryGuestName: primary ? primary.name : input.master.guestName,
    occupants,
    packages: input.packages
      .filter((row) => row.reservationRoomId === unit.id)
      .map((row) => ({
        id: row.id,
        packageId: row.packageId,
        packageName: row.packageName,
        appliedAmount: row.appliedAmount,
      })),
    siblings: input.units.filter((row) => row.id !== unit.id).map(siblingOf),
  };
}

function targetFromMaster(input: CheckInUnitResolveInput): CheckInUnitTarget {
  const master = input.master;
  return {
    reservationRoomId: null,
    sequence: null,
    status: master.status,
    arrivalDate: master.arrivalDate,
    departureDate: master.departureDate,
    adults: master.adults,
    children: master.children,
    infants: master.infants,
    roomTypeId: master.roomTypeId,
    roomTypeName: master.roomTypeName,
    roomId: master.roomId,
    roomNumber: master.roomNumber,
    ratePlanId: master.ratePlanId,
    ratePlanName: master.ratePlanName,
    subtotal: master.subtotal,
    currency: master.currency,
    guestSource: "booker",
    primaryGuestId: master.guestId,
    primaryGuestName: master.guestName,
    occupants: [],
    packages: input.packages
      .filter((row) => row.reservationRoomId == null)
      .map((row) => ({
        id: row.id,
        packageId: row.packageId,
        packageName: row.packageName,
        appliedAmount: row.appliedAmount,
      })),
    siblings: [],
  };
}

export type CheckInUnitProgress = {
  reservationRoomId: string | null;
  walkInIncomplete: boolean;
  registrationSnapshot: RegistrationDraft | null;
  registrationWaived: boolean;
  registrationWaiverReason: string | null;
  registrationWaivedBy: string | null;
  registrationWaivedAt: string | null;
  depositTransactionId: string | null;
  depositAmount: number | null;
  depositMethod: string | null;
  depositWaived: boolean;
  depositWaiverReason: string | null;
  depositWaivedBy: string | null;
  depositWaivedAt: string | null;
  keyAccessType: string | null;
  keyIdentifier: string | null;
  keyCount: number | null;
  keyIssuedAt: string | null;
  keyIssuedBy: string | null;
  keyWaived: boolean;
  keyWaiverReason: string | null;
  keyWaivedBy: string | null;
  keyWaivedAt: string | null;
  completedAt: string | null;
};

export function emptyCheckInUnitProgress(reservationRoomId: string | null): CheckInUnitProgress {
  return {
    reservationRoomId,
    walkInIncomplete: false,
    registrationSnapshot: null,
    registrationWaived: false,
    registrationWaiverReason: null,
    registrationWaivedBy: null,
    registrationWaivedAt: null,
    depositTransactionId: null,
    depositAmount: null,
    depositMethod: null,
    depositWaived: false,
    depositWaiverReason: null,
    depositWaivedBy: null,
    depositWaivedAt: null,
    keyAccessType: null,
    keyIdentifier: null,
    keyCount: 1,
    keyIssuedAt: null,
    keyIssuedBy: null,
    keyWaived: false,
    keyWaiverReason: null,
    keyWaivedBy: null,
    keyWaivedAt: null,
    completedAt: null,
  };
}

/**
 * Live progress for the target unit. A null unit id is the legacy stay with no units.
 * A null row on a stay that already has units is audit history and is not returned.
 */
export function selectCheckInUnitProgress(input: {
  reservationRoomId: string | null;
  unitCount: number;
  rows: CheckInUnitProgress[];
}): CheckInUnitProgress {
  if (input.unitCount > 0 && input.reservationRoomId == null) {
    throw reservationError("CHECKIN_PROGRESS_UNIT_REQUIRED");
  }
  if (input.reservationRoomId) {
    return (
      input.rows.find((row) => row.reservationRoomId === input.reservationRoomId) ??
      emptyCheckInUnitProgress(input.reservationRoomId)
    );
  }
  return input.rows.find((row) => row.reservationRoomId == null) ?? emptyCheckInUnitProgress(null);
}

/**
 * One unit resolves without an id. Several units require an id.
 * Zero units use the reservation master. A unit room is never replaced by the master room.
 */
export function resolveCheckInUnitTarget(input: CheckInUnitResolveInput): CheckInUnitTarget {
  const requested = input.reservationRoomId ?? null;
  if (input.units.length === 0) {
    if (requested) throw reservationError("ROOM_UNIT_NOT_FOUND");
    return targetFromMaster(input);
  }
  const unit = requested
    ? (input.units.find((row) => row.id === requested) ?? null)
    : input.units.length === 1
      ? (input.units[0] ?? null)
      : null;
  if (!requested && input.units.length > 1) throw reservationError("ROOM_UNIT_REQUIRED");
  if (!unit) throw reservationError("ROOM_UNIT_NOT_FOUND");
  return targetFromUnit(unit, input);
}
