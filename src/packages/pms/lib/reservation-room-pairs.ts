/**
 * Reservation room pairs for connecting-room stays.
 *
 * A pair says that two reservation room units should take rooms that connect
 * to each other. It is staff intent stored on `hotel_reservation_room_pairs`.
 * Candidate filtering lives in room-pair-eligibility.ts and final enforcement in
 * the database (migration 0213). A pair never claims that physical rooms are
 * connected; that lives on the room links.
 *
 * Rules kept here and in the database:
 * - one partner per room unit, pairs only;
 * - both units of a pair have "Connecting room required" on;
 * - removing a pair asks, per unit, whether that requirement stays;
 * - an unpaired "Connecting room required" keeps its capability-only meaning.
 */

import { PAIR_PARTNER_UNAVAILABLE_REJECTION } from "./room-requirement-rejection";

export const CONNECTS_TO_LABEL = "Connects to";
export const CONNECTS_TO_NONE = "Not paired";
export const CONNECTING_PAIR_TITLE = "Connecting pair";
export const CONNECTING_PAIR_NOTE = "Reservation rooms paired for connecting-room assignment.";
export const PAIRED_REQUIREMENT_LOCK_NOTE =
  "This room is paired for connecting rooms. Remove the pairing to turn the requirement off.";

export const REMOVE_PAIR_TURN_OFF_LABEL = "Remove pairing and turn off connecting requirement";
export const REMOVE_PAIR_KEEP_LABEL = "Remove pairing but keep connecting requirement";

export const SAVE_ROOM_PAIR_RPC = "save_hotel_reservation_room_pair";
export const REMOVE_ROOM_PAIR_RPC = "remove_hotel_reservation_room_pair";
export const SAVE_ROOMING_PAIR_RPC = "save_pms_group_rooming_pair";

export function pairedWithText(partnerLabel: string): string {
  return `Paired with ${partnerLabel}`;
}

export function connectingPairLine(label: string): string {
  return `${CONNECTING_PAIR_TITLE}: ${label}`;
}

export function removePairConfirmText(unitLabel: string, partnerLabel: string): string {
  return `Remove the connection between ${unitLabel} and ${partnerLabel}?`;
}

export function changePairConfirmText(
  unitLabel: string,
  currentPartnerLabel: string,
  nextPartnerLabel: string,
): string {
  return `Pair ${unitLabel} with ${nextPartnerLabel} instead of ${currentPartnerLabel}?`;
}

/** "Room 2 · Deluxe King · 2 adults". Children are added only when present. */
export function pairUnitOptionLabel(input: {
  unitSequence: number;
  roomTypeName?: string | null;
  adults: number;
  children?: number | null;
  confirmationNumber?: string | null;
}): string {
  const room = input.confirmationNumber
    ? `Room ${input.unitSequence} (${input.confirmationNumber})`
    : `Room ${input.unitSequence}`;
  const guests = [`${input.adults} ${input.adults === 1 ? "adult" : "adults"}`];
  const children = input.children ?? 0;
  if (children > 0) guests.push(`${children} ${children === 1 ? "child" : "children"}`);
  return [room, input.roomTypeName?.trim() || null, guests.join(", ")]
    .filter(Boolean)
    .join(" · ");
}

/* ------------------------------------------------------------------ errors */

