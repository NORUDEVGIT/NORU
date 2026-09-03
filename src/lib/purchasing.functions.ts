import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership, displayName, getRestaurantSettings } from "./workforce.server";
import { resolveRange, RANGE_PRESETS } from "./inventory-reporting.server";
import {
  canManagePurchasing,
  canReceiveGoods,
  canViewPurchasing,
  isEditable,
  isReceivable,
  lineTotal,
  loadPurchaseOrder,
  loadSupplier,
  nextPoNumber,
  recalculateTotals,
  receiveErrorMessage,
  recordPoEvent,
  PO_STATUSES,
  type PoStatus,
} from "./purchasing.server";

/**
 * Purchase orders and goods receiving.
 *
 * The browser never supplies totals, PO numbers, identities or statuses:
 * money is recomputed from the stored lines, and every receipt goes through
 * the transactional `receive_purchase_order_goods` RPC which in turn calls the
 * Phase 5A `apply_inventory_movement` ledger function. There is no second
 * stock-balance implementation.
 */

export interface PurchasingPermissions {
  role: string;
  canView: boolean;
  canManage: boolean;
  canReceive: boolean;
}

export interface PurchaseOrderSummary {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: PoStatus;
  orderDate: string;
  expectedDeliveryDate: string | null;
  total: number;
  createdBy: string | null;
  lineCount: number;
}

