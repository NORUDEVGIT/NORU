/**
 * Issue #24 — Restaurant Management discount & comp server functions.
 *
 * Reads and writes `orders`, `order_items` and `order_adjustments` only.
 * Comp settlement does not insert `order_payments` and never writes `pos_*`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, displayName, loadMembership } from "@/core/lib/workforce.server";
import { requireModuleRole } from "@/core/lib/module-access.server";
import { billFromOrderSnapshot, type RmBillTotals, type RmTaxSettings } from "./rm-tax";
import { restaurantPaymentStatus, type RestaurantPaymentStatus } from "./rm-refunds";
import {
  assertOrderAdjustable,
  canCompleteCompedOrder,
  capDiscountToEligible,
  computeAdjustedRmBill,
  RM_ADJUST_REASON_MAX,
  RM_ADJUST_REASON_MIN,
  RM_COMP_ACTION,
  RM_DISCOUNT_ACTION,
  resolveCompAmount,
  resolveDiscountAmount,
  round2,
  type RmCompScope,
  type RmDiscountType,
} from "./rm-adjust";
import {
  loadStaffActionGrant,
  requireRmAdjustConfirm,
  resolveRmAdjustCapabilities,
  rmAdjustError,
} from "./rm-adjust.server";
import { freezeOrderReceiptAfterSettle } from "./rm-receipts.server";

const idSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(RM_ADJUST_REASON_MIN).max(RM_ADJUST_REASON_MAX);

export interface AdjustLineView {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  comped: boolean;
  compAmount: number;
  remainingAmount: number;
}

export interface AdjustHistoryRow {
  id: string;
  kind: string;
  amount: number;
  reason: string;
  actorName: string | null;
  createdAt: string;
  payableWas: number | null;
  payableNow: number | null;
}

export interface AdjustDiscountView {
  type: RmDiscountType;
  value: number;
  amount: number;
  reason: string | null;
}

export interface AdjustCheckView {
  orderId: string;
  orderNumber: number;
  tableLabel: string;
  source: string;
  status: string;
  paidAt: string | null;
  billingMethod: string | null;
  roomPosted: boolean;
  paymentStatus: RestaurantPaymentStatus;
  adjustable: boolean;
  paidBlock: boolean;
  canDiscount: boolean;
  canComp: boolean;
  canComplete: boolean;
  merchandiseSubtotal: number;
  discount: AdjustDiscountView | null;
  compAmount: number;
  checkComped: boolean;
  bill: RmBillTotals;
  taxSettings: RmTaxSettings;
  lines: AdjustLineView[];
  history: AdjustHistoryRow[];
}

function moneyOrZero(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function settingsFromOrder(order: {
  tax_rate_snapshot?: number | string | null;
  tax_inclusive_snapshot?: boolean | null;
  service_enabled_snapshot?: boolean | null;
  service_rate_snapshot?: number | string | null;
}): RmTaxSettings {
  return {
    taxRate: moneyOrZero(order.tax_rate_snapshot),
    taxInclusive: order.tax_inclusive_snapshot === true,
    serviceEnabled: order.service_enabled_snapshot === true,
    serviceRate: moneyOrZero(order.service_rate_snapshot),
  };
}

function billFromAdjustedOrder(order: {
  merchandise_subtotal?: number | string | null;
  tax_amount?: number | string | null;
  service_amount?: number | string | null;
  tax_rate_snapshot?: number | string | null;
  tax_inclusive_snapshot?: boolean | null;
  service_enabled_snapshot?: boolean | null;
  service_rate_snapshot?: number | string | null;
  discount_amount?: number | string | null;
  comp_amount?: number | string | null;
  total: number | string;
}): RmBillTotals {
  return billFromOrderSnapshot({
    merchandiseSubtotal: order.merchandise_subtotal == null ? null : moneyOrZero(order.merchandise_subtotal),
    taxAmount: order.tax_amount == null ? null : moneyOrZero(order.tax_amount),
    serviceAmount: order.service_amount == null ? null : moneyOrZero(order.service_amount),
    taxRate: order.tax_rate_snapshot == null ? null : moneyOrZero(order.tax_rate_snapshot),
    taxInclusive: order.tax_inclusive_snapshot ?? null,
    serviceEnabled: order.service_enabled_snapshot ?? null,
    serviceRate: order.service_rate_snapshot == null ? null : moneyOrZero(order.service_rate_snapshot),
    discountAmount: moneyOrZero(order.discount_amount),
    compAmount: moneyOrZero(order.comp_amount),
    payable: moneyOrZero(order.total),
  });
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

async function loadAdjustCheckView(
  admin: { from: (t: string) => any },
  restaurantId: string,
  orderId: string,
  canDiscount: boolean,
  canComp: boolean,
): Promise<AdjustCheckView> {
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, order_number, table_number, status, total, paid_at, billing_method, room_charge_folio_id, order_source, merchandise_subtotal, tax_amount, service_amount, tax_rate_snapshot, tax_inclusive_snapshot, service_enabled_snapshot, service_rate_snapshot, discount_type, discount_value, discount_amount, discount_reason, comp_amount, check_comped",
    )
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !order) throw new Error("That restaurant check could not be found for this property.");

  const [{ data: itemRows }, { data: historyRows }] = await Promise.all([
    admin
      .from("order_items")
      .select("id, item_name, quantity, price, line_total, comped, comp_amount")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true }),
    admin
      .from("order_adjustments")
      .select("id, kind, amount, reason, actor_membership_id, created_at, payable_was, payable_now")
      .eq("order_id", order.id)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false }),
  ]);

  const names = await membershipNames(
    admin,
    restaurantId,
    ((historyRows ?? []) as { actor_membership_id: string | null }[])
      .map((row) => row.actor_membership_id)
      .filter((id): id is string => Boolean(id)),
  );

  const lines: AdjustLineView[] = ((itemRows ?? []) as {
    id: string;
    item_name: string;
    quantity: number;
    price: number;
    line_total: number | null;
    comped?: boolean | null;
    comp_amount?: number | string | null;
  }[]).map((item) => {
    const lineTotal = item.line_total == null ? Number(item.price) * item.quantity : Number(item.line_total);
    const compAmount = round2(moneyOrZero(item.comp_amount));
    return {
      id: item.id,
      name: item.item_name,
      quantity: item.quantity,
      unitPrice: Number(item.price),
      lineTotal: round2(lineTotal),
      comped: item.comped === true || compAmount > 0,
      compAmount,
      remainingAmount: Math.max(0, round2(lineTotal - compAmount)),
    };
  });

  const merchandise =
    order.merchandise_subtotal == null
      ? round2(lines.reduce((sum, line) => sum + line.lineTotal, 0))
      : round2(moneyOrZero(order.merchandise_subtotal));

  const roomPosted = Boolean(order.room_charge_folio_id) || order.billing_method === "room_charge";
  const gate = assertOrderAdjustable({
    paidAt: order.paid_at,
    billingMethod: order.billing_method,
    roomPosted,
    status: order.status,
  });
  const bill = billFromAdjustedOrder({ ...order, total: order.total });
  const paymentStatus = restaurantPaymentStatus({
    paidAt: order.paid_at,
    billingMethod: order.billing_method,
    roomPosted,
    total: moneyOrZero(order.total),
    refundedAmount: 0,
  });

  const discountType = order.discount_type === "percent" || order.discount_type === "amount" ? order.discount_type : null;
  const discountAmount = round2(moneyOrZero(order.discount_amount));

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    tableLabel: order.table_number,
    source: order.order_source ?? "customer_qr",
    status: order.status,
    paidAt: order.paid_at,
    billingMethod: order.billing_method,
    roomPosted,
    paymentStatus,
    adjustable: gate.ok,
    paidBlock: !gate.ok && gate.code === "ORDER_PAID",
    canDiscount: canDiscount && gate.ok,
    canComp: canComp && gate.ok,
    canComplete: (canDiscount || canComp) && canCompleteCompedOrder({ payable: bill.payable, adjustable: gate.ok }),
    merchandiseSubtotal: merchandise,
    discount:
      discountType && discountAmount > 0
        ? {
            type: discountType,
            value: round2(moneyOrZero(order.discount_value)),
            amount: discountAmount,
            reason: order.discount_reason ?? null,
          }
        : null,
    compAmount: round2(moneyOrZero(order.comp_amount)),
    checkComped: order.check_comped === true,
    bill,
    taxSettings: settingsFromOrder(order),
    lines,
    history: ((historyRows ?? []) as {
      id: string;
      kind: string;
      amount: number;
      reason: string;
      actor_membership_id: string | null;
      created_at: string;
      payable_was: number | null;
      payable_now: number | null;
    }[]).map((row) => ({
      id: row.id,
      kind: row.kind,
      amount: moneyOrZero(row.amount),
      reason: row.reason,
      actorName: row.actor_membership_id ? (names.get(row.actor_membership_id) ?? "Staff") : null,
      createdAt: row.created_at,
      payableWas: row.payable_was == null ? null : moneyOrZero(row.payable_was),
      payableNow: row.payable_now == null ? null : moneyOrZero(row.payable_now),
    })),
  };
}

export const getAdjustCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, orderId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<AdjustCheckView> => {
    const { canDiscount, canComp } = await resolveRmAdjustCapabilities(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadAdjustCheckView(supabaseAdmin, data.restaurantId, data.orderId, canDiscount, canComp);
  });

type AdjustOk = { ok: true; view: AdjustCheckView; completed?: boolean };
type AdjustErr = { ok: false; message: string };

export const applyOrderDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        orderId: idSchema,
        type: z.enum(["percent", "amount"]),
        value: z.number(),
        reason: reasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdjustOk | AdjustErr> => {
    try {
      const membership = await requireRmAdjustConfirm(context as never, data.restaurantId, RM_DISCOUNT_ACTION);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const view = await loadAdjustCheckView(supabaseAdmin, data.restaurantId, data.orderId, true, true);
      const gate = assertOrderAdjustable({
        paidAt: view.paidAt,
        billingMethod: view.billingMethod,
        roomPosted: view.roomPosted,
        status: view.status,
      });
      if (!gate.ok) return { ok: false, message: gate.message };

      const eligible = Math.max(0, round2(view.merchandiseSubtotal - view.compAmount));
      const resolved = resolveDiscountAmount({
        type: data.type,
        value: data.value,
        eligibleMerchandise: eligible,
      });
      if (!resolved.ok) return { ok: false, message: resolved.message };
      if (!(resolved.amount > 0)) return { ok: false, message: "Enter a discount greater than zero." };

      const bill = computeAdjustedRmBill({
        merchandiseSubtotal: view.merchandiseSubtotal,
        settings: view.taxSettings,
        discountAmount: resolved.amount,
        compAmount: view.compAmount,
      });

      const { error } = await supabaseAdmin.rpc("apply_rm_order_discount", {
        _restaurant_id: data.restaurantId,
        _order_id: data.orderId,
        _membership_id: membership.id,
        _discount_type: data.type,
        _discount_value: round2(data.value),
        _discount_amount: resolved.amount,
        _reason: data.reason,
        _tax_amount: bill.taxAmount,
        _service_amount: bill.serviceAmount,
        _total: bill.payable,
        _comp_amount: view.compAmount,
      });
      if (error) return { ok: false, message: rmAdjustError(error.message).message };

      await audit(supabaseAdmin, {
        restaurantId: data.restaurantId,
        actorUserId: (context as { userId: string }).userId,
        targetUserId: null,
        action: "rm_order_discounted",
        metadata: {
          orderId: data.orderId,
          type: data.type,
          value: data.value,
          amount: resolved.amount,
          reason: data.reason,
          payableWas: view.bill.payable,
          payableNow: bill.payable,
        },
      });

      const next = await loadAdjustCheckView(supabaseAdmin, data.restaurantId, data.orderId, true, true);
      return { ok: true, view: next };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

export const clearOrderDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, orderId: idSchema, reason: reasonSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AdjustOk | AdjustErr> => {
    try {
      const membership = await requireRmAdjustConfirm(context as never, data.restaurantId, RM_DISCOUNT_ACTION);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const view = await loadAdjustCheckView(supabaseAdmin, data.restaurantId, data.orderId, true, true);
      const gate = assertOrderAdjustable({
        paidAt: view.paidAt,
        billingMethod: view.billingMethod,
        roomPosted: view.roomPosted,
        status: view.status,
      });
      if (!gate.ok) return { ok: false, message: gate.message };

      const bill = computeAdjustedRmBill({
        merchandiseSubtotal: view.merchandiseSubtotal,
        settings: view.taxSettings,
        discountAmount: 0,
        compAmount: view.compAmount,
      });

      const { error } = await supabaseAdmin.rpc("clear_rm_order_discount", {
        _restaurant_id: data.restaurantId,
        _order_id: data.orderId,
        _membership_id: membership.id,
        _reason: data.reason,
        _tax_amount: bill.taxAmount,
        _service_amount: bill.serviceAmount,
        _total: bill.payable,
        _comp_amount: view.compAmount,
      });
      if (error) return { ok: false, message: rmAdjustError(error.message).message };

      await audit(supabaseAdmin, {
        restaurantId: data.restaurantId,
        actorUserId: (context as { userId: string }).userId,
        targetUserId: null,
        action: "rm_order_discount_cleared",
        metadata: { orderId: data.orderId, reason: data.reason, payableNow: bill.payable },
      });

      const next = await loadAdjustCheckView(supabaseAdmin, data.restaurantId, data.orderId, true, true);
      return { ok: true, view: next };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

export const applyOrderComp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        orderId: idSchema,
        scope: z.enum(["lines", "check"]),
        orderItemIds: z.array(idSchema).max(60).optional(),
        reason: reasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdjustOk | AdjustErr> => {
    try {
      const membership = await requireRmAdjustConfirm(context as never, data.restaurantId, RM_COMP_ACTION);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const view = await loadAdjustCheckView(supabaseAdmin, data.restaurantId, data.orderId, true, true);
      const gate = assertOrderAdjustable({
        paidAt: view.paidAt,
        billingMethod: view.billingMethod,
        roomPosted: view.roomPosted,
        status: view.status,
      });
      if (!gate.ok) return { ok: false, message: gate.message };

      const scope: RmCompScope = data.scope;
      const selected =
        scope === "check"
          ? view.lines.filter((line) => line.remainingAmount > 0.001)
          : view.lines.filter((line) => (data.orderItemIds ?? []).includes(line.id));

      if (scope === "lines" && selected.length === 0) {
        return { ok: false, message: "Select at least one line to comp." };
      }

      const resolved = resolveCompAmount({
        scope,
        merchandise: view.merchandiseSubtotal,
        selectedLineRemainings: selected.map((line) => line.remainingAmount),
        alreadyComped: view.compAmount,
      });
      if (!resolved.ok) return { ok: false, message: resolved.message };

      const nextComp = resolved.nextCompTotal;
      const surviving = capDiscountToEligible({
        type: view.discount?.type ?? null,
        value: view.discount?.value ?? null,
        currentAmount: view.discount?.amount ?? 0,
        eligibleMerchandise: Math.max(0, round2(view.merchandiseSubtotal - nextComp)),
      });

      const bill = computeAdjustedRmBill({
        merchandiseSubtotal: view.merchandiseSubtotal,
        settings: view.taxSettings,
        discountAmount: surviving?.amount ?? 0,
        compAmount: nextComp,
      });

      const { error } = await supabaseAdmin.rpc("apply_rm_order_comp", {
        _restaurant_id: data.restaurantId,
        _order_id: data.orderId,
        _membership_id: membership.id,
        _scope: scope,
        _lines:
          scope === "lines"
            ? selected.map((line) => ({ orderItemId: line.id, amount: line.remainingAmount }))
            : [],
        _comp_amount: nextComp,
        _discount_amount: surviving?.amount ?? 0,
        _discount_type: surviving?.type ?? null,
        _discount_value: surviving?.value ?? null,
        _reason: data.reason,
        _tax_amount: bill.taxAmount,
        _service_amount: bill.serviceAmount,
        _total: bill.payable,
      });
      if (error) return { ok: false, message: rmAdjustError(error.message).message };

      await audit(supabaseAdmin, {
        restaurantId: data.restaurantId,
        actorUserId: (context as { userId: string }).userId,
        targetUserId: null,
        action: "rm_order_comped",
        metadata: {
          orderId: data.orderId,
          scope,
          amount: resolved.amount,
          nextComp,
          reason: data.reason,
          payableWas: view.bill.payable,
          payableNow: bill.payable,
        },
      });

      const next = await loadAdjustCheckView(supabaseAdmin, data.restaurantId, data.orderId, true, true);
      return { ok: true, view: next };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

export const completeCompedOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, orderId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<AdjustOk | AdjustErr> => {
    try {
      const caps = await resolveRmAdjustCapabilities(context as never, data.restaurantId);
      if (!caps.canDiscount && !caps.canComp) {
        return { ok: false, message: "You don't have permission to complete a comped restaurant check." };
      }
      const membership = await requireRmAdjustConfirm(
        context as never,
        data.restaurantId,
        caps.canComp ? RM_COMP_ACTION : RM_DISCOUNT_ACTION,
      );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const view = await loadAdjustCheckView(supabaseAdmin, data.restaurantId, data.orderId, true, true);
      const gate = assertOrderAdjustable({
        paidAt: view.paidAt,
        billingMethod: view.billingMethod,
        roomPosted: view.roomPosted,
        status: view.status,
      });
      if (!gate.ok) return { ok: false, message: gate.message };
      if (!canCompleteCompedOrder({ payable: view.bill.payable, adjustable: true })) {
        return { ok: false, message: "Payable must be zero before this check can be completed as comped." };
      }

      const { error } = await supabaseAdmin.rpc("complete_comped_order", {
        _restaurant_id: data.restaurantId,
        _order_id: data.orderId,
        _membership_id: membership.id,
      });
      if (error) return { ok: false, message: rmAdjustError(error.message).message };

      await freezeOrderReceiptAfterSettle(supabaseAdmin, data.restaurantId, data.orderId);

      await audit(supabaseAdmin, {
        restaurantId: data.restaurantId,
        actorUserId: (context as { userId: string }).userId,
        targetUserId: null,
        action: "rm_order_completed_comped",
        metadata: { orderId: data.orderId, payableWas: view.bill.payable },
      });

      const next = await loadAdjustCheckView(supabaseAdmin, data.restaurantId, data.orderId, caps.canDiscount, caps.canComp);
      return { ok: true, view: next, completed: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

export const getStaffRmAdjustGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        membershipId: idSchema,
        actionKey: z.enum([RM_DISCOUNT_ACTION, RM_COMP_ACTION]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ enabled: boolean; role: string }> => {
    await requireModuleRole(context as never, data.restaurantId, "human_resources", ["owner", "manager"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await loadMembership(supabaseAdmin, data.restaurantId, data.membershipId);
    const enabled = await loadStaffActionGrant(supabaseAdmin, data.restaurantId, target.id, data.actionKey);
    return { enabled, role: target.role };
  });

export const setStaffRmAdjustGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        membershipId: idSchema,
        actionKey: z.enum([RM_DISCOUNT_ACTION, RM_COMP_ACTION]),
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
    if (target.id === actor.id) throw new Error("You can't change your own adjustment permission.");
    if (target.role !== "cashier") {
      throw new Error("Only a cashier can be granted restaurant check discounts or comps.");
    }

    const { error } = await supabaseAdmin.from("staff_action_grants").upsert(
      {
        restaurant_id: data.restaurantId,
        membership_id: target.id,
        action_key: data.actionKey,
        enabled: data.enabled,
        created_by_membership_id: actor.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id,membership_id,action_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
