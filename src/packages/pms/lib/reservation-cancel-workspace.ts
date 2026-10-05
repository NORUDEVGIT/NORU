import { deriveCancellationDisplay } from "@/packages/pms/lib/cancellation-deadline";
import {
  CANCELLATION_PENALTY_TYPE_LABELS,
  parseCancellationPenaltyType,
} from "@/packages/pms/lib/cancellation-policy-rules";
import { REVIEW_DASH } from "@/packages/pms/lib/create-reservation-review";
import { snapshotDisplayName, snapshotField } from "@/packages/pms/lib/reservation-detail-overview";
import {
  canCompleteCancel,
  isFeeSatisfied,
  isReasonComplete,
  isStayCancellable,
} from "@/packages/pms/lib/fo-cancel-noshow";
import type { ReservationHistoryEntry } from "@/packages/pms/lib/reservations.functions";

export const CANCEL_DASH = REVIEW_DASH;
export const CANCEL_NOT_EVALUATED = "Not evaluated";
export const CANCEL_COMM_GAP =
  "This workspace does not send guest, company, or staff messages. completeFoCancel does not email or notify housekeeping.";
export const CANCEL_REFUND_CASHIERING =
  "Any refund stays in Cashiering. This action does not post a refund.";

export const CANCEL_RESERVATION_STEPS = [
  { id: "details", label: "Review Details", hint: "Check policy and charges" },
  { id: "confirm", label: "Confirm Cancellation", hint: "Provide reason and options" },
  { id: "complete", label: "Complete", hint: "Process cancellation" },
] as const;

export type CancelReservationStepId = (typeof CANCEL_RESERVATION_STEPS)[number]["id"];

export const CANCEL_REASON_OPTIONS = [
  { value: "Guest Cancelled", label: "Guest Cancelled" },
  { value: "Duplicate booking", label: "Duplicate booking" },
  { value: "Rate / billing issue", label: "Rate / billing issue" },
  { value: "Travel plans changed", label: "Travel plans changed" },
  { value: "Other", label: "Other" },
] as const;

export type CancelPolicyOutcome = "within_free" | "penalty_applies" | "not_evaluated";

export type CancelPolicyView = {
  name: string;
  outcome: CancelPolicyOutcome;
  outcomeLabel: string;
  deadlineLabel: string;
  penaltyRule: string;
};

export type CancelFinanceRow = {
  description: string;
  amount: string;
  status: string;
};

