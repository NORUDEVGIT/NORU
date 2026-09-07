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
import { STANDALONE_POS_ROLES } from "./module-access";

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

/** Display names for membership ids, resolved server-side. */
async function membershipNames(db: any, restaurantId: string, ids: string[]) {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data: members } = await db
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", unique);
  const rows = (members ?? []) as any[];
  const { data: profiles } = await db
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in("id", rows.map((r) => r.user_id));
  const byUser = new Map<string, any>();
  for (const p of (profiles ?? []) as any[]) byUser.set(p.id as string, p);
  for (const r of rows) {
    const p = byUser.get(r.user_id as string);
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
    out.set(r.id as string, name || (p?.email as string) || "A team member");
  }
  return out;
}

/**
 * Cash the drawer should hold for a shift: opening float plus captured cash
 * payments, minus cash refunds. Card and any other tender never count.
 */
async function expectedCashFor(db: any, shiftId: string, openingFloat: number) {
  const { data: payments } = await db
    .from("pos_payments")
    .select("amount")
    .eq("shift_id", shiftId)
    .eq("payment_method", "cash")
    .eq("status", "captured");
  const { data: refunds } = await db
    .from("pos_refunds")
    .select("amount")
    .eq("shift_id", shiftId)
    .eq("method", "cash");
  const sum = (rows: any[] | null) => round2((rows ?? []).reduce((a, r) => a + Number(r.amount), 0));
  const takings = sum(payments);
  const refunded = sum(refunds);
  return {
    cashTakings: takings,
    cashRefunds: refunded,
    expectedCash: round2(openingFloat + takings - refunded),
  };
}


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

    const cash = await expectedCashFor(db, data.shiftId, Number(shift.opening_float));
    const expected = cash.expectedCash;
    const closing = round2(data.closingCash);
    const variance = round2(closing - expected);

    const { error } = await db
      .from("pos_cashier_shifts")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by_membership_id: membership.id,
        closing_cash: closing,
        expected_cash: expected,
        variance,
        notes: data.notes ?? null,
      })
      .eq("id", data.shiftId)
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open");
    if (error) fail(error);
    return {
      ok: true as const,
      openingFloat: round2(Number(shift.opening_float)),
      cashTakings: cash.cashTakings,
      cashRefunds: cash.cashRefunds,
      expectedCash: expected,
      closingCash: closing,
      variance,
    };
  });

/**
 * Phase 8H4 — trusted current-state read for the registers & shifts screen.
 * The browser never decides who holds which till.
 */
export const getPosShiftState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    const property = await propertyContext(db, data.restaurantId);

    const { data: registers } = await db
      .from("pos_registers")
      .select("id, name, location_label, active")
      .eq("restaurant_id", data.restaurantId)
      .order("name");
    const { data: shifts } = await db
      .from("pos_cashier_shifts")
      .select("id, register_id, business_date, opening_float, opened_at, opened_by_membership_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open");
    const openRows = (shifts ?? []) as any[];
    const names = await membershipNames(
      db,
      data.restaurantId,
      openRows.map((s) => s.opened_by_membership_id),
    );
    const registerName = new Map<string, string>();
    for (const r of (registers ?? []) as any[]) registerName.set(r.id as string, r.name as string);

    const mine = openRows.filter((s) => s.opened_by_membership_id === membership.id);
    const myShifts = await Promise.all(
      mine.map(async (s) => {
        const cash = await expectedCashFor(db, s.id as string, Number(s.opening_float));
        return {
          id: s.id as string,
          registerId: s.register_id as string,
          registerName: registerName.get(s.register_id as string) ?? "Register",
          businessDate: s.business_date as string,
          openedAt: s.opened_at as string,
          openedBy: names.get(s.opened_by_membership_id as string) ?? "You",
          openingFloat: Number(s.opening_float),
          ...cash,
        };
      }),
    );

    return {
      role: membership.role,
      currency: property.currency,
      businessDate: property.businessDate,
      myShifts,
      registers: ((registers ?? []) as any[]).map((r) => {
        const shift = openRows.find((s) => s.register_id === r.id);
        return {
          id: r.id as string,
          name: r.name as string,
          locationLabel: (r.location_label as string) ?? null,
          active: Boolean(r.active),
          openShiftId: shift ? (shift.id as string) : null,
          openShiftMine: shift ? shift.opened_by_membership_id === membership.id : false,
          openShiftBy: shift ? names.get(shift.opened_by_membership_id as string) ?? "A cashier" : null,
        };
      }),
    };
  });

