/**
 * Display-only mapper for Property Activation staff UI.
 * Server blocker / warning strings stay authoritative; this never feeds eligibility.
 */

const EXACT_STAFF_FACING_MESSAGES: Record<string, string> = {
  "The existing SET1 mandatory checklist is incomplete.":
    "Required property setup is incomplete.",
  "Card 8 Go-Live governance is not ready.": "Go-Live preparation is not complete.",
  "The authoritative Card 1 business date is missing.":
    "The hotel business date is not ready for activation.",
  "The Go-Live business date confirmation is incomplete.":
    "The hotel business date is not confirmed for activation.",
  "Property is already active.": "Property is already live.",
  "You don't have permission to activate this property.":
    "You don't have permission to activate this property.",
  "Explicit activation confirmation is required.":
    "Confirm that this property is ready before activating.",
};

const SYSTEM_VALIDATION_CRITICAL =
  /^System Validation has \d+ critical issues?\.$/;

/**
 * Map a raw activation blocker/toast message to staff-facing copy.
 * Unknown messages are returned unchanged so genuine blockers never disappear.
 */
export function staffFacingActivationMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return message;

  const exact = EXACT_STAFF_FACING_MESSAGES[trimmed];
  if (exact) return exact;

  if (SYSTEM_VALIDATION_CRITICAL.test(trimmed)) {
    return "System Validation still has critical issues.";
  }

  return message;
}

export function staffFacingActivationMessages(messages: readonly string[]): string[] {
  return messages.map(staffFacingActivationMessage);
}
