import { snapshotField, snapshotDisplayName } from "@/packages/pms/lib/reservation-detail-overview";
import { REVIEW_DASH } from "@/packages/pms/lib/create-reservation-review";
import {
  canCompleteNoShow,
  isFeeSatisfied,
  isReasonComplete,
} from "@/packages/pms/lib/fo-cancel-noshow";
import { isNoShowPastDue } from "@/packages/pms/lib/fo-no-show-readiness";
import { composeCancelReason } from "@/packages/pms/lib/reservation-cancel-workspace";
import type { ReservationHistoryEntry } from "@/packages/pms/lib/reservations.functions";

export const NOSHOW_DASH = REVIEW_DASH;
export const NOSHOW_NOT_EVALUATED = "Not evaluated";
export const NOSHOW_COMM_GAP =
  "No guest, company, staff, housekeeping, or distribution notification is sent by this action.";
export const NOSHOW_BLACKLIST_GAP =
  "Guest restrictions are managed separately in Guest Profile and are unchanged by this action.";
export const NOSHOW_COLLECT_CASHIERING =
  "Any amount to collect stays in Cashiering. This action does not post a no-show charge unless one is already on the folio.";

export const NOSHOW_RESERVATION_STEPS = [
  { id: "details", label: "Review Details", hint: "Check arrival and policy" },
  { id: "confirm", label: "Confirm No-Show", hint: "Provide reason and charges" },
  { id: "complete", label: "Complete", hint: "Process no-show" },
] as const;

export type NoShowReservationStepId = (typeof NOSHOW_RESERVATION_STEPS)[number]["id"];

export const NOSHOW_REASON_OPTIONS = [
  { value: "Guest Did Not Arrive", label: "Guest Did Not Arrive" },
  { value: "No contact", label: "No contact" },
  { value: "Travel disruption", label: "Travel disruption" },
  { value: "Other", label: "Other" },
] as const;

export type NoShowFinanceRow = {
  description: string;
  amount: string;
  status: string;
};

export type NoShowSystemRow = {
  id: string;
  title: string;
  detail: string;
  guaranteed: boolean;
};

/** Same rule as Desk Mark No-Show in getReservationContextActions. */
export function isDeskNoShowEligible(
  status: string,
  arrivalDate: string,
  businessDate: string,
): boolean {
  return isNoShowPastDue(status, arrivalDate, businessDate);
}

export function composeNoShowReason(reason: string, notes: string): string {
  return composeCancelReason(reason, notes);
}

export function noShowPolicyLabel(
  refundabilitySnapshot: unknown,
  cancellationSnapshot: unknown,
): string {
  return (
    snapshotField(refundabilitySnapshot, ["no_show", "no_show_policy", "noshow"]) ??
    snapshotField(cancellationSnapshot, ["no_show", "no_show_policy"]) ??
    snapshotDisplayName(refundabilitySnapshot) ??
    NOSHOW_DASH
  );
}

export function postedNoShowFeeAmount(
  lines: Array<{ type: string; description: string; amount: number }> | null | undefined,
): number | null {
  const hit = (lines ?? []).find(
    (line) =>
      line.type === "charge" && line.description.trim().toLowerCase().startsWith("no-show charge"),
  );
  if (!hit) return null;
  return Number.isFinite(hit.amount) ? hit.amount : null;
}

export function noShowFinanceRows(input: {
  roomSubtotal: number | null;
  packageAmount: number | null;
  additionalServices: number | null;
  postedNoShowFee: number | null;
  feeRequired: boolean;
  feeSatisfied: boolean;
  depositAmount: number | null;
  folioBalance: number | null;
  money: (value: number) => string;
}): NoShowFinanceRow[] {
  const folio = input.folioBalance;
  const collect = folio != null && folio > 0.009 ? folio : 0;
  const outstanding = folio;
  return [
    {
      description: "Room Charges",
      amount: input.roomSubtotal == null ? NOSHOW_DASH : input.money(input.roomSubtotal),
      status: input.roomSubtotal == null ? NOSHOW_DASH : "Reservation quote — not posted money",
    },
    {
      description: "Package Charges",
      amount:
        input.packageAmount == null
          ? NOSHOW_DASH
          : input.packageAmount === 0
            ? "Included"
            : input.money(input.packageAmount),
      status: input.packageAmount == null ? NOSHOW_DASH : "Package snapshot — ledger unchanged",
    },
    {
      description: "Additional Services",
      amount:
        input.additionalServices == null ? NOSHOW_DASH : input.money(input.additionalServices),
      status:
        input.additionalServices == null ? "Not available in this workflow" : "Posted on folio",
    },
    {
      description: "No-Show Charge",
      amount:
        input.postedNoShowFee != null
          ? input.money(input.postedNoShowFee)
          : !input.feeRequired
            ? input.money(0)
            : NOSHOW_DASH,
      status: !input.feeRequired
        ? "Not applicable"
        : input.postedNoShowFee != null
          ? "Posted on folio"
          : input.feeSatisfied
            ? "Waived"
            : "Required before confirm",
    },
    {
      description: "Deposit / Guarantee",
      amount: input.depositAmount == null ? NOSHOW_DASH : input.money(input.depositAmount),
      status:
        input.depositAmount == null ? NOSHOW_DASH : "Stored requirement — not a received deposit",
    },
    {
      description: "Amount to Collect",
      amount: folio == null ? NOSHOW_DASH : input.money(collect),
      status:
        folio == null
          ? NOSHOW_DASH
          : collect > 0
            ? "To be collected in Cashiering"
            : "No balance to collect",
    },
    {
      description: "Outstanding Balance",
      amount: outstanding == null ? NOSHOW_DASH : input.money(outstanding),
      status:
        outstanding == null ? NOSHOW_DASH : outstanding === 0 ? "No balance" : "Folio balance",
    },
  ];
}

