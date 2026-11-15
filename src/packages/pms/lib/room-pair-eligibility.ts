/**
 * Pair-aware candidate eligibility.
 *
 * A reservation room unit that is paired for connecting rooms may only take a
 * room that connects to its partner's room, or, while the partner has no room
 * yet, a room that has at least one connecting room the partner could take.
 * The database function `pms_evaluate_room_pairing` is the single source of
 * that rule and the final write paths enforce it. This module only asks it
 * about candidate rooms so Assign Room, Check-in and Move Room do not offer a
 * room the write would refuse. Filtering here is advisory.
 *
 * Capability, room type, occupancy, housekeeping, maintenance, blocks and
 * accessibility stay in `pms_evaluate_room_assignment`. Nothing here repeats them.
 */
import {
  isMissingRpcFunction,
  type AssignmentEligibilityNote,
  type AssignmentEligibilityResult,
  type AssignmentPairContext,
  type RpcErrorLike,
  type UntypedRpcClient,
} from "./room-inventory-compat";

export const PAIR_EVALUATOR_RPC = "pms_evaluate_room_pairing";
const PAIR_TABLE = "hotel_reservation_room_pairs";

export const PAIR_CHECK_FAILED_MESSAGE = "The room pairing could not be checked. Try again.";

type PairLookupResult = { data: unknown; error: RpcErrorLike | null };

/** The slice of the admin client this module needs: the pair table read and the evaluator RPC. */
export type PairEligibilityDb = UntypedRpcClient & {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        is: (column: string, value: null) => {
          or: (filter: string) => {
            limit: (count: number) => PromiseLike<PairLookupResult>;
          };
        };
      };
    };
  };
};

export type PairVerdict = {
  paired: boolean;
  enforced: boolean;
  eligible: boolean;
  blockers: AssignmentEligibilityNote[];
  pairing: AssignmentPairContext | null;
};

export type PairAwareEvaluator = (
  roomId: string,
  base: AssignmentEligibilityResult,
) => Promise<AssignmentEligibilityResult>;

const PASS_THROUGH: PairAwareEvaluator = async (_roomId, base) => base;

function isMissingPairSchema(error: RpcErrorLike | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /hotel_reservation_room_pairs/i.test(
    [error.message, error.details, error.hint].filter(Boolean).join(" "),
  ) && /does not exist|schema cache|could not find/i.test(error.message ?? "");
}

/** "Room 2", or "Room 2 (CONF-1)" when the partner belongs to another reservation. */
export function pairPartnerLabel(input: {
  unitSequence: number;
  confirmationNumber?: string | null;
  sameReservation: boolean;
}): string {
  const confirmation = input.confirmationNumber?.trim();
  return !input.sameReservation && confirmation
    ? `Room ${input.unitSequence} (${confirmation})`
    : `Room ${input.unitSequence}`;
}

function record(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

function blockerNotes(value: unknown): AssignmentEligibilityNote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    if (!row) return [];
    const note: AssignmentEligibilityNote = {};
    for (const [key, entry] of Object.entries(row)) {
      if (
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean" ||
        entry === null
      ) {
        note[key] = entry;
      }
    }
    return [note];
  });
}

function parseVerdict(data: unknown): PairVerdict | null {
  const row = record(data);
  if (!row || !("eligible" in row)) return null;
  const partner = record(row["partner"]);
  const sequence = typeof partner?.["partnerUnitSequence"] === "number" ? partner["partnerUnitSequence"] : null;
  const partnerRoomNumber =
    typeof partner?.["partnerRoomNumber"] === "string" ? partner["partnerRoomNumber"] : null;
  const confirmation =
    typeof partner?.["partnerConfirmationNumber"] === "string"
      ? partner["partnerConfirmationNumber"]
      : null;
  return {
    paired: row["paired"] === true,
    enforced: row["enforced"] === true,
    eligible: row["eligible"] === true,
    blockers: blockerNotes(row["blockers"]),
    pairing:
      row["paired"] === true && sequence !== null
        ? {
            partnerLabel: pairPartnerLabel({
              unitSequence: sequence,
              confirmationNumber: confirmation,
              sameReservation: partner?.["sameReservation"] !== false,
            }),
            partnerRoomNumber,
            partnerAssigned: partnerRoomNumber !== null,
            enforced: row["enforced"] === true,
          }
        : null,
  };
}

