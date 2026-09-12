/**
 * FO-FS3 — Cancel / No-show money gating (pure).
 *
 * Policy A: when the property requires a fee, Confirm is blocked until a
 * Cashiering charge is posted or a supervisor waives it. Fee/charge must be
 * posted before the status flip (cancelled / no-show cannot be billed).
 */

import { cashieringRefundHref, REFUND_IN_CASHIERING_CTA } from "./fo-check-out";
import { stepRailState, type StepRailState } from "./fo-check-in";

export { cashieringRefundHref, REFUND_IN_CASHIERING_CTA, stepRailState };
export type { StepRailState };

export const CANCEL_NOSHOW_STEPS = ["stay", "reason", "money", "confirm"] as const;
export type CancelNoShowStepId = (typeof CANCEL_NOSHOW_STEPS)[number];

export const CANCEL_STEP_META: { id: CancelNoShowStepId; letter: string; label: string }[] = [
  { id: "stay", letter: "A", label: "Stay" },
  { id: "reason", letter: "B", label: "Reason" },
  { id: "money", letter: "C", label: "Money" },
  { id: "confirm", letter: "D", label: "Confirm cancellation" },
];

export const NOSHOW_STEP_META: { id: CancelNoShowStepId; letter: string; label: string }[] = [
  { id: "stay", letter: "A", label: "Stay" },
  { id: "reason", letter: "B", label: "Reason" },
  { id: "money", letter: "C", label: "Money" },
  { id: "confirm", letter: "D", label: "Confirm no-show" },
];

export type CancelNoShowKind = "cancel" | "noshow";

export const REASON_MIN_CHARS = 3;
export const CANCEL_FEE_DESCRIPTION = "Cancel fee";
export const NOSHOW_FEE_DESCRIPTION = "No-show charge";
export const FEE_REQUIRED_BANNER = "Post the fee or request a supervisor waiver.";
export const NO_CANCEL_FEE_REQUIRED = "No cancel fee required";
export const NO_NOSHOW_FEE_REQUIRED = "No no-show charge required";
export const SUGGEST_FIRST_NIGHT_LABEL = "Suggest first night";
export const WALK_INS_EMPTY = "No walk-ins in this range.";
export const WALK_IN_COMPLETE_BADGE = "Complete";
export const WALK_IN_INCOMPLETE_BADGE = "Incomplete";
export const CASHIER_SHIFT_REQUIRED_MESSAGE = "Open a cashier shift to post.";
export const CREATED_BY_UNKNOWN = "—";

export function feeDescription(kind: CancelNoShowKind): string {
  return kind === "cancel" ? CANCEL_FEE_DESCRIPTION : NOSHOW_FEE_DESCRIPTION;
}

export function noFeeRequiredLabel(kind: CancelNoShowKind): string {
  return kind === "cancel" ? NO_CANCEL_FEE_REQUIRED : NO_NOSHOW_FEE_REQUIRED;
}

export function mapCashierShiftError(message: string): string {
  if (/shift/i.test(message)) return CASHIER_SHIFT_REQUIRED_MESSAGE;
  return message;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isReasonComplete(reason: string): boolean {
  return reason.trim().length >= REASON_MIN_CHARS;
}

export function canContinueReason(reason: string): boolean {
  return isReasonComplete(reason);
}

export function isFeeSatisfied(input: {
  required: boolean;
  posted: boolean;
  waived: boolean;
}): boolean {
  if (!input.required) return true;
  return input.posted || input.waived;
}

export function canContinueMoney(input: {
  required: boolean;
  posted: boolean;
  waived: boolean;
}): boolean {
  return isFeeSatisfied(input);
}

export function canConfirmCancel(input: {
  reasonOk: boolean;
  feeOk: boolean;
}): boolean {
  return input.reasonOk && input.feeOk;
}

export function canCompleteCancel(input: {
  reasonOk: boolean;
  feeOk: boolean;
}): boolean {
  return canConfirmCancel(input);
}

export function canCompleteNoShow(input: {
  reasonOk: boolean;
  feeOk: boolean;
}): boolean {
  return canConfirmCancel(input);
}

export function isFeePostedLine(
  line: { type: string; description: string },
  kind: CancelNoShowKind,
): boolean {
  if (line.type !== "charge") return false;
  const expected = feeDescription(kind).toLowerCase();
  return line.description.trim().toLowerCase().startsWith(expected);
}

export function folioHasPostedFee(
  lines: Array<{ type: string; description: string }>,
  kind: CancelNoShowKind,
): boolean {
  return lines.some((line) => isFeePostedLine(line, kind));
}

export function folioDepositLines<T extends { type: string; description: string; amount: number }>(
  lines: T[],
): T[] {
  return lines.filter((line) => line.type === "deposit");
}

export function isCreditBalance(balance: number): boolean {
  return (Number.isFinite(balance) ? balance : 0) <= -0.01;
}

export type NightlyRateLike = { date: string; rate: number };

export function suggestFirstNight(input: {
  roomSubtotal: number | null | undefined;
  nightlyRates: NightlyRateLike[] | null | undefined;
  nights: number;
}): number | null {
  const nightly = (input.nightlyRates ?? []).find((n) => Number.isFinite(n.rate) && n.rate > 0);
  if (nightly) return roundMoney(nightly.rate);

  const subtotal = input.roomSubtotal;
  if (subtotal != null && Number.isFinite(subtotal) && subtotal > 0 && input.nights === 1) {
    return roundMoney(subtotal);
  }
  return null;
}

export type WalkInCompletionFilter = "all" | "complete" | "incomplete";

export type WalkInHistoryRow = {
  id: string;
  createdAt: string;
  guestName: string;
  confirmationNumber: string;
  roomNumber: string | null;
  createdBy: string;
  walkInIncomplete: boolean;
};

export function localDateFromInstant(iso: string, timeZone?: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-CA", timeZone ? { timeZone } : { timeZone: "UTC" });
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatFoDateTime(iso: string, timeZone?: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      ...(timeZone ? { timeZone } : { timeZone: "UTC" }),
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function filterWalkInsHistory(
  rows: WalkInHistoryRow[],
  filters: {
    from: string;
    to: string;
    completion: WalkInCompletionFilter;
    search: string;
    timeZone?: string;
  },
): WalkInHistoryRow[] {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    const localDate = localDateFromInstant(row.createdAt, filters.timeZone);
    if (localDate < filters.from || localDate > filters.to) return false;
    if (filters.completion === "complete" && row.walkInIncomplete) return false;
    if (filters.completion === "incomplete" && !row.walkInIncomplete) return false;
    if (!search) return true;
    return (
      row.guestName.toLowerCase().includes(search) ||
      row.confirmationNumber.toLowerCase().includes(search)
    );
  });
}

export function walkInCreatedByLabel(actorName: string | null | undefined): string {
  const name = (actorName ?? "").trim();
  return name || CREATED_BY_UNKNOWN;
}

export function feeAmountAllowed(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}
