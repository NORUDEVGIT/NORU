# Phase 8F5 — Restaurant Management legacy redirects + compatibility cleanup

Make the canonical `/restaurant/restaurant-management/*` addresses authoritative, keep every old bookmark working through a redirect, and leave shared/transitional addresses exactly as they are.

## Converted to redirects (RM-owned only)

| Old address | Canonical destination |
|---|---|
| `/restaurant/dashboard` | `/restaurant/restaurant-management/dashboard` |
| `/restaurant/orders` | `/restaurant/restaurant-management/orders` (search preserved) |
| `/restaurant/orders/:orderId` | `/restaurant/restaurant-management/orders/:orderId` (param + search preserved) |
| `/restaurant/kitchen` | `/restaurant/restaurant-management/kitchen` |
| `/restaurant/menu` | `/restaurant/restaurant-management/menu` |
| `/restaurant/tables` | `/restaurant/restaurant-management/tables` |
| `/restaurant/waiter` | `/restaurant/restaurant-management/digital-ordering` |
| `/restaurant/pos/new` | `/restaurant/restaurant-management/pos-sales` |

Each of these route files becomes a small redirect-only file: keep the existing sign-in check (so a signed-out visitor still lands on the sign-in page, with the redirect target updated to the canonical address), then `throw redirect({ to: <canonical>, params, search, replace: true })`. `replace: true` avoids a back-button trap. No package check is duplicated — the destination route already enforces `restaurant_management`, and role/module access is unchanged.

The orders list redirect keeps filter/pagination search values by re-using the existing `validateSearch` and passing the parsed object through. The order detail redirect passes `orderId` plus search. Destinations never point back at an old address, so no loop is possible.

`/kitchen` and `/kitchen/login` (already redirect-only) are repointed straight at the canonical kitchen address to avoid a double hop.

## Retained, unchanged (shared / transitional)

`/restaurant/inventory` and purchasing detail, `/restaurant/staff`, `/restaurant/reports`, `/restaurant/configuration`, `/restaurant/settings`, all `/restaurant/pms/*`, all public `/r/*` and `/scan`.

Reasons recorded in the doc: inventory is cross-linked by hotel modules and procurement; staff is one shared workforce reused by PMS Administration and future Back Office HR; reports mixes restaurant and property-wide sections; configuration and settings hold Core tenant identity plus PMS content.

## Internal link cleanup

Repoint RM-owned links that still generate deprecated addresses:
- `src/components/restaurant-shell.tsx` legacy nav entries (dashboard, kitchen, orders, waiter, menu, tables).
- `src/routes/index.tsx` "Restaurant Dashboard" link.
- `src/components/workspaces/reports-workspace.tsx` dashboard link and `configuration-workspace.tsx` menu/tables links.
- `src/lib/rm-routes.ts`: with legacy addresses now redirecting, the legacy branch is dead — collapse `useRmRoutes()` to always return canonical targets and simplify the type.
- `src/routes/restaurant/orders/index.tsx` no longer passes a legacy `basePath` (file becomes a redirect).

## Dead code

Only the page bodies inside the eight converted route files are removed, and only because the shared workspace components already own those implementations. No shared component, server function or library file is deleted.

## Documentation

`docs/architecture-ownership.md` gains a Phase 8F5 section: redirected addresses with their canonical replacements, retained shared addresses with reasons, and the deferred items.

## Verification

Typecheck, production build, then an authenticated browser pass: each of the eight old addresses lands on its canonical page (checking the final URL, preserved query values and no second redirect), old order list → detail → back stays canonical, and the five retained shared addresses still load directly. Regression sweep over the launcher, canonical RM pages, PMS and a public `/r/*` page with no console errors.

## Out of scope

Shared-route ownership migration, Back Office, POS/HR/Inventory splits, folder or broad dead-code cleanup, database changes (none in this phase).
