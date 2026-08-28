import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ASSIGNABLE_TABLE_ROLES,
  MANAGE_ROLES,
  audit,
  callerMembership,
  displayName,
  hoursBetween,
  isLate,
  loadMembership,
  loadShift,
  loadTable,
  requireManager,
  round2,
  scheduledHours,
  shiftMoment,
} from "./workforce.server";

/**
 * Workforce core server functions — shifts, attendance and waiter table
 * assignments. All privileged writes happen here; the browser never writes to
 * these tables (RLS grants SELECT only, scoped to owner/manager or self).
 */

export interface ShiftRecord {
  id: string;
  staffMembershipId: string;
  staffName: string | null;
  role: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  status: string;
  isSelf: boolean;
  attendanceStatus: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
}

export interface TableAssignmentRecord {
  id: string;
  shiftId: string;
  restaurantTableId: string;
  tableLabel: string;
  staffMembershipId: string;
  staffName: string | null;
  createdAt: string;
}

export interface AttendanceSummaryRow {
  staffMembershipId: string;
  staffName: string | null;
  role: string;
  scheduledShifts: number;
  completedShifts: number;
  lateShifts: number;
  missedShifts: number;
  missingCheckout: number;
  scheduledHours: number;
  workedHours: number;
}

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a HH:MM time.");

export const createShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        staffMembershipId: idSchema,
        shiftDate: dateSchema,
        startTime: timeSchema,
        endTime: timeSchema,
      })
      .refine((v) => v.endTime > v.startTime, { message: "End time must be after start time." })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireManager(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const target = await loadMembership(supabaseAdmin, data.restaurantId, data.staffMembershipId);
    if (!target.active) return { ok: false as const, message: "That staff member is not active." };

    const { data: shift, error } = await supabaseAdmin
      .from("staff_shifts")
      .insert({
        restaurant_id: data.restaurantId,
        staff_membership_id: target.id,
        shift_date: data.shiftDate,
        start_time: data.startTime,
        end_time: data.endTime,
        status: "scheduled",
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();

    if (error || !shift) {
      if (error && /unique|duplicate/i.test(error.message)) {
        return { ok: false as const, message: "That staff member already has a shift at this time." };
      }
      console.error("[createShift]", error?.message);
      return { ok: false as const, message: "We couldn't create that shift. Please try again." };
    }

    await audit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      targetUserId: target.user_id,
      action: "shift_created",
      metadata: { shift_id: shift.id, shift_date: data.shiftDate, start_time: data.startTime, end_time: data.endTime },
    });

    return { ok: true as const, shiftId: shift.id as string };
  });

export const cancelShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, shiftId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireManager(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const shift = await loadShift(supabaseAdmin, data.restaurantId, data.shiftId);
    if (shift.status === "cancelled") return { ok: true as const, unchanged: true };

    const { error } = await supabaseAdmin
      .from("staff_shifts")
      .update({ status: "cancelled" })
      .eq("id", shift.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) {
      console.error("[cancelShift]", error.message);
      return { ok: false as const, message: "We couldn't cancel that shift. Please try again." };
    }

    const target = await loadMembership(supabaseAdmin, data.restaurantId, shift.staff_membership_id);
    await audit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      targetUserId: target.user_id,
      action: "shift_cancelled",
      metadata: { shift_id: shift.id, shift_date: shift.shift_date },
    });
    return { ok: true as const };
  });

