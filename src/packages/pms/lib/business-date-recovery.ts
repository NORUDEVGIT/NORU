/**
 * Owner-only Business Date recovery (pure rules).
 * Night Audit stays the normal way the business date advances. This is a
 * setup/recovery tool only, always reasoned, confirmed, and audited.
 */

export const BUSINESS_DATE_NORMAL_COPY = "Normally advanced by Night Audit.";

export const BUSINESS_DATE_ADJUST_WARNING =
  "Changing the business date manually bypasses the normal Night Audit progression and may affect reservations, financial reconciliation, fiscal records, reports, and hotel operations. Use this only for setup or recovery.";

export const BUSINESS_DATE_CONFIRM_WORD = "CONFIRM";

export const BUSINESS_DATE_REASON_MAX = 500;

export const BUSINESS_DATE_ACTIVE_RUN_MESSAGE =
  "An active Night Audit run exists for the current business date. Complete or reset the active run before manually adjusting the business date.";

export const BUSINESS_DATE_STALE_MESSAGE =
  "The business date changed since you opened this dialog. Refresh and review the current business date before trying again.";

export const BUSINESS_DATE_OWNER_ONLY_MESSAGE =
  "Only the property owner can adjust the business date.";

/** Recovery is owner-only. Managers and a future Night Auditor role are not included. */
const BUSINESS_DATE_ADJUST_ROLES = ["owner"] as const;

export function canAdjustBusinessDate(role: string | null | undefined): boolean {
  return (BUSINESS_DATE_ADJUST_ROLES as readonly string[]).includes(String(role ?? ""));
}

export function isValidBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m ?? 1) - 1 && dt.getUTCDate() === d;
}

export type BusinessDateAdjustmentInput = {
  currentBusinessDate: string | null;
  newBusinessDate: string;
  reason: string;
  confirmation: string;
};

/** First problem with the request, or null when it may be submitted. */
export function businessDateAdjustmentProblem(input: BusinessDateAdjustmentInput): string | null {
  if (!isValidBusinessDate(input.newBusinessDate)) return "Enter a valid business date.";
  if (input.currentBusinessDate != null && input.currentBusinessDate === input.newBusinessDate) {
    return "The new business date is the same as the current business date.";
  }
  const reason = input.reason.trim();
  if (!reason) return "A reason is required.";
  if (reason.length > BUSINESS_DATE_REASON_MAX)
    return `Reason must be ${BUSINESS_DATE_REASON_MAX} characters or fewer.`;
  if (input.confirmation.trim() !== BUSINESS_DATE_CONFIRM_WORD)
    return `Type ${BUSINESS_DATE_CONFIRM_WORD} to confirm.`;
  return null;
}

/** adjust_business_date RPC error -> operator message. */
export function businessDateAdjustmentError(message: string): string {
  if (/BUSINESS_DATE_STALE/.test(message)) return BUSINESS_DATE_STALE_MESSAGE;
  if (/ACTIVE_NIGHT_AUDIT_RUN/.test(message)) return BUSINESS_DATE_ACTIVE_RUN_MESSAGE;
  if (/BUSINESS_DATE_BEFORE_CLOSED_HISTORY/.test(message)) {
    return "The new business date must be after the last closed Night Audit date. Closed history cannot be reused.";
  }
  if (/BUSINESS_DATE_UNCHANGED/.test(message))
    return "The new business date is the same as the current business date.";
  if (/BUSINESS_DATE_REASON_REQUIRED/.test(message)) return "A reason is required.";
  if (/BUSINESS_DATE_INVALID/.test(message)) return "Enter a valid business date.";
  return "The business date could not be adjusted. Nothing was changed.";
}