/** Recent Standalone POS shift history. Never Restaurant Management shifts. */
export const listPosShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; limit?: number }) =>
    z.object({ restaurantId: idSchema, limit: z.number().int().min(1).max(100).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    const { data: rows } = await db
      .from("pos_cashier_shifts")
      .select(
        "id, register_id, business_date, status, opening_float, expected_cash, closing_cash, variance, opened_at, closed_at, opened_by_membership_id, closed_by_membership_id, notes",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("opened_at", { ascending: false })
      .limit(data.limit ?? 25);
    const list = (rows ?? []) as any[];
    const { data: registers } = await db
      .from("pos_registers")
      .select("id, name")
      .eq("restaurant_id", data.restaurantId);
    const registerName = new Map<string, string>();
    for (const r of (registers ?? []) as any[]) registerName.set(r.id as string, r.name as string);
    const names = await membershipNames(db, data.restaurantId, [
      ...list.map((s) => s.opened_by_membership_id),
      ...list.map((s) => s.closed_by_membership_id).filter(Boolean),
    ]);
    return list.map((s) => ({
      id: s.id as string,
      registerName: registerName.get(s.register_id as string) ?? "Register",
      businessDate: s.business_date as string,
      status: s.status as string,
      openingFloat: Number(s.opening_float),
      expectedCash: s.expected_cash === null ? null : Number(s.expected_cash),
      closingCash: s.closing_cash === null ? null : Number(s.closing_cash),
      variance: s.variance === null ? null : Number(s.variance),
      openedAt: s.opened_at as string,
      closedAt: (s.closed_at as string) ?? null,
      openedBy: names.get(s.opened_by_membership_id as string) ?? "A team member",
      closedBy: s.closed_by_membership_id ? names.get(s.closed_by_membership_id as string) ?? "A team member" : null,
      notes: (s.notes as string) ?? null,
    }));
  });

/**
 * Phase 8H4 — the single trusted answer to "can this person sell right now?".
 * Reused by the sell screen in 8H5. Returns a reason instead of throwing so
 * the package home can explain what is missing.
 */
export const posSellReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    let membership: { id: string; role: string };
    try {
      membership = await requireStandalonePosAccess(context as any, data.restaurantId);
    } catch {
      return { ready: false as const, reason: "You don't have access to Standalone POS for this property." };
    }
    if (!(STANDALONE_POS_ROLES as readonly string[]).includes(membership.role)) {
      return { ready: false as const, reason: "Your role can view this till but not sell on it." };
    }
    const db = await admin();
    const { count: activeRegisters } = await db
      .from("pos_registers")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true);
    if (!Number(activeRegisters ?? 0)) {
      return { ready: false as const, reason: "No active register yet. Add one in Registers & Shifts." };
    }
    const { data: shift } = await db
      .from("pos_cashier_shifts")
      .select("id, register_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open")
      .eq("opened_by_membership_id", membership.id)
      .limit(1)
      .maybeSingle();
    if (!shift) {
      return { ready: false as const, reason: "You don't have an open cashier shift. Open one to start selling." };
    }
    return {
      ready: true as const,
      reason: null,
      shiftId: shift.id as string,
      registerId: shift.register_id as string,
    };
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
        "id, register_id, shift_id, sale_number, sale_reference, status, business_date, currency_code, subtotal, discount_amount, tax_amount, total, refunded_amount, customer_reference, cashier_name_snapshot, completed_by_membership_id, opened_by_membership_id, completed_at, voided_at, created_at",
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
      .select(
        "id, payment_id, shift_id, amount, method, reason, authorized_by_membership_id, processed_by_membership_id, created_at",
      )
      .eq("sale_id", data.saleId)
      .order("created_at");

    const { data: register } = await db
      .from("pos_registers")
      .select("name")
      .eq("id", sale.register_id)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();

    const refundRows = (refunds ?? []) as any[];
    const names = await membershipNames(db, data.restaurantId, [
      (sale.completed_by_membership_id as string) ?? (sale.opened_by_membership_id as string),
      ...refundRows.flatMap((r) => [r.processed_by_membership_id, r.authorized_by_membership_id]),
    ]);

    // Refunded per tender, so the screen can cap each one honestly.
    const refundedByPayment = new Map<string, number>();
    for (const r of refundRows) {
      if (!r.payment_id) continue;
      refundedByPayment.set(
        r.payment_id as string,
        round2((refundedByPayment.get(r.payment_id as string) ?? 0) + Number(r.amount)),
      );
    }

    const total = Number(sale.total);
    const refundedAmount = Number(sale.refunded_amount);

    return {
      id: sale.id as string,
      registerId: sale.register_id as string,
      registerName: (register?.name as string) ?? "—",
      shiftId: (sale.shift_id as string) ?? null,
      cashier:
        (sale.cashier_name_snapshot as string) ??
        names.get((sale.completed_by_membership_id ?? sale.opened_by_membership_id) as string) ??
        "—",
      saleNumber: sale.sale_number === null ? null : Number(sale.sale_number),
      reference: (sale.sale_reference as string) ?? null,
      status: sale.status as string,
      businessDate: sale.business_date as string,
      currency: sale.currency_code as string,
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discount_amount),
      taxAmount: Number(sale.tax_amount),
      total,
      refundedAmount,
      refundable: sale.status === "voided" ? 0 : round2(Math.max(0, total - refundedAmount)),
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
        refunded: refundedByPayment.get(p.id as string) ?? 0,
        refundable:
          p.status === "voided"
            ? 0
            : round2(Math.max(0, Number(p.amount) - (refundedByPayment.get(p.id as string) ?? 0))),
      })),
      refunds: refundRows.map((r) => ({
        id: r.id as string,
        paymentId: (r.payment_id as string) ?? null,
        shiftId: (r.shift_id as string) ?? null,
        amount: Number(r.amount),
        method: r.method as string,
        reason: (r.reason as string) ?? null,
        processedBy: names.get(r.processed_by_membership_id as string) ?? "A team member",
        authorizedBy: names.get(r.authorized_by_membership_id as string) ?? null,
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
    // Phase 8H5 — idempotent: a retry (double click, dropped connection) must
    // return the receipt that already exists, never a second one.
    const { data: existing } = await db
      .from("pos_sales")
      .select("id, status, sale_number, sale_reference, total")
      .eq("id", data.saleId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (existing && existing.status !== "open" && existing.sale_number) {
      return {
        ok: true as const,
        id: existing.id as string,
        saleNumber: Number(existing.sale_number),
        reference: existing.sale_reference as string,
        total: Number(existing.total),
        alreadyCompleted: true as const,
      };
    }
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
      alreadyCompleted: false as const,
    };
  });


/**
 * Phase 8H6 — refund against a completed sale.
 *
 * Owner/manager only. The refund is always allocated to one of the sale's own
 * captured tenders, so the database can cap it per tender as well as per sale.
 * Cash refunds need an open shift belonging to the person processing them, and
 * the cash impact lands on THAT shift — a closed historical shift is never
 * rewritten. Card refunds are internal POS records: NORU has no payment
 * gateway, so no money moves through a card network here.
 */
export const refundPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { restaurantId: string; saleId: string; paymentId: string; amount: number; reason?: string | null }) =>
      z
        .object({
          restaurantId: idSchema,
          saleId: idSchema,
          paymentId: idSchema,
          amount: z.number().positive(),
          reason: z.string().trim().max(300).nullable().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireStandalonePosManager(context as any, data.restaurantId);
    const db = await admin();

    // The acting shift is resolved server-side; the browser never nominates one.
    const { data: shift } = await db
      .from("pos_cashier_shifts")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open")
      .eq("opened_by_membership_id", membership.id)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: row, error } = await db.rpc("pos_refund_sale_allocated", {
      _restaurant_id: data.restaurantId,
      _sale_id: data.saleId,
      _payment_id: data.paymentId,
      _amount: round2(data.amount),
      _reason: data.reason ?? null,
      _shift_id: (shift?.id as string) ?? null,
      _membership_id: membership.id,
    });
    if (error) fail(error);
    const sale = Array.isArray(row) ? row[0] : row;
    const names = await membershipNames(db, data.restaurantId, [membership.id]);
    return {
      ok: true as const,
      status: sale.status as string,
      reference: (sale.sale_reference as string) ?? null,
      amount: round2(data.amount),
      reason: data.reason ?? null,
      processedBy: names.get(membership.id) ?? "You",
      processedAt: new Date().toISOString(),
      shiftId: (shift?.id as string) ?? null,
      refundedAmount: Number(sale.refunded_amount),
      remaining: round2(Number(sale.total) - Number(sale.refunded_amount)),
    };
  });