export const listShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        from: dateSchema,
        to: dateSchema,
        staffMembershipId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ role: string; canManage: boolean; shifts: ShiftRecord[] }> => {
    const me = await callerMembership(context, data.restaurantId);
    const canManage = (MANAGE_ROLES as readonly string[]).includes(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("staff_shifts")
      .select("id, staff_membership_id, shift_date, start_time, end_time, status")
      .eq("restaurant_id", data.restaurantId)
      .gte("shift_date", data.from)
      .lte("shift_date", data.to)
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true });

    // Non-managers only ever see their own shifts, whatever they ask for.
    const scopeTo = canManage ? data.staffMembershipId : me.id;
    if (scopeTo) query = query.eq("staff_membership_id", scopeTo);

    const { data: rows, error } = await query;
    if (error) throw new Error("We couldn't load the schedule right now.");
    const shifts = rows ?? [];

    const membershipIds = [...new Set(shifts.map((s) => s.staff_membership_id))];
    const names = new Map<string, { name: string | null; role: string }>();
    if (membershipIds.length > 0) {
      const { data: members } = await supabaseAdmin
        .from("restaurant_users")
        .select("id, user_id, role")
        .in("id", membershipIds);
      const userIds = (members ?? []).map((m) => m.user_id);
      const { data: profiles } = userIds.length
        ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
        : { data: [] as any[] };
      const byUser = new Map((profiles ?? []).map((p) => [p.id, displayName(p) ?? p.email]));
      for (const m of members ?? []) names.set(m.id, { name: byUser.get(m.user_id) ?? null, role: m.role });
    }

    const shiftIds = shifts.map((s) => s.id);
    const { data: attendance } = shiftIds.length
      ? await supabaseAdmin
          .from("staff_attendance")
          .select("shift_id, status, check_in_at, check_out_at")
          .in("shift_id", shiftIds)
      : { data: [] as any[] };
    const byShift = new Map((attendance ?? []).map((a) => [a.shift_id, a]));

    return {
      role: me.role,
      canManage,
      shifts: shifts.map((s) => {
        const a = byShift.get(s.id);
        return {
          id: s.id,
          staffMembershipId: s.staff_membership_id,
          staffName: names.get(s.staff_membership_id)?.name ?? null,
          role: names.get(s.staff_membership_id)?.role ?? "",
          shiftDate: s.shift_date,
          startTime: s.start_time,
          endTime: s.end_time,
          status: s.status,
          isSelf: s.staff_membership_id === me.id,
          attendanceStatus: a?.status ?? null,
          checkInAt: a?.check_in_at ?? null,
          checkOutAt: a?.check_out_at ?? null,
        };
      }),
    };
  });

export const assignTableToShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, shiftId: idSchema, restaurantTableId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireManager(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const shift = await loadShift(supabaseAdmin, data.restaurantId, data.shiftId);
    if (shift.status === "cancelled") {
      return { ok: false as const, message: "That shift has been cancelled." };
    }
    await loadTable(supabaseAdmin, data.restaurantId, data.restaurantTableId);
    const member = await loadMembership(supabaseAdmin, data.restaurantId, shift.staff_membership_id);
    if (!(ASSIGNABLE_TABLE_ROLES as readonly string[]).includes(member.role)) {
      return { ok: false as const, message: "Only waiters, managers or owners can be assigned to tables." };
    }

    const { data: existing } = await supabaseAdmin
      .from("staff_table_assignments")
      .select("id")
      .eq("shift_id", shift.id)
      .eq("restaurant_table_id", data.restaurantTableId)
      .maybeSingle();
    if (existing) return { ok: false as const, message: "This table is already assigned for this shift." };

    const { data: created, error } = await supabaseAdmin
      .from("staff_table_assignments")
      .insert({
        restaurant_id: data.restaurantId,
        restaurant_table_id: data.restaurantTableId,
        staff_membership_id: shift.staff_membership_id,
        shift_id: shift.id,
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();

    if (error || !created) {
      if (error && /unique|duplicate/i.test(error.message)) {
        return { ok: false as const, message: "This table is already assigned for this shift." };
      }
      console.error("[assignTableToShift]", error?.message);
      return { ok: false as const, message: "We couldn't assign that table. Please try again." };
    }

    await audit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      targetUserId: member.user_id,
      action: "table_assigned",
      metadata: { shift_id: shift.id, restaurant_table_id: data.restaurantTableId },
    });
    return { ok: true as const, assignmentId: created.id as string };
  });

