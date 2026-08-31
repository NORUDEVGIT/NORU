# Phase 5A — Inventory Core

Add a tenant-scoped inventory module (ingredients + consumables) with a single
server-side stock movement pipeline, movement history, low-stock states and
role-based permissions. No suppliers, recipes, auto-deduction or forecasting.

## Database (one migration)

`inventory_units` (platform-level reference, no restaurant_id)
- id, code (unique), name, unit_type (`weight` | `volume` | `count`), is_active, created_at
- Seeded in the same migration: kg, g, mg, L, ml, piece, pack, box, bottle, can, bag, tray, roll, case
- Grants: SELECT to authenticated; ALL to service_role. RLS on, read-only policy for authenticated.

`inventory_items`
- id, restaurant_id, name, inventory_type (`ingredient` | `consumable`), base_unit_id,
  current_quantity numeric(14,3) default 0, minimum_stock_level numeric(14,3) default 0,
  unit_cost numeric(12,2) null, active bool default true, notes text null,
  created_by_staff_membership_id → restaurant_users(id) on delete set null,
  created_at, updated_at (reuse `set_updated_at` trigger)
- Unique index on (restaurant_id, lower(btrim(name)), inventory_type)
- RLS: SELECT for `is_restaurant_member(restaurant_id)`. No client INSERT/UPDATE/DELETE —
  all writes go through server functions using the service-role client after
  server-side membership + role checks.

`inventory_stock_movements`
- id, restaurant_id, inventory_item_id, movement_type (checked enum of the 8 types),
  quantity numeric(14,3) (signed), unit_id, unit_cost null, reason text null,
  created_by_staff_membership_id, created_at
- Indexes on (restaurant_id, created_at desc) and (inventory_item_id, created_at desc)
- RLS: SELECT for restaurant members only; no client writes (immutable history).

Grants for both tables: `SELECT ... TO authenticated`, `ALL ... TO service_role`. No anon access.

`apply_inventory_movement(...)` SQL function (SECURITY DEFINER, server-only via
service role) does the atomic part: locks the item row, validates it belongs to the
restaurant, computes the new balance, rejects negatives unless the caller passed the
allow-negative flag (owner/manager adjustments only), inserts the movement and updates
`current_quantity` in one statement block, returning the new balance. This guarantees
movement insert and balance update cannot partially succeed.

## Server layer

`src/lib/inventory.server.ts` — helpers mirroring `workforce.server.ts`:
`callerMembership` reuse, role sets (`MANAGE_ROLES` = owner/manager,
`RECORD_ROLES` = owner/manager/kitchen), movement-type → sign map, permission matrix,
`loadInventoryItem(admin, restaurantId, itemId)`.

`src/lib/inventory.functions.ts` — server functions with `requireSupabaseAuth`:
- `listInventoryUnits`
- `listInventoryItems({ restaurantId, inventoryType, search, includeInactive })`
- `getInventoryOverview({ restaurantId })` — totals, low stock, out of stock, recent movements
- `createInventoryItem(...)` — owner/manager; creates the row, then an `opening_balance`
  movement through the shared pipeline when opening quantity > 0
- `updateInventoryItem(...)` — owner/manager; name, minimum level, unit cost, notes, active.
  Never accepts `current_quantity`.
- `createInventoryMovement({ restaurantId, itemId, movementType, quantity, unitCost?, reason? })`
  — the single balance mutator: authenticates, resolves membership, checks role against the
  movement type, verifies the item is in the same restaurant, validates quantity > 0,
  derives the sign server-side, requires reason for waste/loss/adjustments, uses the item's
  base unit, then calls `apply_inventory_movement`.
- `listInventoryMovements({ restaurantId, itemId?, limit })` — newest first, with
  recorder name snapshot resolved via membership + profile.

`restaurant_id` and `created_by_staff_membership_id` are always re-derived from the
authenticated membership; browser values are only used to look up (and are re-validated
against) that membership.

## Permissions (enforced server-side)

| Action | Owner | Manager | Kitchen | Waiter |
| --- | --- | --- | --- | --- |
| View items/history | yes | yes | yes | no |
| Receive stock | yes | yes | no | no |
| Usage / waste / loss | yes | yes | yes | no |
| Adjustments (in/out/stocktake) | yes | yes | no | no |
| Create/edit/deactivate items, unit cost | yes | yes | no | no |

Negative resulting balance is blocked for every movement type except owner/manager
adjustments, which may set a corrected count explicitly.

## UI

- `/restaurant/inventory` route inside `RestaurantShell` (`active="Inventory"`), plus a new
  Inventory nav entry (Boxes icon) in `src/components/restaurant-shell.tsx`, visible to
  owner/manager/kitchen.
- Tabs: Overview, Ingredients, Consumables.
  - Overview: four compact KPI cards (total items, low stock, out of stock) plus a recent
    movements list. No charts.
  - Item tabs: desktop table / mobile cards with name, quantity + unit, minimum level,
    status badge (In Stock / Low Stock / Out of Stock), unit cost, estimated value
    (`quantity × unit_cost`, `—` when null), last updated, and an action menu.
- Components under `src/components/inventory/`: `inventory-overview.tsx`,
  `inventory-item-table.tsx`, `item-form-dialog.tsx`, `movement-dialog.tsx`
  (one dialog driven by the movement type — quantity, optional cost for receive,
  reason required for waste/loss/adjustment), `movement-history-dialog.tsx`.
- Money via `useMoney()`, timestamps via `useRestaurantTime()` so the restaurant's
  currency and timezone are respected. Existing shadcn components and NORU tokens only.

## Verification

Against The Garden: create Chicken (kg, opening 20, min 5) and Napkins (piece, 500, min 100);
run +10 received, −3 usage, −2 waste, −1 loss and confirm 24 kg with five history rows;
check low-stock and out-of-stock states, negative-stock rejection, kitchen usage allowed but
adjustment rejected, waiter fully rejected, and a cross-tenant item id rejected. Temporary
test rows are removed afterwards. Typecheck and build must pass.

## Out of scope / known limits after 5A

Single base unit per item (no conversions), no supplier or purchase-order data, no automatic
deduction from menu orders, no inventory analytics or notifications.
