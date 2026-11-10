/**
 * Night Audit shared server types and error mapping.
 *
 * End of Day evaluation lives in the financial and operational reconcilers
 * (night-audit-financial*.ts, night-audit-operational*.ts) and the step model
 * (night-audit-steps.ts). This module keeps the stored summary shapes that
 * older closed runs were written with, so History stays readable.
 */

export type Severity = "warning" | "blocking";
export type CheckStatus = "pass" | "warning" | "blocking";

export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "mobile_money", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Per-area check row stored on pre-redesign summaries. */
export interface AreaCheck {
  area: string;
  status: CheckStatus;
  detail: string;
}

/** Day finance shape stored on closed-run summaries. */
export interface AuditFinance {
  currency: string;
  roomRevenue: number;
  otherCharges: number;
  charges: number;
  payments: number;
  deposits: number;
  refunds: number;
  discounts: number;
  adjustments: number;
  paymentsByMethod: Record<PaymentMethod, number>;
}

const NIGHT_AUDIT_ERRORS: Record<string, string> = {
  AUDIT_RUN_NOT_FOUND: "Night audit run not found for this property.",
  BLOCKING_EXCEPTIONS_OPEN: "Resolve every blocker before closing the business date.",
  STALE_BUSINESS_DATE:
    "This run is not the current business date. Refresh Night Audit and close the current date.",
  AUDIT_RUN_NOT_CLOSABLE: "This night audit run cannot be closed.",
};

export function nightAuditError(message: string): Error {
  for (const [code, text] of Object.entries(NIGHT_AUDIT_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}