export const removeTableAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, assignmentId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireManager(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("staff_table_assignments")
      .select("id, shift_id, restaurant_table_id, staff_membership_id")
      .eq("id", data.assignmentId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!row) return { ok: false as const, message: "That assignment could not be found." };

    const { error } = await supabaseAdmin
      .from("staff_table_assignments")
      .delete()
      .eq("id", row.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) {
      console.error("[removeTableAssignment]", error.message);
      return { ok: false as const, message: "We couldn't remove that assignment. Please try again." };
    }

    const member = await loadMembership(supabaseAdmin, data.restaurantId, row.staff_membership_id);
    await audit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      targetUserId: member.user_id,
      action: "table_unassigned",
      metadata: { shift_id: row.shift_id, restaurant_table_id: row.restaurant_table_id },
    });
    return { ok: true as const };
  });

export const listShiftTableAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, shiftId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<TableAssignmentRecord[]> => {
    const me = await callerMembership(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const shift = await loadShift(supabaseAdmin, data.restaurantId, data.shiftId);
    const canManage = (MANAGE_ROLES as readonly string[]).includes(me.role);
    if (!canManage && shift.staff_membership_id !== me.id) {
      throw new Error("You can only view your own table assignments.");
    }

    const { data: rows } = await supabaseAdmin
      .from("staff_table_assignments")
      .select("id, shift_id, restaurant_table_id, staff_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("shift_id", shift.id)
      .order("created_at", { ascending: true });

    const assignments = rows ?? [];
    if (assignments.length === 0) return [];

    const { data: tables } = await supabaseAdmin
      .from("restaurant_tables")
      .select("id, table_number, name")
      .in("id", [...new Set(assignments.map((a) => a.restaurant_table_id))]);
    const tableLabel = new Map((tables ?? []).map((t) => [t.id, t.name ? `${t.table_number} — ${t.name}` : t.table_number]));

    const member = await loadMembership(supabaseAdmin, data.restaurantId, shift.staff_membership_id);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", member.user_id)
      .maybeSingle();

    return assignments.map((a) => ({
      id: a.id,
      shiftId: a.shift_id,
      restaurantTableId: a.restaurant_table_id,
      tableLabel: tableLabel.get(a.restaurant_table_id) ?? "Table",
      staffMembershipId: a.staff_membership_id,
      staffName: displayName(profile) ?? profile?.email ?? null,
      createdAt: a.created_at,
    }));
  });

export const checkIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, shiftId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const shift = await loadShift(supabaseAdmin, data.restaurantId, data.shiftId);
    if (shift.staff_membership_id !== me.id) {
      return { ok: false as const, message: "You can only check in to your own shift." };
    }
    if (shift.status === "cancelled") return { ok: false as const, message: "That shift has been cancelled." };

    const { data: existing } = await supabaseAdmin
      .from("staff_attendance")
      .select("id, check_in_at")
      .eq("shift_id", shift.id)
      .eq("staff_membership_id", me.id)
      .maybeSingle();
    if (existing?.check_in_at) return { ok: false as const, message: "You have already checked in for this shift." };

    // Server time only — a browser-supplied timestamp is never accepted.
    const now = new Date();
    const status = isLate(shift.shift_date, shift.start_time, now) ? "late" : "checked_in";

    const { error } = await supabaseAdmin.from("staff_attendance").upsert(
      {
        ...(existing ? { id: existing.id } : {}),
        restaurant_id: data.restaurantId,
        staff_membership_id: me.id,
        shift_id: shift.id,
        check_in_at: now.toISOString(),
        status,
      },
      { onConflict: "shift_id,staff_membership_id" },
    );
    if (error) {
      console.error("[checkIn]", error.message);
      return { ok: false as const, message: "We couldn't record your check-in. Please try again." };
    }
    return { ok: true as const, status, checkInAt: now.toISOString() };
  });

