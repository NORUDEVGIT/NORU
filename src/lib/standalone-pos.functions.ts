/**
 * Phase 8H2 — Standalone POS server primitives.
 *
 * Backend foundation only: no selling UI exists yet. Every function
 * re-derives the caller's membership, checks the `pos` package and the
 * `standalone_pos` module, and performs its writes with the service role
 * after those guards. Money is never taken from the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireStandalonePosAccess,
  requireStandalonePosManager,
  requireStandalonePosMutation,
  standalonePosError,
} from "./standalone-pos.server";
import {
  calculateLine,
  calculateSaleTotals,
  round2,
  type PosProductPricing,
  type PosTaxSettings,
} from "./standalone-pos-pricing.server";
import { propertyToday } from "./reservation-dates";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "./restaurant-time";

const idSchema = z.string().uuid();

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any; rpc: (fn: string, args: any) => any };
}

function fail(error: unknown): never {
  throw standalonePosError(error instanceof Error ? error.message : String(error));
}

/** Property currency + timezone, read server-side. Never hardcoded. */
async function propertyContext(db: any, restaurantId: string) {
  const { data } = await db
    .from("restaurants")
    .select("currency_code, timezone")
    .eq("id", restaurantId)
    .maybeSingle();
  const currency = (data?.currency_code as string) || DEFAULT_CURRENCY;
  const timezone = (data?.timezone as string) || DEFAULT_TIMEZONE;
  return { currency, timezone, businessDate: propertyToday(timezone) };
}

async function taxSettings(db: any, restaurantId: string): Promise<PosTaxSettings> {
  const { data } = await db
    .from("pos_settings")
    .select("default_tax_rate, tax_inclusive")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return {
    defaultTaxRate: Number(data?.default_tax_rate ?? 0),
    taxInclusive: Boolean(data?.tax_inclusive ?? false),
  };
}

async function recalcOpenSale(db: any, restaurantId: string, saleId: string) {
  const { data } = await db
    .from("pos_sale_items")
    .select("line_subtotal, tax_amount, discount_amount, line_total")
    .eq("sale_id", saleId);
  const totals = calculateSaleTotals(
    ((data ?? []) as any[]).map((r) => ({
      lineSubtotal: Number(r.line_subtotal),
      taxAmount: Number(r.tax_amount),
      discountAmount: Number(r.discount_amount),
      lineTotal: Number(r.line_total),
    })),
  );
  await db
    .from("pos_sales")
    .update({
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      tax_amount: totals.taxAmount,
      total: totals.total,
    })
    .eq("id", saleId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "open");
  return totals;
}

async function loadOpenSale(db: any, restaurantId: string, saleId: string) {
  const { data } = await db
    .from("pos_sales")
    .select("id, status, shift_id, register_id")
    .eq("id", saleId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("POS_SALE_NOT_FOUND");
  if (data.status !== "open") throw new Error("POS_SALE_NOT_OPEN");
  return data as { id: string; status: string; shift_id: string | null; register_id: string };
}

/* ------------------------------------------------------------- settings */

export const getPosSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    const [settings, property] = await Promise.all([
      taxSettings(db, data.restaurantId),
      propertyContext(db, data.restaurantId),
    ]);
    return { ...settings, ...property };
  });

export const savePosSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; defaultTaxRate: number; taxInclusive: boolean }) =>
    z
      .object({
        restaurantId: idSchema,
        defaultTaxRate: z.number().min(0).max(100),
        taxInclusive: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosManager(context as any, data.restaurantId);
    const db = await admin();
    const { error } = await db.from("pos_settings").upsert(
      {
        restaurant_id: data.restaurantId,
        default_tax_rate: data.defaultTaxRate,
        tax_inclusive: data.taxInclusive,
      },
      { onConflict: "restaurant_id" },
    );
    if (error) fail(error);
    return { ok: true as const };
  });

/* ------------------------------------------------------------ registers */

