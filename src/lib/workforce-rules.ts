/**
 * Workforce rules shared by the server functions and the UI.
 *
 * This module is intentionally client-safe: it holds the single lateness rule
 * so the browser never invents a second, inconsistent definition of "late".
 */

/** Minutes after shift start still counted as on time. Not restaurant-configurable yet. */
export const LATE_GRACE_MINUTES = 10;

/** Combines a shift date + local time string into a Date (UTC-based, matching stored timestamps). */
export function shiftMoment(shiftDate: string, time: string): Date {
  const [h = "0", m = "0", s = "0"] = time.split(":");
  return new Date(`${shiftDate}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}Z`);
}

export function isLate(shiftDate: string, startTime: string, checkInAt: Date): boolean {
  return checkInAt.getTime() > shiftMoment(shiftDate, startTime).getTime() + LATE_GRACE_MINUTES * 60_000;
}

/**
 * Late display for a shift row. Derived from the check-in timestamp, so a staff
 * member who checked in late still reads as late after checking out (the stored
 * attendance status becomes `completed` at checkout).
 */
export function wasLate(shiftDate: string, startTime: string, checkInAt: string | null): boolean {
  if (!checkInAt) return false;
  return isLate(shiftDate, startTime, new Date(checkInAt));
}

/** "09:00:00" -> "09:00" */
export function formatShiftTime(time: string): string {
  return time.slice(0, 5);
}

/** ISO timestamp -> "09:04" in the viewer's locale. */
export function formatClock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function todayIso(): string {
  const now = new Date();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
