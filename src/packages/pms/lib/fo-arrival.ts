/**
 * FO Phase 2 — Arrivals & check-in read-model helpers (pure).
 * Hints guide the desk. Canonical writers still enforce authority.
 */
import {
  arrivalExceptionKeys,
  stayRoomReady,
  zonedClockMinutes,
  type RoomInventoryState,
} from "./reservation-workspace/arrivals-departures.ts";
import type { ArrivalExceptionKey } from "./reservation-workspace/shared-read-models.ts";
import type { ReservationStatus } from "./reservation-dates.ts";
import { guestCreateBlocked, type GuestProfileRules } from "./pms-set3-rates-guest.ts";
import { canCompleteCheckIn, canContinueRegistration, isDepositSatisfied, type RegistrationDraft } from "./fo-check-in.ts";
import { normalizeClock } from "./pms-set1-foundation.ts";

export const FO_ARRIVAL_EXCEPTION_LABELS: Record<FoArrivalExceptionKey, string> = {
  unassigned: "Room unassigned",
  room_not_ready: "Room not ready",
  room_unavailable: "Room unavailable",
  payment_issue: "Deposit / payment issue",
  special_request: "Special request",
  missing_guest_data: "Required guest fields missing",
  early_arrival: "Expected arrival is before property check-in time",
};

export const FO_ARRIVAL_EXCEPTION_KEYS = [
  "unassigned",
  "room_not_ready",
  "room_unavailable",
  "payment_issue",
  "special_request",
  "missing_guest_data",
  "early_arrival",
] as const;

export type FoArrivalExceptionKey = (typeof FO_ARRIVAL_EXCEPTION_KEYS)[number];

export type FoEtaTiming = "early" | "on_time" | "late";

export const GUARANTEE_HOLD_UNSUPPORTED =
  "Card authorization / guarantee hold is not available. Deposit posting and manager waiver are the live financial gates.";

export type FoArrivalActionHints = {
  canAssignRoom: boolean;
  canCheckIn: boolean;
  canOpenCheckIn: boolean;
  needsGuestVerification: boolean;
  needsRegistration: boolean;
  needsDeposit: boolean;
  roomReady: boolean;
  hasBlockingException: boolean;
  canUpdateEta: boolean;
  canViewGuest: boolean;
  canOpenFolio: boolean;
  canOpenReservation: boolean;
};

export type FoCheckInReadiness = {
  guestVerified: boolean;
  registrationComplete: boolean;
  stayConfirmed: boolean;
  datesValid: boolean;
  roomAssigned: boolean;
  roomEligible: boolean;
  roomReady: boolean;
  depositSatisfied: boolean;
  blockers: string[];
  canComplete: boolean;
};