/* --------------------------------------------------------- transactions */

export type PosTransactionFilters = {
  restaurantId: string;
  reference?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  status?: string | null;
  registerId?: string | null;
  cashierMembershipId?: string | null;
  method?: string | null;
  limit?: number;
};

/**
 * Phase 8H6 — transaction history for this till only.
 *
 * Reads `pos_sales` and its own tenders; it never looks at Restaurant
 * Management orders or PMS folios.
 */
export const listPosTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PosTransactionFilters) =>
    z
      .object({
        restaurantId: idSchema,
        reference: z.string().trim().max(60).nullable().optional(),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        status: z.enum(["completed", "partially_refunded", "refunded", "voided"]).nullable().optional(),
        registerId: idSchema.nullable().optional(),
        cashierMembershipId: idSchema.nullable().optional(),
        method: z.enum(["cash", "card", "voucher", "other"]).nullable().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();

    let query = db
      .from("pos_sales")
      .select(
        "id, sale_reference, status, business_date, total, refunded_amount, currency_code, register_id, shift_id, completed_by_membership_id, opened_by_membership_id, cashier_name_snapshot, completed_at, created_at",
      )
      .eq("restaurant_id", data.restaurantId)
      .in("status", ["completed", "partially_refunded", "refunded", "voided"]);
    if (data.reference) query = query.ilike("sale_reference", `%${data.reference.replace(/[%_]/g, "")}%`);
    if (data.fromDate) query = query.gte("business_date", data.fromDate);
    if (data.toDate) query = query.lte("business_date", data.toDate);
    if (data.status) query = query.eq("status", data.status);
    if (data.registerId) query = query.eq("register_id", data.registerId);
    if (data.cashierMembershipId) query = query.eq("completed_by_membership_id", data.cashierMembershipId);
    const { data: rows } = await query.order("created_at", { ascending: false }).limit(data.limit ?? 100);

    const sales = (rows ?? []) as any[];
    const saleIds = sales.map((r) => r.id as string);

    const [{ data: registers }, { data: payments }] = await Promise.all([
      db.from("pos_registers").select("id, name").eq("restaurant_id", data.restaurantId),
      saleIds.length
        ? db
            .from("pos_payments")
            .select("sale_id, payment_method, amount, status")
            .eq("restaurant_id", data.restaurantId)
            .in("sale_id", saleIds)
        : Promise.resolve({ data: [] }),
    ]);

    const registerName = new Map(((registers ?? []) as any[]).map((r) => [r.id as string, r.name as string]));
    const tenders = new Map<string, Map<string, number>>();
    for (const p of (payments ?? []) as any[]) {
      if (p.status === "voided") continue;
      const forSale = tenders.get(p.sale_id as string) ?? new Map<string, number>();
      forSale.set(p.payment_method as string, round2((forSale.get(p.payment_method as string) ?? 0) + Number(p.amount)));
      tenders.set(p.sale_id as string, forSale);
    }

    const names = await membershipNames(
      db,
      data.restaurantId,
      sales.map((r) => (r.completed_by_membership_id ?? r.opened_by_membership_id) as string),
    );

    const mapped = sales.map((r) => {
      const total = Number(r.total);
      const refunded = Number(r.refunded_amount);
      const tenderList = [...(tenders.get(r.id as string) ?? new Map()).entries()].map(([method, amount]) => ({
        method: method as string,
        amount: amount as number,
      }));
      return {
        id: r.id as string,
        reference: (r.sale_reference as string) ?? null,
        status: r.status as string,
        businessDate: r.business_date as string,
        total,
        refundedAmount: refunded,
        refundable: r.status === "voided" ? 0 : round2(Math.max(0, total - refunded)),
        currency: r.currency_code as string,
        registerId: (r.register_id as string) ?? null,
        registerName: registerName.get(r.register_id as string) ?? "—",
        cashier:
          (r.cashier_name_snapshot as string) ??
          names.get((r.completed_by_membership_id ?? r.opened_by_membership_id) as string) ??
          "—",
        tenders: tenderList,
        completedAt: (r.completed_at as string) ?? null,
        createdAt: r.created_at as string,
      };
    });

    return data.method
      ? mapped.filter((t) => t.tenders.some((x) => x.method === data.method))
      : mapped;
  });

