/**
 * Workforce rules shared by the server functions and the UI.
 *
 * Client-safe on purpose: the browser and the server share one definition of
 * "late", one definition of a shift's real start/end instant, and one way to
 * render shift times. Every function takes the restaurant's IANA timezone —
 * shift clock times mean restaurant-local time, never UTC and never the
 * viewer's browser timezone.
 */

import {
  addDaysIso as addDaysIsoBase,
  formatClockInZone,
  localDateInZone,
  zonedMoment,
} from "@/shared/lib/property-time";

export { addDaysIsoBase as addDaysIso };

/** Minutes after shift start still counted as on time. Not restaurant-configurable yet. */
export const LATE_GRACE_MINUTES = 10;

/** A shift date + local clock time as the real instant in the restaurant's timezone. */
export function shiftMoment(shiftDate: string, time: string, timeZone: string | null | undefined): Date {
  return zonedMoment(shiftDate, time, timeZone);
}

export function isLate(
  shiftDate: string,
  startTime: string,
  checkInAt: Date,
  timeZone: string | null | undefined,
): boolean {
  return (
    checkInAt.getTime() > shiftMoment(shiftDate, startTime, timeZone).getTime() + LATE_GRACE_MINUTES * 60_000
  );
}

/**
 * Late display for a shift row. Derived from the check-in timestamp, so a staff
 * member who checked in late still reads as late after checking out (the stored
 * attendance status becomes `completed` at checkout).
 */
export function wasLate(
  shiftDate: string,
  startTime: string,
  checkInAt: string | null,
  timeZone: string | null | undefined,
): boolean {
  if (!checkInAt) return false;
  return isLate(shiftDate, startTime, new Date(checkInAt), timeZone);
}

/** "09:00:00" -> "09:00" (already restaurant-local, as stored). */
export function formatShiftTime(time: string): string {
  return time.slice(0, 5);
}

/** ISO timestamp -> "09:04" in the restaurant's timezone. */
export function formatClock(iso: string | null, timeZone: string | null | undefined): string {
  return formatClockInZone(iso, timeZone);
}

/** Today's date in the restaurant's timezone. */
export function todayIso(timeZone?: string | null): string {
  return localDateInZone(timeZone);
}

export type ShiftState =
  | "none"
  | "upcoming"
  | "awaiting_check_in"
  | "active"
  | "ended_without_check_in"
  | "ended_checked_in"
  | "completed";

export interface ShiftLike {
  shiftDate: string;
  startTime: string;
  endTime: string;
  status?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
}

/**
 * The single friendly-state rule. A shift counts as active when its local
 * window contains now, and also whenever staff are checked in and have not
 * checked out — that mismatch was the "you don't have a shift running" bug.
 */
export function shiftState(
  shift: ShiftLike | null | undefined,
  timeZone: string | null | undefined,
  now: Date = new Date(),
): ShiftState {
  if (!shift || shift.status === "cancelled") return "none";
  const t = now.getTime();
  const start = shiftMoment(shift.shiftDate, shift.startTime, timeZone).getTime();
  const end = shiftMoment(shift.shiftDate, shift.endTime, timeZone).getTime();
  const checkedIn = Boolean(shift.checkInAt);
  const checkedOut = Boolean(shift.checkOutAt);

  if (checkedOut) return "completed";
  if (checkedIn) return t > end ? "ended_checked_in" : "active";
  if (t < start) return "upcoming";
  if (t > end) return "ended_without_check_in";
  return "awaiting_check_in";
}

/** Plain-language line for a shift state, using restaurant-local shift times. */
export function shiftStateMessage(state: ShiftState, shift?: ShiftLike | null): string {
  const start = shift ? formatShiftTime(shift.startTime) : "";
  const end = shift ? formatShiftTime(shift.endTime) : "";
  switch (state) {
    case "upcoming":
      return `Your shift starts at ${start}`;
    case "awaiting_check_in":
      return "You haven't checked in yet";
    case "active":
      return "Your shift is active";
    case "ended_checked_in":
      return `Your shift ended at ${end}`;
    case "ended_without_check_in":
      return `Your shift ended at ${end}`;
    case "completed":
      return "Your shift has been completed";
    default:
      return "No shift is scheduled today";
  }
}
