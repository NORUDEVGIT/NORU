import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership, displayName, getRestaurantSettings } from "@/core/lib/workforce.server";
import { canViewInventory, isManager, stockStatus, type MovementType } from "./inventory.server";
import { warrantyState } from "./assets.server";
import {
  RANGE_PRESETS,
  canViewFinancials,
  canViewReports,
  categoryOf,
  localDayOf,
  movementValue,
  resolveRange,
  round2,
  type MovementCategory,
  type RangePreset,
} from "./inventory-reporting.server";

/**
 * Inventory reporting server functions.
 *
 * Every function authenticates, resolves the caller's own membership for the
 * requested restaurant, scopes each query by `restaurant_id`, resolves date
 * boundaries from the restaurant's timezone, and strips cost/valuation fields
 * for roles that may not see them (kitchen). Waiters are rejected outright.
 */

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeSchema = z.object({
  restaurantId: idSchema,
  preset: z.enum(RANGE_PRESETS).default("7d"),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

const MOVEMENT_SCAN_LIMIT = 5000;

export interface ReportingPermissions {
  role: string;
  canView: boolean;
  canManage: boolean;
  canViewFinancials: boolean;
  canViewReports: boolean;
}

export interface StockAttentionItem {
  id: string;
  name: string;
  inventoryType: "ingredient" | "consumable";
  quantity: number;
  unitCode: string;
  minimumStockLevel: number;
  status: "out" | "low";
  unitCost: number | null;
  stockValue: number | null;
}

export interface MovementTrendDay {
  date: string;
  stockInValue: number;
  usageValue: number;
  wasteValue: number;
  lossValue: number;
  adjustmentValue: number;
  stockInCount: number;
  usageCount: number;
  wasteCount: number;
  lossCount: number;
  adjustmentCount: number;
}

export interface WasteLossEntry {
  id: string;
  createdAt: string;
  itemId: string;
  itemName: string;
  kind: "waste" | "loss";
  quantity: number;
  unitCode: string;
  value: number | null;
  reason: string | null;
  recordedBy: string | null;
}

export interface ActivityEntry {
  id: string;
  source: "stock" | "asset";
  createdAt: string;
  subject: string;
  event: string;
  detail: string | null;
  value: number | null;
  actor: string | null;
}

async function requireReportingAccess(context: any, restaurantId: string) {
  const me = await callerMembership(context, restaurantId);
  if (!canViewInventory(me.role)) {
    throw new Error("You don't have access to inventory reporting for this restaurant.");
  }
  return me;
}

function permissionsFor(role: string): ReportingPermissions {
  return {
    role,
    canView: canViewInventory(role),
    canManage: isManager(role),
    canViewFinancials: canViewFinancials(role),
    canViewReports: canViewReports(role),
  };
}

/** membership id -> display name, resolved through profiles like the ledger does. */
async function recorderNames(admin: any, membershipIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const ids = [...new Set(membershipIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { data: members } = await admin.from("restaurant_users").select("id, user_id").in("id", ids);
  const userIds = (members ?? []).map((m: any) => m.user_id);
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
    : { data: [] as any[] };
  const byUser = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
  for (const m of members ?? []) {
    const p = byUser.get(m.user_id);
    map.set(m.id, displayName(p) ?? p?.email ?? null);
  }
  return map;
}

interface ItemMeta {
  id: string;
  name: string;
  inventoryType: string;
  unitCost: number | null;
  unitCode: string;
}

async function loadItemMeta(admin: any, restaurantId: string) {
  const [{ data: items }, { data: units }] = await Promise.all([
    admin
      .from("inventory_items")
      .select("id, name, inventory_type, base_unit_id, current_quantity, minimum_stock_level, unit_cost, active")
      .eq("restaurant_id", restaurantId),
    admin.from("inventory_units").select("id, code"),
  ]);
  const unitCode = new Map<string, string>((units ?? []).map((u: any) => [u.id, u.code]));
  const meta = new Map<string, ItemMeta>(
    (items ?? []).map((i: any) => [
      i.id,
      {
        id: i.id,
        name: i.name,
        inventoryType: i.inventory_type,
        unitCost: i.unit_cost === null ? null : Number(i.unit_cost),
        unitCode: unitCode.get(i.base_unit_id) ?? "",
      },
    ]),
  );
  return { rows: (items ?? []) as any[], meta, unitCode };
}

async function loadMovementsInRange(admin: any, restaurantId: string, fromIso: string, toIso: string) {
  const { data, error } = await admin
    .from("inventory_stock_movements")
    .select("id, inventory_item_id, movement_type, quantity, unit_id, unit_cost, reason, created_by_staff_membership_id, created_at")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(MOVEMENT_SCAN_LIMIT);
  if (error) throw new Error("We couldn't load stock movements for that period.");
  return (data ?? []) as any[];
}

/* ------------------------------------------------------------------ */
/* Dashboard KPIs                                                      */
/* ------------------------------------------------------------------ */

export const getInventoryDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireReportingAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
    const range = resolveRange(settings.timezone, data.preset as RangePreset, data.from, data.to);
    const financials = canViewFinancials(me.role);

    const { rows, meta } = await loadItemMeta(supabaseAdmin, data.restaurantId);
    const active = rows.filter((r) => r.active);

    let ingredients = 0;
    let consumables = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let ingredientValue = 0;
    let consumableValue = 0;
    let uncosted = 0;

    for (const r of active) {
      const quantity = Number(r.current_quantity);
      const status = stockStatus(quantity, Number(r.minimum_stock_level));
      if (status === "out") outOfStock += 1;
      else if (status === "low") lowStock += 1;
      if (r.inventory_type === "ingredient") ingredients += 1;
      else consumables += 1;

      if (r.unit_cost === null) uncosted += 1;
      else {
        const value = quantity * Number(r.unit_cost);
        if (r.inventory_type === "ingredient") ingredientValue += value;
        else consumableValue += value;
      }
    }

    // Waste and loss for the selected range.
    const movements = await loadMovementsInRange(
      supabaseAdmin,
      data.restaurantId,
      range.fromIso,
      range.toIso,
    );
    let wasteValue = 0;
    let lossValue = 0;
    let wasteEvents = 0;
    let lossEvents = 0;
    let uncostedMovements = 0;
    for (const m of movements) {
      const type = m.movement_type as MovementType;
      if (type !== "waste" && type !== "loss") continue;
      const item = meta.get(m.inventory_item_id);
      const value = movementValue(
        m.unit_cost === null ? null : Number(m.unit_cost),
        item?.unitCost ?? null,
        Number(m.quantity),
      );
      if (value === null) uncostedMovements += 1;
      if (type === "waste") {
        wasteEvents += 1;
        wasteValue += value ?? 0;
      } else {
        lossEvents += 1;
        lossValue += value ?? 0;
      }
    }

    // Assets (register is separate from stock value by design).
    const { data: assets } = await supabaseAdmin
      .from("restaurant_assets")
      .select("asset_type, status, warranty_expiry, purchase_cost")
      .eq("restaurant_id", data.restaurantId);

    let operatingAssets = 0;
    let equipment = 0;
    let activeAssets = 0;
    let underMaintenance = 0;
    let outOfService = 0;
    let disposed = 0;
    let warrantyExpired = 0;
    let warrantyExpiring = 0;
    for (const a of (assets ?? []) as any[]) {
      if (a.status === "disposed") {
        disposed += 1;
        continue;
      }
      if (a.asset_type === "operating_asset") operatingAssets += 1;
      else equipment += 1;
      if (a.status === "active") activeAssets += 1;
      else if (a.status === "under_maintenance") underMaintenance += 1;
      else if (a.status === "out_of_service") outOfService += 1;
      const warranty = warrantyState(a.warranty_expiry, range.today);
      if (warranty === "expired") warrantyExpired += 1;
      else if (warranty === "expiring") warrantyExpiring += 1;
    }

    return {
      permissions: permissionsFor(me.role),
      timezone: settings.timezone,
      currencyCode: settings.currencyCode,
      range: { preset: data.preset, from: range.fromDate, to: range.toDate, today: range.today },
      stock: {
        totalItems: active.length,
        ingredients,
        consumables,
        lowStock,
        outOfStock,
        // Valuation covers only items that actually have a unit cost.
        stockValue: financials ? round2(ingredientValue + consumableValue) : null,
        ingredientValue: financials ? round2(ingredientValue) : null,
        consumableValue: financials ? round2(consumableValue) : null,
        uncostedItems: uncosted,
      },
      waste: {
        value: financials ? round2(wasteValue) : null,
        events: wasteEvents,
      },
      loss: {
        value: financials ? round2(lossValue) : null,
        events: lossEvents,
      },
      uncostedMovements,
      assets: {
        operatingAssets,
        equipment,
        active: activeAssets,
        underMaintenance,
        outOfService,
        disposed,
        warrantyExpired,
        warrantyExpiring,
      },
    };
  });

/* ------------------------------------------------------------------ */
/* Movement trend                                                      */
/* ------------------------------------------------------------------ */

export const getInventoryMovementAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireReportingAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
    const range = resolveRange(settings.timezone, data.preset as RangePreset, data.from, data.to);
    const financials = canViewFinancials(me.role);

    const { meta } = await loadItemMeta(supabaseAdmin, data.restaurantId);
    const movements = await loadMovementsInRange(
      supabaseAdmin,
      data.restaurantId,
      range.fromIso,
      range.toIso,
    );

    const byDay = new Map<string, MovementTrendDay>();
    for (const day of range.days) {
      byDay.set(day, {
        date: day,
        stockInValue: 0,
        usageValue: 0,
        wasteValue: 0,
        lossValue: 0,
        adjustmentValue: 0,
        stockInCount: 0,
        usageCount: 0,
        wasteCount: 0,
        lossCount: 0,
        adjustmentCount: 0,
      });
    }

    let valued = 0;
    for (const m of movements) {
      const day = byDay.get(localDayOf(m.created_at, settings.timezone));
      if (!day) continue;
      const category: MovementCategory = categoryOf(m.movement_type);
      const item = meta.get(m.inventory_item_id);
      const value = movementValue(
        m.unit_cost === null ? null : Number(m.unit_cost),
        item?.unitCost ?? null,
        Number(m.quantity),
      );
      if (value !== null) valued += 1;
      const countKey = `${camel(category)}Count` as keyof MovementTrendDay;
      const valueKey = `${camel(category)}Value` as keyof MovementTrendDay;
      (day[countKey] as number) += 1;
      (day[valueKey] as number) += value ?? 0;
    }

    const days = range.days.map((d) => {
      const row = byDay.get(d)!;
      return {
        ...row,
        stockInValue: financials ? round2(row.stockInValue) : 0,
        usageValue: financials ? round2(row.usageValue) : 0,
        wasteValue: financials ? round2(row.wasteValue) : 0,
        lossValue: financials ? round2(row.lossValue) : 0,
        adjustmentValue: financials ? round2(row.adjustmentValue) : 0,
      };
    });

    return {
      days,
      /** Quantities are never summed across units; value is only meaningful when costs exist. */
      hasValue: financials && valued > 0,
      totalMovements: movements.length,
      truncated: movements.length >= MOVEMENT_SCAN_LIMIT,
    };
  });

