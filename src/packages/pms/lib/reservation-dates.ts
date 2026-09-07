/** Client-safe reservation date helpers and shared literals. */

export const RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "checked_in",
  "checked_out",
  "no_show",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Statuses a manager can set directly; operational ones go through Front Office actions. */
export const MANUAL_RESERVATION_STATUSES = ["pending", "confirmed", "cancelled"] as const;


/** Today as a plain calendar date in the property's IANA timezone. */
export function propertyToday(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function nightsBetween(arrival: string, departure: string): number {
  const a = Date.parse(`${arrival}T00:00:00Z`);
  const d = Date.parse(`${departure}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(d)) return 0;
  return Math.max(0, Math.round((d - a) / 86_400_000));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Reservation dates are plain calendar dates — format them without any timezone shift. */
export function formatStayDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
