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
| Restaurant orders, menu, tables/QR, kitchen, restaurant till | RM | RM | restaurant_management (8E1) | unchanged; Standalone POS is a separate package with its own tables and routes | Guarded | Low | — |
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
| `/restaurant/back-office/hr` | Human Resources | **partial, canonical admin home (8G2D)** | `/restaurant/staff` and `/restaurant/restaurant-management/staff` still operational |
| `/restaurant/back-office/payroll` | Payroll | planned | none — payroll does not exist |
| `/restaurant/back-office/inventory` | Inventory / Warehouse | **partial, canonical central layer (8G2C)** | `/restaurant/inventory` and `/restaurant/restaurant-management/inventory` still operational |
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

## Phase 8G2C — Inventory / Warehouse boundary

### Split of ownership

| Capability | Owner | Address |
|---|---|---|
| Item master (create, edit, activate) | Back Office (canonical) — also reachable in RM | `/restaurant/back-office/inventory/items` |
| Property-wide movement history | Back Office (canonical) | `/restaurant/back-office/inventory/movements` |
| Units reference (read-only) | Back Office (canonical) | `/restaurant/back-office/inventory/units` |
| Operational stock view, per-item workflow, adjustments in service | Restaurant Management | `/restaurant/restaurant-management/inventory` |
| Operating assets and equipment | Restaurant Management | same screen, asset tabs |
| Recipe ingredient mapping and recipe cost | Restaurant Management (never moves) | Recipes & Cost |
| Suppliers, purchase orders, goods receiving | Back Office · Procurement | `/restaurant/back-office/procurement` |

### Authoritative storage (single copy, single ledger)

`inventory_units`, `inventory_items`, `inventory_stock_movements`. Every
posting path — manual movement, stocktake correction and procurement receiving
— goes through `apply_inventory_movement`. Back Office screens call the same
`createInventoryMovement` server function as Restaurant Management; no second
posting path exists and nothing is copied between packages.

### Server write authorization

`requireInventoryWrite` in `inventory.functions.ts` runs the existing
membership, role and `inventory` module check first, then
`requireInventoryWritePackage` (`inventory-package.server.ts`): the property
must hold **restaurant_management OR back_office**. The package is resolved
server-side from the property's entitlements through the shared fail-closed
resolver; the browser never supplies a package name, so no caller can widen
its own access. Reads stay shared/transitional so PMS cross-links keep working.

### Route access

`/restaurant/back-office/inventory/*` requires the Back Office package (route
guard) **and** existing Inventory module access (checked in the page). Back
Office entitlement alone grants nothing.
`/restaurant/restaurant-management/inventory` is unchanged: Restaurant
Management package plus Inventory access.

### Transitional `/restaurant/inventory`

Left working and not redirected. It still serves properties without Back
Office and carries the operational restaurant view plus the compatibility
procurement tabs. A future phase may split it once Back Office owns the
central warehouse outright.

### Not built (future scope, not invented anywhere in the UI)

Stock valuation method and period closing stock; storage locations, a central
warehouse and issues to operating packages; inter-outlet transfers; automatic
recipe consumption. The Back Office home shows quantity × last known unit cost
and labels it explicitly as not a valuation.

### Database

No schema change in this phase.


## Phase 8G2D — Human Resources boundary

### Ownership split

| Layer | Owns |
| --- | --- |
| Core | Sign-in identity, `profiles`, property membership (`restaurant_users`), account activation, module-access infrastructure (`staff_module_access`), package entitlement identity |
| Back Office HR | Workforce administration: the workforce directory, shift administration, attendance administration, and the future payroll relationship |
| Restaurant Management | Operational restaurant staffing: waiter/kitchen usage, `staff_table_assignments`, restaurant role usage |
| PMS | Operational hotel staffing: housekeeping task assignment, front-office user context, maintenance assignment |

### Authoritative tables (one set, never duplicated)

`profiles`, `restaurants`, `restaurant_users`, `staff_module_access`,
`staff_shifts`, `staff_attendance`, `staff_table_assignments`,
`restaurant_staff_audit_log`. No employee master, no HR-specific person,
shift or attendance copy exists, and none may be created.

### Role vs employment

The role on a membership (`owner`, `manager`, `waiter`, `kitchen`,
`housekeeping`, …) is authorization, owned by Core. Employment attributes
(department, job title, contract, payroll) do not exist yet and must not be
made to control permissions when they arrive.

### Route access

