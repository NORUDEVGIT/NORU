/**
 * Phase 7D — POS server functions, plus Issue #20 till cash-up / shift close.
 *
 * The till is not a second ordering engine: sales go through the same shared
 * pipeline as QR and waiter-assisted orders (`order-core.server`), with prices
 * re-read from the database. Payments are recorded by a SECURITY DEFINER
 * function that validates the order, the amount and the cashier shift.
 * Close is till-native (`closePosShift`) — not PMS Cashiering routing, not
 * Standalone POS `pos_*` tables.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { requirePosAccess, requirePosOperator, posError } from "./rm-pos.server";
import { canManageCashiering } from "@/packages/pms/lib/cashiering.server";
import { getRestaurantSettings, displayName } from "@/core/lib/workforce.server";
import { resolveOrderLines } from "./order-pricing.server";
import { createValidatedOrder, staffNameSnapshot } from "./order-core.server";
import {
  authorizeClosePosShift,
  canCloseAnyPosShift,
  cashVariance,
  interpretClosePosShiftFailure,
  recomputeExpectedCash,
  type CashVarianceKind,
} from "./rm-cash-up";

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

/* ---------------------------------------------------------------- cash-up */

type AdminClient = { from: (table: string) => any };

async function membershipNames(
  admin: AdminClient,
  restaurantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data: members } = await admin
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", unique);
  const userIds = (members ?? [])
    .map((m: { user_id: string | null }) => m.user_id)
    .filter(Boolean) as string[];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
    : { data: [] };
  const byUser = new Map(
    (
      (profiles ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }[]
    ).map((p) => [p.id, displayName(p) ?? p.email ?? "Staff"]),
  );
  for (const member of (members ?? []) as { id: string; user_id: string | null }[]) {
    names.set(member.id, (member.user_id ? byUser.get(member.user_id) : null) ?? "Staff");
  }
  return names;
}

