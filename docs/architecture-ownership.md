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

## Phase 8F3 — Restaurant Management detail-flow ownership

Route context helper: `src/lib/rm-routes.ts` (`useRmRoutes()`) resolves links by
the current address family, so a shared screen rendered under
`/restaurant/restaurant-management/*` links to canonical children while the same
screen at a legacy address keeps legacy targets.

Canonical detail route created:
- `/restaurant/restaurant-management/orders/$orderId` — same guard, same screen
  (`src/components/workspaces/restaurant/order-detail-workspace.tsx`) and same
  server logic as the legacy address.

Kept legacy / not owned yet:
- `/restaurant/orders/$orderId` — retained for bookmarks. Redirect candidate
  for 8F5 once no shared caller depends on it.
- `/restaurant/inventory/purchasing/$purchaseOrderId` and supplier detail —
  Procurement, SHARED_TEMPORARY.
- Staff detail/edit — SHARED_TEMPORARY (one workforce shared with PMS/Back
  Office); no duplicate people model.
- Settings / configuration detail screens — shared property configuration.

No route-based detail surface exists for menu items, recipe & cost, tables/QR,
POS transactions or restaurant payments; those are modal/drawer flows inside
their workspaces, so no routes were invented for them.

## Phase 8F5 — Restaurant Management legacy route redirects

The canonical `/restaurant/restaurant-management/*` family is now the
authoritative address space. Clearly RM-owned legacy addresses are redirect-only
(sign-in check first, then `redirect(..., { replace: true })`); the destination
route remains the sole owner of the package guard, role rules and screen.

| Deprecated address | Canonical replacement |
|---|---|
| `/restaurant/dashboard` | `/restaurant/restaurant-management/dashboard` |
| `/restaurant/orders` | `/restaurant/restaurant-management/orders` (search preserved) |
| `/restaurant/orders/$orderId` | `/restaurant/restaurant-management/orders/$orderId` |
| `/restaurant/kitchen` | `/restaurant/restaurant-management/kitchen` |
| `/restaurant/menu` | `/restaurant/restaurant-management/menu` |
| `/restaurant/tables` | `/restaurant/restaurant-management/tables` |
| `/restaurant/waiter` | `/restaurant/restaurant-management/digital-ordering` |
| `/restaurant/pos/new` | `/restaurant/restaurant-management/pos-sales` |
| `/kitchen`, `/kitchen/login` | `/restaurant/restaurant-management/kitchen` (single hop) |

`src/lib/rm-routes.ts` now always returns canonical paths; the legacy branch was
removed. Internal RM links (shell nav, homepage, reports and configuration
workspaces) point at canonical addresses, so no new deprecated URL is generated.

### Retained active (not redirected)

| Address | Reason |
|---|---|
| `/restaurant/inventory`, `/restaurant/inventory/purchasing/*` | Hotel modules and procurement cross-link into stock; ownership resolves with Back Office. |
| `/restaurant/staff` | One shared workforce, reused by PMS Administration and future Back Office HR. |
| `/restaurant/reports` | Mixed workspace: restaurant plus property-wide sections. |
| `/restaurant/configuration`, `/restaurant/settings` | Core tenant identity plus PMS content. |
| Public `/r/*`, `/scan` | Already canonical Restaurant Management public addresses. |
| `/restaurant/pms/*` | PMS-owned, unchanged. |

Deferred: shared-route ownership migration, Back Office, standalone POS / HR /
Inventory splits, folder and broad dead-code cleanup.

## Phase 8G1 — Back Office package foundation

Back Office is the enterprise consolidation and control layer. Nothing has been
migrated into it: every canonical route below is a foundation page. No database
change, no RLS change, no entitlement-logic change, no server business logic
change was made in this phase.

Registry: `src/lib/back-office-modules.ts` (`BO_GROUPS`, `BO_MODULES`).
Launcher: `/restaurant/back-office`. All Back Office routes run the existing
sign-in check followed by `requireRoutePackage("back_office")`.

| Canonical route | Module | Status | Transitional source screen today |
|---|---|---|---|
| `/restaurant/back-office` | Launcher | foundation | — |
| `/restaurant/back-office/dashboard` | Dashboard | foundation | — (no consolidated figures) |
| `/restaurant/back-office/hr` | Human Resources | partial (shared) | `/restaurant/staff` (`human_resources`) |
| `/restaurant/back-office/payroll` | Payroll | planned | none — payroll does not exist |
| `/restaurant/back-office/inventory` | Inventory / Warehouse | partial (shared) | `/restaurant/inventory` (`inventory`) |
| `/restaurant/back-office/procurement` | Procurement | **owned (8G2B)** | legacy `/restaurant/inventory?tab=suppliers` kept |
| `/restaurant/back-office/accounting` | Accounting & Finance | foundation | `/restaurant/cashiering` (`accounting_finance`) |
| `/restaurant/back-office/reports` | Reports & Intelligence | partial (shared) | `/restaurant/reports` (`reports_analytics`) |
| `/restaurant/back-office/audit` | Audit & Compliance | foundation | none exposed to tenants |
| `/restaurant/back-office/cost-control` | Cost Control | planned | none |
| `/restaurant/back-office/master-data` | Master Data | foundation | none |

