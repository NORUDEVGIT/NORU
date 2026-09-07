# Phase 8F3 — Restaurant Management detail flows + internal link canonicalization

Goal: when someone enters Restaurant Management through `/restaurant/restaurant-management/*`, every link they follow keeps them inside that package context. Old addresses keep working. No database, security or business-logic changes.

## What the audit already shows

Confirmed by reading the code:

- **Order detail is the only route-based detail flow owned by Restaurant Management.** It lives at `/restaurant/orders/$orderId` and is written inline in that route file (page body + billing/Charge-to-Room section).
- **Links that currently leave the package context** come from the shared screens now used by both old and new addresses:
  - `dashboard-workspace.tsx` — order links (`/restaurant/orders/$orderId`), Kitchen, Menu, Tables, Staff, Settings quick actions.
  - `orders-workspace.tsx` — "View" / "View Order" links to `/restaurant/orders/$orderId`.
  - `kitchen-workspace.tsx` — "Back to dashboard" / "Dashboard" links to `/restaurant/dashboard`.
  - `pos-workspace.tsx` — links to `/restaurant/home` (Property Home; correct either way).
- **Purchasing detail** (`/restaurant/inventory/purchasing/$purchaseOrderId`, linked from `purchasing-tab.tsx`) is Procurement — shared/transitional, class C, stays where it is.
- **Menu, Recipe & Cost, Tables/QR** are modal-based inside their workspaces, so there is no detail URL to canonicalize; no new routes will be invented for them.
- **Staff** stays shared/temporary; **Setup** keeps only restaurant-specific links.

## Classification

- **A — canonicalize now:** order detail; dashboard/orders/kitchen/reports internal links when rendered from a canonical page.
- **B — keep legacy for now:** `/restaurant/orders/$orderId` itself (still reachable, unchanged), settings/configuration detail screens.
- **C — do not own yet:** purchasing/supplier detail, staff detail/edit, inventory item history beyond the current workspace, anything PMS.

## What will be built

1. **Small route-context helper** (`src/lib/rm-routes.ts`): a React context plus `useRmRoutes()` returning the right paths for the current context — canonical (`/restaurant/restaurant-management/...`) when a canonical route renders the screen, legacy otherwise. Provider set once in the canonical route wrappers. No routing framework, just a lookup.
2. **Shared order-detail screen**: move the existing order-detail body out of `src/routes/restaurant/orders/$orderId.tsx` into `src/components/workspaces/restaurant/order-detail-workspace.tsx` unchanged (same queries, same realtime, same Charge-to-Room dialogs). Both routes render it — one copy of the logic.
3. **New canonical route** `/restaurant/restaurant-management/orders/$orderId`: sign-in check, then the existing `requireRoutePackage("restaurant_management")` guard, `RestaurantShell` with `rmModule="orders"`, breadcrumb Property Home → Restaurant Management → Orders → Order, "Back to Orders" returning to the canonical orders list with its filters.
4. **Context-aware links** in the shared workspaces (dashboard, orders, kitchen, and any reports drill-down found during the pass): order links, kitchen/menu/tables links and back links resolve through the helper, so the legacy pages keep their legacy targets byte-for-byte and canonical pages stay canonical.
5. **Documentation**: record in `docs/architecture-ownership.md` which legacy detail routes are candidates for redirect in 8F5 and which stay shared.

## Explicitly not done

No new recipe/menu/table/POS/payments detail routes (nothing route-based exists to reuse). No procurement or staff canonicalization. No legacy route deleted or converted to a redirect. No schema, RLS, entitlement, pricing, kitchen, ledger, QR or Charge-to-Room changes. No sidebar restructure.

## Verification

Typecheck, production build, and an authenticated browser pass: orders list → detail → back (canonical and legacy), dashboard order link, kitchen back link, POS, recipe/cost, inventory including the purchasing detail, staff, reports, setup — checking breadcrumbs, no PMS navigation, no loops, no console errors, and that the package-off guard still blocks the new detail route.

Ends with the 21-point implementation report.
