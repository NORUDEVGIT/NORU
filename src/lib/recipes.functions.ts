import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership, getRestaurantSettings } from "./workforce.server";
import {
  areUnitsCompatible,
  canManageRecipes,
  canViewRecipes,
  compatibleUnitCodes,
  convertToBase,
  marginEstimates,
  summariseRecipe,
  type RecipeStatus,
} from "./recipes.server";

/**
 * Recipe configuration server functions.
 *
 * Phase 5E writes nothing to inventory balances or the stock ledger. Every
 * handler re-derives the caller's membership from restaurant_users and
 * re-checks that the menu item and the ingredient belong to that same
 * restaurant; a restaurant id from the browser is never an authorization input.
 */

const idSchema = z.string().uuid();
const quantitySchema = z.number().finite().positive("Enter a quantity greater than zero.").max(1_000_000);

export interface RecipePermissions {
  role: string;
  canView: boolean;
  canManage: boolean;
}

export interface RecipeComponent {
  id: string;
  inventoryItemId: string;
  ingredientName: string;
  displayQuantity: number;
  displayUnitCode: string;
  baseUnitCode: string;
  quantityBase: number;
  unitCost: number | null;
  componentCost: number | null;
}

export interface RecipeDetail {
  permissions: RecipePermissions;
  currencyCode: string;
  menuItem: { id: string; name: string; price: number };
  components: RecipeComponent[];
  status: RecipeStatus;
  costComplete: boolean;
  recipeCost: number | null;
  missingCostIngredients: string[];
  grossContribution: number | null;
  foodCostPercent: number | null;
}

export interface RecipeIngredientOption {
  id: string;
  name: string;
  baseUnitCode: string;
  unitCost: number | null;
  units: { id: string; code: string }[];
}

async function requireView(context: any, restaurantId: string) {
  const me = await callerMembership(context, restaurantId);
  if (!canViewRecipes(me.role)) throw new Error("You don't have access to recipes for this restaurant.");
  return me;
}

async function requireManage(context: any, restaurantId: string) {
  const me = await callerMembership(context, restaurantId);
  if (!canManageRecipes(me.role)) {
    throw new Error("Only owners and managers can change recipes.");
  }
  return me;
}

/** A menu item that must belong to this exact restaurant. */
async function loadMenuItem(admin: any, restaurantId: string, menuItemId: string) {
  const { data } = await admin
    .from("menu_items")
    .select("id, name, price, restaurant_id")
    .eq("id", menuItemId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That menu item could not be found.");
  return data as { id: string; name: string; price: number };
}

/** An active ingredient that must belong to this exact restaurant. */
async function loadIngredient(admin: any, restaurantId: string, inventoryItemId: string) {
  const { data } = await admin
    .from("inventory_items")
    .select("id, name, base_unit_id, unit_cost, active, inventory_type")
    .eq("id", inventoryItemId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That ingredient could not be found.");
  if (data.inventory_type !== "ingredient") throw new Error("Only ingredients can be used in recipes.");
  if (!data.active) throw new Error("That ingredient is inactive.");
  return data as {
    id: string;
    name: string;
    base_unit_id: string;
    unit_cost: number | null;
  };
}

async function unitMaps(admin: any) {
  const { data } = await admin.from("inventory_units").select("id, code");
  const byId = new Map<string, string>();
  const byCode = new Map<string, string>();
  for (const u of (data ?? []) as { id: string; code: string }[]) {
    byId.set(u.id, u.code);
    byCode.set(u.code, u.id);
  }
  return { byId, byCode };
}

async function buildRecipeDetail(
  admin: any,
  restaurantId: string,
  menuItemId: string,
  role: string,
): Promise<RecipeDetail> {
  const [menuItem, settings, units] = await Promise.all([
    loadMenuItem(admin, restaurantId, menuItemId),
    getRestaurantSettings(admin, restaurantId),
    unitMaps(admin),
  ]);

  const { data: rows } = await admin
    .from("menu_item_recipe_components")
    .select(
      "id, inventory_item_id, quantity_base, display_quantity, display_unit_id, inventory_items(name, base_unit_id, unit_cost)",
    )
    .eq("restaurant_id", restaurantId)
    .eq("menu_item_id", menuItemId);

  const components: RecipeComponent[] = ((rows ?? []) as any[])
    .map((row) => {
      const ingredient = row.inventory_items ?? {};
      const unitCost = ingredient.unit_cost === null || ingredient.unit_cost === undefined ? null : Number(ingredient.unit_cost);
      const quantityBase = Number(row.quantity_base);
      return {
        id: row.id as string,
        inventoryItemId: row.inventory_item_id as string,
        ingredientName: (ingredient.name as string) ?? "Unknown ingredient",
        displayQuantity: Number(row.display_quantity),
        displayUnitCode: units.byId.get(row.display_unit_id) ?? "",
        baseUnitCode: units.byId.get(ingredient.base_unit_id) ?? "",
        quantityBase,
        unitCost,
        componentCost: unitCost === null ? null : Math.round(quantityBase * unitCost * 100) / 100,
      };
    })
    .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));

  const summary = summariseRecipe(components.map((c) => ({ quantityBase: c.quantityBase, unitCost: c.unitCost })));
  const margins = marginEstimates(summary.recipeCost, Number(menuItem.price));

  return {
    permissions: { role, canView: canViewRecipes(role), canManage: canManageRecipes(role) },
    currencyCode: settings.currencyCode,
    menuItem: { id: menuItem.id, name: menuItem.name, price: Number(menuItem.price) },
    components,
    status: summary.status,
    costComplete: summary.costComplete,
    recipeCost: summary.recipeCost,
    missingCostIngredients: components.filter((c) => c.unitCost === null).map((c) => c.ingredientName),
    grossContribution: margins.grossContribution,
    foodCostPercent: margins.foodCostPercent,
  };
}

