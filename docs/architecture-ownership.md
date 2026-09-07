# Architecture ownership — shared & transitional services (Phase 8E3)

Labels: `CORE` (non-sellable, always available) · `RM` (Restaurant Management) ·
`PMS` · `BO` (future Back Office) · `SHARED_TEMPORARY` (used by more than one
package today, split deferred) · `LEGACY`.

Rule applied in this phase: **a future Back Office capability is not enforced as
Back Office today**. Package checks were added only where current usage is
unambiguous. Everything else is recorded as `SHARED_TEMPORARY`.

## Ownership matrix

| Feature / route / function | Current owner | Target owner | Current guard | Future guard | Status | Risk | Notes |
|---|---|---|---|---|---|---|---|
| `createInventoryItem`, `updateInventoryItem`, `createInventoryMovement` (`inventory.functions.ts`) | RM | BO (central warehouse) | module `inventory` + role + **restaurant_management** (new) | back_office + restaurant_management | Guarded | Low | Only restaurant flows write stock today (recipe costing, waste, counts, adjustments). |
| `listInventoryItems`, `listInventoryUnits`, `getInventoryOverview`, `listInventoryMovements` | SHARED_TEMPORARY | BO | module `inventory` + role | back_office | Unguarded | Low | Hotel modules cross-link to stock reads (`sharedDependencies: ["inventory"]`); gating reads would break PMS-only browsing. |
| Inventory reporting (`inventory-reporting.functions.ts`: dashboard, movement analytics, waste/loss, attention items, recent activity) | SHARED_TEMPORARY | BO | membership + `canViewInventory` | back_office | Unguarded | Low | Read-only; reachable from hotel cross-links. |
| Assets / equipment (`assets.functions.ts`) | SHARED_TEMPORARY | BO | membership + role | back_office | Unguarded | Medium | Equipment registers are used across departments (kitchen, housekeeping, maintenance). Splitting now would break hotel maintenance. |
| Suppliers (`suppliers.functions.ts`) | SHARED_TEMPORARY | BO | module `procurement` + role | back_office (+ RM/PMS consumers) | Unguarded | Medium | Hotel modules declare `procurement` as a shared dependency; a hard RM check would break PMS-only purchasing. |
| Purchase orders, receiving, PO status, purchasing summary (`purchasing.functions.ts`) | SHARED_TEMPORARY | BO | module `procurement` + role | back_office | Unguarded | Medium | Same reason as suppliers. RM-only properties must keep purchasing without Back Office. |
| Recipes & menu costing (`recipes.functions.ts`) | RM | RM | role + restaurant_management (8E1) | unchanged | Guarded | Low | — |
| Restaurant orders, menu, tables/QR, kitchen, POS | RM | RM / POS | restaurant_management (8E1) | + standalone POS later | Guarded | Low | — |
| Restaurant analytics & dashboard KPIs (`analytics.functions.ts`, `dashboard.functions.ts`) | RM | RM | role + restaurant_management (8E1) | unchanged | Guarded | Low | — |
| PMS reporting (occupancy, ADR, RevPAR, arrivals, cashiering, night audit, housekeeping) | PMS | PMS | role + pms (8E2) | unchanged | Guarded | Low | — |
| `/restaurant/reports` (mixed workspace) | SHARED_TEMPORARY | BO (consolidated) | route auth only | back_office for consolidated views | Unguarded route | Low | Data behind each section is guarded by its own package; no true property-wide ledger exists yet. |
| Identity: `auth.users` → `profiles` → `restaurant_users` → module access | CORE | CORE | auth + membership | none | Core | — | Never package-gated. One identity chain, no per-package staff master. |
| `listStaff`, `createStaff`, `changeStaffRole`, `setStaffActive` (`staff.functions.ts`) | CORE | CORE + BO HR | module `human_resources` + role | BO for enterprise HR only | Unguarded | Low | Generic membership administration must stay available to every package. |
| Module access overrides (`module-access.functions.ts`) | CORE | CORE | module `human_resources` + role | none | Unguarded | Low | Access control itself is Core. |
| Shifts, table assignments, check-in/out, attendance summary (`workforce.functions.ts`) | SHARED_TEMPORARY | RM + PMS (per-role) + BO HR | membership + role | split per package later | Unguarded | Medium | Table assignments are RM-flavoured but the shift/attendance model is shared by hotel roles. |
| `/restaurant/staff` | SHARED_TEMPORARY | CORE + BO HR | route auth | — | Unguarded | Low | Shared workforce screen; kept as one implementation. |
| `/restaurant/pms/administration` | PMS (wrapper) | PMS | route auth + `requireRoutePackage("pms")` | unchanged | Guarded route | Low | Reuses the shared staff implementation — deliberately no second staff database. |
| PMS Cashiering, folios, payments, night audit | PMS | PMS | role + pms (8E2) | unchanged | Guarded | Low | Stays PMS, not Back Office. |
| Restaurant payment / reconciliation surfaces | RM | RM | restaurant_management (8E1) | unchanged | Guarded | Low | Stays RM, not Back Office. |
| Accounting & Finance screens (no ledger behind them) | SHARED_TEMPORARY | BO | route auth | back_office | FOUNDATION | Low | Presentational foundation only; no accounting engine exists. |
| `/restaurant/settings` → `updateMyRestaurant` (name, contact, address, timezone, currency, logo) | CORE | CORE | membership + owner/manager | none | Unguarded | — | Tenant identity, never package-gated. |
| `/restaurant/configuration` — menu, tables/QR | RM | RM | underlying actions require restaurant_management | unchanged | Guarded (data layer) | Low | Route itself left open; the actions enforce. |
| `/restaurant/configuration` — room types, rooms, rate plans, calendar, restrictions, distribution | PMS | PMS | underlying actions require pms | unchanged | Guarded (data layer) | Low | Same pattern. |
| Integrations settings | SHARED_TEMPORARY | per-package | route auth | per-package | Unguarded | Low | Mixed content; split with Back Office. |

## Route enforcement decisions

| Route | Decision | Reason |
|---|---|---|
| `/restaurant/inventory/*` | Leave unguarded (C — package context only) | Hotel modules link into stock reads; writes are guarded server-side. |
| `/restaurant/inventory/purchasing/*` | Leave unguarded | Purchasing must work for an RM-only property and is cross-linked by hotel modules. |
| `/restaurant/staff` | Leave unguarded | Core membership administration. |
| `/restaurant/settings` | Leave unguarded | Core tenant identity. |
| `/restaurant/configuration` | Leave unguarded | Mixed; enforcement lives in each action. |
| `/restaurant/reports` | Leave unguarded | Mixed; each report read carries its own package check. |
| `/restaurant/pms/*` | Already guarded (8D1) | Unchanged. |

## Direct browser database writes

A search of shared/transitional UI (inventory, procurement, staff, settings,
reports) found **no** direct `insert` / `update` / `upsert` / `delete` calls from
components or routes. All mutations already go through trusted server actions,
so no rerouting was needed and no package check is bypassed from the browser.

## Needs later database-rule (RLS) hardening

`inventory_items`, `inventory_movements`, `restaurant_assets`, `suppliers`,
`purchase_orders`, `purchase_order_items`, `staff_shifts`,
`shift_table_assignments`, `staff_attendance` — currently protected by
membership-scoped rules only, with no package predicate. Package enforcement for
these lives in the server layer today.

## Deferred to later split phases

Back Office construction (enterprise HR, payroll, accounting ledger,
consolidated reports, central warehouse, cost control), standalone POS split, HR
database split, inventory database split, procurement centralisation, folder
reorganisation, broad RLS package predicates, legacy route removal.