/** Registers and cashiers that actually appear in this till's history. */
export const getPosTransactionFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStandalonePosAccess(context as any, data.restaurantId);
    const db = await admin();
    const [{ data: registers }, { data: sales }] = await Promise.all([
      db.from("pos_registers").select("id, name").eq("restaurant_id", data.restaurantId).order("name"),
      db
        .from("pos_sales")
        .select("completed_by_membership_id")
        .eq("restaurant_id", data.restaurantId)
        .not("completed_by_membership_id", "is", null)
        .limit(500),
    ]);
    const ids = [...new Set(((sales ?? []) as any[]).map((r) => r.completed_by_membership_id as string))];
    const names = await membershipNames(db, data.restaurantId, ids);
    return {
      registers: ((registers ?? []) as any[]).map((r) => ({ id: r.id as string, name: r.name as string })),
      cashiers: ids.map((id) => ({ id, name: names.get(id) ?? "A team member" })),
    };
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

/* --------------------------------------------------------- sell workflow */

/** Full server-authoritative picture of one sale (lines, tenders, totals). */
async function saleSnapshot(db: any, restaurantId: string, saleId: string) {
  const [{ data: sale }, { data: items }, { data: payments }] = await Promise.all([
    db
      .from("pos_sales")
      .select(
        "id, register_id, shift_id, sale_number, sale_reference, status, business_date, currency_code, subtotal, discount_amount, tax_amount, total, completed_at, created_at",
      )
      .eq("id", saleId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    db
      .from("pos_sale_items")
      .select(
        "id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price_snapshot, tax_rate_snapshot, tax_amount, discount_amount, line_subtotal, line_total, created_at",
      )
      .eq("sale_id", saleId)
      .order("created_at"),
    db
      .from("pos_payments")
      .select("id, payment_method, amount, tendered_amount, change_amount, status, reference, created_at")
      .eq("sale_id", saleId)
      .order("created_at"),
  ]);
  if (!sale) return null;
  const paid = round2(
    ((payments ?? []) as any[])
      .filter((p) => p.status !== "voided")
      .reduce((sum, p) => sum + Number(p.amount), 0),
  );
  const total = Number(sale.total);
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
    total,
    paid,
    remaining: round2(Math.max(0, total - paid)),
    completedAt: (sale.completed_at as string) ?? null,
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
  };
}