export const listPosRegisters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    const { data: rows } = await db
      .from("pos_registers")
      .select("id, name, location_label, active")
      .eq("restaurant_id", data.restaurantId)
      .order("name");
    const { data: openShifts } = await db
      .from("pos_cashier_shifts")
      .select("id, register_id, opened_by_membership_id, opened_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open");
    const names = await membershipNames(
      db,
      data.restaurantId,
      ((openShifts ?? []) as any[]).map((s) => s.opened_by_membership_id),
    );
    const byRegister = new Map<string, any>();
    for (const s of (openShifts ?? []) as any[]) byRegister.set(s.register_id as string, s);
    return ((rows ?? []) as any[]).map((r) => {
      const shift = byRegister.get(r.id as string);
      return {
        id: r.id as string,
        name: r.name as string,
        locationLabel: (r.location_label as string) ?? null,
        active: Boolean(r.active),
        openShiftId: shift ? (shift.id as string) : null,
        openShiftBy: shift ? names.get(shift.opened_by_membership_id as string) ?? "A cashier" : null,
        openShiftAt: shift ? (shift.opened_at as string) : null,
      };
    });
  });

export const savePosRegister = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { restaurantId: string; id?: string; name: string; locationLabel?: string | null; active?: boolean }) =>
      z
        .object({
          restaurantId: idSchema,
          id: idSchema.optional(),
          name: z.string().trim().min(1).max(80),
          locationLabel: z.string().trim().max(120).nullable().optional(),
          active: z.boolean().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosManager(context as any, data.restaurantId);
    const db = await admin();
    // A till with an open cashier shift is never deactivated: the shift must
    // be closed and counted first. Shifts are never closed silently.
    if (data.id && data.active === false) {
      const { data: open } = await db
        .from("pos_cashier_shifts")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("register_id", data.id)
        .eq("status", "open")
        .maybeSingle();
      if (open) {
        fail(new Error("Close the open cashier shift on this register before deactivating it."));
      }
    }
    const payload = {
      restaurant_id: data.restaurantId,
      name: data.name,
      location_label: data.locationLabel ?? null,
      ...(data.active === undefined ? {} : { active: data.active }),
    };
    const query = data.id
      ? db.from("pos_registers").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : db.from("pos_registers").insert(payload);
    const { data: row, error } = await query.select("id").maybeSingle();
    if (error) {
      if (String((error as any).message ?? "").includes("pos_registers_name_unique")) {
        fail(new Error("Another register in this property already uses that name."));
      }
      fail(error);
    }
    return { ok: true as const, id: (row?.id as string) ?? data.id! };
  });

/* ----------------------------------------------------------- categories */

export const listPosCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    const { data: rows } = await db
      .from("pos_categories")
      .select("id, name, sort_order, active")
      .eq("restaurant_id", data.restaurantId)
      .order("sort_order")
      .order("name");
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      sortOrder: Number(r.sort_order),
      active: Boolean(r.active),
    }));
  });

export const savePosCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { restaurantId: string; id?: string; name: string; sortOrder?: number; active?: boolean }) =>
      z
        .object({
          restaurantId: idSchema,
          id: idSchema.optional(),
          name: z.string().trim().min(1).max(80),
          sortOrder: z.number().int().min(0).optional(),
          active: z.boolean().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosManager(context as any, data.restaurantId);
    const db = await admin();
    const payload = {
      restaurant_id: data.restaurantId,
      name: data.name,
      ...(data.sortOrder === undefined ? {} : { sort_order: data.sortOrder }),
      ...(data.active === undefined ? {} : { active: data.active }),
    };
    const query = data.id
      ? db.from("pos_categories").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : db.from("pos_categories").insert(payload);
    const { data: row, error } = await query.select("id").maybeSingle();
    if (error) fail(error);
    return { ok: true as const, id: (row?.id as string) ?? data.id! };
  });

/* ------------------------------------------------------------- products */

