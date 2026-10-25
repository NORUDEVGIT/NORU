import { isFeeSatisfied, roundMoney } from "./fo-cancel-noshow";
import { rollupReservationStatus, type ReservationUnitStatus } from "./reservation-room-units";

export const NO_SHOW_BLOCKER_CODES = [
  "ROOM_UNIT_REQUIRED",
  "INVALID_TRANSITION",
  "NOT_PAST_DUE",
  "FEE_REQUIRED",
  "FOLIO_CLOSED",
  "POLICY_NOT_CALCULABLE",
  "CHECK_IN_PROGRESS",
] as const;

export type NoShowBlockerCode = (typeof NO_SHOW_BLOCKER_CODES)[number];

export type NoShowBlocker = {
  code: NoShowBlockerCode;
  message: string;
};

export type NoShowPenalty = {
  amount: number | null;
  basis: "none" | "first_night" | "percent_stay" | "fixed_amount" | "full_stay" | "unknown";
  calculable: boolean;
  currency: string | null;
};

export function isMatchingNoShowCharge(
  line: {
    type: string;
    description: string;
    amount: number;
    referenceType?: string | null;
    referenceId?: string | null;
  },
  input: { reservationId: string; reservationRoomId: string | null; expectedAmount: number | null },
): boolean {
  if (line.type !== "charge") return false;
  const expectedReference = input.reservationRoomId ?? input.reservationId;
  const authoritativeReference =
    line.referenceType === "reservation_no_show" && line.referenceId === expectedReference;
  const legacyDescription = line.description.trim().toLowerCase().startsWith("no-show charge");
  if (!authoritativeReference && !legacyDescription) return false;
  return input.expectedAmount == null || Math.abs(line.amount - input.expectedAmount) < 0.01;
}

export type NoShowReadinessFacts = {
  businessDate: string;
  unitRequired: boolean;
  target: {
    reservationRoomId: string | null;
    unitSequence: number | null;
    status: string;
    arrivalDate: string;
    roomId: string | null;
    roomNumber: string | null;
  } | null;
  unitStatuses: ReservationUnitStatus[];
  fee: {
    required: boolean;
    posted: boolean;
    waived: boolean;
    folioStatus: "open" | "closed" | null;
    penalty: NoShowPenalty;
  };
  checkInProgress: boolean;
};

export type NoShowReadiness = NoShowReadinessFacts & {
  eligible: boolean;
  feeSatisfied: boolean;
  predictedReservationStatus: ReservationUnitStatus | null;
  blockers: NoShowBlocker[];
  canComplete: boolean;
};

function blocker(code: NoShowBlockerCode, message: string): NoShowBlocker {
  return { code, message };
}

/** The authoritative lifecycle rule: only a confirmed arrival strictly before business date. */
export function isNoShowPastDue(
  status: string,
  arrivalDate: string,
  businessDate: string,
): boolean {
  return status === "confirmed" && Boolean(arrivalDate) && arrivalDate < businessDate;
}

export function computeNoShowPenalty(input: {
  snapshot: unknown;
  roomSubtotal: number | null;
  nightlyRates: Array<{ date: string; rate: number }>;
  currency: string | null;
}): NoShowPenalty {
  const row =
    input.snapshot && typeof input.snapshot === "object"
      ? (input.snapshot as Record<string, unknown>)
      : null;
  const type = typeof row?.penalty_type === "string" ? row.penalty_type : null;
  const value = Number(row?.penalty_value ?? 0);
  const subtotal =
    input.roomSubtotal != null && Number.isFinite(input.roomSubtotal)
      ? roundMoney(input.roomSubtotal)
      : null;
  const firstNight = input.nightlyRates.find((night) => Number.isFinite(night.rate))?.rate ?? null;

  if (type === "none") {
    return { amount: 0, basis: "none", calculable: true, currency: input.currency };
  }
  if (type === "first_night") {
    return {
      amount: firstNight == null ? null : roundMoney(firstNight),
      basis: "first_night",
      calculable: firstNight != null,
      currency: input.currency,
    };
  }
  if (type === "percent_stay") {
    const calculable = subtotal != null && Number.isFinite(value) && value >= 0 && value <= 100;
    return {
      amount: calculable ? roundMoney((subtotal * value) / 100) : null,
      basis: "percent_stay",
      calculable,
      currency: input.currency,
    };
  }
  if (type === "fixed_amount") {
    const calculable = Number.isFinite(value) && value >= 0;
    return {
      amount: calculable ? roundMoney(value) : null,
      basis: "fixed_amount",
      calculable,
      currency: input.currency,
    };
  }
  if (type === "full_stay") {
    return {
      amount: subtotal,
      basis: "full_stay",
      calculable: subtotal != null,
      currency: input.currency,
    };
  }
  return { amount: null, basis: "unknown", calculable: false, currency: input.currency };
}

export function evaluateNoShowReadiness(facts: NoShowReadinessFacts): NoShowReadiness {
  const blockers: NoShowBlocker[] = [];
  if (facts.unitRequired && !facts.target) {
    blockers.push(blocker("ROOM_UNIT_REQUIRED", "Choose which room this action applies to."));
  }

  if (facts.target) {
    if (facts.target.status !== "confirmed") {
      blockers.push(
        blocker(
          "INVALID_TRANSITION",
          "Only a confirmed reservation room can be marked as a no-show.",
        ),
      );
    } else if (facts.target.arrivalDate >= facts.businessDate) {
      blockers.push(
        blocker(
          "NOT_PAST_DUE",
          "Only arrivals before the property business date can be marked as a no-show.",
        ),
      );
    }
  }

  const feeSatisfied = isFeeSatisfied({
    required: facts.fee.required,
    posted: facts.fee.posted,
    waived: facts.fee.waived,
  });
  if (facts.fee.required && !facts.fee.posted && !facts.fee.waived) {
    if (!facts.fee.penalty.calculable) {
      blockers.push(
        blocker(
          "POLICY_NOT_CALCULABLE",
          "The frozen no-show policy cannot produce an authoritative charge amount.",
        ),
      );
    }
    if (facts.fee.folioStatus === "closed") {
      blockers.push(
        blocker(
          "FOLIO_CLOSED",
          "The folio is closed. A supervisor waiver is required before no-show completion.",
        ),
      );
    }
    blockers.push(
      blocker("FEE_REQUIRED", "Post the no-show charge or record a supervisor waiver."),
    );
  }
  if (facts.checkInProgress) {
    blockers.push(
      blocker(
        "CHECK_IN_PROGRESS",
        "Check-in progress exists for this room. Resolve it before marking no-show.",
      ),
    );
  }

  const predictedReservationStatus =
    facts.target && facts.unitStatuses.length > 0
      ? rollupReservationStatus(
          facts.unitStatuses.map((status, index) =>
            facts.target?.unitSequence === index + 1 ? "no_show" : status,
          ),
        )
      : facts.target
        ? "no_show"
        : null;
  const eligible = Boolean(
    facts.target &&
    isNoShowPastDue(facts.target.status, facts.target.arrivalDate, facts.businessDate),
  );
  return {
    ...facts,
    eligible,
    feeSatisfied,
    predictedReservationStatus,
    blockers,
    canComplete: Boolean(facts.target) && blockers.length === 0 && feeSatisfied,
  };
}
