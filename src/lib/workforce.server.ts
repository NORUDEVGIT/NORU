/**
 * Workforce core (shifts, attendance, waiter table assignments) — server-only helpers.
 *
 * Every helper here re-derives the caller's membership from restaurant_users.
 * A restaurant id coming from the browser is never trusted on its own: it must
 * match an active membership of the caller, and every related row (shift,
 * table, target staff member) is re-checked against that same restaurant.
 */

/** Lateness rule lives in a client-safe module so the UI shares the same definition. */
export { LATE_GRACE_MINUTES, isLate, shiftMoment, shiftState, todayIso, addDaysIso } from "./workforce-rules";
import { shiftMoment, shiftState, todayIso, addDaysIso } from "./workforce-rules";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "./restaurant-time";



export const MANAGE_ROLES = ["owner", "manager"] as const;
/** Roles that may be assigned to a table for operational coverage. */
export const ASSIGNABLE_TABLE_ROLES = ["waiter", "manager", "owner"] as const;

export interface AuthedCtx {
  supabase: { from: (t: string) => any };
  userId: string;
}

export interface Membership {
  id: string;
  role: string;
  restaurantId: string;
}

/** The caller's own active membership in this restaurant. Throws when absent. */
export async function callerMembership(context: AuthedCtx, restaurantId: string): Promise<Membership> {
  const { data } = await context.supabase
    .from("restaurant_users")
    .select("id, role, restaurant_id")
    .eq("user_id", context.userId)
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .maybeSingle();
  const row = data as { id: string; role: string; restaurant_id: string } | null;
  if (!row) throw new Error("You don't have access to this restaurant.");
  return { id: row.id, role: row.role, restaurantId: row.restaurant_id };
}

export async function requireManager(context: AuthedCtx, restaurantId: string): Promise<Membership> {
  const membership = await callerMembership(context, restaurantId);
  if (!(MANAGE_ROLES as readonly string[]).includes(membership.role)) {
    throw new Error("You don't have permission to manage scheduling for this restaurant.");
  }
  return membership;
}

/** A membership row that must belong to this exact restaurant. */
export async function loadMembership(admin: any, restaurantId: string, membershipId: string) {
  const { data } = await admin
    .from("restaurant_users")
    .select("id, user_id, role, active, restaurant_id")
    .eq("id", membershipId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That staff member could not be found.");
  return data as { id: string; user_id: string; role: string; active: boolean; restaurant_id: string };
}

export async function loadShift(admin: any, restaurantId: string, shiftId: string) {
  const { data } = await admin
    .from("staff_shifts")
    .select("id, restaurant_id, staff_membership_id, shift_date, start_time, end_time, status")
    .eq("id", shiftId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That shift could not be found.");
  return data as {
    id: string;
    restaurant_id: string;
    staff_membership_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    status: string;
  };
}

export async function loadTable(admin: any, restaurantId: string, tableId: string) {
  const { data } = await admin
    .from("restaurant_tables")
    .select("id, table_number, name, restaurant_id")
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That table could not be found.");
  return data as { id: string; table_number: string; name: string | null; restaurant_id: string };
}

export async function audit(
  admin: any,
  entry: {
    restaurantId: string;
    actorUserId: string;
    targetUserId: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  },
) {
  await admin.from("restaurant_staff_audit_log").insert({
    restaurant_id: entry.restaurantId,
    actor_user_id: entry.actorUserId,
    target_user_id: entry.targetUserId,
    action: entry.action,
    metadata: entry.metadata ?? null,
  });
}




export function hoursBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

export function scheduledHours(
  shiftDate: string,
  startTime: string,
  endTime: string,
  timeZone: string | null | undefined,
): number {
  const ms =
    shiftMoment(shiftDate, endTime, timeZone).getTime() - shiftMoment(shiftDate, startTime, timeZone).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

export interface RestaurantTimeSettings {
  timezone: string;
  currencyCode: string;
}

/**
 * The restaurant's configured timezone/currency. Single source of truth for
 * every server-side interpretation of shift clock times.
 */
export async function getRestaurantSettings(admin: any, restaurantId: string): Promise<RestaurantTimeSettings> {
  const { data } = await admin
    .from("restaurants")
    .select("timezone, currency_code")
    .eq("id", restaurantId)
    .maybeSingle();
  return {
    timezone: (data?.timezone as string) || DEFAULT_TIMEZONE,
    currencyCode: (data?.currency_code as string) || DEFAULT_CURRENCY,
  };
}

export interface ResolvedShift {
  shift: {
    id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    status: string;
  } | null;
  attendance: { check_in_at: string | null; check_out_at: string | null; status?: string } | null;
  state: ReturnType<typeof shiftState>;
  /** True when this member of staff may act as on-shift right now. */
  isActive: boolean;
}

/**
 * THE shared current-shift resolver. Every caller (waiter ordering, waiter
 * authorization, assigned-waiter resolution, shift UI) goes through this so
 * check-in and "is a shift running" can never disagree again.
 */
export async function resolveCurrentShift(
  admin: any,
  restaurantId: string,
  membershipId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<ResolvedShift> {
  const today = todayIso(timeZone);
  const { data } = await admin
    .from("staff_shifts")
    .select("id, shift_date, start_time, end_time, status")
    .eq("restaurant_id", restaurantId)
    .eq("staff_membership_id", membershipId)
    .eq("status", "scheduled")
    .gte("shift_date", addDaysIso(today, -1))
    .lte("shift_date", addDaysIso(today, 1))
    .order("shift_date", { ascending: true })
    .order("start_time", { ascending: true });

  const rows = (data ?? []) as {
    id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    status: string;
  }[];
  if (rows.length === 0) return { shift: null, attendance: null, state: "none", isActive: false };

  const shiftIds = rows.map((r) => r.id);
  const { data: attendanceRows } = await admin
    .from("staff_attendance")
    .select("shift_id, check_in_at, check_out_at, status")
    .in("shift_id", shiftIds);
  const byShift = new Map(
    ((attendanceRows ?? []) as any[]).map((a) => [a.shift_id as string, a as ResolvedShift["attendance"]]),
  );

  const evaluated = rows.map((shift) => {
    const attendance = byShift.get(shift.id) ?? null;
    const state = shiftState(
      {
        shiftDate: shift.shift_date,
        startTime: shift.start_time,
        endTime: shift.end_time,
        status: shift.status,
        checkInAt: attendance?.check_in_at ?? null,
        checkOutAt: attendance?.check_out_at ?? null,
      },
      timeZone,
      now,
    );
    return { shift, attendance, state, isActive: state === "active" };
  });

  // Prefer a genuinely running shift, then one waiting for check-in today,
  // then the nearest upcoming one, so the UI can explain what happens next.
  const rank: Record<string, number> = {
    active: 0,
    awaiting_check_in: 1,
    upcoming: 2,
    ended_checked_in: 3,
    completed: 4,
    ended_without_check_in: 5,
    none: 6,
  };
  evaluated.sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9));
  return evaluated[0] as ResolvedShift;
}


export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function displayName(p?: { first_name?: string | null; last_name?: string | null } | null) {
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}
