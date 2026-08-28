/**
 * Workforce core (shifts, attendance, waiter table assignments) — server-only helpers.
 *
 * Every helper here re-derives the caller's membership from restaurant_users.
 * A restaurant id coming from the browser is never trusted on its own: it must
 * match an active membership of the caller, and every related row (shift,
 * table, target staff member) is re-checked against that same restaurant.
 */

/** Lateness rule lives in a client-safe module so the UI shares the same definition. */
export { LATE_GRACE_MINUTES, isLate, shiftMoment } from "./workforce-rules";
import { shiftMoment } from "./workforce-rules";


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

/** Combines a shift date + local time string into a Date (UTC-based, matching stored timestamps). */
export function shiftMoment(shiftDate: string, time: string): Date {
  const [h = "0", m = "0", s = "0"] = time.split(":");
  return new Date(`${shiftDate}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}Z`);
}

export function isLate(shiftDate: string, startTime: string, checkInAt: Date): boolean {
  return checkInAt.getTime() > shiftMoment(shiftDate, startTime).getTime() + LATE_GRACE_MINUTES * 60_000;
}

export function hoursBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

export function scheduledHours(shiftDate: string, startTime: string, endTime: string): number {
  const ms = shiftMoment(shiftDate, endTime).getTime() - shiftMoment(shiftDate, startTime).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function displayName(p?: { first_name?: string | null; last_name?: string | null } | null) {
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}
