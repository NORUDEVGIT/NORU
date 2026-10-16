export const CANCELLATION_POLICY_KINDS = [
  "free_cancellation",
  "non_refundable",
  "flexible",
] as const;
export type CancellationPolicyKind = (typeof CANCELLATION_POLICY_KINDS)[number];

export const CANCELLATION_WINDOW_UNITS = ["hours_before_arrival", "days_before_arrival"] as const;
export type CancellationWindowUnit = (typeof CANCELLATION_WINDOW_UNITS)[number];

export const CANCELLATION_PENALTY_TYPES = [
  "none",
  "first_night",
  "fixed_amount",
  "percentage",
  "full_stay",
  "percent",
  "nights",
  "fixed",
] as const;
export type CancellationPenaltyType = (typeof CANCELLATION_PENALTY_TYPES)[number];

export const CANCELLATION_POLICY_KIND_LABELS: Record<CancellationPolicyKind, string> = {
  free_cancellation: "Free cancellation",
  non_refundable: "Non-refundable",
  flexible: "Flexible",
};

export const CANCELLATION_WINDOW_UNIT_LABELS: Record<CancellationWindowUnit, string> = {
  hours_before_arrival: "Hours before arrival",
  days_before_arrival: "Days before arrival",
};

export const CANCELLATION_PENALTY_TYPE_LABELS: Record<CancellationPenaltyType, string> = {
  none: "None",
  first_night: "First night",
  fixed_amount: "Fixed amount",
  percentage: "Percentage",
  full_stay: "Full stay",
  percent: "Percent (legacy)",
  nights: "Nights (legacy)",
  fixed: "Fixed (legacy)",
};

const KIND_SET = new Set<string>(CANCELLATION_POLICY_KINDS);
const UNIT_SET = new Set<string>(CANCELLATION_WINDOW_UNITS);
const PENALTY_SET = new Set<string>(CANCELLATION_PENALTY_TYPES);

export function parseCancellationPolicyKind(value: unknown): CancellationPolicyKind {
  const raw = String(value ?? "").trim();
  return KIND_SET.has(raw) ? (raw as CancellationPolicyKind) : "flexible";
}

export function parseCancellationWindowUnit(value: unknown): CancellationWindowUnit {
  const raw = String(value ?? "").trim();
  return UNIT_SET.has(raw) ? (raw as CancellationWindowUnit) : "hours_before_arrival";
}

export function parseCancellationPenaltyType(value: unknown): CancellationPenaltyType {
  const raw = String(value ?? "").trim();
  return PENALTY_SET.has(raw) ? (raw as CancellationPenaltyType) : "none";
}

export function deadlineHoursFromWindow(
  kind: CancellationPolicyKind,
  windowValue: number | null,
  windowUnit: CancellationWindowUnit,
): number | null {
  if (kind === "non_refundable") return null;
  if (windowValue == null || !Number.isFinite(windowValue) || windowValue < 0) return null;
  if (windowUnit === "days_before_arrival") return Math.round(windowValue * 24);
  return Math.round(windowValue);
}

export function windowFromDeadlineHours(deadlineHours: number | null | undefined): {
  windowValue: number | null;
  windowUnit: CancellationWindowUnit;
} {
  if (deadlineHours == null || !Number.isFinite(deadlineHours) || deadlineHours < 0) {
    return { windowValue: null, windowUnit: "hours_before_arrival" };
  }
  return { windowValue: Math.round(deadlineHours), windowUnit: "hours_before_arrival" };
}

export function parseCutoffTime(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

export function penaltyNeedsValue(type: CancellationPenaltyType): boolean {
  return type === "percentage" || type === "percent" || type === "fixed_amount" || type === "fixed" || type === "nights";
}
