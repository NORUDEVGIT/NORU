# Phase 8I — Source organisation by package ownership

Structural only. No feature, route, database, permission or business-logic changes. Every step is a move plus import updates; behaviour must be byte-identical at runtime.

## Target shape

```text
src/
  core/            identity, membership, access, entitlements, shell, platform
  packages/
    restaurant-management/{components,lib}
    pms/{components,lib}
    standalone-pos/{components,lib}
    back-office/{components,lib}
  shared/
    components/ui, lib, hooks
  integrations/    explicit cross-package bridges
  routes/          unchanged, TanStack owns these addresses
```

Route files stay exactly where they are and keep their addresses; they only change which folder they import from. `src/integrations/supabase/*` (generated) is untouched. Server-only files keep their `.server.ts` / `.functions.ts` suffixes — those suffixes are what the framework uses to keep server code out of the browser, so they move with the file and are never renamed.

## Ownership decisions

| Area | Now | Goes to |
| --- | --- | --- |
| Property shell, sidebar, property home sections | `components/restaurant-shell.tsx`, `components/home/*`, `components/rm-context-bar.tsx` | `core/components` (one shell, never duplicated per package; package sidebar definitions stay with their registries) |
| Membership, profiles, module access, entitlements, route package guard, admin authz | `lib/restaurant.functions.ts`, `module-access*`, `package-entitlements*`, `route-package-guard.ts`, `public-package.server.ts`, `admin-authz.ts` | `core/lib` |
| Restaurant orders, menu, kitchen, tables/QR, waiter, RM till, recipes, RM analytics, RM guard/routes/registry | `lib/order*`, `menu*`, `tables`, `waiter*`, `pos.*`, `recipes*`, `dashboard/analytics`, `rm-routes.ts`, `restaurant-management-modules.ts`, `components/workspaces/restaurant/*`, `components/pos/*`, `components/menu`, `components/orders`, `kitchen-board.tsx` | `packages/restaurant-management` |
| Reservations, front office, cashiering, housekeeping, rooms, rates, night audit, guests, distribution, room charge, PMS registry/guard | matching `lib/*` files, `components/{bookings,cashiering,frontoffice,guests,housekeeping,nightaudit,rates,rooms,stay,pms}`, PMS workspaces | `packages/pms` |
| Independent till: shell, catalog, registers, shifts, sell, transactions, receipts, refunds, dashboard, reports, pricing, access helpers, registry | `lib/standalone-pos*`, `components/workspaces/standalone-pos/*` | `packages/standalone-pos` |
| Back Office home, reports, procurement, warehouse admin, HR admin, accounting, registry | `lib/back-office-*`, `components/workspaces/back-office/*` | `packages/back-office` |
| Generic UI primitives (46 files), `utils.ts`, `use-mobile`, currency/date formatting, status badges | `components/ui`, `lib/utils.ts`, `hooks` | `shared` |

## The genuinely shared workspaces

These are used by more than one package today. Classification, with no logic duplicated:

- **Workforce / staff** (`staff-workspace`, `components/workforce/*`) — CORE. Staff, roles, shifts and attendance are one property-wide record used by Restaurant Management, PMS administration and Back Office HR. Moves to `core/components/workforce`; the packages keep their thin wrappers.
- **Inventory** (`inventory*.ts`, `components/inventory/*`, suppliers, purchasing, assets) — TRANSITIONAL, planned owner Back Office. Restaurant recipes and hotel maintenance both read it and a hard Back Office boundary would break the restaurant-only and hotel-only cases. Stays at `src/lib` / `src/components/inventory` with a documented note, exactly as the existing ownership matrix already records.
- **Reports** (`reports-workspace`) — PACKAGE-OWNED WITH SHARED PRESENTATION. Body stays one component under `core/components`, each package keeps its own route and heading context.
- **Configuration / settings** (`configuration-workspace`, `settings-workspace`) — CORE. They edit property-level settings (timezone, currency, opening hours) that every package reads.

## Cross-package bridges

Moved to `src/integrations/` and each given a header stating both sides, rather than being buried in a generic folder: restaurant charge to room (RM → PMS), Back Office till summaries (BO → Standalone POS), procurement receiving → inventory movement, recipe costing → inventory. The atomic server workflows behind them are not split apart.

## Names fixed (only these)

- `components/pos/*` → `packages/restaurant-management/components/pos/*`, since these three files serve the restaurant till and the bare `pos` name is now ambiguous.
- `lib/pos.functions.ts` / `pos.server.ts` → `packages/restaurant-management/lib/rm-pos.*`.
- `pos-workspace.tsx` → `rm-pos-workspace.tsx`.

No other renames. No barrel files.

## Dependency rules to be enforced and documented

```text
routes    -> packages, core, shared
packages  -> core, shared, integrations
core      -> shared
shared    -> nothing
```

After the moves, the tree is scanned for violations: core or shared importing package code, one package importing another's internals, packages importing routes. Anything that cannot be resolved without changing behaviour is left in place and listed as transitional.

## Sequence, with a type check and build after every group

A. shared UI, hooks, utils
B. core (identity, access, entitlements, shell, workforce, configuration, reports body)
C. Restaurant Management
D. PMS
E. Standalone POS
F. Back Office
G. bridges into `integrations`, then the dependency audit

## Verification

- Type check and production build after each group, not just at the end.
- Signed-in browser pass: Property Home, and the home screen plus main workflows of each package — restaurant dashboard/orders/kitchen/menu/till; reservations, front office, cashiering, housekeeping, PMS reports; till dashboard/sell/transactions/shifts/reports; Back Office reports, procurement, inventory, HR, accounting.
- Cross-package checks: charge to room, receiving creating exactly one stock movement, Back Office till figures still matching the till's own reports, recipe costing still reading stock.
- Package-off behaviour is confirmed by reading the guards, which move unchanged; no entitlement rows are switched.
- No database work of any kind.

## Deliverables

`docs/architecture-ownership.md` updated with the new source paths and the dependency rules, plus a new `docs/code-organization.md` holding the tree, the full old → new ownership table, the bridge list and the retained transitional code. Final report covers all 35 requested points.

Anything that cannot move cleanly stays put and is written up for 8J. No dead-code sweep in this phase.