`/restaurant/back-office/hr`, `/hr/staff`, `/hr/shifts` and `/hr/attendance`
require the Back Office package (route guard) **and** existing Human Resources
module access (checked in the page; the server functions re-check
independently). Back Office entitlement alone grants nothing.
`/restaurant/restaurant-management/staff` is unchanged: Restaurant Management
package plus existing staff access. PMS staff usage is governed by PMS plus
existing module access. No workforce mutation gained a package argument from
the browser.

### Cross-package links

Operational staffing screens (Restaurant Management Staff, PMS
Administration) show "Open in Back Office · Human Resources" only when Back
Office is enabled for the property and the person already holds Human
Resources access. Presentation only.

### Transitional `/restaurant/staff`

Left working and not redirected. It renders the same shared workforce
workspace with neutral property wording, and still serves properties without
Back Office. Remaining callers: the legacy sidebar workforce links, the
reports workspace link, the Property Home tile and the PMS shared-module
link. Once those point at package-canonical addresses it can become
redirect-only; not done in this phase.

### Not built (not invented anywhere in the UI)

Payroll (no salary engine, payslips, tax, deductions, benefits or journals);
structured departments and job titles; leave, performance and training. A
structured department/job data model is recorded here as a future data-model
requirement.

### Database

No schema change in this phase.

---

## Phase 8G2E — Accounting & Finance

Back Office is the canonical home for finance ADMINISTRATION and the future
accounting engine. It owns no financial transaction and posts nothing.

### Financial ownership

- **PMS** — guest folios, room charges, hotel payments, deposits, refunds,
  cashier shifts, night-audit financial operations. Unchanged.
- **Restaurant Management** — restaurant orders, restaurant payments, till
  shifts, refunds/voids where supported, and the Charge to Room bridge into
  PMS folios. Unchanged; the bridge is not re-routed through Back Office.
- **Procurement** — purchase orders, receiving, purchasing history, supplier
  spend source data.
- **Inventory / Warehouse** — stock quantities and last-known cost inputs;
  the future valuation source.
- **Standalone POS** — independent sales and payments, live since 8H5; a
  read-only source for Back Office since 8H8.
- **Back Office Accounting & Finance** — cross-package finance overview,
  financial control, source monitoring, and the future GL / journals / CoA /
  AP / AR / bank reconciliation / tax accounting / financial statements.

### What the canonical page does

`/restaurant/back-office/accounting` is read-only. One server function,
`getBackOfficeFinanceOverview` (`src/lib/back-office-finance.functions.ts`),
returns high-level, source-labelled figures: restaurant order value and order
count for today; open folios, outstanding balance on open folios, folio
payments and charges today, open cashier shifts; open purchase-order count,
open purchase-order value and supplier count; stock at last-known cost and the
count of items without a cost. No transaction detail crosses the boundary and
values from different sources are never summed — there is no consolidated
revenue, profit or net position, because there is no ledger.

### Authorization

`requireBackOfficeFinanceRead` (`back-office-finance.server.ts`) requires
existing Accounting & Finance module access with role owner / manager /
accountant, and then the Back Office package. The package alone grants
nothing. Each source is checked before it is queried: Restaurant Management
and PMS need their package switched on plus the reader's matching module
access; Procurement and Inventory need the reader's existing module access. A
source that fails any check is reported as unavailable and is never queried.
Cross-package links appear only under the same conditions, so no link can
escalate access.

### Legacy / shared accounting route decision

`/restaurant/cashiering` stays exactly as it is: PMS-owned, live operational
hotel billing, no redirect, no ownership change. It is linked from PMS
Cashiering, PMS Night Audit, PMS Home and Property Home, and it is gated by
the `accounting_finance` module plus the PMS package. Back Office links to it
as a source, nothing more.

### Not built (architecture gaps)

General ledger, chart of accounts, journals, accounts payable, accounts
receivable, bank reconciliation, tax accounting, and financial statements
(P&L, balance sheet, cash flow, trial balance). Purchase orders are
commitments, not payables; open folio balances are guest billing, not a debtor
ledger; stock at last-known cost is not an audited valuation or cost of goods
sold; card payment status is not bank settlement. Each is shown on the page as
"not built yet" with what it would require.

### Database

No schema change in this phase, and no accounting mutation was introduced.

## POS architecture freeze

There is exactly one till in NORU and it belongs to **Restaurant Management**.