export type PosSaleSnapshot = NonNullable<Awaited<ReturnType<typeof saleSnapshot>>>;

/**
 * Phase 8H5 — everything the sell screen needs in one guarded call.
 *
 * The browser never nominates a shift: the server resolves the caller's own
 * open shift, and the working sale is fetched-or-created against it so a
 * double click cannot fan out into two open sales.
 */
export const getPosSellContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; saleId?: string | null; create?: boolean }) =>
    z
      .object({ restaurantId: idSchema, saleId: idSchema.nullable().optional(), create: z.boolean().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let membership: { id: string; role: string };
    try {
      membership = await requireStandalonePosAccess(context as any, data.restaurantId);
    } catch {
      return { ready: false as const, reason: "You don't have access to Standalone POS for this property." };
    }
    if (!(STANDALONE_POS_ROLES as readonly string[]).includes(membership.role)) {
      return { ready: false as const, reason: "Your role can view this till but not sell on it." };
    }
    const db = await admin();
    const { data: shift } = await db
      .from("pos_cashier_shifts")
      .select("id, register_id, business_date, opened_at, opening_float")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open")
      .eq("opened_by_membership_id", membership.id)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!shift) {
      const { count: activeRegisters } = await db
        .from("pos_registers")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", data.restaurantId)
        .eq("active", true);
      return {
        ready: false as const,
        reason: Number(activeRegisters ?? 0)
          ? "You don't have an open cashier shift. Open one to start selling."
          : "No active register yet. Add one, then open a cashier shift.",
      };
    }

    const { data: register } = await db
      .from("pos_registers")
      .select("id, name, active")
      .eq("id", shift.register_id)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!register || !register.active) {
      return {
        ready: false as const,
        reason: "The register for your open shift has been switched off. Close the shift and open another till.",
      };
    }

    const names = await membershipNames(db, data.restaurantId, [membership.id]);
    const { currency } = await propertyContext(db, data.restaurantId);

    // Working sale: the one asked for (if still open on this shift), else the
    // newest open sale on this shift, else a fresh one.
    let workingId: string | null = null;
    if (data.saleId) {
      const { data: asked } = await db
        .from("pos_sales")
        .select("id, status, shift_id")
        .eq("id", data.saleId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (asked && asked.status === "open" && asked.shift_id === shift.id) workingId = asked.id as string;
    }
    if (!workingId) {
      const { data: newest } = await db
        .from("pos_sales")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("shift_id", shift.id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newest) workingId = newest.id as string;
    }
    if (!workingId && data.create !== false) {
      const { data: row, error } = await db
        .from("pos_sales")
        .insert({
          restaurant_id: data.restaurantId,
          register_id: shift.register_id,
          shift_id: shift.id,
          business_date: shift.business_date,
          currency_code: currency,
          opened_by_membership_id: membership.id,
        })
        .select("id")
        .maybeSingle();
      if (error) fail(error);
      workingId = row!.id as string;
    }

    const sale = workingId ? await saleSnapshot(db, data.restaurantId, workingId) : null;

    // Other open sales on this register = parked sales the cashier can resume.
    const { data: parkedRows } = await db
      .from("pos_sales")
      .select("id, total, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("register_id", shift.register_id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20);
    const parked = ((parkedRows ?? []) as any[])
      .filter((r) => r.id !== workingId)
      .map((r) => ({ id: r.id as string, total: Number(r.total), createdAt: r.created_at as string }));

    return {
      ready: true as const,
      reason: null,
      role: membership.role,
      currency,
      shift: {
        id: shift.id as string,
        registerId: shift.register_id as string,
        registerName: register.name as string,
        cashier: names.get(membership.id) ?? "You",
        openedAt: shift.opened_at as string,
        businessDate: shift.business_date as string,
        openingFloat: Number(shift.opening_float),
      },
      sale,
      parked,
    };
  });

/**
 * Phase 8H5 — remove a mis-keyed tender while the sale is still open.
 * Completed sales are immutable; corrections are refunds (8H6).
 */
export const removePosPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; saleId: string; paymentId: string }) =>
    z.object({ restaurantId: idSchema, saleId: idSchema, paymentId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireStandalonePosMutation(context as any, data.restaurantId);
    const db = await admin();
    try {
      await loadOpenSale(db, data.restaurantId, data.saleId);
      const { error } = await db
        .from("pos_payments")
        .delete()
        .eq("id", data.paymentId)
        .eq("sale_id", data.saleId)
        .eq("restaurant_id", data.restaurantId);
      if (error) throw error;
      return { ok: true as const };
    } catch (error) {
      fail(error);
    }
  });
