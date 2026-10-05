import { addDaysIso, zonedMoment } from "@/shared/lib/property-time";

import {
  parseCancellationPolicyKind,
  parseCancellationWindowUnit,
  parseCutoffTime,
  windowFromDeadlineHours,
  type CancellationPolicyKind,
  type CancellationWindowUnit,
} from "./cancellation-policy-rules";

export type DerivedCancellationDisplay = {
  kind: "non_refundable" | "free_until" | "named_fallback";
  label: string;
  untilAt: string | null;
};

export type CancellationDeadlineInput = {
  policyName: string;
  policyKind?: string | null;
  windowValue?: number | null;
  windowUnit?: string | null;
  cutoffTime?: string | null;
  deadlineHours?: number | null;
  arrivalDate: string;
  timeZone: string | null | undefined;
};

function formatUntil(iso: string, timeZone: string | null | undefined): string {
  const zone = timeZone || "UTC";
  const instant = new Date(iso);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "numeric",
    month: "short",
  }).format(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
  return `${date} ${time.replace(/^24:/, "00:")}`;
}

export function deriveCancellationDisplay(input: CancellationDeadlineInput): DerivedCancellationDisplay {
  const name = input.policyName.trim();
  const kind = parseCancellationPolicyKind(input.policyKind);
  if (kind === "non_refundable") {
    return { kind: "non_refundable", label: "Non-refundable", untilAt: null };
  }

  const cutoff = parseCutoffTime(input.cutoffTime) ?? "00:00";
  const fromHours = windowFromDeadlineHours(input.deadlineHours ?? null);
  const windowValue =
    input.windowValue == null || !Number.isFinite(Number(input.windowValue))
      ? fromHours.windowValue
      : Number(input.windowValue);
  const windowUnit = input.windowUnit
    ? parseCancellationWindowUnit(input.windowUnit)
    : fromHours.windowUnit;

  if (windowValue == null) {
    return {
      kind: "named_fallback",
      label: name || "—",
      untilAt: null,
    };
  }

  const until = cancellationUntilInstant({
    arrivalDate: input.arrivalDate,
    windowValue,
    windowUnit,
    cutoffTime: cutoff,
    timeZone: input.timeZone,
  });
  if (!until) {
    return { kind: "named_fallback", label: name || "—", untilAt: null };
  }

  return {
    kind: "free_until",
    label: `Free cancellation until ${formatUntil(until.toISOString(), input.timeZone)}`,
    untilAt: until.toISOString(),
  };
}

export function cancellationUntilInstant(input: {
  arrivalDate: string;
  windowValue: number;
  windowUnit: CancellationWindowUnit;
  cutoffTime: string;
  timeZone: string | null | undefined;
}): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.arrivalDate)) return null;
  if (!Number.isFinite(input.windowValue) || input.windowValue < 0) return null;

  if (input.windowUnit === "days_before_arrival") {
    const date = addDaysIso(input.arrivalDate, -input.windowValue);
    return zonedMoment(date, input.cutoffTime, input.timeZone);
  }

  const arrivalClock = zonedMoment(input.arrivalDate, input.cutoffTime, input.timeZone);
  return new Date(arrivalClock.getTime() - input.windowValue * 60 * 60 * 1000);
}

export function breakfastLabelFromMealPlan(plan: {
  mealPlanId?: string | null;
  breakfastIncluded?: boolean;
}): string {
  if (!plan.mealPlanId) return "—";
  return plan.breakfastIncluded ? "Included" : "Not included";
}

export type { CancellationPolicyKind, CancellationWindowUnit };
