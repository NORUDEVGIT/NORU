/**
 * Step 3 display rules.
 * Amounts and the continue gate come from getCheckInDepositReadiness.
 * This file does not sum folio lines or treat a waiver as money received.
 */
import type { CheckInDepositReadiness } from "@/packages/pms/lib/fo-check-in";

export type DepositRequirementStatus =
  "Satisfied" | "Partially paid" | "Outstanding" | "Waived" | "Not required";

export type CheckInPaymentSummary = {
  required: string;
  received: string;
  outstanding: string;
  status: DepositRequirementStatus;
  guarantee: string;
  guaranteeNote: string;
  folioScope: string;
};

export const GUARANTEE_NOT_EVALUATED = "Not evaluated by current property rules";

export const DEPOSIT_WAIVER_ROLES = ["owner", "manager"] as const;

/** Continue follows the backend satisfied flag, including waiver and a zero requirement. */
export function canContinuePayment(readiness: { satisfied: boolean } | null | undefined): boolean {
  return readiness?.satisfied === true;
}

/** Owner and manager only. Receptionist cannot authorize this waiver. */
export function canAuthorizeCheckInDepositWaiver(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/**
 * Label only. Waived is not Satisfied, and a positive received amount stays partial
 * until the backend marks the requirement satisfied.
 */
export function depositRequirementStatus(input: {
  requiredAmount: number | null;
  receivedAmount: number;
  satisfied: boolean;
  waived: boolean;
}): DepositRequirementStatus {
  if (input.waived) return "Waived";
  if (!input.satisfied) {
    return input.receivedAmount > 0 ? "Partially paid" : "Outstanding";
  }
  const required =
    input.requiredAmount == null || !Number.isFinite(input.requiredAmount)
      ? 0
      : input.requiredAmount;
  return required <= 0 ? "Not required" : "Satisfied";
}

export function formatDepositAmount(amount: number | null, currency: string | null): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const code = currency?.trim();
  return code ? `${code} ${formatted}` : formatted;
}

export function guaranteeMethodLabel(method: string | null): string {
  const value = method?.trim() ?? "";
  return value || "No guarantee method recorded";
}

export function buildCheckInPaymentSummary(
  readiness: CheckInDepositReadiness,
  waived: boolean,
): CheckInPaymentSummary {
  const status = depositRequirementStatus({
    requiredAmount: readiness.requiredAmount,
    receivedAmount: readiness.receivedAmount,
    satisfied: readiness.satisfied,
    waived,
  });
  return {
    required: formatDepositAmount(readiness.requiredAmount, readiness.currency),
    received: formatDepositAmount(readiness.receivedAmount, readiness.currency),
    outstanding: formatDepositAmount(readiness.outstanding, readiness.currency),
    status,
    guarantee: guaranteeMethodLabel(readiness.guaranteeMethod),
    guaranteeNote: GUARANTEE_NOT_EVALUATED,
    folioScope: readiness.scope === "reservation" ? "Reservation" : readiness.scope,
  };
}

/** Transaction id when the folio post landed and unit progress did not. */
export function postedDepositProgressFailure(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/Deposit (\S+) was posted\./);
  return match?.[1] ?? null;
}

export function depositActionFailureCopy(error: unknown): string {
  const message = error instanceof Error ? error.message : "The deposit could not be posted.";
  if (/shift/i.test(message)) return "Open a cashier shift before collecting a deposit.";
  if (
    /permission|don't have access|do not have access|not authorized|forbidden|access denied/i.test(
      message,
    )
  ) {
    return "You don't have permission to collect this deposit.";
  }
  if (/cashier/i.test(message)) return "A cashier session is required before collecting a deposit.";
  if (message.includes("\n") || /at \S+\.(ts|js)/.test(message)) {
    return "The deposit could not be posted. Try again.";
  }
  return message;
}

export function waiverFailureCopy(error: unknown): string {
  const message = error instanceof Error ? error.message : "The deposit waiver could not be saved.";
  if (
    /permission|don't have access|do not have access|not authorized|forbidden|access denied/i.test(
      message,
    )
  ) {
    return "An owner or manager must authorize this waiver.";
  }
  if (message.includes("\n") || /at \S+\.(ts|js)/.test(message)) {
    return "The deposit waiver could not be saved. Try again.";
  }
  return message;
}
