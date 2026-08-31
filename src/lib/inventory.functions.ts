import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership, displayName, getRestaurantSettings } from "./workforce.server";
import {
  INVENTORY_TYPES,
  MOVEMENT_TYPES,
  allowsNegative,
  canRecordMovement,
  canViewInventory,
  isManager,
  loadInventoryItem,
  reasonRequired,
  signedQuantity,
  type MovementType,
} from "./inventory.server";

/**
 * Inventory core server functions. The browser holds no write privileges on
 * any inventory table (RLS grants SELECT to members only); every mutation is
 * authorized here from the caller's own restaurant_users membership.
 */

export interface InventoryUnit {
  id: string;
  code: string;
  name: string;
  unitType: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  inventoryType: "ingredient" | "consumable";
  unitId: string;
  unitCode: string;
  quantity: number;
  minimumStockLevel: number;
  unitCost: number | null;
  stockValue: number | null;
  active: boolean;
  notes: string | null;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  movementType: MovementType;
  quantity: number;
  unitCode: string;
  unitCost: number | null;
  balanceAfter: number | null;
  reason: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface InventoryPermissions {
  role: string;
  canView: boolean;
  canManage: boolean;
  canRecord: boolean;
}

const idSchema = z.string().uuid();
const quantitySchema = z
  .number()
  .finite()
  .positive("Enter a quantity greater than zero.")
  .max(1_000_000_000);

function permissionsFor(role: string): InventoryPermissions {
  return {
    role,
    canView: canViewInventory(role),
    canManage: isManager(role),
    canRecord: canRecordMovement(role, "usage"),
  };
}

async function requireInventoryAccess(context: any, restaurantId: string) {
  const me = await callerMembership(context, restaurantId);
  if (!canViewInventory(me.role)) {
    throw new Error("You don't have access to inventory for this restaurant.");
  }
  return me;
}

export const listInventoryUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<InventoryUnit[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("inventory_units")
      .select("id, code, name, unit_type")
      .eq("is_active", true)
      .order("unit_type", { ascending: true })
      .order("code", { ascending: true });
    return (data ?? []).map((u) => ({ id: u.id, code: u.code, name: u.name, unitType: u.unit_type }));
  });

export const listInventoryItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        inventoryType: z.enum(INVENTORY_TYPES).optional(),
        search: z.string().max(120).optional(),
        includeInactive: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ permissions: InventoryPermissions; timezone: string; currencyCode: string; items: InventoryItem[] }> => {
      const me = await requireInventoryAccess(context, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);

      let query = supabaseAdmin
        .from("inventory_items")
        .select(
          "id, name, inventory_type, base_unit_id, current_quantity, minimum_stock_level, unit_cost, active, notes, updated_at",
        )
        .eq("restaurant_id", data.restaurantId)
        .order("name", { ascending: true });

      if (data.inventoryType) query = query.eq("inventory_type", data.inventoryType);
      if (!data.includeInactive) query = query.eq("active", true);
      if (data.search?.trim()) query = query.ilike("name", `%${data.search.trim()}%`);

      const { data: rows, error } = await query;
      if (error) throw new Error("We couldn't load inventory right now.");

      const { data: units } = await supabaseAdmin.from("inventory_units").select("id, code");
      const unitCode = new Map((units ?? []).map((u) => [u.id, u.code]));

      return {
        permissions: permissionsFor(me.role),
        timezone: settings.timezone,
        currencyCode: settings.currencyCode,
        items: (rows ?? []).map((r) => {
          const quantity = Number(r.current_quantity);
          const unitCost = r.unit_cost === null ? null : Number(r.unit_cost);
          return {
            id: r.id,
            name: r.name,
            inventoryType: r.inventory_type as "ingredient" | "consumable",
            unitId: r.base_unit_id,
            unitCode: unitCode.get(r.base_unit_id) ?? "",
            quantity,
            minimumStockLevel: Number(r.minimum_stock_level),
            unitCost,
            stockValue: unitCost === null ? null : Math.round(quantity * unitCost * 100) / 100,
            active: r.active,
            notes: r.notes,
            updatedAt: r.updated_at,
          };
        }),
      };
    },
  );

export const getInventoryOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireInventoryAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("inventory_items")
      .select("current_quantity, minimum_stock_level, unit_cost, inventory_type")
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true);

    let low = 0;
    let out = 0;
    let value = 0;
    let ingredients = 0;
    let consumables = 0;
    for (const r of rows ?? []) {
      const q = Number(r.current_quantity);
      const min = Number(r.minimum_stock_level);
      if (q <= 0) out += 1;
      else if (q <= min) low += 1;
      if (r.unit_cost !== null) value += q * Number(r.unit_cost);
      if (r.inventory_type === "ingredient") ingredients += 1;
      else consumables += 1;
    }

    return {
      totalItems: (rows ?? []).length,
      ingredients,
      consumables,
      lowStock: low,
      outOfStock: out,
      estimatedValue: Math.round(value * 100) / 100,
    };
  });

