/**
 * Issue #18 — Restaurant Management refund policy (client-safe).
 *
 * Pure rules shared by the till, order detail, and server Confirm path.
 * Kitchen order status is a different axis; payment badges never reuse it.
 * Standalone POS `pos_*` tables are intentionally not referenced here.
 */

export const RM_REFUND_ACTION = "rm_refund";
export const RM_REFUND_MANAGER_ROLES = ["owner", "manager"] as const;
export const RM_REFUND_CASHIER_ROLE = "cashier";
export const RM_REFUND_REASON_MIN = 3;
export const RM_REFUND_REASON_MAX = 300;

export type RmRefundMethod = "cash" | "card" | "room";
export type RestaurantPaymentStatus = "unpaid" | "paid" | "partially_refunded" | "refunded";

export const PAYMENT_STATUS_LABEL: Record<RestaurantPaymentStatus, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isRmRefundManager(role: string): boolean {
  return (RM_REFUND_MANAGER_ROLES as readonly string[]).includes(role);
}

/** Manager-level by default; cashiers only when an explicit rm_refund grant is on. */
export function canAttemptRmRefund(role: string, cashierGranted: boolean): boolean {
  if (isRmRefundManager(role)) return true;
  return role === RM_REFUND_CASHIER_ROLE && cashierGranted === true;
}

export function canConfirmCashWithoutShift(role: string): boolean {
  return isRmRefundManager(role);
}

export type RefundAuthzDecision =
  | { ok: true; correctionWithoutShift: boolean }
  | { ok: false; code: "UNAUTHORIZED" | "CASHIER_SHIFT_REQUIRED"; message: string };

/**
 * Server Confirm gate. Default-deny cashiers. Cash without an open shift is
 * a manager/owner correction only — cashiers are blocked.
 */
export function authorizeRmRefundConfirm(input: {
  role: string;
  cashierGranted: boolean;
  method: RmRefundMethod;
  hasOpenShift: boolean;
}): RefundAuthzDecision {
  if (!canAttemptRmRefund(input.role, input.cashierGranted)) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "You don't have permission to refund a restaurant sale.",
    };
  }

  if (input.method === "room" && !isRmRefundManager(input.role)) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "Only an owner or manager can reverse a room charge.",
    };
  }

  if (!input.hasOpenShift) {
    if (!canConfirmCashWithoutShift(input.role)) {
      return {
        ok: false,
        code: "CASHIER_SHIFT_REQUIRED",
        message: "Open a cashier shift before refunding, or ask a manager to record the correction.",
      };
    }
    return { ok: true, correctionWithoutShift: input.method === "cash" };
  }

  return { ok: true, correctionWithoutShift: false };
}

export function restaurantPaymentStatus(input: {
  paidAt: string | null;
  billingMethod: string | null;
  roomPosted: boolean;
  total: number;
  refundedAmount: number;
}): RestaurantPaymentStatus {
  const refunded = round2(Math.max(0, input.refundedAmount));
  const total = round2(Math.max(0, input.total));
  const settled =
    Boolean(input.paidAt) ||
    input.roomPosted ||
    input.billingMethod === "room_charge" ||
    input.billingMethod === "comp";
  if (!settled && refunded <= 0) return "unpaid";
  if (total > 0 && refunded + 0.001 >= total) return "refunded";
  if (refunded > 0.001) return "partially_refunded";
  if (settled) return "paid";
  return "unpaid";
}

export function remainingRefundable(total: number, refundedAmount: number): number {
  return Math.max(0, round2(total - refundedAmount));
}

export function tenderRemaining(paid: number, alreadyRefunded: number): number {
  return Math.max(0, round2(paid - alreadyRefunded));
}

export function lineRemaining(lineTotal: number, alreadyRefunded: number): number {
  return Math.max(0, round2(lineTotal - alreadyRefunded));
}