| Surface | Address | State |
| --- | --- | --- |
| Till (POS & Sales) | `/restaurant/restaurant-management/pos-sales` | Live |
| Legacy till address | `/restaurant/pos/new` | Redirect only |
| Payments & Cashiering | `/restaurant/restaurant-management/payments` | Foundation page (no till, no mutations) |
| Hotel billing | PMS Cashiering | Separate, untouched |

Frozen decisions:

1. POS & Sales is owned by Restaurant Management. The restaurant till is gated
   by the `restaurant_management` package plus the `pos` module permission
   (owner, manager, cashier, waiter). The `pos` **package** key belongs to the
   separate Standalone POS package, which is enforced on every
   `/restaurant/pos/*` route and server function (8H2 onwards).
2. The till is not a second ordering engine: `placePosSale` reuses
   `order-core.server.ts` / `order-pricing.server.ts` with server-side pricing,
   tagged `pos_counter` and bound to an open `cashier_shifts` row.
3. Settlement runs only through `record_pos_order_payment` (SECURITY DEFINER,
   service-role execute only). Charge to Room is the sole bridge to PMS folios
   and requires both `restaurant_management` and `pms`.
4. `/restaurant/cashiering` and PMS Cashiering are untouched by this freeze.

Known gaps, recorded rather than faked: tax/VAT and service charge (order
totals are price × quantity), discounts/comps/tips, refunds and post-payment
voids, persisted parked sales, receipt templates and reprint, end-of-day
cash-up reporting.

## Standalone POS architecture freeze (Phase 8H1B)

The Standalone POS domain is frozen on paper in
[`docs/standalone-pos-architecture.md`](./standalone-pos-architecture.md).
Nothing was built: no tables, routes, policies, navigation or runtime changes.

Ownership added by that freeze:

| Domain | Owner | Tables / surfaces |
| --- | --- | --- |
| Restaurant menu and ordering | Restaurant Management | `menu_categories`, `menu_items`, `orders`, `order_items`, `order_payments`, `cashier_shifts` |
| Standalone till (proposed, not created) | Standalone POS | `pos_registers`, `pos_categories`, `pos_products`, `pos_cashier_shifts`, `pos_sales`, `pos_sale_items`, `pos_payments`, `pos_refunds` |
| Hotel billing | PMS | folios, folio transactions, night audit |
| Cross-package consolidation | Back Office | read-only over the owners above; owns no POS rows |

Key frozen decisions:

1. The Restaurant Management till keeps `/restaurant/restaurant-management/pos-sales`
   and every table it uses. Standalone POS never writes to RM tables.
2. Standalone POS is entitled by the `pos` package alone and must work with
   Restaurant Management, PMS and Back Office all switched off. Both tills may
   coexist.
3. Canonical route family frozen at `/restaurant/pos` plus `dashboard`, `sell`,
   `catalog`, `transactions`, `shifts`, `reports`, `settings`. The namespace is
   safe to reclaim: it holds only the `new.tsx` redirect today, which stays.
4. Module key `pos` continues to mean the restaurant till. A new
   `standalone_pos` key will gate the standalone product (owner, manager,
   cashier), so entitlement alone never grants till access.
5. Sales are immutable once completed; corrections are voids (open sales only)
   or linked refund records (completed sales). Sale lines carry full snapshots.
6. Currency and business date come from the property (`restaurants.currency_code`,
   `restaurants.timezone`), never from the browser.
7. Charge to Room and inventory posting are optional future bridges, not part
   of Standalone POS v1, and the existing RM Charge to Room bridge is untouched.

## Standalone POS — data ownership (Phase 8H2)

| Data | Owner | Notes |
| --- | --- | --- |
| `pos_registers`, `pos_categories`, `pos_products`, `pos_settings` | Standalone POS | Own catalog; never reads restaurant menu tables. |
| `pos_cashier_shifts`, `pos_sales`, `pos_sale_items`, `pos_payments`, `pos_refunds`, `pos_sale_counters` | Standalone POS | Own transaction record and receipt numbering. |
| `menu_items`, `orders`, `order_items`, `order_payments`, `cashier_shifts` | Restaurant Management | Unchanged; the RM till keeps writing these. Standalone POS never writes them. |
| Module key `pos` | Restaurant Management | The restaurant till. |
| Module key `standalone_pos` | Standalone POS | New in 8H2; package `pos` gates it. |

Standalone POS reads nothing from PMS or Back Office. Charge to Room,
inventory depletion and Back Office finance reads remain optional future
bridges, not built.

## Phase 8H3 — Standalone POS shell / catalog / settings