/** Applies a pair verdict on top of the base eligibility. The base blockers stay first. */
export function mergePairVerdict(
  base: AssignmentEligibilityResult,
  verdict: PairVerdict,
): AssignmentEligibilityResult {
  if (!verdict.paired) return base;
  const merged: AssignmentEligibilityResult = {
    ...base,
    eligible: base.eligible && verdict.eligible,
    blockers: [...base.blockers, ...verdict.blockers],
  };
  if (verdict.pairing) merged.pairing = verdict.pairing;
  return merged;
}

export type PairVerdictInput = {
  restaurantId: string;
  reservationRoomId: string;
  roomId: string;
  /**
   * Judge the room against a partner room other than the one the partner holds
   * now. `null` means the partner holds no room. Used before a swap commits.
   */
  partnerRoomId?: string | null | undefined;
  usePartnerRoom?: boolean;
};

/**
 * Asks the database whether a room satisfies the unit's pair. Returns null when
 * the evaluator is not installed yet, so the caller keeps its base result.
 */
export async function evaluatePairVerdict(
  db: UntypedRpcClient,
  input: PairVerdictInput,
): Promise<PairVerdict | null> {
  const usePartner = input.usePartnerRoom === true;
  const { data, error } = await db.rpc(PAIR_EVALUATOR_RPC, {
    _restaurant_id: input.restaurantId,
    _reservation_room_id: input.reservationRoomId,
    _candidate_room_id: input.roomId,
    _partner_room_id: usePartner ? (input.partnerRoomId ?? null) : null,
    _use_partner_room: usePartner,
  });
  if (error) {
    if (isMissingRpcFunction(error, PAIR_EVALUATOR_RPC)) return null;
    throw new Error(PAIR_CHECK_FAILED_MESSAGE);
  }
  const verdict = parseVerdict(data);
  if (!verdict) throw new Error(PAIR_CHECK_FAILED_MESSAGE);
  return verdict;
}

/** True when the unit has an active pair. False when pairs are not installed yet. */
export async function unitHasActivePair(
  db: PairEligibilityDb,
  input: { restaurantId: string; reservationRoomId: string },
): Promise<boolean> {
  const { data, error } = await db
    .from(PAIR_TABLE)
    .select("id")
    .eq("restaurant_id", input.restaurantId)
    .is("ended_at", null)
    .or(`unit_a_id.eq.${input.reservationRoomId},unit_b_id.eq.${input.reservationRoomId}`)
    .limit(1);
  if (error) {
    if (isMissingPairSchema(error)) return false;
    throw new Error(PAIR_CHECK_FAILED_MESSAGE);
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * One evaluator per reservation room unit. An unpaired unit, or no unit at all,
 * gets the pass-through, so unpaired stays keep the capability-only behavior and
 * the list paths pay for a single pair lookup, not one per candidate room.
 */
export async function createPairAwareEvaluator(
  db: PairEligibilityDb,
  input: { restaurantId: string; reservationRoomId: string | null | undefined },
): Promise<PairAwareEvaluator> {
  const reservationRoomId = input.reservationRoomId;
  if (!reservationRoomId) return PASS_THROUGH;
  if (!(await unitHasActivePair(db, { restaurantId: input.restaurantId, reservationRoomId }))) {
    return PASS_THROUGH;
  }
  return async (roomId, base) => {
    // The legacy evaluator cannot judge connecting rooms at all.
    if (base.source !== "canonical") return base;
    const verdict = await evaluatePairVerdict(db, {
      restaurantId: input.restaurantId,
      reservationRoomId,
      roomId,
    });
    return verdict ? mergePairVerdict(base, verdict) : base;
  };
}
