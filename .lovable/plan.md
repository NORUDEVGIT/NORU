# Phase 5E — Recipes + Menu Ingredient Mapping

Let owners and managers define which inventory ingredients each menu item uses, see the estimated recipe cost against the selling price, and spot recipes that are incomplete. Configuration only — no stock is deducted anywhere in this phase.

## What gets built

### 1. Recipe storage
A new table `menu_item_recipe_components` linking a menu item to an inventory ingredient with a quantity. Each row keeps both what the user typed (e.g. "180 g") and the normalised amount in the ingredient's base unit (0.180 kg), so later phases can consume it directly.

Rules enforced in the database and on the server:
- menu item and ingredient must belong to the same restaurant
- ingredient must be active and of type `ingredient` (not consumables/assets)
- each ingredient appears at most once per menu item
- quantity greater than zero

### 2. Unit conversion (small, controlled)
A shared helper converting only within a family:
- weight: kg / g / mg
- volume: L / ml
- count units (piece, pack, box, bottle, can, bag, tray, roll, case): no conversion at all — the recipe must use the ingredient's own base unit

Anything else (kg to L, box to kg, box to piece) is rejected with a clear message. The unit dropdown only offers compatible units.

### 3. Recipe cost
Component cost = normalised quantity x ingredient unit cost. Recipe cost = sum of components, shown in the restaurant's currency.

If any ingredient has no unit cost, the recipe shows "Cost incomplete" and names the ingredients missing a cost.

### 4. Selling price comparison
When the recipe cost is complete and the selling price is above zero, show Selling Price, Recipe Cost, Estimated Gross Contribution (price minus cost) and Food Cost % (cost / price x 100), clearly labelled as operational estimates — no labour, tax, rent, utilities, overhead or fees.

### 5. Recipe status
Derived per menu item:
- No Recipe — no components
- Incomplete — components exist but costing data is missing
- Ready — components valid and fully costed

Menu availability is never changed automatically.

### 6. Menu UI
On `/restaurant/menu`, each item row gains a status chip (Ready / Incomplete / No Recipe) and a "Recipe" action. The dialog shows the header summary (item, selling price, recipe cost, food cost %, status), a component list (ingredient, quantity, unit, current unit cost, component cost) with Add / Edit quantity / Remove, and a readable dotted-leader recipe preview. Owner/manager can edit; kitchen sees the same dialog read-only. Waiters get no recipe access.

The public customer menu is untouched.

### 7. Inventory visibility
On the Ingredients tab, an ingredient can show "Used in" the menu items that reference it — read-only, no quantity effects.

## Technical notes

- Migration `0009_create_recipe_components.sql`: table + unique index on (menu_item_id, inventory_item_id), FKs to `restaurants`, `menu_items`, `inventory_items`, `inventory_units`, `restaurant_users`; GRANTs for `authenticated` (SELECT) and `service_role`; RLS enabled with member-scoped SELECT via `is_restaurant_member`; writes go through server functions on the admin client, as the rest of the inventory module does. `updated_at` trigger reuses `set_updated_at`.
- `src/lib/recipes.server.ts`: unit-family conversion table, `convertToBase`, role helpers (`canManageRecipes` = owner/manager, `canViewRecipes` = owner/manager/kitchen), component loading and cost/status derivation.
- `src/lib/recipes.functions.ts`: `getMenuItemRecipe`, `saveRecipeComponent`, `updateRecipeComponent`, `removeRecipeComponent`, `getRecipeCost`, `getMenuRecipeSummaries`, `getIngredientUsage`. All use `requireSupabaseAuth`, resolve the caller's active membership server-side, and re-verify that both the menu item and the ingredient belong to that restaurant. `restaurant_id` from the browser is never trusted for authorization.
- `src/components/menu/recipe-dialog.tsx` plus small edits to `src/routes/restaurant/menu.tsx` and the ingredients tab.
- No changes to order creation, kitchen workflow, stock movements, procurement, workforce or assets. No recipe logic enters order handlers, but the normalised quantities are the exact shape Phase 5F will read.

## Verification

Against The Garden: create a chicken dish recipe (Chicken 180 g, Oil 20 ml, Rice 250 g); confirm g normalises to kg and ml to L, incompatible units and duplicate ingredients are rejected, cost maths and food cost % are correct, missing unit cost shows "Cost incomplete", kitchen is read-only and waiter blocked, cross-tenant access fails, and that inventory quantities and the stock ledger are unchanged (row counts before/after). Build and typecheck must pass. Test recipe data is cleaned up afterwards.
