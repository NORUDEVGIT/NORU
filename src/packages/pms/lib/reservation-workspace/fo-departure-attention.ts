/**
 * Pure departure-day timing + FO Attention classification.
 * No server-fn, .server, React, FO check-in, or Housekeeping imports — safe for
 * the cross-package dashboard handler bundle.
 */

/** Local clock normalizer — avoid importing the SET1 settings graph. */
function normalizeClock(value: string | null | undefined): string {
  if (!value) return "";
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hh = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, "0");
  const mm = String(Math.min(59, Math.max(0, Number(match[2])))).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function zonedClockMinutes(iso: string, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  } catch {
    const date = new Date(iso);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

function clockMinutes(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Property-local HH:mm for an instant. Falls back to UTC clock on bad timezones. */
export function formatZonedClock(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    const date = new Date(iso);
    return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  }
}

export type DepartureDayTiming =
  | { kind: "before_checkout"; checkOutTime: string; deadlineLabel: string }
  | {
      kind: "approved_late_checkout";
      checkOutTime: string;
      lateCheckoutUntil: string;
      deadlineLabel: string;
    }
  | {
      kind: "departure_overdue";
      reason: "past_checkout" | "late_checkout_expired";
      checkOutTime: string;
      lateCheckoutUntil: string | null;
      deadlineLabel: string;
    };

/**
 * Same-day departure timing for a checked-in stay on the business date.
 * Calendar overstays (departureDate < businessDate) are handled by the caller.
 * Uses property timezone only — never the browser clock.
 */
export function evaluateDepartureDayTiming(params: {
  departureDate: string;
  businessDate: string;
  checkedAt: string;
  timezone: string;
  checkOutTime: string | null;
  lateCheckoutGranted: boolean;
  lateCheckoutUntil: string | null;
}): DepartureDayTiming | null {
  if (params.departureDate !== params.businessDate) return null;
  const checkOutTime = normalizeClock(params.checkOutTime) || "12:00";
  const nowMinutes = zonedClockMinutes(params.checkedAt, params.timezone);
  const checkoutMinutes = clockMinutes(checkOutTime);
  const lateUntil =
    params.lateCheckoutGranted && params.lateCheckoutUntil && !Number.isNaN(Date.parse(params.lateCheckoutUntil))
      ? new Date(params.lateCheckoutUntil).toISOString()
      : null;

  if (lateUntil) {
    const untilMinutes = zonedClockMinutes(lateUntil, params.timezone);
    const deadlineLabel = formatZonedClock(lateUntil, params.timezone);
    if (nowMinutes <= untilMinutes) {
      return {
        kind: "approved_late_checkout",
        checkOutTime,
        lateCheckoutUntil: lateUntil,
        deadlineLabel,
      };
    }
    return {
      kind: "departure_overdue",
      reason: "late_checkout_expired",
      checkOutTime,
      lateCheckoutUntil: lateUntil,
      deadlineLabel,
    };
  }

  if (nowMinutes <= checkoutMinutes) {
    return {
      kind: "before_checkout",
      checkOutTime,
      deadlineLabel: checkOutTime,
    };
  }

  return {
    kind: "departure_overdue",
    reason: "past_checkout",
    checkOutTime,
    lateCheckoutUntil: null,
    deadlineLabel: checkOutTime,
  };
}

/** FO Attention / rack labels for departure timing — same clock as Night Audit. */
export type FoDepartureAttentionKind =
  | "checkout_overdue"
  | "late_checkout_expired"
  | "calendar_overstay";

export type FoDepartureAttention = {
  kind: FoDepartureAttentionKind;
  label: string;
};

export const FO_DEPARTURE_ATTENTION_LABEL: Record<FoDepartureAttentionKind, string> = {
  checkout_overdue: "Checkout overdue",
  late_checkout_expired: "Late checkout expired",
  calendar_overstay: "Departure overdue",
};

/**
 * Front Office departure attention for a checked-in stay.
 * Calendar overstay is exclusive of same-day timing (no double classification).
 * Reuses evaluateDepartureDayTiming — never a second clock/date engine.
 */
export function classifyFoDepartureAttention(params: {
  status: string;
  departureDate: string;
  businessDate: string;
  checkedAt: string;
  timezone: string;
  checkOutTime: string | null;
  lateCheckoutGranted: boolean;
  lateCheckoutUntil: string | null;
}): FoDepartureAttention | null {
  if (params.status !== "checked_in") return null;
  if (params.departureDate < params.businessDate) {
    return {
      kind: "calendar_overstay",
      label: FO_DEPARTURE_ATTENTION_LABEL.calendar_overstay,
    };
  }
  if (params.departureDate !== params.businessDate) return null;
  const timing = evaluateDepartureDayTiming({
    departureDate: params.departureDate,
    businessDate: params.businessDate,
    checkedAt: params.checkedAt,
    timezone: params.timezone,
    checkOutTime: params.checkOutTime,
    lateCheckoutGranted: params.lateCheckoutGranted,
    lateCheckoutUntil: params.lateCheckoutUntil,
  });
  if (!timing || timing.kind !== "departure_overdue") return null;
  if (timing.reason === "late_checkout_expired") {
    return {
      kind: "late_checkout_expired",
      label: FO_DEPARTURE_ATTENTION_LABEL.late_checkout_expired,
    };
  }
  return {
    kind: "checkout_overdue",
    label: FO_DEPARTURE_ATTENTION_LABEL.checkout_overdue,
  };
}

/** Exported for late-checkout grant validation in arrivals-departures. */
export function lateCheckoutPastPropertyCheckout(params: {
  untilIso: string;
  checkOutTime: string | null;
  timezone: string;
}): boolean {
  const checkout = normalizeClock(params.checkOutTime) || "12:00";
  return zonedClockMinutes(params.untilIso, params.timezone) > clockMinutes(checkout);
}
