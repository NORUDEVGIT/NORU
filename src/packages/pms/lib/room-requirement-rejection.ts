/**
 * Staff wording for a room that fails a stay requirement. Kept apart from the
 * requirement read model so screens that only show a reason do not pull it in.
 * The raw evaluator codes stay internal and never reach staff.
 */

export const ACCESSIBLE_REQUIRED_REJECTION = "This stay requires an accessible room.";
export const CONNECTING_REQUIRED_REJECTION =
  "This stay requires a room with connecting-room capability.";
export const ROOM_UNIT_REQUIRED_FOR_ELIGIBILITY =
  "This reservation has several rooms. Choose which room to check.";

/* ------------------------------------------------- reservation room pairs (0213) */

export const PAIR_PARTNER_UNAVAILABLE_REJECTION =
  "No connecting room is available for the paired reservation room.";
export const PAIR_INVALID_REJECTION = "The current room pair is no longer valid.";
export const PAIR_DATES_REJECTION = "The paired reservation rooms must have overlapping stay dates.";
export const ROOM_LINK_IN_USE_REJECTION =
  "This connection is used by an active paired stay. Reassign or remove the reservation pairing first.";

/** "This room must connect to Room 302, ..." The room number is the partner's physical room. */
export function pairMismatchRejection(partnerRoomNumber?: unknown): string {
  const number = typeof partnerRoomNumber === "string" ? partnerRoomNumber.trim() : "";
  return number
    ? `This room must connect to Room ${number}, assigned to the paired reservation room.`
    : "This room must connect to the room assigned to the paired reservation room.";
}

type BlockerNote = {
  code?: string | number | boolean | null;
  partnerRoomNumber?: string | number | boolean | null;
};

const REQUIREMENT_REJECTIONS: Record<string, string> = {
  ACCESSIBILITY_MISMATCH: ACCESSIBLE_REQUIRED_REJECTION,
  CONNECTING_ROOM_REQUIRED: CONNECTING_REQUIRED_REJECTION,
  CONNECTING_PARTNER_UNAVAILABLE: PAIR_PARTNER_UNAVAILABLE_REJECTION,
  CONNECTING_PAIR_INVALID: PAIR_INVALID_REJECTION,
};

/**
 * Staff wording for a requirement or pair blocker code. Null for every other code.
 * `note` carries the partner room number a pair mismatch names.
 */
export function requirementRejectionMessage(code: unknown, note?: BlockerNote | null): string | null {
  if (code === "CONNECTING_PAIR_MISMATCH") return pairMismatchRejection(note?.partnerRoomNumber);
  return typeof code === "string" ? (REQUIREMENT_REJECTIONS[code] ?? null) : null;
}

/** First requirement or pair rejection in an evaluator blocker list, as staff wording. */
export function requirementRejectionFromBlockers(
  blockers: ReadonlyArray<BlockerNote> | null | undefined,
): string | null {
  for (const blocker of blockers ?? []) {
    const message = requirementRejectionMessage(blocker.code, blocker);
    if (message) return message;
  }
  return null;
}

/** Errors raised when a room is chosen for a unit that has an active pair (migration 0213). */
const PAIR_CHOICE_ERRORS: Record<string, string> = {
  // Without a room number this is only the fallback; a raw error that carries
  // one ("ROOM_CONNECTING_PAIR_MISMATCH[302]") is read by pairWriteErrorMessage first.
  ROOM_CONNECTING_PAIR_MISMATCH: pairMismatchRejection(),
  ROOM_CONNECTING_PAIR_INVALID: PAIR_INVALID_REJECTION,
  ROOM_CONNECTING_PARTNER_UNAVAILABLE: PAIR_PARTNER_UNAVAILABLE_REJECTION,
};

/** Domain errors raised by the final room write paths (migrations 0210 and 0213). */
export const REQUIREMENT_WRITE_ERRORS: Record<string, string> = {
  ROOM_ACCESSIBILITY_REQUIREMENT_NOT_MET: ACCESSIBLE_REQUIRED_REJECTION,
  ROOM_CONNECTING_REQUIREMENT_NOT_MET: CONNECTING_REQUIRED_REJECTION,
  ...PAIR_CHOICE_ERRORS,
};

/** Pair errors that are not about choosing a room: date changes and physical links. */
export const PAIR_WRITE_ERRORS: Record<string, string> = {
  ROOM_PAIR_STAYS_DO_NOT_OVERLAP: PAIR_DATES_REJECTION,
  ROOM_LINK_USED_BY_ACTIVE_PAIR: ROOM_LINK_IN_USE_REJECTION,
};

const PAIR_MISMATCH_WITH_ROOM = /ROOM_CONNECTING_PAIR_MISMATCH\[([^\]]{1,40})\]/;

function textOf(message: unknown): string {
  return typeof message === "string" ? message : message instanceof Error ? message.message : "";
}

/** Staff wording for a refused room choice on a paired unit, naming the partner's room when known. */
export function pairChoiceErrorMessage(message: unknown): string | null {
  const text = textOf(message);
  if (!text) return null;
  const mismatch = PAIR_MISMATCH_WITH_ROOM.exec(text);
  if (mismatch) return pairMismatchRejection(mismatch[1]);
  for (const [code, staff] of Object.entries(PAIR_CHOICE_ERRORS)) {
    if (text.includes(code) || text.includes(staff)) return staff;
  }
  return null;
}

/** Staff wording for any refused pair write: a room choice, a date change or a physical link. */
export function pairWriteErrorMessage(message: unknown): string | null {
  const choice = pairChoiceErrorMessage(message);
  if (choice) return choice;
  const text = textOf(message);
  if (!text) return null;
  for (const [code, staff] of Object.entries(PAIR_WRITE_ERRORS)) {
    if (text.includes(code) || text.includes(staff)) return staff;
  }
  return null;
}

/**
 * Staff wording when a write was refused for a stay requirement or a room pair,
 * whether the message still carries the raw code or was already mapped. Null otherwise.
 */
export function requirementRejectionFromError(message: unknown): string | null {
  const text = textOf(message);
  if (!text) return null;
  const pair = pairChoiceErrorMessage(text);
  if (pair) return pair;
  for (const [code, staff] of Object.entries(REQUIREMENT_WRITE_ERRORS)) {
    if (text.includes(code) || text.includes(staff)) return staff;
  }
  return null;
}