export const listPosProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; includeInactive?: boolean }) =>
    z.object({ restaurantId: idSchema, includeInactive: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    let query = db
      .from("pos_products")
      .select("id, category_id, name, sku, barcode, unit_price, tax_rate, active, sort_order")
      .eq("restaurant_id", data.restaurantId);
    if (!data.includeInactive) query = query.eq("active", true);
    const { data: rows } = await query.order("sort_order").order("name");
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      categoryId: (r.category_id as string) ?? null,
      name: r.name as string,
      sku: (r.sku as string) ?? null,
      barcode: (r.barcode as string) ?? null,
      unitPrice: Number(r.unit_price),
      taxRate: r.tax_rate === null ? null : Number(r.tax_rate),
      active: Boolean(r.active),
      sortOrder: Number(r.sort_order),
    }));
  });

export const savePosProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      restaurantId: string;
      id?: string;
      name: string;
      categoryId?: string | null;
      sku?: string | null;
      barcode?: string | null;
      description?: string | null;
      unitPrice: number;
      taxRate?: number | null;
      active?: boolean;
      sortOrder?: number;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          id: idSchema.optional(),
          name: z.string().trim().min(1).max(120),
          categoryId: idSchema.nullable().optional(),
          sku: z.string().trim().max(60).nullable().optional(),
          barcode: z.string().trim().max(60).nullable().optional(),
          description: z.string().trim().max(500).nullable().optional(),
          unitPrice: z.number().min(0),
          taxRate: z.number().min(0).max(100).nullable().optional(),
          active: z.boolean().optional(),
          sortOrder: z.number().int().min(0).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosManager(context as any, data.restaurantId);
    const db = await admin();
    const payload = {
      restaurant_id: data.restaurantId,
      name: data.name,
      category_id: data.categoryId ?? null,
      sku: data.sku || null,
      barcode: data.barcode || null,
      description: data.description || null,
      unit_price: round2(data.unitPrice),
      tax_rate: data.taxRate ?? null,
      ...(data.active === undefined ? {} : { active: data.active }),
      ...(data.sortOrder === undefined ? {} : { sort_order: data.sortOrder }),
    };
    const query = data.id
      ? db.from("pos_products").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : db.from("pos_products").insert(payload);
    const { data: row, error } = await query.select("id").maybeSingle();
    if (error) fail(error);
    return { ok: true as const, id: (row?.id as string) ?? data.id! };
  });

/* --------------------------------------------------------------- shifts */

export const getOpenPosShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; registerId: string }) =>
    z.object({ restaurantId: idSchema, registerId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    const { data: row } = await db
      .from("pos_cashier_shifts")
      .select("id, register_id, business_date, opening_float, opened_at, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("register_id", data.registerId)
      .eq("status", "open")
      .maybeSingle();
    return row
      ? {
          id: row.id as string,
          registerId: row.register_id as string,
          businessDate: row.business_date as string,
          openingFloat: Number(row.opening_float),
          openedAt: row.opened_at as string,
        }
      : null;
  });

export const openPosShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; registerId: string; openingFloat?: number }) =>
    z
      .object({ restaurantId: idSchema, registerId: idSchema, openingFloat: z.number().min(0).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireStandalonePosMutation(context as any, data.restaurantId);
    const db = await admin();
    const { data: register } = await db
      .from("pos_registers")
      .select("id, active")
      .eq("id", data.registerId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!register) fail(new Error("That register could not be found for this property."));
    if (!register.active) fail(new Error("That register is switched off. Activate it before opening a shift."));
    const { businessDate } = await propertyContext(db, data.restaurantId);
    const { data: row, error } = await db
      .from("pos_cashier_shifts")
      .insert({
        restaurant_id: data.restaurantId,
        register_id: data.registerId,
        business_date: businessDate,
        opening_float: round2(data.openingFloat ?? 0),
        opened_by_membership_id: membership.id,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      // Database rule: one open shift per register (partial unique index).
      if (String((error as any).message ?? "").includes("pos_shifts_one_open_per_register")) {
        fail(new Error("That register already has an open cashier shift."));
      }
      fail(error);
    }
    return { ok: true as const, id: row!.id as string };
  });

export const closePosShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; shiftId: string; closingCash: number; notes?: string | null }) =>
    z
      .object({
        restaurantId: idSchema,
        shiftId: idSchema,
        closingCash: z.number().min(0),
        notes: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireStandalonePosMutation(context as any, data.restaurantId);
    const db = await admin();
    const { data: shift } = await db
      .from("pos_cashier_shifts")
      .select("id, opening_float, status")
      .eq("id", data.shiftId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!shift) fail(new Error("That cashier shift could not be found."));
    if (shift.status !== "open") fail(new Error("That cashier shift is closed."));

    const { data: cashPayments } = await db
      .from("pos_payments")
      .select("amount")
      .eq("shift_id", data.shiftId)
      .eq("payment_method", "cash")
      .eq("status", "captured");
    const { data: cashRefunds } = await db
      .from("pos_refunds")
      .select("amount")
      .eq("shift_id", data.shiftId)
      .eq("method", "cash");

    const sum = (rows: any[] | null) => round2((rows ?? []).reduce((a, r) => a + Number(r.amount), 0));
    const expected = round2(Number(shift.opening_float) + sum(cashPayments) - sum(cashRefunds));
    const closing = round2(data.closingCash);

    const { error } = await db
      .from("pos_cashier_shifts")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by_membership_id: membership.id,
        closing_cash: closing,
        expected_cash: expected,
        variance: round2(closing - expected),
        notes: data.notes ?? null,
      })
      .eq("id", data.shiftId)
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open");
    if (error) fail(error);
    return { ok: true as const, expectedCash: expected, variance: round2(closing - expected) };
  });