Standalone POS owns its shell (`/restaurant/pos/*`), its catalog
(`pos_categories`, `pos_products`) and its settings (`pos_settings`). It reads
no Restaurant Management menu data and has no menu fallback. The Restaurant
Management till remains at `/restaurant/restaurant-management/pos-sales` with
its own menu, orders, order payments and restaurant cashier shifts —
unchanged. Access = `pos` package entitlement + `standalone_pos` module +
role (owner/manager for setup; cashier/accountant read-only).

### Standalone POS — tills and cashier shifts (Phase 8H4)

Standalone POS owns `pos_registers` and `pos_cashier_shifts` outright. These
are distinct from Restaurant Management's `cashier_shifts` and from PMS
cashiering; no data, screen or guard is shared between them. Restaurant
Management's till at `/restaurant/restaurant-management/pos-sales` is
unchanged.

### Standalone POS — Sell (Phase 8H5)

Standalone POS owns selling end to end at `/restaurant/pos/sell`: its own
catalog, sales, sale items, payments, receipt numbering and cashier shifts
(`pos_*` tables only). It never writes `orders`, `order_items`,
`order_payments` or Restaurant Management `cashier_shifts`, and does not touch
PMS cashiering or Back Office finance.

### Standalone POS — Transactions, receipts, refunds (Phase 8H6)

Standalone POS owns its post-sale lifecycle outright:

- transaction history (`/restaurant/pos/transactions`, reading `pos_sales`
  only — never Restaurant Management orders or PMS folios);
- receipt presentation and reprint (rendered from `pos_sales`,
  `pos_sale_items`, `pos_payments`; presentation-only, no reprint audit);
- refund records and corrections (`pos_refunds` via
  `pos_refund_sale_allocated`, allocated to a specific original tender,
  capped per tender and per sale, cash impact on the processing shift).

Unchanged by this phase: RM till, orders, order payments, RM receipts, Charge
to Room, PMS cashiering and folios, Back Office accounting and reports.

## Standalone POS — operational reporting (Phase 8H7)

Standalone POS owns its own dashboard and reports, computed only from its own
tables (`pos_*`). No other package supplies or receives figures here. Back
Office finance aggregation of POS was out of scope in 8H7; it is delivered
read-only in 8H8 (below).

## Standalone POS — cross-package integration (Phase 8H8)

Standalone POS remains the sole author of its records. Phase 8H8 adds a
**read-only** consumption path only:

| Surface | Direction | Notes |
| --- | --- | --- |
| Back Office Accounting & Finance → POS source card | Back Office reads POS | `getBackOfficePosSummary` in `src/lib/back-office-pos.functions.ts`, computed on demand from `pos_*` tables via the same server aggregation the POS reports use. |
| Back Office Reports & Intelligence → POS figures + source card | Back Office reads POS | Same server function; figures are labelled "From Standalone POS". |

Rules frozen by this phase:

1. No POS transaction data is copied, mirrored or summarised into Back Office
   tables. No database change was made in 8H8.
2. Back Office figures must reconcile exactly with `/restaurant/pos/reports`
   for the same business date, because both derive from the same POS-owned
   aggregation.
3. POS figures are never added to Restaurant Management or PMS figures. No
   consolidated property revenue total exists; there is still no general ledger.
4. Visibility requires the `pos` package enabled **and** `back_office` access
   **and** the reader's existing module access (finance or reports). The POS
   deep link additionally requires the reader's own Standalone POS access.
5. When the `pos` package is off, POS is shown as unavailable with a neutral
   message and no figures are fetched.

### Bridges audited and deferred

| Bridge | Status | Reason |
| --- | --- | --- |
| POS sale → Inventory stock depletion | Deferred | Requires a POS product ↔ inventory item mapping and a recipe/component model for POS products, neither of which exists. Introducing partial depletion would silently corrupt stock. |
| POS sale → PMS Charge to Room (folio posting) | Deferred | Requires guest/room lookup, folio selection, package-cross authorisation and a reversal path inside POS. The existing RM Charge to Room bridge is untouched and remains RM-only. |


## Phase 8H9 — two tills, confirmed ownership

Audited, no behaviour changed.

