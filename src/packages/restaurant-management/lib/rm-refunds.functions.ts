/**
 * Issue #18 — Restaurant Management refund server functions.
 *
 * Reads and writes `orders`, `order_payments`, `order_refunds` and
 * `order_refund_lines` only. Room money movement stays on
 * `reverse_order_room_charge`. No `pos_*` tables.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, displayName, loadMembership } from "@/core/lib/workforce.server";
import { requireModuleRole } from "@/core/lib/module-access.server";
import { roomChargeError } from "@/integrations/cross-package/room-charge.server";
import {
  assertRefundableAmount,
  interpretRoomReverseResult,
  isRmRefundManager,
  lineRemaining,
  remainingRefundable,
  restaurantPaymentStatus,
  RM_REFUND_ACTION,
  RM_REFUND_REASON_MAX,
  RM_REFUND_REASON_MIN,
  round2,
  tenderRemaining,
  type RestaurantPaymentStatus,
  type RmRefundMethod,
} from "./rm-refunds";
import {
  loadRmRefundGrant,
  requireRmRefundConfirm,
  requireRmRefundViewer,
  resolveRmRefundPermission,
  rmRefundError,
} from "./rm-refunds.server";

const idSchema = z.string().uuid();

export interface RefundLineView {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  refundedQuantity: number;
  refundedAmount: number;
  remainingQuantity: number;
  remainingAmount: number;
}

export interface RefundTenderView {
  id: string;
  method: RmRefundMethod;
  amount: number;
  refundedAmount: number;
  remaining: number;
  reference: string | null;
}

export interface RefundHistoryRow {
  id: string;
  method: string;
  amount: number;
  reason: string;
  noOpenShift: boolean;
  processedBy: string | null;
  createdAt: string;
}

export interface RefundSaleView {
  orderId: string;
  orderNumber: number;
  tableLabel: string;
  source: string;
  total: number;
  refundedAmount: number;
  remaining: number;
  paidAt: string | null;
  billingMethod: string | null;
  roomPosted: boolean;
  paymentStatus: RestaurantPaymentStatus;
  canRefund: boolean;
  hasOpenShift: boolean;
  expectedCash: number | null;
  lines: RefundLineView[];
  tenders: RefundTenderView[];
  history: RefundHistoryRow[];
}

export interface RecentPaidSaleRow {
  orderId: string;
  orderNumber: number;
  tableLabel: string;
  total: number;
  remaining: number;
  paidAt: string | null;
  paymentStatus: RestaurantPaymentStatus;
  methods: string[];
}

function moneyOrZero(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

async function membershipNames(
  admin: { from: (t: string) => any },
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
  const userIds = (members ?? []).map((m: { user_id: string | null }) => m.user_id).filter(Boolean) as string[];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
    : { data: [] };
  const byUser = new Map(
    ((profiles ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]).map(
      (p) => [p.id, displayName(p) ?? p.email ?? "Staff"],
    ),
  );
  for (const member of (members ?? []) as { id: string; user_id: string | null }[]) {
    names.set(member.id, (member.user_id ? byUser.get(member.user_id) : null) ?? "Staff");
  }
  return names;
}

async function loadRefundSaleView(
  admin: { from: (t: string) => any },
  restaurantId: string,
  orderId: string,
  canRefund: boolean,
  hasOpenShift: boolean,
  expectedCash: number | null,
  role: string,
): Promise<RefundSaleView> {
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, order_number, table_number, total, paid_at, billing_method, refunded_amount, room_charge_folio_id, order_source",
    )
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !order) throw new Error("That restaurant sale could not be found for this property.");

  const [{ data: itemRows }, { data: paymentRows }, { data: refundRows }, { data: refundLineRows }] = await Promise.all([
    admin
      .from("order_items")
      .select("id, item_name, quantity, price, line_total")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true }),
    admin.from("order_payments").select("id, method, amount, reference").eq("order_id", order.id).eq("restaurant_id", restaurantId),
    admin
      .from("order_refunds")
      .select("id, method, amount, reason, no_open_shift, processed_by_membership_id, created_at, payment_id")
      .eq("order_id", order.id)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false }),
    admin
      .from("order_refund_lines")
      .select("order_item_id, quantity, amount")
      .eq("order_id", order.id)
      .eq("restaurant_id", restaurantId),
  ]);

  const refundedQty = new Map<string, number>();
  const refundedAmt = new Map<string, number>();
  for (const row of (refundLineRows ?? []) as { order_item_id: string; quantity: number; amount: number }[]) {
    refundedQty.set(row.order_item_id, round2((refundedQty.get(row.order_item_id) ?? 0) + Number(row.quantity)));
    refundedAmt.set(row.order_item_id, round2((refundedAmt.get(row.order_item_id) ?? 0) + Number(row.amount)));
  }

  const refundedByPayment = new Map<string, number>();
  for (const row of (refundRows ?? []) as { payment_id: string | null; amount: number }[]) {
    if (!row.payment_id) continue;
    refundedByPayment.set(row.payment_id, round2((refundedByPayment.get(row.payment_id) ?? 0) + Number(row.amount)));
  }

  const lines: RefundLineView[] = ((itemRows ?? []) as {
    id: string;
    item_name: string;
    quantity: number;
    price: number;
    line_total: number | null;
  }[]).map((item) => {
    const lineTotal = item.line_total == null ? Number(item.price) * item.quantity : Number(item.line_total);
    const alreadyQty = refundedQty.get(item.id) ?? 0;
    const alreadyAmt = refundedAmt.get(item.id) ?? 0;
    return {
      id: item.id,
      name: item.item_name,
      quantity: item.quantity,
      unitPrice: Number(item.price),
      lineTotal: round2(lineTotal),
      refundedQuantity: alreadyQty,
      refundedAmount: alreadyAmt,
      remainingQuantity: Math.max(0, round2(item.quantity - alreadyQty)),
      remainingAmount: lineRemaining(lineTotal, alreadyAmt),
    };
  });

  const payments = (paymentRows ?? []) as { id: string; method: string; amount: number; reference: string | null }[];
  const roomPosted = Boolean(order.room_charge_folio_id) || order.billing_method === "room_charge";
  const refundedAmount = moneyOrZero(order.refunded_amount);
  const total = moneyOrZero(order.total);

  const tenders: RefundTenderView[] = roomPosted
    ? [
        {
          id: "room",
          method: "room",
          amount: total,
          refundedAmount: 0,
          remaining: remainingRefundable(total, 0),
          reference: null,
        },
      ]
    : payments.map((payment) => {
        const already = refundedByPayment.get(payment.id) ?? 0;
        return {
          id: payment.id,
          method: payment.method as RmRefundMethod,
          amount: Number(payment.amount),
          refundedAmount: already,
          remaining: tenderRemaining(Number(payment.amount), already),
          reference: payment.reference,
        };
      });

  const processorIds = ((refundRows ?? []) as { processed_by_membership_id: string | null }[])
    .map((row) => row.processed_by_membership_id)
    .filter((id): id is string => Boolean(id));
  const names = await membershipNames(admin, restaurantId, processorIds);

  const history: RefundHistoryRow[] = ((refundRows ?? []) as {
    id: string;
    method: string;
    amount: number;
    reason: string;
    no_open_shift: boolean;
    processed_by_membership_id: string | null;
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    method: row.method,
    amount: Number(row.amount),
    reason: row.reason,
    noOpenShift: row.no_open_shift,
    processedBy: row.processed_by_membership_id ? (names.get(row.processed_by_membership_id) ?? "Staff") : null,
    createdAt: row.created_at,
  }));

  const paymentStatus = restaurantPaymentStatus({
    paidAt: order.paid_at,
    billingMethod: order.billing_method,
    roomPosted,
    total,
    refundedAmount,
  });
  const remaining = roomPosted ? total : remainingRefundable(total, refundedAmount);

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    tableLabel: order.table_number,
    source: order.order_source ?? "customer_qr",
    total,
    refundedAmount,
    remaining,
    paidAt: order.paid_at,
    billingMethod: order.billing_method,
    roomPosted,
    paymentStatus,
    canRefund:
      canRefund &&
      remaining > 0.001 &&
      (!roomPosted || isRmRefundManager(role)) &&
      (hasOpenShift || isRmRefundManager(role)),
    hasOpenShift,
    expectedCash,
    lines,
    tenders,
    history,
  };
}

async function openShiftForMember(
  admin: { from: (t: string) => any },
  restaurantId: string,
  membershipId: string,
): Promise<{ id: string; expectedCash: number | null } | null> {
  const { data } = await admin
    .from("cashier_shifts")
    .select("id, expected_cash, opening_cash")
    .eq("restaurant_id", restaurantId)
    .eq("membership_id", membershipId)
    .eq("status", "open")
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    expectedCash: data.expected_cash == null ? (data.opening_cash == null ? null : Number(data.opening_cash)) : Number(data.expected_cash),
  };
}

const lineInputSchema = z.object({
  orderItemId: idSchema,
  quantity: z.number().positive().max(99),
  amount: z.number().positive().max(1_000_000),
});

export const getRefundSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, orderId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<RefundSaleView> => {
    const { membership, canRefund } = await resolveRmRefundPermission(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const shift = await openShiftForMember(supabaseAdmin, data.restaurantId, membership.id);
    return loadRefundSaleView(
      supabaseAdmin,
      data.restaurantId,
      data.orderId,
      canRefund,
      Boolean(shift),
      shift?.expectedCash ?? null,
      membership.role,
    );
  });

export const listRecentPaidSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        search: z.string().trim().max(60).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RecentPaidSaleRow[]> => {
    await requireRmRefundViewer(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabaseAdmin
      .from("orders")
      .select("id, order_number, table_number, total, paid_at, billing_method, refunded_amount, room_charge_folio_id")
      .eq("restaurant_id", data.restaurantId)
      .or("paid_at.not.is.null,billing_method.eq.room_charge")
      .gte("created_at", since)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(80);

    const term = (data.search ?? "").trim();
    if (term) {
      const numeric = term.replace(/[^0-9]/g, "");
      const table = term.replace(/^table\s*/i, "").trim().replace(/[%,()]/g, "");
      const filters: string[] = [];
      if (numeric) filters.push(`order_number.eq.${Number(numeric)}`);
      if (table) filters.push(`table_number.ilike.%${table}%`);
      if (filters.length) query = query.or(filters.join(","));
    }

    const { data: rows, error } = await query;
    if (error) throw new Error("Unable to load recent paid restaurant sales.");

    const sales = (rows ?? []) as {
      id: string;
      order_number: number;
      table_number: string;
      total: number;
      paid_at: string | null;
      billing_method: string | null;
      refunded_amount: number | null;
      room_charge_folio_id: string | null;
    }[];
    const ids = sales.map((row) => row.id);
    const { data: payments } = ids.length
      ? await supabaseAdmin
          .from("order_payments")
          .select("order_id, method")
          .eq("restaurant_id", data.restaurantId)
          .in("order_id", ids)
      : { data: [] };

    const methods = new Map<string, string[]>();
    for (const payment of (payments ?? []) as { order_id: string; method: string }[]) {
      const list = methods.get(payment.order_id) ?? [];
      if (!list.includes(payment.method)) list.push(payment.method);
      methods.set(payment.order_id, list);
    }

    return sales.map((row) => {
      const roomPosted = Boolean(row.room_charge_folio_id) || row.billing_method === "room_charge";
      const total = moneyOrZero(row.total);
      const refundedAmount = moneyOrZero(row.refunded_amount);
      const paymentStatus = restaurantPaymentStatus({
        paidAt: row.paid_at,
        billingMethod: row.billing_method,
        roomPosted,
        total,
        refundedAmount,
      });
      return {
        orderId: row.id,
        orderNumber: row.order_number,
        tableLabel: row.table_number,
        total,
        remaining: roomPosted ? total : remainingRefundable(total, refundedAmount),
        paidAt: row.paid_at,
        paymentStatus,
        methods: roomPosted ? ["room"] : (methods.get(row.id) ?? []),
      };
    });
  });

