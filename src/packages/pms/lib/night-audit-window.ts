/**
 * Night Audit Window: the property-local interval for normal business-date close.
 * It only gates manual close. It never starts, closes, schedules, or rolls the hotel day.
 *
 * Phases:
 * - before_start — prepare End of Day; normal close blocked; early close needs explicit override
 * - open — normal close allowed
 * - after_end — End of Day overdue; normal close still allowed (hotel must not be trapped)
 * - invalid — misconfigured window
 */

export const NIGHT_AUDIT_OUTSIDE_WINDOW = "NIGHT_AUDIT_OUTSIDE_WINDOW";
export const NIGHT_AUDIT_INVALID_WINDOW = "NIGHT_AUDIT_INVALID_WINDOW";
export const NIGHT_AUDIT_EARLY_OVERRIDE_REQUIRED = "NIGHT_AUDIT_EARLY_OVERRIDE_REQUIRED";
export const NIGHT_AUDIT_WINDOW_EQUAL_TIMES_MESSAGE =
  "Night Audit window start and end times must be different.";

export const NIGHT_AUDIT_WINDOW_DEFAULT = { start: "00:00", end: "04:00" } as const;

export const WINDOW_OVERRIDE_COPY =
  "Closing the business date before the configured Night Audit window is an exceptional action.";

export const EARLY_WINDOW_STATUS = "Waiting for Night Audit window";
export const OPEN_WINDOW_STATUS = "Ready to Close";
export const OVERDUE_WINDOW_STATUS = "End of Day overdue";
export const OVERDUE_WINDOW_COPY =
  "The configured Night Audit window has passed. Complete End of Day to advance the hotel business date.";

/** "HH:MM" -> minutes after midnight, or null when malformed. */
export function parseWindowTime(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Wall-clock minutes after midnight in the property timezone. */
export function propertyLocalMinutes(timezone: string, now: Date = new Date()): number {
  const read = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return (hour % 24) * 60 + minute;
  };
  try {
    return read(timezone);
  } catch {
    return read("UTC");
  }
}

/**
 * Inclusive start and inclusive end.
 * When end is earlier than start the window crosses midnight (22:00 → 02:00).
 * Equal start and end is invalid and never opens the close gate.
 */
