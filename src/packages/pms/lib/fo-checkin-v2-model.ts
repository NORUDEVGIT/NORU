/**
 * Step 1 view rules for the shared Check-In workspace.
 * The selected unit is the only guest, room, occupant, and progress source.
 */
import {
  registrationSnapshotIsComplete,
  type CheckInBlocker,
  type CheckInBlockerCode,
  type CheckInReadiness,
  type CheckInWarning,
  type RegistrationCompletionProjection,
} from "@/packages/pms/lib/fo-check-in-readiness";
import type {
  CheckInUnitOccupant,
  CheckInUnitProgress,
  CheckInUnitTarget,
} from "@/packages/pms/lib/fo-check-in-unit";
import { resolvePropertyBusinessDate } from "@/packages/pms/lib/reservation-workspace/business-date";
import { nightsBetween } from "@/shared/lib/property-dates";

export const CHECKIN_V2_STEPS = [
  { id: "guest_reservation", label: "Guest & Reservation", number: 1 },
  { id: "registration", label: "Registration", number: 2 },
  { id: "payment_guarantee", label: "Payment & Guarantee", number: 3 },
  { id: "agreement_signature", label: "Agreement & Signature", number: 4 },
  { id: "review_checkin", label: "Review & Check-In", number: 5 },
] as const;

export type CheckInV2StepId = (typeof CHECKIN_V2_STEPS)[number]["id"];

/** Desktop sheet: about 92vw, capped near 1500px. Mobile stays full screen. */
export const FO_CHECKIN_V2_SHEET_CLASS =
  "w-full max-w-none sm:w-[min(92vw,1500px)] sm:max-w-[1500px]";

export type CheckInUnitFailure =
  | "permission_denied"
  | "room_unit_required"
  | "unit_not_found"
  | "reservation_not_found"
  | "retryable";

export type CheckInRoomChip = "Available" | "Clean" | "Inspected" | "Ready";

export type CheckInStep1Presentation = {
  guestName: string;
  guestId: string;
  bookerFallback: boolean;
  roomNumber: string | null;
  roomTypeName: string | null;
  reservationRoomId: string | null;
  nights: number;
  occupants: CheckInUnitOccupant[];
  siblings: Array<{ id: string; roomNumber: string | null; status: string | null }>;
  progressReservationRoomId: string | null;
  registrationComplete: boolean;
  paymentRecorded: boolean;
  reviewComplete: boolean;
  legacyNoUnit: boolean;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

/** Friendly buckets. Callers must not render the raw server string for these. */
export function classifyCheckInUnitFailure(error: unknown): CheckInUnitFailure {
  const message = messageOf(error);
  if (
    /permission|don't have access|do not have access|not authorized|forbidden|access denied/i.test(
      message,
    )
  ) {
    return "permission_denied";
  }
  if (
    message.includes("ROOM_UNIT_REQUIRED") ||
    message.includes("Choose which room this action applies to.")
  ) {
    return "room_unit_required";
  }
  if (
    message.includes("ROOM_UNIT_NOT_FOUND") ||
    message.includes("That room is not on this reservation.")
  ) {
    return "unit_not_found";
  }
  if (message.includes("Reservation not found")) return "reservation_not_found";
  return "retryable";
}

/**
 * Guest, room, occupants, siblings, and progress all come from the selected unit.
 * A sibling status is copied through and is never replaced by the target status.
 */
export function checkInStep1Presentation(
  unit: CheckInUnitTarget & {
    progress: CheckInUnitProgress;
  },
): CheckInStep1Presentation {
  const progress = unit.progress;
  return {
    guestName: unit.primaryGuestName,
    guestId: unit.primaryGuestId,
    bookerFallback: unit.guestSource === "booker",
    roomNumber: unit.roomNumber,
    roomTypeName: unit.roomTypeName,
    reservationRoomId: unit.reservationRoomId,
    nights: nightsBetween(unit.arrivalDate, unit.departureDate),
    occupants: unit.occupants.map((occupant) => ({
      guestId: occupant.guestId,
      name: occupant.name,
      isPrimary: occupant.isPrimary,
    })),
    siblings: unit.siblings.map((sibling) => ({
      id: sibling.id,
      roomNumber: sibling.roomNumber,
      status: sibling.status,
    })),
    progressReservationRoomId: progress.reservationRoomId,
    registrationComplete: registrationSnapshotIsComplete(progress.registrationSnapshot),
    paymentRecorded: Boolean(progress.depositTransactionId) || progress.depositWaived,
    reviewComplete: Boolean(progress.completedAt),
    legacyNoUnit: unit.reservationRoomId == null,
  };
}

/** Step 2's check mark follows readiness. Visiting the step is not completion. */
export function registrationProgressLabel(input: {
  current: boolean;
  visited: boolean;
  completion: RegistrationCompletionProjection | null;
}): "In progress" | "Completed" | "Waived" | "Visited" | "Pending" {
  if (input.completion?.state === "complete") return "Completed";
  if (input.current) return "In progress";
  if (input.completion?.state === "waived") return "Waived";
  if (input.visited) return "Visited";
  return "Pending";
}

export function checkInRoomReadiness(input: {
  roomId: string | null;
  display: ReadonlyArray<{ id: string; eligible: boolean }>;
  assignedRoom: {
    floor: string | null;
    building: string | null;
    housekeepingStatus: string | null;
  } | null;
  readyForCheckIn?: boolean | null;
}): {
  floor: string | null;
  building: string | null;
  chips: CheckInRoomChip[];
  statusUnavailable: boolean;
} {
  const row = input.roomId
    ? (input.display.find((item) => item.id === input.roomId) ?? null)
    : null;
  const housekeeping = input.assignedRoom?.housekeepingStatus ?? null;
  const chips: CheckInRoomChip[] = [];
  if (row?.eligible) chips.push("Available");
  if (housekeeping === "clean") chips.push("Clean");
  if (housekeeping === "inspected") chips.push("Inspected");
  if (input.readyForCheckIn === true) chips.push("Ready");
  return {
    floor: input.assignedRoom?.floor ?? null,
    building: input.assignedRoom?.building ?? null,
    chips,
    statusUnavailable:
      Boolean(input.roomId) && !row && !input.assignedRoom && input.readyForCheckIn == null,
  };
}

