/**
 * Issue #24 — Restaurant Management discounts & comps on open unpaid checks.
 *
 * Pure rules shared by the till, unpaid order detail, and server Confirm path.
 * Kitchen order status is a different axis; payment badges never reuse it.
 * Standalone POS `pos_*` tables are intentionally not referenced here.
 */
import {
  computeRmBill,
  roundMoney,
  type RmBillTotals,
  type RmTaxSettings,
} from "./rm-tax.ts";

export const RM_DISCOUNT_ACTION = "rm_discount";
export const RM_COMP_ACTION = "rm_comp";
export const RM_ADJUST_MANAGER_ROLES = ["owner", "manager"] as const;
export const RM_ADJUST_STAFF_ROLE = "cashier";
export const RM_ADJUST_REASON_MIN = 3;
export const RM_ADJUST_REASON_MAX = 300;

export type RmDiscountType = "percent" | "amount";
export type RmCompScope = "lines" | "check";
export type RmAdjustAction = typeof RM_DISCOUNT_ACTION | typeof RM_COMP_ACTION;

export function round2(value: number): number {
  return roundMoney(value);
}

export function isRmAdjustManager(role: string): boolean {
  return (RM_ADJUST_MANAGER_ROLES as readonly string[]).includes(role);
}

/** Manager-level by default; cashiers only when an explicit grant is on. */
export function canAttemptRmAdjust(role: string, staffGranted: boolean): boolean {
  if (isRmAdjustManager(role)) return true;
  return role === RM_ADJUST_STAFF_ROLE && staffGranted === true;
}

export type AdjustAuthzDecision =
  | { ok: true }
  | { ok: false; code: "UNAUTHORIZED"; message: string };

export function authorizeRmAdjustConfirm(input: {
  role: string;
  staffGranted: boolean;
  action: RmAdjustAction;
}): AdjustAuthzDecision {
  if (!canAttemptRmAdjust(input.role, input.staffGranted)) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message:
        input.action === RM_COMP_ACTION
          ? "You don't have permission to comp a restaurant check."
          : "You don't have permission to discount a restaurant check.",
    };
  }
  return { ok: true };
}

export function isOrderSettled(input: {
  paidAt: string | null;
  billingMethod: string | null;
  roomPosted: boolean;
}): boolean {
  return (
    Boolean(input.paidAt) ||
    input.roomPosted ||
    input.billingMethod === "room_charge" ||
    input.billingMethod === "direct" ||
    input.billingMethod === "comp"
  );
}

export type AdjustableDecision =
  | { ok: true }
  | { ok: false; code: "ORDER_PAID" | "ORDER_CANCELLED"; message: string };

/** Discounts and comps are unpaid-only. Paid checks go to Refund. */
export function assertOrderAdjustable(input: {
  paidAt: string | null;
  billingMethod: string | null;
  roomPosted: boolean;
  status?: string | null;
}): AdjustableDecision {
  if (input.status === "cancelled") {
    return {
      ok: false,
      code: "ORDER_CANCELLED",
      message: "This restaurant check was cancelled.",
    };
  }
  if (isOrderSettled(input)) {
    return {
      ok: false,
      code: "ORDER_PAID",
      message: "This restaurant check is already paid. Use Refund.",
    };
  }
  return { ok: true };
}

export function eligibleMerchandiseAfterComps(merchandise: number, compAmount: number): number {
  return Math.max(0, round2(merchandise) - round2(Math.max(0, compAmount)));
}

export type DiscountCapError = {
  ok: false;
  code: "OVER_DISCOUNT" | "INVALID_AMOUNT" | "INVALID_PERCENT";
  message: string;
};

/**
 * One order-level discount. Percent 0–100 of eligible merchandise after comps.
 * Amount must be > 0 and ≤ eligible. The caller replaces any previous discount.
 */
export function resolveDiscountAmount(input: {
  type: RmDiscountType;
  value: number;
  eligibleMerchandise: number;
}): { ok: true; amount: number } | DiscountCapError {
  const eligible = round2(Math.max(0, input.eligibleMerchandise));
  const value = Number(input.value);

  if (!Number.isFinite(value)) {
    return { ok: false, code: "INVALID_AMOUNT", message: "Enter a discount greater than zero." };
  }

  if (input.type === "percent") {
    if (value < 0 || value > 100) {
      return { ok: false, code: "INVALID_PERCENT", message: "Discount percent must be between 0 and 100." };
    }
    return { ok: true, amount: round2(eligible * (round2(value) / 100)) };
  }

  const amount = round2(value);
  if (!(amount > 0)) {
    return { ok: false, code: "INVALID_AMOUNT", message: "Enter a discount greater than zero." };
  }
  if (amount > eligible + 0.001) {
    return {
      ok: false,
      code: "OVER_DISCOUNT",
      message: "That's more than the eligible merchandise after comps.",
    };
  }
  return { ok: true, amount: Math.min(amount, eligible) };
}