export function clockMinutesFromHhmm(clock: string): number {
  const [hours, minutes] = normalizeClock(clock).split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function etaTiming(params: {
  expectedArrivalAt: string | null | undefined;
  checkInTime: string | null | undefined;
  timezone: string;
}): FoEtaTiming | null {
  const eta = (params.expectedArrivalAt ?? "").trim();
  const checkIn = normalizeClock(params.checkInTime ?? "");
  if (!eta || !checkIn) return null;
  if (Number.isNaN(Date.parse(eta))) return null;
  const etaMinutes = zonedClockMinutes(eta, params.timezone);
  const propertyMinutes = clockMinutesFromHhmm(checkIn);
  if (etaMinutes < propertyMinutes) return "early";
  if (etaMinutes > propertyMinutes) return "late";
  return "on_time";
}

export function guestVerificationMissing(params: {
  rules: GuestProfileRules | null | undefined;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  phone: string | null | undefined;
  email: string | null | undefined;
}): string[] {
  const blocked = guestCreateBlocked(params.rules, {
    firstName: params.firstName,
    lastName: params.lastName,
    phone: params.phone,
    email: params.email,
  });
  return blocked ? [blocked] : [];
}

export function foArrivalExceptionKeys(params: {
  status: ReservationStatus;
  roomId: string | null;
  room: RoomInventoryState | undefined;
  financialState: "available" | "not_available" | "permission_denied";
  depositUnpaid: boolean;
  outstandingBalance: boolean;
  specialRequests: string | null;
  missingGuestFields: string[];
  registrationOk: boolean;
  etaTiming: FoEtaTiming | null;
}): FoArrivalExceptionKey[] {
  const ready = stayRoomReady(params.roomId, params.room);
  const base = arrivalExceptionKeys({
    status: params.status,
    roomId: params.roomId,
    operationalStatus: params.room?.operationalStatus ?? null,
    housekeepingStatus: params.room?.housekeepingStatus ?? null,
    ready,
    financialState: params.financialState,
    depositUnpaid: params.depositUnpaid,
    outstandingBalance: params.outstandingBalance,
    specialRequests: params.specialRequests,
  }) as ArrivalExceptionKey[];
  const keys: FoArrivalExceptionKey[] = [...base];
  if (params.missingGuestFields.length > 0 && !params.registrationOk) {
    keys.push("missing_guest_data");
  }
  if (params.etaTiming === "early") keys.push("early_arrival");
  return keys;
}

export const FO_ARRIVAL_BLOCKING_KEYS: FoArrivalExceptionKey[] = [
  "unassigned",
  "room_not_ready",
  "room_unavailable",
  "payment_issue",
  "missing_guest_data",
];

export function foArrivalBlockingKeys(keys: FoArrivalExceptionKey[]): FoArrivalExceptionKey[] {
  return keys.filter((key) => FO_ARRIVAL_BLOCKING_KEYS.includes(key));
}

export function foArrivalActionHints(params: {
  status: ReservationStatus;
  assigned: boolean;
  roomReady: boolean;
  registrationOk: boolean;
  depositOk: boolean;
  missingGuestFields: string[];
  blockingKeys: FoArrivalExceptionKey[];
  folioId: string | null;
  guestId: string | null;
}): FoArrivalActionHints {
  const lifecycleOk = params.status === "confirmed";
  const pending = params.status === "pending";
  const preArrival = pending || lifecycleOk;
  const needsGuestVerification = params.missingGuestFields.length > 0;
  const needsRegistration = !params.registrationOk;
  const needsDeposit = !params.depositOk;
  const hasBlockingException = params.blockingKeys.length > 0;
  return {
    canAssignRoom: preArrival,
    canOpenCheckIn: lifecycleOk,
    canCheckIn: lifecycleOk && params.assigned && params.roomReady && params.registrationOk && params.depositOk && !hasBlockingException,
    needsGuestVerification,
    needsRegistration,
    needsDeposit,
    roomReady: params.roomReady,
    hasBlockingException,
    canUpdateEta: preArrival,
    canViewGuest: Boolean(params.guestId),
    canOpenFolio: params.folioId != null,
    canOpenReservation: true,
  };
}

export function foCheckInReadiness(params: {
  status: ReservationStatus;
  arrivalDate: string;
  departureDate: string;
  assigned: boolean;
  roomEligible: boolean;
  roomReady: boolean;
  registrationOk: boolean;
  missingGuestFields: string[];
  depositOk: boolean;
  blockingKeys: FoArrivalExceptionKey[];
}): FoCheckInReadiness {
  const stayConfirmed = params.status === "confirmed";
  const datesValid = Boolean(params.arrivalDate && params.departureDate && params.arrivalDate < params.departureDate);
  const guestVerified = params.missingGuestFields.length === 0;
  const blockers: string[] = [];
  if (params.status === "pending") blockers.push("Pending stays cannot check in until confirmed.");
  if (params.status === "cancelled") blockers.push("Cancelled stays cannot check in.");
  if (params.status === "checked_in") blockers.push("This stay is already checked in.");
  if (params.status === "checked_out") blockers.push("Checked-out stays cannot check in.");
  if (params.status === "no_show") blockers.push("No-show stays cannot check in on the normal path.");
  if (stayConfirmed && !params.assigned) blockers.push("Assign a room before check-in.");
  if (params.assigned && !params.roomEligible) blockers.push("The assigned room is not eligible (OOO, OOS or blocked).");
  if (params.assigned && params.roomEligible && !params.roomReady) blockers.push("The assigned room is not ready.");
  if (!params.registrationOk) blockers.push("Complete guest registration or request a waiver.");
  if (params.missingGuestFields.length > 0 && !params.registrationOk) {
    blockers.push(...params.missingGuestFields);
  }
  if (!params.depositOk) blockers.push("Deposit required before check-in can finish.");
  if (!datesValid) blockers.push("Stay dates are not valid.");
  const canComplete = canCompleteCheckIn({
    roomReady: params.assigned && params.roomEligible && params.roomReady,
    registrationOk: params.registrationOk,
    depositOk: params.depositOk,
    keyOk: true,
  }) && stayConfirmed && datesValid && blockers.length === 0;

  return {
    guestVerified,
    registrationComplete: params.registrationOk,
    stayConfirmed,
    datesValid,
    roomAssigned: params.assigned,
    roomEligible: params.roomEligible,
    roomReady: params.roomReady,
    depositSatisfied: params.depositOk,
    blockers: [...new Set(blockers)],
    canComplete,
  };
}

export function registrationOkFromProgress(params: {
  snapshot: RegistrationDraft | null;
  waived: boolean;
  guest: { fullName: string; phone: string | null; email: string | null; idDocumentType: RegistrationDraft["idDocumentType"]; idDocumentNumber: string | null };
}): boolean {
  const draft: RegistrationDraft =
    params.snapshot ??
    {
      fullName: params.guest.fullName,
      phone: params.guest.phone,
      email: params.guest.email,
      idDocumentType: params.guest.idDocumentType,
      idDocumentNumber: params.guest.idDocumentNumber,
    };
  return canContinueRegistration(draft, params.waived);
}

export function depositOkFromSignals(params: {
  postedAmount: number;
  waived: boolean;
  requiredAmount?: number | null;
}): boolean {
  return isDepositSatisfied(params);
}

export function roomEligibleStatus(status: string | null | undefined): boolean {
  return status !== "out_of_order" && status !== "out_of_service";
}