/* ---------------------------------------------------------------- sales */

export const openPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; registerId: string; shiftId?: string | null }) =>
    z.object({ restaurantId: idSchema, registerId: idSchema, shiftId: idSchema.nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireStandalonePosMutation(context as any, data.restaurantId);
    const db = await admin();
    const { currency, businessDate } = await propertyContext(db, data.restaurantId);
    const { data: row, error } = await db
      .from("pos_sales")
      .insert({
        restaurant_id: data.restaurantId,
        register_id: data.registerId,
        shift_id: data.shiftId ?? null,
        business_date: businessDate,
        currency_code: currency,
        opened_by_membership_id: membership.id,
      })
      .select("id")
      .maybeSingle();
    if (error) fail(error);
    return { ok: true as const, id: row!.id as string };
  });

export const listOpenPosSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; registerId?: string }) =>
    z.object({ restaurantId: idSchema, registerId: idSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    let query = db
      .from("pos_sales")
      .select("id, register_id, total, currency_code, created_at, customer_reference")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open");
    if (data.registerId) query = query.eq("register_id", data.registerId);
    const { data: rows } = await query.order("created_at", { ascending: false });
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      registerId: r.register_id as string,
      total: Number(r.total),
      currency: r.currency_code as string,
      createdAt: r.created_at as string,
      customerReference: (r.customer_reference as string) ?? null,
    }));
  });