export type CompCapError = {
  ok: false;
  code: "INVALID_AMOUNT" | "LINE_OVER" | "ALREADY_COMPED";
  message: string;
};

/**
 * Line comps add; entire-check comps remaining merchandise.
 * Already-comped amounts stay; they are not undone.
 */
export function resolveCompAmount(input: {
  scope: RmCompScope;
  merchandise: number;
  selectedLineRemainings: number[];
  alreadyComped: number;
}): { ok: true; amount: number; nextCompTotal: number } | CompCapError {
  const merchandise = round2(Math.max(0, input.merchandise));
  const already = round2(Math.max(0, input.alreadyComped));
  const remainingCheck = Math.max(0, round2(merchandise - already));

  if (input.scope === "check") {
    if (remainingCheck <= 0.001) {
      return { ok: false, code: "ALREADY_COMPED", message: "This restaurant check is already fully comped." };
    }
    return { ok: true, amount: remainingCheck, nextCompTotal: merchandise };
  }

  if (input.selectedLineRemainings.length === 0) {
    return { ok: false, code: "INVALID_AMOUNT", message: "Select at least one line to comp." };
  }

  let added = 0;
  for (const remaining of input.selectedLineRemainings) {
    const line = round2(Math.max(0, remaining));
    if (line <= 0) {
      return { ok: false, code: "LINE_OVER", message: "A selected line is already fully comped." };
    }
    added = round2(added + line);
  }
  const next = round2(already + added);
  if (next > merchandise + 0.001) {
    return { ok: false, code: "LINE_OVER", message: "That's more than the merchandise on this restaurant check." };
  }
  return { ok: true, amount: added, nextCompTotal: Math.min(next, merchandise) };
}

/** Cap a replaced (or surviving) discount after comps change eligible merchandise. */
export function capDiscountToEligible(input: {
  type: RmDiscountType | null;
  value: number | null;
  currentAmount: number;
  eligibleMerchandise: number;
}): { type: RmDiscountType; value: number; amount: number } | null {
  const eligible = round2(Math.max(0, input.eligibleMerchandise));
  if (eligible <= 0.001) return null;
  if (input.type === "percent" && input.value != null) {
    const resolved = resolveDiscountAmount({ type: "percent", value: input.value, eligibleMerchandise: eligible });
    if (!resolved.ok) return null;
    if (resolved.amount <= 0) return null;
    return { type: "percent", value: round2(input.value), amount: resolved.amount };
  }
  if (input.type === "amount" && input.value != null) {
    const amount = Math.min(round2(input.value), eligible);
    if (amount <= 0) return null;
    return { type: "amount", value: amount, amount };
  }
  const amount = Math.min(round2(Math.max(0, input.currentAmount)), eligible);
  if (amount <= 0) return null;
  return { type: "amount", value: amount, amount };
}

export function computeAdjustedRmBill(input: {
  merchandiseSubtotal: number;
  settings: RmTaxSettings;
  discountAmount?: number;
  compAmount?: number;
}): RmBillTotals {
  return computeRmBill(input.merchandiseSubtotal, input.settings, {
    discountAmount: input.discountAmount ?? 0,
    compAmount: input.compAmount ?? 0,
  });
}

export function payableWasNow(was: number, now: number): { was: number; now: number; delta: number } {
  const from = round2(was);
  const to = round2(now);
  return { was: from, now: to, delta: round2(to - from) };
}

export function reasonIsValidAdjust(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= RM_ADJUST_REASON_MIN && trimmed.length <= RM_ADJUST_REASON_MAX;
}

export function canSubmitDiscountConfirm(input: {
  reason: string;
  amount: number;
  submitting: boolean;
}): boolean {
  if (input.submitting) return false;
  if (!reasonIsValidAdjust(input.reason)) return false;
  return input.amount > 0;
}

export function canSubmitCompConfirm(input: {
  reason: string;
  amount: number;
  hasSelection: boolean;
  submitting: boolean;
}): boolean {
  if (input.submitting) return false;
  if (!input.hasSelection) return false;
  if (!reasonIsValidAdjust(input.reason)) return false;
  return input.amount > 0;
}

export function canCompleteCompedOrder(input: {
  payable: number;
  adjustable: boolean;
}): boolean {
  return input.adjustable && input.payable <= 0.001;
}

export function adjustKindLabel(kind: string): string {
  if (kind === "discount") return "Discount";
  if (kind === "discount_clear") return "Discount cleared";
  if (kind === "comp_line") return "Line comp";
  if (kind === "comp_check") return "Check comp";
  if (kind === "complete_comped") return "Completed (comped)";
  return kind;
}