export const getMenuItemRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, menuItemId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RecipeDetail> => {
    const me = await requireView(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildRecipeDetail(supabaseAdmin, data.restaurantId, data.menuItemId, me.role);
  });

/** Cost-only view of one recipe (same maths, lighter payload). */
export const getRecipeCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, menuItemId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireView(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const detail = await buildRecipeDetail(supabaseAdmin, data.restaurantId, data.menuItemId, me.role);
    return {
      status: detail.status,
      costComplete: detail.costComplete,
      recipeCost: detail.recipeCost,
      currencyCode: detail.currencyCode,
      missingCostIngredients: detail.missingCostIngredients,
      grossContribution: detail.grossContribution,
      foodCostPercent: detail.foodCostPercent,
    };
  });

/** Active ingredients of this restaurant plus the units each may be measured in. */
export const listRecipeIngredientOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<RecipeIngredientOption[]> => {
    await requireView(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: items }, units] = await Promise.all([
      supabaseAdmin
        .from("inventory_items")
        .select("id, name, base_unit_id, unit_cost")
        .eq("restaurant_id", data.restaurantId)
        .eq("inventory_type", "ingredient")
        .eq("active", true)
        .order("name", { ascending: true }),
      unitMaps(supabaseAdmin),
    ]);

    return ((items ?? []) as any[]).map((item) => {
      const baseCode = units.byId.get(item.base_unit_id) ?? "";
      return {
        id: item.id as string,
        name: item.name as string,
        baseUnitCode: baseCode,
        unitCost: item.unit_cost === null ? null : Number(item.unit_cost),
        units: compatibleUnitCodes(baseCode)
          .map((code) => ({ code, id: units.byCode.get(code) ?? "" }))
          .filter((u) => u.id),
      };
    });
  });

const componentInput = z.object({
  restaurantId: idSchema,
  menuItemId: idSchema,
  inventoryItemId: idSchema,
  quantity: quantitySchema,
  unitId: idSchema,
});

export const saveRecipeComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => componentInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const me = await requireManage(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await loadMenuItem(supabaseAdmin, data.restaurantId, data.menuItemId);
      const ingredient = await loadIngredient(supabaseAdmin, data.restaurantId, data.inventoryItemId);
      const units = await unitMaps(supabaseAdmin);
      const fromCode = units.byId.get(data.unitId);
      const baseCode = units.byId.get(ingredient.base_unit_id) ?? "";
      if (!fromCode) return { ok: false, message: "That unit is not recognised." };
      if (!areUnitsCompatible(fromCode, baseCode)) {
        return { ok: false, message: `${fromCode} is not compatible with ${baseCode}.` };
      }

      const { data: existing } = await supabaseAdmin
        .from("menu_item_recipe_components")
        .select("id")
        .eq("menu_item_id", data.menuItemId)
        .eq("inventory_item_id", data.inventoryItemId)
        .maybeSingle();
      if (existing) {
        return { ok: false, message: `${ingredient.name} is already in this recipe.` };
      }

      const { error } = await supabaseAdmin.from("menu_item_recipe_components").insert({
        restaurant_id: data.restaurantId,
        menu_item_id: data.menuItemId,
        inventory_item_id: data.inventoryItemId,
        quantity_base: convertToBase(data.quantity, fromCode, baseCode),
        display_quantity: data.quantity,
        display_unit_id: data.unitId,
        created_by_staff_membership_id: me.id,
      });
      if (error) return { ok: false, message: "Could not add that ingredient." };
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Something went wrong." };
    }
  });