export const getPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; saleId: string }) =>
    z.object({ restaurantId: idSchema, saleId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    const { data: sale } = await db
      .from("pos_sales")
      .select(
        "id, register_id, shift_id, sale_number, sale_reference, status, business_date, currency_code, subtotal, discount_amount, tax_amount, total, refunded_amount, customer_reference, completed_at, voided_at, created_at",
      )
      .eq("id", data.saleId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!sale) fail(new Error("POS_SALE_NOT_FOUND"));
    const { data: items } = await db
      .from("pos_sale_items")
      .select(
        "id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price_snapshot, tax_rate_snapshot, tax_amount, discount_amount, line_subtotal, line_total",
      )
      .eq("sale_id", data.saleId)
      .order("created_at");
    const { data: payments } = await db
      .from("pos_payments")
      .select("id, payment_method, amount, tendered_amount, change_amount, status, reference, created_at")
      .eq("sale_id", data.saleId)
      .order("created_at");
    const { data: refunds } = await db
      .from("pos_refunds")
      .select("id, amount, method, reason, created_at")
      .eq("sale_id", data.saleId)
      .order("created_at");

    return {
      id: sale.id as string,
      registerId: sale.register_id as string,
      shiftId: (sale.shift_id as string) ?? null,
      saleNumber: sale.sale_number === null ? null : Number(sale.sale_number),
      reference: (sale.sale_reference as string) ?? null,
      status: sale.status as string,
      businessDate: sale.business_date as string,
      currency: sale.currency_code as string,
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discount_amount),
      taxAmount: Number(sale.tax_amount),
      total: Number(sale.total),
      refundedAmount: Number(sale.refunded_amount),
      customerReference: (sale.customer_reference as string) ?? null,
      completedAt: (sale.completed_at as string) ?? null,
      voidedAt: (sale.voided_at as string) ?? null,
      createdAt: sale.created_at as string,
      items: ((items ?? []) as any[]).map((i) => ({
        id: i.id as string,
        productId: (i.product_id as string) ?? null,
        name: i.product_name_snapshot as string,
        sku: (i.sku_snapshot as string) ?? null,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price_snapshot),
        taxRate: Number(i.tax_rate_snapshot),
        taxAmount: Number(i.tax_amount),
        discountAmount: Number(i.discount_amount),
        lineSubtotal: Number(i.line_subtotal),
        lineTotal: Number(i.line_total),
      })),
      payments: ((payments ?? []) as any[]).map((p) => ({
        id: p.id as string,
        method: p.payment_method as string,
        amount: Number(p.amount),
        tendered: p.tendered_amount === null ? null : Number(p.tendered_amount),
        change: Number(p.change_amount),
        status: p.status as string,
        reference: (p.reference as string) ?? null,
        createdAt: p.created_at as string,
      })),
      refunds: ((refunds ?? []) as any[]).map((r) => ({
        id: r.id as string,
        amount: Number(r.amount),
        method: r.method as string,
        reason: (r.reason as string) ?? null,
        createdAt: r.created_at as string,
      })),
    };
  });

/* ----------------------------------------------------------- sale lines */

export const addPosSaleItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { restaurantId: string; saleId: string; productId: string; quantity: number; discountAmount?: number }) =>
      z
        .object({
          restaurantId: idSchema,
          saleId: idSchema,
          productId: idSchema,
          quantity: z.number().positive().max(9999),
          discountAmount: z.number().min(0).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosMutation(context as any, data.restaurantId);
    const db = await admin();
    try {
      await loadOpenSale(db, data.restaurantId, data.saleId);
      // Price and tax always come from the server-side catalog, never the browser.
      const { data: product } = await db
        .from("pos_products")
        .select("id, name, sku, unit_price, tax_rate, active")
        .eq("id", data.productId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!product || !product.active) throw new Error("That product isn't available.");
      const pricing: PosProductPricing = {
        id: product.id,
        name: product.name,
        sku: product.sku ?? null,
        unitPrice: Number(product.unit_price),
        taxRate: product.tax_rate === null ? null : Number(product.tax_rate),
      };
      const settings = await taxSettings(db, data.restaurantId);
      const line = calculateLine(pricing, data.quantity, data.discountAmount ?? 0, settings);

      const { data: row, error } = await db
        .from("pos_sale_items")
        .insert({
          restaurant_id: data.restaurantId,
          sale_id: data.saleId,
          product_id: pricing.id,
          product_name_snapshot: pricing.name,
          sku_snapshot: pricing.sku,
          quantity: line.quantity,
          unit_price_snapshot: line.unitPrice,
          tax_rate_snapshot: line.taxRate,
          tax_amount: line.taxAmount,
          discount_amount: line.discountAmount,
          line_subtotal: line.lineSubtotal,
          line_total: line.lineTotal,
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      const totals = await recalcOpenSale(db, data.restaurantId, data.saleId);
      return { ok: true as const, id: row!.id as string, totals };
    } catch (error) {
      fail(error);
    }
  });

export const updatePosSaleItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; saleId: string; itemId: string; quantity: number; discountAmount?: number }) =>
    z
      .object({
        restaurantId: idSchema,
        saleId: idSchema,
        itemId: idSchema,
        quantity: z.number().positive().max(9999),
        discountAmount: z.number().min(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosMutation(context as any, data.restaurantId);
    const db = await admin();
    try {
      await loadOpenSale(db, data.restaurantId, data.saleId);
      const { data: item } = await db
        .from("pos_sale_items")
        .select("id, product_id, product_name_snapshot, sku_snapshot, unit_price_snapshot, tax_rate_snapshot")
        .eq("id", data.itemId)
        .eq("sale_id", data.saleId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!item) throw new Error("That sale line could not be found.");
      const settings = await taxSettings(db, data.restaurantId);
      const line = calculateLine(
        {
          id: item.product_id ?? "",
          name: item.product_name_snapshot,
          sku: item.sku_snapshot ?? null,
          unitPrice: Number(item.unit_price_snapshot),
          taxRate: Number(item.tax_rate_snapshot),
        },
        data.quantity,
        data.discountAmount ?? 0,
        settings,
      );
      const { error } = await db
        .from("pos_sale_items")
        .update({
          quantity: line.quantity,
          tax_amount: line.taxAmount,
          discount_amount: line.discountAmount,
          line_subtotal: line.lineSubtotal,
          line_total: line.lineTotal,
        })
        .eq("id", data.itemId)
        .eq("restaurant_id", data.restaurantId);
      if (error) throw error;
      const totals = await recalcOpenSale(db, data.restaurantId, data.saleId);
      return { ok: true as const, totals };
    } catch (error) {
      fail(error);
    }
  });

export const removePosSaleItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; saleId: string; itemId: string }) =>
    z.object({ restaurantId: idSchema, saleId: idSchema, itemId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosMutation(context as any, data.restaurantId);
    const db = await admin();
    try {
      await loadOpenSale(db, data.restaurantId, data.saleId);
      const { error } = await db
        .from("pos_sale_items")
        .delete()
        .eq("id", data.itemId)
        .eq("sale_id", data.saleId)
        .eq("restaurant_id", data.restaurantId);
      if (error) throw error;
      const totals = await recalcOpenSale(db, data.restaurantId, data.saleId);
      return { ok: true as const, totals };
    } catch (error) {
      fail(error);
    }
  });

