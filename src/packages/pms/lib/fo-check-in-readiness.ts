import {
  DEPOSIT_REQUIRED_BANNER,
  GUARANTEE_UNRULED,
  ID_DOCUMENT_TYPES,
  REGISTRATION_INCOMPLETE_BANNER,
  isRegistrationComplete,
  type IdDocumentType,
  type RegistrationDraft,
} from "@/packages/pms/lib/fo-check-in";
import type { CheckInGuestSource } from "@/packages/pms/lib/fo-check-in-unit";

export const CHECK_IN_BLOCKER_CODES = [
  "ROOM_UNIT_REQUIRED",
  "INVALID_TRANSITION",
  "GUEST_FIELDS",
  "IDENTITY_DOCUMENT",
  "ROOM_REQUIRED",
  "ROOM_NOT_ELIGIBLE",
  "ROOM_NOT_READY",
  "DEPOSIT_REQUIRED",
  "AGREEMENT_REQUIRED",
  "SIGNATURE_REQUIRED",
  "KEY_REQUIRED",
  "REGISTRATION_INCOMPLETE",
] as const;

export type CheckInBlockerCode = (typeof CHECK_IN_BLOCKER_CODES)[number];

export type CheckInBlocker = {
  code: CheckInBlockerCode;
  message: string;
};

export type CheckInWarning = {
  code: "UNVERIFIED_DOCUMENT" | "EARLY_ARRIVAL" | "GUARANTEE_UNEVALUATED";
  message: string;
};

export type CheckInOverride = {
  requirement: "REGISTRATION_INCOMPLETE" | "DEPOSIT_REQUIRED" | "KEY_REQUIRED";
  reason: string | null;
  actor: string | null;
  at: string | null;
};

export type CheckInReadiness = {
  target: {
    reservationRoomId: string | null;
    guestId: string;
    guestSource: CheckInGuestSource;
    status: string | null;
  } | null;
  registration: { complete: boolean; waived: boolean };
  identity: { valid: boolean; warnings: string[] };
  room: { assigned: boolean; eligible: boolean | null; ready: boolean | null };
  financial: {
    scope: "reservation";
    requiredAmount: number | null;
    receivedAmount: number;
    outstanding: number;
    satisfied: boolean;
    guaranteeMethod: string | null;
    guaranteeSatisfied: null;
  } | null;
  agreement: { versionId: string | null; signed: boolean };
  key: { recorded: boolean; waived: boolean };
  blockers: CheckInBlocker[];
  warnings: CheckInWarning[];
  overrides: CheckInOverride[];
  canCheckIn: boolean;
};

export type CheckInReadinessFacts = {
  unitRequired: boolean;
  target: {
    reservationRoomId: string | null;
    guestId: string;
    guestSource: CheckInGuestSource;
    status: string | null;
    roomId: string | null;
  } | null;
  registrationComplete: boolean;
  registrationWaived: boolean;
  registrationWaiverReason: string | null;
  registrationWaivedBy: string | null;
  registrationWaivedAt: string | null;
  guestFieldErrors: string[];
  identityDocumentErrors: string[];
  verificationWarnings: string[];
  verificationBlockers: string[];
  roomEligible: boolean | null;
  roomReady: boolean | null;
  roomReadyReason: string | null;
  deposit: {
    requiredAmount: number | null;
    receivedAmount: number;
    outstanding: number;
    satisfied: boolean;
    waived: boolean;
    waiverReason: string | null;
    waiverActor: string | null;
    waiverAt: string | null;
    guaranteeMethod: string | null;
  } | null;
  agreementVersionId: string | null;
  agreementSigned: boolean;
  keyRecorded: boolean;
  keyWaived: boolean;
  keyWaiverReason: string | null;
  keyWaivedBy: string | null;
  keyWaivedAt: string | null;
  earlyArrival: boolean;
  earlyCheckInAllowed: boolean | null;
  earlyCheckInNeedsApproval: boolean | null;
};

const BLOCKER_MESSAGE: Record<CheckInBlockerCode, string> = {
  ROOM_UNIT_REQUIRED: "Choose which room this action applies to.",
  INVALID_TRANSITION: "That action isn't allowed for this reservation's current status.",
  GUEST_FIELDS: "Check-in blocked by guest requirements.",
  IDENTITY_DOCUMENT: "An identity document is required for check-in.",
  ROOM_REQUIRED: "Assign a room before completing check-in.",
  ROOM_NOT_ELIGIBLE: "That room is not eligible for this stay.",
  ROOM_NOT_READY: "The assigned room is not ready.",
  DEPOSIT_REQUIRED: DEPOSIT_REQUIRED_BANNER,
  AGREEMENT_REQUIRED: "Publish a registration agreement before this stay can be signed.",
  SIGNATURE_REQUIRED: "A signature is required for this registration agreement.",
  KEY_REQUIRED: "Record a key or waive keys for later.",
  REGISTRATION_INCOMPLETE: REGISTRATION_INCOMPLETE_BANNER,
};