| Concern | Owner |
| --- | --- |
| `/restaurant/restaurant-management/pos-sales` | Restaurant Management |
| Restaurant menu, orders, order payments, `cashier_shifts`, charge to room | Restaurant Management |
| `src/lib/pos.functions.ts`, `src/lib/pos.server.ts`, `src/components/pos/*` | Restaurant Management (names are misleading; rename deferred) |
| `/restaurant/pos` and its ten canonical screens | Standalone POS |
| `pos_*` tables, `POS-000001` receipt counter, POS pricing and reporting | Standalone POS |
| `src/lib/standalone-pos*.ts`, `src/components/workspaces/standalone-pos/*` | Standalone POS |
| `getBackOfficePosSummary` | Back Office (read-only consumer) |

Key naming, deliberately kept distinct:

| Key | Meaning |
| --- | --- |
| package `pos` | the Standalone POS commercial package |
| module `pos` | access to the restaurant till inside Restaurant Management |
| module `standalone_pos` | access to the Standalone POS package |

`/restaurant/pos/new` remains a compatibility redirect to the restaurant till
(its historical meaning) and is not part of the Standalone POS route family.

Deferred to a later rename-only phase: `pos.functions.ts` / `pos.server.ts` →
`rm-pos.*`, and moving `src/components/pos/*` under a restaurant-owned folder.


## Phase 8I — source organisation by package ownership

Structural only: files moved/renamed, behaviour unchanged. Full map, move
table, bridge list and dependency rules live in `docs/code-organization.md`.

| Area | Source path |
| --- | --- |
| Platform foundation (shell, navigation, membership, module access, package entitlements, guards, workforce, settings) | `src/core/` |
| Restaurant Management | `src/packages/restaurant-management/` |
| PMS | `src/packages/pms/` |
| Standalone POS | `src/packages/standalone-pos/` |
| Back Office | `src/packages/back-office/` |
| UI primitives, hooks, neutral helpers | `src/shared/` |
| Cross-package bridges (charge to room, POS → Back Office) | `src/integrations/cross-package/` |
| Inventory / assets / purchasing (transitional, shared) | `src/lib/`, `src/components/inventory/` |

Dependency rules: `routes -> packages/core/shared/integrations`,
`packages -> core/shared/integrations`, `core -> shared`, `shared -> nothing`.
Ten audited exceptions in `src/core` (shell navigation aggregation and two
context-aware shared workspaces) are listed in `docs/code-organization.md`.

Renames: `pos.functions.ts`/`pos.server.ts` -> `rm-pos.*`,
`components/pos/*` -> `packages/restaurant-management/components/rm-pos/*`,
`restaurant-time.ts` -> `shared/lib/property-time.ts`. The deferred renames
noted in Phase 8H9 are now done.

## Phase 8J — verified cleanup record

Audit-first cleanup. Live schema before cleanup: 70 tables, 49 functions,
47 triggers, 156 policies, 227 indexes, 2 storage buckets.

Removed (proven dead):

| Object | Proof |
| --- | --- |
| `src/packages/restaurant-management/components/status-tracker.tsx` | zero imports; its only historical consumer `/status` is now a legacy redirect |
| `public.is_active_staff()` | no source refs, no policy refs, no trigger, not called by any other function (migration `0033`) |

Pending manual removal (blocked by the additive-migration guard, safe to run
in the SQL editor): `DROP TABLE public.staff_users;` — pre-multi-tenant kitchen
login table, 1 superseded row, no inbound FKs, no triggers, no source refs; its
only reader was `is_active_staff`, already dropped. Its own self-select policy
goes with it.

Kept deliberately:

- Security helper functions with zero React call sites (`has_restaurant_role`,
  `has_any_restaurant_role`, `has_kitchen_access`, `is_restaurant_member`,
  `is_platform_admin`, `can_manage_restaurant_storage`, `assert_room_assignable`)
  — all reachable from RLS policies or other functions.
- All Standalone POS, entitlement and distribution tables with zero rows — new
  and active, row count is not evidence of death.
- Inventory, procurement, workforce and `/restaurant/reports` shared paths —
  still genuinely shared; ownership stays as documented.
- All compatibility redirects, including `/restaurant/pos/new`.
- Unused shadcn UI primitives under `src/shared/components/ui` — template
  library surface, not migration debt.
- `src/packages/back-office/components/procurement-home.tsx` — a complete but
  unwired Back Office procurement landing page from 8G2B; the route renders the
  foundation page instead. Classified NEEDS MANUAL DECISION: wiring or deleting
  it would change behaviour, which is out of scope for 8J.

Storage: both buckets (`menu-images`, `property-images`) are referenced and
policy-protected — no storage cleanup performed.

Secrets: no hardcoded project URLs, service-role keys or secret keys in source;
only publishable-key prefix checks in the generated client files.