export function isWithinNightAuditWindow(
  startMinutes: number,
  endMinutes: number,
  nowMinutes: number,
): boolean {
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

export type NightAuditWindowPhase = "before_start" | "open" | "after_end" | "invalid";

/**
 * Classify relative to the configured window.
 * Wrapping outside gap (end < now < start) splits at the midpoint:
 * nearer the morning end → after_end (missed overnight close; normal close still allowed);
 * nearer the evening start → before_start (waiting for tonight; early close needs override).
 */
export function classifyNightAuditWindowPhase(
  startMinutes: number,
  endMinutes: number,
  nowMinutes: number,
  configValid: boolean,
): NightAuditWindowPhase {
  if (!configValid || startMinutes === endMinutes) return "invalid";
  if (isWithinNightAuditWindow(startMinutes, endMinutes, nowMinutes)) return "open";
  if (startMinutes < endMinutes) {
    return nowMinutes < startMinutes ? "before_start" : "after_end";
  }
  // Wrapping: end < now < start. Split the gap so morning after end is overdue
  // and afternoon/evening before start is still "waiting for window".
  const midpoint = Math.floor((endMinutes + startMinutes) / 2);
  return nowMinutes <= midpoint ? "after_end" : "before_start";
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function twelveHour(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const suffix = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}

export function outsideWindowMessage(startMinutes: number, endMinutes: number): string {
  return `Night Audit can be closed between ${twelveHour(startMinutes)} and ${twelveHour(endMinutes)}.`;
}

export function nightAuditWindowHasNotStartedMessage(
  startMinutes: number,
  endMinutes: number,
  localTime: string,
): string {
  return `Night Audit window has not started (${hhmm(startMinutes)} – ${hhmm(endMinutes)}). Current property time ${localTime}.`;
}

export type NightAuditWindowState = {
  start: string;
  end: string;
  /** e.g. "22:00 – 23:00" */
  label: string;
  timezone: string;
  /** Property-local "HH:MM" when evaluated. */
  localTime: string;
  phase: NightAuditWindowPhase;
  open: boolean;
  /**
   * Normal close is allowed (inside window or overdue after end).
   * Does NOT include early-before-start override capability.
   */
  allowsClose: boolean;
  /** True when phase is before_start and the actor holds window_override. */
  canOfferEarlyOverride: boolean;
  /**
   * @deprecated Prefer phase + allowsClose + canOfferEarlyOverride.
   * Kept true only when an explicit early override is being applied for audit helpers.
   */
  windowOverride: boolean;
  /** False when saved configuration cannot safely describe a close window. */
  configValid: boolean;
  message: string;
  statusLabel: string;
};

/** One evaluation used by the close server action and the UI. Malformed config falls back to the default. */
export function evaluateNightAuditWindow(input: {
  start: string | null | undefined;
  end: string | null | undefined;
  timezone: string;
  /** night_audit.business_date.window_override — capability only, not silent bypass. */
  canOverride: boolean;
  /**
   * Explicit early-close intent from the exceptional UI/server path.
   * Permission alone never sets this.
   */
  earlyOverrideIntent?: boolean;
  /** Passed by the persisted-config reader for invalid legacy values. */
  configValid?: boolean;
  now?: Date;
}): NightAuditWindowState {
  const start =
    parseWindowTime(input.start) ?? (parseWindowTime(NIGHT_AUDIT_WINDOW_DEFAULT.start) as number);
  const end =
    parseWindowTime(input.end) ?? (parseWindowTime(NIGHT_AUDIT_WINDOW_DEFAULT.end) as number);
  const configValid = input.configValid !== false && start !== end;
  const nowMinutes = propertyLocalMinutes(input.timezone, input.now);
  const localTime = hhmm(nowMinutes);
  const phase = classifyNightAuditWindowPhase(start, end, nowMinutes, configValid);
  const open = phase === "open";
  const allowsClose = phase === "open" || phase === "after_end";
  const canOfferEarlyOverride = phase === "before_start" && input.canOverride === true;
  const earlyOverrideActive =
    phase === "before_start" && input.canOverride === true && input.earlyOverrideIntent === true;

  let message: string;
  let statusLabel: string;
  if (!configValid) {
    message = NIGHT_AUDIT_WINDOW_EQUAL_TIMES_MESSAGE;
    statusLabel = "Night Audit window invalid";
  } else if (phase === "before_start") {
    message = nightAuditWindowHasNotStartedMessage(start, end, localTime);
    statusLabel = EARLY_WINDOW_STATUS;
  } else if (phase === "after_end") {
    message = OVERDUE_WINDOW_COPY;
    statusLabel = OVERDUE_WINDOW_STATUS;
  } else {
    message = outsideWindowMessage(start, end);
    statusLabel = OPEN_WINDOW_STATUS;
  }

  return {
    start: hhmm(start),
    end: hhmm(end),
    label: `${hhmm(start)} – ${hhmm(end)}`,
    timezone: input.timezone,
    localTime,
    phase,
    open,
    allowsClose: allowsClose || earlyOverrideActive,
    canOfferEarlyOverride,
    windowOverride: earlyOverrideActive,
    configValid,
    message,
    statusLabel,
  };
}

/** Night Audit Window fields from restaurants.business_date_config. */
export function nightAuditWindowConfig(config: unknown): {
  start: string;
  end: string;
  configValid: boolean;
} {
  const rec = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  const start = String(rec["nightAuditWindowStart"] ?? "").trim();
  const end = String(rec["nightAuditWindowEnd"] ?? "").trim();
  const parsedStart = parseWindowTime(start);
  const parsedEnd = parseWindowTime(end);
  const normalizedStart =
    parsedStart == null ? NIGHT_AUDIT_WINDOW_DEFAULT.start : hhmm(parsedStart);
  const normalizedEnd = parsedEnd == null ? NIGHT_AUDIT_WINDOW_DEFAULT.end : hhmm(parsedEnd);
  return {
    start: normalizedStart,
    end: normalizedEnd,
    // Equal legacy values are a known invalid configuration, never a 24-hour
    // window. Other malformed values retain the historical safe default.
    configValid: parsedStart == null || parsedEnd == null ? true : parsedStart !== parsedEnd,
  };
}

/** Settings validation shared with the save action. */
export function nightAuditWindowConfigProblem(start: string, end: string): string | null {
  const parsedStart = parseWindowTime(start);
  const parsedEnd = parseWindowTime(end);
  if (parsedStart != null && parsedEnd != null && parsedStart === parsedEnd) {
    return NIGHT_AUDIT_WINDOW_EQUAL_TIMES_MESSAGE;
  }
  return null;
}

/**
 * Shared chrome operational notice — never advances the hotel day.
 * - none: before window (or no attention needed)
 * - due: inside the configured Night Audit window while business date is still open
 * - overdue: after window end (or calendar past business date outside the window) while still open
 */
export type EndOfDayBannerKind = "none" | "due" | "overdue";

/**
 * Classify the shared PMS Night Audit banner from authoritative business date +
 * property-local window phase. Does not invent or roll the hotel day.
 */
export function classifyEndOfDayBanner(input: {
  businessDate: string;
  timezone: string;
  windowStart: string | null | undefined;
  windowEnd: string | null | undefined;
  propertyCalendarDate: string;
  now?: Date;
}): EndOfDayBannerKind {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)) return "none";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.propertyCalendarDate)) return "none";
  // Hotel day ahead of the property calendar is not an End of Day attention state.
  if (input.propertyCalendarDate < input.businessDate) return "none";

  const window = nightAuditWindowConfig({
    nightAuditWindowStart: input.windowStart,
    nightAuditWindowEnd: input.windowEnd,
  });
  const startMinutes = parseWindowTime(window.start);
  const endMinutes = parseWindowTime(window.end);
  if (startMinutes == null || endMinutes == null || !window.configValid) return "none";
  const nowMinutes = propertyLocalMinutes(input.timezone, input.now);
  const phase = classifyNightAuditWindowPhase(
    startMinutes,
    endMinutes,
    nowMinutes,
    window.configValid,
  );

  // Inside the window (including wrapping after midnight) → due, not overdue.
  if (phase === "open") return "due";
  if (phase === "after_end") return "overdue";
  if (phase === "before_start") {
    // Still on a prior hotel day after the calendar moved on → overdue (no silent hide).
    if (input.propertyCalendarDate > input.businessDate) return "overdue";
    // Same calendar day, window not started → keep operational chrome clean.
    return "none";
  }
  return "none";
}