export const refundRestaurantSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        orderId: idSchema,
        paymentId: idSchema,
        amount: z.number().positive().max(1_000_000),
        reason: z.string().trim().min(RM_REFUND_REASON_MIN).max(RM_REFUND_REASON_MAX),
        lines: z.array(lineInputSchema).min(1).max(60),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; remaining: number; paymentStatus: RestaurantPaymentStatus } | { ok: false; message: string }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const preview = await requireRmRefundViewer(context as never, data.restaurantId);
      const shift = await openShiftForMember(supabaseAdmin, data.restaurantId, preview.id);

      try {
        const view = await loadRefundSaleView(
          supabaseAdmin,
          data.restaurantId,
          data.orderId,
          true,
          Boolean(shift),
          shift?.expectedCash ?? null,
          preview.role,
        );
        if (view.roomPosted) {
          return { ok: false, message: "Room charges are reversed on the folio. The refund was not recorded." };
        }
        const tender = view.tenders.find((item) => item.id === data.paymentId);
        if (!tender || tender.method === "room") {
          return { ok: false, message: "That tender is not on this restaurant sale." };
        }

        const selected = data.lines.map((line) => {
          const match = view.lines.find((item) => item.id === line.orderItemId);
          return {
            amount: round2(line.amount),
            remaining: match?.remainingAmount ?? 0,
          };
        });
        const caps = assertRefundableAmount({
          amount: data.amount,
          saleRemaining: view.remaining,
          tenderRemaining: tender.remaining,
          lineAmounts: selected.map((line) => line.amount),
          lineRemainings: selected.map((line) => line.remaining),
        });
        if (!caps.ok) return { ok: false, message: caps.message };

        const { membership } = await requireRmRefundConfirm(
          context as never,
          data.restaurantId,
          tender.method,
          Boolean(shift),
        );

        const { data: row, error } = await supabaseAdmin.rpc("refund_restaurant_order", {
          _restaurant_id: data.restaurantId,
          _order_id: data.orderId,
          _payment_id: data.paymentId,
          _amount: caps.amount,
          _reason: data.reason,
          _shift_id: (tender.method === "cash" ? (shift?.id ?? null) : null) as unknown as string,
          _membership_id: membership.id,
          _lines: data.lines.map((line) => ({
            orderItemId: line.orderItemId,
            quantity: line.quantity,
            amount: round2(line.amount),
          })),
        });
        if (error) return { ok: false, message: rmRefundError(error.message).message };

        const refunded = Number((row as { amount?: number } | null)?.amount ?? caps.amount);
        const nextRefunded = round2(view.refundedAmount + refunded);
        const paymentStatus = restaurantPaymentStatus({
          paidAt: view.paidAt,
          billingMethod: view.billingMethod,
          roomPosted: false,
          total: view.total,
          refundedAmount: nextRefunded,
        });

        await audit(supabaseAdmin, {
          restaurantId: data.restaurantId,
          actorUserId: (context as { userId: string }).userId,
          targetUserId: null,
          action: "rm_sale_refunded",
          metadata: {
            orderId: data.orderId,
            paymentId: data.paymentId,
            amount: caps.amount,
            method: tender.method,
            reason: data.reason,
            noOpenShift: tender.method === "cash" && !shift,
          },
        });

        return {
          ok: true,
          remaining: remainingRefundable(view.total, nextRefunded),
          paymentStatus,
        };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    },
  );

