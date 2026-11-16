import { ROOM_UNIT_REQUIRED_FOR_ELIGIBILITY } from "./room-requirement-rejection.ts";

/**
 * Hard room requirements captured per reservation room unit.
 *
 * Stored on `hotel_reservation_rooms`. They are stay requirements, not room
 * capability fields, and they are never inferred from special requests or from
 * guest preference text. Candidate-room evaluation reads them from the unit and
 * hands them to the canonical room evaluator.
 */

export type RoomRequirements = {
  accessibleRoomRequired: boolean;
  connectingRoomRequired: boolean;
};

/** Either value may be absent. Absent reads as off. */
export type RoomRequirementsInput = {
  accessibleRoomRequired?: boolean | undefined;
  connectingRoomRequired?: boolean | undefined;
};

export const NO_ROOM_REQUIREMENTS: RoomRequirements = {
  accessibleRoomRequired: false,
  connectingRoomRequired: false,
};

export const ROOM_REQUIREMENTS_TITLE = "Room Requirements";

export const ACCESSIBLE_ROOM_LABEL = "Accessible room required";
export const ACCESSIBLE_ROOM_HELP = "Only assign a room marked as accessible.";
export const CONNECTING_ROOM_LABEL = "Connecting room required";
export const CONNECTING_ROOM_HELP = "Only assign a room with connecting-room capability.";

export const GUEST_ACCESSIBILITY_PROMPT =
  "Guest profile has accessibility requirements. Review them before confirming whether an accessible room is required for this stay.";

/** Shown beside the hard requirements so staff can tell them from soft special requests. */
export const SOFT_REQUEST_NOTE =
  "Special requests are notes only. They do not set a room requirement.";

export const ASSIGNED_ROOM_REQUIREMENT_WARNING =
  "The currently assigned room has not been re-checked against this new requirement yet.";

type RequirementColumns = {
  accessible_room_required?: boolean | null;
  connecting_room_required?: boolean | null;
};

/** Stored value to draft value. Anything other than an explicit true is false. */
export function roomRequirementsFromRow(
  row: RequirementColumns | null | undefined,
): RoomRequirements {
  return {
    accessibleRoomRequired: row?.accessible_room_required === true,
    connectingRoomRequired: row?.connecting_room_required === true,
  };
}

/** Draft value to stored columns. Both are always written, off means false. */
export function roomRequirementColumns(requirements: RoomRequirementsInput | null | undefined): {
  accessible_room_required: boolean;
  connecting_room_required: boolean;
} {
  return {
    accessible_room_required: requirements?.accessibleRoomRequired === true,
    connecting_room_required: requirements?.connectingRoomRequired === true,
  };
}

export function roomRequirementsEqual(left: RoomRequirements, right: RoomRequirements): boolean {
  return (
    left.accessibleRoomRequired === right.accessibleRoomRequired &&
    left.connectingRoomRequired === right.connectingRoomRequired
  );
}

/**
 * The saved accessibility text, shown as context only. It is returned as
 * written. It is never parsed and never turns a requirement on.
 */
