# Phase 8G2C — Back Office Inventory / Warehouse ownership

Make Back Office the canonical home for central inventory / warehouse control, without breaking Restaurant Management's independent stock operations and without duplicating items, units or the stock ledger.

No database changes.

## Current capability audit (verified in code)

| Capability | Where it lives today | Classification |
| --- | --- | --- |
| Item list (ingredients / consumables) | `listInventoryItems`, inventory workspace tabs | Shared transitional |
| Item create / edit | `createInventoryItem`, `updateInventoryItem`, dialog | Shared transitional |
| Units | `listInventoryUnits` (global reference list, read-only UI) | Shared |
| Current stock + low/out status | item rows, `getInventoryOverview` | Shared |
| Manual movement (usage, waste, loss, adjustment, stocktake) | `createInventoryMovement` → `apply_inventory_movement` | Shared, RM-gated write today |
| Movement history | `listInventoryMovements` (per item or property-wide) | Shared |
| Overview dashboard, waste/loss, attention, activity, trend | `inventory-reporting.functions.ts` | Central / Back Office |
| Operating assets + equipment | `assets-tab.tsx` | Restaurant operational (stays) |
| Recipe ingredient link, recipe costing | `recipes.functions.ts`, menu mapping | Restaurant Management (stays) |
| Suppliers, purchase orders, receiving | Back Office Procurement (8G2B) | Procurement |
| Valuation | only quantity × unit_cost ("stock value") — no costing method, no period valuation | Foundation / planned |
| Warehouses / locations / transfers | not in the data model | Future scope, not invented |

## Ownership boundary

- **Restaurant Management** keeps `/restaurant/restaurant-management/inventory` exactly as it is: operational stock visibility, item workflow, adjustments, assets, and recipe/cost integration. Heading stays "Inventory & Stock Management". No Back Office requirement anywhere on this path.
- **Back Office** becomes the canonical home for central inventory governance: master overview, item master, property-wide movement history, units reference, receiving visibility and valuation status.
- **Procurement** (Back Office) keeps suppliers / POs / receiving; Inventory links to it and shows the resulting movements, never duplicates the workflow.
- One ledger: every Back Office screen calls the same `createInventoryMovement` / `apply_inventory_movement` path. No new posting function.

## Routes to add

- `/restaurant/back-office/inventory` — upgraded from foundation to the Inventory / Warehouse home (overview KPIs, stock attention, recent activity, links to items / movements / units / Procurement, and honest "planned" cards for valuation and multi-warehouse).
- `/restaurant/back-office/inventory/items` — item master list, reusing the existing item table and item/movement dialogs.
- `/restaurant/back-office/inventory/movements` — property-wide movement history (`listInventoryMovements` without `itemId`), with item filter.
- `/restaurant/back-office/inventory/units` — read-only units reference.

No `items/:itemId` route: item detail is a dialog today, so the dialog is reused rather than an artificial page being created.

Each route: auth check + `requireRoutePackage("back_office")` in `beforeLoad`, plus the existing `inventory` module/role check inside the screen. Back Office entitlement alone grants nothing.

`/restaurant/inventory` and `/restaurant/restaurant-management/inventory` are left untouched — no redirects this phase. The transitional route keeps its shared/compatibility role; a future split strategy is documented instead.

## Server write authorization

Today `requireInventoryWrite` demands `restaurant_management`, which would block writes made from Back Office screens on a property that does not buy RM. Change to a narrow, server-validated rule in `inventory.functions.ts`:

- role/module check first, unchanged;
- then the property must have **either** `restaurant_management` **or** `back_office` entitled;
- the entitlement is read server-side from the existing resolver — no browser-supplied package string is trusted.

Nothing is weakened: a property with neither package still cannot write, and role/module access is unchanged. Reads stay as they are.

## Registry and documentation

- `src/lib/back-office-modules.ts`: Inventory entry moves to `partial`, canonical route `/restaurant/back-office/inventory`, honest note on what is re-homed (governance, master overview, movements, units) versus what stays in Restaurant Management (operational stock, assets, recipe cost), plus authoritative tables and remaining migration work.
- `docs/architecture-ownership.md`: RM / Back Office / Procurement inventory boundary, shared authoritative storage (`inventory_units`, `inventory_items`, `inventory_stock_movements`), package-independence rule, the write-authorization rule, the transitional `/restaurant/inventory` decision, and future warehouse/location requirements.

## Technical notes

- New `src/components/workspaces/back-office/inventory-home.tsx`, `inventory-items-page.tsx`, `inventory-movements-page.tsx`, `inventory-units-page.tsx`; the item table and dialogs are extracted for reuse from `inventory-workspace.tsx` rather than copied, leaving the RM screen behaviour identical.
- `restaurant-shell.tsx` gains Back Office Inventory sub-navigation and detail breadcrumb labels, matching the 8G2B Procurement pattern.
- Cross-links: Back Office Inventory → Back Office Procurement; RM Inventory keeps its existing "Open in Back Office" notes, shown only where entitlement and access permit.

## Testing

Typecheck, production build, then an authenticated smoke test on The Garden: Back Office inventory home → items → create/edit/adjust → movements list → units → Procurement link; RM inventory + recipe cost unchanged. Package matrix: RM on/BO off (RM stock still works), RM off/BO on (Back Office works, RM blocked), both off, and a user without inventory access under each package (no escalation). One procurement receipt verified to post exactly one movement. All temporary records removed and stock restored.

Deferred to 8G2D: real valuation method, warehouses/locations and transfers, automatic recipe consumption, any `/restaurant/inventory` redirect or ledger split.