function moneyOrZero(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

async function shiftCashTotals(
  admin: AdminClient,
  restaurantId: string,
  shiftIds: string[],
): Promise<Map<string, { cashPayments: number; cashRefunds: number; cardPayments: number }>> {
  const totals = new Map<string, { cashPayments: number; cashRefunds: number; cardPayments: number }>();
  for (const id of shiftIds) {
    totals.set(id, { cashPayments: 0, cashRefunds: 0, cardPayments: 0 });
  }
  if (shiftIds.length === 0) return totals;

  const { data: payments } = await admin
    .from("order_payments")
    .select("cashier_shift_id, method, amount")
    .eq("restaurant_id", restaurantId)
    .in("cashier_shift_id", shiftIds);
  for (const row of (payments ?? []) as {
    cashier_shift_id: string | null;
    method: string;
    amount: number | string;
  }[]) {
    if (!row.cashier_shift_id) continue;
    const bucket = totals.get(row.cashier_shift_id);
    if (!bucket) continue;
    const amount = moneyOrZero(row.amount);
    if (row.method === "cash") bucket.cashPayments += amount;
    if (row.method === "card") bucket.cardPayments += amount;
  }

  const { data: refunds } = await admin
    .from("order_refunds")
    .select("cashier_shift_id, method, amount")
    .eq("restaurant_id", restaurantId)
    .in("cashier_shift_id", shiftIds);
  for (const row of (refunds ?? []) as {
    cashier_shift_id: string | null;
    method: string;
    amount: number | string;
  }[]) {
    if (!row.cashier_shift_id || row.method !== "cash") continue;
    const bucket = totals.get(row.cashier_shift_id);
    if (!bucket) continue;
    bucket.cashRefunds += moneyOrZero(row.amount);
  }

  for (const bucket of totals.values()) {
    bucket.cashPayments = Number(bucket.cashPayments.toFixed(2));
    bucket.cashRefunds = Number(bucket.cashRefunds.toFixed(2));
    bucket.cardPayments = Number(bucket.cardPayments.toFixed(2));
  }
  return totals;
}

async function roomChargeContext(
  admin: AdminClient,
  restaurantId: string,
  shiftId: string,
): Promise<{ roomChargeTotal: number; roomChargeCount: number }> {
  const { data: orders } = await admin
    .from("orders")
    .select("total, billing_method, room_charge_folio_id")
    .eq("restaurant_id", restaurantId)
    .eq("cashier_shift_id", shiftId);
  let roomChargeTotal = 0;
  let roomChargeCount = 0;
  for (const order of (orders ?? []) as {
    total: number | string;
    billing_method: string | null;
    room_charge_folio_id: string | null;
  }[]) {
    if (order.billing_method === "room_charge" || order.room_charge_folio_id) {
      roomChargeCount += 1;
      roomChargeTotal += moneyOrZero(order.total);
    }
  }
  return { roomChargeTotal: Number(roomChargeTotal.toFixed(2)), roomChargeCount };
}

export interface PosCashUpSummary {
  shiftId: string;
  membershipId: string;
  cashierName: string;
  isOwn: boolean;
  status: "open" | "closed";
  openedAt: string;
  openingCash: number;
  cashPayments: number;
  cashRefunds: number;
  expectedCash: number;
  cardPayments: number;
  roomChargeTotal: number;
  roomChargeCount: number;
}

export interface OpenCashierShiftRow {
  shiftId: string;
  membershipId: string;
  cashierName: string;
  openedAt: string;
  openingCash: number;
  isOwn: boolean;
}

export interface ClosedCashierShiftRow {
  shiftId: string;
  cashierName: string;
  openedAt: string;
  closedAt: string;
  openingCash: number;
  expectedCash: number;
  closingCash: number | null;
  variance: number | null;
  varianceKind: CashVarianceKind | null;
  notes: string | null;
}

export interface PosShiftCloseResult {
  shiftId: string;
  closingCash: number;
  expectedCash: number;
  variance: number;
  varianceKind: CashVarianceKind;
}

/** Recomputed drawer summary for one shift. Cashiers: own only. Managers: any. */
export const getPosShiftCashUpSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, shiftId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PosCashUpSummary> => {
    const me = await requirePosAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: shift, error } = await supabaseAdmin
      .from("cashier_shifts")
      .select("id, membership_id, opened_at, opening_cash, status")
      .eq("id", data.shiftId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (error || !shift) throw new Error("That cashier shift could not be found.");

    const authz = authorizeClosePosShift({
      role: me.role,
      actorMembershipId: me.id,
      shiftMembershipId: shift.membership_id as string,
    });
    if (!authz.ok && shift.membership_id !== me.id) {
      throw new Error(authz.message);
    }

    const [names, totals, room] = await Promise.all([
      membershipNames(supabaseAdmin, data.restaurantId, [shift.membership_id as string]),
      shiftCashTotals(supabaseAdmin, data.restaurantId, [shift.id as string]),
      roomChargeContext(supabaseAdmin, data.restaurantId, shift.id as string),
    ]);
    const bucket = totals.get(shift.id as string) ?? {
      cashPayments: 0,
      cashRefunds: 0,
      cardPayments: 0,
    };
    const openingCash = moneyOrZero(shift.opening_cash);
    return {
      shiftId: shift.id as string,
      membershipId: shift.membership_id as string,
      cashierName: names.get(shift.membership_id as string) ?? "Cashier",
      isOwn: shift.membership_id === me.id,
      status: (shift.status as "open" | "closed") ?? "open",
      openedAt: shift.opened_at as string,
      openingCash,
      cashPayments: bucket.cashPayments,
      cashRefunds: bucket.cashRefunds,
      expectedCash: recomputeExpectedCash({
        openingCash,
        cashPayments: bucket.cashPayments,
        cashRefunds: bucket.cashRefunds,
      }),
      cardPayments: bucket.cardPayments,
      roomChargeTotal: room.roomChargeTotal,
      roomChargeCount: room.roomChargeCount,
    };
  });