async function loadMovements(
  admin: any,
  restaurantId: string,
  opts: { itemId?: string; limit: number },
): Promise<InventoryMovement[]> {
  let query = admin
    .from("inventory_stock_movements")
    .select(
      "id, inventory_item_id, movement_type, quantity, unit_id, unit_cost, reason, balance_after, created_by_staff_membership_id, created_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(opts.limit);
  if (opts.itemId) query = query.eq("inventory_item_id", opts.itemId);

  const { data: rows, error } = await query;
  if (error) throw new Error("We couldn't load movement history right now.");
  const movements = (rows ?? []) as any[];
  if (movements.length === 0) return [];

  const [{ data: units }, { data: items }] = await Promise.all([
    admin.from("inventory_units").select("id, code"),
    admin
      .from("inventory_items")
      .select("id, name")
      .in("id", [...new Set(movements.map((m) => m.inventory_item_id))]),
  ]);
  const unitCode = new Map<string, string>((units ?? []).map((u: any) => [u.id, u.code]));
  const itemName = new Map<string, string>((items ?? []).map((i: any) => [i.id, i.name]));

  const membershipIds = [...new Set(movements.map((m) => m.created_by_staff_membership_id).filter(Boolean))];
  const recorder = new Map<string, string | null>();
  if (membershipIds.length > 0) {
    const { data: members } = await admin
      .from("restaurant_users")
      .select("id, user_id")
      .in("id", membershipIds);
    const userIds = (members ?? []).map((m: any) => m.user_id);
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
      : { data: [] as any[] };
    const byUser = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
    for (const m of members ?? []) {
      const p = byUser.get(m.user_id);
      recorder.set(m.id, displayName(p) ?? p?.email ?? null);
    }
  }

  return movements.map((m) => ({
    id: m.id,
    itemId: m.inventory_item_id,
    itemName: itemName.get(m.inventory_item_id) ?? "",
    movementType: m.movement_type as MovementType,
    quantity: Number(m.quantity),
    unitCode: unitCode.get(m.unit_id) ?? "",
    unitCost: m.unit_cost === null ? null : Number(m.unit_cost),
    balanceAfter: m.balance_after === null ? null : Number(m.balance_after),
    reason: m.reason,
    recordedBy: m.created_by_staff_membership_id ? recorder.get(m.created_by_staff_membership_id) ?? null : null,
    createdAt: m.created_at,
  }));
}

export const listInventoryMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        itemId: idSchema.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<InventoryMovement[]> => {
    await requireInventoryAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.itemId) await loadInventoryItem(supabaseAdmin, data.restaurantId, data.itemId);
    return loadMovements(supabaseAdmin, data.restaurantId, {
      ...(data.itemId ? { itemId: data.itemId } : {}),
      limit: data.limit ?? 50,
    });
  });

export const createInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        name: z.string().trim().min(2, "Enter an item name.").max(120),
        inventoryType: z.enum(INVENTORY_TYPES),
        baseUnitId: idSchema,
        openingQuantity: z.number().finite().min(0).max(1_000_000_000).default(0),
        minimumStockLevel: z.number().finite().min(0).max(1_000_000_000).default(0),
        unitCost: z.number().finite().min(0).max(10_000_000).nullable().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    if (!isManager(me.role)) {
      return { ok: false as const, message: "Only owners and managers can create inventory items." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: unit } = await supabaseAdmin
      .from("inventory_units")
      .select("id")
      .eq("id", data.baseUnitId)
      .eq("is_active", true)
      .maybeSingle();
    if (!unit) return { ok: false as const, message: "Choose a valid unit of measurement." };

    const { data: item, error } = await supabaseAdmin
      .from("inventory_items")
      .insert({
        restaurant_id: data.restaurantId,
        name: data.name,
        inventory_type: data.inventoryType,
        base_unit_id: data.baseUnitId,
        current_quantity: 0,
        minimum_stock_level: data.minimumStockLevel,
        unit_cost: data.unitCost ?? null,
        notes: data.notes ?? null,
        created_by_staff_membership_id: me.id,
      })
      .select("id")
      .maybeSingle();

    if (error || !item) {
      if (error && /duplicate|unique/i.test(error.message)) {
        return { ok: false as const, message: "An item with that name already exists." };
      }
      console.error("[createInventoryItem]", error?.message);
      return { ok: false as const, message: "We couldn't create that item. Please try again." };
    }

    // Opening stock is a ledger movement, never a direct quantity write.
    if (data.openingQuantity > 0) {
      const { error: moveError } = await supabaseAdmin.rpc("apply_inventory_movement", {
        _restaurant_id: data.restaurantId,
        _item_id: item.id,
        _movement_type: "opening_balance",
        _signed_quantity: data.openingQuantity,
        _unit_cost: (data.unitCost ?? null) as unknown as number,
        _reason: "Opening balance",
        _membership_id: me.id,
        _allow_negative: false,
      });
      if (moveError) {
        console.error("[createInventoryItem/opening]", moveError.message);
        return { ok: false as const, message: "The item was created but the opening stock could not be recorded." };
      }
    }

    return { ok: true as const, itemId: item.id as string };
  });