const PAIR_ERRORS = {
  ROOM_PAIR_SELF: "A room cannot be paired with itself.",
  ROOM_PAIR_EXISTS: "These rooms are already paired.",
  ROOM_PAIR_UNIT_ALREADY_PAIRED: "This room is already paired with another room.",
  ROOM_PAIR_PARTNER_ALREADY_PAIRED: "The selected room is already paired with another room.",
  ROOM_PAIR_STAYS_DO_NOT_OVERLAP: "These rooms do not stay on the same nights.",
  ROOM_PAIR_UNIT_NOT_ACTIVE: "A cancelled, no-show or checked-out room cannot be paired.",
  ROOM_PAIR_NOT_RELATED:
    "Only rooms on the same reservation or on reservations of the same group can be paired.",
  ROOM_PAIR_REQUIRES_CONNECTING:
    "A paired room keeps its connecting-room requirement. Remove the pairing first.",
  ROOM_PAIR_NOT_FOUND: "This pairing no longer exists. Refresh and try again.",
  ROOM_PAIR_DECISION_REQUIRED: "Choose whether to keep the connecting requirement.",
  ROOM_UNIT_NOT_FOUND: "One of these rooms was not found on this property.",
  ROOM_CONNECTING_REQUIREMENT_NOT_MET:
    "A room already assigned here does not have connecting-room capability. Change the room assignment first.",
  // Saving a pair over rooms that are already assigned (migration 0213).
  ROOM_CONNECTING_PAIR_INVALID:
    "The rooms already assigned to these two reservation rooms are not connected. Change a room assignment first.",
  ROOM_CONNECTING_PAIR_MISMATCH:
    "The room assigned here does not connect to the paired reservation room. Change the room assignment first.",
  ROOM_CONNECTING_PARTNER_UNAVAILABLE: PAIR_PARTNER_UNAVAILABLE_REJECTION,
  ROOMING_PAIR_SELF: "A rooming row cannot be paired with itself.",
  ROOMING_ROW_NOT_FOUND: "This rooming row was not found in the group.",
  ROOMING_PAIR_PARTNER_ALREADY_PAIRED: "The selected guest is already paired with another row.",
} as const satisfies Record<string, string>;

const PAIR_FALLBACK = "The connecting pair could not be saved. Try again.";

/** Staff wording for a pairing failure. Raw database codes never reach staff. */
export function roomPairErrorMessage(message: unknown): string {
  const text =
    typeof message === "string" ? message : message instanceof Error ? message.message : "";
  for (const [code, staff] of Object.entries(PAIR_ERRORS)) {
    if (text.includes(code) || text === staff) return staff;
  }
  return PAIR_FALLBACK;
}

/* ------------------------------------------------------------------ create draft */

/** Partner by draft unit reference. Always symmetric: partners[a] === b iff partners[b] === a. */
export type DraftPairs = Readonly<Record<string, string>>;

export type DraftPairUnit = {
  ref: string;
  unitSequence: number;
  label: string;
};

export const ROOM1_PAIR_REF = "room-1";

/** Drop pairs that touch a unit no longer in the draft, and any one-sided entry. */
export function pruneDraftPairs(pairs: DraftPairs, refs: readonly string[]): DraftPairs {
  const present = new Set(refs);
  const next: Record<string, string> = {};
  for (const [ref, partner] of Object.entries(pairs)) {
    if (ref === partner) continue;
    if (!present.has(ref) || !present.has(partner)) continue;
    if (pairs[partner] !== ref) continue;
    next[ref] = partner;
  }
  return next;
}

/**
 * Pair `ref` with `partner`, or unpair it with null. Any earlier partner of
 * either unit is released first, so a unit never holds two partners.
 */
export function setDraftPartner(
  pairs: DraftPairs,
  ref: string,
  partner: string | null,
): DraftPairs {
  const next: Record<string, string> = { ...pairs };
  const release = (unit: string) => {
    const current = next[unit];
    if (current !== undefined) {
      delete next[current];
      delete next[unit];
    }
  };
  release(ref);
  if (partner === null || partner === ref) return next;
  release(partner);
  next[ref] = partner;
  next[partner] = ref;
  return next;
}

/** Choices for one unit: every other unit that is not already paired elsewhere. */
export function draftPartnerOptions(
  units: readonly DraftPairUnit[],
  pairs: DraftPairs,
  ref: string,
): DraftPairUnit[] {
  return units.filter((unit) => {
    if (unit.ref === ref) return false;
    const partner = pairs[unit.ref];
    return partner === undefined || partner === ref;
  });
}

export type RoomPairSequence = { unitSequenceA: number; unitSequenceB: number };

