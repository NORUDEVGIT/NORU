# Phase 7D.2A — PMS Architecture Freeze + Property Home Restructure

Presentation and module-definition only. No route moves, no redirects, no backend, permission, RLS or schema changes. The PMS Home and the 18-submodule launcher are explicitly deferred to 7D.2B.

## Final top-level domains on Property Home

| # | Tile | Status | Opens (interim) |
| --- | --- | --- | --- |
| 1 | PMS | Active | `/restaurant/rooms?tab=dashboard` (existing Front Office dashboard, until PMS Home exists) |
| 2 | Food & Beverage | Active | `/restaurant/dashboard` |
| 3 | POS | Active | `/restaurant/pos/new` |
| 4 | Inventory / Warehouse | Active | `/restaurant/inventory?tab=overview` |
| 5 | Procurement | Active | `/restaurant/inventory?tab=suppliers` |
| 6 | Human Resources | Active | `/restaurant/staff?tab=schedule` |
| 7 | Accounting & Finance | Active | `/restaurant/cashiering?tab=dashboard` |

PMS is presented as the hotel operating-system domain: a wider, visually dominant tile at the top of the grid (gold-tinted icon plate on the brown/neutral card surface, a short "Hotel operating system" line, and a muted caption listing the domains it will absorb — Front Office, Reservations, Housekeeping, Cashiering, Rooms & Rates, Distribution, Night Audit). The other six tiles keep today's tile styling in a normal grid below it.

Front Office, Housekeeping, hotel Reports, room/rate Configuration and Property Settings & Integrations no longer appear as their own top-level tiles.

### Not losing access this phase

Configuration and Property Settings & Integrations are still reachable, but as a small secondary "Property setup" link row under the tile grid (text links, not domain tiles), so nothing that works today becomes unreachable before 7D.2B moves them under PMS. Reports & Analytics moves into the same secondary row.

## Module definitions and access

- `MODULE_KEYS` gains one new key: `pms`. No key is removed — `front_office`, `housekeeping`, `configuration`, `reports_analytics`, `property_settings` all stay for sidebars, route guards and existing server checks (documented in the file as internal/PMS-submodule keys).
- `pms` is a **derived** visibility key for the tile only: the PMS tile shows when the staff member can access any of `front_office`, `housekeeping` (or the other hotel keys). No new default-role grants, no new override entries, no server enforcement change, no `staff_module_access` change.
- Tile visibility for the other six domains follows exactly today's rules.

## Summary strip

Unchanged metrics and unchanged gating (F&B value, active orders, occupancy, in-house, staff on shift, low stock).

## Sidebars

`RestaurantShell` untouched structurally. Only stale user-facing labels are corrected if found (e.g. "Inventory" → "Inventory / Warehouse" where it is the module title). All existing workspaces, nav entries and routes stay as they are.

## Technical notes

- `src/lib/module-access.ts`: add `pms` to keys/labels with a comment marking hotel keys as future PMS submodules; keep every default map intact so resolution behaviour is byte-identical for existing keys.
- `src/routes/restaurant/home.tsx`: replace the module tile array with the seven domains, add the derived PMS visibility rule, the hero PMS tile, and the secondary setup/reports link row.
- `src/components/restaurant-shell.tsx`: label-only touch-ups if needed.
- Colours only through existing NORU tokens (brown #251605, gold #C89933, green #436436, neutral #CCCCCC) — no hardcoded hex in components.
- Verify: typecheck, production build, Property Home loads with the PMS tile, and each of F&B, POS, Inventory, Procurement, HR and Accounting still opens its workspace.

## Deferred to 7D.2B

PMS Home page, the 18-submodule launcher, route migration under a PMS prefix, redirects, Platform Admin entitlements, any backend/permission/RLS work.