export type CancelSystemRow = {
  id: string;
  title: string;
  detail: string;
  guaranteed: boolean;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

function numberish(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function composeCancelReason(reason: string, notes: string): string {
  const code = reason.trim();
  const extra = notes.trim();
  if (!code) return extra;
  if (!extra) return code;
  return `${code}: ${extra}`;
}

export function cancelPolicyView(
  snapshot: unknown,
  arrivalDate: string,
  timeZone: string | null | undefined,
  now: Date,
): CancelPolicyView {
  const row = asRecord(snapshot);
  const name = snapshotDisplayName(snapshot) ?? CANCEL_DASH;
  if (!row) {
    return {
      name,
      outcome: "not_evaluated",
      outcomeLabel: CANCEL_NOT_EVALUATED,
      deadlineLabel: CANCEL_DASH,
      penaltyRule: CANCEL_DASH,
    };
  }

  const penaltyTypeRaw = snapshotField(snapshot, ["penalty_type", "penaltyType"]);
  const penaltyValue = numberish(row.penalty_value ?? row.penaltyValue);
  const penaltyRule =
    penaltyTypeRaw && parseCancellationPenaltyType(penaltyTypeRaw) !== "none"
      ? `${CANCELLATION_PENALTY_TYPE_LABELS[parseCancellationPenaltyType(penaltyTypeRaw)]}${
          penaltyValue == null ? "" : ` (${penaltyValue})`
        }`
      : CANCEL_DASH;

  const derived = deriveCancellationDisplay({
    policyName: typeof row.name === "string" ? row.name : name === CANCEL_DASH ? "" : name,
    policyKind:
      typeof row.policy_kind === "string"
        ? row.policy_kind
        : typeof row.kind === "string"
          ? row.kind
          : null,
    windowValue: numberish(row.window_value ?? row.windowValue),
    windowUnit: typeof row.window_unit === "string" ? row.window_unit : null,
    cutoffTime: typeof row.cutoff_time === "string" ? row.cutoff_time : null,
    deadlineHours: numberish(row.deadline_hours ?? row.deadlineHours),
    arrivalDate,
    timeZone,
  });

  if (derived.kind === "non_refundable") {
    return {
      name: derived.label,
      outcome: "penalty_applies",
      outcomeLabel: "Penalty applies",
      deadlineLabel: "Non-refundable",
      penaltyRule,
    };
  }

  if (derived.kind === "free_until" && derived.untilAt) {
    const until = Date.parse(derived.untilAt);
    const within = Number.isFinite(until) && now.getTime() < until;
    return {
      name: snapshotDisplayName(snapshot) ?? derived.label,
      outcome: within ? "within_free" : "penalty_applies",
      outcomeLabel: within ? "Within the free cancellation period" : "Penalty applies",
      deadlineLabel: derived.label,
      penaltyRule,
    };
  }

  return {
    name,
    outcome: "not_evaluated",
    outcomeLabel: CANCEL_NOT_EVALUATED,
    deadlineLabel: derived.label || CANCEL_DASH,
    penaltyRule,
  };
}

export function cancelFinanceRows(input: {
  roomSubtotal: number | null;
  packageAmount: number | null;
  additionalServices: number | null;
  postedCancelFee: number | null;
  feeRequired: boolean;
  feeSatisfied: boolean;
  creditBalance: number | null;
  money: (value: number) => string;
  afterCancel?: boolean;
}): CancelFinanceRow[] {
  const after = Boolean(input.afterCancel);
  const roomStatus = after ? "Cancelled" : "Will be cancelled";
  const feeStatus = !input.feeRequired
    ? "Not applicable"
    : input.postedCancelFee != null
      ? after
        ? "Posted"
        : "Posted on folio"
      : input.feeSatisfied
        ? "Waived"
        : "Required before confirm";
  const refundStatus =
    input.creditBalance != null && input.creditBalance > 0
      ? "To be processed in Cashiering"
      : "No refund posted";

  return [
    {
      description: "Room Charges",
      amount: input.roomSubtotal == null ? CANCEL_DASH : input.money(input.roomSubtotal),
      status: input.roomSubtotal == null ? CANCEL_DASH : roomStatus,
    },
    {
      description: "Package Charges",
      amount:
        input.packageAmount == null
          ? CANCEL_DASH
          : input.packageAmount === 0
            ? "Included"
            : input.money(input.packageAmount),
      status: input.packageAmount == null ? CANCEL_DASH : roomStatus,
    },
    {
      description: "Additional Services",
      amount:
        input.additionalServices == null ? CANCEL_DASH : input.money(input.additionalServices),
      status: input.additionalServices == null ? CANCEL_DASH : roomStatus,
    },
    {
      description: "Cancellation Fee",
      amount:
        input.postedCancelFee != null
          ? input.money(input.postedCancelFee)
          : !input.feeRequired
            ? input.money(0)
            : CANCEL_DASH,
      status: feeStatus,
    },
    {
      description: after ? "Refund Amount" : "Amount to Refund",
      amount: input.creditBalance == null ? CANCEL_DASH : input.money(input.creditBalance),
      status: refundStatus,
    },
  ];
}

export function predictedSystemUpdates(input: {
  assignedRoom: string | null;
  feeRequired: boolean;
}): CancelSystemRow[] {
  return [
    {
      id: "status",
      title: "Reservation status will be set to Cancelled",
      detail: "completeFoCancel writes hotel_reservations.status.",
      guaranteed: true,
    },
    {
      id: "inventory",
      title: input.assignedRoom
        ? `Room ${input.assignedRoom} will be released back to inventory`
        : "No assigned room to release",
      detail: input.assignedRoom
        ? "completeFoCancel clears room_id."
        : "This stay is already unassigned.",
      guaranteed: true,
    },
    {
      id: "audit",
      title: "Audit trail will be recorded",
      detail: "A cancelled history event is written with the reason.",
      guaranteed: true,
    },
    {
      id: "fee",
      title: input.feeRequired
        ? "Cancel fee must already be posted or waived"
        : "No Front Office cancel fee is required",
      detail: "This workspace does not invent a penalty amount.",
      guaranteed: true,
    },
  ];
}

export function persistedSystemUpdates(input: {
  status: string;
  roomReleased: boolean;
  assignedBefore: string | null;
  historyRecorded: boolean;
}): CancelSystemRow[] {
  return [
    {
      id: "status",
      title: "Reservation status set to Cancelled",
      detail: input.status === "cancelled" ? "Live status is cancelled." : CANCEL_NOT_EVALUATED,
      guaranteed: input.status === "cancelled",
    },
    {
      id: "inventory",
      title: input.roomReleased
        ? `Room ${input.assignedBefore ?? ""} was released`.trim()
        : input.assignedBefore
          ? "Room release not confirmed"
          : "No assigned room to release",
      detail: input.roomReleased
        ? "room_id is now empty on the reservation."
        : input.assignedBefore
          ? CANCEL_NOT_EVALUATED
          : "Stay was unassigned before cancel.",
      guaranteed: input.roomReleased || !input.assignedBefore,
    },
    {
      id: "audit",
      title: input.historyRecorded ? "Audit trail recorded" : "Audit trail not found",
      detail: input.historyRecorded ? "A cancelled history event exists." : CANCEL_NOT_EVALUATED,
      guaranteed: input.historyRecorded,
    },
  ];
}

export function canContinueCancelReview(input: { status: string; reason: string }): boolean {
  return isStayCancellable(input.status) && isReasonComplete(input.reason);
}

export function canConfirmCancelReservation(input: {
  status: string;
  reason: string;
  feeRequired: boolean;
  posted: boolean;
  waived: boolean;
}): boolean {
  return (
    isStayCancellable(input.status) &&
    canCompleteCancel({
      reasonOk: isReasonComplete(input.reason),
      feeOk: isFeeSatisfied({
        required: input.feeRequired,
        posted: input.posted,
        waived: input.waived,
      }),
    })
  );
}

export function pickCancelledHistory(
  history: ReservationHistoryEntry[] | null | undefined,
): ReservationHistoryEntry | null {
  return (history ?? []).find((row) => row.eventType === "cancelled") ?? null;
}

export function postedCancelFeeAmount(
  lines: Array<{ type: string; description: string; amount: number }> | null | undefined,
): number | null {
  const hit = (lines ?? []).find(
    (line) =>
      line.type === "charge" && line.description.trim().toLowerCase().startsWith("cancel fee"),
  );
  if (!hit) return null;
  return Number.isFinite(hit.amount) ? hit.amount : null;
}

export function folioCreditExposure(balance: number | null | undefined): number | null {
  if (balance == null || !Number.isFinite(balance)) return null;
  if (balance <= -0.01) return Math.abs(balance);
  return 0;
}