/** Owner/manager: every open restaurant till drawer. */
export const listOpenCashierShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<OpenCashierShiftRow[]> => {
    const me = await requirePosAccess(context as never, data.restaurantId);
    if (!canCloseAnyPosShift(me.role) && !canManageCashiering(me.role)) {
      throw new Error("Only an owner or manager can list open cashier shifts.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("cashier_shifts")
      .select("id, membership_id, opened_at, opening_cash")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open")
      .order("opened_at", { ascending: true });
    const list = (rows ?? []) as {
      id: string;
      membership_id: string;
      opened_at: string;
      opening_cash: number | string | null;
    }[];
    const names = await membershipNames(
      supabaseAdmin,
      data.restaurantId,
      list.map((row) => row.membership_id),
    );
    return list.map((row) => ({
      shiftId: row.id,
      membershipId: row.membership_id,
      cashierName: names.get(row.membership_id) ?? "Cashier",
      openedAt: row.opened_at,
      openingCash: moneyOrZero(row.opening_cash),
      isOwn: row.membership_id === me.id,
    }));
  });

/** Owner/manager: last ~25 closed restaurant till shifts. */
export const listRecentClosedCashierShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<ClosedCashierShiftRow[]> => {
    const me = await requirePosAccess(context as never, data.restaurantId);
    if (!canCloseAnyPosShift(me.role) && !canManageCashiering(me.role)) {
      throw new Error("Only an owner or manager can list closed cashier shifts.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("cashier_shifts")
      .select("id, membership_id, opened_at, closed_at, opening_cash, closing_cash, notes")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(25);
    const list = (rows ?? []) as {
      id: string;
      membership_id: string;
      opened_at: string;
      closed_at: string | null;
      opening_cash: number | string | null;
      closing_cash: number | string | null;
      notes: string | null;
    }[];
    const [names, totals] = await Promise.all([
      membershipNames(
        supabaseAdmin,
        data.restaurantId,
        list.map((row) => row.membership_id),
      ),
      shiftCashTotals(
        supabaseAdmin,
        data.restaurantId,
        list.map((row) => row.id),
      ),
    ]);
    return list.map((row) => {
      const bucket = totals.get(row.id) ?? { cashPayments: 0, cashRefunds: 0, cardPayments: 0 };
      const expectedCash = recomputeExpectedCash({
        openingCash: moneyOrZero(row.opening_cash),
        cashPayments: bucket.cashPayments,
        cashRefunds: bucket.cashRefunds,
      });
      const closingCash = row.closing_cash === null ? null : moneyOrZero(row.closing_cash);
      const variance = closingCash === null ? null : cashVariance({ counted: closingCash, expected: expectedCash });
      return {
        shiftId: row.id,
        cashierName: names.get(row.membership_id) ?? "Cashier",
        openedAt: row.opened_at,
        closedAt: row.closed_at ?? row.opened_at,
        openingCash: moneyOrZero(row.opening_cash),
        expectedCash,
        closingCash,
        variance: variance?.amount ?? null,
        varianceKind: variance?.kind ?? null,
        notes: row.notes,
      };
    });
  });

/** Closes a restaurant till shift after a counted cash-up. Own shift, or owner/manager. */
export const closePosShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        shiftId: idSchema,
        closingCash: z.number().min(0).max(1_000_000),
        notes: z.string().trim().max(300).nullable().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; result: PosShiftCloseResult } | { ok: false; message: string }> => {
      const me = await requirePosOperator(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: owned } = await supabaseAdmin
        .from("cashier_shifts")
        .select("id, membership_id, status, opening_cash")
        .eq("id", data.shiftId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!owned) return { ok: false, message: "That cashier shift could not be found." };

      const authz = authorizeClosePosShift({
        role: me.role,
        actorMembershipId: me.id,
        shiftMembershipId: owned.membership_id as string,
      });
      if (!authz.ok) return { ok: false, message: authz.message };
      if (owned.status === "closed") {
        return { ok: false, message: interpretClosePosShiftFailure("SHIFT_ALREADY_CLOSED").message };
      }

      const { data: shift, error } = await supabaseAdmin.rpc("close_cashier_shift", {
        _restaurant_id: data.restaurantId,
        _shift_id: data.shiftId,
        _closing_cash: data.closingCash,
        _notes: (data.notes?.trim() ? data.notes.trim() : null) as unknown as string,
        _membership_id: me.id,
      });
      if (error) {
        const mapped = interpretClosePosShiftFailure(error.message);
        if (mapped.code !== "ERROR") return { ok: false, message: mapped.message };
        return { ok: false, message: posError(error.message).message };
      }

      const closed = shift as {
        id: string;
        closing_cash: number | string | null;
        expected_cash: number | string | null;
        opening_cash: number | string | null;
      };
      const totals = await shiftCashTotals(supabaseAdmin, data.restaurantId, [closed.id]);
      const bucket = totals.get(closed.id) ?? { cashPayments: 0, cashRefunds: 0, cardPayments: 0 };
      const expectedCash =
        closed.expected_cash === null || closed.expected_cash === undefined
          ? recomputeExpectedCash({
              openingCash: moneyOrZero(closed.opening_cash),
              cashPayments: bucket.cashPayments,
              cashRefunds: bucket.cashRefunds,
            })
          : moneyOrZero(closed.expected_cash);
      const closingCash = closed.closing_cash === null ? data.closingCash : moneyOrZero(closed.closing_cash);
      const variance = cashVariance({ counted: closingCash, expected: expectedCash });
      return {
        ok: true,
        result: {
          shiftId: closed.id,
          closingCash,
          expectedCash,
          variance: variance.amount,
          varianceKind: variance.kind,
        },
      };
    },
  );
