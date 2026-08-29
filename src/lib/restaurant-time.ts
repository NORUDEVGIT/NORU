/**
 * Restaurant-local time and money formatting.
 *
 * `restaurants.timezone` (an IANA name) is the single source of truth for what
 * "now", "today" and a shift's clock time mean for a restaurant. Stored
 * timestamps stay UTC — everything here is interpretation and presentation.
 *
 * This module is client-safe so the browser and the server share one
 * definition and can never disagree about when a shift runs.
 */

export const DEFAULT_TIMEZONE = "Europe/London";
export const DEFAULT_CURRENCY = "GBP";

export const COMMON_TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Lisbon",
  "Africa/Addis_Ababa",
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
] as const;

export const COMMON_CURRENCIES = [
  { code: "GBP", label: "British Pound (£)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "ETB", label: "Ethiopian Birr (Br)" },
  { code: "AED", label: "UAE Dirham" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "INR", label: "Indian Rupee" },
  { code: "KES", label: "Kenyan Shilling" },
  { code: "NGN", label: "Nigerian Naira" },
  { code: "ZAR", label: "South African Rand" },
] as const;

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIMEZONE;
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

/** The zone's UTC offset, in minutes, at a given instant. DST-aware. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]) === 24 ? 0 : Number(parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * Converts a restaurant-local calendar date + clock time into the real UTC
 * instant it refers to. Two passes handle DST boundaries correctly.
 */
export function zonedMoment(date: string, time: string, timeZone: string | null | undefined): Date {
  const zone = safeZone(timeZone);
  const [h = "0", m = "0", s = "0"] = String(time).split(":");
  const naive = Date.parse(
    `${date}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}Z`,
  );
  const first = new Date(naive - offsetMinutes(new Date(naive), zone) * 60_000);
  return new Date(naive - offsetMinutes(first, zone) * 60_000);
}

/** Restaurant-local calendar date ("2026-08-29") for an instant. */
export function localDateInZone(
  timeZone: string | null | undefined,
  instant: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return parts;
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "09:04" in restaurant-local time. */
export function formatClockInZone(iso: string | null | undefined, timeZone: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: safeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "29 Aug 2026 · 09:04" in restaurant-local time. */
export function formatDateTimeInZone(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
  opts: { withYear?: boolean } = {},
): string {
  if (!iso) return "—";
  const zone = safeZone(timeZone);
  const date = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    day: "numeric",
    month: "short",
    ...(opts.withYear === false ? {} : { year: "numeric" }),
  }).format(new Date(iso));
  return `${date} · ${formatClockInZone(iso, zone)}`;
}

export function formatDateInZone(iso: string | null | undefined, timeZone: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: safeZone(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** Money in the restaurant's configured currency. */
export function formatMoney(value: number, currencyCode?: string | null): string {
  const currency = (currencyCode || DEFAULT_CURRENCY).toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