/** Draft pairs to unit sequences, each pair once with the lower sequence first. */
export function draftPairsToSequences(
  units: readonly DraftPairUnit[],
  pairs: DraftPairs,
): RoomPairSequence[] {
  const sequenceOf = new Map(units.map((unit) => [unit.ref, unit.unitSequence]));
  const seen = new Set<string>();
  const out: RoomPairSequence[] = [];
  for (const [ref, partner] of Object.entries(pruneDraftPairs(pairs, [...sequenceOf.keys()]))) {
    const a = sequenceOf.get(ref)!;
    const b = sequenceOf.get(partner)!;
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ unitSequenceA: Math.min(a, b), unitSequenceB: Math.max(a, b) });
  }
  return out.sort((x, y) => x.unitSequenceA - y.unitSequenceA);
}

/** Refs of every unit in an intended pair. Their connecting requirement must stay on. */
export function pairedRefs(pairs: DraftPairs): Set<string> {
  return new Set(Object.keys(pairs));
}

/** Throws when a pair list repeats a unit or pairs a unit with itself. */
export function assertValidPairSequences(pairs: readonly RoomPairSequence[], unitCount: number) {
  const used = new Set<number>();
  for (const pair of pairs) {
    if (pair.unitSequenceA === pair.unitSequenceB) throw new Error(PAIR_ERRORS.ROOM_PAIR_SELF);
    for (const sequence of [pair.unitSequenceA, pair.unitSequenceB]) {
      if (sequence < 1 || sequence > unitCount) throw new Error(PAIR_ERRORS.ROOM_UNIT_NOT_FOUND);
      if (used.has(sequence)) throw new Error(PAIR_ERRORS.ROOM_PAIR_UNIT_ALREADY_PAIRED);
      used.add(sequence);
    }
  }
}

/* ------------------------------------------------------------------ create recovery */

export const PAIRS_INCOMPLETE_TITLE = "Reservation created, but the connecting pair could not be saved.";
export const PAIRS_INCOMPLETE_BODY =
  "The reservation exists and will not be created again. The rooms are not paired yet.";
export const PAIRS_RETRY_LABEL = "Retry saving pairing";
export const PAIRS_LEAVE_LABEL = "Leave without pairing";
export const PAIRS_LEAVE_WARNING =
  "The rooms are not paired. Set the pairing from Edit Reservation before assigning rooms.";

export type RoomPairSaveOutcome = { complete: boolean; reason?: string | null };

export type PendingPairSave = {
  reservationId: string;
  confirmationNumber: string;
  /** Intended pairs by unit sequence. Kept until every pair is saved. */
  pairs: RoomPairSequence[];
  reason?: string;
};

export type RoomPairSaveFn = (input: {
  reservationId: string;
  pairs: RoomPairSequence[];
}) => Promise<RoomPairSaveOutcome>;

/** Null when nothing was intended or every pair saved. Otherwise the state to hold. */
export function pendingPairSave(
  created: { id: string; confirmationNumber: string; roomPairs?: RoomPairSaveOutcome | null },
  intended: RoomPairSequence[],
): PendingPairSave | null {
  if (intended.length === 0) return null;
  if (created.roomPairs?.complete === true) return null;
  const reason = created.roomPairs?.reason;
  return {
    reservationId: created.id,
    confirmationNumber: created.confirmationNumber,
    pairs: intended,
    ...(reason ? { reason } : {}),
  };
}

/** Retry every intended pair on the existing reservation. A failure keeps the pending state. */
export async function retryPendingPairSave(
  pending: PendingPairSave,
  save: RoomPairSaveFn,
): Promise<PendingPairSave | null> {
  try {
    const outcome = await save({ reservationId: pending.reservationId, pairs: pending.pairs });
    if (outcome.complete) return null;
    return outcome.reason ? { ...pending, reason: outcome.reason } : pending;
  } catch (error) {
    return { ...pending, reason: roomPairErrorMessage(error) };
  }
}

/* ------------------------------------------------------------------ database */

