# Phase 8F4 — Restaurant Management navigation & workspace cleanup

Presentation only. No database, security, entitlement or business-logic changes. Legacy addresses keep their current look and keep working.

## What changes for the user

Inside `/restaurant/restaurant-management/*`, every page will feel like one package:

- A dedicated Restaurant Management sidebar with the same four groups as the launcher.
- The header always reads `Restaurant Management · [Submodule]`.
- Breadcrumb always reads Property Home → Restaurant Management → [Submodule] (→ Order on order detail).
- Visible page titles use the package names (POS & Sales, Order Management & Distribution, Inventory & Stock Management, etc.).
- Stale old-architecture wording removed on these pages only ("Food & Beverage" as parent, "NORU Home", "Human Resources", bare "Inventory"/"Configuration").

## Work items

### 1. RM sidebar (src/components/restaurant-shell.tsx)

When `rmModule` is set, render a grouped RM navigation built from `RM_GROUPS` + `RM_MODULES`, filtered by the existing module-access result (same `getMyModuleAccess` query already used for the PMS sidebar — its `enabled` condition extends to RM pages). Structure:

```text
NORU logo
← Property Home
  Restaurant Management Home
RESTAURANT OPERATIONS   Dashboard · POS & Sales · Digital Ordering ·
                        Table & Floor Management · Order Management &
                        Distribution · Kitchen & Department Order Display
MENU, COST & STOCK      Menu & Product Management · Recipe & Cost Management ·
                        Inventory & Stock Management
PEOPLE & CONTROL        Staff & Workforce Management · Payments & Cashiering ·
                        Reports & Analytics
SYSTEM MANAGEMENT       Restaurant Setup & Administration
Settings · Log out
```

Group headings keep the existing compact sidebar styling; the active submodule is highlighted. The legacy `MODULE_NAV` list is hidden on RM pages (as it already is for PMS). No PMS, hotel or Back Office entries appear.

### 2. Header and breadcrumb

Already driven by `rmModule`; extend coverage so every canonical page sets it. Order detail keeps `rmDetailLabel="Order"`.

### 3. Full-screen canonical pages

`pos-sales`, `payments` and `kitchen` currently render their workspace without the shell, so they show no RM context. Add a slim RM context bar to those three canonical pages only (breadcrumb-style: Property Home / Restaurant Management / submodule name + back link), keeping the operating surface full-screen. Legacy `/restaurant/pos/new` and `/restaurant/kitchen` are untouched.

### 4. Context-aware titles in shared workspaces

Reuse the existing heading-context mechanism (`PageHeading` + provider) so a workspace rendered under an RM route shows the RM title, and the legacy address keeps its current title. Affected: staff ("Human Resources" → "Staff & Workforce Management"), reports, configuration/setup, inventory ("Inventory" → "Inventory & Stock Management"), orders, menu, dashboard, tables, digital ordering. One implementation, no copied workspaces.

### 5. Ownership wording on canonical pages

- POS & Sales: restaurant till selling from the restaurant menu; never "Standalone POS".
- Inventory & Stock Management: restaurant operational stock; not the central warehouse.
- Staff & Workforce Management: restaurant team, roster and attendance; no HR/payroll wording.
- Payments & Cashiering: restaurant payments, till shifts, settlement; hotel folios only via the labelled "Charge to Room — PMS integration" bridge.
- Reports & Analytics: restaurant reporting only.
- Restaurant Setup & Administration: restaurant setup only (menu, tables/QR, operating configuration).

Wording is edited where these screens are shown in the RM context; permission keys, module keys and `RM_MODULES` metadata are unchanged.

### 6. Out of scope

Legacy redirects, route deletion, folder cleanup, POS/HR/Inventory splits, Back Office, database/dead-code cleanup — all deferred to 8F5+.

## Technical notes

- Files expected to change: `src/components/restaurant-shell.tsx` (RM sidebar block, heading context), the 14 canonical route files under `src/routes/restaurant/restaurant-management/`, a small shared RM context-bar component, and the shared workspaces that hardcode a heading (`staff-workspace`, `reports-workspace`, `configuration-workspace`, `restaurant/inventory-workspace`, `restaurant/kitchen-workspace`).
- No changes to `requireRoutePackage`, `getMyModuleAccess`, RLS, RPCs or any `*.server.ts` / `*.functions.ts` file.
- Verification: `bunx tsgo --noEmit`, `bun run build`, and an authenticated Playwright pass over all 14 canonical routes plus the legacy addresses, checking sidebar, grouping, title, breadcrumb, both home links, no PMS/Back Office entries, and no console errors. Any temporary entitlement rows used for guard checks are removed afterwards.
- Report: the 20 requested points.
