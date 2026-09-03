import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "./workforce.server";
import {
  canManagePurchasing,
  canViewPurchasing,
  loadSupplier,
  type PoStatus,
} from "./purchasing.server";

/**
 * Supplier directory. Suppliers are tenant scoped and never hard deleted, so
 * historical purchase orders keep pointing at a real supplier row.
 */

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  active: boolean;
  poCount: number;
  totalOrderedValue: number;
  lastOrderDate: string | null;
}

export interface SupplierPermissions {
  role: string;
  canView: boolean;
  canManage: boolean;
}

const idSchema = z.string().uuid();

async function requireSupplierAccess(context: any, restaurantId: string) {
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

const supplierFields = {
  name: z.string().trim().min(2, "Enter a supplier name.").max(160),
  contactName: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().email("Enter a valid email.").max(200).nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(60).nullable().optional(),
  address: z.string().trim().max(400).nullable().optional(),
  taxId: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
};

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export const listSuppliers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        includeInactive: z.boolean().optional(),
        search: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ permissions: SupplierPermissions; suppliers: Supplier[] }> => {
    const me = await requireSupplierAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("restaurant_suppliers")
      .select("id, name, contact_name, email, phone, address, tax_id, notes, active")
      .eq("restaurant_id", data.restaurantId)
      .order("name", { ascending: true });
    if (!data.includeInactive) query = query.eq("active", true);
    if (data.search?.trim()) query = query.ilike("name", `%${data.search.trim()}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error("We couldn't load suppliers right now.");

    const { data: orders } = await supabaseAdmin
      .from("purchase_orders")
      .select("supplier_id, total, order_date, status")
      .eq("restaurant_id", data.restaurantId);

    const stats = new Map<string, { count: number; value: number; last: string | null }>();
    for (const o of (orders ?? []) as any[]) {
      if (o.status === "cancelled") continue;
      const s = stats.get(o.supplier_id) ?? { count: 0, value: 0, last: null };
      s.count += 1;
      s.value += Number(o.total);
      if (!s.last || o.order_date > s.last) s.last = o.order_date;
      stats.set(o.supplier_id, s);
    }

    return {
      permissions: { role: me.role, canView: true, canManage: canManagePurchasing(me.role) },
      suppliers: (rows ?? []).map((r) => {
        const s = stats.get(r.id);
        return {
          id: r.id,
          name: r.name,
          contactName: r.contact_name,
          email: r.email,
          phone: r.phone,
          address: r.address,
          taxId: r.tax_id,
          notes: r.notes,
          active: r.active,
          poCount: s?.count ?? 0,
          totalOrderedValue: Math.round((s?.value ?? 0) * 100) / 100,
          lastOrderDate: s?.last ?? null,
        };
      }),
    };
  });

export const createSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, ...supplierFields }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    if (!canManagePurchasing(me.role)) {
      return { ok: false as const, message: "Only owners and managers can manage suppliers." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("restaurant_suppliers")
      .insert({
        restaurant_id: data.restaurantId,
        name: data.name,
        contact_name: blankToNull(data.contactName),
        email: blankToNull(data.email),
        phone: blankToNull(data.phone),
        address: blankToNull(data.address),
        tax_id: blankToNull(data.taxId),
        notes: blankToNull(data.notes),
        created_by_staff_membership_id: me.id,
      })
      .select("id")
      .maybeSingle();

    if (error || !row) {
      if (error && /duplicate|unique/i.test(error.message)) {
        return { ok: false as const, message: "A supplier with that name already exists." };
      }
      console.error("[createSupplier]", error?.message);
      return { ok: false as const, message: "We couldn't create that supplier. Please try again." };
    }
    return { ok: true as const, supplierId: row.id as string };
  });

export const updateSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        supplierId: idSchema,
        ...supplierFields,
        name: supplierFields.name.optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    if (!canManagePurchasing(me.role)) {
      return { ok: false as const, message: "Only owners and managers can manage suppliers." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadSupplier(supabaseAdmin, data.restaurantId, data.supplierId);

    const patch: Record<string, any> = {};
    if (data.name !== undefined) patch['name'] = data.name;
    if (data.contactName !== undefined) patch['contact_name'] = blankToNull(data.contactName);
    if (data.email !== undefined) patch['email'] = blankToNull(data.email);
    if (data.phone !== undefined) patch['phone'] = blankToNull(data.phone);
    if (data.address !== undefined) patch['address'] = blankToNull(data.address);
    if (data.taxId !== undefined) patch['tax_id'] = blankToNull(data.taxId);
    if (data.notes !== undefined) patch['notes'] = blankToNull(data.notes);
    if (data.active !== undefined) patch['active'] = data.active;
    if (Object.keys(patch).length === 0) return { ok: true as const };

    const { error } = await supabaseAdmin
      .from("restaurant_suppliers")
      .update(patch as never)
      .eq("id", data.supplierId)
      .eq("restaurant_id", data.restaurantId);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return { ok: false as const, message: "A supplier with that name already exists." };
      }
      console.error("[updateSupplier]", error.message);
      return { ok: false as const, message: "We couldn't save that supplier. Please try again." };
    }
    return { ok: true as const };
  });

export interface SupplierPurchase {
  id: string;
  poNumber: string;
  orderDate: string;
  status: PoStatus;
  total: number;
  lineCount: number;
  receivedLines: number;
}

export const getSupplierPurchaseHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, supplierId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SupplierPurchase[]> => {
    await requireSupplierAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadSupplier(supabaseAdmin, data.restaurantId, data.supplierId);

    const { data: orders } = await supabaseAdmin
      .from("purchase_orders")
      .select("id, po_number, order_date, status, total")
      .eq("restaurant_id", data.restaurantId)
      .eq("supplier_id", data.supplierId)
      .order("order_date", { ascending: false })
      .limit(100);

    const ids = (orders ?? []).map((o) => o.id);
    const { data: lines } = ids.length
      ? await supabaseAdmin
          .from("purchase_order_items")
          .select("purchase_order_id, ordered_quantity, received_quantity")
          .in("purchase_order_id", ids)
      : { data: [] as any[] };

    const byPo = new Map<string, { total: number; received: number }>();
    for (const l of (lines ?? []) as any[]) {
      const agg = byPo.get(l.purchase_order_id) ?? { total: 0, received: 0 };
      agg.total += 1;
      if (Number(l.received_quantity) >= Number(l.ordered_quantity)) agg.received += 1;
      byPo.set(l.purchase_order_id, agg);
    }

    return (orders ?? []).map((o) => ({
      id: o.id,
      poNumber: o.po_number,
      orderDate: o.order_date,
      status: o.status as PoStatus,
      total: Number(o.total),
      lineCount: byPo.get(o.id)?.total ?? 0,
      receivedLines: byPo.get(o.id)?.received ?? 0,
    }));
  });
