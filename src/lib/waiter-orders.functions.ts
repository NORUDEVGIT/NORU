/**
 * Waiter-assisted ordering.
 *
 * This is NOT a second ordering engine: the write goes through the same shared
 * pipeline as customer QR ordering (`order-core.server`). Everything here is
 * authorization, current-shift/attendance enforcement and server-derived
 * identity.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { callerMembership, MANAGE_ROLES } from "./workforce.server";
import { shiftMoment, todayIso, addDaysIso } from "./workforce-rules";

const idSchema = z.string().uuid();

const lineSchema = z.object({
  menuItemId: idSchema,
  quantity: z.number().int().positive().max(20),
  specialInstructions: z.string().max(500).nullable().optional(),
});

export interface WaiterTableOption {
  id: string;
  label: string;
}

export interface WaiterContext {
  role: string;
  /** Owners/managers may take an order for any active table without a shift. */
  isManager: boolean;
  canOrder: boolean;
  /** Why ordering is blocked, in plain language. */
  blockedReason: string | null;
  shift: { id: string; startTime: string; endTime: string; checkedInAt: string | null } | null;
  tables: WaiterTableOption[];
  menu: { id: string; name: string; price: number; category: string }[];
}

/** The waiter's current shift (scheduled and covering right now), if any. */
async function currentShift(admin: any, restaurantId: string, membershipId: string, now: Date) {
  const today = todayIso();
  const { data } = await admin
    .from("staff_shifts")
    .select("id, shift_date, start_time, end_time, status")
    .eq("restaurant_id", restaurantId)
    .eq("staff_membership_id", membershipId)
    .eq("status", "scheduled")
    .gte("shift_date", addDaysIso(today, -1))
    .lte("shift_date", addDaysIso(today, 1));

  const rows = (data ?? []) as {
    id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
  }[];
  return (
    rows.find((s) => {
      const t = now.getTime();
      return (
        t >= shiftMoment(s.shift_date, s.start_time).getTime() &&
        t <= shiftMoment(s.shift_date, s.end_time).getTime()
      );
    }) ?? null
  );
}

async function attendanceFor(admin: any, shiftId: string) {
  const { data } = await admin
    .from("staff_attendance")
    .select("check_in_at, check_out_at, status")
    .eq("shift_id", shiftId)
    .maybeSingle();
  return (data as { check_in_at: string | null; check_out_at: string | null } | null) ?? null;
}

/**
 * Resolves what this member of staff may currently do, and returns only the
 * tables they are actually allowed to order for.
 */