type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
type SelectBuilder = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  eq: (column: string, value: string) => SelectBuilder;
  in: (column: string, values: readonly string[]) => SelectBuilder;
  is: (column: string, value: null) => SelectBuilder;
  or: (filter: string) => SelectBuilder;
};

/** The slice of the service-role client the pair writes need. */
export type RoomPairDb = {
  rpc: (fn: string, args: Record<string, unknown>) => RpcResult;
  from: (table: string) => { select: (columns: string) => SelectBuilder };
};

/**
 * Save the intended pairs of one existing reservation, by unit sequence.
 * Each pair is one atomic database call and saving an existing pair is a
 * no-op, so a retry after a partial failure finishes the rest. Nothing here
 * creates a reservation. Errors are logged by the caller, never shown raw.
 */
export async function saveRoomPairsBySequence(
  db: RoomPairDb,
  input: {
    restaurantId: string;
    reservationId: string;
    actorMembershipId: string | null;
    pairs: readonly RoomPairSequence[];
  },
): Promise<{ complete: boolean; errorMessage: string | null }> {
  if (input.pairs.length === 0) return { complete: true, errorMessage: null };
  try {
    const { data, error } = await db
      .from("hotel_reservation_rooms")
      .select("id, unit_sequence")
      .eq("restaurant_id", input.restaurantId)
      .eq("reservation_id", input.reservationId);
    if (error) return { complete: false, errorMessage: error.message };
    const bySequence = new Map(
      ((data ?? []) as Array<{ id: string; unit_sequence: number }>).map((row) => [
        Number(row.unit_sequence),
        row.id,
      ]),
    );
    for (const pair of input.pairs) {
      const unitId = bySequence.get(pair.unitSequenceA);
      const partnerId = bySequence.get(pair.unitSequenceB);
      if (!unitId || !partnerId) return { complete: false, errorMessage: "ROOM_UNIT_NOT_FOUND" };
      const saved = await db.rpc(SAVE_ROOM_PAIR_RPC, {
        _restaurant_id: input.restaurantId,
        _unit_id: unitId,
        _partner_unit_id: partnerId,
        _actor_membership_id: input.actorMembershipId,
      });
      if (saved.error) return { complete: false, errorMessage: saved.error.message };
    }
    return { complete: true, errorMessage: null };
  } catch (error) {
    return { complete: false, errorMessage: error instanceof Error ? error.message : String(error) };
  }
}

export type RoomingPairRow = {
  id: string;
  reservation_id: string | null;
  connecting_partner_row_id: string | null;
};

/**
 * When a rooming row and its partner both have reservations, pair their first
 * active room units. The pair RPC checks that both reservations belong to the
 * group. Returns whether a pair now exists (or nothing was due).
 */
export async function carryRoomingPairToReservations(
  db: RoomPairDb,
  input: {
    restaurantId: string;
    groupId: string;
    rowId: string;
    actorMembershipId: string | null;
  },
): Promise<{ complete: boolean; errorMessage: string | null }> {
  const rows = await db
    .from("pms_group_rooming_rows")
    .select("id, reservation_id, connecting_partner_row_id")
    .eq("restaurant_id", input.restaurantId)
    .eq("group_id", input.groupId);
  if (rows.error) {
    // Before the pairing schema exists no row can hold pairing intent.
    if (/connecting_partner_row_id|schema cache/i.test(rows.error.message)) {
      return { complete: true, errorMessage: null };
    }
    return { complete: false, errorMessage: rows.error.message };
  }
  const list = (rows.data ?? []) as RoomingPairRow[];
  const row = list.find((item) => item.id === input.rowId);
  const partner = row?.connecting_partner_row_id
    ? list.find((item) => item.id === row.connecting_partner_row_id)
    : undefined;
  if (!row?.reservation_id || !partner?.reservation_id) return { complete: true, errorMessage: null };

  const units = await db
    .from("hotel_reservation_rooms")
    .select("id, reservation_id, unit_sequence, status")
    .eq("restaurant_id", input.restaurantId)
    .in("reservation_id", [row.reservation_id, partner.reservation_id]);
  if (units.error) return { complete: false, errorMessage: units.error.message };
  const firstActive = (reservationId: string) =>
    ((units.data ?? []) as Array<{ id: string; reservation_id: string; unit_sequence: number; status: string }>)
      .filter(
        (unit) =>
          unit.reservation_id === reservationId &&
          !["cancelled", "no_show", "checked_out"].includes(unit.status),
      )
      .sort((a, b) => a.unit_sequence - b.unit_sequence)[0];
  const unit = firstActive(row.reservation_id);
  const partnerUnit = firstActive(partner.reservation_id);
  if (!unit || !partnerUnit) return { complete: false, errorMessage: "ROOM_PAIR_UNIT_NOT_ACTIVE" };
  const saved = await db.rpc(SAVE_ROOM_PAIR_RPC, {
    _restaurant_id: input.restaurantId,
    _unit_id: unit.id,
    _partner_unit_id: partnerUnit.id,
    _actor_membership_id: input.actorMembershipId,
  });
  if (saved.error) return { complete: false, errorMessage: saved.error.message };
  return { complete: true, errorMessage: null };
}