function blocker(code: CheckInBlockerCode, message?: string): CheckInBlocker {
  return { code, message: message && message.trim().length > 0 ? message : BLOCKER_MESSAGE[code] };
}

function emptyResult(): CheckInReadiness {
  return {
    target: null,
    registration: { complete: false, waived: false },
    identity: { valid: false, warnings: [] },
    room: { assigned: false, eligible: null, ready: null },
    financial: null,
    agreement: { versionId: null, signed: false },
    key: { recorded: false, waived: false },
    blockers: [],
    warnings: [],
    overrides: [],
    canCheckIn: false,
  };
}

const LEGACY_ID_TYPES = new Set<string>(ID_DOCUMENT_TYPES);

function snapshotText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function legacyRegistrationDraft(record: Record<string, unknown>): RegistrationDraft {
  const idType = snapshotText(record.idDocumentType);
  return {
    fullName: snapshotText(record.fullName),
    phone: snapshotText(record.phone) || null,
    email: snapshotText(record.email) || null,
    idDocumentType: LEGACY_ID_TYPES.has(idType) ? (idType as IdDocumentType) : null,
    idDocumentNumber: snapshotText(record.idDocumentNumber) || null,
  };
}

/**
 * Registration completeness for the readiness read.
 * A missing or partial snapshot is incomplete. It is not a read failure.
 * Check-in v2 stores `{ guestId, guestSource, fields }` and does not carry
 * the legacy draft's identity columns. Identity stays on the document rules.
 */
export function registrationSnapshotIsComplete(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const record = snapshot as Record<string, unknown>;
  if ("fullName" in record || "idDocumentType" in record || "idDocumentNumber" in record) {
    return isRegistrationComplete(legacyRegistrationDraft(record));
  }
  const fields = record.fields;
  if (!fields || typeof fields !== "object") return false;
  return registrationSnapshotGaps(snapshot).length === 0;
}

/** Same fields as registrationSnapshotIsComplete. Does not add a new rule. */
export function registrationSnapshotGaps(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== "object") {
    return ["First and last name are required.", "Phone or email is required."];
  }
  const record = snapshot as Record<string, unknown>;
  const profile =
    record.fields && typeof record.fields === "object"
      ? (record.fields as Record<string, unknown>)
      : record;
  const name = `${snapshotText(profile.first_name) || snapshotText(profile.firstName)} ${
    snapshotText(profile.last_name) || snapshotText(profile.lastName)
  }`.trim();
  const phone = snapshotText(profile.phone).trim();
  const email = snapshotText(profile.email).trim();
  const gaps: string[] = [];
  if (!name) gaps.push("First and last name are required.");
  if (!phone && !email) gaps.push("Phone or email is required.");
  return gaps;
}

export type RegistrationCompletionState = "complete" | "incomplete" | "waived";

export type RegistrationCompletionProjection = {
  state: RegistrationCompletionState;
  label: "Complete" | "Incomplete" | "Waived";
  detail: string | null;
  missingRequirements: string[];
  identitySatisfied: boolean;
  savedSnapshotExists: boolean;
};

/**
 * Presentation of the readiness registration result.
 * A saved snapshot does not make this complete. A waiver does not either.
 */