function camel(category: MovementCategory): string {
  return category === "stock_in" ? "stockIn" : category;
}

/* ------------------------------------------------------------------ */
/* Waste & loss                                                        */
/* ------------------------------------------------------------------ */

export const getWasteLossReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    rangeSchema.extend({ limit: z.number().int().min(1).max(200).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReportingAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
    const range = resolveRange(settings.timezone, data.preset as RangePreset, data.from, data.to);
    const financials = canViewFinancials(me.role);

    const { meta } = await loadItemMeta(supabaseAdmin, data.restaurantId);
    const movements = (
      await loadMovementsInRange(supabaseAdmin, data.restaurantId, range.fromIso, range.toIso)
    ).filter((m) => m.movement_type === "waste" || m.movement_type === "loss");

    const names = await recorderNames(
      supabaseAdmin,
      movements.map((m) => m.created_by_staff_membership_id),
    );

    const entries: WasteLossEntry[] = movements.map((m) => {
      const item = meta.get(m.inventory_item_id);
      const value = movementValue(
        m.unit_cost === null ? null : Number(m.unit_cost),
        item?.unitCost ?? null,
        Number(m.quantity),
      );
      return {
        id: m.id,
        createdAt: m.created_at,
        itemId: m.inventory_item_id,
        itemName: item?.name ?? "",
        kind: m.movement_type as "waste" | "loss",
        quantity: Math.abs(Number(m.quantity)),
        unitCode: item?.unitCode ?? "",
        value: financials ? (value === null ? null : round2(value)) : null,
        reason: m.reason,
        recordedBy: m.created_by_staff_membership_id
          ? names.get(m.created_by_staff_membership_id) ?? null
          : null,
      };
    });

    const totals = { wasteValue: 0, lossValue: 0, wasteEvents: 0, lossEvents: 0, uncosted: 0 };
    const byItem = new Map<string, { itemId: string; itemName: string; kind: "waste" | "loss"; quantity: number; unitCode: string; value: number; events: number }>();
    for (const e of entries) {
      if (e.kind === "waste") {
        totals.wasteEvents += 1;
        totals.wasteValue += e.value ?? 0;
      } else {
        totals.lossEvents += 1;
        totals.lossValue += e.value ?? 0;
      }
      if (e.value === null) totals.uncosted += 1;
      const key = `${e.kind}:${e.itemId}`;
      const agg =
        byItem.get(key) ??
        { itemId: e.itemId, itemName: e.itemName, kind: e.kind, quantity: 0, unitCode: e.unitCode, value: 0, events: 0 };
      agg.quantity += e.quantity;
      agg.value += e.value ?? 0;
      agg.events += 1;
      byItem.set(key, agg);
    }

    const ranked = [...byItem.values()].map((a) => ({ ...a, value: round2(a.value) }));
    const sortByImpact = (a: typeof ranked[number], b: typeof ranked[number]) =>
      financials ? b.value - a.value || b.events - a.events : b.events - a.events;

    const limit = data.limit ?? 50;
    return {
      permissions: permissionsFor(me.role),
      currencyCode: settings.currencyCode,
      range: { from: range.fromDate, to: range.toDate },
      totals: {
        wasteValue: financials ? round2(totals.wasteValue) : null,
        lossValue: financials ? round2(totals.lossValue) : null,
        wasteEvents: totals.wasteEvents,
        lossEvents: totals.lossEvents,
        uncostedEvents: totals.uncosted,
      },
      topWaste: ranked.filter((r) => r.kind === "waste").sort(sortByImpact).slice(0, 5),
      topLoss: ranked.filter((r) => r.kind === "loss").sort(sortByImpact).slice(0, 5),
      entries: entries.slice(0, limit),
      hasMore: entries.length > limit,
    };
  });