export function guestAccessibilityNote(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim();
  return trimmed ? trimmed : null;
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export type RoomRequirementChange = { item: string; before: string; after: string };

/** Only the requirements that changed. An unchanged requirement is left out. */
export function roomRequirementChanges(
  before: RoomRequirements,
  after: RoomRequirements,
): RoomRequirementChange[] {
  const changes: RoomRequirementChange[] = [];
  if (before.accessibleRoomRequired !== after.accessibleRoomRequired) {
    changes.push({
      item: ACCESSIBLE_ROOM_LABEL,
      before: yesNo(before.accessibleRoomRequired),
      after: yesNo(after.accessibleRoomRequired),
    });
  }
  if (before.connectingRoomRequired !== after.connectingRoomRequired) {
    changes.push({
      item: CONNECTING_ROOM_LABEL,
      before: yesNo(before.connectingRoomRequired),
      after: yesNo(after.connectingRoomRequired),
    });
  }
  return changes;
}

/**
 * Warn when a requirement is switched on for a unit that already holds a room.
 * This is a notice only. It does not check the room and it does not unassign it.
 */
export function assignedRoomRequirementWarning(input: {
  hasAssignedRoom: boolean;
  before: RoomRequirements;
  after: RoomRequirements;
}): string | null {
  if (!input.hasAssignedRoom) return null;
  const turnedOn =
    (!input.before.accessibleRoomRequired && input.after.accessibleRoomRequired) ||
    (!input.before.connectingRoomRequired && input.after.connectingRoomRequired);
  return turnedOn ? ASSIGNED_ROOM_REQUIREMENT_WARNING : null;
}

/**
 * Requirements for each created room unit, indexed by unit sequence - 1.
 * Room 1 reads the top-level value first, then the first unit. Every other
 * unit reads its own value. A missing value is written as an explicit false.
 */
export function resolveCreateUnitRequirements(input: {
  unitCount: number;
  room1?: RoomRequirementsInput | null;
  roomUnits?: RoomRequirementsInput[] | null;
}): RoomRequirements[] {
  const count = Math.max(1, Math.floor(input.unitCount) || 1);
  return Array.from({ length: count }, (_, index) => {
    const unit = input.roomUnits?.[index];
    const accessible =
      index === 0 && input.room1?.accessibleRoomRequired !== undefined
        ? input.room1.accessibleRoomRequired
        : unit?.accessibleRoomRequired;
    const connecting =
      index === 0 && input.room1?.connectingRoomRequired !== undefined
        ? input.room1.connectingRoomRequired
        : unit?.connectingRoomRequired;
    return {
      accessibleRoomRequired: accessible === true,
      connectingRoomRequired: connecting === true,
    };
  });
}

type RequirementWriteResult = PromiseLike<{ error: { message: string } | null }>;
type RequirementUpdateBuilder = RequirementWriteResult & {
  eq: (column: string, value: string) => RequirementUpdateBuilder;
};
/** The slice of the service-role client the Edit write needs. Only hotel_reservation_rooms is touched. */
export type RoomRequirementWriteDb = {
  from: (table: "hotel_reservation_rooms") => {
    update: (values: Record<string, boolean>) => RequirementUpdateBuilder;
  };
};

/** The service-role client, narrowed to the one RPC the create flow uses. */
export type RoomRequirementRpcDb = {
  rpc: (
    fn: "save_hotel_reservation_room_requirements",
    args: { _restaurant_id: string; _reservation_id: string; _units: unknown },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export const SAVE_ROOM_REQUIREMENTS_RPC = "save_hotel_reservation_room_requirements";

/**
 * Save the requirements of every listed unit of one existing reservation, all or none.
 *
 * Persistence is the database function `save_hotel_reservation_room_requirements`.
 * It validates every unit, then updates them in one statement inside one call, and
 * raises on any problem so nothing is partly saved. A completed call is
 * authoritative. Calling again with the same values gives the same rows. Nothing
 * here creates a reservation. Errors are logged by the caller, never shown to staff.
 */
export async function saveRoomRequirementsAtomic(
  db: RoomRequirementRpcDb,
  input: {
    restaurantId: string;
    reservationId: string;
    units: Array<{ unitSequence: number; requirements: RoomRequirements }>;
  },
): Promise<{ complete: boolean; errorMessage: string | null }> {
  if (input.units.length === 0) return { complete: false, errorMessage: "No room units." };
  const payload = input.units.map((unit) => ({
    unit_sequence: unit.unitSequence,
    accessible_room_required: unit.requirements.accessibleRoomRequired,
    connecting_room_required: unit.requirements.connectingRoomRequired,
  }));
  for (const entry of payload) {
    if (
      typeof entry.accessible_room_required !== "boolean" ||
      typeof entry.connecting_room_required !== "boolean"
    ) {
      return {
        complete: false,
        errorMessage: "Both requirement values are needed for every unit.",
      };
    }
  }
  try {
    const { data, error } = await db.rpc(SAVE_ROOM_REQUIREMENTS_RPC, {
      _restaurant_id: input.restaurantId,
      _reservation_id: input.reservationId,
      _units: payload,
    });
    if (error) return { complete: false, errorMessage: error.message };
    const result = (data ?? {}) as { reservation_id?: unknown; units_updated?: unknown };
    const confirmed =
      result.reservation_id === input.reservationId &&
      Number(result.units_updated) === payload.length;
    return confirmed
      ? { complete: true, errorMessage: null }
      : { complete: false, errorMessage: "Unexpected save result." };
  } catch (error) {
    return {
      complete: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Edit: write one room unit. Returns false when nothing changed, so no write is made. */
export async function persistUnitRoomRequirements(
  db: RoomRequirementWriteDb,
  input: {
    restaurantId: string;
    reservationId: string;
    unitId: string;
    stored: RoomRequirements;
    next: RoomRequirements;
  },
): Promise<boolean> {
  if (roomRequirementsEqual(input.stored, input.next)) return false;
  const { error } = await db
    .from("hotel_reservation_rooms")
    .update(roomRequirementColumns(input.next))
    .eq("id", input.unitId)
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId);
  if (error) throw new Error(error.message);
  return true;
}

/* ------------------------------------------------- create: recover from a failed requirement save */

export const REQUIREMENTS_INCOMPLETE_TITLE =
  "Reservation created, but room requirements could not be saved.";
export const REQUIREMENTS_INCOMPLETE_BODY =
  "The reservation exists and will not be created again. No room requirement was saved.";
export const REQUIREMENTS_RETRY_LABEL = "Retry saving requirements";
export const REQUIREMENTS_RETRY_FAILED = "Room requirements could not be saved. Try again.";
export const REQUIREMENTS_LEAVE_LABEL = "Leave without requirements";
export const REQUIREMENTS_CONTINUE_LABEL = "Continue editing";
export const REQUIREMENTS_LEAVE_TITLE = "Leave without room requirements?";
export const REQUIREMENTS_LEAVE_WARNING =
  "The reservation has been created, but its room requirements are not saved. Leaving now may allow staff to assign a room without those requirements.";

export type RoomRequirementSaveUnit = {
  unitSequence: number;
  accessibleRoomRequired: boolean;
  connectingRoomRequired: boolean;
};

export type RoomRequirementSaveFn = (input: {
  reservationId: string;
  units: RoomRequirementSaveUnit[];
}) => Promise<{ complete: boolean; reason?: string | null }>;

/**
 * A reservation that exists but whose requirements are not saved. It keeps the
 * reservation reference and the values staff chose, so a retry has everything it needs
 * and nothing ever has to create the reservation again.
 */
export type PendingRequirementSave = {
  reservationId: string;
  confirmationNumber: string;
  /** Intended values for every unit, index 0 is unit 1. Kept until the save succeeds. */
  intended: RoomRequirements[];
  /** Staff sentence when the assigned room does not meet a requirement. */
  reason?: string;
};

export function requirementUnitsToSave(intended: RoomRequirements[]): RoomRequirementSaveUnit[] {
  return intended.map((requirements, index) => ({
    unitSequence: index + 1,
    accessibleRoomRequired: requirements.accessibleRoomRequired === true,
    connectingRoomRequired: requirements.connectingRoomRequired === true,
  }));
}

/** Null when the requirements were saved. Otherwise the state to hold until a retry succeeds. */
export function pendingRequirementSave(
  created: {
    id: string;
    confirmationNumber: string;
    roomRequirements: { complete: boolean; reason?: string | null };
  },
  intended: RoomRequirements[],
): PendingRequirementSave | null {
  if (created.roomRequirements.complete) return null;
  const reason = created.roomRequirements.reason;
  return {
    reservationId: created.id,
    confirmationNumber: created.confirmationNumber,
    intended,
    ...(reason ? { reason } : {}),
  };
}

/**
 * Retry the whole requirement save on the existing reservation. The save is atomic,
 * so every unit is sent each time. A failure or thrown error leaves the pending
 * state untouched, so the intended values survive.
 */
export async function retryPendingRequirementSave(
  pending: PendingRequirementSave,
  save: RoomRequirementSaveFn,
): Promise<PendingRequirementSave | null> {
  try {
    const outcome = await save({
      reservationId: pending.reservationId,
      units: requirementUnitsToSave(pending.intended),
    });
    if (outcome.complete) return null;
    return outcome.reason ? { ...pending, reason: outcome.reason } : pending;
  } catch {
    return pending;
  }
}

/** A new reservation must not be created while an earlier one is waiting on its requirements. */
export function assertCreateAllowed(pending: PendingRequirementSave | null): void {
  if (pending) {
    throw new Error("This reservation was already created. Retry saving its room requirements.");
  }
}

/* ------------------------------------------------- eligibility: which requirement values apply */

export {
  ACCESSIBLE_REQUIRED_REJECTION,
  CONNECTING_REQUIRED_REJECTION,
  ROOM_UNIT_REQUIRED_FOR_ELIGIBILITY,
  REQUIREMENT_WRITE_ERRORS,
  requirementRejectionFromBlockers,
  requirementRejectionFromError,
  requirementRejectionMessage,
} from "./room-requirement-rejection.ts";

export type EvaluationRequirementSource =
  /** Read from the stored reservation room unit. */
  | "unit"
  /** Taken from the current in-memory draft. Create before the unit exists, or an Edit draft. */
  | "draft"
  /** No unit and no draft. Nothing is required. */
  | "none";

export type EvaluationRequirements = RoomRequirements & {
  source: EvaluationRequirementSource;
  /** The unit the values belong to, when one was resolved. Pair checks use it. */
  reservationRoomId: string | null;
};

export type EvaluationUnitRow = {
  id: string;
  accessible_room_required?: unknown;
  connecting_room_required?: unknown;
};

/**
 * The requirement values to hand the canonical evaluator for one candidate list.
 *
 * - A named unit uses that unit's stored values. A draft value, when the screen
 *   has one, replaces the stored value for that field (Edit before saving).
 * - No unit named and the reservation has one unit: that unit.
 * - No unit exists yet: the draft, else nothing is required (Create before saving).
 * - No unit named and the reservation has several: refuse. Picking one would
 *   either leak another room's requirement or drop this room's.
 *
 * Never reads guest text, special requests or preferences.
 */
export function resolveEvaluationRequirements(input: {
  units: readonly EvaluationUnitRow[];
  reservationRoomId?: string | null | undefined;
  draft?: RoomRequirementsInput | null | undefined;
}): EvaluationRequirements {
  const draft = input.draft ?? null;
  const fromDraft = (
    stored: RoomRequirements,
    source: EvaluationRequirementSource,
    unitId: string | null,
  ) => {
    const accessible = draft?.accessibleRoomRequired;
    const connecting = draft?.connectingRoomRequired;
    return {
      accessibleRoomRequired: accessible ?? stored.accessibleRoomRequired,
      connectingRoomRequired: connecting ?? stored.connectingRoomRequired,
      source: accessible !== undefined || connecting !== undefined ? "draft" : source,
      reservationRoomId: unitId,
    } satisfies EvaluationRequirements;
  };

  let unit: EvaluationUnitRow | undefined;
  if (input.reservationRoomId) {
    unit = input.units.find((row) => row.id === input.reservationRoomId);
    if (!unit) throw new Error("Reservation room was not found.");
  } else if (input.units.length === 1) {
    unit = input.units[0];
  } else if (input.units.length > 1) {
    throw new Error(ROOM_UNIT_REQUIRED_FOR_ELIGIBILITY);
  }

  if (!unit) return fromDraft(NO_ROOM_REQUIREMENTS, "none", null);
  return fromDraft(roomRequirementsFromRow(unit as RequirementColumns), "unit", unit.id);
}

type EvaluationReadBuilder = PromiseLike<{
  data: unknown;
  error: { message: string; code?: string } | null;
}> & {
  eq: (column: string, value: string) => EvaluationReadBuilder;
};

/** The slice of a client the requirement read needs. Only hotel_reservation_rooms is read. */
export type RoomRequirementReadDb = {
  from: (table: "hotel_reservation_rooms") => {
    select: (columns: string) => EvaluationReadBuilder;
  };
};

/**
 * Load the stored requirements that apply to a candidate-room evaluation and
 * resolve them. `reservationId` and `reservationRoomId` are always scoped to the
 * property. With neither, the draft (or nothing) applies.
 */
export async function loadEvaluationRequirements(
  db: RoomRequirementReadDb,
  input: {
    restaurantId: string;
    reservationId?: string | null | undefined;
    reservationRoomId?: string | null | undefined;
    draft?: RoomRequirementsInput | null | undefined;
  },
): Promise<EvaluationRequirements> {
  if (!input.reservationId && !input.reservationRoomId) {
    return resolveEvaluationRequirements({ units: [], draft: input.draft });
  }
  let query = db
    .from("hotel_reservation_rooms")
    .select("id, accessible_room_required, connecting_room_required")
    .eq("restaurant_id", input.restaurantId);
  if (input.reservationId) query = query.eq("reservation_id", input.reservationId);
  if (input.reservationRoomId) query = query.eq("id", input.reservationRoomId);
  const { data, error } = await query;
  if (error) {
    // A database that predates the requirement columns has nothing stored.
    if (/accessible_room_required|connecting_room_required|schema cache/i.test(error.message)) {
      return resolveEvaluationRequirements({ units: [], draft: input.draft });
    }
    throw new Error(error.message);
  }
  return resolveEvaluationRequirements({
    units: (data ?? []) as EvaluationUnitRow[],
    reservationRoomId: input.reservationRoomId,
    draft: input.draft,
  });
}

/**
 * Which fields of an ad hoc Eligibility check differ from the stored requirement.
 * The check never writes back. This only drives the "override" labels.
 */
export function requirementOverrides(
  stored: RoomRequirements,
  current: { accessibleRequired: boolean; connectingRequired: boolean },
): { accessible: boolean; connecting: boolean; any: boolean } {
  const accessible = current.accessibleRequired !== stored.accessibleRoomRequired;
  const connecting = current.connectingRequired !== stored.connectingRoomRequired;
  return { accessible, connecting, any: accessible || connecting };
}