export function predictedNoShowUpdates(input: {
  assignedRoom: string | null;
  feeRequired: boolean;
  unitLabel?: string | null;
  predictedReservationStatus?: string | null;
}): NoShowSystemRow[] {
  return [
    {
      id: "status",
      title: input.unitLabel
        ? `${input.unitLabel} will be marked No-Show`
        : "Reservation status will be set to No-Show",
      detail: input.predictedReservationStatus
        ? `The reservation will roll up to ${input.predictedReservationStatus.replaceAll("_", " ")}.`
        : "The reservation status will be updated.",
      guaranteed: true,
    },
    {
      id: "inventory",
      title: input.assignedRoom
        ? `Room ${input.assignedRoom} will be released if still assigned after the RPC`
        : "No assigned room to release",
      detail: input.assignedRoom
        ? "The selected booking assignment will be released."
        : "This stay is already unassigned.",
      guaranteed: true,
    },
    {
      id: "audit",
      title: "Reason will be recorded on reservation history",
      detail: "An amended history event stores the no-show reason.",
      guaranteed: true,
    },
    {
      id: "fee",
      title: input.feeRequired
        ? "No-show charge must already be posted or waived"
        : "No Front Office no-show charge is required",
      detail: "This workspace does not invent a penalty amount.",
      guaranteed: true,
    },
  ];
}

export function persistedNoShowUpdates(input: {
  status: string;
  roomReleased: boolean;
  assignedBefore: string | null;
  historyRecorded: boolean;
  unitLabel?: string | null;
}): NoShowSystemRow[] {
  return [
    {
      id: "status",
      title: input.unitLabel
        ? `${input.unitLabel} marked No-Show`
        : "Reservation status set to No-Show",
      detail: `Reservation status is ${input.status.replaceAll("_", " ")}.`,
      guaranteed: Boolean(input.unitLabel) || input.status === "no_show",
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
          ? NOSHOW_NOT_EVALUATED
          : "Stay was unassigned before no-show.",
      guaranteed: input.roomReleased || !input.assignedBefore,
    },
    {
      id: "audit",
      title: input.historyRecorded ? "No-show reason recorded" : "History not found",
      detail: input.historyRecorded
        ? "An amended history event includes the no-show reason."
        : NOSHOW_NOT_EVALUATED,
      guaranteed: input.historyRecorded,
    },
  ];
}

export function canContinueNoShowReview(input: {
  status: string;
  arrivalDate: string;
  businessDate: string;
  reason: string;
}): boolean {
  return (
    isDeskNoShowEligible(input.status, input.arrivalDate, input.businessDate) &&
    isReasonComplete(input.reason)
  );
}

export function canConfirmNoShowReservation(input: {
  status: string;
  arrivalDate: string;
  businessDate: string;
  reason: string;
  feeRequired: boolean;
  posted: boolean;
  waived: boolean;
}): boolean {
  return (
    isDeskNoShowEligible(input.status, input.arrivalDate, input.businessDate) &&
    canCompleteNoShow({
      reasonOk: isReasonComplete(input.reason),
      feeOk: isFeeSatisfied({
        required: input.feeRequired,
        posted: input.posted,
        waived: input.waived,
      }),
    })
  );
}

export function pickNoShowHistory(
  history: ReservationHistoryEntry[] | null | undefined,
): ReservationHistoryEntry | null {
  const rows = history ?? [];
  const completed = rows.find((row) => row.eventType === "no_show");
  if (completed) return completed;
  const withReason = rows.find((row) => {
    const values = row.newValues as { no_show_reason?: unknown } | null;
    return Boolean(
      values && typeof values.no_show_reason === "string" && values.no_show_reason.trim(),
    );
  });
  if (withReason) return withReason;
  return rows.find((row) => /no-show/i.test(row.notes ?? "")) ?? null;
}
