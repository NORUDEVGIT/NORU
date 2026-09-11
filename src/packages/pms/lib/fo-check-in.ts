/**
 * FO-FS1 — Check-in stepper gating (pure).
 *
 * Policy A: deposit must be posted on the Cashiering folio or waived.
 * Registration and key are the same shape: complete/record or supervisor waiver.
 */

export const CHECK_IN_STEPS = ["stay", "registration", "deposit", "key", "complete"] as const;
export type CheckInStepId = (typeof CHECK_IN_STEPS)[number];

export const CHECK_IN_STEP_META: { id: CheckInStepId; letter: string; label: string }[] = [
  { id: "stay", letter: "A", label: "Stay & room" },
  { id: "registration", letter: "B", label: "Registration" },
  { id: "deposit", letter: "C", label: "Deposit" },
  { id: "key", letter: "D", label: "Key" },
  { id: "complete", letter: "E", label: "Complete" },
];

export const WALK_IN_CONTINUE_STEP: CheckInStepId = "registration";

export const ID_DOCUMENT_TYPES = ["passport", "national_id", "driving_licence", "other"] as const;
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number];

export const ID_DOCUMENT_LABELS: Record<IdDocumentType, string> = {
  passport: "Passport",
  national_id: "National ID",
  driving_licence: "Driving licence",
  other: "Other",
};

export const KEY_ACCESS_TYPES = ["physical_key", "key_card", "mobile_code", "other"] as const;
export type KeyAccessType = (typeof KEY_ACCESS_TYPES)[number];

export const KEY_ACCESS_LABELS: Record<KeyAccessType, string> = {
  physical_key: "Physical key",
  key_card: "Key card",
  mobile_code: "Mobile code",
  other: "Other",
};

export const DEPOSIT_METHOD_CHIPS = [
  { id: "cash", label: "Cash", ledger: "cash" },
  { id: "card", label: "Card", ledger: "card" },
  { id: "transfer", label: "Transfer", ledger: "bank_transfer" },
  { id: "other", label: "Other", ledger: "other" },
] as const;

export type DepositMethodChipId = (typeof DEPOSIT_METHOD_CHIPS)[number]["id"];
export type DepositLedgerMethod = (typeof DEPOSIT_METHOD_CHIPS)[number]["ledger"];

export const REGISTRATION_INCOMPLETE_BANNER = "Complete registration or request a waiver.";
export const DEPOSIT_REQUIRED_BANNER = "Deposit required before check-in can finish.";
export const CASHIER_SHIFT_REQUIRED_MESSAGE = "Open a cashier shift to post.";
export const WALK_IN_INCOMPLETE_BANNER = "Walk-in incomplete — finish check-in";

export type RoomReadiness = {
  status: string | null;
  housekeepingStatus: string | null;
};

export type RegistrationDraft = {
  fullName: string;
  phone: string | null;
  email: string | null;
  idDocumentType: IdDocumentType | null;
  idDocumentNumber: string | null;
  idDocumentExpiry?: string | null;
};

export type StepRailState = "done" | "current" | "locked" | "blocked";

export function mapDepositMethod(chipId: string): DepositLedgerMethod {
  const chip = DEPOSIT_METHOD_CHIPS.find((c) => c.id === chipId);
  return chip?.ledger ?? "other";
}

export function isRoomReady(room: RoomReadiness | null): { ready: boolean; reason: string | null } {
  if (!room || !room.status) {
    return { ready: false, reason: "Assign a room before continuing." };
  }
  if (room.status === "out_of_order") {
    return { ready: false, reason: "This room is out of order and cannot be used for check-in." };
  }
  if (room.status === "out_of_service") {
    return { ready: false, reason: "This room is out of service and cannot be used for check-in." };
  }
  if (room.status !== "available") {
    return { ready: false, reason: "This room is not available." };
  }
  const hk = room.housekeepingStatus ?? "";
  if (hk === "dirty") {
    return { ready: false, reason: "This room is dirty. Housekeeping must clean it before check-in." };
  }
  if (hk === "pickup") {
    return { ready: false, reason: "This room is on pickup. It is not ready for check-in." };
  }
  if (hk === "clean" || hk === "inspected") {
    return { ready: true, reason: null };
  }
  return { ready: false, reason: "Housekeeping has not marked this room clean or inspected." };
}

export function isRegistrationComplete(draft: RegistrationDraft): boolean {
  const name = draft.fullName.trim();
  const phone = (draft.phone ?? "").trim();
  const email = (draft.email ?? "").trim();
  const idType = draft.idDocumentType;
  const idNumber = (draft.idDocumentNumber ?? "").trim();
  return name.length > 0 && (phone.length > 0 || email.length > 0) && !!idType && idNumber.length > 0;
}

export function canContinueRegistration(draft: RegistrationDraft, waived: boolean): boolean {
  return waived || isRegistrationComplete(draft);
}

export function isDepositSatisfied(input: {
  postedAmount: number;
  waived: boolean;
  requiredAmount?: number | null;
}): boolean {
  if (input.waived) return true;
  const posted = Number.isFinite(input.postedAmount) ? input.postedAmount : 0;
  if (posted <= 0) return false;
  const required = input.requiredAmount ?? 0;
  if (required > 0) return posted + 1e-9 >= required;
  return true;
}

export function canContinueDeposit(input: {
  postedAmount: number;
  waived: boolean;
  requiredAmount?: number | null;
}): boolean {
  return isDepositSatisfied(input);
}

export function canCompleteDeposit(input: {
  postedAmount: number;
  waived: boolean;
  requiredAmount?: number | null;
}): boolean {
  return isDepositSatisfied(input);
}

export function isKeyRecorded(input: { accessType: string | null; identifier: string | null }): boolean {
  return Boolean((input.accessType ?? "").trim() && (input.identifier ?? "").trim());
}

export function canContinueKey(input: {
  accessType: string | null;
  identifier: string | null;
  waived: boolean;
}): boolean {
  return input.waived || isKeyRecorded(input);
}

export function canCompleteCheckIn(input: {
  roomReady: boolean;
  registrationOk: boolean;
  depositOk: boolean;
  keyOk: boolean;
}): boolean {
  return input.roomReady && input.registrationOk && input.depositOk && input.keyOk;
}

export function walkInContinueStep(): CheckInStepId {
  return WALK_IN_CONTINUE_STEP;
}

export function stepRailState(
  stepIndex: number,
  currentIndex: number,
  currentBlocked: boolean,
): StepRailState {
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return currentBlocked ? "blocked" : "current";
  return "locked";
}

export function mapCashierShiftError(message: string): string {
  if (/shift/i.test(message)) return CASHIER_SHIFT_REQUIRED_MESSAGE;
  return message;
}

export function promptPassportExpiry(idType: IdDocumentType | null, expiry: string | null | undefined): boolean {
  return idType === "passport" && !(expiry ?? "").trim();
}