Shared-service links appear only when the person already holds the existing
module access; the link grants nothing.

### Still shared / transitional (unchanged, not redirected)

`/restaurant/inventory`, `/restaurant/inventory/purchasing/*`, `/restaurant/staff`,
`/restaurant/reports`, `/restaurant/configuration`, `/restaurant/settings`,
`/restaurant/cashiering`. Ownership, permissions and data are exactly as before.

### Future phases must migrate

HR ownership and an employee master record; payroll; central warehouse and stock
valuation; procurement ownership; a real accounting consolidation layer (no
ledger, chart of accounts, journals or AP/AR exist today); consolidated reporting;
cost-control calculations; property-level audit; master data.

## Phase 8G2A — Reports ownership

| Reporting area | Canonical route | Scope | Owner |
|---|---|---|---|
| Restaurant Management Reports | `/restaurant/restaurant-management/reports` | Restaurant-only operational reporting | Restaurant Management |
| PMS Reports | `/restaurant/pms/reports` | Hotel-only operational reporting | PMS |
| Reports & Intelligence | `/restaurant/back-office/reports` | Consolidated, cross-package, executive | Back Office |

The three are deliberately separate screens. No report formula was forked: the
Back Office page calls the existing package-owned queries
(`getRestaurantDashboard`, `getFrontOfficeDashboard`) and adds no engine of its
own. PMS occupancy/ADR/RevPAR and restaurant sales KPIs remain owned by their
packages.

### Access

`/restaurant/back-office/reports` runs the sign-in check plus
`requireRoutePackage("back_office")`. Beyond that, each source figure and each
source link requires BOTH the source package to be enabled AND the person's
existing module access (`food_and_beverage` for restaurant figures,
`front_office` for hotel figures, `reports_analytics` for report links). An
unavailable source is not queried and not displayed, and no combined total is
shown when a contributing source is missing. Back Office never widens access.

### Legacy `/restaurant/reports`

Classified **shared transitional**. It shows property-wide room revenue plus
shortcuts into F&B, inventory, workforce, finance and housekeeping, and the same
workspace component is reused by the Restaurant Management reports route. It
stays active and is a future redirect candidate only after that workspace is
split into a restaurant-only body and a Back Office consolidated body.

### Database

No migration, no view, no RLS change, no mutation change in this phase.

### Recommended future read models (not created)

- A per-day property revenue summary per source package (restaurant orders, room
  revenue, POS) to back Revenue & Sales and Executive Overview without repeating
  package queries client-side.
- A workforce hours/cost summary per day and department.
- An inventory valuation and procurement spend summary per period.
Each should be a read-only view or server read model over existing operational
tables — never a copy of transactions.

## Phase 8G2B — Back Office owns Procurement

Procurement is no longer shared/transitional: **Back Office is the owner.**

### Canonical routes

| Route | Screen |
|---|---|
| `/restaurant/back-office/procurement` | Procurement home (supplier count, open POs, awaiting delivery, partially received) |
| `/restaurant/back-office/procurement/suppliers` | Supplier register (`suppliers-tab.tsx`) |
| `/restaurant/back-office/procurement/purchase-orders` | Purchase order list + KPIs (`purchasing-tab.tsx`) |
| `/restaurant/back-office/procurement/purchase-orders/$purchaseOrderId` | Purchase order detail, mark ordered / cancel / receive goods |

All four require sign-in plus `requireRoutePackage("back_office")`, and the
underlying server functions keep their existing `procurement` module/role
checks (owner, manager, storekeeper manage; kitchen may view and receive).

### Authoritative tables

`restaurant_suppliers`, `purchase_orders`, `purchase_order_items`,
`purchase_order_history` — owned by Back Office · Procurement.

### Procurement → Inventory boundary

Procurement never writes stock balances. Receiving calls
`receive_purchase_order_goods`, which writes through the Phase 5A ledger
(`apply_inventory_movement`). `inventory_items`, `inventory_stock_movements`
and stock valuation stay owned by Inventory / Warehouse.

### Legacy surfaces retained

- `/restaurant/inventory?tab=suppliers` and `?tab=purchasing` still render the
  same components and now carry an "Open in Back Office · Procurement" link.
- `/restaurant/inventory/purchasing/$purchaseOrderId` still works and renders
  the same shared `PurchaseOrderPage` with inventory-flavoured back navigation.

No redirects were added: properties without the Back Office package must keep
reaching procurement through the legacy inventory screens.

### Enforcement decision

Procurement mutations are deliberately **not** gated on the Back Office
package. Gating them would break procurement for properties that only hold
Restaurant Management or PMS, which still use the legacy inventory tabs. Route
guards protect the canonical Back Office addresses; module/role checks protect
the data. A package check on procurement mutations is deferred to 8G2C, when
package assignment for procurement is decided.

### Database

No schema change in this phase.
