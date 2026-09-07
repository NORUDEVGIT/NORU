/**
 * Phase 7D — POS server functions.
 *
 * The till is not a second ordering engine: sales go through the same shared
 * pipeline as QR and waiter-assisted orders (`order-core.server`), with prices
 * re-read from the database. Payments are recorded by a SECURITY DEFINER
 * function that validates the order, the amount and the cashier shift.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { requirePosAccess, requirePosOperator, posError } from "./rm-pos.server";
import { canManageCashiering } from "@/packages/pms/lib/cashiering.server";
import { getRestaurantSettings, displayName } from "@/core/lib/workforce.server";
import { resolveOrderLines } from "./order-pricing.server";
import { createValidatedOrder, staffNameSnapshot } from "./order-core.server";

const idSchema = z.string().uuid();

export interface PosMenuItem {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  category: string;
}

export interface PosShift {
  id: string;
  openedAt: string;
  openingCash: number | null;
}

export interface PosContext {
  role: string;
  cashierName: string;
  currencyCode: string;
  timezone: string;
  /** Open cashier drawer for THIS member of staff, if any. */
  shift: PosShift | null;
  canManage: boolean;
  categories: { id: string; name: string }[];
  items: PosMenuItem[];
}

/** Everything the till needs to render: menu, currency and shift state. */
export const getPosContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<PosContext> => {
    const me = await requirePosAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);

    const [{ data: categoryRows }, { data: itemRows }, { data: shiftRow }, { data: member }] =
      await Promise.all([
        supabaseAdmin
          .from("menu_categories")
          .select("id, name, sort_order, active")
          .eq("restaurant_id", data.restaurantId)
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        supabaseAdmin
          .from("menu_items")
          .select("id, name, price, category, category_id")
          .eq("restaurant_id", data.restaurantId)
          .eq("available", true)
          .order("name", { ascending: true }),
        supabaseAdmin
          .from("cashier_shifts")
          .select("id, opened_at, opening_cash, status")
          .eq("restaurant_id", data.restaurantId)
          .eq("membership_id", me.id)
          .eq("status", "open")
          .maybeSingle(),
        supabaseAdmin
          .from("restaurant_users")
          .select("user_id")
          .eq("id", me.id)
          .maybeSingle(),
      ]);

    let cashierName = "Cashier";
    if (member?.user_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("id", member.user_id)
        .maybeSingle();
      cashierName = displayName(profile) ?? profile?.email ?? "Cashier";
    }

    const categories = (categoryRows ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));
    const byId = new Map(categories.map((c) => [c.id, c.name]));

    return {
      role: me.role,
      cashierName,
      currencyCode: settings.currencyCode,
      timezone: settings.timezone,
      canManage: canManageCashiering(me.role),
      shift: shiftRow
        ? {
            id: shiftRow.id as string,
            openedAt: shiftRow.opened_at as string,
            openingCash: shiftRow.opening_cash === null ? null : Number(shiftRow.opening_cash),
          }
        : null,
      categories,
      items: (itemRows ?? []).map((i) => ({
        id: i.id as string,
        name: i.name as string,
        price: Number(i.price),
        categoryId: (i.category_id as string | null) ?? null,
        category: (i.category_id ? byId.get(i.category_id as string) : null) ?? (i.category as string) ?? "Menu",
      })),
    };
  });

/** Opens the cashier drawer for the signed-in till operator. */
export const openPosShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, openingCash: z.number().min(0).max(1_000_000) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; id: string } | { ok: false; message: string }> => {
    const me = await requirePosOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: shift, error } = await supabaseAdmin.rpc("open_cashier_shift", {
      _restaurant_id: data.restaurantId,
      _membership_id: me.id,
      _opening_cash: data.openingCash,
      _notes: null as unknown as string,
    });
    if (error) return { ok: false, message: posError(error.message).message };
    return { ok: true, id: (shift as { id: string }).id };
  });

const saleSchema = z.object({
  restaurantId: idSchema,
  orderType: z.enum(["counter", "takeaway"]),
  lines: z
    .array(
      z.object({
        menuItemId: idSchema,
        quantity: z.number().int().positive().max(99),
        specialInstructions: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(60),
});

export interface PosSale {
  id: string;
  orderNumber: number;
  total: number;
  orderType: "counter" | "takeaway";
}

/** Creates the sale as a normal order so it reaches the kitchen board. */
export const placePosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saleSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; sale: PosSale } | { ok: false; message: string }> => {
    const me = await requirePosOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: shift } = await supabaseAdmin
      .from("cashier_shifts")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("membership_id", me.id)
      .eq("status", "open")
      .maybeSingle();
    if (!shift) {
      return { ok: false, message: "Open a cashier shift before taking sales." };
    }

    try {
      const { resolved } = await resolveOrderLines(data.lines, data.restaurantId);
      const staffName = await staffNameSnapshot(supabaseAdmin, data.restaurantId, me.id);
      const order = await createValidatedOrder(supabaseAdmin, {
        restaurantId: data.restaurantId,
        restaurantTableId: null,
        tableLabel: data.orderType === "takeaway" ? "Takeaway" : "Counter",
        customerId: null,
        orderSource: "pos_counter",
        assignedWaiterMembershipId: null,
        assignedWaiterName: null,
        createdByStaffMembershipId: me.id,
        createdByStaffName: staffName,
        orderType: data.orderType,
        cashierShiftId: shift.id as string,
        lines: resolved,
      });
      return {
        ok: true,
        sale: {
          id: order.id,
          orderNumber: order.orderNumber,
          total: order.total,
          orderType: data.orderType,
        },
      };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

const paymentSchema = z.object({
  restaurantId: idSchema,
  orderId: idSchema,
  method: z.enum(["cash", "card"]),
  amount: z.number().positive().max(1_000_000),
  tendered: z.number().min(0).max(1_000_000).nullable().optional(),
  reference: z.string().trim().max(120).nullable().optional(),
});

export interface PosPayment {
  method: "cash" | "card";
  amount: number;
  tendered: number | null;
  change: number;
}

/** Records the payment and settles the sale. */
export const payPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => paymentSchema.parse(input))
  .handler(
    async ({ data, context }): Promise<{ ok: true; payment: PosPayment } | { ok: false; message: string }> => {
      const me = await requirePosOperator(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: shift } = await supabaseAdmin
        .from("cashier_shifts")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("membership_id", me.id)
        .eq("status", "open")
        .maybeSingle();
      if (!shift) return { ok: false, message: "Open a cashier shift before taking payments." };

      const { data: row, error } = await supabaseAdmin.rpc("record_pos_order_payment", {
        _restaurant_id: data.restaurantId,
        _order_id: data.orderId,
        _shift_id: shift.id as string,
        _method: data.method,
        _amount: data.amount,
        _tendered: (data.method === "cash" ? (data.tendered ?? null) : null) as unknown as number,
        _reference: (data.reference ?? null) as unknown as string,
        _membership_id: me.id,
      });
      if (error) return { ok: false, message: posError(error.message).message };

      const payment = row as unknown as {
        method: "cash" | "card";
        amount: number | string;
        tendered_amount: number | string | null;
        change_amount: number | string;
      };
      return {
        ok: true,
        payment: {
          method: payment.method,
          amount: Number(payment.amount),
          tendered: payment.tendered_amount === null ? null : Number(payment.tendered_amount),
          change: Number(payment.change_amount),
        },
      };
    },
  );
