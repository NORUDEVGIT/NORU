/**
 * Night Audit Window: the property-local interval in which a normal
 * authorized user may manually close the business date. It only gates manual
 * close availability. It never starts, closes, schedules, or rolls anything.
 */

export const NIGHT_AUDIT_OUTSIDE_WINDOW = "NIGHT_AUDIT_OUTSIDE_WINDOW";
export const NIGHT_AUDIT_INVALID_WINDOW = "NIGHT_AUDIT_INVALID_WINDOW";
export const NIGHT_AUDIT_WINDOW_EQUAL_TIMES_MESSAGE =
  "Night Audit window start and end times must be different.";

export const NIGHT_AUDIT_WINDOW_DEFAULT = { start: "00:00", end: "04:00" } as const;

export const OWNER_OUTSIDE_WINDOW_COPY =
  "Owner access: closing outside the configured Night Audit window.";

/** Roles allowed to close outside the configured window. A future Night Auditor role is NOT included. */
const NIGHT_AUDIT_WINDOW_BYPASS_ROLES = ["owner"] as const;

export function canBypassNightAuditWindow(role: string): boolean {
  return (NIGHT_AUDIT_WINDOW_BYPASS_ROLES as readonly string[]).includes(role);
}

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
 * Inclusive start, exclusive end. When end is earlier than start the window
 * crosses midnight (23:00 -> 04:00). Equal start and end is invalid and never
 * opens the close gate.
 */
export function isWithinNightAuditWindow(
  startMinutes: number,
  endMinutes: number,
  nowMinutes: number,
): boolean {
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
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

export type NightAuditWindowState = {
  start: string;
  end: string;
  /** e.g. "23:00 – 04:00" */
  label: string;
  timezone: string;
  /** Property-local "HH:MM" when evaluated. */
  localTime: string;
  open: boolean;
  /** This caller may close now as far as the window is concerned. */
  allowsClose: boolean;
  /** Owner closing while the window is closed. */
  ownerBypass: boolean;
  /** False when saved configuration cannot safely describe a close window. */
  configValid: boolean;
  message: string;
};

/** One evaluation used by the close server action and the UI. Malformed config falls back to the default. */
export function evaluateNightAuditWindow(input: {
  start: string | null | undefined;
  end: string | null | undefined;
  timezone: string;
  role: string;
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
  const open = configValid && isWithinNightAuditWindow(start, end, nowMinutes);
  const bypass = canBypassNightAuditWindow(input.role);
  return {
    start: hhmm(start),
    end: hhmm(end),
    label: `${hhmm(start)} – ${hhmm(end)}`,
    timezone: input.timezone,
    localTime: hhmm(nowMinutes),
    open,
    allowsClose: open || bypass,
    ownerBypass: !open && bypass,
    configValid,
    message: configValid
      ? outsideWindowMessage(start, end)
      : NIGHT_AUDIT_WINDOW_EQUAL_TIMES_MESSAGE,
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

/** Run-summary audit fact written only when an owner closes outside the window. */
export type OutsideWindowClose = {
  outsideWindow: true;
  windowStart: string;
  windowEnd: string;
  timezone: string;
  localTime: string;
  requestedAt: string;
  actorMembershipId: string;
};

export function outsideWindowCloseRecord(
  state: NightAuditWindowState,
  actorMembershipId: string,
  requestedAt: string,
): OutsideWindowClose | null {
  if (!state.ownerBypass) return null;
  return {
    outsideWindow: true,
    windowStart: state.start,
    windowEnd: state.end,
    timezone: state.timezone,
    localTime: state.localTime,
    requestedAt,
    actorMembershipId,
  };
}
