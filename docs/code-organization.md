# Code organisation (Phase 8I)

Structural map of `src/`. This phase moved and renamed files only — no route,
database, permission, behaviour or feature changed.

## Tree

```text
src/
  routes/                     URL structure only (unchanged by 8I)
  core/                       cross-package platform foundation
    components/               restaurant shell, sidebar, context bar,
                              property home, workforce, shared workspaces
    lib/                      membership, profiles, module access, package
                              entitlements, route guards, admin authz,
                              workforce rules, public Supabase client
    state/                    cross-package React contexts
  packages/
    restaurant-management/    components/ lib/ state/
    pms/                      components/ lib/
    standalone-pos/           components/ lib/
    back-office/              components/ lib/
  shared/
    components/ui/            46 shadcn primitives
    lib/                      utils, menu formatting, property-time,
                              property-dates
    hooks/                    generic React hooks
  integrations/
    supabase/                 generated client and types
    cross-package/            deliberate bridges between packages
  lib/, components/inventory/ TRANSITIONAL — shared inventory domain
```

## Ownership moves

| Old location | New location | Owner |
| --- | --- | --- |
| `src/components/ui/*` | `src/shared/components/ui/*` | Shared |
| `src/hooks/*` | `src/shared/hooks/*` | Shared |
| `src/lib/utils.ts`, `menu.ts` | `src/shared/lib/*` | Shared |
| `src/lib/restaurant-time.ts` | `src/shared/lib/property-time.ts` | Shared |
| date helpers in `reservation-dates.ts` | `src/shared/lib/property-dates.ts` (re-exported from PMS) | Shared |
| shell, sidebar, context bar, property home | `src/core/components/*` | Core |
| membership, module access, entitlements, guards, admin authz | `src/core/lib/*` | Core |
| workforce / staff / settings / reports bodies | `src/core/components/*` | Core |
| `publicServerClient` | `src/core/lib/public-client.server.ts` | Core |
| orders, menu, kitchen, tables, QR, waiter, RM till, recipes, RM analytics | `src/packages/restaurant-management/*` | RM |
| `src/components/pos/*` | `src/packages/restaurant-management/components/rm-pos/*` | RM |
| `src/lib/pos.functions.ts`, `pos.server.ts` | `.../lib/rm-pos.functions.ts`, `rm-pos.server.ts` | RM |
| `pos-workspace.tsx` | `.../components/rm-pos-workspace.tsx` | RM |
| all PMS lib, components, workspaces | `src/packages/pms/*` | PMS |
| `standalone-pos*` lib and workspaces | `src/packages/standalone-pos/*` | Standalone POS |
| Back Office lib, HR, accounting, reports pages | `src/packages/back-office/*` | Back Office |

## Cross-package bridges (`src/integrations/cross-package/`)

| File | Bridge |
| --- | --- |
| `room-charge.functions.ts`, `room-charge.server.ts` | RM order → PMS folio |
| `back-office-pos.functions.ts` | Standalone POS figures → Back Office (read-only) |
| `charge-to-room-dialog.tsx` | UI for the RM → PMS bridge |

## Dependency rules

```text
routes    -> packages, core, shared, integrations
packages  -> core, shared, integrations
core      -> shared
shared    -> nothing
```

## Documented exceptions (audited, intentionally kept)

`src/core` still imports from packages in ten places, all aggregation points
where the alternative would change runtime behaviour:

- `restaurant-shell.tsx` reads the four package navigation registries and the
  RM settings provider — the shell is the single place where package
  navigation is composed.
- `reports-workspace.tsx` and `staff-workspace.tsx` are context-aware shared
  screens that render a package-specific tab or link.
- `workforce/schedule-tab.tsx` opens the RM table-assignment dialog.

## Retained transitional code

- Inventory, assets, purchasing, suppliers (`src/lib/*`, `src/components/inventory/*`)
  stay shared: they are consumed by RM recipes, Procurement and Back Office.
  Ownership split is Phase 8J work.
- `src/routes/restaurant/pos/new.tsx` remains an RM compatibility redirect.