export function registrationCompletionProjection(input: {
  complete: boolean;
  waived: boolean;
  savedSnapshotExists?: boolean;
  identitySatisfied?: boolean;
  missingRequirements?: readonly string[];
}): RegistrationCompletionProjection {
  const missing = (input.missingRequirements ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const shared = {
    missingRequirements: input.complete || input.waived ? [] : missing,
    identitySatisfied: Boolean(input.identitySatisfied),
    savedSnapshotExists: Boolean(input.savedSnapshotExists),
  };
  if (input.complete) {
    return { state: "complete", label: "Complete", detail: null, ...shared };
  }
  if (input.waived) {
    return {
      state: "waived",
      label: "Waived",
      detail: "Registration data incomplete — Waived",
      ...shared,
    };
  }
  return {
    state: "incomplete",
    label: "Incomplete",
    detail: missing.length > 0 ? missing.join("; ") : REGISTRATION_INCOMPLETE_BANNER,
    ...shared,
  };
}

/**
 * Room eligibility and housekeeping run only for a real assigned room id.
 * A missing room is a readiness blocker, not an input to the room evaluator.
 */
export async function withAssignedRoom<T>(
  roomId: string | null | undefined,
  evaluate: (roomId: string) => Promise<T>,
): Promise<T | null> {
  if (typeof roomId !== "string" || roomId.length === 0) return null;
  return evaluate(roomId);
}

/** Database and query failures stay exceptions. Business blockers do not. */
export function rethrowReadinessReadError(error: { message: string } | null | undefined): void {
  if (error) throw new Error(error.message);
}

/**
 * One readiness result for the target unit. Key stays a side section of this
 * result. `canCheckIn` is true only when `blockers` is empty. A warning does
 * not remove a blocker. Waivers clear only registration completeness, deposit,
 * and key.
 */
export function evaluateCheckInReadiness(facts: CheckInReadinessFacts): CheckInReadiness {
  if (facts.unitRequired || !facts.target) {
    const result = emptyResult();
    result.blockers = [blocker("ROOM_UNIT_REQUIRED")];
    return result;
  }

  const blockers: CheckInBlocker[] = [];
  const warnings: CheckInWarning[] = [];
  const overrides: CheckInOverride[] = [];

  if (facts.target.status !== "confirmed") {
    blockers.push(blocker("INVALID_TRANSITION"));
  }

  if (facts.registrationWaived) {
    overrides.push({
      requirement: "REGISTRATION_INCOMPLETE",
      reason: facts.registrationWaiverReason,
      actor: facts.registrationWaivedBy,
      at: facts.registrationWaivedAt,
    });
  } else if (!facts.registrationComplete) {
    blockers.push(blocker("REGISTRATION_INCOMPLETE"));
  }

  if (facts.guestFieldErrors.length > 0) {
    blockers.push(blocker("GUEST_FIELDS", facts.guestFieldErrors.join("; ")));
  }

  const identityMessages = [...facts.identityDocumentErrors, ...facts.verificationBlockers];
  if (identityMessages.length > 0) {
    blockers.push(blocker("IDENTITY_DOCUMENT", identityMessages.join("; ")));
  }
  if (facts.verificationWarnings.length > 0) {
    warnings.push({
      code: "UNVERIFIED_DOCUMENT",
      message: facts.verificationWarnings[0] ?? "Identity document is not verified.",
    });
  }

  const assigned = Boolean(facts.target.roomId);
  let eligible: boolean | null = null;
  let ready: boolean | null = null;
  if (!assigned) {
    blockers.push(blocker("ROOM_REQUIRED"));
  } else if (facts.roomEligible === false) {
    eligible = false;
    blockers.push(blocker("ROOM_NOT_ELIGIBLE"));
  } else {
    eligible = facts.roomEligible;
    ready = facts.roomReady;
    if (facts.roomReady === false) {
      blockers.push(blocker("ROOM_NOT_READY", facts.roomReadyReason ?? undefined));
    }
  }

  const deposit = facts.deposit;
  const financial = deposit
    ? {
        scope: "reservation" as const,
        requiredAmount: deposit.requiredAmount,
        receivedAmount: deposit.receivedAmount,
        outstanding: deposit.outstanding,
        satisfied: deposit.satisfied || deposit.waived,
        guaranteeMethod: deposit.guaranteeMethod,
        guaranteeSatisfied: null,
      }
    : null;
  if (deposit?.waived) {
    overrides.push({
      requirement: "DEPOSIT_REQUIRED",
      reason: deposit.waiverReason,
      actor: deposit.waiverActor,
      at: deposit.waiverAt,
    });
  } else if (deposit && !deposit.satisfied) {
    blockers.push(blocker("DEPOSIT_REQUIRED"));
  }
  if (deposit?.guaranteeMethod) {
    warnings.push({ code: "GUARANTEE_UNEVALUATED", message: GUARANTEE_UNRULED });
  }

  if (!facts.agreementVersionId) {
    blockers.push(blocker("AGREEMENT_REQUIRED"));
  } else if (!facts.agreementSigned) {
    blockers.push(blocker("SIGNATURE_REQUIRED"));
  }

  if (facts.keyWaived) {
    overrides.push({
      requirement: "KEY_REQUIRED",
      reason: facts.keyWaiverReason,
      actor: facts.keyWaivedBy,
      at: facts.keyWaivedAt,
    });
  } else if (!facts.keyRecorded) {
    blockers.push(blocker("KEY_REQUIRED"));
  }

  if (facts.earlyArrival && facts.earlyCheckInAllowed === false) {
    warnings.push({
      code: "EARLY_ARRIVAL",
      message:
        "Expected arrival is before property check-in time. Early check-in is not allowed in Settings.",
    });
  } else if (facts.earlyArrival && facts.earlyCheckInNeedsApproval) {
    warnings.push({
      code: "EARLY_ARRIVAL",
      message:
        "Expected arrival is before property check-in time. Settings require approval — there is no approval inbox yet.",
    });
  }

  return {
    target: {
      reservationRoomId: facts.target.reservationRoomId,
      guestId: facts.target.guestId,
      guestSource: facts.target.guestSource,
      status: facts.target.status,
    },
    registration: { complete: facts.registrationComplete, waived: facts.registrationWaived },
    identity: { valid: identityMessages.length === 0, warnings: facts.verificationWarnings },
    room: { assigned, eligible, ready },
    financial,
    agreement: { versionId: facts.agreementVersionId, signed: facts.agreementSigned },
    key: { recorded: facts.keyRecorded, waived: facts.keyWaived },
    blockers,
    warnings,
    overrides,
    canCheckIn: blockers.length === 0,
  };
}