/* ------------------------------------------------------------------ read model */

export type ReservationPairUnit = {
  id: string;
  reservationId: string;
  unitSequence: number;
  status: string;
  roomTypeName: string | null;
  adults: number;
  children: number;
  confirmationNumber: string | null;
  /** True when the unit is on the reservation being viewed. */
  own: boolean;
};

export type ReservationPairView = {
  pairId: string;
  unitAId: string;
  unitBId: string;
  label: string;
};

/** Short label for a unit. Units on another reservation carry its confirmation number. */
export function pairUnitShortLabel(unit: Pick<ReservationPairUnit, "unitSequence" | "confirmationNumber" | "own">): string {
  return unit.own || !unit.confirmationNumber
    ? `Room ${unit.unitSequence}`
    : `Room ${unit.unitSequence} (${unit.confirmationNumber})`;
}

/** "Room 1 ↔ Room 2" for the viewer. Own units come first. */
export function pairLabelFor(
  pair: Pick<ReservationPairView, "unitAId" | "unitBId">,
  units: readonly ReservationPairUnit[],
): string {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const a = byId.get(pair.unitAId);
  const b = byId.get(pair.unitBId);
  if (!a || !b) return "Paired rooms";
  const [first, second] = [a, b].sort(
    (x, y) => Number(y.own) - Number(x.own) || x.unitSequence - y.unitSequence,
  ) as [ReservationPairUnit, ReservationPairUnit];
  return `${pairUnitShortLabel(first)} ↔ ${pairUnitShortLabel(second)}`;
}

/** The active pair of a unit and its partner, if any. */
export function pairForUnit(
  unitId: string,
  pairs: readonly ReservationPairView[],
): { pair: ReservationPairView; partnerId: string } | null {
  for (const pair of pairs) {
    if (pair.unitAId === unitId) return { pair, partnerId: pair.unitBId };
    if (pair.unitBId === unitId) return { pair, partnerId: pair.unitAId };
  }
  return null;
}

/** Edit choices for one unit: other active units not already paired elsewhere. */
export function savedPartnerOptions(
  unitId: string,
  units: readonly ReservationPairUnit[],
  pairs: readonly ReservationPairView[],
): ReservationPairUnit[] {
  const current = pairForUnit(unitId, pairs)?.partnerId ?? null;
  return units.filter((unit) => {
    if (unit.id === unitId) return false;
    if (["cancelled", "no_show", "checked_out"].includes(unit.status)) return false;
    const other = pairForUnit(unit.id, pairs);
    return !other || unit.id === current;
  });
}

/** Rooming list choices for one row: other rows of the group not paired elsewhere. */
export function roomingPartnerOptions<
  Row extends { id: string; connecting_partner_row_id?: string | null },
>(rows: readonly Row[], rowId: string): Row[] {
  return rows.filter(
    (row) =>
      row.id !== rowId &&
      (row.connecting_partner_row_id == null || row.connecting_partner_row_id === rowId),
  );
}