export const voidPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; saleId: string; reason?: string | null }) =>
    z.object({ restaurantId: idSchema, saleId: idSchema, reason: z.string().trim().max(300).nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosMutation(context as any, data.restaurantId);
    const db = await admin();
    try {
      await loadOpenSale(db, data.restaurantId, data.saleId);
      const { error } = await db
        .from("pos_sales")
        .update({ status: "voided", voided_at: new Date().toISOString(), note: data.reason ?? null })
        .eq("id", data.saleId)
        .eq("restaurant_id", data.restaurantId)
        .eq("status", "open");
      if (error) throw error;
      return { ok: true as const };
    } catch (error) {
      fail(error);
    }
  });

/* ------------------------------------------------------------- payments */

export const recordPosPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      restaurantId: string;
      saleId: string;
      method: "cash" | "card" | "voucher" | "other";
      amount: number;
      tendered?: number | null;
      reference?: string | null;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          saleId: idSchema,
          method: z.enum(["cash", "card", "voucher", "other"]),
          amount: z.number().positive(),
          tendered: z.number().min(0).nullable().optional(),
          reference: z.string().trim().max(120).nullable().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireStandalonePosMutation(context as any, data.restaurantId);
    const db = await admin();
    try {
      const sale = await loadOpenSale(db, data.restaurantId, data.saleId);
      const amount = round2(data.amount);
      const tendered = data.tendered === null || data.tendered === undefined ? null : round2(data.tendered);
      const change = tendered !== null && tendered > amount ? round2(tendered - amount) : 0;
      const { data: row, error } = await db
        .from("pos_payments")
        .insert({
          restaurant_id: data.restaurantId,
          sale_id: data.saleId,
          shift_id: sale.shift_id,
          payment_method: data.method,
          amount,
          tendered_amount: tendered,
          change_amount: change,
          reference: data.reference ?? null,
          received_by_membership_id: membership.id,
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return { ok: true as const, id: row!.id as string, change };
    } catch (error) {
      fail(error);
    }
  });

