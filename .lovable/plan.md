# Phase 8D1 — Authenticated package route guards

Direct-URL gating for signed-in staff pages only. No changes to business logic, server mutations, RPCs, RLS, public ordering or public booking pages.

## What changes for a user

If a package is switched off (or its date has passed) for a property, typing the address of one of its pages no longer opens it. The person lands back on Property Home with a short line: "This package isn't enabled for this property." Everything a package includes stays exactly as it is when the package is on, and properties that were never configured keep working as before.

## Central guard

One helper, `requireRoutePackage(packageKey, path)`, used from each guarded page's existing `beforeLoad` right after the current sign-in check:

- New server function `getMyRoutePackageAccess({ packageKey })` in `src/lib/package-entitlements.functions.ts`: authenticated middleware, re-derives the caller's own property membership server-side (same pattern as `getMyPackageEntitlements`), calls the existing resolver, returns `{ allowed: boolean }`. No property id is trusted from the browser, so one tenant's state can never affect another's.
- New client helper `src/lib/route-package-guard.ts`: calls that server function, caches the four results per session for 30 seconds to avoid a round trip on every navigation, and throws `redirect({ to: "/restaurant/home", search: { blocked: packageKey } })` when not allowed. On any error it allows through (compatibility stance — never lock a working tenant out because of a transient failure). No page duplicates entitlement or expiry logic.
- Expiry, explicit-disable and the no-row compatibility default all come from the existing resolver untouched.

## Pages guarded with `pms`

Canonical: `/restaurant/pms` and all 18 submodule routes under `src/routes/restaurant/pms/` (dashboard, property-setup, reservations incl. `$reservationId` and guest detail, front-office, cashiering, housekeeping, room-inventory, rates-revenue, night-audit, guest-services, sales-events, distribution, reports, administration, integrations, maintenance, notifications, security-audit).

Legacy PMS implementation routes (kept, only guarded): `bookings/*` (index, new, `$reservationId`, rates, reservations, distribution), `rooms/*` (index, arrivals, in-house, departures), `guests/*`, `housekeeping/*`, `cashiering/*` (index, folios/`$folioId`, night-audit index and `$runId`).

## Pages guarded with `restaurant_management`

`/restaurant/dashboard`, `/restaurant/orders`, `/restaurant/orders/$orderId`, `/restaurant/kitchen`, `/restaurant/menu`, `/restaurant/tables`, `/restaurant/waiter`, `/restaurant/pos/new`.

POS compatibility decision: today's POS is the restaurant POS, so it requires `restaurant_management`, not the standalone `pos` package. The standalone package gets its own routes after the POS split.

## Left unguarded on purpose (documented for later)

- `back_office`: no page is guarded in this phase. Inventory, Procurement, Human Resources, Reports and Configuration are still shared by Restaurant Management and PMS in practice; gating them now would break working properties. Ownership cleanup first, gating later.
- Core, never gated: `/restaurant/home`, `/restaurant/login`, `/restaurant/register`, `/restaurant/settings`, `/restaurant/staff`, `/restaurant/reports`, `/restaurant/configuration`, all `/admin/*`, account and public pages.

## Package vs. person

The package check runs before the existing role/module check and can only take access away, never grant it. A receptionist without Cashiering stays blocked even with PMS on.

## Property Home notice

`src/routes/restaurant/home.tsx` gains a `validateSearch` for an optional `blocked` value and shows a dismissible banner. Property Home itself is never gated, so no redirect loop is possible; legacy pages are guarded in place (no legacy → canonical → legacy bounce).

## Verification

Typecheck, production build, and a browser pass on a test property: compatibility default (all pages work), PMS off (canonical + a legacy PMS page blocked, Property Home fine), Restaurant Management off (dashboard, orders, kitchen, POS blocked, PMS still usable), expired PMS behaves like disabled, role denial unchanged, and no redirect loops. Test entitlement rows are removed afterwards so no property data is left changed.
