/**
 * FO-CLEAN1 — Cancel / no-show fee defaults on existing 0042 restaurants columns.
 *
 * Supervisor Confirm-gated editor. No new columns. Permission denied is not
 * Coming soon.
 */

export const FO_FEE_DEFAULTS_EDIT_ROLES = ["owner", "manager"] as const;

export const FO_FEE_DEFAULTS_DENIED =
  "Only a supervisor, manager or property admin can edit cancel and no-show fee defaults.";

export const FO_FEE_DEFAULTS_HINT = "Used when FO cancel / no-show runs (policy A).";

export const FO_FEE_DEFAULTS_SECTION = "Cancel & no-show fees";

export const FO_FEE_DEFAULTS_SETTINGS_HREF = "/restaurant/settings#cancel-noshow-fees";

export const FO_FEE_DEFAULTS_AUDIT_ACTION = "fo_fee_defaults_updated";

export const FO_FEE_AMOUNT_NEGATIVE = "Fee amounts cannot be negative.";

export const FO_FEE_REQUIRED_UNSET = "Required flags must be set.";

export type FoFeeDefaults = {
  cancelFeeRequired: boolean;
  cancelFeeDefault: number;
  noshowFeeRequired: boolean;
  noshowFeeDefault: number;
};

export function canEditFoFeeDefaults(role: string): boolean {
  return (FO_FEE_DEFAULTS_EDIT_ROLES as readonly string[]).includes(role);
}

export function feeDefaultAmountAllowed(amount: number): boolean {
  return Number.isFinite(amount) && amount >= 0;
}

export function roundFeeDefault(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function validateFoFeeDefaults(input: FoFeeDefaults): string | null {
  if (typeof input.cancelFeeRequired !== "boolean" || typeof input.noshowFeeRequired !== "boolean") {
    return FO_FEE_REQUIRED_UNSET;
  }
  if (!feeDefaultAmountAllowed(input.cancelFeeDefault) || !feeDefaultAmountAllowed(input.noshowFeeDefault)) {
    return FO_FEE_AMOUNT_NEGATIVE;
  }
  return null;
}

export function normalizeFoFeeDefaults(input: FoFeeDefaults): FoFeeDefaults {
  return {
    cancelFeeRequired: input.cancelFeeRequired === true,
    cancelFeeDefault: roundFeeDefault(Number(input.cancelFeeDefault) || 0),
    noshowFeeRequired: input.noshowFeeRequired === true,
    noshowFeeDefault: roundFeeDefault(Number(input.noshowFeeDefault) || 0),
  };
}

export function requiredLabel(required: boolean): string {
  return required ? "Required" : "Not required";
}

export function foFeeDefaultsEqual(a: FoFeeDefaults, b: FoFeeDefaults): boolean {
  return (
    a.cancelFeeRequired === b.cancelFeeRequired &&
    a.cancelFeeDefault === b.cancelFeeDefault &&
    a.noshowFeeRequired === b.noshowFeeRequired &&
    a.noshowFeeDefault === b.noshowFeeDefault
  );
}

export function foFeeDefaultsBeforeAfter(
  before: FoFeeDefaults,
  after: FoFeeDefaults,
): Array<{ id: keyof FoFeeDefaults; label: string; previous: string; next: string }> {
  return [
    {
      id: "cancelFeeRequired",
      label: "Cancel fee required",
      previous: requiredLabel(before.cancelFeeRequired),
      next: requiredLabel(after.cancelFeeRequired),
    },
    {
      id: "cancelFeeDefault",
      label: "Cancel fee default",
      previous: before.cancelFeeDefault.toFixed(2),
      next: after.cancelFeeDefault.toFixed(2),
    },
    {
      id: "noshowFeeRequired",
      label: "No-show fee required",
      previous: requiredLabel(before.noshowFeeRequired),
      next: requiredLabel(after.noshowFeeRequired),
    },
    {
      id: "noshowFeeDefault",
      label: "No-show fee default",
      previous: before.noshowFeeDefault.toFixed(2),
      next: after.noshowFeeDefault.toFixed(2),
    },
  ];
}