export type RefundCapError = {
  ok: false;
  code: "OVER_REFUND" | "DOUBLE_REFUND" | "TENDER_OVER" | "LINE_OVER" | "AMOUNT_MISMATCH" | "INVALID_AMOUNT";
  message: string;
};

export function assertRefundableAmount(input: {
  amount: number;
  saleRemaining: number;
  tenderRemaining: number;
  lineAmounts: number[];
  lineRemainings: number[];
}): { ok: true; amount: number } | RefundCapError {
  const amount = round2(input.amount);
  if (!(amount > 0)) {
    return { ok: false, code: "INVALID_AMOUNT", message: "Enter an amount greater than zero." };
  }
  if (input.saleRemaining <= 0.001) {
    return { ok: false, code: "DOUBLE_REFUND", message: "This restaurant sale has already been fully refunded." };
  }
  if (amount > input.saleRemaining + 0.001) {
    return { ok: false, code: "OVER_REFUND", message: "That's more than the amount still refundable on this restaurant sale." };
  }
  if (amount > input.tenderRemaining + 0.001) {
    return { ok: false, code: "TENDER_OVER", message: "That's more than the amount still refundable on that tender." };
  }
  if (input.lineAmounts.length !== input.lineRemainings.length) {
    return { ok: false, code: "AMOUNT_MISMATCH", message: "Refund lines don't match this restaurant sale." };
  }
  let lineSum = 0;
  for (let i = 0; i < input.lineAmounts.length; i++) {
    const lineAmount = round2(input.lineAmounts[i] ?? 0);
    const remaining = input.lineRemainings[i] ?? 0;
    if (lineAmount < 0) {
      return { ok: false, code: "INVALID_AMOUNT", message: "Enter an amount greater than zero." };
    }
    if (lineAmount > remaining + 0.001) {
      return { ok: false, code: "LINE_OVER", message: "That's more than the amount still refundable on a selected line." };
    }
    lineSum = round2(lineSum + lineAmount);
  }
  if (Math.abs(lineSum - amount) > 0.001) {
    return { ok: false, code: "AMOUNT_MISMATCH", message: "Selected lines must add up to the refund amount." };
  }
  return { ok: true, amount };
}

export function reasonIsValid(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= RM_REFUND_REASON_MIN && trimmed.length <= RM_REFUND_REASON_MAX;
}

export function canSubmitRefundConfirm(input: {
  reason: string;
  amount: number;
  hasSelection: boolean;
  tenderSelected: boolean;
  cardAcknowledged: boolean;
  method: RmRefundMethod | null;
  submitting: boolean;
}): boolean {
  if (input.submitting) return false;
  if (!input.hasSelection || !input.tenderSelected || !input.method) return false;
  if (!reasonIsValid(input.reason)) return false;
  if (!(input.amount > 0)) return false;
  if (input.method === "card" && !input.cardAcknowledged) return false;
  return true;
}

export type RoomReverseOutcome =
  | { success: true; amount: number }
  | { success: false; retry: true; message: string };

/** Room refunds are the existing reverse only. Failure never counts as success. */
export function interpretRoomReverseResult(
  result: { ok: true; amount: number } | { ok: false; message: string } | { ok: boolean; amount?: number; message?: string },
): RoomReverseOutcome {
  if (result.ok === true && typeof result.amount === "number") {
    return { success: true, amount: result.amount };
  }
  return {
    success: false,
    retry: true,
    message: ("message" in result && result.message) || "The room charge could not be reversed. Nothing was refunded.",
  };
}

export function refundAllRemainingLines(
  lines: { remainingAmount: number }[],
): number[] {
  return lines.map((line) => round2(Math.max(0, line.remainingAmount)));
}

export function selectedRefundAmount(lineAmounts: number[]): number {
  return round2(lineAmounts.reduce((sum, value) => sum + Math.max(0, value), 0));
}

export function tenderLabel(method: string): string {
  if (method === "cash") return "Cash";
  if (method === "card") return "Card";
  if (method === "room") return "Room";
  return method;
}