/* ------------------------------------------------------------------ */
/* Stock attention                                                     */
/* ------------------------------------------------------------------ */

export const getStockAttentionItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, limit: z.number().int().min(1).max(100).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReportingAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const financials = canViewFinancials(me.role);
    const { rows, unitCode } = await loadItemMeta(supabaseAdmin, data.restaurantId);

    const items: StockAttentionItem[] = rows
      .filter((r) => r.active && Number(r.current_quantity) <= Number(r.minimum_stock_level))
      .map((r) => {
        const quantity = Number(r.current_quantity);
        const unitCost = r.unit_cost === null ? null : Number(r.unit_cost);
        return {
          id: r.id,
          name: r.name,
          inventoryType: r.inventory_type as "ingredient" | "consumable",
          quantity,
          unitCode: unitCode.get(r.base_unit_id) ?? "",
          minimumStockLevel: Number(r.minimum_stock_level),
          status: (quantity <= 0 ? "out" : "low") as "out" | "low",
          unitCost: financials ? unitCost : null,
          stockValue: financials && unitCost !== null ? round2(quantity * unitCost) : null,
        };
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "out" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return items.slice(0, data.limit ?? 50);
  });

/* ------------------------------------------------------------------ */
/* Asset analytics                                                     */
/* ------------------------------------------------------------------ */