/** One nightly figure only when every stored night is the same amount. */
export function uniformNightlyAmount(
  rates: ReadonlyArray<{ rate: number }> | null | undefined,
): number | null {
  const first = rates?.[0]?.rate;
  if (first == null || !rates || rates.length === 0) return null;
  return rates.every((row) => row.rate === first) ? first : null;
}

export function guestAddressSummary(parts: Array<string | null | undefined>): string | null {
  const text = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return text.length > 0 ? text.join(", ") : null;
}

/** Step 1 may block on these. Later-step requirements stay visible and do not block Next. */
export const STEP1_HARD_BLOCKER_CODES = [
  "ROOM_UNIT_REQUIRED",
  "INVALID_TRANSITION",
  "ROOM_REQUIRED",
  "ROOM_NOT_ELIGIBLE",
  "ROOM_NOT_READY",
] as const satisfies readonly CheckInBlockerCode[];

export const STEP1_DEFERRED_BLOCKER_CODES = [
  "REGISTRATION_INCOMPLETE",
  "GUEST_FIELDS",
  "IDENTITY_DOCUMENT",
  "DEPOSIT_REQUIRED",
  "AGREEMENT_REQUIRED",
  "SIGNATURE_REQUIRED",
  "KEY_REQUIRED",
] as const satisfies readonly CheckInBlockerCode[];

export type ArrivalVersusBusinessDate = "past" | "on_date" | "early";

export type CheckInStep1Readiness = {
  hardBlockers: CheckInBlocker[];
  deferredBlockers: CheckInBlocker[];
  warnings: CheckInWarning[];
  canContinue: boolean;
  continueMessage: string | null;
  arrivalVersusBusinessDate: ArrivalVersusBusinessDate | null;
};

const ASSIGNMENT_BLOCKER_TEXT: Record<string, string> = {
  ROOM_NOT_FOUND: "This room could not be found.",
  ROOM_TYPE_NOT_FOUND: "This room type could not be found.",
  ROOM_INACTIVE: "This room is inactive.",
  ROOM_OPERATIONALLY_UNAVAILABLE: "This room is not operationally available.",
  ROOM_TYPE_MISMATCH: "This room is a different room type.",
  ROOM_NOT_SELLABLE: "This room is not sellable.",
  OCCUPANCY_EXCEEDED: "This room does not fit the stay occupancy.",
  BED_TYPE_MISMATCH: "This room does not match the required bed type.",
  ACCESSIBILITY_MISMATCH: "This room does not meet the accessibility requirement.",
  CONNECTING_ROOM_REQUIRED: "This room is not a connecting room.",
  ROOM_ALREADY_BOOKED: "This room overlaps another stay.",
  ROOM_BLOCKED: "This room is blocked.",
  MAINTENANCE_NOT_CLEAR: "Maintenance has not cleared this room.",
  HOUSEKEEPING_NOT_READY: "Housekeeping has not released this room for assignment.",
};

/** First assignment blocker, as staff-facing text. Eligible rooms return null. */
export function assignmentIneligibilityReason(
  eligible: boolean,
  blockers: ReadonlyArray<{
    code?: string | number | boolean | null;
    message?: string | number | boolean | null;
  }>,
): string | null {
  if (eligible) return null;
  const first = blockers[0];
  if (!first) return "This room is not assignable.";
  const message = typeof first.message === "string" ? first.message.trim() : "";
  if (message) return message;
  const code = typeof first.code === "string" ? first.code : "";
  return (
    ASSIGNMENT_BLOCKER_TEXT[code] ??
    (code ? code.replaceAll("_", " ") : "This room is not assignable.")
  );
}

const HARD_BLOCKERS = new Set<string>(STEP1_HARD_BLOCKER_CODES);
const DEFERRED_BLOCKERS = new Set<string>(STEP1_DEFERRED_BLOCKER_CODES);

/**
 * Classifies an existing check-in readiness result for Step 1.
 * `canContinue` ignores final-check-in blockers that belong to later steps.
 * Arrival versus the property business date is information only.
 */
export function projectCheckInStep1Readiness(
  readiness: CheckInReadiness,
  dates?: {
    arrivalDate?: string | null;
    persistedBusinessDate?: string | null;
    timezone?: string | null;
  },
): CheckInStep1Readiness {
  const hardBlockers = readiness.blockers.filter((item) => HARD_BLOCKERS.has(item.code));
  const deferredBlockers = readiness.blockers.filter((item) => DEFERRED_BLOCKERS.has(item.code));
  let arrivalVersusBusinessDate: ArrivalVersusBusinessDate | null = null;
  const arrivalDate = dates?.arrivalDate ?? null;
  if (arrivalDate) {
    const businessDate = resolvePropertyBusinessDate(
      dates?.persistedBusinessDate ?? null,
      dates?.timezone?.trim() || "UTC",
    );
    arrivalVersusBusinessDate =
      arrivalDate < businessDate ? "past" : arrivalDate > businessDate ? "early" : "on_date";
  }
  return {
    hardBlockers,
    deferredBlockers,
    warnings: readiness.warnings,
    canContinue: hardBlockers.length === 0,
    continueMessage: hardBlockers[0]?.message ?? null,
    arrivalVersusBusinessDate,
  };
}