/** @deprecated Prefer classifyEndOfDayBanner — kept for callers that only need overdue. */
export function isEndOfDayPending(input: {
  businessDate: string;
  timezone: string;
  windowStart: string | null | undefined;
  windowEnd: string | null | undefined;
  propertyCalendarDate: string;
  now?: Date;
}): boolean {
  return classifyEndOfDayBanner(input) === "overdue";
}

export function endOfDayPendingCopy(businessDate: string): { title: string; detail: string } {
  const label = formatBusinessDateLabel(businessDate);
  return {
    title: "End of Day overdue",
    detail: `Business date ${label} has not been closed. Complete Night Audit to advance the hotel business date.`,
  };
}

/** Shared chrome copy while the Night Audit window is open and the hotel day is still open. */
export function endOfDayDueCopy(input: {
  businessDate: string;
  windowLabel: string;
}): { title: string; detail: string } {
  const label = formatBusinessDateLabel(input.businessDate);
  return {
    title: "Night Audit due",
    detail: `Business date ${label} is ready for End of Day. Complete Night Audit to close the hotel day. Window ${input.windowLabel}.`,
  };
}

/** @deprecated Prefer endOfDayDueCopy — scheduled banners are no longer shown globally. */
export function endOfDayScheduledCopy(input: {
  businessDate: string;
  windowLabel: string;
  localTime: string;
}): { title: string; detail: string } {
  return endOfDayDueCopy({
    businessDate: input.businessDate,
    windowLabel: input.windowLabel,
  });
}

function formatBusinessDateLabel(businessDate: string): string {
  try {
    return new Date(`${businessDate}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return businessDate;
  }
}

/** Run-summary audit fact for an explicit early-window override close. */
export type OutsideWindowClose = {
  outsideWindow: true;
  earlyOverride: true;
  windowStart: string;
  windowEnd: string;
  timezone: string;
  localTime: string;
  requestedAt: string;
  actorMembershipId: string;
  reason: string;
};

export function outsideWindowCloseRecord(
  state: NightAuditWindowState,
  actorMembershipId: string,
  requestedAt: string,
  reason: string,
): OutsideWindowClose | null {
  if (!state.windowOverride) return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;
  return {
    outsideWindow: true,
    earlyOverride: true,
    windowStart: state.start,
    windowEnd: state.end,
    timezone: state.timezone,
    localTime: state.localTime,
    requestedAt,
    actorMembershipId,
    reason: trimmed.slice(0, 500),
  };
}