export const getAssetAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireReportingAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
    const today = resolveRange(settings.timezone, "today").today;
    const financials = canViewFinancials(me.role);

    const { data: assets } = await supabaseAdmin
      .from("restaurant_assets")
      .select(
        "id, name, asset_type, quantity, condition, status, location, purchase_cost, warranty_expiry, updated_at",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("name", { ascending: true });

    const rows = ((assets ?? []) as any[]).map((a) => ({
      id: a.id,
      name: a.name,
      assetType: a.asset_type as "operating_asset" | "equipment",
      quantity: Number(a.quantity),
      condition: a.condition as string,
      status: a.status as string,
      location: a.location as string | null,
      purchaseCost: financials && a.purchase_cost !== null ? Number(a.purchase_cost) : null,
      warranty: warrantyState(a.warranty_expiry, today),
      warrantyExpiry: a.warranty_expiry as string | null,
      updatedAt: a.updated_at as string,
    }));

    const statusCounts = { active: 0, under_maintenance: 0, out_of_service: 0, disposed: 0 };
    for (const r of rows) {
      if (r.status in statusCounts) (statusCounts as any)[r.status] += 1;
    }

    return {
      permissions: permissionsFor(me.role),
      statusCounts,
      warranty: {
        expired: rows.filter((r) => r.status !== "disposed" && r.warranty === "expired").length,
        expiring: rows.filter((r) => r.status !== "disposed" && r.warranty === "expiring").length,
      },
      assets: rows,
    };
  });