export interface PurchaseOrderLine {
  id: string;
  inventoryItemId: string;
  itemName: string;
  unitId: string;
  unitCode: string;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseOrderEvent {
  id: string;
  eventType: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface PurchaseOrderDetail {
  permissions: PurchasingPermissions;
  timezone: string;
  currencyCode: string;
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierActive: boolean;
  status: PoStatus;
  orderDate: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  subtotal: number;
  total: number;
  createdBy: string | null;
  orderedBy: string | null;
  createdAt: string;
  lines: PurchaseOrderLine[];
  history: PurchaseOrderEvent[];
}

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");

const lineInput = z.object({
  inventoryItemId: idSchema,
  quantity: z.number().finite().positive("Enter a quantity greater than zero.").max(1_000_000),
  unitCost: z.number().finite().min(0).max(10_000_000),
});

async function requirePurchasingAccess(context: any, restaurantId: string) {
  const { requireModuleRole } = await import("./module-access.server");
  const { PURCHASING_ROLES } = await import("./module-access");
  return requireModuleRole(
    context,
    restaurantId,
    "procurement",
    PURCHASING_ROLES,
    "You don't have access to purchasing for this restaurant.",
  );
}

function permissionsFor(role: string): PurchasingPermissions {
  return {
    role,
    canView: canViewPurchasing(role),
    canManage: canManagePurchasing(role),
    canReceive: canReceiveGoods(role),
  };
}

/** Membership id -> readable staff name, for created-by columns. */
async function staffNames(
  admin: any,
  membershipIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(membershipIds.filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data: members } = await admin
    .from("restaurant_users")
    .select("id, user_id")
    .in("id", ids);
  const userIds = (members ?? []).map((m: any) => m.user_id);
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
    : { data: [] as any[] };
  const byUser = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
  for (const m of members ?? []) {
    const p = byUser.get(m.user_id);
    names.set(m.id, displayName(p) ?? p?.email ?? "Staff");
  }
  return names;
}

export const listPurchaseOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        status: z.enum(PO_STATUSES).optional(),
        supplierId: idSchema.optional(),
        preset: z.enum(RANGE_PRESETS).optional(),
        from: dateSchema.nullable().optional(),
        to: dateSchema.nullable().optional(),
        search: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      permissions: PurchasingPermissions;
      timezone: string;
      currencyCode: string;
      orders: PurchaseOrderSummary[];
      kpis: {
        open: number;
        awaitingDelivery: number;
        partiallyReceived: number;
        receivedInPeriod: number;
        valueInPeriod: number;
      };
    }> => {
      const me = await requirePurchasingAccess(context, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
      const range = resolveRange(settings.timezone, data.preset ?? "30d", data.from, data.to);

      let query = supabaseAdmin
        .from("purchase_orders")
        .select(
          "id, po_number, supplier_id, status, order_date, expected_delivery_date, total, created_by_staff_membership_id",
        )
        .eq("restaurant_id", data.restaurantId)
        .gte("order_date", range.fromDate)
        .lte("order_date", range.toDate)
        .order("order_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300);

      if (data.status) query = query.eq("status", data.status);
      if (data.supplierId) query = query.eq("supplier_id", data.supplierId);

      const { data: rows, error } = await query;
      if (error) throw new Error("We couldn't load purchase orders right now.");

      const { data: suppliers } = await supabaseAdmin
        .from("restaurant_suppliers")
        .select("id, name")
        .eq("restaurant_id", data.restaurantId);
      const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

      const poIds = (rows ?? []).map((r) => r.id);
      const { data: lines } = poIds.length
        ? await supabaseAdmin
            .from("purchase_order_items")
            .select("purchase_order_id")
            .in("purchase_order_id", poIds)
        : { data: [] as any[] };
      const lineCount = new Map<string, number>();
      for (const l of (lines ?? []) as any[]) {
        lineCount.set(l.purchase_order_id, (lineCount.get(l.purchase_order_id) ?? 0) + 1);
      }

      const names = await staffNames(
        supabaseAdmin,
        (rows ?? []).map((r) => r.created_by_staff_membership_id),
      );

      const search = data.search?.trim().toLowerCase() ?? "";
      const orders: PurchaseOrderSummary[] = (rows ?? [])
        .map((r) => ({
          id: r.id,
          poNumber: r.po_number,
          supplierId: r.supplier_id,
          supplierName: supplierName.get(r.supplier_id) ?? "Supplier",
          status: r.status as PoStatus,
          orderDate: r.order_date,
          expectedDeliveryDate: r.expected_delivery_date,
          total: Number(r.total),
          createdBy: r.created_by_staff_membership_id
            ? (names.get(r.created_by_staff_membership_id) ?? null)
            : null,
          lineCount: lineCount.get(r.id) ?? 0,
        }))
        .filter((o) =>
          search
            ? o.poNumber.toLowerCase().includes(search) ||
              o.supplierName.toLowerCase().includes(search)
            : true,
        );

      // KPIs describe the live pipeline plus completion inside the range.
      const { data: liveRows } = await supabaseAdmin
        .from("purchase_orders")
        .select("status, total, order_date")
        .eq("restaurant_id", data.restaurantId);

      let open = 0;
      let awaiting = 0;
      let partial = 0;
      let receivedInPeriod = 0;
      let valueInPeriod = 0;
      for (const r of (liveRows ?? []) as any[]) {
        if (["draft", "ordered", "partially_received"].includes(r.status)) open += 1;
        if (r.status === "ordered") awaiting += 1;
        if (r.status === "partially_received") partial += 1;
        if (r.order_date >= range.fromDate && r.order_date <= range.toDate) {
          if (r.status === "received") receivedInPeriod += 1;
          if (r.status !== "cancelled") valueInPeriod += Number(r.total);
        }
      }

      return {
        permissions: permissionsFor(me.role),
        timezone: settings.timezone,
        currencyCode: settings.currencyCode,
        orders,
        kpis: {
          open,
          awaitingDelivery: awaiting,
          partiallyReceived: partial,
          receivedInPeriod,
          valueInPeriod: Math.round(valueInPeriod * 100) / 100,
        },
      };
    },
  );

export const getPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, purchaseOrderId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PurchaseOrderDetail> => {
    const me = await requirePurchasingAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
    const po = await loadPurchaseOrder(supabaseAdmin, data.restaurantId, data.purchaseOrderId);
    const supplier = await loadSupplier(supabaseAdmin, data.restaurantId, po.supplier_id);

    const [{ data: lines }, { data: units }, { data: history }] = await Promise.all([
      supabaseAdmin
        .from("purchase_order_items")
        .select(
          "id, inventory_item_id, item_name_snapshot, unit_id, ordered_quantity, received_quantity, unit_cost, line_total",
        )
        .eq("purchase_order_id", po.id)
        .eq("restaurant_id", data.restaurantId)
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("inventory_units").select("id, code"),
      supabaseAdmin
        .from("purchase_order_history")
        .select("id, event_type, notes, created_by_staff_membership_id, created_at")
        .eq("purchase_order_id", po.id)
        .eq("restaurant_id", data.restaurantId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const unitCode = new Map((units ?? []).map((u) => [u.id, u.code]));
    const names = await staffNames(supabaseAdmin, [
      po.created_by_staff_membership_id,
      po.ordered_by_staff_membership_id,
      ...(history ?? []).map((h: any) => h.created_by_staff_membership_id),
    ]);

    return {
      permissions: permissionsFor(me.role),
      timezone: settings.timezone,
      currencyCode: settings.currencyCode,
      id: po.id,
      poNumber: po.po_number,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierActive: supplier.active,
      status: po.status,
      orderDate: po.order_date,
      expectedDeliveryDate: po.expected_delivery_date,
      notes: po.notes,
      subtotal: Number(po.subtotal),
      total: Number(po.total),
      createdBy: po.created_by_staff_membership_id
        ? (names.get(po.created_by_staff_membership_id) ?? null)
        : null,
      orderedBy: po.ordered_by_staff_membership_id
        ? (names.get(po.ordered_by_staff_membership_id) ?? null)
        : null,
      createdAt: po.created_at,
      lines: (lines ?? []).map((l) => {
        const ordered = Number(l.ordered_quantity);
        const received = Number(l.received_quantity);
        return {
          id: l.id,
          inventoryItemId: l.inventory_item_id,
          itemName: l.item_name_snapshot,
          unitId: l.unit_id,
          unitCode: unitCode.get(l.unit_id) ?? "",
          orderedQuantity: ordered,
          receivedQuantity: received,
          remainingQuantity: Math.round((ordered - received) * 1000) / 1000,
          unitCost: Number(l.unit_cost),
          lineTotal: Number(l.line_total),
        };
      }),
      history: (history ?? []).map((h: any) => ({
        id: h.id,
        eventType: h.event_type,
        notes: h.notes,
        createdBy: h.created_by_staff_membership_id
          ? (names.get(h.created_by_staff_membership_id) ?? null)
          : null,
        createdAt: h.created_at,
      })),
    };
  });

/** Validates lines against this restaurant's own active inventory items. */
async function buildLineRows(
  admin: any,
  restaurantId: string,
  purchaseOrderId: string,
  lines: z.infer<typeof lineInput>[],
) {
  const itemIds = [...new Set(lines.map((l) => l.inventoryItemId))];
  const { data: items } = await admin
    .from("inventory_items")
    .select("id, name, base_unit_id, active")
    .eq("restaurant_id", restaurantId)
    .in("id", itemIds);
  const byId = new Map<string, any>((items ?? []).map((i: any) => [i.id, i]));

  return lines.map((l) => {
    const item = byId.get(l.inventoryItemId);
    if (!item) throw new Error("One of those inventory items could not be found.");
    if (!item.active) throw new Error(`${item.name} is inactive and can't be purchased.`);
    return {
      restaurant_id: restaurantId,
      purchase_order_id: purchaseOrderId,
      inventory_item_id: item.id,
      item_name_snapshot: item.name,
      unit_id: item.base_unit_id,
      ordered_quantity: l.quantity,
      unit_cost: l.unitCost,
      line_total: lineTotal(l.quantity, l.unitCost),
    };
  });
}

export const savePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        purchaseOrderId: idSchema.optional(),
        supplierId: idSchema,
        expectedDeliveryDate: dateSchema.nullable().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        lines: z.array(lineInput).min(1, "Add at least one line item.").max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requirePurchasingAccess(context, data.restaurantId);
    if (!canManagePurchasing(me.role)) {
      return {
        ok: false as const,
        message: "Only owners and managers can create purchase orders.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
    const supplier = await loadSupplier(supabaseAdmin, data.restaurantId, data.supplierId);
    if (!supplier.active && !data.purchaseOrderId) {
      return { ok: false as const, message: "That supplier is inactive." };
    }

    try {
      if (data.purchaseOrderId) {
        const existing = await loadPurchaseOrder(
          supabaseAdmin,
          data.restaurantId,
          data.purchaseOrderId,
        );
        if (!isEditable(existing.status)) {
          return { ok: false as const, message: "Only draft purchase orders can be edited." };
        }
        const rows = await buildLineRows(supabaseAdmin, data.restaurantId, existing.id, data.lines);
        await supabaseAdmin
          .from("purchase_order_items")
          .delete()
          .eq("purchase_order_id", existing.id)
          .eq("restaurant_id", data.restaurantId);
        const { error: lineError } = await supabaseAdmin
          .from("purchase_order_items")
          .insert(rows as never);
        if (lineError) throw new Error(lineError.message);

        await supabaseAdmin
          .from("purchase_orders")
          .update({
            supplier_id: data.supplierId,
            expected_delivery_date: data.expectedDeliveryDate ?? null,
            notes: data.notes ?? null,
          })
          .eq("id", existing.id)
          .eq("restaurant_id", data.restaurantId);
        await recalculateTotals(supabaseAdmin, data.restaurantId, existing.id);
        await recordPoEvent(supabaseAdmin, {
          restaurantId: data.restaurantId,
          purchaseOrderId: existing.id,
          eventType: "po_updated",
          newValues: { supplierId: data.supplierId, lineCount: rows.length },
          membershipId: me.id,
        });
        return { ok: true as const, purchaseOrderId: existing.id };
      }

      const { localDateInZone } = await import("./restaurant-time");
      const poNumber = await nextPoNumber(supabaseAdmin, data.restaurantId);
      const { data: created, error } = await supabaseAdmin
        .from("purchase_orders")
        .insert({
          restaurant_id: data.restaurantId,
          supplier_id: data.supplierId,
          po_number: poNumber,
          status: "draft",
          order_date: localDateInZone(settings.timezone),
          expected_delivery_date: data.expectedDeliveryDate ?? null,
          notes: data.notes ?? null,
          created_by_staff_membership_id: me.id,
        })
        .select("id")
        .maybeSingle();
      if (error || !created) throw new Error(error?.message ?? "insert failed");

      const rows = await buildLineRows(supabaseAdmin, data.restaurantId, created.id, data.lines);
      const { error: lineError } = await supabaseAdmin
        .from("purchase_order_items")
        .insert(rows as never);
      if (lineError) {
        await supabaseAdmin.from("purchase_orders").delete().eq("id", created.id);
        throw new Error(lineError.message);
      }
      await recalculateTotals(supabaseAdmin, data.restaurantId, created.id);
      await recordPoEvent(supabaseAdmin, {
        restaurantId: data.restaurantId,
        purchaseOrderId: created.id,
        eventType: "po_created",
        newValues: { poNumber, supplierId: data.supplierId, lineCount: rows.length },
        membershipId: me.id,
      });
      return { ok: true as const, purchaseOrderId: created.id as string };
    } catch (e) {
      const message = (e as Error).message;
      console.error("[savePurchaseOrder]", message);
      if (/inactive|could not be found/i.test(message)) return { ok: false as const, message };
      return {
        ok: false as const,
        message: "We couldn't save that purchase order. Please try again.",
      };
    }
  });

export const updatePurchaseOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        purchaseOrderId: idSchema,
        action: z.enum(["order", "cancel"]),
        reason: z.string().trim().max(300).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requirePurchasingAccess(context, data.restaurantId);
    if (!canManagePurchasing(me.role)) {
      return {
        ok: false as const,
        message: "Only owners and managers can change a purchase order.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const po = await loadPurchaseOrder(supabaseAdmin, data.restaurantId, data.purchaseOrderId);

    if (data.action === "order") {
      if (po.status !== "draft") {
        return {
          ok: false as const,
          message: "Only draft purchase orders can be marked as ordered.",
        };
      }
      const { data: lines } = await supabaseAdmin
        .from("purchase_order_items")
        .select("id")
        .eq("purchase_order_id", po.id);
      if ((lines ?? []).length === 0) {
        return { ok: false as const, message: "Add at least one line before ordering." };
      }
      await supabaseAdmin
        .from("purchase_orders")
        .update({ status: "ordered", ordered_by_staff_membership_id: me.id })
        .eq("id", po.id)
        .eq("restaurant_id", data.restaurantId);
      await recordPoEvent(supabaseAdmin, {
        restaurantId: data.restaurantId,
        purchaseOrderId: po.id,
        eventType: "po_ordered",
        previousValues: { status: po.status },
        newValues: { status: "ordered" },
        membershipId: me.id,
      });
      return { ok: true as const };
    }

    if (!["draft", "ordered"].includes(po.status)) {
      return { ok: false as const, message: "This purchase order can no longer be cancelled." };
    }
    const { data: received } = await supabaseAdmin
      .from("purchase_order_items")
      .select("received_quantity")
      .eq("purchase_order_id", po.id);
    if ((received ?? []).some((l: any) => Number(l.received_quantity) > 0)) {
      return {
        ok: false as const,
        message: "Goods have already been received against this order.",
      };
    }
    await supabaseAdmin
      .from("purchase_orders")
      .update({ status: "cancelled" })
      .eq("id", po.id)
      .eq("restaurant_id", data.restaurantId);
    await recordPoEvent(supabaseAdmin, {
      restaurantId: data.restaurantId,
      purchaseOrderId: po.id,
      eventType: "po_cancelled",
      previousValues: { status: po.status },
      newValues: { status: "cancelled" },
      notes: data.reason ?? null,
      membershipId: me.id,
    });
    return { ok: true as const };
  });

export const receiveGoods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        purchaseOrderId: idSchema,
        notes: z.string().trim().max(300).nullable().optional(),
        lines: z
          .array(
            z.object({ lineId: idSchema, quantity: z.number().finite().min(0).max(1_000_000) }),
          )
          .min(1)
          .max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requirePurchasingAccess(context, data.restaurantId);
    if (!canReceiveGoods(me.role)) {
      return { ok: false as const, message: "You don't have permission to receive goods." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const po = await loadPurchaseOrder(supabaseAdmin, data.restaurantId, data.purchaseOrderId);
    if (!isReceivable(po.status)) {
      return { ok: false as const, message: "This purchase order can no longer receive goods." };
    }

    const lines = data.lines.filter((l) => l.quantity > 0);
    if (lines.length === 0) {
      return { ok: false as const, message: "Enter at least one quantity to receive." };
    }

    const { data: status, error } = await supabaseAdmin.rpc("receive_purchase_order_goods", {
      _restaurant_id: data.restaurantId,
      _purchase_order_id: po.id,
      _lines: lines as unknown as never,
      _membership_id: me.id,
      _notes: (data.notes?.trim() || null) as unknown as string,
    });

    if (error) {
      console.error("[receiveGoods]", error.message);
      return { ok: false as const, message: receiveErrorMessage(error.message) };
    }
    return { ok: true as const, status: status as PoStatus };
  });

/** Small procurement summary for the inventory overview dashboard. */
export const getPurchasingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requirePurchasingAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
    const { localDateInZone } = await import("./restaurant-time");
    const today = localDateInZone(settings.timezone);

    const { data: rows } = await supabaseAdmin
      .from("purchase_orders")
      .select("status, expected_delivery_date")
      .eq("restaurant_id", data.restaurantId);

    let open = 0;
    let expected = 0;
    for (const r of (rows ?? []) as any[]) {
      if (["draft", "ordered", "partially_received"].includes(r.status)) {
        open += 1;
        if (r.expected_delivery_date && r.expected_delivery_date >= today) expected += 1;
      }
    }

    const { data: suppliers } = await supabaseAdmin
      .from("restaurant_suppliers")
      .select("active")
      .eq("restaurant_id", data.restaurantId);

    return {
      role: me.role,
      openPurchaseOrders: open,
      expectedDeliveries: expected,
      totalSuppliers: (suppliers ?? []).length,
      activeSuppliers: (suppliers ?? []).filter((s: any) => s.active).length,
    };
  });