export const updateRecipeComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        componentId: idSchema,
        quantity: quantitySchema,
        unitId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    await requireManage(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const { data: row } = await supabaseAdmin
        .from("menu_item_recipe_components")
        .select("id, inventory_item_id")
        .eq("id", data.componentId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!row) return { ok: false, message: "That recipe ingredient could not be found." };

      const ingredient = await loadIngredient(supabaseAdmin, data.restaurantId, row.inventory_item_id);
      const units = await unitMaps(supabaseAdmin);
      const fromCode = units.byId.get(data.unitId);
      const baseCode = units.byId.get(ingredient.base_unit_id) ?? "";
      if (!fromCode) return { ok: false, message: "That unit is not recognised." };
      if (!areUnitsCompatible(fromCode, baseCode)) {
        return { ok: false, message: `${fromCode} is not compatible with ${baseCode}.` };
      }

      const { error } = await supabaseAdmin
        .from("menu_item_recipe_components")
        .update({
          quantity_base: convertToBase(data.quantity, fromCode, baseCode),
          display_quantity: data.quantity,
          display_unit_id: data.unitId,
        })
        .eq("id", data.componentId)
        .eq("restaurant_id", data.restaurantId);
      if (error) return { ok: false, message: "Could not update that ingredient." };
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Something went wrong." };
    }
  });

export const removeRecipeComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, componentId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    await requireManage(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("menu_item_recipe_components")
      .delete()
      .eq("id", data.componentId)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false, message: "Could not remove that ingredient." };
    return { ok: true };
  });

export interface MenuRecipeSummary {
  menuItemId: string;
  status: RecipeStatus;
  recipeCost: number | null;
  foodCostPercent: number | null;
}

/** Per-menu-item recipe indicators for the menu management list. */
export const getMenuRecipeSummaries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ permissions: RecipePermissions; currencyCode: string; summaries: MenuRecipeSummary[] }> => {
      const me = await requireView(context, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: items }, { data: rows }, settings] = await Promise.all([
        supabaseAdmin
          .from("menu_items")
          .select("id, price")
          .eq("restaurant_id", data.restaurantId),
        supabaseAdmin
          .from("menu_item_recipe_components")
          .select("menu_item_id, quantity_base, inventory_items(unit_cost)")
          .eq("restaurant_id", data.restaurantId),
        getRestaurantSettings(supabaseAdmin, data.restaurantId),
      ]);

      const byItem = new Map<string, { quantityBase: number; unitCost: number | null }[]>();
      for (const row of (rows ?? []) as any[]) {
        const cost = row.inventory_items?.unit_cost;
        const list = byItem.get(row.menu_item_id) ?? [];
        list.push({
          quantityBase: Number(row.quantity_base),
          unitCost: cost === null || cost === undefined ? null : Number(cost),
        });
        byItem.set(row.menu_item_id, list);
      }

      const summaries = ((items ?? []) as any[]).map((item) => {
        const summary = summariseRecipe(byItem.get(item.id) ?? []);
        const margins = marginEstimates(summary.recipeCost, Number(item.price));
        return {
          menuItemId: item.id as string,
          status: summary.status,
          recipeCost: summary.recipeCost,
          foodCostPercent: margins.foodCostPercent,
        };
      });

      return {
        permissions: { role: me.role, canView: canViewRecipes(me.role), canManage: canManageRecipes(me.role) },
        currencyCode: settings.currencyCode,
        summaries,
      };
    },
  );

/** Read-only "used in recipes" visibility for an ingredient. */
export const getIngredientUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, inventoryItemId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ menuItems: { id: string; name: string }[] }> => {
    await requireView(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("menu_item_recipe_components")
      .select("menu_item_id, menu_items(id, name)")
      .eq("restaurant_id", data.restaurantId)
      .eq("inventory_item_id", data.inventoryItemId);
    const menuItems = ((rows ?? []) as any[])
      .map((row) => ({ id: row.menu_items?.id as string, name: (row.menu_items?.name as string) ?? "" }))
      .filter((m) => m.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { menuItems };
  });