export const updateInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        itemId: idSchema,
        name: z.string().trim().min(2).max(120).optional(),
        minimumStockLevel: z.number().finite().min(0).max(1_000_000_000).optional(),
        unitCost: z.number().finite().min(0).max(10_000_000).nullable().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    if (!isManager(me.role)) {
      return { ok: false as const, message: "Only owners and managers can edit inventory items." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadInventoryItem(supabaseAdmin, data.restaurantId, data.itemId);

    // Quantity is deliberately absent: stock only moves through the ledger.
    const patch: Record<string, any> = {};
    if (data.name !== undefined) patch['name'] = data.name;
    if (data.minimumStockLevel !== undefined) patch['minimum_stock_level'] = data.minimumStockLevel;
    if (data.unitCost !== undefined) patch['unit_cost'] = data.unitCost;
    if (data.notes !== undefined) patch['notes'] = data.notes;
    if (data.active !== undefined) patch['active'] = data.active;
    if (Object.keys(patch).length === 0) return { ok: true as const };

    const { error } = await supabaseAdmin
      .from("inventory_items")
      .update(patch)
      .eq("id", data.itemId)
      .eq("restaurant_id", data.restaurantId);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return { ok: false as const, message: "An item with that name already exists." };
      }
      console.error("[updateInventoryItem]", error.message);
      return { ok: false as const, message: "We couldn't save that item. Please try again." };
    }
    return { ok: true as const };
  });

export const createInventoryMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        itemId: idSchema,
        movementType: z.enum(MOVEMENT_TYPES),
        quantity: quantitySchema,
        stocktakeDirection: z.enum(["in", "out"]).optional(),
        unitCost: z.number().finite().min(0).max(10_000_000).nullable().optional(),
        reason: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    const type = data.movementType as MovementType;

    if (type === "opening_balance") {
      return { ok: false as const, message: "Opening balances are only recorded when an item is created." };
    }
    if (!canRecordMovement(me.role, type)) {
      return { ok: false as const, message: "You don't have permission to record this stock movement." };
    }
    if (reasonRequired(type) && !data.reason?.trim()) {
      return { ok: false as const, message: "A reason is required for this movement." };
    }
    // Only owners/managers set cost; kitchen input is ignored rather than trusted.
    const unitCost = isManager(me.role) && type === "purchase_received" ? data.unitCost ?? null : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const item = await loadInventoryItem(supabaseAdmin, data.restaurantId, data.itemId);
    if (!item.active) return { ok: false as const, message: "That item is inactive." };

    const signed = signedQuantity(type, data.quantity, data.stocktakeDirection ?? "in");

    const { data: balance, error } = await supabaseAdmin.rpc("apply_inventory_movement", {
      _restaurant_id: data.restaurantId,
      _item_id: item.id,
      _movement_type: type,
      _signed_quantity: signed,
      _unit_cost: unitCost as unknown as number,
      _reason: (data.reason?.trim() || null) as unknown as string,
      _membership_id: me.id,
      _allow_negative: allowsNegative(type, me.role),
    });

    if (error) {
      if (/INSUFFICIENT_STOCK/.test(error.message)) {
        return {
          ok: false as const,
          message: `Not enough stock. ${item.name} currently has ${Number(item.current_quantity)}.`,
        };
      }
      console.error("[createInventoryMovement]", error.message);
      return { ok: false as const, message: "We couldn't record that movement. Please try again." };
    }

    // Receiving at a new cost keeps the item's costing current.
    if (unitCost !== null) {
      await supabaseAdmin
        .from("inventory_items")
        .update({ unit_cost: unitCost })
        .eq("id", item.id)
        .eq("restaurant_id", data.restaurantId);
    }

    return { ok: true as const, balance: Number(balance) };
  });