/* ------------------------------------------------------------------ */
/* Recent activity                                                     */
/* ------------------------------------------------------------------ */

const ASSET_EVENT_LABEL: Record<string, string> = {
  asset_created: "Asset created",
  asset_updated: "Asset updated",
  condition_changed: "Condition changed",
  status_changed: "Status changed",
  location_changed: "Location changed",
  quantity_changed: "Quantity changed",
  disposed: "Disposed",
};

const STOCK_EVENT_LABEL: Record<string, string> = {
  opening_balance: "Opening balance",
  purchase_received: "Stock received",
  usage: "Usage",
  waste: "Waste",
  loss: "Loss",
  adjustment_in: "Adjustment in",
  adjustment_out: "Adjustment out",
  stocktake_adjustment: "Stocktake adjustment",
};

export const getRecentInventoryActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, limit: z.number().int().min(1).max(50).optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ActivityEntry[]> => {
    const me = await requireReportingAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const financials = canViewFinancials(me.role);
    const limit = data.limit ?? 25;

    const { meta } = await loadItemMeta(supabaseAdmin, data.restaurantId);

    const [{ data: movements }, { data: history }] = await Promise.all([
      supabaseAdmin
        .from("inventory_stock_movements")
        .select("id, inventory_item_id, movement_type, quantity, unit_cost, reason, created_by_staff_membership_id, created_at")
        .eq("restaurant_id", data.restaurantId)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from("restaurant_asset_history")
        .select("id, asset_id, event_type, new_values, notes, created_by_staff_membership_id, created_at")
        .eq("restaurant_id", data.restaurantId)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    const assetIds = [...new Set(((history ?? []) as any[]).map((h) => h.asset_id))];
    const { data: assets } = assetIds.length
      ? await supabaseAdmin.from("restaurant_assets").select("id, name").in("id", assetIds)
      : { data: [] as any[] };
    const assetName = new Map<string, string>(((assets ?? []) as any[]).map((a) => [a.id, a.name]));

    const names = await recorderNames(supabaseAdmin, [
      ...((movements ?? []) as any[]).map((m) => m.created_by_staff_membership_id),
      ...((history ?? []) as any[]).map((h) => h.created_by_staff_membership_id),
    ]);

    const stockEntries: ActivityEntry[] = ((movements ?? []) as any[]).map((m) => {
      const item = meta.get(m.inventory_item_id);
      const quantity = Number(m.quantity);
      const value = movementValue(
        m.unit_cost === null ? null : Number(m.unit_cost),
        item?.unitCost ?? null,
        quantity,
      );
      return {
        id: `stock:${m.id}`,
        source: "stock" as const,
        createdAt: m.created_at,
        subject: item?.name ?? "",
        event: STOCK_EVENT_LABEL[m.movement_type] ?? m.movement_type,
        detail: `${quantity > 0 ? "+" : ""}${quantity} ${item?.unitCode ?? ""}`.trim(),
        value: financials && value !== null ? round2(value) : null,
        actor: m.created_by_staff_membership_id ? names.get(m.created_by_staff_membership_id) ?? null : null,
      };
    });

    const assetEntries: ActivityEntry[] = ((history ?? []) as any[]).map((h) => ({
      id: `asset:${h.id}`,
      source: "asset" as const,
      createdAt: h.created_at,
      subject: assetName.get(h.asset_id) ?? "",
      event: ASSET_EVENT_LABEL[h.event_type] ?? h.event_type,
      detail: describeAssetChange(h.new_values) ?? h.notes ?? null,
      value: null,
      actor: h.created_by_staff_membership_id ? names.get(h.created_by_staff_membership_id) ?? null : null,
    }));

    return [...stockEntries, ...assetEntries]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  });

function describeAssetChange(values: any): string | null {
  if (!values || typeof values !== "object") return null;
  const parts = Object.entries(values)
    .filter(([key]) => ["status", "condition", "location", "quantity"].includes(key))
    .map(([key, value]) => `${key}: ${value ?? "—"}`);
  return parts.length ? parts.join(" · ") : null;
}