export const checkOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, shiftId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const shift = await loadShift(supabaseAdmin, data.restaurantId, data.shiftId);
    if (shift.staff_membership_id !== me.id) {
      return { ok: false as const, message: "You can only check out of your own shift." };
    }

    const { data: attendance } = await supabaseAdmin
      .from("staff_attendance")
      .select("id, check_in_at, check_out_at")
      .eq("shift_id", shift.id)
      .eq("staff_membership_id", me.id)
      .maybeSingle();

    if (!attendance?.check_in_at) return { ok: false as const, message: "You haven't checked in for this shift yet." };
    if (attendance.check_out_at) return { ok: false as const, message: "You have already checked out of this shift." };

    const now = new Date();
    const { error } = await supabaseAdmin
      .from("staff_attendance")
      .update({ check_out_at: now.toISOString(), status: "completed" })
      .eq("id", attendance.id);
    if (error) {
      console.error("[checkOut]", error.message);
      return { ok: false as const, message: "We couldn't record your check-out. Please try again." };
    }

    return {
      ok: true as const,
      checkOutAt: now.toISOString(),
      workedHours: round2(hoursBetween(attendance.check_in_at, now.toISOString())),
    };
  });

export const getStaffAttendanceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, from: dateSchema, to: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AttendanceSummaryRow[]> => {
    await requireManager(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: shiftRows, error } = await supabaseAdmin
      .from("staff_shifts")
      .select("id, staff_membership_id, shift_date, start_time, end_time, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "scheduled")
      .gte("shift_date", data.from)
      .lte("shift_date", data.to);
    if (error) throw new Error("We couldn't build the attendance summary right now.");

    const shifts = shiftRows ?? [];
    const shiftIds = shifts.map((s) => s.id);
    const { data: attendanceRows } = shiftIds.length
      ? await supabaseAdmin
          .from("staff_attendance")
          .select("shift_id, staff_membership_id, check_in_at, check_out_at, status")
          .in("shift_id", shiftIds)
      : { data: [] as any[] };
    const byShift = new Map((attendanceRows ?? []).map((a) => [a.shift_id, a]));

    const membershipIds = [...new Set(shifts.map((s) => s.staff_membership_id))];
    const meta = new Map<string, { name: string | null; role: string }>();
    if (membershipIds.length > 0) {
      const { data: members } = await supabaseAdmin
        .from("restaurant_users")
        .select("id, user_id, role")
        .in("id", membershipIds);
      const userIds = (members ?? []).map((m) => m.user_id);
      const { data: profiles } = userIds.length
        ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
        : { data: [] as any[] };
      const byUser = new Map((profiles ?? []).map((p) => [p.id, displayName(p) ?? p.email]));
      for (const m of members ?? []) meta.set(m.id, { name: byUser.get(m.user_id) ?? null, role: m.role });
    }

    const now = Date.now();
    const summary = new Map<string, AttendanceSummaryRow>();
    for (const shift of shifts) {
      const key = shift.staff_membership_id;
      const row =
        summary.get(key) ??
        ({
          staffMembershipId: key,
          staffName: meta.get(key)?.name ?? null,
          role: meta.get(key)?.role ?? "",
          scheduledShifts: 0,
          completedShifts: 0,
          lateShifts: 0,
          missedShifts: 0,
          missingCheckout: 0,
          scheduledHours: 0,
          workedHours: 0,
        } satisfies AttendanceSummaryRow);

      row.scheduledShifts += 1;
      row.scheduledHours += scheduledHours(shift.shift_date, shift.start_time, shift.end_time);

      const attendance = byShift.get(shift.id);
      const shiftEnded = shiftMoment(shift.shift_date, shift.end_time).getTime() < now;

      if (!attendance?.check_in_at) {
        // Missed is derived, never written as a row.
        if (shiftEnded) row.missedShifts += 1;
      } else {
        if (attendance.status === "late") row.lateShifts += 1;
        if (attendance.check_out_at) {
          row.completedShifts += 1;
          row.workedHours += hoursBetween(attendance.check_in_at, attendance.check_out_at);
        } else if (shiftEnded) {
          row.missingCheckout += 1;
        }
      }
      summary.set(key, row);
    }

    return [...summary.values()]
      .map((r) => ({ ...r, scheduledHours: round2(r.scheduledHours), workedHours: round2(r.workedHours) }))
      .sort((a, b) => (a.staffName ?? "").localeCompare(b.staffName ?? ""));
  });