export const getWaiterOrderContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<WaiterContext> => {
    const me = await callerMembership(context, data.restaurantId);
    const isManager = (MANAGE_ROLES as readonly string[]).includes(me.role);
    if (!isManager && me.role !== "waiter") {
      throw new Error("You don't have permission to take orders for this restaurant.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();

    const { data: menuRows } = await supabaseAdmin
      .from("menu_items")
      .select("id, name, price, category")
      .eq("restaurant_id", data.restaurantId)
      .eq("available", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    const menu = (menuRows ?? []).map((m: any) => ({
      id: m.id as string,
      name: m.name as string,
      price: Number(m.price),
      category: (m.category as string) ?? "Menu",
    }));

    if (isManager) {
      const { data: tables } = await supabaseAdmin
        .from("restaurant_tables")
        .select("id, table_number, name")
        .eq("restaurant_id", data.restaurantId)
        .eq("active", true)
        .order("table_number", { ascending: true });
      return {
        role: me.role,
        isManager,
        canOrder: (tables ?? []).length > 0,
        blockedReason: (tables ?? []).length > 0 ? null : "No active tables have been set up yet.",
        shift: null,
        tables: (tables ?? []).map((t: any) => ({
          id: t.id as string,
          label: t.name ? `${t.table_number} · ${t.name}` : (t.table_number as string),
        })),
        menu,
      };
    }

    const shift = await currentShift(supabaseAdmin, data.restaurantId, me.id, now);
    if (!shift) {
      return {
        role: me.role,
        isManager,
        canOrder: false,
        blockedReason: "You don't have a shift running right now.",
        shift: null,
        tables: [],
        menu,
      };
    }

    const attendance = await attendanceFor(supabaseAdmin, shift.id);
    const shiftInfo = {
      id: shift.id,
      startTime: shift.start_time,
      endTime: shift.end_time,
      checkedInAt: attendance?.check_in_at ?? null,
    };

    if (!attendance?.check_in_at) {
      return {
        role: me.role,
        isManager,
        canOrder: false,
        blockedReason: "Check in for your shift before taking orders.",
        shift: shiftInfo,
        tables: [],
        menu,
      };
    }
    if (attendance.check_out_at) {
      return {
        role: me.role,
        isManager,
        canOrder: false,
        blockedReason: "You've checked out of this shift.",
        shift: shiftInfo,
        tables: [],
        menu,
      };
    }

    const { data: assignments } = await supabaseAdmin
      .from("staff_table_assignments")
      .select("restaurant_table_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("shift_id", shift.id)
      .eq("staff_membership_id", me.id);

    const tableIds = (assignments ?? []).map((a: any) => a.restaurant_table_id as string);
    const { data: tables } = tableIds.length
      ? await supabaseAdmin
          .from("restaurant_tables")
          .select("id, table_number, name, active")
          .eq("restaurant_id", data.restaurantId)
          .eq("active", true)
          .in("id", tableIds)
          .order("table_number", { ascending: true })
      : { data: [] as any[] };

    return {
      role: me.role,
      isManager,
      canOrder: (tables ?? []).length > 0,
      blockedReason: (tables ?? []).length > 0 ? null : "No tables are assigned to your shift yet.",
      shift: shiftInfo,
      tables: (tables ?? []).map((t: any) => ({
        id: t.id as string,
        label: t.name ? `${t.table_number} · ${t.name}` : (t.table_number as string),
      })),
      menu,
    };
  });

export const placeWaiterAssistedOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        restaurantTableId: idSchema,
        lines: z.array(lineSchema).min(1).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    const isManager = (MANAGE_ROLES as readonly string[]).includes(me.role);
    if (!isManager && me.role !== "waiter") {
      return { ok: false as const, message: "You don't have permission to take orders." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveOrderLines } = await import("./order-pricing.server");
    const core = await import("./order-core.server");
    const now = new Date();

    const restaurantResult = await core.resolveRestaurant(supabaseAdmin, { id: data.restaurantId });
    if (!restaurantResult.ok) return { ok: false as const, message: restaurantResult.message };

    const tableResult = await core.resolveRestaurantTable(supabaseAdmin, data.restaurantId, {
      tableId: data.restaurantTableId,
    });
    if (!tableResult.ok) return { ok: false as const, message: tableResult.message };

    // Waiters must be on a running shift, checked in, and assigned this table.
    if (!isManager) {
      const shift = await currentShift(supabaseAdmin, data.restaurantId, me.id, now);
      if (!shift) return { ok: false as const, message: "You don't have a shift running right now." };
      const attendance = await attendanceFor(supabaseAdmin, shift.id);
      if (!attendance?.check_in_at) {
        return { ok: false as const, message: "Check in for your shift before taking orders." };
      }
      if (attendance.check_out_at) {
        return { ok: false as const, message: "You've checked out of this shift." };
      }
      const { data: assignment } = await supabaseAdmin
        .from("staff_table_assignments")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("shift_id", shift.id)
        .eq("staff_membership_id", me.id)
        .eq("restaurant_table_id", data.restaurantTableId)
        .maybeSingle();
      if (!assignment) {
        return { ok: false as const, message: "That table isn't assigned to your shift." };
      }
    }

    const { resolved } = await resolveOrderLines(data.lines, data.restaurantId);

    // Attribution: staff orders must not guess when staffing data conflicts.
    const waiter = await core.resolveAssignedWaiter(supabaseAdmin, data.restaurantId, tableResult.tableId, now);
    if (waiter.status === "ambiguous") {
      return {
        ok: false as const,
        message: "More than one waiter is currently assigned to this table. Please fix the schedule first.",
      };
    }

    const creatorName = await core.staffNameSnapshot(supabaseAdmin, data.restaurantId, me.id);

    const order = await core.createValidatedOrder(supabaseAdmin, {
      restaurantId: data.restaurantId,
      restaurantTableId: tableResult.tableId,
      tableLabel: tableResult.tableLabel,
      // Staff-assisted orders are never attributed to a customer account.
      customerId: null,
      orderSource: "waiter_assisted",
      assignedWaiterMembershipId: waiter.status === "ok" ? waiter.membershipId : me.id,
      assignedWaiterName: waiter.status === "ok" ? waiter.name : creatorName,
      createdByStaffMembershipId: me.id,
      createdByStaffName: creatorName,
      lines: resolved,
    });

    return {
      ok: true as const,
      id: order.id,
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      total: order.total,
    };
  });
