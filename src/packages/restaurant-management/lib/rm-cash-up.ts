/**
 * Issue #20 — Restaurant Management till cash-up / shift close (client-safe).
 *
 * Pure rules shared by the till overlay and the server Confirm path.
 * Expected cash is always recomputed: opening + cash payments − cash refunds.
 * Do not trust a stored `expected_cash` column alone.
 * Standalone POS `pos_*` tables and PMS Cashiering routing are out of scope.
 */

export const RM_CASH_UP_MANAGER_ROLES = ["owner", "manager"] as const;
export const RM_CASH_UP_NOTE_MAX = 300;

export type CashVarianceKind = "over" | "short" | "exact";

export type CloseShiftAuthzDecision =
  | { ok: true }
  | { ok: false; code: "UNAUTHORIZED"; message: string };

export function roundCash(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Owner/manager may close any open till shift; cashiers close their own only. */
export function canCloseAnyPosShift(role: string): boolean {
  return (RM_CASH_UP_MANAGER_ROLES as readonly string[]).includes(role);
}

export function authorizeClosePosShift(input: {
  role: string;
  actorMembershipId: string;
  shiftMembershipId: string;
}): CloseShiftAuthzDecision {
  if (canCloseAnyPosShift(input.role)) return { ok: true };
  if (input.actorMembershipId === input.shiftMembershipId) return { ok: true };
  return {
    ok: false,
    code: "UNAUTHORIZED",
    message: "You can only close your own cashier shift.",
  };
}

/** Live till draft: unsaved lines or a placed sale that has not been settled. */
export function isUnpaidTillDraft(input: {
  lineCount: number;
  hasUnpaidPlacedSale: boolean;
}): boolean {
  return input.lineCount > 0 || input.hasUnpaidPlacedSale === true;
}

export function canStartCashUp(input: {
  lineCount: number;
  hasUnpaidPlacedSale: boolean;
}): boolean {
  return !isUnpaidTillDraft(input);
}

/**
 * Recompute expected drawer cash at close.
 * Cash payments and cash refunds must already be scoped to this shift id.
 */
export function recomputeExpectedCash(input: {
  openingCash: number | null | undefined;
  cashPayments: number;
  cashRefunds: number;
}): number {
  return roundCash((input.openingCash ?? 0) + input.cashPayments - input.cashRefunds);
}

export function cashVariance(input: { counted: number; expected: number }): {
  amount: number;
  kind: CashVarianceKind;
  label: "Over" | "Short" | "Exact";
} {
  const amount = roundCash(input.counted - input.expected);
  if (Math.abs(amount) < 0.005) {
    return { amount: 0, kind: "exact", label: "Exact" };
  }
  if (amount > 0) return { amount, kind: "over", label: "Over" };
  return { amount, kind: "short", label: "Short" };
}

export function whoseDrawerLabel(input: { isOwn: boolean; cashierName: string }): string {
  return input.isOwn ? "Your shift" : `Closing: ${input.cashierName}`;
}

export function canSubmitCloseShift(input: {
  closingCash: number;
  submitting: boolean;
}): boolean {
  return (
    input.submitting !== true &&
    Number.isFinite(input.closingCash) &&
    input.closingCash >= 0
  );
}

/** Map SECURITY DEFINER / authz failures for the till — never invent success. */
export function interpretClosePosShiftFailure(message: string): {
  ok: false;
  code: "UNAUTHORIZED" | "SHIFT_ALREADY_CLOSED" | "SHIFT_NOT_FOUND" | "INVALID_CLOSING_CASH" | "ERROR";
  message: string;
} {
  if (message.includes("UNAUTHORIZED") || /only close your own/i.test(message)) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "You can only close your own cashier shift.",
    };
  }
  if (message.includes("SHIFT_ALREADY_CLOSED")) {
    return {
      ok: false,
      code: "SHIFT_ALREADY_CLOSED",
      message: "That cashier shift is already closed. Open a new one to continue.",
    };
  }
  if (message.includes("SHIFT_NOT_FOUND")) {
    return {
      ok: false,
      code: "SHIFT_NOT_FOUND",
      message: "That cashier shift could not be found.",
    };
  }
  if (message.includes("INVALID_CLOSING_CASH")) {
    return {
      ok: false,
      code: "INVALID_CLOSING_CASH",
      message: "Enter a closing cash amount of zero or more.",
    };
  }
  return { ok: false, code: "ERROR", message };
}