export const refundRestaurantRoomSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        orderId: idSchema,
        reason: z.string().trim().min(RM_REFUND_REASON_MIN).max(RM_REFUND_REASON_MAX),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; remaining: number; paymentStatus: RestaurantPaymentStatus } | { ok: false; message: string; retry: true }> => {
      try {
        const { membership } = await requireRmRefundConfirm(context as never, data.restaurantId, "room", true);
        const { requireRestaurantAndPms } = await import("./restaurant-package.server");
        await requireRestaurantAndPms(data.restaurantId);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: result, error } = await supabaseAdmin.rpc("reverse_order_room_charge", {
          _restaurant_id: data.restaurantId,
          _order_id: data.orderId,
          _reason: data.reason,
          _membership_id: membership.id,
        });
        if (error) {
          return {
            ok: false,
            message: roomChargeError(error.message).message,
            retry: true,
          };
        }
        const payload = (result ?? {}) as { amount?: number };
        const outcome = interpretRoomReverseResult({ ok: true, amount: Number(payload.amount ?? 0) });
        if (!outcome.success) {
          return { ok: false, message: outcome.message, retry: true };
        }
        await audit(supabaseAdmin, {
          restaurantId: data.restaurantId,
          actorUserId: (context as { userId: string }).userId,
          targetUserId: null,
          action: "rm_room_charge_reversed",
          metadata: { orderId: data.orderId, amount: outcome.amount, reason: data.reason },
        });
        return { ok: true, remaining: 0, paymentStatus: "refunded" };
      } catch (error) {
        return { ok: false, message: (error as Error).message, retry: true };
      }
    },
  );

export const getStaffRmRefundGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, membershipId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ enabled: boolean; role: string }> => {
    await requireModuleRole(context as never, data.restaurantId, "human_resources", ["owner", "manager"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await loadMembership(supabaseAdmin, data.restaurantId, data.membershipId);
    const enabled = await loadRmRefundGrant(supabaseAdmin, data.restaurantId, target.id);
    return { enabled, role: target.role };
  });

export const setStaffRmRefundGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        membershipId: idSchema,
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const actor = await requireModuleRole(context as never, data.restaurantId, "human_resources", [
      "owner",
      "manager",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await loadMembership(supabaseAdmin, data.restaurantId, data.membershipId);
    if (target.id === actor.id) throw new Error("You can't change your own refund permission.");
    if (target.role !== "cashier") {
      throw new Error("Only a cashier can be granted restaurant sale refunds.");
    }

    const { error } = await supabaseAdmin.from("staff_action_grants").upsert(
      {
        restaurant_id: data.restaurantId,
        membership_id: target.id,
        action_key: RM_REFUND_ACTION,
        enabled: data.enabled,
        created_by_membership_id: actor.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id,membership_id,action_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