/* ------------------------------------------------- completion / refunds */

export const completePosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; saleId: string }) =>
    z.object({ restaurantId: idSchema, saleId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireStandalonePosMutation(context as any, data.restaurantId);
    const db = await admin();
    // One atomic database transaction: shift open, sale open, totals
    // recalculated from the lines, payments sufficient, receipt number
    // allocated, sale completed exactly once.
    const { data: row, error } = await db.rpc("pos_complete_sale", {
      _restaurant_id: data.restaurantId,
      _sale_id: data.saleId,
      _membership_id: membership.id,
    });
    if (error) fail(error);
    const sale = Array.isArray(row) ? row[0] : row;
    return {
      ok: true as const,
      id: sale.id as string,
      saleNumber: Number(sale.sale_number),
      reference: sale.sale_reference as string,
      total: Number(sale.total),
    };
  });

export const refundPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      restaurantId: string;
      saleId: string;
      amount: number;
      method: "cash" | "card" | "voucher" | "other";
      reason?: string | null;
      paymentId?: string | null;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          saleId: idSchema,
          amount: z.number().positive(),
          method: z.enum(["cash", "card", "voucher", "other"]),
          reason: z.string().trim().max(300).nullable().optional(),
          paymentId: idSchema.nullable().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireStandalonePosManager(context as any, data.restaurantId);
    const db = await admin();
    const { data: row, error } = await db.rpc("pos_refund_sale", {
      _restaurant_id: data.restaurantId,
      _sale_id: data.saleId,
      _amount: round2(data.amount),
      _method: data.method,
      _reason: data.reason ?? null,
      _payment_id: data.paymentId ?? null,
      _membership_id: membership.id,
    });
    if (error) fail(error);
    const sale = Array.isArray(row) ? row[0] : row;
    return {
      ok: true as const,
      status: sale.status as string,
      refundedAmount: Number(sale.refunded_amount),
      remaining: round2(Number(sale.total) - Number(sale.refunded_amount)),
    };
  });

/* --------------------------------------------------------- transactions */

export const listPosTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; businessDate?: string; limit?: number }) =>
    z
      .object({
        restaurantId: idSchema,
        businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    let query = db
      .from("pos_sales")
      .select("id, sale_reference, status, business_date, total, refunded_amount, currency_code, completed_at, created_at")
      .eq("restaurant_id", data.restaurantId)
      .in("status", ["completed", "partially_refunded", "refunded", "voided"]);
    if (data.businessDate) query = query.eq("business_date", data.businessDate);
    const { data: rows } = await query.order("created_at", { ascending: false }).limit(data.limit ?? 50);
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      reference: (r.sale_reference as string) ?? null,
      status: r.status as string,
      businessDate: r.business_date as string,
      total: Number(r.total),
      refundedAmount: Number(r.refunded_amount),
      currency: r.currency_code as string,
      completedAt: (r.completed_at as string) ?? null,
      createdAt: r.created_at as string,
    }));
  });

/* ------------------------------------------------------- package overview */

/**
 * Phase 8H3 — honest readiness counts for the POS dashboard. Deliberately no
 * sales figures: selling does not exist yet.
 */
export const getPosOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    const count = async (table: string, apply?: (q: any) => any) => {
      let q = db.from(table).select("id", { count: "exact", head: true }).eq("restaurant_id", data.restaurantId);
      if (apply) q = apply(q);
      const { count: n } = await q;
      return Number(n ?? 0);
    };
    const [categories, products, activeProducts, registers, activeRegisters, openShifts] = await Promise.all([
      count("pos_categories"),
      count("pos_products"),
      count("pos_products", (q) => q.eq("active", true)),
      count("pos_registers"),
      count("pos_registers", (q) => q.eq("active", true)),
      count("pos_cashier_shifts", (q) => q.eq("status", "open")),
    ]);
    const property = await propertyContext(db, data.restaurantId);
    return { categories, products, activeProducts, registers, activeRegisters, openShifts, ...property };
  });
