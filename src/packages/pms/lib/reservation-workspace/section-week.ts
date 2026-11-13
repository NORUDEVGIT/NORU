/** Shared Reservations week window. Checkout is exclusive, matching the desk stay overlap. */

export function stayOverlapsWindow(
  arrival: string,
  departure: string,
  windowStart: string,
  windowEnd: string,
): boolean {
  return Boolean(arrival && departure && windowStart && windowEnd) &&
    departure > windowStart &&
    arrival <= windowEnd;
}

/** Inclusive calendar day, used for arrivals, departures, and single-night events. */
export function dateFallsInWindow(date: string, windowStart: string, windowEnd: string): boolean {
  return Boolean(date && windowStart && windowEnd) && date >= windowStart && date <= windowEnd;
}

/**
 * A stay overlaps the window. A single-night event stores the same date twice
 * and matches when that day falls in the window.
 */
export function eventOverlapsWindow(
  arrival: string,
  departure: string,
  windowStart: string,
  windowEnd: string,
): boolean {
  if (!arrival || !departure) return false;
  if (arrival === departure) return dateFallsInWindow(arrival, windowStart, windowEnd);
  return stayOverlapsWindow(arrival, departure, windowStart, windowEnd);
}

export function eachDateInclusive(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const dates: string[] = [];
  let cursor = start;
  for (let guard = 0; guard < 31 && cursor <= end; guard += 1) {
    dates.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return dates;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday of the week that contains `isoDate`. Weeks start on Monday. */
export function reservationMondayOf(isoDate: string): string {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return shiftDate(isoDate, delta);
}

/** Inclusive last day. A 7-day horizon that starts on Monday ends on Sunday. */
export function reservationRangeEnd(start: string, horizon: number): string {
  return shiftDate(start, Math.max(1, horizon) - 1);
}

/**
 * Start used by every Reservations section.
 * Seven days stays on the Monday of the stored day. Other horizons keep that day.
 */
export function reservationRangeStart(input: {
  storedStart: string | null;
  horizon: number;
  businessDate: string;
}): string {
  const anchor = input.storedStart ?? input.businessDate;
  return input.horizon === 7 ? reservationMondayOf(anchor) : anchor;
}

/** Move the window by the selected horizon. A week lands on the next or previous Monday. */
export function shiftReservationRange(start: string, horizon: number, direction: -1 | 1): string {
  const shifted = shiftDate(start, direction * Math.max(1, horizon));
  return horizon === 7 ? reservationMondayOf(shifted) : shifted;
}

/**
 * A picked date snaps to its Monday on the 7-day horizon.
 * One, 14, and 30 days start on the picked date.
 */
export function reservationStartAfterPick(date: string, horizon: number): string {
  return horizon === 7 ? reservationMondayOf(date) : date;
}

/**
 * Seven days becomes the Monday–Sunday week containing the current start.
 * One day uses the business date when it sits in the current window, otherwise the start.
 * Fourteen and 30 days keep the current start and grow from there.
 */
export function reservationStartAfterHorizonChange(input: {
  currentStart: string;
  currentHorizon: number;
  nextHorizon: number;
  businessDate: string;
}): string {
  if (input.nextHorizon === 7) return reservationMondayOf(input.currentStart);
  if (input.nextHorizon === 1) {
    const end = reservationRangeEnd(input.currentStart, input.currentHorizon);
    if (input.businessDate >= input.currentStart && input.businessDate <= end) {
      return input.businessDate;
    }
    return input.currentStart;
  }
  return input.currentStart;
}

/** `9–15 Nov 2026`, `11 Nov 2026`, or the month and year repeated when the span crosses them. */
export function formatInclusiveRangeLabel(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const day = (date: Date) => String(date.getUTCDate());
  const month = (date: Date) =>
    date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  if (start === end) return `${day(startDate)} ${month(startDate)} ${startDate.getUTCFullYear()}`;
  const sameMonth =
    startDate.getUTCMonth() === endDate.getUTCMonth() &&
    startDate.getUTCFullYear() === endDate.getUTCFullYear();
  if (sameMonth) {
    return `${day(startDate)}–${day(endDate)} ${month(endDate)} ${endDate.getUTCFullYear()}`;
  }
  if (startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    return `${day(startDate)} ${month(startDate)} – ${day(endDate)} ${month(endDate)} ${endDate.getUTCFullYear()}`;
  }
  return `${day(startDate)} ${month(startDate)} ${startDate.getUTCFullYear()} – ${day(endDate)} ${month(endDate)} ${endDate.getUTCFullYear()}`;
}
