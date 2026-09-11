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

import { callerMembership, MANAGE_ROLES, getRestaurantSettings, resolveCurrentShift } from "@/core/lib/workforce.server";
import { shiftStateMessage, type ShiftState } from "@/core/lib/workforce-rules";
import type { RmTaxSettings } from "./rm-tax";
import { loadRestaurantTaxSettings } from "./rm-tax.server";

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
  shift: {
    id: string;
    shiftDate: string;
    startTime: string;
    endTime: string;
    checkedInAt: string | null;
    checkedOutAt: string | null;
  } | null;
  /** Friendly state of the staff member's shift right now. */
  shiftState: ShiftState;
  shiftMessage: string;
  timezone: string;
  currencyCode: string;
  taxSettings: RmTaxSettings;
  tables: WaiterTableOption[];
  menu: { id: string; name: string; price: number; category: string }[];
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
    const { requireRestaurantManagement } = await import("./restaurant-package.server");
    await requireRestaurantManagement(data.restaurantId);


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
    const taxSettings = await loadRestaurantTaxSettings(supabaseAdmin, data.restaurantId);

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

    const base = {
      role: me.role,
      isManager,
      timezone: settings.timezone,
      currencyCode: settings.currencyCode,
      taxSettings,
      menu,
    };

    if (isManager) {
      const { data: tables } = await supabaseAdmin
        .from("restaurant_tables")
        .select("id, table_number, name")
        .eq("restaurant_id", data.restaurantId)
        .eq("active", true)
        .order("table_number", { ascending: true });
      return {
        ...base,
        canOrder: (tables ?? []).length > 0,
        blockedReason: (tables ?? []).length > 0 ? null : "No active tables have been set up yet.",
        shift: null,
        shiftState: "none",
        shiftMessage: "Managers can take orders for any active table.",
        tables: (tables ?? []).map((t: any) => ({
          id: t.id as string,
          label: t.name ? `${t.table_number} · ${t.name}` : (t.table_number as string),
        })),
      };
    }

    // One shared resolver: the same rule check-in uses, so a checked-in waiter
    // is always recognised as on shift.
    const resolved = await resolveCurrentShift(supabaseAdmin, data.restaurantId, me.id, settings.timezone, now);
    const shiftInfo = resolved.shift
      ? {
          id: resolved.shift.id,
          shiftDate: resolved.shift.shift_date,
          startTime: resolved.shift.start_time,
          endTime: resolved.shift.end_time,
          checkedInAt: resolved.attendance?.check_in_at ?? null,
          checkedOutAt: resolved.attendance?.check_out_at ?? null,
        }
      : null;
    const shiftMessage = shiftStateMessage(resolved.state, shiftInfo);

    if (!resolved.isActive || !resolved.shift) {
      return {
        ...base,
        canOrder: false,
        blockedReason:
          resolved.state === "awaiting_check_in"
            ? "Check in for your shift before taking orders."
            : resolved.state === "completed"
              ? "You've checked out of this shift."
              : shiftMessage,
        shift: shiftInfo,
        shiftState: resolved.state,
        shiftMessage,
        tables: [],
      };
    }

    const { data: assignments } = await supabaseAdmin
      .from("staff_table_assignments")
      .select("restaurant_table_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("shift_id", resolved.shift.id)
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
      ...base,
      canOrder: (tables ?? []).length > 0,
      blockedReason: (tables ?? []).length > 0 ? null : "No tables are assigned to your shift yet.",
      shift: shiftInfo,
      shiftState: resolved.state,
      shiftMessage,
      tables: (tables ?? []).map((t: any) => ({
        id: t.id as string,
        label: t.name ? `${t.table_number} · ${t.name}` : (t.table_number as string),
      })),
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

    // Phase 8E1: package boundary, before the first write of the order.
    try {
      const { requireRestaurantManagement } = await import("./restaurant-package.server");
      await requireRestaurantManagement(data.restaurantId);
    } catch (error) {
      return { ok: false as const, message: (error as Error).message };
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
      const { timezone } = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
      const resolved = await resolveCurrentShift(supabaseAdmin, data.restaurantId, me.id, timezone, now);
      if (!resolved.shift) return { ok: false as const, message: "No shift is scheduled for you today." };
      if (resolved.state === "awaiting_check_in") {
        return { ok: false as const, message: "Check in for your shift before taking orders." };
      }
      if (resolved.state === "completed") {
        return { ok: false as const, message: "You've checked out of this shift." };
      }
      if (!resolved.isActive) {
        return { ok: false as const, message: shiftStateMessage(resolved.state, null) };
      }
      const { data: assignment } = await supabaseAdmin
        .from("staff_table_assignments")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("shift_id", resolved.shift.id)
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
      bill: order.bill,
    };
  });
