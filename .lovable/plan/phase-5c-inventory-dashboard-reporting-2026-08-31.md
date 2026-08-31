# Phase 5C — Inventory Dashboard + Reporting

Turn the existing Overview tab of `/restaurant/inventory` into a real operational reporting dashboard over the data already captured in Phase 5A (stock ledger) and 5B (assets). No new business rules, no changes to ordering, kitchen, workforce, or the ledger/history semantics.

## What the user gets

A date-filtered inventory dashboard (Today / 7 Days / 30 Days / Custom, using the restaurant's own calendar days) with:

- KPI row: Total Stock Value, Total Items, Low Stock, Out of Stock, Waste Value, Loss Value
- Asset KPI row: Operating Assets, Equipment, Under Maintenance, Out of Service, Disposed (disposed always counted separately)
- Stock Movement Trend chart by day, plus an Inventory Value Breakdown (ingredients vs consumables)
- Stock Attention Required list (out-of-stock first, then low stock) with click-through to existing item actions and movement history
- Waste & Loss panel: values, event counts, top waste/loss items, breakdown by item/reason/date
- Asset Status overview including expired / expiring-soon warranty counts
- Recent Activity feed merging stock movements and asset history events
- Three report tables (Stock, Waste/Loss, Asset) for owner/manager

## Key decisions

**Stock valuation.** Total Stock Value = sum of `current_quantity × unit_cost` over active ingredients + consumables that have a `unit_cost`. Assets are never counted as stock value. Items without a cost are excluded and the dashboard shows an explicit note like "3 items have no unit cost and are excluded from valuation" — never silently zero.

**Waste / loss value.** Value = |quantity| × the movement's own `unit_cost` when recorded, otherwise the item's current `unit_cost`; movements with neither are counted as events but excluded from value, and that exclusion is surfaced in the panel.

**Mixed units.** Quantities in kg, litres and pieces are never summed. The trend chart plots movement **value** by day and movement category (Stock In, Usage, Waste, Loss, Adjustments); when value is unavailable it falls back to movement **counts**. A toggle switches between Value and Count views.

**Date filtering.** All ranges are restaurant-local calendar days derived server-side from `restaurants.timezone` (same strategy as workforce), then converted to UTC instants for the `created_at` queries. Browser dates are never used as boundaries.

**Permissions (server-enforced).** Owner/manager: everything. Kitchen: stock levels, low/out-of-stock, and recent operational movements only — every money field (stock value, unit cost, waste/loss value, purchase cost, asset value) is stripped server-side, not hidden in the UI. Waiter and non-members: rejected.

## Technical section

New file `src/lib/inventory-reporting.server.ts`:
- restaurant-local range resolution (`today | 7d | 30d | custom` -> `{ fromIso, toIso, days[] }`) built on `localDateInZone` / `addDaysIso` from `src/lib/restaurant-time.ts`
- movement category mapping (`purchase_received|opening_balance` -> Stock In; `usage`; `waste`; `loss`; `adjustment_*|stocktake_adjustment` -> Adjustments)
- valuation helpers and a `redactCosts(role, payload)` used by every reporting function

New file `src/lib/inventory-reporting.functions.ts`, all `createServerFn` + `requireSupabaseAuth`, all deriving membership via `callerMembership` and filtering by `restaurant_id`:
- `getInventoryDashboard` — stock KPIs, valuation breakdown, uncosted-item count
- `getInventoryMovementAnalytics` — per-day, per-category value and count series
- `getWasteLossReport` — totals, event counts, top items, and a paginated detail list
- `getStockAttentionItems` — items at or below minimum, ordered out-of-stock first
- `getAssetAnalytics` — status/condition counts plus warranty states via the existing `warrantyState` helper
- `getRecentInventoryActivity` — merged, limited (default 25) feed from `inventory_stock_movements` + `restaurant_asset_history` with actor names resolved the same way `loadMovements` does today

All queries are date-scoped and aggregate in the handler over bounded row sets (limits on detail lists, server pagination on the waste/loss and stock report tables). No full-history loads into the browser. Existing indexes on `(restaurant_id, created_at)` cover these patterns; an index is added only if a query is observably slow.

UI: new `src/components/inventory/overview-dashboard.tsx` (plus small panel components) rendered inside the existing Overview tab of `src/routes/restaurant/inventory.tsx`. Charts reuse `recharts` via the existing `src/components/ui/chart.tsx` wrapper — no new dependency. Currency via `useMoney`, timestamps via `useRestaurantTime`. Desktop grid, mobile stacked, no horizontal overflow. Existing tabs and stock/asset workflows are untouched apart from the Overview tab body.

Verification: temporary Garden data covering ingredients, consumables, receipts, usage, waste, loss, adjustments, assets in each status and warranty state; hand-checked KPI/valuation/waste math; role checks for owner, manager, kitchen (no cost fields in the payload) and waiter (denied); cross-tenant denial; typecheck and build. Temporary rows removed afterwards.
